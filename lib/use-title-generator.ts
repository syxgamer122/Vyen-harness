'use client';

import { useCallback, useRef } from 'react';

type TitleState = 'idle' | 'pending' | 'settled';

interface Options {
  onTitle: (conversationId: string, title: string) => void | Promise<void>;
}

/**
 * Đặt tiêu đề hội thoại từ tin nhắn đầu tiên — THUẦN LOCAL.
 *
 * Trước đây gọi route /api/title để model viết lại tiêu đề. Route đó đã bị gỡ:
 * nó là đường LLM chạy trên server của một sản phẩm local-first, tốn một lượt
 * gọi provider cho một việc heuristic làm được. `localTitle` bên dưới là cả
 * đường còn lại.
 */
function localTitle(text: string): string {
  const words = text
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length ? words.slice(0, 5).join(' ').slice(0, 50) : 'Cuộc trò chuyện mới';
}

export function useTitleGenerator({ onTitle }: Options) {
  /**
   * Map<conversationId, TitleState>.
   * QUY TẮC BẤT BIẾN: chuyển sang 'pending' TRƯỚC khi ghi, và
   * KHÔNG BAO GIỜ quay lại 'idle'. Lỗi => 'settled' + title local.
   */
  const state = useRef<Map<string, TitleState>>(new Map());

  const generateTitle = useCallback(
    async (conversationId: string, firstUserMessage: string) => {
      if (!conversationId || !firstUserMessage.trim()) return;
      if (state.current.get(conversationId)) return; // pending hoặc settled -> chặn tuyệt đối

      state.current.set(conversationId, 'pending');
      try {
        await onTitle(conversationId, localTitle(firstUserMessage));
      } catch {
        /* giữ state settled — title local đã đủ dùng */
      } finally {
        state.current.set(conversationId, 'settled');
      }
    },
    [onTitle],
  );

  /** Gọi khi load conversation đã có title sẵn từ Dexie. */
  const markTitled = useCallback((conversationId: string) => {
    state.current.set(conversationId, 'settled');
  }, []);

  return { generateTitle, markTitled };
}