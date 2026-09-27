'use client';

/**
 * Giao diện Quản lý Lịch chạy Recipe (P2-9 Scheduler).
 *
 * Cho phép người dùng:
 * - Tạo / Sửa / Bật / Tắt (Pause) / Chạy ngay (Run now) các lịch trình.
 * - Xem biểu thức cron và câu giải nghĩa tiếng Việt kèm thời điểm chạy kế tiếp.
 * - Xem trạng thái lần chạy cuối cùng (thành công/lỗi/đang chạy).
 * - Xem danh sách các phiên chat (session) do lịch trình sinh ra và bấm để mở xem kết quả.
 */

import React, { useState, useId } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calendar,
  Clock,
  Play,
  Pause,
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { db, type ScheduleRecord, type ScheduleStatus } from '@/lib/db';
import { isValidCron, describeCron, getNextCronRun } from '@/lib/scheduler/cron';
import { vyenDesktop } from '@/lib/desktop-bridge';
import { useAppStore } from '@/lib/store';

const CRON_PRESETS = [
  { label: 'Mỗi 5 phút', cron: '*/5 * * * *' },
  { label: 'Mỗi 15 phút', cron: '*/15 * * * *' },
  { label: 'Mỗi giờ', cron: '0 * * * *' },
  { label: 'Hàng ngày 09:00', cron: '0 9 * * *' },
  { label: 'Thứ 2-6 09:00', cron: '0 9 * * 1-5' },
];

async function toggleScheduleRecord(s: ScheduleRecord): Promise<void> {
  // (giữ nguyên phần thân hàm bên dưới)
  const updated: ScheduleRecord = {
    ...s,
    enabled: !s.enabled,
    updatedAt: Date.now(),
  };
  await db.schedules.put(updated);
  void vyenDesktop()?.scheduler?.toggle(s.id, updated.enabled);
}

async function executeScheduleTrigger(s: ScheduleRecord): Promise<void> {
  const now = Date.now();
  try {
    // 1. Cập nhật trạng thái running trên Dexie
    await db.schedules.update(s.id, { lastStatus: 'running', updatedAt: now });

    // 2. Chạy qua desktop bridge nếu có
    const bridge = vyenDesktop();
    if (bridge?.scheduler?.runNow) {
      const res = await bridge.scheduler.runNow(s.id);
      if (res.sessionId) {
        const sessions = s.sessions || [];
        if (!sessions.includes(res.sessionId)) {
          sessions.unshift(res.sessionId);
        }
        await db.schedules.update(s.id, {
          lastStatus: res.ok ? 'success' : 'failure',
          lastRunAt: Date.now(),
          lastError: res.error,
          sessions: sessions.slice(0, 50),
          updatedAt: Date.now(),
        });
      }
    } else {
      // Mô phỏng / fallback trên Web
      const simSessionId = `sched-${s.id.slice(0, 6)}-${Date.now()}`;
      const sessions = s.sessions || [];
      sessions.unshift(simSessionId);
      await db.schedules.update(s.id, {
        lastStatus: 'success',
        lastRunAt: Date.now(),
        sessions: sessions.slice(0, 50),
        updatedAt: Date.now(),
      });
    }
  } catch (err: any) {
    await db.schedules.update(s.id, {
      lastStatus: 'failure',
      lastError: err?.message || String(err),
      lastRunAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
}

export function SchedulerPanel() {
  const schedules = useLiveQuery(() => db.schedules.orderBy('updatedAt').reverse().toArray(), [], []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), [], []);
  const setCurrentChatId = useAppStore((s) => s.setCurrentChatId);

  const [isEditing, setIsEditing] = useState(false);
  /*
   * Kill-switch toàn cục (S3/B5): dừng mọi lịch headless. Không có state này,
   * mọi "trần ngân sách" chỉ chạy được khi scheduler đang bật — cần một nút
   * dừng khẩn cấp để người dùng cắt ngay khi nghi lịch đang làm hỏng việc.
   * Sentinel file do bridge quản lý (`.vyen/scheduler-paused`).
   *
   * `null` = CHƯA BIẾT. Bridge chỉ có `setKillSwitch` (lib/desktop-bridge.ts),
   * không có getter — daemon còn tự dừng vì phiên trước thì mở Cài đặt ra ta
   * không có cách nào biết. Trước đây state là `false` cứng nên UI luôn bảo
   * "Scheduler đang hoạt động" — sai. Nay null hiện đúng sự thật là không đọc
   * được, và nút mặc định hành động theo hướng AN TOÀN (dừng).
   */
  const [killSwitch, setKillSwitch] = useState<boolean | null>(null);
  const [killSwitchBusy, setKillSwitchBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState('');
  const [recipeName, setRecipeName] = useState('');
  const [cronExpr, setCronExpr] = useState('*/5 * * * *');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedSessionsId, setExpandedSessionsId] = useState<string | null>(null);

  const recipeSelectId = useId();
  const cronInputId = useId();

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setRecipeId('');
    setRecipeName('');
    setCronExpr('*/5 * * * *');
    setErrorMessage(null);
  };

  const handleStartCreate = () => {
    resetForm();
    if (recipes && recipes.length > 0) {
      setRecipeId(recipes[0].id);
      setRecipeName(recipes[0].title);
    }
    setIsEditing(true);
  };

  const handleStartEdit = (s: ScheduleRecord) => {
    setEditingId(s.id);
    setRecipeId(s.recipeId);
    setRecipeName(s.recipeName || s.recipeId);
    setCronExpr(s.cron);
    setErrorMessage(null);
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidCron(cronExpr)) {
      setErrorMessage('Biểu thức cron không hợp lệ. Vui lòng kiểm tra lại 5 trường.');
      return;
    }

    const selectedRecipe = recipes?.find((r) => r.id === recipeId);
    const finalRecipeName = selectedRecipe ? selectedRecipe.title : recipeName || recipeId || 'Tác vụ';

    const now = Date.now();
    const item: ScheduleRecord = {
      id: editingId || `sched-${now}-${Math.random().toString(36).slice(2, 7)}`,
      recipeId: recipeId || 'default',
      recipeName: finalRecipeName,
      cron: cronExpr.trim(),
      enabled: true,
      sessions: editingId ? (schedules?.find((s) => s.id === editingId)?.sessions || []) : [],
      createdAt: editingId ? (schedules?.find((s) => s.id === editingId)?.createdAt || now) : now,
      updatedAt: now,
    };

    try {
      await db.schedules.put(item);
      // Đồng bộ sang bridge daemon nếu có
      void vyenDesktop()?.scheduler?.save(item);
      resetForm();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể lưu lịch trình.');
    }
  };

  const handleToggle = (s: ScheduleRecord) => {
    void toggleScheduleRecord(s);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa lịch trình này?')) return;
    await db.schedules.delete(id);
    void vyenDesktop()?.scheduler?.delete(id);
  };

  const handleRunNow = async (s: ScheduleRecord) => {
    setRunningId(s.id);
    try {
      await executeScheduleTrigger(s);
    } finally {
      setRunningId(null);
    }
  };

  const renderStatusBadge = (status?: ScheduleStatus, error?: string) => {
    const tone: Record<
      'running' | 'success' | 'failure' | 'idle',
      { className: string; icon: React.ReactNode; label: string }
    > = {
      running: {
        className: 'border border-warning/40 bg-warning/10 text-warning',
        icon: <Loader2 size={12} className="animate-spin" />,
        label: 'Đang chạy',
      },
      success: {
        className: 'border border-success/40 bg-success/10 text-success',
        icon: <CheckCircle2 size={12} />,
        label: 'Thành công',
      },
      failure: {
        className: 'border border-danger/40 bg-danger/10 text-danger',
        icon: <AlertCircle size={12} />,
        label: 'Lỗi',
      },
      idle: {
        className: 'border border-subtle bg-raised text-tertiary',
        icon: null,
        label: 'Chưa chạy',
      },
    };
    const t = tone[status ?? 'idle'];
    return (
      <span className={`inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-meta font-medium ${t.className}`} title={error}>
        {t.icon}
        {t.label}
      </span>
    );
  };

  return (
    <div className="space-y-4 font-mono text-ui">
      <div className="flex items-center justify-between border-b border-subtle pb-3">
        <div>
          <h3 className="text-read font-semibold text-primary">Lịch chạy Recipe (Scheduler)</h3>
          <p className="mt-0.5 text-meta text-tertiary">
            Tự động thực thi các workflow recipe theo biểu thức cron định kỳ.
          </p>
        </div>
        {!isEditing && (
          <button type="button" onClick={handleStartCreate} className="btn-primary py-1">
            <Plus size={13} />
            <span>Thêm lịch mới</span>
          </button>
        )}
      </div>

      {/*
       * Dừng khẩn cấp toàn bộ lịch. Khi BẬT, mọi tick bị bỏ trống và
       * `executeScheduledRun` từ chối ở cửa — kể cả lệnh "Run now" thủ công.
       */}
      <div className="settings-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="field-label flex items-center gap-1.5">
            {killSwitch === false ? (
              <CheckCircle2 size={13} className="text-success" />
            ) : (
              <AlertCircle size={13} className={killSwitch === true ? 'text-danger' : 'text-warning'} />
            )}
            <span>
              {killSwitch === null
                ? 'Scheduler: KHÔNG ĐỌC ĐƯỢC trạng thái'
                : killSwitch
                  ? 'Scheduler đang tạm dừng'
                  : 'Scheduler đang hoạt động'}
            </span>
          </div>
          <p className="mt-0.5 text-meta leading-relaxed text-tertiary">
            {killSwitch === null
              ? 'Bridge không có lệnh đọc trạng thái kill-switch, nên lần mở Cài đặt này Vyen không biết scheduler đang chạy hay đã bị dừng từ trước. Bấm "Dừng khẩn cấp" để chắc chắn không lịch nào chạy.'
              : killSwitch
                ? 'Không lịch nào chạy, kể cả Run now. Bật lại để tiếp tục cron.'
                : 'Có thể dừng khẩn cấp mọi lịch khi nghi một job đang chạy lỗi.'}
          </p>
        </div>
        <button
          type="button"
          disabled={killSwitchBusy}
          onClick={async () => {
            const bridge = vyenDesktop();
            if (!bridge?.scheduler?.setKillSwitch) {
              setErrorMessage('Kill-switch chỉ hoạt động trong Vyen desktop (Electron).');
              return;
            }
            setKillSwitchBusy(true);
            // Chưa biết thì dừng — hành động mặc định phải là hướng an toàn.
            const next = killSwitch !== true;
            try {
              const res = await bridge.scheduler.setKillSwitch(next);
              setKillSwitch(Boolean(res?.paused ?? next));
            } catch {
              // Bridge lỗi: giữ trạng thái cũ, không giả vờ đã bật/tắt.
              setErrorMessage('Không bật/tắt được kill-switch — bridge trả lỗi.');
            } finally {
              setKillSwitchBusy(false);
            }
          }}
          className={`btn-secondary flex-shrink-0 ${killSwitch === true ? '' : 'border-danger text-danger'}`}
        >
          {killSwitchBusy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : killSwitch === true ? (
            <Play size={13} />
          ) : (
            <Pause size={13} />
          )}
          <span>{killSwitch === true ? 'Tiếp tục' : 'Dừng khẩn cấp'}</span>
        </button>
      </div>

      {isEditing && (
        <form onSubmit={handleSave} className="settings-card space-y-3 px-4 py-3.5">
          <div className="flex items-center justify-between">
            <h4 className="field-label">
              {editingId ? 'Sửa lịch trình' : 'Tạo lịch trình mới'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="text-meta text-tertiary hover:text-primary"
            >
              Hủy
            </button>
          </div>

          <div>
            <label htmlFor={recipeSelectId} className="field-label mb-1 block">
              Recipe cần chạy
            </label>
            {recipes && recipes.length > 0 ? (
              <select
                id={recipeSelectId}
                value={recipeId}
                onChange={(e) => {
                  setRecipeId(e.target.value);
                  const found = recipes.find((r) => r.id === e.target.value);
                  if (found) setRecipeName(found.title);
                }}
                className="field w-full"
              >
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={recipeSelectId}
                type="text"
                placeholder="Tên recipe hoặc file (vd: tóm tắt git log)"
                value={recipeName}
                onChange={(e) => {
                  setRecipeName(e.target.value);
                  setRecipeId(e.target.value);
                }}
                className="field w-full"
                required
              />
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor={cronInputId} className="field-label">
                Biểu thức Cron (5 trường)
              </label>
              <span className="text-meta text-tertiary">
                {isValidCron(cronExpr) ? describeCron(cronExpr) : 'Cú pháp không hợp lệ'}
              </span>
            </div>
            <input
              id={cronInputId}
              type="text"
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="*/5 * * * *"
              aria-invalid={!isValidCron(cronExpr)}
              className={`field w-full ${isValidCron(cronExpr) ? '' : 'border-danger bg-danger/10'}`}
              required
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.cron}
                  type="button"
                  onClick={() => setCronExpr(p.cron)}
                  className="btn-secondary px-2 py-0.5 text-micro text-tertiary"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {isValidCron(cronExpr) && (
            <div className="flex items-center gap-1.5 text-meta text-tertiary">
              <Clock size={12} className="text-accent" />
              <span>
                Lần chạy kế tiếp:{' '}
                {getNextCronRun(cronExpr)?.toLocaleString('vi-VN') || 'Không tìm thấy mốc kế tiếp'}
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="notice-error flex items-center gap-1.5 text-meta" role="alert">
              <AlertCircle size={13} className="flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={resetForm} className="btn-secondary">
              Hủy
            </button>
            <button type="submit" className="btn-primary">
              Lưu lịch trình
            </button>
          </div>
        </form>
      )}

      {/* Danh sách Schedule */}
      <div className="space-y-2">
        {(!schedules || schedules.length === 0) && !isEditing && (
          <div className="rounded-none border border-dashed border-default bg-surface p-6 text-center text-tertiary">
            <Calendar size={24} className="mx-auto mb-2 text-tertiary" />
            <p>Chưa có lịch trình nào được tạo.</p>
            <button
              type="button"
              onClick={handleStartCreate}
              className="btn-secondary mt-2 px-2.5 py-1"
            >
              <Plus size={12} />
              <span>Tạo lịch đầu tiên</span>
            </button>
          </div>
        )}

        {schedules?.map((s) => (
          <div
            key={s.id}
            className={`rounded-none border p-3 transition ${
              s.enabled
                ? 'border-subtle bg-raised hover:border-default'
                : 'border-subtle bg-surface opacity-60'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-primary">
                    {s.recipeName || s.recipeId}
                  </span>
                  {renderStatusBadge(s.lastStatus, s.lastError)}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-tertiary">
                  <span className="rounded-none border border-subtle bg-sunken px-1.5 py-0.5 font-mono text-primary">
                    {s.cron}
                  </span>
                  <span>{describeCron(s.cron)}</span>
                  {s.lastRunAt && (
                    <span>Lần chạy cuối: {new Date(s.lastRunAt).toLocaleString('vi-VN')}</span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleRunNow(s)}
                  disabled={runningId === s.id}
                  title="Chạy ngay bây giờ"
                  aria-label={`Chạy ngay ${s.recipeName || s.recipeId}`}
                  className="icon-btn icon-btn-sm border border-subtle"
                >
                  {runningId === s.id ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Play size={13} aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleToggle(s)}
                  title={s.enabled ? 'Tạm dừng (Pause)' : 'Kích hoạt (Resume)'}
                  aria-label={
                    s.enabled
                      ? `Tạm dừng ${s.recipeName || s.recipeId}`
                      : `Kích hoạt ${s.recipeName || s.recipeId}`
                  }
                  className="icon-btn icon-btn-sm border border-subtle"
                >
                  {s.enabled ? (
                    <Pause size={13} aria-hidden="true" />
                  ) : (
                    <Play size={13} className="text-success" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleStartEdit(s)}
                  title="Chỉnh sửa"
                  aria-label={`Chỉnh sửa ${s.recipeName || s.recipeId}`}
                  className="icon-btn icon-btn-sm border border-subtle"
                >
                  <Pencil size={13} aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  title="Xóa lịch trình"
                  aria-label={`Xóa lịch trình ${s.recipeName || s.recipeId}`}
                  className="icon-btn icon-btn-sm icon-btn-danger border border-subtle"
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Danh sách Sessions sinh ra */}
            {s.sessions && s.sessions.length > 0 && (
              <div className="mt-2 border-t border-subtle pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSessionsId(expandedSessionsId === s.id ? null : s.id)
                  }
                  className="flex items-center gap-1 text-micro text-tertiary hover:text-primary"
                >
                  {expandedSessionsId === s.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  <span className="tabular-nums">{s.sessions.length} phiên đã sinh ra</span>
                </button>

                {expandedSessionsId === s.id && (
                  <div className="mt-1.5 max-h-28 space-y-1 overflow-y-auto pr-1">
                    {s.sessions.map((sessId) => (
                      <div
                        key={sessId}
                        className="flex items-center justify-between rounded-none border border-subtle bg-sunken px-2 py-1 text-meta text-primary"
                      >
                        <span className="truncate">{sessId}</span>
                        <button
                          type="button"
                          onClick={() => setCurrentChatId(sessId)}
                          className="flex flex-shrink-0 items-center gap-1 text-micro text-accent hover:underline"
                        >
                          <span>Mở phiên</span>
                          <ExternalLink size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
