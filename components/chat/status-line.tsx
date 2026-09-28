'use client';

/*
 * Status line thay cho ChatHeader kiểu web chat: một hàng hairline mang toàn
 * bộ trạng thái run theo ngôn ngữ terminal (DESIGN.md) — mode, trạng thái,
 * model, workspace, ngữ cảnh — rồi tới các tác vụ phiên (suy nghĩ/xuất/nén/xóa).
 *
 * NGUYÊN TẮC BỐ TRÍ: HÌNH DẠNG CỐ ĐỊNH, TỪ MANG NGHĨA, MÀU CHỈ NHẤN LẠI.
 *   {mode} · {model} · {workspace} · {context} · …NÚT
 * Mọi thứ trước dấu "·" cuối là CHỮ THUẦN trên một nền, không viền, không nền
 * riêng, không badge tròn. Màu chỉ tô lên khi trạng thái thật sự đáng báo; người
 * đọc phải hiểu được cả khi không nhìn thấy màu.
 *
 * Cụm phải `flex-none` (nút suy nghĩ/xuất/nén/xóa) và cụm trái co lại trước —
 * nhờ vậy thanh cuộn ngang không bao giờ đẩy nút ra ngoài khung hẹp.
 * Dữ liệu chỉ đọc từ props mà ChatInterface đã có; không tự tính gì mới.
 */
import React, { memo, useMemo } from 'react';
import { Menu, Scissors, Trash2 } from 'lucide-react';
import type { ModelOption } from '@/components/model-selector';
import { ThinkingMenu } from '@/components/thinking-menu';
import { ChatExportMenu } from '@/components/chat-export-menu';
import { computeMeter, fmt, type ContextMeterTone } from '@/components/context-meter';

import type { ModelFavorite, RecentModel } from '@/lib/model-meta';
import type { ThinkingLevel } from '@/lib/provider-url';

interface StatusLineProps {
  onOpenSidebar: () => void;
  sidebarCollapsed: boolean;

  /**
   * Chỉ để HIỂN THỊ TĨNH model đang dùng. Chọn model nằm ở composer — nơi tay
   * đang gõ — nên ở đây không còn `onModelChange` và các prop của picker.
   * Giữ `models` để tra ra tên hiển thị thay vì in ra id thô.
   */
  models: ModelOption[];
  model: string;

  agentMode?: 'plan' | 'act';
  onToggleAgentMode?: () => void;
  agentModeDisabled: boolean;

  workspace?: { connected: boolean; name: string | null; branch?: string | null };

  ctxUsed?: number;
  ctxMax?: number;

  thinkingLevel?: ThinkingLevel;
  thinkingSupportedLevels?: ThinkingLevel[] | null;
  onThinkingLevelChange?: (level: ThinkingLevel) => void;
  thinkingDisabled: boolean;
  /** Model bắt buộc luôn suy luận (metadata reasoning.mandatory). */
  thinkingMandatory?: boolean;

  run: { streaming: boolean; webBusy: boolean };

  hasMessages: boolean;
  canCompact?: boolean;
  compactBusy?: boolean;
  onCompact?: () => void;
  currentChatId: string | null;
  confirmClear: boolean;
  onSetConfirmClear: (val: boolean) => void;
  onDeleteChat: () => void;
}

/**
 * Ngưỡng cảnh báo KHÔNG tự đặt ở đây — lấy thẳng `tone` mà `computeMeter`
 * trả về (≥75% warning, ≥90% error) để số trên thanh khớp với ngưỡng nén
 * thật trong lib/context-budget.ts. Đừng viết lại điều kiện so sánh.
 */
const TONE_TEXT: Record<ContextMeterTone, string> = {
  ok: 'text-tertiary',
  warning: 'text-warning',
  error: 'text-danger',
};

const TONE_BAR: Record<ContextMeterTone, string> = {
  ok: 'bg-accent-dim',
  warning: 'bg-warning',
  error: 'bg-danger',
};

/** Chữ phân cách giữa các mảnh của thanh trạng thái. */
function Sep() {
  return (
    <span aria-hidden="true" className="flex-none select-none px-0.5 text-disabled">
      ·
    </span>
  );
}

export const StatusLine = memo(function StatusLine({
  onOpenSidebar,
  sidebarCollapsed,
  models,
  model,
  agentMode,
  onToggleAgentMode,
  agentModeDisabled,
  workspace,
  ctxUsed,
  ctxMax,
  thinkingLevel,
  thinkingSupportedLevels,
  onThinkingLevelChange,
  thinkingDisabled,
  thinkingMandatory,
  run,
  hasMessages,
  canCompact,
  compactBusy,
  onCompact,
  currentChatId,
  confirmClear,
  onSetConfirmClear,
  onDeleteChat,
}: StatusLineProps) {
  const meter = ctxUsed !== undefined && ctxMax ? computeMeter(ctxUsed, ctxMax) : null;

  /* Tra tên hiển thị thay vì in id thô; model lạ (đã gỡ khỏi danh sách) vẫn hiện id. */
  const activeModelLabel = useMemo(() => {
    const found = models.find((m) => m.id === model);
    return found?.label || model || 'chưa chọn model';
  }, [models, model]);

  /*
   * Trạng thái chạy gộp chung với mode thành MỘT mảnh dẫn đầu: `plan · idle`
   * đọc như một câu, thay vì hai pill rời rạc cạnh tranh sự chú ý.
   */
  const runLabel = run.webBusy ? 'web' : run.streaming ? 'running' : 'idle';
  const running = run.webBusy || run.streaming;

  return (
    /*
     * Cao 40px, chữ 12px, gutter 16px — trước đây là hàng 28px chữ 11px gutter
     * 8px: người dùng phải cúi sát màn hình mới đọc nổi tên model, và dãy
     * `·` chen giữa các mảnh không còn chỗ nào để thở. Hàng này là thanh
     * trạng thái duy nhất của app nên nó phải đọc được ở khoảng cách tay.
     */
    <header className="sticky top-0 z-20 flex h-10 min-w-0 flex-shrink-0 items-center gap-2 overflow-x-auto no-scrollbar border-b border-subtle bg-surface/90 px-4 font-mono text-ui text-secondary">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label={sidebarCollapsed ? 'Mở rộng thanh bên' : 'Mở thanh bên'}
        className={`icon-btn-md -ml-1.5 ${sidebarCollapsed ? '' : 'md:hidden'}`}
      >
        <Menu size={16} />
      </button>

      {/*
       * Cụm trái co lại trước khi cụm phải bị đẩy: thanh cuộn ngang giữ mọi nút
       * phải (nén/xóa) ở trong khung nhìn, đồng thời giữ CHỈ SỐ ngữ cảnh ở mọi
       * bề rộng — dưới `md` nó rút còn đúng con số, không biến mất.
       */}
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {/* Mode + trạng thái chạy: từ quyết định có thể đổi bằng một chạm. */}
        {onToggleAgentMode && (
          <button
            type="button"
            onClick={onToggleAgentMode}
            disabled={agentModeDisabled}
            aria-label={
              agentMode === 'plan' ? 'Chuyển sang ACT mode' : 'Chuyển sang PLAN mode'
            }
            title={
              agentMode === 'plan'
                ? 'PLAN: agent chỉ đọc và hỏi, bấm để cho phép ghi'
                : 'ACT: agent đọc + ghi file, chạy lệnh, bấm để về PLAN'
            }
            className={`flex-none rounded-full px-2 py-0.5 uppercase tracking-[0.08em] text-micro transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${
              agentMode === 'plan'
                ? 'text-warning'
                : 'text-tertiary hover:text-primary'
            }`}
          >
            {agentMode === 'plan' ? 'plan' : 'act'}
          </button>
        )}

        <span
          className={`flex flex-none items-center gap-1.5 ${running ? 'text-accent' : 'text-tertiary'}`}
          role="status"
          aria-label={`Trạng thái: ${runLabel}`}
        >
          {running ? (
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          ) : (
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-disabled" />
          )}
          {runLabel}
        </span>

        {/* Model — bấm để mở ModelSelector ở composer. */}
        <Sep />
        <button
          type="button"
          onClick={() => {
            document.getElementById('model-selector-trigger')?.click();
          }}
          aria-label={`Model: ${activeModelLabel} (bấm để đổi)`}
          title={`Model: ${activeModelLabel} (bấm để đổi)`}
          className="min-w-0 max-w-[9rem] lg:max-w-[16rem] shrink truncate rounded-full px-2.5 py-1 text-left text-secondary transition-colors hover:bg-raised hover:text-primary"
        >
          {activeModelLabel}
        </button>

        {/* Workspace + nhánh: chỉ khi còn chỗ, là chi tiết phụ. */}
        {workspace && (
          <>
            <Sep />
            <span
              className="hidden flex-none truncate text-tertiary lg:inline"
              title={
                workspace.connected
                  ? `Thư mục làm việc: ${workspace.name}${workspace.branch ? ` (nhánh ${workspace.branch})` : ''}`
                  : 'Chưa kết nối thư mục làm việc, nút thư mục trong thanh nhập'
              }
            >
              {workspace.connected ? workspace.name : 'no workspace'}
              {workspace.connected && workspace.branch ? ` @${workspace.branch}` : ''}
            </span>
          </>
        )}

        {/*
         * Ngữ cảnh: MỘT thanh mảnh tỉ lệ + con số. Mười vạch cũ nặng quá cho
         * một hàng thanh trạng thái và tốn thêm chỗ ngang cạnh cụm phải; đổi lại
         * độ chính xác giảm từ 10 bậc xuống liên tục — chấp nhận được, vì số
         * phần trăm vẫn in ra ngay cạnh. Dưới `lg` chỉ còn phần trăm.
         */}
        {meter && (
          <>
            <Sep />
            <div
              className="flex min-w-0 flex-none items-center gap-1.5"
              title={`Ngữ cảnh: ${fmt(ctxUsed!)} / ${fmt(meter.safeMax)} token (${meter.percent}%)`}
            >
              <div
                role="progressbar"
                aria-label="Mức sử dụng ngữ cảnh"
                aria-valuenow={Math.min(100, meter.percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-sunken lg:block"
              >
                <div
                  className={`h-full rounded-full ${TONE_BAR[meter.tone]}`}
                  style={{ width: `${Math.round(meter.fillRatio * 100)}%` }}
                />
              </div>
              <span className={`flex-none tabular-nums text-ui ${TONE_TEXT[meter.tone]}`}>
                <span className="sm:hidden">{meter.percent}%</span>
                <span className="hidden sm:inline">
                  {fmt(ctxUsed!)}/{fmt(meter.safeMax)}
                </span>
              </span>
            </div>
          </>
        )}
      </div>

      {/* Cụm phải: không bao giờ co lại, luôn tới tay được. */}
      <div className="flex flex-none items-center gap-1 pl-2">
        {thinkingLevel && onThinkingLevelChange && (
          <ThinkingMenu
            value={thinkingLevel}
            onChange={onThinkingLevelChange}
            disabled={thinkingDisabled}
            supportedLevels={thinkingSupportedLevels}
            mandatory={thinkingMandatory}
          />
        )}

        <ChatExportMenu chatId={currentChatId} />

        {hasMessages && canCompact && onCompact && (
          <button
            type="button"
            onClick={onCompact}
            disabled={compactBusy}
            aria-label={compactBusy ? 'Đang nén hội thoại' : 'Nén hội thoại'}
            title={
              compactBusy
                ? 'Đang nén hội thoại...'
                : 'Nén phần hội thoại cũ thành tóm tắt'
          }
            className="icon-btn-md flex-none"
          >
            <Scissors size={15} />
          </button>
        )}

        {hasMessages &&
          (confirmClear ? (
            <div className="flex flex-none items-center gap-0.5 pl-0.5">
              <button
                type="button"
                onClick={onDeleteChat}
                className="rounded-md px-2.5 py-1 font-medium text-danger transition-colors hover:bg-danger/10"
              >
                Xóa
              </button>
              <button
                type="button"
                onClick={() => onSetConfirmClear(false)}
                className="rounded-md px-2.5 py-1 text-tertiary transition-colors hover:bg-raised"
              >
                Hủy
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onSetConfirmClear(true)}
              aria-label="Xóa cuộc trò chuyện"
              title="Xóa cuộc trò chuyện này"
              className="icon-btn-md icon-btn-danger flex-none"
            >
              <Trash2 size={15} />
            </button>
          ))}
      </div>
    </header>
  );
});
