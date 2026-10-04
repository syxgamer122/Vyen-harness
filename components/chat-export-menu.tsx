'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { exportJson, exportMarkdown } from '@/lib/backup';
import { Download, FileJson, FileText, Loader2, X } from 'lucide-react';
import { useAnchoredPanel, type PanelPos } from '@/lib/hooks/use-anchored-panel';
import { Z_CLASS } from '@/lib/ui-z';

/**
 * Menu xuất hội thoại. Panel render qua portal + position:fixed (xem
 * use-anchored-panel cho recipe chung): nút nằm sát phải status line nên canh
 * mép phải panel theo mép phải trigger rồi kẹp trong viewport. `pos` còn phục
 * vụ dòng lỗi đứng lại sau khi menu đóng.
 */
export function ChatExportMenu({ chatId }: { chatId: string | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  /* Vị trí neo phải SỐNG SÓT sau khi menu đóng: `useAnchoredPanel` chỉ tính
     `pos` khi `open` nên effect setPos chạy lúc mở, còn hook bỏ listener khi
     đóng. Không có bản sao này, nhánh render `{!open && exportError && pos}`
     bên dưới gặp `pos === null` và dòng lỗi báo "xuất thất bại" — thứ mà
     comment trên cùng file hứa sẽ đứng lại — KHÔNG BAO GIỜ hiện: người dùng
     bấm xuất, hỏng, menu tự đóng, và im lặng mất dấu vết. */
  const [lastPos, setLastPos] = useState<PanelPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const { pos, panelRef } = useAnchoredPanel({
    open,
    triggerRef,
    width: 240,
    align: 'right',
    close,
  });

  /* Ghi lại vị trí cuối cùng mỗi khi hook tính được — nguồn cho `lastPos`
     bên dưới, dùng sau khi menu đóng. */
  useEffect(() => {
    if (pos) setLastPos(pos);
  }, [pos]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, close]);

  if (!chatId) return null;

  const run = async (kind: 'json' | 'md') => {
    setBusy(true);
    setExportError(null);
    try {
      if (kind === 'json') await exportJson([chatId]);
      else await exportMarkdown([chatId]);
      setOpen(false);
    } catch (err) {
      console.error('[ChatExportMenu]', err);
      // Không được nuốt lặng lẽ: user sẽ tưởng file đã tải xong và bỏ
      // qua backup thật, trong khi dữ liệu chưa ra khỏi máy.
      setExportError(
        `Xuất thất bại: ${err instanceof Error ? err.message : 'lỗi không rõ'}. Thử lại hoặc chọn định dạng khác.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Xuất cuộc trò chuyện này"
        title="Xuất cuộc trò chuyện này"
        className="icon-btn-sm"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
            className={`surface-panel ${Z_CLASS.popover} animate-pop-in p-1`}
          >
            {exportError && (
              <p role="alert" className="notice-error mx-1 mb-1 px-2 py-1.5 text-meta leading-relaxed">
                {exportError}
              </p>
            )}
            <MenuRow
              icon={<FileJson size={15} className="text-tertiary" />}
              title="Xuất JSON (đầy đủ nhánh)"
              desc="Bảo toàn toàn bộ cây tin nhắn"
              onClick={() => run('json')}
            />
            <MenuRow
              icon={<FileText size={15} className="text-tertiary" />}
              title="Xuất Markdown (nhánh active)"
              desc="Dành cho đọc và in ấn"
              onClick={() => run('md')}
            />
          </div>,
          document.body,
        )}

      {!open &&
        exportError &&
        lastPos &&
        createPortal(
          <p
            role="alert"
            style={{
              position: 'fixed',
              top: lastPos.top,
              left: lastPos.left,
              width: lastPos.width,
            }}
            className={`notice-error flex items-start gap-2 ${Z_CLASS.popover} px-2.5 py-2 text-meta leading-relaxed`}
          >
            <span className="min-w-0 flex-1">{exportError}</span>
            {/* Dòng lỗi giờ đã hiện được sau khi menu đóng (xem `lastPos`),
                nên phải tự tắt được — nếu không nó đè vĩnh viễn lên vị trí neo. */}
            <button
              type="button"
              onClick={() => setExportError(null)}
              aria-label="Bỏ qua thông báo xuất thất bại"
              className="flex-none text-tertiary transition-colors hover:text-primary"
            >
              <X size={12} />
            </button>
          </p>,
          document.body,
        )}
    </div>
  );
}

function MenuRow({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="menu-item items-start px-2.5 py-2"
    >
      <span className="mt-0.5 flex-none">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-body font-medium text-primary">{title}</span>
        <span className="text-meta text-tertiary">{desc}</span>
      </span>
    </button>
  );
}
