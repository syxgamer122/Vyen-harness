'use client';

/**
 * Settings → Ghi nhớ: reviewer gate
 *
 * Duyệt / từ chối / hoãn các đề xuất ghi nhớ do agent tạo.
 *
 * (Tách ra từ components/settings-dialog.tsx — file đó từng dài 1.668 dòng.)
 */

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertCircle,
  Ban,
  BookOpen,
  Check,
  Clock,
  FileText,
  Lightbulb,
  Ruler,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { db, MAX_MEMORY_CHARS } from '@/lib/db';
import { proposeCandidate, reviewCandidate, deleteReviewedRecord } from '@/lib/memory/store';
import type { MemoryKind } from '@/lib/memory/types';

/**
 * Icon cho từng loại ghi nhớ — SVG (Lucide), không emoji.
 *
 * Checklist `ui-ux-pro-max` hạng 4 cấm emoji làm icon: hình dáng/màu của emoji
 * do font hệ điều hành quyết định nên khác nhau giữa macOS / Windows / Linux,
 * và không theo được hệ màu accent của ứng dụng.
 */
const KIND_ICONS: Record<MemoryKind, LucideIcon> = {
  rule: Ruler,
  pattern: Wrench,
  gotcha: TriangleAlert,
  decision: Lightbulb,
  term: BookOpen,
};

/** Icon loại ghi nhớ; kind lạ (dữ liệu cũ) rơi về FileText thay vì mất icon. */
function KindGlyph({ kind }: { kind: MemoryKind }) {
  const Icon = KIND_ICONS[kind] ?? FileText;
  return <Icon size={13} aria-hidden="true" className="flex-shrink-0 text-tertiary" />;
}

export function MemoriesSection() {
  const candidates = useLiveQuery(
    () => db.memoryCandidates?.where('status').equals('pending').reverse().sortBy('createdAt'),
    [],
    [],
  );
  const records = useLiveQuery(
    () => db.memoryRecords?.reverse().sortBy('createdAt'),
    [],
    [],
  );

  const [newText, setNewText] = useState('');
  const [newKind, setNewKind] = useState<MemoryKind>('pattern');
  const [refusePromptId, setRefusePromptId] = useState<string | null>(null);
  const [refuseReason, setRefuseReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handlePropose = async () => {
    if (!newText.trim()) return;
    try {
      await proposeCandidate({
        text: newText.trim(),
        kind: newKind,
        scope: { kind: 'project', ref: 'global' },
        provenance: { threadId: 'settings' },
      });
      setNewText('');
      setError(null);
    } catch (e) {
      console.error('[memory propose]', e);
      setError('Không thể tạo candidate ghi nhớ.');
    }
  };

  const handleReview = async (id: string, action: 'remember' | 'refuse' | 'defer', reason?: string) => {
    try {
      if (action === 'refuse' && !reason?.trim()) {
        setError('Từ chối ghi nhớ bắt buộc phải có lý do cụ thể.');
        return;
      }
      await reviewCandidate(id, action, { reason: reason?.trim() });
      setRefusePromptId(null);
      setRefuseReason('');
      setError(null);
    } catch (e) {
      console.error('[memory review]', e);
      setError(e instanceof Error ? e.message : 'Lỗi khi kiểm duyệt ghi nhớ.');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="field-label text-read">
          Duyệt đề xuất ghi nhớ (Reviewer Gate)
        </h4>
        <p className="mt-0.5 text-ui leading-relaxed text-tertiary">
          Không ghi nhớ im lặng: Agent chỉ đề xuất candidate. Bạn trực tiếp duyệt (Nhớ / Từ chối / Hoãn).
          Chỉ ký ức đã duyệt mới vào Recall Pack theo ngân sách token.
        </p>
      </div>

      {error && (
        <div className="notice-error flex items-center gap-1.5" role="alert">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Review Cards for Pending Candidates */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h5 className="flex items-center gap-1.5 text-ui font-semibold text-primary">
            <Clock size={13} className="text-warning" />
            <span>Đang chờ duyệt</span>
            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-micro tabular-nums text-warning">
              {(candidates ?? []).length}
            </span>
          </h5>
        </div>

        {(candidates ?? []).length === 0 ? (
          <p className="rounded-lg border border-subtle bg-surface px-3.5 py-2.5 text-meta italic text-tertiary">
            Không có ghi nhớ nào đang chờ duyệt.
          </p>
        ) : (
          <div className="space-y-2">
            {(candidates ?? []).map((cand) => (
              <div
                key={cand.id}
                className="lift-sm rounded-lg border border-warning/40 bg-raised p-3.5 text-ui"
              >
                <div className="flex items-center justify-between gap-2 border-b border-subtle pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <KindGlyph kind={cand.kind} />
                    <span className="font-mono text-micro font-semibold uppercase tracking-wider text-primary">
                      {cand.kind}
                    </span>
                    <span className="text-tertiary" aria-hidden="true">•</span>
                    <span className="font-mono text-micro text-tertiary">
                      scope: {cand.scope.kind} ({cand.scope.ref})
                    </span>
                  </div>
                  {cand.reviewDueAt && (
                    <span className="font-mono text-micro text-warning">
                      Hạn xét: {new Date(cand.reviewDueAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div className="my-2 leading-relaxed text-primary">
                  {cand.text}
                </div>

                {refusePromptId === cand.id ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-danger/40 bg-surface p-2.5">
                    <div className="text-meta font-medium text-danger">
                      Nhập lý do từ chối (bắt buộc):
                    </div>
                    <input
                      type="text"
                      value={refuseReason}
                      onChange={(e) => setRefuseReason(e.target.value)}
                      placeholder="Ví dụ: Quy ước này không còn áp dụng / Vi phạm bảo mật"
                      className="field-sm w-full"
                      autoFocus
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setRefusePromptId(null);
                          setRefuseReason('');
                        }}
                        className="btn-secondary px-2 py-1"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReview(cand.id, 'refuse', refuseReason)}
                        className="btn-primary border-danger bg-danger px-2.5 py-1"
                      >
                        Xác nhận từ chối
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleReview(cand.id, 'defer', 'Hoãn xem xét 7 ngày')}
                      className="btn-secondary px-2 py-1 text-meta"
                    >
                      <Clock size={11} /> Hoãn
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRefusePromptId(cand.id);
                        setRefuseReason('');
                      }}
                      className="btn-secondary border-danger px-2 py-1 text-meta text-danger"
                    >
                      <Ban size={11} /> Từ chối
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReview(cand.id, 'remember')}
                      className="btn-primary border-success bg-success px-2.5 py-1"
                    >
                      <Check size={11} /> Nhớ
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Active & Reviewed Memories */}
      <div className="space-y-2">
        <h5 className="flex items-center gap-1.5 text-ui font-semibold text-primary">
          <Sparkles size={13} className="text-accent" />
          <span>Ký ức đã duyệt</span>
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-micro tabular-nums text-accent">
            {(records ?? []).length}
          </span>
        </h5>

        {(records ?? []).length === 0 ? (
          <p className="rounded-lg border border-subtle bg-surface px-3.5 py-2.5 text-meta italic text-tertiary">
            Chưa có ký ức nào được kích hoạt.
          </p>
        ) : (
          <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
            {(records ?? []).map((rec) => (
              <div
                key={rec.id}
                className="group flex items-start justify-between gap-2 rounded-lg border border-subtle bg-surface p-3 text-ui"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <KindGlyph kind={rec.kind} />
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-micro font-semibold uppercase tracking-wider ${
                        rec.status === 'active'
                          ? 'border-success/40 bg-success/10 text-success'
                          : rec.status === 'reference'
                            ? 'border-accent/40 bg-accent/10 text-accent'
                            : rec.status === 'archive'
                              ? 'border-subtle bg-raised text-tertiary'
                              : 'border-danger/40 bg-danger/10 text-danger'
                      }`}
                    >
                      {rec.status}
                    </span>
                    <span className="font-mono text-micro tabular-nums text-tertiary">
                      confirm: {rec.confirmCount}
                    </span>
                    {rec.reviewDueAt && (
                      <span className="font-mono text-micro text-tertiary">
                        • hạn: {new Date(rec.reviewDueAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="leading-relaxed text-primary">{rec.text}</div>
                  {rec.reason && (
                    <div className="font-mono text-micro italic text-danger">
                      Lý do: {rec.reason}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    // Xoá ký ức đã duyệt là mất vĩnh viễn Recall Pack — hỏi lại,
                    // đúng như các nút xoá khác trong Cài đặt.
                    if (
                      !window.confirm(
                        `Xóa ký ức này khỏi Recall Pack? Không thể hoàn tác.\n"${rec.text.slice(0, 80)}${rec.text.length > 80 ? '…' : ''}"`,
                      )
                    )
                      return;
                    void deleteReviewedRecord(rec.id);
                  }}
                  aria-label="Xóa ký ức"
                  /* Hit-area 6px (28→40px) — 6px = đúng khe `space-y-1.5` giữa hai hàng, không chồm sang nút của hàng kế. */
                  className="icon-btn icon-btn-sm icon-btn-danger relative after:absolute after:-inset-[6px] after:content-[''] opacity-60 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Propose New Memory Card */}
      <div className="space-y-2 rounded-lg border border-dashed border-default bg-surface p-4">
        <div className="flex items-center justify-between">
          <label htmlFor="memory-new-kind" className="field-label">
            Thêm đề xuất ghi nhớ mới
          </label>
          <select
            id="memory-new-kind"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as MemoryKind)}
            className="field-sm py-0.5"
          >
            {/* `<option>` không render được SVG, nên ở đây chỉ có chữ. */}
            <option value="pattern">Pattern (cách làm tốt)</option>
            <option value="rule">Rule (quy tắc bắt buộc)</option>
            <option value="gotcha">Gotcha (cạm bẫy tránh)</option>
            <option value="decision">Decision (quyết định thiết kế)</option>
            <option value="term">Term (thuật ngữ dự án)</option>
          </select>
        </div>

        <textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          rows={2}
          maxLength={MAX_MEMORY_CHARS}
          className="field-sm w-full resize-none"
          placeholder='Ví dụ: "Luôn chạy test vitest trước khi commit thay đổi"'
          aria-label="Nội dung đề xuất ghi nhớ"
        />

        <button
          type="button"
          onClick={() => void handlePropose()}
          disabled={!newText.trim()}
          className="btn-secondary w-full justify-center py-1.5"
        >
          Đề xuất ghi nhớ
        </button>
      </div>
    </div>
  );
}

