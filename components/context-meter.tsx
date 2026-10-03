'use client';

/**
 * Context meter — hairline 2px + text mono "12.3k / 200k" hiển thị ngữ cảnh
 * đã dùng / trần của model đang chọn (resolveContextWindow: metadata provider
 * → config built-in → 32k).
 *
 * Mục đích UX: người dùng hiểu vì sao hội thoại dài bị nén tự động và thấy
 * trước khi chạm ngưỡng. Màu chỉ đổi khi thật sự có chuyện: vàng khi vào vùng
 * chuẩn-bị-nén (≥75%), đỏ khi sát trần (≥90%); dưới ngưỡng đó là neutral.
 */

/** Format token theo kiểu đọc nhanh: 999 → "999", 12345 → "12.3k", 2M. */
export function fmt(k: number): string {
  if (k >= 1_000_000) return `${(k / 1_000_000).toFixed(k % 1_000_000 === 0 ? 0 : 1)}M`;
  if (k >= 1000) {
    const v = k / 1000;
    // Một chữ số thập phân (12.3k), bỏ ".0" cho số chẵn
    const s = v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, '');
    return `${s}k`;
  }
  return String(k);
}

export type ContextMeterTone = 'ok' | 'warning' | 'error';

/** Toàn bộ số học của meter, tách ra để test thuần (không cần DOM). */
export function computeMeter(used: number, max: number): {
  /** Tỉ lệ gốc, KHÔNG clamp: used > max vẫn thấy "vượt trần" (105%). */
  ratio: number;
  /** Tỉ lệ clamp 0..1 cho độ rộng thanh, để không tràn layout. */
  fillRatio: number;
  /** Percent làm tròn từ tỉ lệ gốc (dùng cho title/aria). */
  percent: number;
  tone: ContextMeterTone;
  safeMax: number;
} {
  const safeMax = Math.max(1, max);
  const ratio = Math.max(0, used / safeMax);
  const fillRatio = Math.min(1, ratio);
  return {
    ratio,
    fillRatio,
    percent: Math.round(ratio * 100),
    tone: ratio >= 0.9 ? 'error' : ratio >= 0.75 ? 'warning' : 'ok',
    safeMax,
  };
}

