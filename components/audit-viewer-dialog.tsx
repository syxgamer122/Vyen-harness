'use client';

/**
 * AuditViewerDialog — Giao diện trực quan hóa và kiểm tra toàn vẹn nhật ký kiểm toán (Tamper-Evident Hash Chain).
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db, StoredAuditLogEntry } from '@/lib/db';
import { verifyChain, ChainVerificationResult } from '@/lib/audit-log';
import { Z_CLASS } from '@/lib/ui-z';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';
import { ShieldCheck, ShieldAlert, AlertTriangle, RefreshCw, X, Search, Link2, CheckCircle2, Lock } from 'lucide-react';

/*
 * ---------------------------------------------------------------------------
 * GIÁ TRỊ THẬT CỦA `action` — danh sách bộ lọc phải khớp dữ liệu
 * ---------------------------------------------------------------------------
 * `AuditActionType` kết thúc bằng `| string`, nên union KHÔNG bắt được sai
 * sót ở compile time. Trước đây `<select>` ở đây liệt kê TÊN TOOL
 * (fs_write, fs_edit, shell_run, code_patch, mcp_call) trong khi cột `action`
 * ghi ra là loại sự kiện — chọn bất kỳ giá trị nào cũng ra "không có bản
 * ghi", y hệt một nhật ký sạch. Bảy dòng dưới là kết quả grep mọi call site
 * của `recordAuditLog` (core/agent-runtime/tool-runner.ts,
 * react/use-chat-orchestration.ts, lib/auto-pilot.ts):
 *
 *   approval · rejection · file_modification · shell_execution
 *   · taint_ingested · auto_approval
 *
 * `auto_approval` chưa có call site nào ghi, nhưng nó nằm trong union và trong
 * doc của lib/audit-log.ts — giữ lại để nhật ký cũ / ghi từ tiến trình main
 * không biến mất khỏi danh sách.
 */
const ACTION_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'approval', label: 'approval — phê duyệt' },
  { value: 'rejection', label: 'rejection — từ chối' },
  { value: 'file_modification', label: 'file_modification — sửa file' },
  { value: 'shell_execution', label: 'shell_execution — chạy lệnh' },
  { value: 'auto_approval', label: 'auto_approval — duyệt tự động' },
  { value: 'taint_ingested', label: 'taint_ingested — nạp dữ liệu bị nhiễm' },
];

/** Bảng màu quyết định — `decision` là enum, nên đổi màu ở đây là đủ. */
function decisionTone(decision: string): string {
  if (decision === 'approved' || decision === 'auto_approved') return 'border-success/40 bg-success/10 text-success';
  if (decision === 'rejected' || decision === 'blocked') return 'border-danger/40 bg-danger/10 text-danger';
  return 'border-warning/40 bg-warning/10 text-warning';
}

export type AuditVerificationState =
  | { status: 'IDLE' }
  | { status: 'VERIFYING'; progress: number }
  | { status: 'VALID'; totalRecords: number; headSeq: number; anchorVerified: boolean }
  | { status: 'PARTIAL_PRUNED'; prunedBeforeSeq: number; headSeq: number; anchorVerified: boolean }
  | { status: 'TAMPERED'; brokenSeq: number; expectedHash?: string; actualHash?: string; reason?: string }
  | { status: 'ANCHOR_MISMATCH'; memoryHeadHash: string; diskAnchorHash: string };

export interface AuditViewerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  chatIdFilter?: string;
}

/** Số bản ghi hiển thị trong bảng (verify vẫn quét TOÀN BỘ chuỗi). */
const TABLE_LIMIT = 150;

export function AuditViewerDialog({ isOpen, onClose, chatIdFilter }: AuditViewerDialogProps) {
  const [logs, setLogs] = useState<StoredAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [verifyState, setVerifyState] = useState<AuditVerificationState>({ status: 'IDLE' });
  const containerRef = useRef<HTMLDivElement>(null);

  // Nạp 150 bản ghi gần nhất từ IndexedDB
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const records = await db.auditLogs.orderBy('seq').reverse().limit(TABLE_LIMIT).toArray();
      setLogs(records);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
      setVerifyState({ status: 'IDLE' });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setSearchQuery('');
  }, [isOpen]);

  useFocusTrap(containerRef, { active: isOpen, onEscape: onClose });

  /*
   * `verifyChain` là async nhưng thân vòng lặp của nó là CPU thuần (băm lại từng
   * bản ghi) và không có `await` nào giữa các lần lặp — nên nó CHẶN main
   * thread một lần liên tục. Ta không sửa lib/audit-log.ts, nên không thể cắt
   * vòng lặp đó ra; thứ duy nhất còn lại là không hứa hẹn điều ta không làm
   * được. Thanh tiến trình dưới đây vì vậy báo TIẾN ĐỘ THẬT của hai mốc ta
   * đo được (đọc xong / băm xong), thay vì nhảy 10 → 50 → 85 rồi đứng yên.
   */
  const handleVerifyChain = async () => {
    setVerifyState({ status: 'VERIFYING', progress: 5 });

    try {
      // Cho phép UI render spinner
      await new Promise((r) => setTimeout(r, 50));

      const allRecords = await db.auditLogs.orderBy('seq').toArray();
      setVerifyState({ status: 'VERIFYING', progress: 20 });

      const result: ChainVerificationResult = await verifyChain(allRecords);
      setVerifyState({ status: 'VERIFYING', progress: 90 });

      // So khớp với disk anchor nếu có desktop bridge
      let diskAnchorVerified = false;
      try {
        const bridge = (window as unknown as { vyenBridge?: { audit?: { getAnchor?: () => Promise<{ headHash: string } | null> } } }).vyenBridge;
        if (bridge?.audit?.getAnchor) {
          const anchor = await bridge.audit.getAnchor();
          const headHash = allRecords.length > 0 ? allRecords[allRecords.length - 1].hash : null;
          if (anchor && headHash) {
            if (anchor.headHash !== headHash) {
              setVerifyState({
                status: 'ANCHOR_MISMATCH',
                memoryHeadHash: headHash,
                diskAnchorHash: anchor.headHash,
              });
              return;
            }
            diskAnchorVerified = true;
          }
        }
      } catch {
        // Môi trường browser web thuần
      }

      if (!result.valid) {
        setVerifyState({
          status: 'TAMPERED',
          brokenSeq: result.brokenSeq ?? 0,
          reason: result.reason,
        });
        return;
      }

      const headSeq = allRecords.length > 0 ? allRecords[allRecords.length - 1].seq : 0;
      if (result.partialChain) {
        setVerifyState({
          status: 'PARTIAL_PRUNED',
          prunedBeforeSeq: result.prunedBeforeSeq ?? 1,
          headSeq,
          anchorVerified: diskAnchorVerified,
        });
      } else {
        setVerifyState({
          status: 'VALID',
          totalRecords: result.totalChecked,
          headSeq,
          anchorVerified: diskAnchorVerified,
        });
      }
    } catch (err) {
      setVerifyState({
        status: 'TAMPERED',
        brokenSeq: 0,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (chatIdFilter && log.chatId && log.chatId !== chatIdFilter) return false;
      if (filterAction !== 'all' && log.action !== filterAction) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchTool = log.tool?.toLowerCase().includes(q);
        const matchTarget = log.target?.toLowerCase().includes(q);
        const matchHash = log.hash?.toLowerCase().includes(q);
        if (!matchTool && !matchTarget && !matchHash) return false;
      }
      return true;
    });
  }, [logs, chatIdFilter, filterAction, searchQuery]);

  if (!isOpen || typeof document === 'undefined') return null;

  /*
   * Portal ra `document.body`: hộp này mở TỪ TRONG tab An toàn của hộp Cài đặt,
   * mà `.glass-panel` của hộp Cài đặt có `backdrop-filter` — thứ tạo stacking
   * context riêng. Render tại chỗ thì `Z_CLASS.navigation` (90) được phân giải
   * TRONG context của cha, nên hộp này không thể nổi lên trên chính bảng điều
   * hướng đã mở nó. Ra body thì 90 là 90 thật, toàn cục.
   */
  return createPortal(
    <div
      className={`fixed inset-0 ${Z_CLASS.navigation} flex items-center justify-center bg-sunken/75 p-4`}
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-viewer-title"
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden lift-lg rounded-2xl border border-default bg-overlay font-mono shadow-lift-lg animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle bg-raised px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Lock size={16} className="flex-none text-info" />
            <h2 id="audit-viewer-title" className="truncate font-sans text-ui font-semibold text-primary">
              Nhật Ký Kiểm Toán Toàn Vẹn (Tamper-Evident Audit Chain)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng nhật ký kiểm toán"
            className="flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-subtle bg-raised text-secondary transition-colors hover:border-strong hover:bg-overlay hover:text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Verification Status Banner */}
        <div className="border-b border-subtle bg-base px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2 font-sans text-ui">
              {verifyState.status === 'IDLE' && (
                <span className="flex items-center gap-1.5 text-secondary">
                  <ShieldCheck size={14} className="flex-none text-success" /> Chưa chạy kiểm tra toàn vẹn chuỗi hash.
                </span>
              )}
              {verifyState.status === 'VERIFYING' && (
                <span className="flex min-w-0 items-center gap-1.5 text-info">
                  <RefreshCw size={14} className="flex-none animate-spin" />
                  <span>Đang kiểm tra mã băm SHA-256 ({verifyState.progress}%)…</span>
                  {/* Thanh đo được, không phải thanh giả. */}
                  <span className="h-1 w-24 flex-none bg-sunken" aria-hidden="true">
                    <span className="block h-1 bg-info" style={{ width: `${verifyState.progress}%` }} />
                  </span>
                </span>
              )}
              {verifyState.status === 'VALID' && (
                <span className="flex items-center gap-1.5 font-medium text-success">
                  <CheckCircle2 size={14} className="flex-none" /> Chuỗi băm hợp lệ tuyệt đối (100% {verifyState.totalRecords} bản ghi từ genesis tới seq #{verifyState.headSeq}).
                </span>
              )}
              {verifyState.status === 'PARTIAL_PRUNED' && (
                <span className="flex items-center gap-1.5 font-medium text-warning">
                  <AlertTriangle size={14} className="flex-none" /> Chuỗi hợp lệ (đã dọn bớt trước seq #{verifyState.prunedBeforeSeq}; phần còn lại tới seq #{verifyState.headSeq} nguyên vẹn).
                </span>
              )}
              {verifyState.status === 'TAMPERED' && (
                <span className="flex items-center gap-1.5 font-semibold text-danger">
                  <ShieldAlert size={14} className="flex-none" /> PHÁT HIỆN CAN THIỆP TẠI SEQ #{verifyState.brokenSeq}! {verifyState.reason}
                </span>
              )}
              {verifyState.status === 'ANCHOR_MISMATCH' && (
                <span className="flex items-center gap-1.5 font-semibold text-danger">
                  <ShieldAlert size={14} className="flex-none" /> LỆCH ANCHOR ĐĨA NGOÀI WORKSPACE! Hash bộ nhớ khác hash đĩa.
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleVerifyChain()}
              disabled={verifyState.status === 'VERIFYING'}
              className="btn-primary flex-none"
            >
              <RefreshCw size={12} className={verifyState.status === 'VERIFYING' ? 'animate-spin' : ''} />
              Xác Minh Toàn Vẹn
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 border-b border-subtle bg-raised px-4 py-3 font-sans text-ui">
          <div className="relative min-w-0 flex-1">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary" />
            <input
              type="text"
              placeholder="Tìm theo tool, file đích hoặc mã hash…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="field-sm w-full pl-7"
            />
          </div>
          <label htmlFor="audit-action-filter" className="text-meta text-tertiary">
            Hành động
          </label>
          <select
            id="audit-action-filter"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="field-sm w-auto"
          >
            <option value="all">Tất cả hành động</option>
            {ACTION_FILTERS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-sunken px-3 py-2">
          {loading ? (
            <p className="py-10 text-center font-sans text-ui text-secondary">Đang nạp nhật ký kiểm toán…</p>
          ) : filteredLogs.length === 0 ? (
            <div className="py-10 text-center font-sans text-ui text-secondary">
              <p>Không tìm thấy bản ghi kiểm toán nào phù hợp.</p>
              {/*
               * Khi đang LỌC thì "không có" là kết quả thật; khi KHÔNG lọc mà
               * vẫn rỗng thì hoặc chưa có gì, hoặc tab này không có nhật ký —
               * nói rõ để không đọc nhầm thành "nhật ký sạch".
               */}
              {filterAction === 'all' && !searchQuery && (
                <p className="mt-1 text-meta text-tertiary">
                  Nhật ký trống — mọi quyết định phê duyệt sẽ xuất hiện ở đây.
                </p>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-meta">
              <caption className="sr-only">
                Bản ghi nhật ký kiểm toán, mới nhất trước
              </caption>
              <thead>
                <tr className="border-b border-subtle font-sans font-medium text-tertiary">
                  <th scope="col" className="w-12 px-2 py-1.5">Seq</th>
                  <th scope="col" className="w-24 px-2 py-1.5">Thời gian</th>
                  <th scope="col" className="w-44 px-2 py-1.5">Hành động</th>
                  <th scope="col" className="w-28 px-2 py-1.5">Quyết định</th>
                  <th scope="col" className="px-2 py-1.5">Chi tiết / Mục tiêu</th>
                  <th scope="col" className="w-32 px-2 py-1.5">Cryptographic Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle/70">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-base">
                    <td className="px-2 py-1.5 text-tertiary">#{log.seq}</td>
                    <td className="px-2 py-1.5 text-tertiary">
                      {new Date(log.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-2 py-1.5 font-sans font-medium text-primary">{log.action}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 font-sans text-micro font-medium ${decisionTone(log.decision)}`}
                      >
                        {log.decision}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-2 py-1.5 font-sans text-secondary" title={log.target || log.tool}>
                      {log.target || log.tool}
                    </td>
                    <td className="px-2 py-1.5 text-micro text-tertiary">
                      <div className="flex items-center gap-1" title={`hash: ${log.hash}\nprev: ${log.prevHash || 'genesis'}`}>
                        <Link2 size={10} className="flex-none text-info" />
                        {/*
                         * `hash` có thể thiếu / ngắn ở chính những bản ghi hỏng mà
                         * `verifyChain` coi là can thiệp (`lib/audit-log.ts:348`) —
                         * nếu `.slice()` thẳng thì bảng NỔ lên đúng lúc người
                         * dùng cần đọc nó. Bản ghi thiếu hash hiện "—" chứ không
                         * hiện một chuỗi bịa.
                         */}
                        <span className="truncate">
                          {log.hash && log.hash.length > 8 ? `${log.hash.slice(0, 8)}…` : log.hash || '—'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
