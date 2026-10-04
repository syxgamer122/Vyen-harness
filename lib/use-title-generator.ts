'use client';

/**
 * Đặt tiêu đề hội thoại từ tin nhắn đầu tiên — THUẦN LOCAL.
 *
 * Trước đây gọi route /api/title để model viết lại tiêu đề. Route đó đã bị gỡ:
 * nó là đường LLM chạy trên server của một sản phẩm local-first, tốn một lượt
 * gọi provider cho một việc heuristic làm được. `deriveTitle` bên dưới là cả
 * đường còn lại.
 */

import { useCallback, useRef } from 'react';

type TitleState = 'idle' | 'pending' | 'settled';

interface Options {
  onTitle: (conversationId: string, title: string) => void | Promise<void>;
}

export const DEFAULT_TITLE = 'Cuộc trò chuyện mới';

/** Ngân sách ký tự cho tiêu đề. Sidebar cắt bằng `truncate` nên dài hơn cũng
 *  không thêm thông tin, chỉ làm nhãn tràn. */
const MAX_TITLE_CHARS = 60;

/**
 * Tiền tố hệ thống chèn vào tin nhắn người dùng.
 *
 * Nguồn duy nhất còn phát ra tiền tố là lệnh `/plan` của CLI
 * (`lib/cli/interactive-agent.ts`, `agent.streamTurn(...)`):
 *   `[Chế độ Lập Kế Hoạch - Plan Mode] Hãy nghiên cứu codebase ...`
 * Mẫu cũ `[Chế độ Boost Worktree]` đã bị gỡ khỏi nhánh `/boost` — đừng dùng
 * lại làm ví dụ, code không còn sinh ra nó nữa.
 *
 * Nói thẳng để khỏi tự dệ: hôm nay KHÔNG đường nào đưa tiền tố tới đây.
 * `/plan` trên web (`react/use-chat-orchestration.ts`) gửi thẳng `slash.target`
 * không kèm ngoặc vuông, còn CLI có vòng lặp riêng, không gọi `deriveTitle`.
 * Regex ở lại là đường phòng thủ cho lúc nào đó lại có ai dán tiền tố — bỏ thì
 * hôm nào nó quay lại, tiêu đề lại ăn nhầm ngay phần dán đó.
 *
 * Chỉ bỏ ở ĐẦU chuỗi và chỉ trên một dòng. Sau `]` bắt buộc là hết chuỗi hoặc
 * khoảng trắng (`(?=\s|$)`) — thiếu điều kiện đó thì `[React](https://...)` bị
 * đọc nhầm thành tiền tố, tiêu đề phiên chỉ còn mảnh url.
 *
 * Bỏ mọi `[...]` ở mọi nơi thì còn tệ hơn: ngoặc vuông giữa câu là của người
 * dùng (trích dẫn `[1]`), còn tiền tố nào cũng nằm trước lời họ.
 *
 * Đánh đổi đã biết: tin nhắn mở đầu bằng `[...]` mà không phải tiền tố
 * (`[1]`, `[ghi chú riêng]`) vẫn mất mấng chữ đó. Không có tín hiệu nào phân
 * biệt được hai thứ, và giữ lại tiền tố còn tệ hơn.
 */
const PREAMBLE_RE = /^\s*(?:\[[^\][\n]*\](?=\s|$)\s*)+/;

/** Dấu kết thúc câu (Latin + CJK). */
const SENTENCE_END = /[.!?…。！？]/;

/**
 * Cắt tại ranh giới CÂU, không cắt tại ký tự thứ N.
 *
 * Chỉ coi dấu câu là kết thúc câu khi sau nó là khoảng trắng hoặc hết
 * chuỗi, nên `auth.ts` và `3.5` không bị cắt làm đôi.
 */
function firstSentence(text: string): string {
  for (let i = 0; i < text.length; i++) {
    if (!SENTENCE_END.test(text[i])) continue;
    const rest = text.slice(i + 1);
    if (rest === '' || /^\s/.test(rest)) return text.slice(0, i + 1);
  }
  return text;
}

/** Câu đã đúng ranh giới nhưng dài hơn ngân sách: cắt ở bội từ, không cắt giữa từ. */
function trimToWordBoundary(sentence: string): string {
  if (sentence.length <= MAX_TITLE_CHARS) return sentence;
  const clipped = sentence.slice(0, MAX_TITLE_CHARS);
  const lastSpace = clipped.lastIndexOf(' ');
  const kept = (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trim();
  return `${kept}…`;
}

/**
 * Ký tự không mang nghĩa (ngoặc, phẩy, `_`, `*`...) thành khoảng trắng.
 *
 * Riêng `.` và `/` chỉ bị bỏ khi KHÔNG nằm giữa hai ký tự chữ/số: `auth.ts`,
 * `src/lib/foo.ts`, `3.5` là một từ, dính dấu ra thành `auth ts` thì tiêu đề
 * đọc như người khác đang nói. Bước này chạy SAU `firstSentence` nên dấu ở cuối
 * câu (`.` `!` `?`) hết tác dụng rồi, vẫn phải cắt.
 */
const NOISE_RE = /[^\p{L}\p{N}\s./]+|[./](?![\p{L}\p{N}])|(?<![\p{L}\p{N}])[./]/gu;

/**
 * Rút tiêu đề phiên từ tin nhắn đầu tiên.
 *
 * Tiêu đề phải là thứ người dùng định nói, không phải tiền tố hệ thống dán
 * trước lời họ. Ba bước theo đúng thứ tự: bỏ tiền tố `[...]` -> cắt ở ranh
 * giới câu -> mới bỏ dấu câu và cắt theo bội từ. Thứ tự này là lý do giữ được
 * `.`/`/` trong từ: chấm câu đã được `firstSentence` xử lý xong.
 *
 * Thuần, không import gì: dùng được ở client lẫn test node.
 */
export function deriveTitle(raw: string | null | undefined): string {
  const spoken = (raw ?? '').replace(PREAMBLE_RE, '').trim();
  if (!spoken) return DEFAULT_TITLE;

  const first = firstSentence(spoken).replace(NOISE_RE, ' ').replace(/\s+/g, ' ').trim();
  if (!first) return DEFAULT_TITLE;

  return trimToWordBoundary(first);
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
        await onTitle(conversationId, deriveTitle(firstUserMessage));
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
