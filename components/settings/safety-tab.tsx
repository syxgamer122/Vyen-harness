'use client';

/**
 * Settings → tab "Quyền & An toàn"
 *
 * Chính sách phê duyệt, auto-pilot, code mode và bảng phân quyền từng công cụ.
 *
 * (Tách ra từ components/settings-dialog.tsx.)
 *
 * Không nhận prop: tự đọc `useAppStore` như các section khác trong
 * components/settings/ — tránh luồn chục prop qua nhiều tầng chỉ để lấy `settings`.
 */

import { Zap, ShieldCheck, Ban } from 'lucide-react';
import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useAppStore } from '@/lib/store';
import { SectionLoading } from '@/components/settings/section-loading';

const ToolPermissionsTable = dynamic(() => import('@/components/tool-permissions-table').then((m) => m.ToolPermissionsTable), { ssr: false, loading: SectionLoading });
const AuditViewerDialog = dynamic(() => import('@/components/audit-viewer-dialog').then((m) => m.AuditViewerDialog), { ssr: false });
const McpToolGrantsPanel = dynamic(() => import('@/components/mcp/tool-grants-panel').then((m) => m.McpToolGrantsPanel), { ssr: false, loading: SectionLoading });

export function SafetyTab() {
  const [isAuditViewerOpen, setIsAuditViewerOpen] = useState(false);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const policy = settings.approvalPolicy ?? (settings.autoPilot ? 'smart' : 'always');
  const chatOnly = policy === 'chat_only';

  return (
    <>
      <div className="border-b border-subtle pb-2">
        <h3 className="text-read font-semibold text-primary">Quyền &amp; An toàn</h3>
        <p className="mt-0.5 text-meta text-tertiary">
          Kiểm soát mức độ tự chủ của Agent, chính sách phê duyệt và giới hạn công cụ.
        </p>
      </div>

      {/* Chế độ phê duyệt chính */}
      <div className="settings-card settings-card-body">
        <h4 className="field-label text-read">
          <span className="flex items-center gap-2">
            <Zap size={14} className="text-warning" />
            <label htmlFor="approval-policy">Chế độ phê duyệt (Approval Policy)</label>
          </span>
        </h4>
        <select
          id="approval-policy"
          value={policy}
          onChange={(e) => {
            updateSettings({ approvalPolicy: e.target.value as typeof policy });
          }}
          className="field w-full"
        >
          <option value="smart">Smart (Thông minh — mặc định) — tự duyệt đọc &amp; safe shell, hỏi khi ghi/destructive</option>
          <option value="never">Autonomous (Tự chủ / YOLO) — tự duyệt tất cả trừ lệnh cấm</option>
          <option value="always">Manual (Thủ công) — luôn hỏi phê duyệt trước khi chạy bất kỳ tool nào</option>
          <option value="chat_only">Chat Only (Chỉ chat) — vô hiệu hoàn toàn toàn bộ công cụ (kể cả fs_read)</option>
        </select>
        <p className="field-hint">
          {policy === 'smart' &&
            'Read-only tools và safe commands (npm test, git status…) tự động duyệt. Write/destructive vẫn hỏi.'}
          {policy === 'never' &&
            'Tất cả tool calls tự động duyệt TRỪ lệnh luôn-chặn (rm -rf /, mkfs, shutdown…). Khuyên dùng kèm Staging Sandbox.'}
          {policy === 'always' &&
            'Luôn hỏi trước khi chạy bất kỳ tool nào. Tương đương Manual mode.'}
          {chatOnly &&
            'Vô hiệu hoàn toàn tất cả công cụ (kể cả fs_read). AI chỉ trả lời bằng kiến thức văn bản.'}
        </p>
      </div>

      {chatOnly ? (
        /*
         * Chat Only vô hiệu hoá TOÀN BỘ công cụ, nên năm mục dưới đây —
         * sandbox staging, bảng phân quyền, quyền MCP, Code Mode và đường tool
         * giả lập — không còn tác dụng. Trước đây chúng bị ẩn đi lặng lẽ, người
         * dùng không có cách nào biết là mình đang bỏ rơi cấu hình đó. Nay hiện
         * đúng MỘT thông báo nói rõ chúng bị vô hiệu và giá trị vẫn được giữ.
         */
        <div className="notice-warn" role="status">
          <div className="flex items-start gap-2">
            <Ban size={14} className="mt-0.5 flex-shrink-0" />
            <div className="space-y-1.5">
              <p className="font-semibold">
                Chat Only đang TẮT toàn bộ công cụ — 5 mục dưới đây không có tác dụng
              </p>
              <p className="text-ui leading-relaxed text-secondary">
                Staging Sandbox, Bảng phân quyền từng công cụ, Quyền MCP động, Code Mode và
                Đường tool giả lập đều bị ẩn vì không có gì để phê duyệt. Cấu hình của chúng
                <strong className="text-primary"> vẫn được giữ nguyên</strong> — chọn lại chế độ
                khác ở ô trên là chúng có hiệu lực trở lại, không mất gì.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Staging sandbox */}
          <label
            htmlFor="staging-sandbox-toggle"
            className="flex cursor-pointer items-start justify-between gap-3"
          >
            <span className="min-w-0">
              <span className="field-label block">
                Staging Sandbox (review batch trước khi ghi đĩa)
              </span>
              <span className="mt-0.5 block text-meta leading-relaxed text-tertiary">
                Agent ghi thay đổi vào bộ đệm thay vì đĩa. Bạn review toàn bộ diff rồi bấm
                Apply để ghi thật hoặc Reject để hủy.
              </span>
            </span>
            <input
              id="staging-sandbox-toggle"
              type="checkbox"
              checked={settings.stagingSandbox ?? true}
              onChange={(e) => updateSettings({ stagingSandbox: e.target.checked })}
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full accent-accent"
            />
          </label>

          {/* Bảng phân quyền chi tiết per-tool (thu gọn mặc định) */}
          <details className="settings-card">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-ui font-semibold text-primary transition-colors hover:bg-raised">
              <span>Bảng phân quyền chi tiết từng công cụ (Per-Tool Permissions)</span>
              <span className="text-micro text-tertiary">bấm để mở rộng</span>
            </summary>
            <div className="border-t border-subtle p-4">
              <p className="mb-3 text-meta leading-relaxed text-tertiary">
                Cấu hình quyền Tự duyệt (auto), Luôn hỏi (ask) hoặc Chặn (deny) cho từng tool
                độc lập.
              </p>
              <ToolPermissionsTable />
            </div>
          </details>

          {/* Quản trị cấp quyền MCP động */}
          <McpToolGrantsPanel />

          {/* Code Mode */}
          <label
            htmlFor="code-mode-toggle"
            className="flex cursor-pointer items-start justify-between gap-3"
          >
            <span className="min-w-0">
              <span className="field-label block">
                Code Mode (Thực thi JS gọi MCP on-demand)
              </span>
              <span className="mt-0.5 block text-meta leading-relaxed text-tertiary">
                Cung cấp công cụ <code className="claude-inline-code">run_code</code> cho phép
                model viết script JavaScript thực thi trong Node bridge để gọi công cụ MCP mà
                không cần nạp từng tool riêng lẻ vào context.
              </span>
            </span>
            <input
              id="code-mode-toggle"
              type="checkbox"
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full accent-accent"
              checked={settings.codeModeEnabled ?? false}
              onChange={(e) => updateSettings({ codeModeEnabled: e.target.checked })}
            />
          </label>

          {/* Đường tool giả lập */}
          <label
            htmlFor="force-emulated-tools"
            className="flex cursor-pointer items-start justify-between gap-3"
          >
            <span className="min-w-0">
              <span className="field-label block">
                Đường tool giả lập (provider không hỗ trợ function calling)
              </span>
              <span className="mt-0.5 block text-meta leading-relaxed text-tertiary">
                Bật khi model cố gọi công cụ nhưng JSON rò rỉ ra văn bản câu trả lời (gateway bỏ
                qua tham số tools).
              </span>
            </span>
            <input
              id="force-emulated-tools"
              type="checkbox"
              checked={settings.forceEmulatedTools ?? false}
              onChange={(e) => updateSettings({ forceEmulatedTools: e.target.checked })}
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full accent-accent"
            />
          </label>
        </>
      )}

      {/* Nhật ký kiểm toán an toàn (Tamper-Evident Audit Log) — luôn hiện:
          đọc log không cần bất kỳ công cụ nào chạy. */}
      <div className="settings-card flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="field-label flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-success" />
            <span>Nhật ký kiểm toán an toàn (Tamper-Evident Audit Log)</span>
          </div>
          <p className="mt-0.5 text-meta leading-relaxed text-tertiary">
            Xem lịch sử phê duyệt, can thiệp đĩa và lệnh shell gắn chuỗi băm SHA-256 đối soát
            với anchor đĩa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsAuditViewerOpen(true)}
          className="btn-secondary flex-shrink-0 px-3 py-1.5"
        >
          Mở Nhật ký Kiểm toán
        </button>
      </div>

      <AuditViewerDialog
        isOpen={isAuditViewerOpen}
        onClose={() => setIsAuditViewerOpen(false)}
      />
    </>
  );
}
