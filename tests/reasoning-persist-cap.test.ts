/**
 * Trần kích thước của `reasoning` khi persist (lib/chat-tree-persistence.ts).
 *
 * Lớp test này khoá lại RANH GIỚI quanh trần — chỗ dễ sót nhất. tests/
 * redteam-reasoning-persist-hostile.test.ts chỉ nói "5 MB không được lọt"; ở
 * đây hỏi tiếp: đúng bằng trần thì sao, vượt trần thì người đọc có biết là đã
 * bị cắt không, và quan trọng nhất — việc cắt có làm `hasStoredMessageChanged`
 * lệch vô nghĩa mỗi lượt reconcile không.
 */
import { describe, expect, it } from 'vitest';
import type { Message } from 'ai/react';

import {
  reconcileActiveMessages,
  STORED_REASONING_CHARS,
} from '@/lib/chat-tree-persistence';
import type { StoredMessage } from '@/lib/db';

function msg(over: Partial<Message> & { id: string }): Message {
  return { role: 'assistant', content: 'kết luận', ...over } as Message;
}

function row(over: Partial<StoredMessage> & { id: string }): StoredMessage {
  return {
    chatId: 'c1',
    role: 'assistant',
    content: 'kết luận',
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

function reconcile(visible: Message[], current: StoredMessage[]) {
  return reconcileActiveMessages('c1', visible, current, null, false, 'stop');
}

const at = (n: number, ch = 'r') => ch.repeat(n);

describe('ranh giới quanh trần reasoning', () => {
  it('đúng bằng trần: giữ nguyên, KHÔNG thêm ghi chú cắt', async () => {
    const exact = at(STORED_REASONING_CHARS);
    const res = await reconcile([msg({ id: 'a1', reasoning: exact })], [row({ id: 'a1' })]);
    expect(res.changedRows[0].reasoning).toBe(exact);
    expect(res.changedRows[0].reasoning).not.toMatch(/bị cắt khi lưu/);
  });

  it('vượt trần 1 ký tự: bị cắt, có ghi chú, tổng ≤ trần', async () => {
    const over = at(STORED_REASONING_CHARS + 1);
    const res = await reconcile([msg({ id: 'a1', reasoning: over })], [row({ id: 'a1' })]);
    const stored = res.changedRows[0].reasoning!;
    expect(stored.length).toBeLessThanOrEqual(STORED_REASONING_CHARS);
    expect(stored).toMatch(/bị cắt khi lưu/);
  });

  it('vượt trần rất xa (5 MB): tổng vẫn ≤ trần, ghi chú nói SỐ THẬT', async () => {
    const rawLength = 5 * 1024 * 1024;
    const res = await reconcile(
      [msg({ id: 'a1', reasoning: at(rawLength) })],
      [row({ id: 'a1' })],
    );
    const stored = res.changedRows[0].reasoning!;
    expect(stored.length).toBeLessThanOrEqual(STORED_REASONING_CHARS);
    const note = stored.match(
      /\n\n\[… (\d+) ký tự reasoning cuối đã bị cắt khi lưu …\]$/,
    );
    expect(note, 'phải có ghi chú nói rõ đã bị cắt').not.toBeNull();
    /* Phần đầu còn lại + số ký tự ghi chú tự khai = toàn bộ reasoning gốc. */
    expect(Number(note![1]) + (stored.length - note![0].length)).toBe(rawLength);
  });

  it('dưới trần: giữ nguyên vẹn, không đụng một ký tự nào', async () => {
    const text = 'Hòa bạn, đây là suy nghĩ 😀 có dấu tiếng Việt';
    const res = await reconcile([msg({ id: 'a1', reasoning: text })], [row({ id: 'a1' })]);
    expect(res.changedRows[0].reasoning).toBe(text);
  });

  it('rỗng / toàn khoảng trắng: row MỚI không mang trường reasoning', async () => {
    for (const reasoning of ['', '   ', '\n\t ']) {
      const res = await reconcile([msg({ id: 'a1', reasoning })], []);
      expect(res.newRows).toHaveLength(1);
      expect(res.newRows[0].reasoning).toBeUndefined();
    }
  });
});

describe('cắt trần không làm sinh lượt ghi rác', () => {
  it('row đã lưu bản ĐÃ CẮT: lượt sau vẫn reasoning dài hơn → không sinh lượt ghi', async () => {
    /* toStoredReasoning chạy ở cả hai vế hasStoredMessageChanged. Nếu nó
       không idempotent thì mỗi lần reconcile sẽ thấy "khác nhau" và ghi lại
       một row không đổi — đúng cái loại write amplification mà vòng lặp persist
       nhiều lần trong một lượt tool-call tạo ra. */
    const raw = at(STORED_REASONING_CHARS + 5_000);
    const first = await reconcile([msg({ id: 'a1', reasoning: raw })], [row({ id: 'a1' })]);
    const stored = first.changedRows[0];
    const second = await reconcile([msg({ id: 'a1', reasoning: raw })], [stored]);
    expect(second.changedRows).toHaveLength(0);
  });
});