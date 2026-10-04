/**
 * Hồi quy cho ba lỗi ở tầng route (app/api/chat/route.ts) mà timeline của
 * tool call dựa vào:
 *
 *  1. `emittedChars` trước đây đếm CẢ kênh reasoning nhưng lại là chỉ số
 *     đặt vào `message.content` — content chỉ có kênh text. Mọi `at` sau
 *     đoạn suy nghĩ đầu tiên trượt sang phải, buildTimeline clamp về đuôi và
 *     toàn bộ chip dồn xuống dưới kết luận của model.
 *  2. `emittedChars` bắt đầu lại từ 0 ở MỖI request, trong khi content phía
 *     client tự tăng qua các vòng client-tool (useChat nối thêm vào chính
 *     message assistant) — `at` của vòng sau rơi về 0 và chip bị xếp ngược.
 *  3. Không ai ghi `isError`/`error` vào annotation `phase:'done'` nên một
 *     `shell_run` exit ≠ 0 vẫn hiện chip "xong".
 *
 * File này THỰC SỰ CHẠY `writeText`/`writeReasoning`/`carriedTextCharsOf`
 * rút nguyên văn từ source route.ts (bỏ kiểu, dựng trong harness) rồi đưa
 * offset sinh ra vào `buildTimeline` thật. Không assert bằng regex "đoán xem".
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildTimeline, type ToolEvent } from '@/components/chat/tool-trace';
import { isToolFailure } from '@/lib/model-routing';

const ROUTE_SRC = fs
  .readFileSync(path.resolve(__dirname, '../app/api/chat/route.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

/** Cắt một khối function/arrow bắt đầu tại `start`, khớp ngoặc. */
function extractBlock(src: string, startNeedle: string): string {
  const i = src.indexOf(startNeedle);
  expect(i, `không tìm thấy: ${startNeedle}`).toBeGreaterThan(-1);
  let depth = 0;
  let seen = false;
  for (let k = src.indexOf('{', i); k < src.length; k += 1) {
    if (src[k] === '{') {
      depth += 1;
      seen = true;
    } else if (src[k] === '}') {
      depth -= 1;
      if (seen && depth === 0) return src.slice(i, k + 1);
    }
  }
  throw new Error(`không cân bằng ngoặc cho ${startNeedle}`);
}

const EXTRACT_DELTA_RAW = extractBlock(ROUTE_SRC, 'function extractDelta(');
const WRITE_TEXT_RAW = extractBlock(ROUTE_SRC, 'const writeText = (raw: unknown');
const WRITE_REASONING_RAW = extractBlock(ROUTE_SRC, 'const writeReasoning = (raw: unknown');
const CARRIED_RAW = extractBlock(ROUTE_SRC, 'function carriedTextCharsOf(');

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

const writeReasoningJS = WRITE_REASONING_RAW.replace(
  'const writeReasoning = (raw: unknown) => {',
  'const writeReasoning = (raw) => {',
);
expect(WRITE_REASONING_RAW).toContain('const writeReasoning = (raw: unknown) => {');
expect(writeReasoningJS).toContain('const writeReasoning = (raw) => {');

const carriedJS = CARRIED_RAW.replace(
  /function carriedTextCharsOf\(messages: Array<z\.infer<typeof MessageSchema>>\): number \{/,
  'function carriedTextCharsOf(messages) {',
);
expect(CARRIED_RAW).toContain(
  'function carriedTextCharsOf(messages: Array<z.infer<typeof MessageSchema>>): number {',
);
expect(carriedJS).toContain('function carriedTextCharsOf(messages) {');

const HARD_ARTIFACT_SRC = ROUTE_SRC.match(/^const HARD_ARTIFACT = .*$/m)?.[0];
expect(HARD_ARTIFACT_SRC, 'không tìm thấy HARD_ARTIFACT').toBeTruthy();

interface Counters {
  writeText: (raw: unknown, channel?: 'text' | 'reasoning') => void;
  writeReasoning: (raw: unknown) => void;
  /** Giá trị route sẽ ghi vào annotation `at`. */
  at: () => number;
  /** Ký tự text của RIÊNG request này (không tính phần mang từ vòng trước). */
  textCharsThisRequest: () => number;
  reasoningChars: () => number;
  content: () => string;
  reasoning: () => string;
}

/**
 * Dựng lại đúng bộ đếm của `execute`: `emittedChars` bắt đầu từ phần text
 * client đang giữ, `textCharsThisRequest` là hiệu của nó trừ phần đó.
 */
function makeCounters(carried: number): Counters {
  const factory = new Function(
    'CARRIED',
    `${extractDeltaJS}
${HARD_ARTIFACT_SRC}
${carriedJS}
let heldSuspect = '';
let emittedChars = CARRIED;
let reasoningChars = 0;
const textCharsThisRequest = () => emittedChars - CARRIED;
const written = [];
const dataStream = { write: (p) => written.push(p) };
function formatDataStreamPart(type, value) { return { type, value }; }
function stopHeartbeat() {}
${writeTextJS}
${writeReasoningJS}
return {
  writeText,
  writeReasoning,
  at: () => emittedChars,
  textCharsThisRequest,
  reasoningChars: () => reasoningChars,
  content: () => written.filter((p) => p.type === 'text').map((p) => p.value).join(''),
  reasoning: () => written.filter((p) => p.type === 'reasoning').map((p) => p.value).join(''),
};`,
  ) as (carried: number) => Counters;
  return factory(carried);
}

/** Message trên wire, đúng hình dạng `MessageSchema` của route (chỉ 2 field
 *  mà hàm này đọc, cộng toolInvocations cho mô phỏng vòng client-tool). */
interface WireMessage {
  role: string;
  content: unknown;
  toolInvocations?: unknown;
}

const carriedTextCharsOf = (() => {
  const build = new Function(`${carriedJS}\nreturn carriedTextCharsOf;`) as () => (
    m: WireMessage[],
  ) => number;
  return build();
})();

function ev(id: string, at: number): ToolEvent {
  return { id, name: 'fs_read', done: false, args: '', summary: '', at };
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

function rebuiltText(timeline: ReturnType<typeof buildTimeline>): string {
  return (timeline ?? [])
    .filter((s) => s.kind === 'text')
    .map((s) => (s as { text: string }).text)
    .join('');
}

/* ------------------------------------------------------------------ */

/**
 * `at` là chỉ số trong `message.content` phía client. Content đó TỰ TĂNG:
 * useChat thay chính message assistant cuối rồi nối text lượt mới vào nó
 * (`processChatResponse`: `message.content += value`). Mỗi vòng client-tool
 * là một POST mới nên bộ đếm phải bắt đầu từ phần client đang giữ.
 */
describe('carriedTextCharsOf — offset tuyệt đối qua các vòng client-tool', () => {
  it('lượt user mới (message cuối là user) → 0', () => {
    expect(carriedTextCharsOf([{ role: 'user', content: 'đọc file giúp tôi' }])).toBe(0);
  });

  it('lượt tiếp theo (message cuối là assistant, content là chuỗi) → độ dài chuỗi', () => {
    expect(carriedTextCharsOf([{ role: 'user', content: 'a' }, { role: 'assistant', content: '0123456789' }])).toBe(10);
  });

  it('content là MẢNG parts (vision) → 0, không bịa offset đo trên hình dạng chưa đo', () => {
    const parts = [{ type: 'text', text: 'x'.repeat(500) }, { type: 'image', image: 'data:...' }];
    expect(carriedTextCharsOf([{ role: 'assistant', content: parts }])).toBe(0);
  });

  it('mảng rỗng / không có message → 0', () => {
    expect(carriedTextCharsOf([])).toBe(0);
    expect(carriedTextCharsOf([{ role: 'assistant', content: '' }])).toBe(0);
  });
});

/**
 * Ba vòng agent: mỗi vòng model viết một đoạn rồi gọi một tool client, client
 * thực thi rồi resubmit. Chạy `writeText` thật với `carried` đúng như route
 * tính, đưa `at` vào `buildTimeline` thật.
 */
function simulateAgentTurns(
  turns: Array<{ prose: string; tool: string }>,
  reasoningPerTurn = 0,
): { content: string; events: ToolEvent[] } {
  let content = '';
  const events: ToolEvent[] = [];
  let lastMessage: WireMessage = { role: 'user', content: 'làm đi' };

  for (const turn of turns) {
    const carried = carriedTextCharsOf([lastMessage]);
    const h = makeCounters(carried);
    for (let k = 0; k < reasoningPerTurn; k += 1) {
      h.writeReasoning('suy nghĩ dài về kiến trúc dự án. ');
    }
    h.writeText(turn.prose, 'text');
    events.push({ ...ev(turn.tool, h.at()), name: turn.tool });
    /* Client dựng lại content: mang sẵn của các vòng trước + text lượt này. */
    content = content + h.content();
    lastMessage = {
      role: 'assistant',
      content,
      toolInvocations: [{ toolCallId: turn.tool, toolName: turn.tool, state: 'result' }],
    };
  }
  return { content, events };
}

describe('`at` qua nhiều vòng — chip phải nằm đúng chỗ model gọi tool', () => {
  const TURNS = [
    { prose: 'Bước 1: tôi đọc file cấu hình.', tool: 'fs_read' },
    { prose: 'Bước 2: tôi sửa dòng hỏng.', tool: 'fs_write' },
    { prose: 'Bước 3: tôi chạy lại test.', tool: 'shell_run' },
  ];

  it('offset vòng sau là vị trí TUYỆT ĐỐI, không bị đặt lại về 0', () => {
    const { content, events } = simulateAgentTurns(TURNS);
    const expected = [
      TURNS[0].prose.length,
      TURNS[0].prose.length + TURNS[1].prose.length,
      TURNS[0].prose.length + TURNS[1].prose.length + TURNS[2].prose.length,
    ];
    expect(events.map((e) => e.at)).toEqual(expected);

    const timeline = buildTimeline(content, events);
    expect(chipOffset(timeline, 'fs_read')).toBe(expected[0]);
    expect(chipOffset(timeline, 'fs_write')).toBe(expected[1]);
    expect(chipOffset(timeline, 'shell_run')).toBe(expected[2]);
    expect(rebuiltText(timeline)).toBe(content);
  });

  it('lượt có reasoning dài: suy nghĩ KHÔNG đẩy chip', () => {
    /* Mô phỏng: mỗi vòng model nghĩ 150 ký tự rồi mới viết lời rồi gọi tool.
       Reasoning không nằm trong content nên `at` phải y hệt lượt không nghĩ. */
    const { content, events } = simulateAgentTurns(TURNS, 3);
    const plain = simulateAgentTurns(TURNS);
    expect(events.map((e) => e.at)).toEqual(plain.events.map((e) => e.at));
    expect(content).toBe(plain.content);
    expect(rebuiltText(buildTimeline(content, events))).toBe(content);
  });
});

/**
 * Hai bộ đếm có NGHĨA KHÁC NHAU và phải tách bạch:
 *  - `emittedChars` = offset vào content client → chỉ kênh text.
 *  - `reasoningChars` = đã có byte suy nghĩ ra chưa → không được chạm offset.
 */
describe('hai bộ đếm không lẫn vào nhau', () => {
  it('suy nghĩ đủ dài vẫn để textCharsThisRequest bằng 0 và offset đứng yên', () => {
    const h = makeCounters(0);
    h.writeReasoning('nghĩ rất lâu. '.repeat(50));
    expect(h.reasoningChars()).toBeGreaterThan(0);
    expect(h.textCharsThisRequest()).toBe(0);
    expect(h.at()).toBe(0);
    expect(h.content()).toBe('');
  });

  it('vòng tiếp theo: `at` cộng phần mang sẵn, textCharsThisRequest vẫn đếm riêng lượt này', () => {
    const carried = carriedTextCharsOf([{ role: 'assistant', content: 'Bước 1: tôi đọc file.' }]);
    const h = makeCounters(carried);
    h.writeReasoning('nghĩ. ');
    h.writeText('Bước 2.', 'text');
    expect(h.at()).toBe(carried + 'Bước 2.'.length);
    expect(h.textCharsThisRequest()).toBe('Bước 2.'.length);
    expect(h.reasoningChars()).toBe('nghĩ. '.length);
  });

  it('route khai báo đúng hai bộ đếm, không gộp làm một', () => {
    /* Đổi `let emittedChars = carriedTextChars;` thành `= 0` → ĐỎ (vòng sau
       mất offset tuyệt đối). Bỏ `reasoningChars` → ĐỎ (heartbeat không còn
       biết đã có byte chưa). */
    expect(ROUTE_SRC).toMatch(/let emittedChars = carriedTextChars;/);
    expect(ROUTE_SRC).toMatch(/const textCharsThisRequest = \(\) => emittedChars - carriedTextChars;/);
    expect(ROUTE_SRC).toMatch(/let reasoningChars = 0;/);
    /* Không được để nhánh so-sánh nào hỏi `emittedChars` trực tiếp nữa: nó
       mang phần của vòng trước nên `=== 0` là sai ngay từ vòng thứ hai. */
    expect(ROUTE_SRC).not.toMatch(/emittedChars === 0/);
    expect(ROUTE_SRC).not.toMatch(/emittedChars > 0/);
  });
});

/* ------------------------------------------------------------------ */

function annotationBlock(anchor: string): string {
  const start = ROUTE_SRC.indexOf(anchor);
  expect(start, `không tìm thấy: ${anchor}`).toBeGreaterThan(-1);
  const end = ROUTE_SRC.indexOf('});', start);
  expect(end, `khối bắt đầu bằng "${anchor}" không đóng bằng });`).toBeGreaterThan(-1);
  return ROUTE_SRC.slice(start, end + 3);
}

const NATIVE_TOOL_RESULT = annotationBlock(
  "writeAnnotation({\n                          tool: {\n                            id: String((part as any).toolCallId ?? ''),\n                            name: part.toolName,\n                            phase: 'done',",
);

/**
 * `components/chat/tool-trace.tsx` quyết định chip hỏng bằng
 * `Boolean(ev.isError)` đọc từ annotation. Route phải ghi cờ đó, và chỉ khi
 * kết quả THẬT sự hỏng.
 */
describe('annotation phase done mang cờ isError thật', () => {
  it('suy cờ từ isToolFailure trên chính kết quả, không đoán theo tên tool', () => {
    expect(NATIVE_TOOL_RESULT).toMatch(
      /isToolFailure\(\{ state: 'result', result: \(part as any\)\.result \}\)/,
    );
    /* Chỉ set khi hỏng: thành công thì không có key, không phải `isError:false`
       cũng được nhưng phải là khi KHÔNG hỏng. */
    expect(NATIVE_TOOL_RESULT).toMatch(
      /\.\.\.\(isToolFailure\([\s\S]*?result: \(part as any\)\.result \}\)[\s\S]*?\?\s*\{ isError: true \}[\s\S]*?:\s*\{\}\),/,
    );
  });

  it('route dùng CHUNG phán đoán với tầng routing, không tự đoán riêng', () => {
    expect(ROUTE_SRC).toMatch(/import \{ isToolFailure \} from '@\/lib\/model-routing';/);
  });

  it('tool client quay lại ở request kế tiếp cũng được gắn cờ (shell_run không có part tool-result)', () => {
    const block = ROUTE_SRC.slice(
      ROUTE_SRC.indexOf('const inboundToolResults = parsed.data.messages'),
    );
    expect(block.slice(0, 1200)).toMatch(/if \(inv\.state !== 'result' \|\| !isToolFailure\(inv\)\) continue;/);
    expect(block.slice(0, 1200)).toMatch(
      /writeAnnotation\(\{\s*\n\s*tool: \{ id: inv\.toolCallId, name: inv\.toolName, phase: 'done', isError: true \},/,
    );
  });
});

/**
 * Bằng chứng cho phép đoán `isError`: đây là đúng các hình dạng kết quả thật
 * mà client thực thi tool trả về (react/use-chat-orchestration.ts trả
 * `JSON.stringify(VyenRunResult)`; lib/desktop-bridge.ts định nghĩa `code` là
 * exit code). Đổi phán đoán → các kỳ vọng dưới đây đỏ.
 */
describe('shell_run exit ≠ 0 phải là hỏng, exit 0 thì không', () => {
  const run = (r: unknown) => isToolFailure({ state: 'result', result: r });

  it('exit code khác 0 → hỏng', () => {
    expect(run({ code: 1, stdout: '', stderr: 'SyntaxError' })).toBe(true);
    expect(run({ code: 127, stdout: '', stderr: 'command not found' })).toBe(true);
  });

  it('exit code 0 → không hỏng', () => {
    expect(run({ code: 0, stdout: 'ok' })).toBe(false);
    expect(run({ code: null, stdout: '' })).toBe(false);
  });

  it('client trả JSON string (đúng hình dạng thật) cũng phải phân đoán được', () => {
    expect(run(JSON.stringify({ code: 1, stdout: '', stderr: 'fail' }))).toBe(true);
    expect(run(JSON.stringify({ code: 0, stdout: 'done' }))).toBe(false);
  });

  it('người dùng TỪ CHỐI approval không phải tool hỏng dù payload có field error', () => {
    /* react/use-chat-orchestration.ts trả { approved:false, error:... } khi
       cwd không hợp lệ — có field `error` nhưng KHÔNG phải tool chạy hỏng. */
    expect(
      run({ approved: false, error: 'Thư mục làm việc (cwd) không hợp lệ hoặc thoát khỏi workspace' }),
    ).toBe(false);
    expect(run({ approved: false, note: 'Người dùng TỪ CHỐI chạy lệnh này.' })).toBe(false);
  });

  it('MCP trả isError và `ok:false` đều là hỏng; kết quả bình thường thì không', () => {
    /* Hình dạng MCP thật: lib/desktop-bridge.ts VyenMcpCallResult. */
    expect(run({ content: [{ type: 'text', text: 'boom' }], isError: true })).toBe(true);
    expect(run({ content: [{ type: 'text', text: 'ok' }], isError: false })).toBe(false);
    expect(run({ ok: false, reason: 'Ghi nhớ chứa prompt-injection' })).toBe(true);
    expect(run({ results: [], note: 'Mọi kết quả đều bị lọc' })).toBe(false);
  });

  it('kết quả undefined / text thuần không bị phán thành hỏng', () => {
    expect(run(undefined)).toBe(false);
    expect(run('ba đoạn văn bình thường')).toBe(false);
    expect(run({ error: null })).toBe(false);
  });
});

/**
 * Cờ chỉ "chạy được" thì vô nghĩa: nếu vòng client-tool thứ hai phát cờ hỏng
 * cho một lần chạy thành công thì người dùng bị báo sai theo chiều khác.
 */
describe('cờ hỏng chỉ phát cho kết quả hỏng, không phát hàng loạt', () => {
  it('vòng có cả tool thành công lẫn tool hỏng → chỉ tool hỏng mang cờ', () => {
    const invocations = [
      { toolCallId: 'a', toolName: 'fs_read', state: 'result', result: JSON.stringify({ content: 'x' }) },
      { toolCallId: 'b', toolName: 'shell_run', state: 'result', result: JSON.stringify({ code: 2, stderr: 'e' }) },
      { toolCallId: 'c', toolName: 'fs_write', state: 'result', result: JSON.stringify({ written: true }) },
    ];
    const flagged = invocations.filter((inv) => isToolFailure(inv)).map((inv) => inv.toolCallId);
    expect(flagged).toEqual(['b']);
  });
});

/**
 * NEW-4: buffer sniff 40 ký tự đầu chưa vào content thì `at` của tool call
 * đầu tiên là 0 và câu mở đầu rơi xuống SAU chip.
 */
describe('buffer sniff được xả trước khi ghi annotation tool call', () => {
  it('nhánh tool-call xả buffer TRƯỚC writeAnnotation', () => {
    const start = ROUTE_SRC.indexOf("case 'tool-call': {");
    const block = ROUTE_SRC.slice(start, ROUTE_SRC.indexOf("case 'tool-result': {", start));
    expect(start).toBeGreaterThan(-1);
    const flushAt = block.indexOf("writeText(sniffHead, 'text')");
    const annotateAt = block.indexOf('writeAnnotation({');
    expect(flushAt).toBeGreaterThan(-1);
    expect(annotateAt).toBeGreaterThan(-1);
    expect(flushAt).toBeLessThan(annotateAt);
  });
});

/**
 * NEW-2: `writeAnnotation({ lastStepUsage })` lúc giá trị còn undefined bị
 * `JSON.stringify` bỏ hẳn key, client mãi không thấy và `stepPromptTokens`
 * luôn 0. Nó phải nằm trong `writeFinish`.
 */
describe('lastStepUsage được phát lúc đã có giá trị', () => {
  it('đúng MỘT chỗ phát, và nằm trong writeFinish', () => {
    const emits = ROUTE_SRC.match(/writeAnnotation\(\{ lastStepUsage \}\)/g) ?? [];
    expect(emits).toHaveLength(1);
    const finishAt = ROUTE_SRC.indexOf('const writeFinish = (');
    const emitAt = ROUTE_SRC.indexOf('writeAnnotation({ lastStepUsage })');
    expect(emitAt).toBeGreaterThan(finishAt);
  });

  it('phát trước finish_message (client đọc được trước khi stream khép)', () => {
    const finishAt = ROUTE_SRC.indexOf('const writeFinish = (');
    const tail = ROUTE_SRC.slice(finishAt);
    expect(tail.indexOf('writeAnnotation({ lastStepUsage })')).toBeLessThan(
      tail.indexOf("formatDataStreamPart('finish_message'"),
    );
  });
});

/**
 * NEW-5 (chưa sửa, file không thuộc tầng này): đường emulated vẫn không phát
 * `at` lẫn `isError`. Ghim trạng thái đang biết để khi ai sửa
 * lib/emulated-agent.ts thì test này đỏ và cập nhật kỳ vọng — im lặng bỏ qua
 * thì client tưởng đã phủ.
 */
describe('đường emulated (lib/emulated-agent.ts) chưa phủ at/isError — theo dõi', () => {
  const emu = fs
    .readFileSync(path.resolve(__dirname, '../lib/emulated-agent.ts'), 'utf8')
    .replace(/\r\n/g, '\n');
  const doneBlocks = emu.match(/phase: 'done'[^}]*\}/g) ?? [];

  it('cả bốn annotation phase done đều không có at', () => {
    expect(doneBlocks.length).toBeGreaterThanOrEqual(4);
    for (const block of doneBlocks) expect(block).not.toMatch(/\bat\b/);
  });

  it('cả bốn annotation phase done đều không có isError', () => {
    for (const block of doneBlocks) expect(block).not.toMatch(/isError/);
  });
});
