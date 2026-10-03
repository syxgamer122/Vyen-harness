'use client';

/**
 * Micro-transitions pack cho Vyen — port từ Amicro registry (MIT,
 * github.com/Subhan-code/Amicro--Micro-transitions-).
 *
 * PHIÊN BẢN KHÔNG framer: thư viện motion đó nặng ~100KB gz chỉ để chạy vài
 * animation vòng lặp đơn giản, và nó nằm trong chunk khởi động. Toàn bộ hiệu
 * ứng chuyển sang CSS animation thuần (keyframes `fx-*` trong
 * tailwind.config.ts) — tham số duration/ease/delay copy nguyên từ bản
 * framer cũ để HÀNH VI hiển thị không đổi.
 *
 * Quy tắc bắt buộc khi dùng:
 * - CHỈ gắn effect ở trạng thái ĐANG CHỜ (mic nghe, thinking, tool chip) —
 *   không bao giờ gắn animation loop vào bubble tĩnh (message re-render mỗi
 *   token khi stream, animation loop sẽ nhân chi phí render).
 * - Mọi effect tự tắt qua useFxEnabled(): settings.perf.animations (máy yếu)
 *   + prefers-reduced-motion của OS. Khi tắt → render fallback tĩnh.
 *
 * CƠ CHẾ TẮT ANIMATION — CÓ MỘT NGUỒN SỰ THẬT, HAI LỚP:
 *
 *   1. useFxEnabled() (tầng JS, file này) là CỔNG QUYẾT ĐỊNH — nó chọn luôn
 *      render gì: element có animation, hay phần tử tĩnh thay thế. Không có
 *      tầng nào khác làm được việc này.
 *   2. globals.css là LƯỚI AN TOÀN (tầng CSS): media query
 *      prefers-reduced-motion và html[data-animations='off'] ép
 *      animation-duration về 0.01ms. Nó phủ được cả những thứ nằm ngoài file
 *      này — animate-fade-in / animate-pop-in / animate-slide-up ở dialog,
 *      sidebar, toast, và CSS của thư viện thứ ba — nên phải giữ.
 *
 * VÌ SAO JS VẪN CẦN DÙ CÓ LỚP CSS: lưới ở (2) chỉ đặt duration về 0.01ms,
 * KHÔNG đổi phần tử nào cả. Nhánh animated vẫn render; chỉ là animation chạy
 * hết một vòng rồi đứng. Nên với effect có nhánh tĩnh riêng lớp CSS
 * không thay thế được cổng JS — nó chỉ tạo ra MỘT trạng thái tĩnh thứ hai.
 *
 * Quy tắc hội tụ: mọi phần tử ở nhánh animated phải khai báo trạng thái tĩnh
 * bằng class trùng ĐÚNG giá trị mà keyframe đặt ở khung 0% (fill-mode mặc định
 * `none` → khi CSS giết animation, phần tử rơi về style gốc chứ không phải khung
 * 0%). Phần tử ở nhánh fallback phải mang đúng giá trị đó. Như vậy cả ba đường
 * (bật, JS tắt, CSS tắt) hội tụ về MỘT trạng thái tĩnh. Sửa một bên thì phải
 * sửa cả bên kia, không được để lệch nhau.
 *
 * ANIMATION LOOP KHÔNG ĐƯỢC GẮN VÀO PHẦN TỬ RE-RENDER THEO STREAM. Xem quy
 * tắc ở đầu file.
 *
 * HAI KEYFRAME ĐÃ MẤT NGƯỜI DÙNG: `fx-sweep` và `fx-dot-bounce` không còn
 * class nào gọi tới, sau khi hai component dựng chúng bị xoá vì zero-usage.
 * Chúng vẫn nằm trong tailwind.config.ts — `fx-sweep` còn giữ đúng cái stop
 * 77.8% mà người ta từng tính tay để giả lập `repeatDelay` của framer, nên
 * đừng xoá vội khi chưa biết còn ý định dùng lại không. Cả hai key KHÔNG sinh
 * CSS cho tới khi còn class gọi tới, nên chúng chỉ tốn vài dòng config, không
 * tốn bundle.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';

/**
 * Thay useReducedMotion của framer: cùng ngữ nghĩa (true khi OS bật
 * giảm chuyển động, cập nhật theo change event) nhưng chỉ là 1 matchMedia —
 * không kéo thư viện animation vào bundle.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Bật/tắt toàn bộ micro-transitions: flag máy yếu + OS reduced-motion. */
export function useFxEnabled(): boolean {
  const animations = useAppStore((s) => s.settings.perf.animations);
  const reduced = usePrefersReducedMotion();
  return animations && !reduced;
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* TextShimmer — vệt sáng quét qua chữ đang chờ                        */
/* ------------------------------------------------------------------ */

export function TextShimmer({ text, className = '' }: { text: string; className?: string }) {
  const fx = useFxEnabled();
  if (!fx) return <span className={className}>{text}</span>;
  return <span className={`fx-shimmer-text ${className}`}>{text}</span>;
}

/* ------------------------------------------------------------------ */
/* PulseGlow — hiệu ứng viền thở nhẹ quanh Composer khi active         */
/* ------------------------------------------------------------------ */

export function PulseGlow({ active = true, className = '' }: { active?: boolean; className?: string }) {
  const fx = useFxEnabled();
  if (!fx || !active) return null;
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute -inset-[1px] rounded-[inherit] transition-opacity duration-300 animate-pulse ring-1 ring-accent/30 ${className}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Haptics — rung nhẹ mobile (navigator.vibrate), no-op nơi không hỗ trợ */
/* ------------------------------------------------------------------ */

export type HapticsKind = 'light' | 'medium' | 'success';

export function useHaptics() {
  const animations = useAppStore((s) => s.settings.perf.animations);
  return useMemo(
    () => ({
      trigger(kind: HapticsKind = 'light') {
        if (!animations) return false;
        if (typeof window === 'undefined' || !navigator.vibrate) return false;
        try {
          const ms = kind === 'light' ? 10 : kind === 'medium' ? 25 : kind === 'success' ? [10, 40, 15] : 15;
          return navigator.vibrate(ms);
        } catch {
          return false;
        }
      },
    }),
    [animations],
  );
}
