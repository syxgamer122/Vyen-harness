/**
 * Reasoning phải sống sót qua Dexie.
 *
 * Trước khi sửa: `StoredMessage` không có trường `reasoning`, nên khối
 * ThinkingBlock hiện rõ khi stream rồi biến mất im lặng sau khi tải lại trang —
 * không có lỗi nào. Lớp test này khoá lại đúng ba chỗ dễ sót:
 *  1. đường đọc  (toChatMessage) — có trả reasoning về useChat không,
 *  2. đường ghi  (reconcileActiveMessages) — row mới VÀ row đã có đều mang nó,
 *  3. hasStoredMessageChanged — so sánh field hay không. Mục 3 mới là cái
 *     quyết định: thêm field vào kiểu + đường ghi mà quên mục 3 thì mọi test
 *     khác vẫn xanh trong khi dữ liệu chết lặng, y hệt bug toolInvocations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Message } from 'ai/react';

import {
  reconcileActiveMessages,
  toChatMessage,
} from '@/lib/chat-tree-persistence';
import type { StoredMessage } from '@/lib/db';

const ROOT = '__ROOT__';

/* ------------------------------------------------------------------ */
/* Source assertions                                                   */
/* ------------------------------------------------------------------ */

const PERSIST_PATH = path.resolve(
  __dirname,
  '../lib/chat-tree-persistence.ts',
);
const DB_PATH = path.resolve(__dirname, '../lib/db.ts');
/**
 * Chuẩn hoá CRLF → LF trước khi regex. Repo bật `core.autocrlf` và không có
 * .gitattributes, nên file trên đĩa là CRLF còn checkout sạch ở CI là LF;
 * regex viết cứng `\n` sẽ xanh ở máy này, đỏ ở máy kia (xem
 * tests/run-wiring.test.ts).
 */
const source = fs
  .readFileSync(PERSIST_PATH, 'utf8')
  .replace(/\r\n/g, '\n');
const dbSource = fs.readFileSync(DB_PATH, 'utf8').replace(/\r\n/g, '\n');

/** Đoạn source từ một mốc tới mốc kế tiếp (mốc phải là duy nhất trong file). */
function between(startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  expect(start, `không tìm thấy mốc: ${startNeedle}`).toBeGreaterThan(-1);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  expect(end, `không tìm thấy mốc sau ${startNeedle}: ${endNeedle}`)
    .toBeGreaterThan(-1);
  return source.slice(start, end);
}

/**
 * `field` có thật sự được so sánh bằng `!==` giữa hai vế trong đoạn source này
 * không (thứ tự hai vế không quan trọng). Nếu ai đó bỏ dòng so sánh reasoning
 * khỏi hasStoredMessageChanged thì đây là dòng duy nhất đỏ.
 */
function comparesField(body: string, field: string): boolean {
  const hits = [`previous.${field}`, `next.${field}`]
    .map((m) => ({ m, at: body.indexOf(m) }))
    .sort((a, b) => a.at - b.at);
  if (hits.some((h) => h.at < 0)) return false;
  const [first, second] = hits;
  return body
    .slice(first.at + first.m.length, second.at)
    .includes('!==');
}

describe('hasStoredMessageChanged phải SO SÁNH reasoning', () => {
  const comparator = between(
    'function hasStoredMessageChanged(',
    'function toolInvocationSignature(',
  );

  it('comparator nhắc tới cả hai vế của reasoning bằng !==', () => {
    expect(
      comparesField(comparator, 'reasoning'),
      'hasStoredMessageChanged không so sánh reasoning → reconcile sẽ bỏ qua lượt ghi và reasoning KHÔNG BAO GIỜ được persist.',
    ).toBe(true);
  });

  it('so sánh qua toStoredReasoning nên undefined vs chuỗi rỗng không sinh lượt ghi rác', () => {
    // Gỡ toStoredReasoning ở phép so sánh → row có `reasoning: ''` sẽ khác
    // `undefined` và đẩy một lượt ghi vô nghĩa vào IndexedDB mỗi lần reconcile.
    expect(
      /toStoredReasoning\(previous\.reasoning\)/.test(comparator)
      && /toStoredReasoning\(next\.reasoning\)/.test(comparator),
    ).toBe(true);
  });
});

describe('cả hai chỗ dựng StoredMessage đều phải gán reasoning', () => {
  it('row đã tồn tại (updated) gán reasoning', () => {
    const updated = between(
      'const updated: StoredMessage = {',
      'hasStoredMessageChanged(',
    );
    expect(updated).toMatch(/\breasoning:/);
  });

  it('row mới (newRow) gán reasoning', () => {
    const newRow = between(
      'const newRow: StoredMessage = {',
      'workingRows.push(newRow);',
    );
    expect(newRow).toMatch(/\breasoning:/);
  });
});

describe('schema Dexie không index reasoning', () => {
  it('không khối stores() nào chứa "reasoning" — index nó sẽ bắt buộc migration', () => {
    const blocks = [...dbSource.matchAll(/\.stores\(\{([\s\S]*?)\n {4}\}\);/g)]
      .map((m) => m[1]);
    expect(blocks.length, 'không đọc được khối .stores() nào trong lib/db.ts')
      .toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).not.toMatch(/reasoning/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Behaviour                                                           */
/* ------------------------------------------------------------------ */

function userRow(): StoredMessage {
  return {
    id: 'u1',
    chatId: 'c1',
    role: 'user',
    content: 'hỏi',
    parentId: ROOT,
    seq: 0,
    branchOrder: 0,
    branchTieBreaker: 'u1',
    createdAt: 1,
    status: 'complete',
    finishReason: 'stop',
  };
}

function assistantRow(
  extra: Partial<StoredMessage> = {},
): StoredMessage {
  return {
    id: 'a1',
    chatId: 'c1',
    role: 'assistant',
    content: 'Câu trả lời',
    parentId: 'u1',
    seq: 1,
    branchOrder: 0,
    branchTieBreaker: 'a1',
    createdAt: 2,
    status: 'complete',
    finishReason: 'stop',
    ...extra,
  };
}

const assistantMessage = (
  extra: Partial<Message> = {},
): Message => ({
  id: 'a1',
  role: 'assistant',
  content: 'Câu trả lời',
  ...extra,
});

function reconcile(
  visible: Message[],
  tree: StoredMessage[],
) {
  return reconcileActiveMessages(
    'c1',
    visible,
    tree,
    null,
    false,
    'stop',
  );
}

describe('đường ghi — reconcileActiveMessages', () => {
  it('chỉ reasoning đổi (content giống hệt) vẫn phải được ghi', async () => {
    // Đây là hình thức bug: content của assistant không đổi trong lúc
    // reasoning còn chảy, comparator bỏ qua → reasoning không bao giờ ghi.
    const result = await reconcile(
      [assistantMessage({ reasoning: 'Đang cân nhắc cách A' })],
      [userRow(), assistantRow()],
    );

    expect(result.changedRows).toHaveLength(1);
    expect(result.changedRows[0].reasoning).toBe('Đang cân nhắc cách A');
  });

  it('row MỚI mang reasoning', async () => {
    const result = await reconcile(
      [assistantMessage({ reasoning: 'Suy nghĩ lần đầu' })],
      [userRow()],
    );

    expect(result.newRows).toHaveLength(1);
    expect(result.newRows[0].reasoning).toBe('Suy nghĩ lần đầu');
  });

  it('lượt không mang reasoning thì giữ bản đã lưu, không xoá trắng', async () => {
    const result = await reconcile(
      [assistantMessage({ content: 'Câu trả lời dài hơn' })],
      [userRow(), assistantRow({ reasoning: 'Suy nghĩ lần trước' })],
    );

    expect(result.changedRows).toHaveLength(1);
    expect(result.changedRows[0].reasoning).toBe('Suy nghĩ lần trước');
  });

  it('row không đổi gì thì không sinh lượt ghi', async () => {
    const result = await reconcile(
      [assistantMessage({ reasoning: 'Suy nghĩ lần trước' })],
      [userRow(), assistantRow({ reasoning: 'Suy nghĩ lần trước' })],
    );

    expect(result.changedRows).toHaveLength(0);
    expect(result.newRows).toHaveLength(0);
  });

  it('reasoning toàn khoảng trắng không được ghi', async () => {
    const result = await reconcile(
      [assistantMessage({ reasoning: '   \n  ' })],
      [userRow()],
    );

    expect(result.newRows[0].reasoning).toBeUndefined();
  });
});

describe('đường đọc — toChatMessage', () => {
  it('trả lại nguyên văn reasoning đã lưu', () => {
    const msg = toChatMessage(
      assistantRow({ reasoning: 'Dòng 1\nDòng 2' }),
      new Set(),
    );
    expect(msg.reasoning).toBe('Dòng 1\nDòng 2');
  });

  it('row cũ không có reasoning: không ném, không gắn khoá rỗng', () => {
    const msg = toChatMessage(assistantRow(), new Set());
    expect('reasoning' in msg).toBe(false);
  });

  it('reasoning hỏng (không phải string) không làm hỏng cả lượt hydrate', () => {
    const msg = toChatMessage(
      assistantRow({ reasoning: 42 as unknown as string }),
      new Set(),
    );
    expect('reasoning' in msg).toBe(false);
    expect(msg.content).toBe('Câu trả lời');
  });

  it('reasoning toàn khoảng trắng không gắn khoá', () => {
    const msg = toChatMessage(assistantRow({ reasoning: ' \n ' }), new Set());
    expect('reasoning' in msg).toBe(false);
  });

  it('vòng tròn đầy đủ: stream → lưu → tải lại, reasoning còn nguyên', async () => {
    const text = 'Bước 1: đọc file.\nBước 2: sửa lỗi.';
    const written = await reconcile(
      [assistantMessage({ reasoning: text })],
      [userRow()],
    );
    const restored = toChatMessage(written.newRows[0], new Set());

    expect(restored.reasoning).toBe(text);
  });
});