'use client';

/**
 * McpToolGrantsPanel — Quản trị quyền MCP động, TTL và tự động phát hiện Schema Drift.
 */

import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { ShieldCheck, ShieldAlert, Trash2, RefreshCw, Clock, Key } from 'lucide-react';

export const MAX_GRANT_TTL_MS = 60 * 60 * 1000; // Trần cứng 60 phút (Red Team blind spot 3)

/** Nhịp làm mới mốc thời gian để nhãn "Còn Nm" tự trôi mà không re-render dồn. */
const TTL_TICK_MS = 30_000;

export interface McpGrantRecord {
  toolName: string;
  serverId: string;
  serverPid?: number;
  schemaHash: string;
  grantedAt: number;
  expiresAt: number;
  mode: 'always_allow' | 'always_deny';
  status: 'ACTIVE' | 'SCHEMA_MUTATED' | 'EXPIRED';
}

export function McpToolGrantsPanel() {
  const [grants, setGrants] = useState<McpGrantRecord[]>([]);
  const [loading, setLoading] = useState(false);
  /**
   * Một mốc thời gian duy nhất cho CẢ lần render, nhãn "Còn Nm" mới nhất quán
   * với nhau. Đọc `Date.now()` ở từng dòng list thì mỗi dòng một giá trị khác
   * nhau (và render lại bất cứ lúc nào) — nên render chỉ đọc mốc đã lưu,
   * còn effect mới là nơi ghi mốc mới.
   */
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TTL_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const loadGrants = async () => {
    setLoading(true);
    try {
      // Đọc từ Dexie kv table
      const stored = await db.kv.get('mcp:tool-grants');
      if (stored && Array.isArray(stored.value)) {
        const loadedAt = Date.now();
        const normalized: McpGrantRecord[] = (stored.value as McpGrantRecord[]).map((g) => {
          const hardCap = (g.grantedAt || loadedAt) + MAX_GRANT_TTL_MS;
          const cappedExpires = Math.min(g.expiresAt || hardCap, hardCap);
          const isExpired = loadedAt >= cappedExpires;
          return {
            ...g,
            expiresAt: cappedExpires,
            status: isExpired ? 'EXPIRED' : g.status,
          };
        });
        setGrants(normalized);
      } else {
        setGrants([]);
      }
    } catch (err) {
      console.error('Failed to load MCP grants:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGrants();
  }, []);

  const handleRevoke = async (toolName: string, serverId: string) => {
    const next = grants.filter((g) => !(g.toolName === toolName && g.serverId === serverId));
    setGrants(next);
    await db.kv.put({ key: 'mcp:tool-grants', value: next });
  };

  const handleRevokeAll = async () => {
    if (
      !window.confirm(
        `Thu hồi toàn bộ ${grants.length} quyền MCP đang lưu? Các công cụ này sẽ phải phê duyệt lại từ đầu.`,
      )
    )
      return;
    setGrants([]);
    await db.kv.put({ key: 'mcp:tool-grants', value: [] });
  };

  return (
    <div className="settings-card settings-card-body">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key size={14} className="flex-none text-info" aria-hidden="true" />
          <h4 className="field-label text-ui">Quyền MCP Động &amp; Schema Governance</h4>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={loadGrants}
            className="icon-btn icon-btn-sm"
            title="Làm mới"
            aria-label="Làm mới danh sách quyền MCP"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
          </button>
          {grants.length > 0 && (
            <button
              type="button"
              onClick={handleRevokeAll}
              className="btn-secondary border-danger px-2 py-0.5 text-micro text-danger hover:border-danger hover:text-danger"
            >
              Thu hồi tất cả
            </button>
          )}
        </div>
      </div>

      <p className="field-hint">
        Quản lý các quyền công cụ Model Context Protocol được cấp phép vĩnh viễn hoặc có thời hạn. Hệ thống tự động vô hiệu hóa quyền nếu cấu trúc công cụ (Schema) bị thay đổi nhằm chống tấn công Dynamic Tool Poisoning.
      </p>

      {grants.length === 0 ? (
        <p className="border border-dashed border-default bg-surface px-3 py-4 text-center text-ui text-tertiary">
          Chưa có công cụ MCP nào được lưu quyền tự động. Mọi công cụ sẽ yêu cầu phê duyệt thủ công.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {grants.map((grant) => {
            const isMutated = grant.status === 'SCHEMA_MUTATED';
            const isExpired = grant.status === 'EXPIRED' || now >= grant.expiresAt;
            const remainingMins = Math.max(0, Math.round((grant.expiresAt - now) / 60000));
            const isInvalid = isMutated || isExpired;

            return (
              <li
                key={`${grant.serverId}:${grant.toolName}`}
                className={`flex items-center justify-between border px-2 py-2 text-ui ${
                  isInvalid ? 'border-danger/40 bg-danger/5' : 'border-subtle bg-surface'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isInvalid ? (
                    <ShieldAlert size={14} className="shrink-0 text-danger" aria-hidden="true" />
                  ) : (
                    <ShieldCheck size={14} className="shrink-0 text-success" aria-hidden="true" />
                  )}
                  <div>
                    <div className="font-mono font-medium text-primary">
                      {grant.serverId}/{grant.toolName}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-micro text-tertiary">
                      <span>Hash: {grant.schemaHash.slice(0, 8)}…</span>
                      {isMutated ? (
                        <span className="font-medium text-danger">SCHEMA MUTATED — BỊ VÔ HIỆU HÓA</span>
                      ) : isExpired ? (
                        <span className="font-medium text-warning">HẾT HẠN (MAX 60M TTL)</span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Clock size={10} aria-hidden="true" /> Còn {remainingMins}p
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRevoke(grant.toolName, grant.serverId)}
                  className="icon-btn icon-btn-sm icon-btn-danger"
                  title="Thu hồi quyền này"
                  aria-label={`Thu hồi quyền ${grant.serverId}/${grant.toolName}`}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
