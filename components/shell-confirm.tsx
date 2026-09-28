'use client';

import { Z_CLASS } from '@/lib/ui-z';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, Terminal, X, AlertTriangle } from 'lucide-react';
import { useHaptics } from '@/components/effects';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';

/**
 * Modal phê duyệt chạy lệnh shell — cổng an toàn trước khi lệnh chạm vào
 * máy người dùng. KHÔNG có phím tắt duyệt: chỉ bấm, hoặc Tab rồi Enter trên
 * nút, mới chạy lệnh.
 */

export interface ShellConfirmState {
  open: boolean;
  command: string;
  cwd?: string;
  resolve: (approved: boolean) => void;
}

/** Lệnh phá huỷ dữ liệu — hiện cảnh báo đỏ trên tiêu đề. */
const DESTRUCTIVE = /\b(rm|rmdir|del|erase|sudo|format|mkfs|drop|truncate|shutdown|reboot)\b/i;

export function ShellConfirm({ state, onClose }: { state: ShellConfirmState | null; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const haptics = useHaptics();

  const decide = (approved: boolean) => {
    if (approved) haptics.trigger('success');
    state?.resolve(approved);
    onClose();
  };

  useFocusTrap(containerRef, {
    active: Boolean(state?.open),
    onEscape: () => decide(false),
    initialFocusSelector: '[data-shell-discard]',
  });

  if (!state?.open || typeof document === 'undefined') return null;

  const isDestructive = DESTRUCTIVE.test(state.command);

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shell-confirm-title"
      className={`fixed inset-0 ${Z_CLASS.approval} flex items-end sm:items-center justify-center bg-sunken/75 p-3 sm:p-4`}
      onClick={() => decide(false)}
    >
      {/*
       * PHẲNG, không kính. `.glass-panel` ép `box-shadow` bằng `!important` —
       * thứ hợp đồng token cấm, vì chỉ `shadow-lift-lg` / `shadow-lift-sm`
       * được sinh bóng. Modal là tầng trên cùng nên `bg-overlay` + bóng ngoài đã đủ
       * tách khỏi nền (cùng cách làm với diff-confirm).
       */}
      <div
        className={`relative mb-2 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden lift-lg rounded-2xl border bg-overlay font-mono shadow-lift-lg animate-pop-in sm:mb-0 ${
          isDestructive ? 'border-danger' : 'border-default'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Terminal Header */}
        <div className="flex items-center justify-between border-b border-subtle bg-raised px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            {/* macOS/Linux 3 terminal dots — `rounded-full` chỉ ở đây, vì đây
                là hình tròn thật, không phải khối chứa nội dung. */}
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-danger" />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-warning" />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-success" />
            </div>

            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-accent" />
              <h2 id="shell-confirm-title" className="font-sans text-ui font-semibold text-primary">
                Execute Shell Command
              </h2>
            </div>
          </div>

          {isDestructive && (
            <span className="inline-flex items-center gap-1 rounded-full border border-danger/40 bg-danger/10 px-2.5 py-0.5 text-micro font-bold uppercase tracking-wider text-danger">
              <AlertTriangle size={11} />
              Destructive Action
            </span>
          )}
        </div>

        {/* Terminal Body */}
        <div className="space-y-3 bg-base px-4 py-4 sm:px-5 sm:py-5">
          {state.cwd && (
            <div className="flex items-center gap-1.5 font-mono text-meta text-tertiary">
              <span>cwd:</span>
              <span className="truncate text-secondary">{state.cwd || '.'}</span>
            </div>
          )}

          {/*
           * Lệnh là MÁY — `font-mono` toàn khối, và dấu `$` nằm ở CỘT RIÊNG
           * (không lẫn vào nội dung lệnh) để lệnh không bao giờ bị đọc sai
           * ký tự đầu. `break-all` vì lệnh dài không có chỗ trắng.
           */}
          <div
            className={`rounded-lg border p-4 font-mono ${
              isDestructive ? 'border-danger/40 bg-danger/5' : 'border-subtle bg-sunken'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <span className="select-none font-bold text-accent" aria-hidden="true">
                $
              </span>
              <span className="min-w-0 flex-1 break-all text-body font-semibold leading-relaxed text-accent">
                {state.command}
              </span>
            </div>
          </div>

          <p className="font-sans text-meta leading-relaxed text-secondary">
            Lệnh sẽ thực thi trực tiếp trên hệ thống của bạn qua runtime shell.
          </p>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between gap-3 border-t border-subtle bg-raised px-4 py-3 sm:px-5">
          <div className="hidden items-center gap-2 font-mono text-meta text-tertiary sm:flex">
            <span className="flex items-center gap-1">
              <kbd className="rounded-full border border-subtle bg-sunken px-2 py-0.5 text-micro text-secondary">
                Esc
              </kbd>
              <span>reject</span>
            </span>
            <span className="text-disabled" aria-hidden="true">
              •
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded-full border border-subtle bg-sunken px-2 py-0.5 text-micro text-secondary">
                Tab
              </kbd>
              <span>then ↵ on the chosen button</span>
            </span>
          </div>

          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            {/*
             * Mở dialog phải đứng ở lựa chọn AN TOÀN: Enter phản xạ không được
             * chạy lệnh. Giữ `data-shell-discard` vì `useFocusTrap` trỏ vào nó.
             */}
            <button
              ref={discardRef}
              data-shell-discard=""
              type="button"
              onClick={() => decide(false)}
              className="flex items-center justify-center gap-1.5 lift-sm rounded-lg border border-default bg-raised px-4 py-2 text-ui font-medium text-secondary transition-all hover:border-strong hover:text-primary active:scale-[0.98]"
            >
              <X size={14} />
              <span>[ Esc ] Từ chối</span>
            </button>
            <button
              type="button"
              onClick={() => decide(true)}
              className={`flex items-center justify-center gap-1.5 lift-sm rounded-lg px-4 py-2 text-ui font-semibold shadow-lift-sm transition-all active:scale-[0.98] ${
                isDestructive
                  ? 'bg-danger text-on-fill hover:bg-danger/85'
                  : 'bg-accent text-on-fill hover:bg-accent/85'
              }`}
            >
              <Check size={14} />
              <span>Duyệt & chạy</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
