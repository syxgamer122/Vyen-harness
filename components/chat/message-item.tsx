import React, { memo, useState } from 'react';
import type { Message } from 'ai/react';
import TextareaAutosize from 'react-textarea-autosize';
import { RefreshCcw, Paperclip, Pencil, Copy, Check, ChevronDown, ChevronUp, BrainCircuit } from 'lucide-react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { ErrorBoundary } from '@/components/error-boundary';
import { BranchSwitcher } from '@/components/branch-switcher';
import { MessageStatusBadge } from '@/components/message-status-badge';
import { sanitizeContent, getFinishInfo } from '@/lib/chat-tree-persistence';
import { stripEmulatedToolMarkup } from '@/lib/text-tool-guard';
import { ToolTrace } from '@/components/chat/tool-trace';
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
     * thuộc về câu trả lời. Vì vậy nó đánh dấu bằng một sườn trái 2px + một lớp
     * nền cực mỏng, KHÔNG đóng khung như panel. Trước đây khối này mang
     * `shadow-reasoning-glow` — key đó không còn sinh CSS nào, nên chỉ còn lại
     * `none`; toàn bộ tầng bậc giờ do sườn trái đảm nhiệm.
     */
    <div className="my-3 border-l-2 border-reasoning/40 bg-reasoning p-3.5">
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
        <div className="mt-2.5 max-h-60 overflow-y-auto whitespace-pre-wrap border-t border-reasoning/40/20 pt-2 font-mono text-meta leading-relaxed text-tertiary custom-scrollbar">
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
      className={`relative flex h-6 w-6 items-center justify-center rounded-none transition-colors after:absolute after:-inset-[10px] after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
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
        <div className="group relative w-full py-4 px-4 sm:px-6 max-w-4xl mx-auto">
          {!isEditing && (
            <div
              className={`absolute top-2 right-4 sm:right-6 z-10 flex items-center gap-1 rounded-none border border-subtle bg-overlay px-1 py-0.5 ${MSG_ACTIONS}`}
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
           * Bubble của người dùng là MỘT LỚP MÀU, không phải một khung.
           * Câu trả lời của assistant ở dưới hoàn toàn trần (không viền, không
           * nền) — nếu bubble cũng đóng viền + bóng + bo góc, cả hai đều là
           * "thẻ" và mắt không biết cái nào là nội dung. Vì vậy bubble chỉ giữ
           * `bg-raised` để phân biệt tác giả, không viền, không bóng.
           */}
          <div className="ml-auto max-w-[85%] rounded-none bg-raised p-4">
            {m.experimental_attachments && m.experimental_attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {m.experimental_attachments.map((att, idx) => (
                  <div key={idx} className="relative overflow-hidden rounded-none border border-subtle bg-surface">
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
              <div className="flex w-full min-w-[280px] flex-col gap-2 rounded-none border border-default bg-base p-3">
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
                  className="w-full resize-none bg-transparent font-mono text-body text-primary outline-none placeholder:text-tertiary"
                  autoFocus
                />
                <div className="flex justify-end gap-2 border-t border-subtle pt-2 font-mono text-ui">
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="rounded-none px-2.5 py-1 text-tertiary transition-colors hover:bg-overlay hover:text-primary"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => onSaveEdit(m.id)}
                    className="rounded-none bg-accent px-3 py-1 font-medium text-sunken transition-colors hover:bg-accent/85"
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
                   * Lớp mờ dần phải dừng đúng ở màu bubble, không phải ở một hex
                   * viết tay: bubble nằm trên lưới giấy nền của app, nên màu
                   * nền thật của nó là `bg-raised` hoà với nền phía dưới —
                   * `from-raised/70` bám theo bubble, `from-sunken` sẽ để lộ
                   * đường viền nơi hai lớp gặp nhau.
                   */
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-raised/70 from-70% via-raised/60 to-transparent" />
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
      );
    }

    return (
      <div className="group relative w-full py-5 px-4 sm:px-6 max-w-4xl mx-auto">
        {!isStreaming && (
          <div
            className={`absolute top-2 right-4 sm:right-6 z-10 flex items-center gap-1 rounded-none border border-subtle bg-overlay px-1.5 py-0.5 ${MSG_ACTIONS}`}
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
                <div key={idx} className="relative overflow-hidden rounded-none border border-subtle bg-surface">
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

          <ToolTrace
            annotations={(m as any).annotations as Array<Record<string, unknown>> | undefined}
            toolInvocations={(m as any).toolInvocations as Array<{
              toolCallId?: string;
              state?: string;
            }> | undefined}
          />

          {(() => {
            const reasoning = (m as any).reasoning;
            if (typeof reasoning === 'string' && reasoning.trim()) {
              return <ThinkingBlock reasoning={reasoning} isStreaming={isStreaming} />;
            }
            return null;
          })()}

          <div
            className={`claude-prose text-primary ${isStreaming ? 'streaming-caret' : ''}`}
            aria-busy={isStreaming}
          >
            <ErrorBoundary resetKey={`${m.id}:${m.content.length}`}>
              <MarkdownRenderer
                content={sanitizeContent(stripEmulatedToolMarkup(m.content).text)}
                isStreaming={isStreaming}
                throttleMs={throttleMs}
              />
            </ErrorBoundary>
          </div>

          {(() => {
            const { truncated, message: note } = getFinishInfo(m);
            if (!truncated || isStreaming) return null;
            return (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-none border border-warning/30 bg-raised px-3.5 py-2 font-mono text-ui text-warning">
                <span className="min-w-0">{note ?? 'Câu trả lời có thể chưa hoàn chỉnh.'}</span>
                {onContinueGenerating && (
                  <button
                    type="button"
                    onClick={onContinueGenerating}
                    className="flex-shrink-0 rounded-none bg-warning px-2.5 py-1 font-medium text-sunken transition-colors hover:bg-warning/85"
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
                const level = evidenceAnn.evidenceLevel ?? (isStreaming ? 'running' : 'reported_done');
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
                className="inline-flex items-center gap-1 rounded-none px-2 py-1 text-meta text-accent transition-colors hover:bg-raised hover:text-primary"
              >
                <RefreshCcw size={12} />
                <span>Tạo nhánh mới</span>
              </button>
            </div>
          )}
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
