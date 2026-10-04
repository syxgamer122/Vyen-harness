/**
 * RED TEAM — offset `at` của timeline bị tính sai ở tầng route.
 *
 * Timeline là feature chính: chip tool nằm đúng chỗ model gọi tool. Vị trí đó
 * đến từ `at: emittedChars` (app/api/chat/route.ts:2417), còn `emittedChars`
 * được tăng trong `writeText` — hàm mà CẢ kênh 'text' lẫn 'reasoning' đều gọi.
 *
 * File này THỰC SỰ CHẠY `writeText` (rút nguyên văn từ source route.ts, bỏ
 * chú thích kiểu TypeScript, dựng trong harness), rồi đưa con số nó sinh ra
 * vào `buildTimeline` thật. Không assert bằng regex "đoán xem"; assert bằng
 * hành vi.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildTimeline, type ToolEvent } from '@/components/chat/tool-trace';

const ROUTE_SRC = fs
  .readFileSync(path.resolve(__dirname, '../app/api/chat/route.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

/** Cắt một khối function/arrow bắt đầu tại `start`, khớp ngoặc. */
function extractBlock(src: string, startNeedle: string, opener: string, closer: string): string {
  const i = src.indexOf(startNeedle);
  expect(i, `không tìm thấy: ${startNeedle}`).toBeGreaterThan(-1);
  let depth = 0;
  let seen = false;
  for (let k = src.indexOf(opener, i); k < src.length; k += 1) {
    if (src[k] === opener) {
      depth += 1;
      seen = true;
    } else if (src[k] === closer) {
      depth -= 1;
      if (seen && depth === 0) return src.slice(i, k + 1);
    }
  }
  throw new Error(`không cân bằng ngoặc cho ${startNeedle}`);
}

const EXTRACT_DELTA_RAW = extractBlock(
  ROUTE_SRC,
  'function extractDelta(',
  '{',
  '}',
);
const WRITE_TEXT_RAW = extractBlock(
  ROUTE_SRC,
  'const writeText = (raw: unknown',
  '{',
  '}',
);

/* Bỏ kiểu TypeScript để `new Function` dựng được. Assert từng phép thay đổi
   để refactor làm hỏng thì phải đỏ, không được lặng lẽ test trỏ nhầm hàm. */
const extractDeltaJS = EXTRACT_DELTA_RAW
  .replace('function extractDelta(part: unknown): string {', 'function extractDelta(part) {')
  .replace('part as Record<string, unknown>', 'part');
expect(EXTRACT_DELTA_RAW).toContain('function extractDelta(part: unknown): string {');
expect(extractDeltaJS).toContain('function extractDelta(part) {');

const writeTextJS = WRITE_TEXT_RAW.replace(
  "const writeText = (raw: unknown, channel: 'text' | 'reasoning' = 'text') => {",
  'const writeText = (raw, channel = "text") => {',
);
expect(WRITE_TEXT_RAW).toContain(
  "const writeText = (raw: unknown, channel: 'text' | 'reasoning' = 'text') => {",
);
expect(writeTextJS).toContain('const writeText = (raw, channel = "text") => {');

const HARD_ARTIFACT_SRC = ROUTE_SRC.match(/^const HARD_ARTIFACT = .*$/m)?.[0];
expect(HARD_ARTIFACT_SRC, 'không tìm thấy HARD_ARTIFACT').toBeTruthy();

interface Harness {
  /** Ghi một delta — đúng như route gọi. */
  writeText: (raw: unknown, channel?: 'text' | 'reasoning') => void;
  /** Giá trị route sẽ ghi vào annotation `at`. */
  emittedChars: () => number;
  /** Nội dung `message.content` mà useChat dựng lại từ kênh text. */
  content: () => string;
  /** Nội dung `message.reasoning`. */
  reasoning: () => string;
}

function makeHarness(): Harness {
  const factory = new Function(
    `${extractDeltaJS}
${HARD_ARTIFACT_SRC}
let heldSuspect = '';
let emittedChars = 0;
const written = [];
const dataStream = { write: (p) => written.push(p) };
function formatDataStreamPart(type, value) { return { type, value }; }
function stopHeartbeat() {}
${writeTextJS}
return {
  writeText,
  emittedChars: () => emittedChars,
  content: () => written.filter((p) => p.type === 'text').map((p) => p.value).join(''),
  reasoning: () => written.filter((p) => p.type === 'reasoning').map((p) => p.value).join(''),
  written,
};`,
  ) as () => {
    writeText: (raw: unknown, channel?: 'text' | 'reasoning') => void;
    emittedChars: () => number;
    content: () => string;
    reasoning: () => string;
    written: Array<{ type: string; value: string }>;
  };

  return factory();
}

function ev(id: string, at: number): ToolEvent {
  return { id, name: 'fs_read', done: false, args: '{"path":"a.ts"}', summary: '', at };
}

/** Vị trí (chỉ số trong content) của chip `id` trong timeline dựng được. */
function chipOffset(timeline: ReturnType<typeof buildTimeline>, id: string): number {
  let n = 0;
  for (const seg of timeline ?? []) {
    if (seg.kind === 'text') n += seg.text.length;
    else if (seg.event.id === id) return n;
  }
  return -1;
}

/* ------------------------------------------------------------------ */

describe('writeText — kênh reasoning KHÔNG được tính vào offset của kênh text', () => {
  it('offset `at` phải là chỉ số hợp lệ trong message.content', () => {
    const h = makeHarness();
    h.writeText('Để tôi đọc file trước.', 'text');
    const atToolCall = h.emittedChars();
    h.writeText('Chờ, để tôi suy nghĩ kỹ đã…', 'reasoning');
    const atAfterReasoning = h.emittedChars();
    h.writeText('Tôi sẽ mở a.ts.', 'text');

    expect(atAfterReasoning).toBeLessThanOrEqual(h.content().length);
    expect(atToolCall).toBeLessThanOrEqual(h.content().length);
  });

  it('emittedChars phải bằng ĐỘ DÀI kênh text, không phải tổng mọi kênh', () => {
    const h = makeHarness();
    h.writeText('abc', 'text');
    h.writeText('suy nghĩ dài hơn nhiều', 'reasoning');
    h.writeText('def', 'text');
    expect(h.emittedChars()).toBe(h.content().length);
  });

  it('suy nghĩ dài rồi mới nói: chip vẫn phải nằm đúng chỗ model gọi tool', () => {
    const h = makeHarness();
    h.writeText('Đầu tiên tôi kiểm tra thư mục.', 'text');
    const trueCallOffset = h.content().length; // model gọi tool NGAY ĐÂY
    h.writeText(
      'Suy nghĩ: cần xem cấu trúc dự án trước, có lẽ nên đọc package.json và các file cấu hình, rồi mới sửa. '.repeat(2),
      'reasoning',
    );
    const atSentToClient = h.emittedChars();
    h.writeText('Tiếp theo tôi đọc a.ts.', 'text');
    h.writeText('Kết luận.', 'text');

    const tl = buildTimeline(h.content(), [ev('t1', atSentToClient)]);
    expect(chipOffset(tl, 't1')).toBe(trueCallOffset);
  });

  it('nhiều lượt tool sau reasoning: không chip nào bị dồn hết xuống cuối', () => {
    const h = makeHarness();
    h.writeText('Bước 1: đọc file.', 'text');
    const at1 = h.emittedChars();
    h.writeText('Một đoạn suy nghĩ không ngắn.'.repeat(5), 'reasoning');
    h.writeText('Bước 2: ghi file.', 'text');
    const at2 = h.emittedChars();
    h.writeText('Bước 3: chạy test.', 'text');
    const at3 = h.emittedChars();
    h.writeText('Xong.', 'text');

    const content = h.content();
    const tl = buildTimeline(content, [ev('t1', at1), ev('t2', at2), ev('t3', at3)]);
    const offsets = [chipOffset(tl, 't1'), chipOffset(tl, 't2'), chipOffset(tl, 't3')];
    /* Ít nhất chip 1 phải rơi trước câu kết luận, đúng thứ tự model làm. */
    expect(offsets[0]).toBeLessThan(content.length);
    expect(offsets[0]).toBeLessThanOrEqual(offsets[2]);
    /* Và text vẫn phải tái dựng đủ — lỗi này là LỆCH THỨ TỰ, không phải mất chữ. */
    const rebuilt = tl
      ?.filter((s) => s.kind === 'text')
      .map((s) => (s as { text: string }).text)
      .join('');
    expect(rebuilt).toBe(content);
  });
});

describe('writeText — delta bị giữ lại không được đổi kênh', () => {
  it('delta text bị hold rồi xả ra KHÔNG được rơi vào kênh reasoning', () => {
    const h = makeHarness();
    h.writeText('[object Object]', 'text'); // bị HOLD (HARD_ARTIFACT)
    h.writeText('suy nghĩ', 'reasoning'); // lần ghi kế phải xả heldSuspect
    expect(h.reasoning()).not.toContain('[object Object]');
    expect(h.content()).toContain('[object Object]');
  });

  it('delta text bị hold rồi xả ra khi kênh kế tiếp là text thì vẫn vào content', () => {
    const h = makeHarness();
    h.writeText('undefined', 'text');
    h.writeText('tiếp', 'text');
    expect(h.content()).toBe('undefinedtiếp');
  });

  it('emittedChars phải khớp content sau khi xả delta bị hold', () => {
    const h = makeHarness();
    h.writeText('undefined', 'text');
    h.writeText('suy nghĩ dài', 'reasoning');
    h.writeText('nói', 'text');
    expect(h.emittedChars()).toBe(h.content().length);
  });
});

describe('writeText — đầu vào rác không được làm lệch offset', () => {
  it('delta undefined / null / rỗng không được cộng vào emittedChars', () => {
    const h = makeHarness();
    h.writeText('abc', 'text');
    const before = h.emittedChars();
    h.writeText(undefined, 'text');
    h.writeText(null, 'text');
    h.writeText('', 'text');
    h.writeText(12345, 'text');
    expect(h.emittedChars()).toBeGreaterThanOrEqual(before);
  });

  it('delta trùng lặp (gateway replay) không được làm lệch content lẫn offset', () => {
    const h = makeHarness();
    h.writeText('abc', 'text');
    h.writeText('abc', 'text');
    expect(h.content()).toBe('abcabc');
    expect(h.emittedChars()).toBe(h.content().length);
  });

  it('part là object (textDelta) được rút ra như ký tự thật, không phải "[object Object]"', () => {
    const h = makeHarness();
    h.writeText({ textDelta: 'nội dung' }, 'text');
    expect(h.content()).toBe('nội dung');
    expect(h.emittedChars()).toBe('nội dung'.length);
  });

  it('part là object có `reasoning` nhưng channel=text thì KHÔNG được đếm vào text', () => {
    /* extractDelta ưu tiên textDelta→text→delta→reasoning. Ở đây chỉ kiểm
       rằng thứ gì được ghi ra cũng phải khớp với thứ được đếm. */
    const h = makeHarness();
    h.writeText({ reasoning: 'suy nghĩ' }, 'text');
    expect(h.emittedChars()).toBe(h.content().length);
  });

  it('20 bước xen kẽ text/reasoning: emittedChars luôn khớp content', () => {
    const h = makeHarness();
    for (let i = 0; i < 20; i += 1) {
      h.writeText(`nói ${i} `, 'text');
      h.writeText(`nghĩ ${i} `, 'reasoning');
    }
    expect(h.emittedChars()).toBe(h.content().length);
  });
});
