'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Vị trí panel neo dưới trigger, render qua portal + position:fixed.
 * `maxHeight` chỉ có khi component xin (`withMaxHeight`).
 */
export interface PanelPos {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight?: number;
}

/** Hình học phần tử neo: 3 mép cơ bản + top tuỳ chọn để hỗ trợ mở lật lên. */
export interface AnchorRect {
  left: number;
  right: number;
  bottom: number;
  top?: number;
}

export interface AnchoredPanelViewport {
  width: number;
  height: number;
}

export interface ComputeAnchoredPanelOptions {
  /** Bề ngang mong muốn (trước khi kẹp theo viewport). */
  width: number;
  /** 'left': mép trái panel theo mép trái trigger; 'right': theo mép phải. */
  align: 'left' | 'right';
  /** Khoảng hở từ mép trigger tới panel và viền viewport (mặc định 8). */
  margin?: number;
  /** Mép giữ lại hai bên viewport khi kẹp left (mặc định 8). */
  minMargin?: number;
  /** Có tính maxHeight cho panel cuộn được (floor 160px). */
  withMaxHeight?: boolean;
  /** Hướng mở: 'bottom' (mặc định), 'top', hoặc 'auto' (tự lật lên nếu phía dưới thiếu chỗ). */
  placement?: 'bottom' | 'top' | 'auto';
}

/**
 * Toán tử đặt panel dropdown của status line và composer (ModelSelector, ThinkingMenu,
 * ChatExportMenu dùng chung). Panel mở XUỐNG hoặc LẬT LÊN tuỳ vị trí trigger và viewport,
 * rộng tối đa `width` nhưng phải hở `margin*2` hai bên viewport, rồi kẹp left vào
 * [`minMargin`, vw - width - `minMargin`]. Hàm thuần để test ma trận kẹp ở
 * NODE env; hook bên dưới và component chỉ việc gọi.
 */
export function computeAnchoredPanelPos(
  rect: AnchorRect,
  viewport: AnchoredPanelViewport,
  opts: ComputeAnchoredPanelOptions,
): PanelPos {
  const margin = opts.margin ?? 8;
  const minMargin = opts.minMargin ?? 8;
  let width = Math.min(opts.width, viewport.width - margin * 2);
  if (opts.align === 'left') {
    const spaceRight = viewport.width - rect.left - minMargin;
    if (spaceRight >= 320 && spaceRight < width) {
      width = Math.round(spaceRight);
    }
  }

  const anchorLeft = opts.align === 'left' ? rect.left : rect.right - width;
  const left = Math.min(
    Math.max(minMargin, Math.round(anchorLeft)),
    Math.round(viewport.width - width - minMargin),
  );

  const placement = opts.placement ?? 'bottom';
  const spaceBelow = viewport.height - rect.bottom - margin;
  const topAnchor = rect.top !== undefined ? rect.top : rect.bottom - 32;
  const spaceAbove = topAnchor - margin;

  const shouldOpenUp =
    placement === 'top' || (placement === 'auto' && spaceBelow < 380 && spaceAbove > spaceBelow);

  if (shouldOpenUp) {
    const bottom = Math.round(viewport.height - topAnchor + margin);
    const pos: PanelPos = { bottom, left, width };
    if (opts.withMaxHeight) {
      pos.maxHeight = Math.max(160, Math.round(topAnchor - margin * 2));
      const maxBottom = Math.round(viewport.height - pos.maxHeight - margin);
      pos.bottom = Math.min(bottom, Math.max(minMargin, maxBottom));
    }
    return pos;
  }

  const top = Math.round(rect.bottom) + margin;
  const pos: PanelPos = { top, left, width };
  if (opts.withMaxHeight) {
    pos.maxHeight = Math.max(160, viewport.height - top - margin);
  }
  return pos;
}

export interface UseAnchoredPanelOptions {
  /** Panel chỉ tính vị trí và bắt sự kiện đóng khi đang mở. */
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  width: number;
  align: 'left' | 'right';
  placement?: 'bottom' | 'top' | 'auto';
  withMaxHeight?: boolean;
  /**
   * Callback đóng của component. Dismissal bên ngoài gọi `close(false)`:
   * đóng mà KHÔNG trả focus về trigger (focus đang đi tới nơi user vừa
   * click/cuộn); Escape vẫn là `close()` của riêng từng component.
   */
  close: (returnFocus?: boolean) => void;
  /**
   * Node ngoài trigger + panel vẫn tính là "bên trong" khi đóng theo
   * pointerdown (ví dụ container bọc trigger ở ThinkingMenu).
   */
  insideRef?: RefObject<HTMLElement | null>;
}

/**
 * Chuẩn chung cho các menu portal của status line và composer: vị trí neo theo trigger
 * (tính lại khi resize), đóng khi cuộn/pointerdown ngoài panel.
 */
export function useAnchoredPanel({
  open,
  triggerRef,
  width,
  align,
  placement = 'bottom',
  withMaxHeight,
  close,
  insideRef,
}: UseAnchoredPanelOptions): {
  pos: PanelPos | null;
  panelRef: RefObject<HTMLDivElement | null>;
} {
  const [pos, setPos] = useState<PanelPos | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos(
        computeAnchoredPanelPos(
          { left: rect.left, right: rect.right, bottom: rect.bottom, top: rect.top },
          { width: window.innerWidth, height: window.innerHeight },
          { width, align, withMaxHeight, placement },
        ),
      );
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [open, width, align, placement, withMaxHeight, triggerRef]);

  useEffect(() => {
    if (!open) return;
    // Portal-aware: trigger và panel là hai cây DOM khác nhau, cả hai (cùng
    // insideRef nếu có) đều là "bên trong"; ngoài các node đó mới tính là
    // click-đóng.
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current?.contains(t) ||
        panelRef.current?.contains(t) ||
        insideRef?.current?.contains(t)
      ) {
        return;
      }
      close(false);
    };
    // Cuộn gì ngoài panel (danh sách tin nhắn, header) làm anchor lệch chỗ:
    // đóng ngay thay vì đuổi theo; cuộn bên TRONG panel thì bỏ qua.
    const onScroll = (e: Event) => {
      if (!panelRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close, triggerRef, insideRef]);

  return { pos, panelRef };
}
