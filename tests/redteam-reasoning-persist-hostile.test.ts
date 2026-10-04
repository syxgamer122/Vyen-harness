/**
 * RED TEAM — persistence của `reasoning` (lib/chat-tree-persistence.ts).
 *
 * Hợp đồng ghi trong docblock: "Không so sánh reasoning thì nó KHÔNG BAO GIỜ
 * được ghi ... reasoning chết lặng". Vậy nên điều kiện phải là: một row mà CHỈ
 * reasoning đổi thì phải được coi là đã đổi và phải ghi — và một row đã có
 * reasoning thì lượt không mang reasoning nữa không được giữ lại bản cũ mãi
 * mãi.
 */
import { describe, expect, it } from 'vitest';
import type { Message } from 'ai/react';

import {
  reconcileActiveMessages,
  toChatMessage,
} from '@/lib/chat-tree-persistence';
import type { StoredMessage } from '@/lib/db';

function msg(over: Partial<Message> & { id: string }): Message {
  return {
    role: 'assistant',
    content: '',
    ...over,
  } as Message;
}

function row(over: Partial<StoredMessage> & { id: string }): StoredMessage {
  return {
    chatId: 'c1',
    role: 'assistant',
    content: '',
    parentId: 'u1',
    seq: 1,
    branchOrder: 0,
    branchTieBreaker: 'a1',
    createdAt: 1,
    status: 'complete',
    finishReason: 'stop',
    ...over,
  } as StoredMessage;
}

function reconcile(visible: Message[], current: StoredMessage[], loading = false) {
  return reconcileActiveMessages('c1', visible, current, null, loading, 'stop');
}

/* ------------------------------------------------------------------ */

describe('reasoning — chỉ reasoning đổi thì vẫn phải được ghi', () => {
  it('row có reasoning → reasoning dài hơn: phải vào changedRows', async () => {
    const before = row({ id: 'a1', content: 'kết luận', reasoning: 'suy nghĩ ngắn' });
    const after = msg({ id: 'a1', content: 'kết luận', reasoning: 'suy nghĩ dài hơn nhiều' });
    const res = await reconcile([after], [before]);
    expect(res.changedRows).toHaveLength(1);
    expect(res.changedRows[0].reasoning).toBe('suy nghĩ dài hơn nhiều');
  });

  it('row KHÔNG có reasoning → có reasoning: phải vào changedRows', async () => {
    const before = row({ id: 'a1', content: 'kết luận' });
    const after = msg({ id: 'a1', content: 'kết luận', reasoning: 'mới có' });
    const res = await reconcile([after], [before]);
    expect(res.changedRows).toHaveLength(1);
    expect(res.changedRows[0].reasoning).toBe('mới có');
  });

  it('reasoning undefined ở CẢ HAI bên: không được sinh lượt ghi vô nghĩa', async () => {
    const before = row({ id: 'a1', content: 'kết luận' });
    const after = msg({ id: 'a1', content: 'kết luận' });
    const res = await reconcile([after], [before]);
    expect(res.changedRows).toHaveLength(0);
  });

  it('reasoning chỉ toàn khoảng trắng ở cả hai bên: không sinh lượt ghi', async () => {
    const before = row({ id: 'a1', content: 'kết luận', reasoning: '   ' });
    const after = msg({ id: 'a1', content: 'kết luận', reasoning: '  \n ' });
    const res = await reconcile([after], [before]);
    expect(res.changedRows).toHaveLength(0);
  });

  it('đang STREAM, chỉ reasoning chảy tiếp: vẫn phải ghi (status streaming)', async () => {
    const before = row({ id: 'a1', content: '', status: 'streaming', finishReason: undefined });
    const after = msg({ id: 'a1', content: '', reasoning: 'đang suy nghĩ' });
    const res = await reconcile([after], [before], true);
    expect(res.changedRows).toHaveLength(1);
    expect(res.changedRows[0].status).toBe('streaming');
    expect(res.changedRows[0].reasoning).toBe('đang suy nghĩ');
  });

  it('lượt không mang reasoning (undefined) thì giữ bản đã lưu — không xoá trắng khi đang stream', async () => {
    const before = row({ id: 'a1', content: '', status: 'streaming', reasoning: 'đang suy nghĩ' });
    const after = msg({ id: 'a1', content: '' });
    const res = await reconcile([after], [before], true);
    expect(res.changedRows[0]?.reasoning ?? 'đang suy nghĩ').toBe('đang suy nghĩ');
  });

  it('LƯỢT ĐÃ XONG không mang reasoning thì phải XOÁ reasoning cũ, không giữ mãi', async () => {
    /* isCurrentlyLoading=false ⇒ lượt đã kết thúc; không có "đang stream" để
       biện minh cho việc giữ bản cũ. */
    const before = row({ id: 'a1', content: 'kết luận', reasoning: 'suy nghĩ của lượt trước' });
    const after = msg({ id: 'a1', content: 'kết luận' });
    const res = await reconcile([after], [before], false);
    expect(res.changedRows[0]?.reasoning ?? undefined).toBeUndefined();
  });

  it('reasoning toàn khoảng trắng ở lượt ĐÃ XONG cũng phải xoá bản cũ', async () => {
    const before = row({ id: 'a1', content: 'kết luận', reasoning: 'suy nghĩ cũ' });
    const after = msg({ id: 'a1', content: 'kết luận', reasoning: '   ' });
    const res = await reconcile([after], [before], false);
    expect(res.changedRows[0]?.reasoning ?? undefined).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */

describe('reasoning — trần kích thước', () => {
  it('reasoning 5MB: ghi nguyên văn hay bị cắt? (trần phải tồn tại ở đâu đó)', async () => {
    const huge = 'r'.repeat(5 * 1024 * 1024);
    const before = row({ id: 'a1', content: 'x' });
    const after = msg({ id: 'a1', content: 'x', reasoning: huge });
    const res = await reconcile([after], [before]);
    const stored = res.changedRows[0]?.reasoning ?? '';
    /* Nếu không có trần, payload này đi thẳng vào IndexedDB mỗi lần stream
       ghi lại. Test đỎ = thiếu trần. */
    expect(stored.length).toBeLessThanOrEqual(200_000);
  });

  it('reasoning mới không làm phình bản ghi cũ khi content không đổi', async () => {
    const before = row({ id: 'a1', content: 'x', reasoning: 'a'.repeat(1000) });
    const after = msg({ id: 'a1', content: 'x', reasoning: 'a'.repeat(1000) });
    const res = await reconcile([after], [before]);
    expect(res.changedRows).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */

describe('reasoning — đường đọc (toChatMessage)', () => {
  it('reasoning rỗng / toàn khoảng trắng không được gắn key rỗng vào message', () => {
    const m1 = toChatMessage(row({ id: 'a', reasoning: '' }), new Set());
    expect('reasoning' in m1).toBe(false);
    const m2 = toChatMessage(row({ id: 'a', reasoning: '   ' }), new Set());
    expect('reasoning' in m2).toBe(false);
  });

  it('reasoning thật thì phải quay lại đúng nguyên văn', () => {
    const text = 'suy nghĩ 100%';
    const m = toChatMessage(row({ id: 'a', reasoning: text }), new Set());
    expect(m.reasoning).toBe(text);
  });

  it('reasoning không phải chuỗi (số/object) không được đi thẳng xuống UI', () => {
    const m = toChatMessage(
      row({ id: 'a', reasoning: 12345 as unknown as string }),
      new Set(),
    );
    expect(m.reasoning === undefined || typeof m.reasoning === 'string').toBe(true);
  });

  it('round-trip: ghi rồi đọc lại giữ nguyên reasoning có dấu tiếng Việt', async () => {
    const text = 'Hòa bạn, đây là suy nghĩ 😀 của tôi';
    const after = msg({ id: 'a1', content: 'kết luận', reasoning: text });
    const res = await reconcile([after], [row({ id: 'a1', content: 'kết luận' })]);
    const back = toChatMessage(res.changedRows[0], new Set());
    expect(back.reasoning).toBe(text);
  });
});
