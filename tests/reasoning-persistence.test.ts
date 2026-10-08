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

describe('hasStoredMessageChanged phải SO SÁNH lượt (nếu không, nâng cấp dữ liệu không bao giờ ghi)', () => {
  const comparator = between(
    'function hasStoredMessageChanged(',
    'function toolInvocationSignature(',
  );

  it('comparator nhắc tới cả hai vế của turnId bằng !==', () => {
    /* Với row cũ, `turnId` là trường DUY NHẤT đổi — bỏ nó khỏi phép so sánh thì
       nâng cấp lượt chết lặng y hệt bug reasoning/toolInvocations mà file này
       viết ra để canh. */
    expect(
      comparesField(comparator, 'turnId'),
      'hasStoredMessageChanged không so sánh turnId → hội thoại cũ mãi mãi không có lượt.',
    ).toBe(true);
  });

  it('schema Dexie không index turnId — index nó sẽ bắt buộc migration', () => {
    const blocks = [...dbSource.matchAll(/\.stores\(\{([\s\S]*?)\n {4}\}\);/g)]
      .map((m) => m[1]);
    for (const block of blocks) {
      expect(block, 'turnId không được nằm trong .stores(): trường không index thì không cần bump version Dexie').not.toMatch(/turnId/);
    }
    expect(dbSource, 'StoredMessage phải khai trường turnId').toMatch(/\n  turnId\?: string;/);
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

/*
 * Fixture mang `turnId` sẵn: đây là dạng row SAU lần nâng cấp lượt.
 *
 * Lý do phải có: khi row còn thiếu `turnId`, reconcile ghi nó MỘT lần để nâng
 * cấp dữ liệu (xem describe "nâng cấp lượt" ở cuối file) — nên mọi test "row
 * không đổi gì thì không ghi" dùng fixture cũ sẽ đỏ vì lý do đúng. Fixture ở
 * đây đại diện dữ liệu đã nâng cấp để phép so sánh vẫn đo ĐÚNG thứ nó định đo.
 */
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
    turnId: 'luot-1',
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
    turnId: 'luot-1',
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
  options: { loading?: boolean; intent?: 'new' | 'continue' | null } = {},
) {
  return reconcileActiveMessages(
    'c1',
    visible,
    tree,
    null,
    options.loading ?? false,
    'stop',
    options.intent ?? null,
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

  it('trả lại LƯỢT của row cho tầng hiển thị, và không gắn khoá rỗng cho row cũ', () => {
    /* Turn header gắn vào tin đầu của lượt (DESIGN.md §15.1 điểm 4). Thiếu
       `turnId` ở đường đọc thì mọi lượt cũ trở thành một lượt mới toanh ở UI,
       hoặc mất header — mà không có lỗi nào báo. */
    const upgraded = toChatMessage(assistantRow({ turnId: 'luot-7' }), new Set());
    expect(upgraded.turnId).toBe('luot-7');

    const legacy = toChatMessage(assistantRow({ turnId: undefined }), new Set());
    expect('turnId' in legacy, 'khoá rỗng luôn hiện diện sẽ làm memo so sánh sai').toBe(false);
  });

  it('row cũ đọc ra mốc thời gian dạng số để turn header in giờ', () => {
    const msg = toChatMessage(assistantRow({ createdAt: 1_700_000_000_000 }), new Set());
    expect(msg.createdAtMs).toBe(1_700_000_000_000);
  });
});

describe('nâng cấp LƯỢT — ghi một lần rồi thôi', () => {
  it('hội thoại cũ chưa có turnId được cấp lượt trong lần reconcile đầu tiên', async () => {
    /* Cùng luật với mọi đường khác (`lib/turns.ts`): tin người dùng mở lượt,
       tin trợ lý nối vào. Ghi lại MỘT lần là đủ; từ đó ranh giới lượt là dữ
       liệu đã lưu, không phải phép gom lúc vẽ. */
    const legacyUser: StoredMessage = { ...userRow(), turnId: undefined };
    const legacyAssistant: StoredMessage = { ...assistantRow(), turnId: undefined };
    const result = await reconcile(
      [
        { id: 'u1', role: 'user', content: 'hỏi' } as Message,
        { id: 'a1', role: 'assistant', content: 'Câu trả lời' } as Message,
      ],
      [legacyUser, legacyAssistant],
    );

    const written = new Map(result.changedRows.map((row) => [row.id, row.turnId]));
    expect(written.get('u1'), 'thiếu lượt thì header của lượt mất theo').toBeTruthy();
    expect(written.get('u1')).toBe(written.get('a1'));
  });

  it('chạy lại trên cây đã nâng cấp thì KHÔNG sinh lượt ghi nào', async () => {
    /* Nếu đây đỏ: mỗi lần reconcile lại ghi lại cả cây — đúng thứ làm hỏng
       IndexedDB của hội thoại dài, và cũng là thứ test "row không đổi gì thì
       không sinh lượt ghi" canh ở trên. */
    const first = await reconcile(
      [{ id: 'u1', role: 'user', content: 'hỏi' } as Message],
      [{ ...userRow(), turnId: undefined }],
    );
    const upgraded = first.changedRows.length > 0
      ? first.changedRows
      : first.newRows;

    const second = await reconcile(
      [{ id: 'u1', role: 'user', content: 'hỏi' } as Message],
      upgraded,
    );
    expect(second.changedRows).toHaveLength(0);
    expect(second.newRows).toHaveLength(0);
  });

  it('gửi khi agent đang chạy → CHUNG lượt; gửi khi đã xong → lượt mới', async () => {
    /* Đây là ranh giới lượt chạy end-to-end qua ĐÚNG hàm ghi: dữ liệu vào là
       trạng thái row, quyết định ra là dữ liệu lưu. */
    const streamingAssistant = assistantRow({ status: 'streaming', finishReason: undefined });
    const sameTurn = await reconcile(
      [
        { id: 'u1', role: 'user', content: 'hỏi' } as Message,
        { id: 'a1', role: 'assistant', content: 'Câu trả lời' } as Message,
        { id: 'u2', role: 'user', content: 'bổ sung: nhớ chạy test' } as Message,
      ],
      [userRow(), streamingAssistant],
      { loading: true },
    );
    const added = new Map(sameTurn.newRows.map((row) => [row.id, row.turnId]));
    expect(added.get('u2'), 'tin bổ sung khi đang chạy thuộc lượt đang mở').toBe('luot-1');

    const newTurn = await reconcile(
      [
        { id: 'u1', role: 'user', content: 'hỏi' } as Message,
        { id: 'a1', role: 'assistant', content: 'Câu trả lời' } as Message,
        { id: 'u2', role: 'user', content: 'việc khác' } as Message,
      ],
      [userRow(), assistantRow()],
    );
    const second = new Map(newTurn.newRows.map((row) => [row.id, row.turnId]));
    expect(second.get('u2'), 'lượt đã xong thì tin kế tiếp là việc mới').not.toBe('luot-1');
    expect(second.get('u2')).toBeTruthy();
  });

  it('ý định `new` của sự kiện thắng trạng thái row đang stream', async () => {
    /* Alt+Enter (follow-up) khi agent đang chạy = "việc khác": nếu trạng thái
       row thắng thì việc mới bị gộp âm thầm vào lượt cũ — đúng thứ bảng §15.1
       cấm. */
    const result = await reconcile(
      [
        { id: 'u1', role: 'user', content: 'hỏi' } as Message,
        { id: 'a1', role: 'assistant', content: 'Câu trả lời' } as Message,
        { id: 'u2', role: 'user', content: 'việc khác' } as Message,
      ],
      [userRow(), assistantRow({ status: 'streaming', finishReason: undefined })],
      { loading: true, intent: 'new' },
    );
    const added = new Map(result.newRows.map((row) => [row.id, row.turnId]));
    expect(added.get('u2')).not.toBe('luot-1');
  });
});