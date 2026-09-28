'use client';

import { useEffect, useState } from 'react';

/**
 * Theo dõi một media query. Trả về `false` ở lần render đầu (kể cả trên
 * server) rồi đồng bộ ngay trong effect — tránh lệch hydration.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);

  return matches;
}

/** Breakpoint `md` của Tailwind — mốc sidebar chuyển từ drawer sang cột tĩnh. */
export const MD_QUERY = '(min-width: 768px)';

/**
 * Mốc bật CỘT PHỤ BÊN PHẢI (Plan / Workspace checkpoints).
 *
 * Ngưỡng này là phép TRỪ của ba bề rộng đã biết: sidebar 256 + cột hội thoại
 * 768 (`tailwind.config.ts` → `maxWidth.thread`) + rail 320 (`maxWidth.rail`),
 * cộng gutter hai bên. Dưới ngưỡng này thì phần trống còn lại không đủ để
 * một cột phụ có ý nghĩa, nên các khối đó quay về nằm giữa cột hội thoại.
 *
 * PHẢI khớp `screens.rail` trong tailwind.config.ts — test
 * `mốc rail: khai đủ cả screen lẫn maxWidth` so hai bên theo cả hai chiều.
 */
export const RAIL_QUERY = '(min-width: 1432px)';
