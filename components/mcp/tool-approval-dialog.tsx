'use client';

/**
 * Hộp thoại phê duyệt tool MCP.
 *
 * Tool MCP là mã của BÊN THỨ BA chạy trên máy người dùng, nên mặc định mọi
 * lần gọi đều phải xin phép — trừ khi tool nằm trong danh sách tự duyệt của
 * server (autoApprove) hoặc người dùng đã chọn "Luôn cho phép".
 *
 * Bốn quyết định (chuẩn ACP):
 *   allow_once    — cho phép đúng lần này
 *   always_allow  — cho phép và nhớ mãi (ghi policy xuống đĩa ở main)
 *   deny_once     — từ chối lần này
 *   always_deny   — từ chối và chặn mãi
 *
 * Yêu cầu đến từ Electron main qua event một chiều; component này chỉ là
 * mặt tiền, mọi quyết định đều đi qua IPC để main giải quyết (kể cả khi
 * người dùng không trả lời — main tự từ chối sau 120 giây).
 */

import { Z_CLASS } from '@/lib/ui-z';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, Terminal, AlertCircle } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';
import {
  onMcpApprovalRequested,
  onMcpApprovalResolved,
  resolveMcpApproval,
} from '@/lib/mcp/bridge';
import type {
  VyenMcpApprovalRequest,
  VyenMcpPermissionDecision,
} from '@/lib/desktop-bridge';

const DECISIONS: Array<{ value: VyenMcpPermissionDecision; label: string; primary?: boolean }> = [
  { value: 'allow_once', label: 'Cho phép lần này', primary: true },
  { value: 'always_allow', label: 'Luôn cho phép' },
  { value: 'deny_once', label: 'Từ chối lần này' },
  { value: 'always_deny', label: 'Luôn từ chối' },
];

function formatArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args ?? {}, null, 2);
  } catch {
    return '(tham số không hiển thị được)';
  }
}

export function McpToolApprovalDialog() {
  const [queue, setQueue] = useState<VyenMcpApprovalRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const offRequested = onMcpApprovalRequested((req) => {
      setQueue((prev) => (prev.some((p) => p.id === req.id) ? prev : [...prev, req]));
    });
    /* Gỡ khỏi hàng đợi khi main kết luận — kể cả khi chính main tự từ chối
       sau timeout, hoặc khi một cửa sổ khác đã trả lời. */
    const offResolved = onMcpApprovalResolved(({ id }) => {
      setQueue((prev) => prev.filter((p) => p.id !== id));
    });
    return () => {
      offRequested();
      offResolved();
    };
  }, []);

  const current = queue[0];

  const decide = async (decision: VyenMcpPermissionDecision) => {
    if (!current) return;
    setError(null);
    // Lạc quan: bỏ khỏi hàng đợi ngay để modal trống không kẹt lại giữa
    // lượt quyết định nối tiếp nhau.
    setQueue((prev) => prev.filter((p) => p.id !== current.id));
    try {
      await resolveMcpApproval(current.id, decision);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  };

  useFocusTrap(containerRef, {
    active: Boolean(current),
    /*
     * Escape CỐ Ý không quyết định gì. Mọi lựa chọn ở đây đều bị ghi xuống
     * main, còn Escape là cử chỉ "bỏ qua" — cho nó gọi `decide('deny_once')`
     * nghĩa là người dùng bị từ chối thay mà không hề biết, và vì `decide`
     * gỡ khỏi hàng đợi trước khi await nên yêu cầu biến mất khỏi UI luôn.
     *
     * Vẫn truyền một handler rỗng thay vì bỏ hẳn `onEscape`: hook chỉ
     * stopPropagation + preventDefault khi có handler, nếu không Escape sẽ
     * chạy tiếp xuống window và đóng sidebar / cài đặt phía sau dialog.
     */
    onEscape: () => {},
    // Mở dialog phải đứng ở lựa chọn AN TOÀN: Enter phản xạ không được cấp
    // quyền chạy tool của bên thứ ba. Thị giác vẫn nhấn mạnh "Cho phép lần này".
    initialFocusSelector: `[data-mcp-decision="deny_once"]`,
  });

  if (!current || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={containerRef}
      className={`fixed inset-0 ${Z_CLASS.approvalCritical} flex items-center justify-center bg-black/70 p-4`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-approval-title"
        className="pi-frame relative w-full max-w-lg overflow-hidden rounded-none border border-default bg-overlay font-mono text-primary shadow-bevel-out"
      >
        <span className="pi-corner-tl" />
        <span className="pi-corner-tr" />
        <span className="pi-corner-bl" />
        <span className="pi-corner-br" />

        <div className="flex items-start gap-3 border-b border-subtle bg-raised px-4 py-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
          <div className="min-w-0">
            <h2 id="mcp-approval-title" className="font-pixel text-body font-semibold text-primary [image-rendering:pixelated]">
              <span className="mr-1 font-bold text-accent">$</span>mcp approval
            </h2>
            <p className="mt-0.5 font-sans text-meta leading-relaxed text-secondary">
              Công cụ này do server bên ngoài cung cấp. Chỉ cho phép nếu bạn tin server này.
            </p>
          </div>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div className="flex items-center gap-2 rounded-none border border-subtle bg-sunken px-3 py-2">
            <Terminal className="h-4 w-4 flex-shrink-0 text-accent" />
            <code className="min-w-0 flex-1 truncate text-ui font-medium text-primary">
              {current.toolName}
            </code>
            <span className="flex-shrink-0 rounded-none border border-subtle bg-raised px-1.5 py-0.5 text-micro text-secondary">
              {current.serverId}
            </span>
          </div>

          <div>
            <div className="mb-1 font-sans text-meta font-medium text-secondary">Tham số</div>
            {/* JSON là MÁY — `font-mono`, và luôn là text child, KHÔNG BAO GIỜ
                `dangerouslySetInnerHTML`: đây là dữ liệu từ server bên thứ ba. */}
            <pre className="custom-scrollbar max-h-48 overflow-auto rounded-none border border-subtle bg-sunken px-3 py-2 text-meta leading-relaxed text-secondary">
              {formatArgs(current.arguments)}
            </pre>
          </div>

          {queue.length > 1 && (
            <p className="font-sans text-meta text-secondary">
              Còn {queue.length - 1} yêu cầu khác đang chờ sau yêu cầu này.
            </p>
          )}

          {error && (
            <p className="rounded-none border border-danger/40 bg-danger/10 px-3 py-2 font-sans text-meta text-danger">
              {error}
            </p>
          )}
        </div>

        {/*
         * Bốn quyết định, LUÔN hiện đủ — kể cả khi main đã gỡ yêu cầu khỏi hàng
         * đợi. `data-mcp-decision` là điểm neo cho `initialFocusSelector` và cho
         * test; đổi tên là hỏng cả hai.
         */}
        <div className="flex flex-wrap gap-2 border-t border-subtle bg-base px-4 py-3">
          {DECISIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              data-mcp-decision={d.value}
              onClick={() => void decide(d.value)}
              className={
                d.primary
                  ? 'rounded-none bg-accent px-3.5 py-1.5 text-ui font-semibold text-sunken shadow-bevel-in transition-colors hover:bg-accent/85'
                  : 'rounded-none border border-default bg-raised px-3 py-1.5 text-ui font-medium text-secondary transition-colors hover:border-strong hover:bg-overlay hover:text-primary'
              }
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
