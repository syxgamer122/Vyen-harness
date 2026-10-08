'use client';

import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  ALL_CATEGORIES,
  CATEGORY_DESCRIPTIONS,
  DEFAULT_CHAINS,
  validateModelChains,
  type CategoryId,
  type ChainEntry,
} from '@/lib/routing/categories';
import { EFFORT_LEVELS, type Effort } from '@/lib/model-contracts';
import { AVAILABLE_MODELS } from '@/lib/models';
import {
  DEFAULT_MODEL_ROUTING,
  normalizeModelRoutingConfig,
  type ModelRoutingConfig,
} from '@/lib/model-routing';
import { Download, Upload, RotateCcw, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

/**
 * Ô số của `LeadWorkerRoutingSection`.
 *
 * Tách thành component riêng, không phải hàm lồng trong thân panel: bản cũ gọi
 * `useState` bên trong một hàm tên thường được gọi như hàm (không phải JSX), nên
 * state gắn với thân `LeadWorkerRoutingSection` chứ không gắn với từng ô — mỗi
 * lần bấm là cả ba ô cùng remount, mất luôn phần đang gõ dở. Là component thật
 * thì mỗi ô giữ `raw` riêng và rules-of-hooks hợp lệ.
 *
 * HTML5 `min`/`max` KHÔNG chặn gõ — người dùng vẫn nhập được 99, và `Number('')`
 * là 0 nên xoá trống một ô sẽ ghi 0 xuống store. Vì vậy:
 *   - rỗng → KHÔNG ghi (giữ nguyên giá trị đang có, ô vẫn cho phép sửa),
 *   - ngoài khoảng → ghi kèm giá trị đã kẹp về min/max để store không nhận
 *     con số vô nghĩa, đồng thời hiện viền cảnh báo cho tới lần gõ hợp lệ sau.
 */
function NumberField({
  id,
  label,
  min,
  max,
  hint,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  hint: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const parsed = raw === null ? NaN : Number(raw);
  const outOfRange =
    raw !== null && raw.trim() !== '' && Number.isFinite(parsed) && (parsed < min || parsed > max);
  return (
    <div className="flex-1">
      <label htmlFor={id} className="field-label mb-1 block">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        /* Đang sửa → hiện đúng thứ người dùng gõ; không sửa → giá trị trong store. */
        value={raw ?? String(value)}
        aria-invalid={outOfRange}
        onChange={(e) => {
          const next = e.target.value;
          setRaw(next);
          if (next.trim() === '') return; // Xoá trống: để nguyên store, không ghi 0
          const v = Number(next);
          if (!Number.isFinite(v)) return;
          onCommit(Math.min(max, Math.max(min, v)));
        }}
        onBlur={() => setRaw(null)}
        className={`field ${outOfRange ? 'border-danger bg-danger/10' : ''}`}
      />
      <p className="field-hint mt-0.5">
        {outOfRange
          ? `Ngoài khoảng ${min}–${max} — đã kẹp về ${Math.min(max, Math.max(min, parsed))}.`
          : hint}
      </p>
    </div>
  );
}

export function RoutingSettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const chains = settings.modelChains ?? DEFAULT_CHAINS;
  const [activeCat, setActiveCat] = useState<CategoryId>('architect');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const currentChain = chains[activeCat] ?? DEFAULT_CHAINS[activeCat] ?? [];

  const updateCurrentChain = (newChain: ChainEntry[]) => {
    const updated = {
      ...chains,
      [activeCat]: newChain,
    };
    updateSettings({ modelChains: updated });
  };

  const handleModelChange = (index: number, model: string) => {
    const next = [...currentChain];
    next[index] = { ...next[index], model };
    updateCurrentChain(next);
  };

  const handleEffortChange = (index: number, effort: Effort) => {
    const next = [...currentChain];
    next[index] = { ...next[index], effort };
    updateCurrentChain(next);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const next = [...currentChain];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    updateCurrentChain(next);
  };

  const handleRemove = (index: number) => {
    if (currentChain.length <= 1) return; // Giữ ít nhất 1 entry
    const next = currentChain.filter((_, i) => i !== index);
    updateCurrentChain(next);
  };

  const handleAdd = () => {
    /*
     * Mặc định phải là id CÓ THẬT trong `AVAILABLE_MODELS` — `<select>` ở dưới
     * chỉ render option từ catalog, nên một id bịa sẽ khiến hàng mới có
     * `value` không khớp option nào và trình duyệt hiển thị nhầm option đầu
     * trong khi chain thật lại trỏ sang model khác.
     */
    const next = [...currentChain, { model: AVAILABLE_MODELS[0].id, effort: 'medium' as Effort }];
    updateCurrentChain(next);
  };

  const handleResetDefaults = () => {
    if (window.confirm('Khôi phục toàn bộ cấu hình chuỗi model về mặc định ban đầu?')) {
      updateSettings({ modelChains: DEFAULT_CHAINS });
    }
  };

  const handleExportJson = () => {
    const data = JSON.stringify(chains, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model-chains.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawJson = JSON.parse(String(event.target?.result ?? '{}'));
        const validatedChains = validateModelChains(rawJson);
        updateSettings({ modelChains: validatedChains });
        setImportStatus('Nạp cấu hình JSON thành công!');
        setTimeout(() => setImportStatus(null), 3000);
      } catch (err: any) {
        setImportStatus(`Lỗi: ${err?.message ?? 'Không đọc được file'}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4 text-ui font-sans">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle pb-2.5">
        <div>
          <h3 className="text-read font-semibold text-primary">Mixture-of-Models Routing</h3>
          <p className="field-hint">
            Cấu hình chuỗi dự phòng model:effort theo từng hạng mục công việc.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleExportJson}
            title="Xuất cấu hình JSON"
            className="btn-secondary px-2 py-1"
          >
            <Download size={12} aria-hidden="true" />
            Export
          </button>
          <label className="btn-secondary cursor-pointer px-2 py-1">
            <Upload size={12} aria-hidden="true" />
            Import
            <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
          </label>
          <button
            type="button"
            onClick={handleResetDefaults}
            title="Khôi phục mặc định"
            aria-label="Khôi phục mặc định chuỗi model"
            className="icon-btn icon-btn-sm"
          >
            <RotateCcw size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      {importStatus && (
        <p className="notice border-accent/40 text-meta text-accent" role="status">
          {importStatus}
        </p>
      )}

      {/* Category selector buttons */}
      <div className="flex flex-wrap gap-1">
        {ALL_CATEGORIES.map((cat) => {
          const desc = CATEGORY_DESCRIPTIONS[cat];
          const isSelected = activeCat === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCat(cat)}
              className={
                isSelected ? 'btn-primary px-2.5 py-1' : 'btn-secondary px-2.5 py-1 text-tertiary'
              }
            >
              {desc.label}
            </button>
          );
        })}
      </div>

      {/* Active Category Description */}
      <div className="border border-subtle bg-raised p-2.5">
        <div className="mb-0.5 font-semibold text-primary">
          {CATEGORY_DESCRIPTIONS[activeCat]?.label}
        </div>
        <div className="text-meta leading-relaxed text-tertiary">
          {CATEGORY_DESCRIPTIONS[activeCat]?.description}
        </div>
      </div>

      {/* Chain list for active category */}
      <div className="space-y-2">
        <div className="text-meta font-semibold uppercase tracking-wider text-tertiary">
          Chuỗi ưu tiên (Fallback Chain) — vị trí 1 thử trước
        </div>

        {currentChain.map((entry, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 border border-subtle bg-raised p-2"
          >
            <span className="w-5 text-center font-bold text-tertiary">#{idx + 1}</span>

            {/* Model select */}
            <select
              value={entry.model}
              onChange={(e) => handleModelChange(idx, e.target.value)}
              className="field-sm flex-1"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.id})
                </option>
              ))}
            </select>

            {/* Effort select */}
            <select
              value={entry.effort}
              onChange={(e) => handleEffortChange(idx, e.target.value as Effort)}
              className="field-sm w-24"
            >
              {EFFORT_LEVELS.map((eff) => (
                <option key={eff} value={eff}>
                  {eff}
                </option>
              ))}
            </select>

            {/* Reorder & Remove buttons */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => handleMove(idx, 'up')}
                className="icon-btn icon-btn-sm"
                title="Di chuyển lên"
                aria-label={`Di chuyển model ${idx + 1} lên`}
              >
                <ArrowUp size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={idx === currentChain.length - 1}
                onClick={() => handleMove(idx, 'down')}
                className="icon-btn icon-btn-sm"
                title="Di chuyển xuống"
                aria-label={`Di chuyển model ${idx + 1} xuống`}
              >
                <ArrowDown size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={currentChain.length <= 1}
                onClick={() => handleRemove(idx)}
                className="icon-btn icon-btn-sm icon-btn-danger"
                title="Xóa model khỏi chuỗi"
                aria-label={`Xóa model khỏi chuỗi ${idx + 1}`}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={handleAdd}
          className="btn-secondary w-full py-1.5"
        >
          <Plus size={14} aria-hidden="true" />
          Thêm model dự phòng vào chuỗi
        </button>
      </div>

      <div className="border-t border-subtle pt-3">
        <LeadWorkerRoutingSection />
      </div>
    </div>
  );
}

/* ------------------ Lead/Worker routing (P1-5) ------------------ */

function RoutingModelSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (v: string) => void;
}) {
  const orphan = Boolean(value) && !options.some((o) => o.id === value);
  return (
    <div className="flex-1">
      <label htmlFor={id} className="field-label mb-1 block">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field-sm w-full"
      >
        <option value="">— Theo model chính —</option>
        {orphan && <option value={value}>{value} (không còn trong danh sách)</option>}
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} ({m.id})
          </option>
        ))}
      </select>
    </div>
  );
}

function LeadWorkerRoutingSection() {
  const modelRouting = useAppStore((s) => s.settings.modelRouting) ?? DEFAULT_MODEL_ROUTING;
  const updateSettings = useAppStore((s) => s.updateSettings);
  const activeProvider = useAppStore((s) => s.activeProvider);

  const patch = (p: Partial<ModelRoutingConfig>) =>
    updateSettings({ modelRouting: normalizeModelRoutingConfig({ ...modelRouting, ...p }) });

  /* Danh sách chọn: catalog built-in + model của provider đang bật (BYOK có
     thể định nghĩa model riêng qua /v1/models). Giá trị đã chọn mà rơi khỏi
     danh sách (đổi provider) vẫn hiện thành option mồ côi — không âm thầm xoá. */
  const modelOptions = (() => {
    const base = AVAILABLE_MODELS.map((m) => ({ id: m.id, label: m.name || m.id }));
    const known = new Set(base.map((m) => m.id));
    for (const m of activeProvider?.models ?? []) {
      if (!known.has(m.id)) base.push({ id: m.id, label: m.name || m.id });
    }
    return base;
  })();

  const numberField = (
    id: string,
    label: string,
    key: 'leadTurns' | 'failureThreshold' | 'fallbackTurns',
    min: number,
    max: number,
    hint: string,
  ) => (
    <NumberField
      id={id}
      label={label}
      min={min}
      max={max}
      hint={hint}
      value={modelRouting[key]}
      onCommit={(v) => patch({ [key]: v } as Partial<ModelRoutingConfig>)}
    />
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-read font-semibold text-primary">Lead/Worker Routing</h3>
          <p className="field-hint">
            Model mạnh chạy vài lượt đầu (lập kế hoạch) rồi model rẻ thực thi; thất bại liên tiếp
            thì tự quay lại model mạnh. Lệnh <code className="text-accent">/plan</code> dùng
            planner model riêng.
          </p>
        </div>
        <label className="flex flex-none cursor-pointer items-center gap-1.5 pt-1 text-ui text-primary">
          <input
            type="checkbox"
            checked={modelRouting.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
            className="h-3.5 w-3.5 rounded-full accent-accent"
          />
          Bật
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <RoutingModelSelect
          id="lead-model"
          label="Lead (mạnh)"
          value={modelRouting.leadModel}
          options={modelOptions}
          onChange={(v) => patch({ leadModel: v })}
        />
        <RoutingModelSelect
          id="worker-model"
          label="Worker (rẻ)"
          value={modelRouting.workerModel}
          options={modelOptions}
          onChange={(v) => patch({ workerModel: v })}
        />
        <RoutingModelSelect
          id="planner-model"
          label="Planner (/plan)"
          value={modelRouting.plannerModel}
          options={modelOptions}
          onChange={(v) => patch({ plannerModel: v })}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {numberField('lead-turns', 'Số lượt lead', 'leadTurns', 1, 20, 'Mặc định 3')}
        {numberField(
          'failure-threshold',
          'Ngưỡng thất bại',
          'failureThreshold',
          1,
          10,
          'Số lỗi liên tiếp để quay lại lead (mặc định 2)',
        )}
        {numberField(
          'fallback-turns',
          'Số lượt fallback',
          'fallbackTurns',
          0,
          10,
          'Giữ lead bao lâu trước khi về worker (mặc định 2)',
        )}
      </div>

      <p className="text-micro leading-relaxed text-tertiary">
        &ldquo;Thất bại&rdquo; = tool trả lỗi / lệnh build-test exit ≠ 0 / bạn phàn nàn
        (&ldquo;sai rồi&rdquo;, &ldquo;làm lại&rdquo;, &ldquo;wrong&rdquo;…). Lỗi mạng 429/5xx
        của gateway KHÔNG được tính — đã có retry im lặng riêng. Việc bạn TỪ CHỐI một phê duyệt
        cũng không tính là thất bại. Vai trò của từng lượt hiện thành badge{' '}
        <code className="text-accent">lead</code>/<code className="text-tertiary">worker</code>{' '}
        dưới câu trả lời.
      </p>
    </div>
  );
}
