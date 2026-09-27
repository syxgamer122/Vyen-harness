'use client';

import { useEffect, useRef, type RefObject } from 'react';

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Các focus trap đang hoạt động, xếp theo thứ tự bật lên — ĐỈNH là trap MỞ SAU
 * CÙNG, tức dialog trên cùng.
 *
 * Vì sao cần: mọi dialog đều gắn listener `keydown` ở tầng `document` và pha
 * bubble. `stopPropagation()` KHÔNG chặn được listener khác CÙNG gắn trên một
 * node (DOM chỉ bảo đảm điều đó ở pha capture), nên một lần Escape từng chạy
 * qua MỌI dialog đang mở. Hậu quả đã kiểm chứng: hộp phê duyệt MCP (z-85, cố ý
 * nằm trên) đang mở thì Escape vẫn khiến `DiffConfirm` chạy `decide(false)` —
 * TỪ CHỐI file đang chờ, trước khi hộp trên kịp nói gì.
 *
 * Chỉ dựa vào `stopImmediatePropagation()` thì chưa đủ: nó chặn phần còn lại
 * theo thứ tự ĐĂNG KÝ, mà `DiffConfirm` mount trước `McpToolApprovalDialog` nên
 * sẽ ăn Escape trước hộp đang nằm trên nó. Vì vậy cần stack này để quyết định
 * theo thứ tự MỞ, độc lập với thứ tự đăng ký listener.
 *
 * Token được đẩy lên đỉnh khi trap bật (mount hoặc `active` false → true) và bị
 * gỡ khi nó tắt, nên một trap đang `active: false` không bao giờ chặn ai.
 */
const trapStack: object[] = [];

export interface UseFocusTrapOptions {
  active?: boolean;
  onEscape?: () => void;
  initialFocusSelector?: string;
}

/**
 * Hook quản lý focus trap cho modal / dialog:
 * 1. Tự động focus vào phần tử đầu tiên (hoặc selector chỉ định) khi mở.
 * 2. Giữ phím Tab / Shift+Tab quay vòng bên trong container.
 * 3. Hỗ trợ bấm Escape để đóng modal (nghe ở tầng document để click vào diff text không làm chết phím).
 * 4. Trả lại focus cho phần tử trước đó khi đóng / unmount.
 *
 * Nhiều dialog có thể mở cùng lúc; xem `trapStack` để biết vì sao Escape
 * chỉ thuộc về dialog trên cùng.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  options: UseFocusTrapOptions = {},
) {
  const { active = true, onEscape, initialFocusSelector } = options;

  /*
   * Token định danh riêng cho trap này, sống suốt vòng đời component. Giữ nó
   * ở ref chứ không sinh trong effect: effect chạy lại mỗi khi `onEscape` hay
   * `initialFocusSelector` đổi identity, và nếu mỗi lần gắn lại đều đẩy lên
   * đỉnh thì chỉ cần cha render lại là dialog thấp hơn lại giành được Escape —
   * đúng cái lỗi ta đang sửa, chỉ đổi từ "mount trước" sang "render lại".
   */
  const trapTokenRef = useRef<object | null>(null);
  if (trapTokenRef.current === null) trapTokenRef.current = {};
  const trapToken = trapTokenRef.current;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    /* Đẩy lên đỉnh: trap này vừa mở ra nên nó nằm trên các trap đang mở. */
    trapStack.push(trapToken);

    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (!container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
    }

    const focusTarget = initialFocusSelector
      ? container.querySelector<HTMLElement>(initialFocusSelector)
      : container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);

    const timer = setTimeout(() => {
      const target = focusTarget ?? container;
      target?.focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        /*
         * Chỉ dialog trên cùng mới được phản ứng Escape. Điều kiện "đỉnh
         * stack" phải nằm TRƯỚC cả `stopImmediatePropagation` lẫn `preventDefault`:
         * một trap không phải đỉnh không được nuốt phím của hộp đang nằm trên nó.
         * Nếu thiếu, Escape sẽ bị nuốt im lặng và người dùng tưởng phím chết.
         */
        if (trapStack[trapStack.length - 1] !== trapToken) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);

      if (focusables.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;

      // Nếu focus rơi ra ngoài container (click body/text trần), kéo lại vào container
      if (!current || !container.contains(current)) {
        e.preventDefault();
        if (e.shiftKey) {
          last.focus();
        } else {
          first.focus();
        }
        return;
      }

      if (e.shiftKey) {
        if (current === first || current === container) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (current === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      /* Gỡ khỏi stack — vị trí để hộp kế dưới lên đỉnh. */
      const i = trapStack.lastIndexOf(trapToken);
      if (i !== -1) trapStack.splice(i, 1);
      previouslyFocused?.focus();
    };
  }, [containerRef, active, onEscape, initialFocusSelector, trapToken]);
}
