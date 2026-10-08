/**
 * TelemetryTab — Tab Đo đạc & Quan sát Phân tán (OpenTelemetry Tracing) trong Cài đặt.
 *
 * Đọc bộ đệm xoay vòng của `globalTracer` trong RAM trình duyệt.
 *
 * Sự thật phải nói thẳng ở đây: bản build này không có mã nào gọi
 * `globalTracer.startSpan` khi bạn trò chuyện, nên bộ đệm LUÔN rỗng và
 * Waterfall này luôn rỗng. Đó không phải dữ liệu "đang được tải", nên tab không
 * vẽ bộ đếm span khi đệm rỗng. Xem ghi chú ở `core/telemetry/tracer.ts`.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CheckCircle2, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { globalTracer, MAX_TELEMETRY_SPANS, type TelemetrySpan } from '@/core/telemetry/tracer';

/** Nhịp vẽ lại. Chỉ chạy khi tab đang MỞ và cửa sổ còn nhìn thấy. */
const POLL_MS = 2000;

export function TelemetryTab() {
  const [spans, setSpans] = useState<TelemetrySpan[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  /*
   * `SettingsDialog` giữ tab đã xem ở trạng thái MOUNTED (chỉ `hidden`), nên một
   * setInterval vô điều kiện sẽ nạp lại span 2s/lần mãi kể cả sau khi người dùng
   * đã rời tab. Cờ này chỉ bật lại khi tab thật sự hiện lên.
   */
  const [visible, setVisible] = useState(false);
  const selectedTraceIdRef = useRef<string | null>(null);
  selectedTraceIdRef.current = selectedTraceId;

  const refreshSpans = useCallback(() => {
    const recent = globalTracer.getRecentSpans(100);
    setSpans(recent);
    if (!selectedTraceIdRef.current && recent.length > 0) {
      setSelectedTraceId(recent[0].traceId);
    }
  }, []);

  useEffect(() => {
    setVisible(true);
    return () => setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    refreshSpans();
    // `document.hidden` = người dùng đã chuyển sang tab/ứng dụng khác: đo đạc vẫn
    // chạy ở main nhưng không ai nhìn, đọc 2s/lần chỉ tốn CPU renderer.
    if (typeof document === 'undefined' || document.hidden) return;
    const timer = setInterval(refreshSpans, POLL_MS);
    return () => clearInterval(timer);
  }, [visible, refreshSpans]);

  // Gom nhóm các spans theo traceId
  const traces = useMemo(() => {
    const map = new Map<string, { traceId: string; rootSpan: TelemetrySpan; count: number; totalDurationMs: number }>();
    for (const span of spans) {
      const existing = map.get(span.traceId);
      if (!existing) {
        map.set(span.traceId, {
          traceId: span.traceId,
          rootSpan: span,
          count: 1,
          totalDurationMs: span.durationMs || 0,
        });
      } else {
        existing.count++;
        existing.totalDurationMs = Math.max(existing.totalDurationMs, (span.endTime || span.startTime) - existing.rootSpan.startTime);
      }
    }
    return Array.from(map.values());
  }, [spans]);

  const activeTraceSpans = useMemo(() => {
    if (!selectedTraceId) return [];
    return globalTracer.getTraceWaterfall(selectedTraceId);
  }, [selectedTraceId, spans]);

  const traceStartTime = activeTraceSpans[0]?.startTime || 0;
  const traceTotalDuration = useMemo(() => {
    if (activeTraceSpans.length === 0) return 1;
    const maxEnd = Math.max(...activeTraceSpans.map((s) => s.endTime || s.startTime + (s.durationMs || 0)));
    return Math.max(1, maxEnd - traceStartTime);
  }, [activeTraceSpans, traceStartTime]);

  const selectedSpan = useMemo(() => {
    return activeTraceSpans.find((s) => s.id === selectedSpanId) || activeTraceSpans[0];
  }, [activeTraceSpans, selectedSpanId]);

  /*
   * Số span THẬT đang nằm trong ring buffer. `spans` chỉ là 100 gần nhất, nên
   * dùng `spans.length` làm tử số sẽ khoe `100 / 500` trong khi đệm còn chỗ
   * trống, tức là bịa một phép đo. Đọc thẳng từ tracer ở lúc render: mỗi lần
   * poll đặt lại `spans` bằng mảng mới nên render chạy lại và đọc lại số này.
   */
  const bufferedSpans = globalTracer.size;
  const instrumentationStarted = globalTracer.hasEverStartedSpan;

  const handleClear = () => {
    globalTracer.clear();
    setSpans([]);
    setSelectedTraceId(null);
    setSelectedSpanId(null);
  };

  return (
    <div className="space-y-4 font-sans text-ui">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-accent" />
          <span className="text-read font-semibold text-primary">OpenTelemetry Waterfall</span>
          {/*
           * Bộ đếm chỉ hiện khi đệm CÓ span. Rỗng thì `0 / 500` đứng cạnh dòng
           * "chưa có dữ liệu" trông như đang đếm, nhưng không có gì đếm được:
           * số 0 ấy là hằng số, không phải phép đo. Mẫu số lấy từ hằng trần
           * thật của ring buffer thay vì gõ `500` cứng.
           */}
          {bufferedSpans > 0 && (
            <span className="rounded-full border border-subtle bg-raised px-2 py-0.5 font-sans text-micro tabular-nums text-tertiary">
              {bufferedSpans} / {MAX_TELEMETRY_SPANS} spans
            </span>
          )}
        </div>
        {/*
         * Cụm nút cùng chốt với bộ đếm: chỉ hiện khi đệm CÓ span. Đệm rỗng
         * thì "Làm mới" đọc lại đúng cái rỗng đó và "Xóa cache" xoá không
         * có gì — hai nút bấm được mà không đổi được gì trên màn hình. Đó là
         * loại nút giả: trông như có việc để làm. `refreshSpans` vẫn chạy
         * nền (POLL_MS) nên khi span xuất hiện, cụm nút tự hiện theo.
         */}
        {bufferedSpans > 0 && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={refreshSpans} className="btn-secondary" title="Làm mới">
              <RefreshCw size={12} />
              <span>Làm mới</span>
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="btn-secondary hover:border-danger hover:text-danger"
              title="Xóa bộ đệm telemetry"
            >
              <Trash2 size={12} />
              <span>Xóa cache</span>
            </button>
          </div>
        )}
      </div>

      {traces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-default bg-surface p-10 text-center text-tertiary">
          <Activity size={24} className="mx-auto mb-2 text-tertiary" />
          <p className="text-primary">
            {instrumentationStarted
              ? 'Bộ đệm đo đạc đang rỗng.'
              : 'Đo đạc chưa được bật trong bản này.'}
          </p>
          <p className="mt-1 text-meta">
            {instrumentationStarted
              ? 'Không có span nào để hiện. Bảng này chỉ có dữ liệu khi có span kết thúc nằm trong đệm. Nếu bạn vừa xoá cache thì phải có thêm một lượt chat có đo đạc.'
              : 'Khi bạn trò chuyện, không có mã nào ghi lại Turn, LLM stream hay tool, nên không có span nào để hiện. Bảng này chỉ có dữ liệu khi phần đo đạc được nối vào luồng chat ở phía trình duyệt.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Trace Selector Pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {traces.map((t) => (
              <button
                key={t.traceId}
                type="button"
                onClick={() => {
                  setSelectedTraceId(t.traceId);
                  setSelectedSpanId(null);
                }}
                aria-pressed={selectedTraceId === t.traceId}
                className={`flex-shrink-0 rounded-lg border px-2.5 py-1.5 text-left text-meta transition-colors ${
                  selectedTraceId === t.traceId
                    ? 'border-strong bg-raised font-medium text-primary'
                    : 'border-subtle bg-surface text-tertiary hover:border-default hover:text-primary'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="max-w-[120px] truncate">{t.rootSpan.name}</span>
                  <span className="text-micro tabular-nums text-tertiary">{t.totalDurationMs}ms</span>
                </div>
              </button>
            ))}
          </div>

          {/* Waterfall Chart */}
          <div className="lift-sm space-y-2 rounded-lg border border-subtle bg-surface p-3.5">
            <div className="flex justify-between border-b border-subtle pb-1 text-micro text-tertiary">
              <span>0ms</span>
              <span className="tabular-nums">Timeline: {traceTotalDuration}ms</span>
            </div>

            <div className="space-y-1.5 pt-1">
              {activeTraceSpans.map((span) => {
                const offsetMs = Math.max(0, span.startTime - traceStartTime);
                const leftPercent = Math.min(100, (offsetMs / traceTotalDuration) * 100);
                const widthPercent = Math.max(2, Math.min(100 - leftPercent, ((span.durationMs || 1) / traceTotalDuration) * 100));
                const isSelected = selectedSpan?.id === span.id;

                let barColor = 'bg-accent-dim';
                if (span.name.startsWith('tool:')) barColor = 'bg-accent-dim';
                else if (span.name.startsWith('approval:')) barColor = 'bg-warning/10';
                if (span.status === 'error') barColor = 'bg-danger/10';

                return (
                  <div
                    key={span.id}
                    onClick={() => setSelectedSpanId(span.id)}
                    className={`cursor-pointer rounded-lg px-2.5 py-1 transition-colors ${
                      isSelected ? 'border border-strong bg-raised' : 'hover:bg-raised'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-meta">
                      <div className="flex items-center gap-1.5">
                        {span.status === 'ok' ? (
                          <CheckCircle2 size={11} className="text-success" />
                        ) : (
                          <AlertTriangle size={11} className="text-danger" />
                        )}
                        <span className={span.parentId ? 'pl-2 text-secondary' : 'font-semibold text-primary'}>
                          {span.parentId ? '↳ ' : ''}
                          {span.name}
                        </span>
                      </div>
                      <span className="text-micro tabular-nums text-tertiary">{span.durationMs ?? 0}ms</span>
                    </div>

                    {/* Horizontal Bar */}
                    <div className="relative h-2 w-full overflow-hidden rounded-lg bg-raised">
                      <div
                        className={`absolute bottom-0 top-0 ${barColor}`}
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Span Details Drawer */}
          {selectedSpan && (
            <div className="lift-sm space-y-2 rounded-lg border border-subtle bg-surface p-3.5">
              <div className="flex items-center justify-between border-b border-subtle pb-1.5">
                <span className="text-meta font-semibold text-primary">{selectedSpan.name}</span>
                <span className="font-mono text-micro text-tertiary">ID: {selectedSpan.id}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-meta">
                <div>
                  <span className="text-tertiary">Thời lượng:</span>{' '}
                  <span className="tabular-nums">{selectedSpan.durationMs ?? 0}ms</span>
                </div>
                <div>
                  <span className="text-tertiary">Trạng thái:</span>{' '}
                  <span className={selectedSpan.status === 'ok' ? 'text-success' : 'text-danger'}>
                    {selectedSpan.status.toUpperCase()}
                  </span>
                </div>
              </div>

              {Object.keys(selectedSpan.attributes).length > 0 && (
                <div className="border-t border-subtle pt-1">
                  <div className="mb-1 text-micro text-tertiary">Thuộc tính (Attributes):</div>
                  <pre className="max-h-24 overflow-y-auto rounded-full border border-subtle bg-sunken px-2 py-0.5 font-mono text-micro text-primary">
                    {JSON.stringify(selectedSpan.attributes, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
