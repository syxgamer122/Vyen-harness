/**
 * TelemetryTab — Tab Đo đạc & Quan sát Phân tán (OpenTelemetry Tracing) trong Cài đặt.
 *
 * Hiển thị biểu đồ Waterfall trực quan độ trễ từng Agent Turn, LLM Stream, Tool execution
 * và Audit commit từ bộ nhớ đệm xoay vòng (Ring Buffer 500 Spans) của globalTracer.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CheckCircle2, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { globalTracer, type TelemetrySpan } from '@/core/telemetry/tracer';

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

  const handleClear = () => {
    globalTracer.clear();
    setSpans([]);
    setSelectedTraceId(null);
    setSelectedSpanId(null);
  };

  return (
    <div className="space-y-4 font-mono text-ui">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-accent" />
          <span className="text-read font-semibold text-primary">OpenTelemetry Waterfall</span>
          <span className="rounded-none border border-subtle bg-raised px-1.5 py-0.5 font-mono text-micro tabular-nums text-tertiary">
            {spans.length} / 500 spans
          </span>
        </div>
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
      </div>

      {traces.length === 0 ? (
        <div className="rounded-none border border-dashed border-default bg-surface p-8 text-center text-tertiary">
          <Activity size={24} className="mx-auto mb-2 text-tertiary" />
          <p>Chưa có dữ liệu đo đạc.</p>
          <p className="mt-1 text-meta">
            Khi bạn trò chuyện và AI thực thi các công cụ (fs_*, shell_run, mcp),
            tiến trình sẽ xuất hiện dưới dạng biểu đồ Waterfall tại đây.
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
                className={`flex-shrink-0 rounded-none border px-2 py-1 text-left text-meta transition-colors ${
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
          <div className="space-y-2 rounded-none border border-subtle bg-surface p-3">
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
                    className={`cursor-pointer rounded-none px-2 py-1 transition-colors ${
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
                    <div className="relative h-2 w-full overflow-hidden rounded-none bg-raised">
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
            <div className="space-y-2 rounded-none border border-subtle bg-surface p-3">
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
                  <pre className="max-h-24 overflow-y-auto rounded-none border border-subtle bg-sunken p-1.5 font-mono text-micro text-primary">
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
