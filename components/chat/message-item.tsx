import React, { memo, useState } from 'react';
import type { Message } from 'ai/react';
import TextareaAutosize from 'react-textarea-autosize';
import { RefreshCcw, Paperclip, Pencil, Copy, Check, ChevronDown, ChevronUp, BrainCircuit } from 'lucide-react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { ErrorBoundary } from '@/components/error-boundary';
import { BranchSwitcher } from '@/components/branch-switcher';
import { MessageStatusBadge } from '@/components/message-status-badge';
import { ChibiAvatar } from '@/components/chat/chibi-avatar';
import { sanitizeContent, getFinishInfo } from '@/lib/chat-tree-persistence';
import { stripEmulatedToolMarkup } from '@/lib/text-tool-guard';
import { ToolTrace, buildToolTrace, displayText, type TimelineSegment } from '@/components/chat/tool-trace';
import { MessageUsage } from '@/components/chat/message-usage';
import { OrchestratorBadge, getOrchestratorAdoptedAnnotation } from '@/components/chat/orchestrator-badge';
import { EvidenceBadge } from '@/components/evidence-badge';

function ThinkingBlock({ reasoning, isStreaming }: { reasoning: string; isStreaming: boolean }) {
  const [open, setOpen] = useState(false);
  const lines = reasoning.trim().split('\n').filter(Boolean);
  const preview = lines[lines.length - 1] || 'thinking...';

  return (
    /*
     * Suy luận là CHROME, không phải nội dung: nó thuộc về quá trình, không
     * thuộc về câu trả lời. Vì vậy nó là một thẻ bo tròn TÔ MÀU NHẠT
     * (`reasoning/10`) với sườn trái 3px — KHÔNG phải khối `bg-reasoning` đặc,
     * vì khối đặc nặng bằng cả câu trả lời đứng cạnh nó.
     */
    <div className="my-4 rounded-xl rounded-l-md border border-reasoning/30 bg-reasoning/10 p-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 text-left transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2">
          <BrainCircuit size={15} className="flex-shrink-0 text-reasoning animate-pulse" />
          <span className="text-ui font-medium text-secondary">Quá trình suy luận (Reasoning)</span>
          {isStreaming && <span className="terminal-cursor not-italic" aria-hidden="true" />}
          {!open && <span className="truncate font-mono text-meta text-tertiary italic">· {preview}</span>}
        </span>
        <span className="flex items-center gap-1 text-meta text-tertiary flex-shrink-0">
          <span>{open ? 'Thu gọn' : 'Chi tiết'}</span>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>
      {open && (
        <div className="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap border-t border-reasoning/20 pt-3 font-mono text-meta leading-relaxed text-tertiary">
          {reasoning}
        </div>
      )}
    </div>
  );
}

export interface BranchInfo {
  currentIndex: number;
  total: number;
}

/**
 * Nội dung bong bóng của lượt trả lời, và có vẽ ô tròn rỗng hay không.
 *
 * Tách ra khỏi thân component để TEST ĐƯỢC HÀNH VI thật, không chỉ đọc source:
 * cả câu "dọn bằng `displayText`" lẫn điều kiện `showBubble` đều là loại quyết
 * định mà người đọc source nhìn thấy hợp lý, nên đổi thành hỏng mà test kiểu
 * regex vẫn xanh — đúng cái lỗ hổng đã bị reviewer chỉ ra ở file test này.
 *
 * `timeline === null` là tin nhắn CŨ: không event nào có offset `at`, nên
 * không có timeline để cắt và bubble hiện nguyên `m.content`. Nhánh đó giữ ô
 * tròn kể cả khi rỗng, đúng như trước — tin nhắn cũ không được đổi một chữ
 * bố cục. Chỉ khi timeline BẬT thì đoạn lời đầu rỗng mới không vẽ ô tròn
 * trắng (model gọi tool trước khi kịp nói gì), mở màn hình bằng chip tool.
 *
 * HAI NHÁNH DỌN KHÁC NHAU, và đó là cố ý — đừng gộp lại cho "đồng nhất":
 *
 *   • Nhánh timeline đi qua `displayText`, CÙNG hàm ToolTrace dùng cho mọi đoạn
 *     xen kẽ. Ở đây `firstSegment` là lát CẮT, nên nó cần đủ ba việc:
 *       - Vá fence hở. Offset `at` rơi vào GIỮA khối ``` thì lát đầu kết thúc
 *         bằng fence chưa đóng; MarkdownRenderer coi phần còn lại của lượt là
 *         code, nên kết luận của model hiện thành khối code.
 *       - NFC hoá. Chuỗi gốc có thể ở dạng NFD; app nói tiếng Việt nên dấu tổ
 *         hợp lơ lửng là hỏng dữ liệu hiển thị, không phải xấu xí.
 *       - Bỏ đầu mảnh bị cắt đôi (`dropCutHead`), strip markup, rồi sanitize.
 *     Ở nhánh này bubble và ToolTrace vẽ ĐÚNG CÙNG một chuỗi, nên lệch một chút
 *     là hiện ra hai kiểu — đó là chỗ dễ trôi lệch nhất, và phải dùng chung hàm.
 *
 *   • Nhánh tin nhắn cũ giữ `stripEmulatedToolMarkup` + `sanitizeContent` như
 *     trước, KHÔNG đi qua `displayText`. Lý do: `dropCutHead` sinh ra để đoán
 *     "đoạn này bị `at` cắt đôi", mà ở đây không có lát cắt nào — cả tin nhắn
 *     là nguyên vẹn. Hậu quả đo được: tin nhắn mở đầu bằng JSON (`{"r":1}`)
 *     rồi kèm khối tool_call trọn vẹn, dấu đóng `</tool_call>` đứng riêng
 *     dòng bị đọc thành "dấu đóng mồ côi" và nuốt MẤT cả mở đầu. Mất chữ thật
 *     tệ hơn nhiều so với mất cân bằng fence, nên nhánh này giữ nguyên.
 */
export function bubbleOf(
  content: string,
  timeline: TimelineSegment[] | null,
): { text: string; show: boolean } {
  if (timeline === null) {
    return { text: sanitizeContent(stripEmulatedToolMarkup(content).text), show: true };
  }
  const firstSegment = timeline[0];
  const text = displayText(firstSegment?.kind === 'text' ? firstSegment.text : '');
  return { text, show: text.trim() !== '' };
}

/*
 * Thanh thao tác của tin nhắn — chỉ hiện khi cần, nhưng LUÔN với tới.
 *
 * Trước đây đây là class `.msg-actions` trong globals.css; khối đó đã bị xoá
 * nhưng phép ẩn/hiện vẫn còn nguyên ở JSX dạng `opacity-0 group-hover:opacity-100`
 * — thiếu hai nhánh còn lại, và cả hai đều là lỗi về khả dụng chứ không phải
 * về thẩm mỹ:
 *   • Bàn phím — phần tử `opacity-0` VẪN nhận focus, nên Tab đi tới một nút
 *     mà mắt không thấy.
 *   • Cảm ứng — không có `:hover` dạng hover-không, nên copy / sửa / chuyển
 *     nhánh KHÔNG có đường vào nào trên điện thoại.
 *
 * Ba nhánh dưới đây bù lại đúng hai lỗi đó; `[@media(hover:none)]` và
 * `[@media(pointer:coarse)]` thay cho hai truy vấn trong khối CSS cũ.
 */
const MSG_ACTIONS =
  'opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100 ' +
  '[@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100';

interface MessageItemProps {
  m: Message;
  branchInfo?: BranchInfo;
  isStreaming: boolean;
  isEditing: boolean;
  isCopied: boolean;
  draft: string;
  isTouchDevice: boolean;
  sendOnEnter: boolean;
  throttleMs: number;
  onCopy: (m: Message) => void;
  onRegenerate: (id: string) => void;
  onSwitchBranch: (messageId: string, direction: 'previous' | 'next') => void;
  onStartEdit: (m: Message) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDraftChange: (text: string) => void;
  onContinueGenerating?: () => void;
  onContentResize?: () => void;
}

function ActionButton({
  icon: Icon,
  onClick,
  label,
  active,
}: {
  icon: React.ElementType;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`relative flex h-6 w-6 items-center justify-center rounded-md transition-colors after:absolute after:-inset-[10px] after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        active ? 'bg-raised text-accent' : 'text-tertiary hover:bg-raised hover:text-primary'
      }`}
    >
      <Icon size={13} />
    </button>
  );
}

export const MessageItem = memo(
  function MessageItem({
    m,
    branchInfo,
    isStreaming,
    isEditing,
    isCopied,
    draft,
    isTouchDevice,
    sendOnEnter,
    throttleMs,
    onCopy,
    onRegenerate,
    onSwitchBranch,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onDraftChange,
    onContinueGenerating,
    onContentResize,
  }: MessageItemProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const isLongUserMsg = m.role === 'user' && m.content.length > 250;

    if (m.role === 'user') {
      return (
        /*
         * KHÔNG có padding ngang ở đây. Container cuộn của message list đã nắm
         * gutter (`px-5 md:px-8`) và bọc cột ở `max-w-thread`; trước đây hàng
         * lại tự thêm `px-4 sm:px-6` BÊN TRONG nên chữ lệch 56px về trái so với
         * ô nhập (chỉ 16px) — cùng một nội dung nhưng hai mép không khớp.
         * `max-w-4xl mx-auto` cũng là vô nghĩa ở đây: cha đã chặn ở 48rem.
         */
        <div className="group relative w-full py-4">
          {!isEditing && (
            <div
              className={`absolute top-1.5 right-1 z-10 flex items-center gap-0.5 lift-sm rounded-lg border border-subtle bg-overlay px-1 py-0.5 ${MSG_ACTIONS}`}
            >
              {branchInfo && (
                <BranchSwitcher
                  currentIndex={branchInfo.currentIndex}
                  total={branchInfo.total}
                  isTouchDevice={isTouchDevice}
                  disabled={isStreaming}
                  onPrevious={() => onSwitchBranch(m.id, 'previous')}
                  onNext={() => onSwitchBranch(m.id, 'next')}
                />
              )}
              <ActionButton
                icon={isCopied ? Check : Copy}
                onClick={() => onCopy(m)}
                label="Sao chép"
                active={isCopied}
              />
              <ActionButton
                icon={Pencil}
                onClick={() => onStartEdit(m)}
                label="Chỉnh sửa"
              />
            </div>
          )}

          {/*
           * BONG BÓT TRUYỆN TRANH — nét mực 2px, bo bất đối xứng, đuôi chỉ vẽ
           * tay ở góc dưới, và avatar chibi đứng NGOÀI bubble (không phải trong).
           *
           * Avatar đứng ngoài là cố ý: đặt nó trong bubble thì nó thành một ô
           * tròn thứ hai nữa trong hộp, và mắt phải đọc ba lớp thay vì hai.
           *
           * Cụm bubble+avatar là MỘT hàng: `ml-auto` đẩy cả cụm sang phải, nên
           * mép phải của bubble vẫn chạm mép phải của cột hội thoại — giữ được
           * bất biến gutter mà `tests/design-system.test.ts` canh.
           */}
          <div className="ml-auto flex max-w-[85%] items-end justify-end gap-2">
            <ChibiAvatar side="user" />
            <div className="bubble-user lift-sm px-4 py-3.5">
            {m.experimental_attachments && m.experimental_attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {m.experimental_attachments.map((att, idx) => (
                  <div key={idx} className="relative overflow-hidden lift-sm rounded-lg border border-subtle bg-surface">
                    {att.contentType?.startsWith('image/') ? (
                      <img
                        src={att.url}
                        alt={att.name ?? 'attachment'}
                        className="max-h-48 max-w-xs object-cover"
                        loading="eager"
                        decoding="async"
                        onLoad={onContentResize}
                        onError={onContentResize}
                      />
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 font-mono text-ui text-primary">
                        <Paperclip size={12} className="text-accent" />
                        <span className="truncate max-w-[150px]">{att.name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isEditing ? (
              <div className="flex w-full min-w-[280px] flex-col gap-2 lift-sm rounded-lg border border-default bg-base p-3">
                <TextareaAutosize
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (sendOnEnter && e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onSaveEdit(m.id);
                    }
                    if (e.key === 'Escape') onCancelEdit();
                  }}
                  aria-label="Sửa nội dung tin nhắn"
                  /* Bỏ `outline-none`: ring `:focus-visible` toàn cục ở globals.css là dấu hiệu focus duy nhất của ô này. */
                  className="w-full resize-none bg-transparent font-mono text-body text-primary placeholder:text-tertiary"
                  autoFocus
                />
                <div className="flex justify-end gap-2 border-t border-subtle pt-2 font-mono text-ui">
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="rounded-lg px-2.5 py-1 text-tertiary transition-colors hover:bg-overlay hover:text-primary hover:text-primary"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => onSaveEdit(m.id)}
                    className="rounded-lg bg-accent px-3.5 py-1.5 font-medium text-on-fill transition-colors hover:bg-accent/85"
                  >
                    Lưu & Gửi lại
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`relative flex items-start gap-2 ${
                  isLongUserMsg && !isExpanded ? 'max-h-36 overflow-hidden' : ''
                }`}
              >
                <span className="sr-only">Bạn:</span>
                <div className="min-w-0 flex-1 whitespace-pre-wrap break-words font-sans text-read leading-relaxed text-primary">
                  {sanitizeContent(m.content)}
                </div>

                {isLongUserMsg && !isExpanded && (
                  /*
                   * Lớp mờ dần phải dừng đúng ở màu BUBBLE, không phải ở một hex
                   * viết tay và cũng không phải ở nền app: bubble nay là nền
                   * nhấn nhạt (`bg-accent-soft`), nên gradient phải kết thúc
                   * bằng chính màu đó. Dùng `from-raised` sẽ để lộ một vệt
                   * xám ở chỗ hai lớp gặp nhau.
                   */
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-accent-soft from-70% to-transparent" />
                )}
              </div>
            )}

            {isLongUserMsg && !isEditing && (
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                aria-expanded={isExpanded}
                className="mt-1.5 inline-flex items-center gap-1 font-mono text-meta font-medium text-accent transition-colors hover:text-primary"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp size={12} />
                    <span>Thu gọn</span>
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} />
                    <span>Xem thêm ({m.content.length.toLocaleString('vi-VN')} ký tự)</span>
                  </>
                )}
              </button>
            )}
            </div>
          </div>
        </div>
      );
    }

    /*
     * TIMELINE: model nói, chạy tool, nói tiếp — dựng lại đúng thứ tự thời
     * gian thay vì dồn hết tool xuống cuối.
     *
     * `timeline === null` là tin nhắn CŨ (không sự kiện nào có offset `at`):
     * bubble hiện nguyên `m.content` đã dọn, đúng như trước, và ToolTrace tự
     * vẽ lại bảng kê cũ. Đây là nhánh không được đổi một chữ.
     *
     * `buildTimeline` cắt trên `m.content` NGUYÊN BẢN, còn bubble luôn dọn
     * trước khi hiện. Hai việc đó không mâu thuẫn: dọn chỉ áp dụng cho thứ
     * đang vẽ ra, offset thì đã được server ghi sẵn theo bản gốc. Dọn sớm
     * hơn một chữ là timeline cắt lệch, mà lệch thì ra vẫn có chữ, rất khó
     * nhận ra bằng mắt (đo được: lệch 38 ký tự trên một đoạn markup 38 ký tự,
     * kết luận của model bị đẩy lên TRÊN tool).
     *
     * Lý do dọn và lý do quyết định vẽ bubble nằm ở `bubbleOf` (đặt cùng file,
     * xem chú thích ở đó) — giữ ngoài thân component để test được bằng hàm
     * thật chứ không bằng regex trên source.
     */
    const annotations = (m as any).annotations as Array<Record<string, unknown>> | undefined;
    const toolInvocations = (m as any).toolInvocations as Array<{
      toolCallId?: string;
      state?: string;
    }> | undefined;
    /*
     * MỘT lần dựng cho cả lượt, dùng chung kết quả.
     *
     * `events` và `timeline` là hai mặt của một lần quét, và chỗ DUY NHẤT quyết
     * định cờ `abandoned` bật khi nào là lệnh `isStreaming !== false` ngay dưới
     * đây. Trước đây `ToolTrace` tự gọi `collectToolEvents` + `buildTimeline`
     * lần nữa với đúng bộ đối số đó: mỗi token stream quét lại cả lượt hai
     * lần (đo được 3,6 ms mỗi lượt ở content 8.000 ký tự), và lệch số đối số
     * là bubble với chip list nói hai chuyện khác nhau về `abandoned`.
     *
     * `buildToolTrace` cắt trên `m.content` NGUYÊN BẢN: `at` là chỉ số ký tự
     * trong bản gốc, mà hàm strip markup xoá các khối nên mọi vị trí sau khối
     * bị xoá đều lệch.
     */
    const { events, timeline } = buildToolTrace(
      m.content,
      annotations,
      toolInvocations,
      isStreaming !== false,
    );
    const { text: bubbleContent, show: showBubble } = bubbleOf(m.content, timeline);

    return (
      <div className="group relative w-full py-5">
        {!isStreaming && (
          <div
            className={`absolute top-1 right-1 z-10 flex items-center gap-0.5 lift-sm rounded-lg border border-subtle bg-overlay px-1 py-0.5 ${MSG_ACTIONS}`}
          >
            <ActionButton
              icon={isCopied ? Check : Copy}
              onClick={() => onCopy(m)}
              label="Sao chép"
              active={isCopied}
            />
            <ActionButton
              icon={RefreshCcw}
              onClick={() => onRegenerate(m.id)}
              label="Tạo lại"
            />
            {branchInfo && (
              <BranchSwitcher
                currentIndex={branchInfo.currentIndex}
                total={branchInfo.total}
                isTouchDevice={isTouchDevice}
                disabled={isStreaming}
                onPrevious={() => onSwitchBranch(m.id, 'previous')}
                onNext={() => onSwitchBranch(m.id, 'next')}
              />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <span className="sr-only">Trợ lý:</span>
          {m.experimental_attachments && m.experimental_attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {m.experimental_attachments.map((att, idx) => (
                <div key={idx} className="relative overflow-hidden lift-sm rounded-lg border border-subtle bg-surface">
                  {att.contentType?.startsWith('image/') ? (
                    <img
                      src={att.url}
                      alt={att.name ?? 'attachment'}
                      className="max-h-48 max-w-xs object-cover"
                      loading="eager"
                      decoding="async"
                      onLoad={onContentResize}
                      onError={onContentResize}
                    />
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 font-mono text-ui text-primary">
                      <Paperclip size={12} className="text-accent" />
                      <span className="truncate max-w-[150px]">{att.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {(() => {
            const adopted = getOrchestratorAdoptedAnnotation(
              (m as any).annotations as unknown[] | undefined,
            );
            return adopted ? <OrchestratorBadge payload={adopted} /> : null;
          })()}

          {/*
           * Bong bóng của bot đảo chiều với bubble user: avatar bên trái, đuôi
           * chỉ xuống-trái, nền GIẤY TRẮNG (không phải mint) — vì đây là nội
           * dung chính, nó phải là thứ nền sạch nhất trên màn hình.
           *
           * Chỉ PHẦN LỜI nằm trong bubble. Tool trace, khối suy luận và tệp đính
           * kèm nằm ngoài: chúng là bảng kê công việc, không phải lời nói, và
           * bọc chúng vào bong bóng sẽ khiến một hàng dài trông như nói dối.
           *
           * Khi timeline bật (`timeline !== null`), model đã xen lẫn lời với
           * tool, nên ở đây chỉ lấy ĐOẠN LỜI ĐẦU TIÊN. Các đoạn lời sau tool do
           * ToolTrace vẽ ra ngoài bubble, đúng thứ tự thời gian: nói, chạy tool,
           * nói tiếp. Bubble vẫn là chỗ sạch nhất cho câu mở đầu, vì đó là câu
           * người đọc chờ. Không có đoạn lời đầu (model gọi tool trước khi nói
           * gì) thì không vẽ bubble trắng rỗng, chỉ mở màn hình bằng chip tool.
           */}
          {showBubble && (
          <div className="flex items-start gap-2">
            <ChibiAvatar side="bot" className="mt-1" />
            <div className="bubble-bot lift-sm min-w-0 flex-1 px-4 py-3.5">
          <div
            className={`claude-prose text-primary ${isStreaming ? 'streaming-caret' : ''}`}
            aria-busy={isStreaming}
          >
            <ErrorBoundary resetKey={`${m.id}:${m.content.length}`}>
              <MarkdownRenderer
                content={bubbleContent}
                isStreaming={isStreaming}
                throttleMs={throttleMs}
              />
            </ErrorBoundary>
          </div>
            </div>
          </div>
          )}

          {/*
           * ToolTrace đứng SAU bubble, không phải trên: lượt agent đọc được là
           * câu trả lời trước, bảng kê công việc sau (xem PLAN.md 10.6).
           *
           * `content` phải là `m.content` NGUYÊN BẢN, tuyệt đối không phải
           * `stripEmulatedToolMarkup(...).text`: offset `at` mà server ghi là
           * chỉ số ký tự trong bản gốc, còn hàm strip xoá các khối markup nên
           * mọi vị trí sau khối bị xoá đều lệch. Đưa chuỗi đã strip vào đây thì
           * timeline cắt lệch chỗ, hiện tượng rất khó nhận ra vì vẫn ra chữ.
           * `buildTimeline` trả null cho tin nhắn cũ không có `at`, khi đó
           * ToolTrace tự vẽ lại đúng bố cục cũ.
           *
           * `isStreaming` là tín hiệu DUY NHẤT cho biết lượt đã hết stream, và
           * `ToolTrace` mặc định là "chưa biết" (coi như còn chạy). Không truyền
           * ở đây thì trạng thái "bị bỏ dở" của một tool bị dừng giữa chừng là
           * code chết: chip quay mãi như thể việc đó còn đang chạy. Mặc định bịa
           * ra chip "bị bỏ dở" oan còn tệ hơn, nên thiếu tín hiệu thì giữ hành vi
           * cũ — ở đây có mặt đúng là lúc nói ra sự thật.
           *
           * `events` + `timeline` là KẾT QUẢ của lần dựng duy nhất ở trên,
           * truyền xuống để `ToolTrace` không dựng lại lần nữa mỗi token
           * (xem `buildToolTrace`). `isStreaming` vẫn phải truyền: đó là đường
           * dựng dự phòng khi không có ai dựng sẵn.
           *
           * Comparator của `MessageItem` đã so `isStreaming` sẵn (dòng dưới),
           * nên việc truyền thêm này không sinh thêm lần render nào.
           */}
          <ToolTrace
            content={m.content}
            annotations={annotations}
            toolInvocations={toolInvocations}
            isStreaming={isStreaming}
            events={events}
            timeline={timeline}
          />

          {(() => {
            const { truncated, message: note } = getFinishInfo(m);
            if (!truncated || isStreaming) return null;
            return (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 lift-sm rounded-lg border border-warning/30 bg-raised px-4 py-2.5 font-mono text-ui text-warning">
                <span className="min-w-0">{note ?? 'Câu trả lời có thể chưa hoàn chỉnh.'}</span>
                {onContinueGenerating && (
                  <button
                    type="button"
                    onClick={onContinueGenerating}
                    className="flex-shrink-0 rounded-lg bg-warning px-3 py-1.5 font-medium text-on-fill transition-colors hover:bg-warning/85"
                  >
                    Viết tiếp
                  </button>
                )}
              </div>
            );
          })()}

          {m.role === 'assistant' && (
            <div className="flex flex-wrap items-center gap-2">
              <MessageUsage annotations={(m as { annotations?: unknown }).annotations} />
              {(() => {
                const annotations = (m as any).annotations as Array<Record<string, unknown>> | undefined;
                if (!annotations) return null;
                const evidenceAnn = annotations.find(
                  (a) => a && typeof a === 'object' && ('evidenceLevel' in a || 'routeReceipt' in a),
                ) as { evidenceLevel?: string; routeReceipt?: unknown } | undefined;
                if (!evidenceAnn) return null;
                /*
                 * Mặc định 'reported_done' chỉ đúng khi lượt thật sự chạy xong.
                 * Lượt bị dừng giữa chừng thì không có gì để "đã báo xong": mặc định
                 * hoá thành reported_done là in ra một khẳng định lượt đó chưa đạt,
                 * và nó nằm ngay trên nhãn "aborted" ở ngay dưới. Server có ghi
                 * evidenceLevel thì tin server, chỉ khi thiếu mới suy.
                 */
                const level =
                  evidenceAnn.evidenceLevel ??
                  (isStreaming
                    ? 'running'
                    : (m as any).status === 'aborted'
                      ? 'blocked'
                      : 'reported_done');
                return <EvidenceBadge level={level} size="sm" />;
              })()}
            </div>
          )}

          {m.role === 'assistant' && (m as any).status === 'aborted' && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-subtle pt-2 font-mono">
              <div className="flex items-center gap-1.5">
                <MessageStatusBadge status="aborted" />
                <span className="text-meta text-tertiary">· Bạn có thể tạo lại</span>
              </div>
              <button
                type="button"
                onClick={() => onRegenerate(m.id)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-meta text-accent transition-colors hover:bg-raised hover:text-primary"
              >
                <RefreshCcw size={12} />
                <span>Tạo nhánh mới</span>
              </button>
            </div>
          )}

          {/*
           * Suy luận đứng CUỐI CÙNG, dưới cả bảng kê công việc. Nó là một chuỗi
           * phẳng không chia đoạn được nên không đưa vào timeline được; đặt nó
           * cuối là để thứ tự đọc là: câu trả lời, việc đã làm, rồi mới là lý do.
           * Đặt nó trên bubble như trước đây là đẩy câu trả lời xuống dưới tầm
           * mắt bằng hai khối viền liền nhau.
           */}
          {(() => {
            const reasoning = (m as any).reasoning;
            if (typeof reasoning === 'string' && reasoning.trim()) {
              return <ThinkingBlock reasoning={reasoning} isStreaming={isStreaming} />;
            }
            return null;
          })()}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.m.id === next.m.id &&
    prev.m.content === next.m.content &&
    (prev.m as any).reasoning === (next.m as any).reasoning &&
    prev.m.role === next.m.role &&
    (prev.m as any).status === (next.m as any).status &&
    prev.m.annotations === next.m.annotations &&
    (prev.m as any).toolInvocations === (next.m as any).toolInvocations &&
    prev.m.experimental_attachments === next.m.experimental_attachments &&
    prev.branchInfo?.currentIndex === next.branchInfo?.currentIndex &&
    prev.branchInfo?.total === next.branchInfo?.total &&
    prev.isStreaming === next.isStreaming &&
    prev.isEditing === next.isEditing &&
    prev.isCopied === next.isCopied &&
    prev.draft === next.draft &&
    prev.isTouchDevice === next.isTouchDevice &&
    prev.sendOnEnter === next.sendOnEnter &&
    prev.throttleMs === next.throttleMs,
);
