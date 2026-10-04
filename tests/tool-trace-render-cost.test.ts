/*
 * CHỐT NHÁY: timeline dựng MỘT lần, chip chỉ vẽ lại khi dữ liệu đổi.
 *
 * Lời khiếu: "phần hiển thị tool và phản hồi chữ bị hỗn loạn nháy liên tục".
 * Đo trên lượt agent thật (68 tool, content ~8.000 ký tự), MỖI token stream
 * trước đây tốn:
 *   • buildTimeline ×2  →  7,2 ms   (message-item dựng cho bubble, ToolTrace
 *                                     dựng lại cho chip list)
 *   • 68 chip vẽ lại    →  1,25 ms  (mỗi chip split('\n') cả thân kết quả)
 *   • displayText ×68   →  0,7 ms
 * Nên ba việc ở đây: gộp hai lần dựng thành một, `memo` hoá chip, và khoá
 * lại bằng test để không trôi lệch lần nữa.
 *
 * Có gì CHỨNG MINH ĐƯỢC ở đây, có gì không:
 *   • ĐƯỢC — hành vi thuần của `buildToolTrace` / `resolveTimeline` /
 *     `sameToolEvent`, và wiring (một chỗ gọi, chip có memo).
 *   • KHÔNG — số lần render thật của React. Repo chạy vitest `environment:
 *     'node'` (vitest.config.mts) và `include` chỉ nhặt file `.test.ts` trong
 *     thư mục `tests`, nên không dựng được cây component, không có jsdom, không
 *     có @testing-library. Vì vậy KHÔNG có test nào ở file này đếm render; test
 *     đo render phải chạy tay trên app thật.
 *
 * Mỗi test ghi rõ ĐỔI dòng nào thì nó đỏ.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  buildToolTrace,
  collectToolEvents,
  resolveTimeline,
  sameToolEvent,
  type ToolEvent,
  type TimelineSegment,
} from '@/components/chat/tool-trace';

/*
 * core.autocrlf: file trên đĩa là CRLF, regex cứng `\n` sẽ xanh ở Windows và
 * ĐỎ trên CI. Chuẩn hoá một lần rồi mới assert. Xoá comment để test kiểu
 * "cái gì KHÔNG xuất hiện ở đâu" không bị bắt nhầm tài liệu.
 */
const readCode = (rel: string) =>
  fs
    .readFileSync(path.resolve(__dirname, rel), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, ' ');

const TRACE_SOURCE = readCode('../components/chat/tool-trace.tsx');
const ITEM_SOURCE = readCode('../components/chat/message-item.tsx');

/* Chỉ phần nhánh assistant của MessageItem — nơi duy nhất được dựng timeline. */
const ASSISTANT_BODY = 'const annotations = (m as any).annotations';
const assistant = ITEM_SOURCE.slice(ITEM_SOURCE.indexOf(ASSISTANT_BODY));
const traceBody = TRACE_SOURCE.slice(TRACE_SOURCE.indexOf('export const ToolTrace'));

/* -------------------------------------------------------------- fixture */

/** `at` phân bố đều trên `content`; tham số là số tool cần dựng. */
function annotationsAt(offsets: number[]): Array<Record<string, unknown>> {
  return offsets.map((at, i) => ({
    tool: {
      id: `t${i}`,
      name: i % 2 === 0 ? 'read' : 'bash',
      phase: i % 2 === 0 ? 'start' : 'done',
      args: JSON.stringify({ path: `src/a-${i}.ts` }),
      at,
      summary: '3 dòng',
    },
  }));
}

const CONTENT = 'Mở đầu. Giữa lượt. Kết luận của model.';

/* ------------------------------------------------- hành vi thuần của API */

/*
 * ĐỔI DÒNG NÀO THÌ ĐỎ: `buildToolTrace` tự bỏ qua tham số `streaming`, hoặc
 * đổi `collectToolEvents` thành hai lời gọi với hai bộ đối số khác nhau —
 * lúc đó `events` trả về không còn là `events` mà bubble dùng.
 */
describe('buildToolTrace — một lần dựng, kết quả dùng chung', () => {
  it('events trả về đúng bằng collectToolEvents cùng bộ đối số', () => {
    const annotations = annotationsAt([0, 10, 20]);
    const trace = buildToolTrace(CONTENT, annotations, undefined, true);
    expect(trace.events).toEqual(collectToolEvents(annotations, undefined, true));
  });

  it('streaming=false thì gắn abandoned, streaming=true thì không', () => {
    /* Invocation còn treo là bằng chứng DUY NHẤT (R-27) — giữ nguyên luật. */
    const annotations = [{ tool: { id: 't1', name: 'bash', phase: 'start', args: '{}', at: 0 } }];
    const invocations = [{ toolCallId: 't1', toolName: 'bash', state: 'call' }];
    expect(buildToolTrace(CONTENT, annotations, invocations, true).events[0].abandoned).toBeUndefined();
    expect(buildToolTrace(CONTENT, annotations, invocations, false).events[0].abandoned).toBe(true);
    /* Thiếu invocation thì KHÔNG đoán "bị bỏ dở" (chỉ giữ 12 invocation gần
       nhất trong DB, lượt dài hơn sẽ bịa ra hàng chục chip cảnh báo sai). */
    expect(
      buildToolTrace(CONTENT, annotations, undefined, false).events[0].abandoned,
    ).toBeUndefined();
  });

  it('cắt trên content THÔ: ghép lại mọi mảnh lời ra đúng content', () => {
    /*
     * ĐỔI DÒNG NÀY THÌ ĐỎ: nếu `buildToolTrace` dọn/strip content trước khi
     * cắt thì ghép lại không khớp — đó là lỗi offset lệch, lỗi mà mắt thường
     * không nhận ra vì vẫn ra chữ.
     */
    const raw = `Mở đầu.\n<tool_call>{"n":1}</tool_call>\nGiữa lượt.\nKết luận.`;
    const { timeline } = buildToolTrace(raw, annotationsAt([10, 30]), undefined, true);
    expect(timeline).not.toBeNull();
    expect(
      timeline!
        .filter((s) => s.kind === 'text')
        .map((s) => (s as { text: string }).text)
        .join(''),
    ).toBe(raw);
  });

  it('tin nhắn cũ không có offset thì timeline null, không đoán vị trí', () => {
    const annotations = [{ tool: { id: 't1', name: 'read', phase: 'done', summary: 'x' } }];
    expect(buildToolTrace(CONTENT, annotations, undefined, true).timeline).toBeNull();
  });

  it('bố cục xen kẽ không đổi: đoạn lời đầu vẫn do bubble lấy, ToolTrace bỏ đúng mảnh đó', () => {
    const { events, timeline } = buildToolTrace(CONTENT, annotationsAt([10, 20]), undefined, true);
    expect(timeline![0]).toEqual({ kind: 'text', text: CONTENT.slice(0, 10) });
    expect(timeline!.filter((s) => s.kind === 'tool')).toHaveLength(events.length);
  });

  it('tool ở at:0 thì mảnh đầu là TOOL — không mất chip đầu', () => {
    const { timeline } = buildToolTrace(CONTENT, annotationsAt([0]), undefined, true);
    expect(timeline![0].kind).toBe('tool');
  });
});

/*
 * `resolveTimeline` là câu hỏi "dựng lại hay dùng bản có sẵn". Câu trả lời sai
 * ở đây không đổi chữ nào trên màn hình — nó chỉ quét lại cả lượt ở mỗi token,
 * tức đúng cái nháy mà ta đang đi săn.
 */
describe('resolveTimeline — phân biệt "chưa dựng" với "không có offset"', () => {
  const events = collectToolEvents(annotationsAt([10, 20]), undefined, true);

  it('undefined thì dựng, giống hệt buildTimeline', () => {
    expect(resolveTimeline(undefined, CONTENT, events)).toEqual(buildTimeline(CONTENT, events));
  });

  it('null thì trả về null, KHÔNG dựng lại dù content có tool có offset', () => {
    /*
     * ĐỔI `!== undefined` thành `??` trong `resolveTimeline` là ĐỎ ở đây:
     * `buildToolTrace` trả `timeline: null` cho tin nhắn cũ, và `null ?? ...`
     * sẽ dựng lại mỗi lần render — đúng lượt này tốn 2 lần dựng mỗi token.
     */
    expect(resolveTimeline(null, CONTENT, events)).toBeNull();
  });

  it('timeline có sẵn thì trả về CHÍNH con trỏ đó, không dựng bản mới', () => {
    const prebuilt = buildTimeline(CONTENT, events);
    /* `toBe` chứ không phải `toEqual`: dựng lại ra một mảng tương đương vẫn là
       tốn công mỗi token, và chip list sẽ mất tham chiếu ổn định. */
    expect(resolveTimeline(prebuilt, CONTENT, events)).toBe(prebuilt);
  });

  it('bubble và ToolTrace cùng nhận một kết quả thì resolve trả về đúng mảng đó', () => {
    const { timeline } = buildToolTrace(CONTENT, annotationsAt([10, 20]), undefined, true);
    expect(resolveTimeline(timeline, CONTENT, events)).toBe(timeline);
  });
});

/*
 * Comparator của `memo` trên `ToolChip`. Đây là thứ giữ cho danh sách 68 chip
 * đứng yên khi model gõ tiếp: object event mỗi lần dựng đều MỚI, nên so tham
 * chiếu sẽ không bao giờ bỏ qua.
 */
describe('sameToolEvent — dữ liệu không đổi thì chip không vẽ lại', () => {
  const base: ToolEvent = {
    id: 't1',
    name: 'read',
    done: true,
    args: '{"path":"src/a.ts"}',
    summary: '3 dòng',
    body: 'nội dung',
    at: 12,
  };

  it('object khác tham chiếu nhưng dữ liệu y hệt thì coi như BẰNG', () => {
    expect(sameToolEvent(base, { ...base })).toBe(true);
  });

  it('undefined và false là cùng một câu trả lời, không vẽ lại vì vậy', () => {
    expect(sameToolEvent(base, { ...base, abandoned: false })).toBe(true);
    expect(sameToolEvent(base, { ...base, abandoned: undefined })).toBe(true);
  });

  /*
   * Bảng dưới là "đổi dòng nào thì đỏ": mỗi hàng là một trường mà khi đổi,
   * chip PHẢI vẽ lại. Xoá một phép so trong `sameToolEvent` là đỏ đúng hàng
   * đó — ví dụ bỏ `a.body === b.body` thì chip không cập nhật kết quả tool
   * mới, và `a.done === b.done` thì chip kẹt "đang chạy" mãi.
   */
  it('mọi trường thay đổi đều phải cho ra khác nhau', () => {
    const mutations: Array<[string, ToolEvent]> = [
      ['id', { ...base, id: 't2' }],
      ['name', { ...base, name: 'bash' }],
      ['done', { ...base, done: false }],
      ['args', { ...base, args: '{"path":"src/b.ts"}' }],
      ['summary', { ...base, summary: '4 dòng' }],
      ['body', { ...base, body: 'nội dung khác' }],
      ['at', { ...base, at: 13 }],
      ['isError', { ...base, isError: true }],
      ['abandoned', { ...base, abandoned: true }],
    ];
    for (const [field, next] of mutations) {
      expect(sameToolEvent(base, next), `thiếu phép so trường "${field}"`).toBe(false);
    }
    /* Còn thêm một trường nào ngoài danh sách thì danh sách trên không còn
       đủ sức bảo vệ — sót trường là sót một kiểu chip không cập nhật. */
    expect(Object.keys(base).sort()).toEqual(
      ['args', 'at', 'body', 'done', 'id', 'name', 'summary'].sort(),
    );
  });

  it('tool đang chạy chuyển sang xong thì chip PHẢI vẽ lại', () => {
    const running: ToolEvent = { ...base, done: false, body: undefined, summary: '' };
    expect(sameToolEvent(running, { ...running, done: true })).toBe(false);
    /* Lượt bị dừng giữa chừng: gắn cờ abandoned cũng phải vẽ lại, nếu không
       chip quay mãi như thể việc đó còn đang chạy (R-27). */
    expect(sameToolEvent(running, { ...running, abandoned: true })).toBe(false);
  });
});

/* ------------------------------------------------------- wiring không đo được */

/*
 * Repo không có DOM nên những test này khoá bằng SOURCE: số chỗ gọi, chỗ gọi có
 * đúng không, memo có bọc chip không. Chúng không chứng minh được React bỏ qua
 * render — chỉ chứng minh được wiring không trôi lệch.
 */
describe('wiring — không có chỗ thứ hai để dựng timeline', () => {
  it('chỉ hai chỗ dựng events, và cả hai cùng trả lời một câu về abandoned', () => {
    /*
     * Hai chỗ ĐANG ĐƯỢC PHÉP: `buildToolTrace` (cha gọi, nhận `streaming`
     * từ ngoài) và đường dựng dự phòng trong `ToolTrace` cho call site chưa
     * truyền `events`. Thêm chỗ thứ ba là ĐỎ ở đây.
     */
    expect(
      [...TRACE_SOURCE.matchAll(/(?<!function )collectToolEvents\(/g)].length,
      'tool-trace.tsx có nhiều hơn 2 chỗ dựng events: gộp hết về buildToolTrace',
    ).toBe(2);
    expect(TRACE_SOURCE).toMatch(
      /export function buildToolTrace[\s\S]*?const events = collectToolEvents\(annotations, toolInvocations, streaming\);/,
    );
    /*
     * ĐÂY là cái bẫy đã có một worker trước vấp: cha truyền `isStreaming` vào
     * `buildToolTrace`, đường dựng dự phòng tự quyết bằng `isStreaming !== false`.
     * Hai chỗ phải dùng ĐÚNG biểu thức đó, nếu không một bên gắn cờ
     * `abandoned` còn bên kia không — chip nói "bị bỏ dở" còn bubble thì im.
     */
    expect(
      traceBody,
      'đường dựng dự phòng phải dùng đúng biểu thức mà cha truyền xuống',
    ).toMatch(/collectToolEvents\(annotations, toolInvocations, isStreaming !== false\)/);
    expect(assistant, 'cha phải truyền đúng biểu thức đó vào buildToolTrace').toMatch(
      /buildToolTrace\(\s*m\.content,[\s\S]*?isStreaming !== false,?\s*\n\s*\);/,
    );
  });

  it('message-item.tsx gọi buildToolTrace đúng một lần và không tự dựng timeline', () => {
    /*
     * ĐỔI DÒNG NÀY THÌ ĐỎ: thêm `buildTimeline(` hay `collectToolEvents(` trực
     * tiếp trong nhánh assistant — đó là lần dựng thứ hai quay lại.
     */
    expect([...assistant.matchAll(/buildToolTrace\(/g)]).toHaveLength(1);
    expect(assistant).not.toMatch(/buildTimeline\(/);
    expect(assistant).not.toMatch(/collectToolEvents\(/);
    /* Lệnh quyết định `abandoned` phải nằm ngay trong lời gọi chung. */
    expect(assistant).toMatch(/buildToolTrace\(\s*m\.content,[\s\S]*?isStreaming !== false,?\s*\n\s*\);/);
  });

  it('thẻ <ToolTrace> mang events + timeline dựng sẵn', () => {
    /*
     * Xoá `events={events}` hoặc `timeline={timeline}` khỏi thẻ là ĐỎ ở đây:
     * ToolTrace rơi về đường dựng dự phòng và mỗi token lại quét lại lượt.
     */
    const tag = assistant.match(/<ToolTrace[\s\S]*?\/>/);
    expect(tag, 'không tìm thấy thẻ <ToolTrace ... />').not.toBeNull();
    expect(tag![0], 'thiếu events={events}').toContain('events={events}');
    expect(tag![0], 'thiếu timeline={timeline}').toContain('timeline={timeline}');
  });

  it('ToolTrace dùng bản dựng sẵn, không dựng lại trong thân component', () => {
    /*
     * ĐỔI `prebuiltEvents ?? collectToolEvents(...)` thành lời gọi không có
     * nhánh `??` là ĐỎ: chip list tự quét lại lượt mỗi token dù cha đã dựng.
     */
    expect(traceBody).toMatch(
      /prebuiltEvents \?\? collectToolEvents\(annotations, toolInvocations, isStreaming !== false\)/,
    );
    expect(traceBody, 'thân ToolTrace không được tự gọi buildTimeline').not.toMatch(/buildTimeline\(/);
    expect(traceBody).toMatch(/const timeline = resolveTimeline\(prebuiltTimeline, content, events\);/);
  });

  it('ToolChip bọc memo với comparator so sâu', () => {
    /*
     * Bỏ `memo(` hoặc đổi comparator sang so tham chiếu mặc định là ĐỎ ở đây.
     * Lưu ý: `memo` bỏ qua lần vẽ thì `useState` bên trong GIỮ NGUYÊN — chip
     * đang mở không bị gập lại khi model gõ thêm một từ. Đó là lý do bỏ qua
     * được chấp nhận ở đây, và cũng là lý do không được so tham chiếu.
     */
    expect(TRACE_SOURCE).toMatch(/const ToolChip = memo\(function ToolChip\(/);
    expect(TRACE_SOURCE).toMatch(/\(prev, next\) => sameToolEvent\(prev\.ev, next\.ev\)\);/);
  });

  it('mảnh xen kẽ vẫn lấy từ traceSegments, không lặp lại đoạn đầu của bubble', () => {
    /* Giữ nguyên hợp đồng cũ sau khi đổi nơi dựng timeline. */
    expect(traceBody).toMatch(/const owned = timeline \? traceSegments\(timeline\) : null;/);
  });
});

/*
 * Bất biến ghép: đúng những gì một chip đã xong được vẽ ra. Không đổi hành vi
 * hiển thị, chỉ chặn hành vi quét lại.
 */
describe('danh sách phẳng (tin nhắn cũ) vẫn giữ nguyên', () => {
  it('timeline null thì ToolTrace vẽ đủ mọi event, theo thứ tự gốc', () => {
    const annotations = [
      { tool: { id: 't2', name: 'bash', phase: 'done', summary: 'b' } },
      { tool: { id: 't1', name: 'read', phase: 'done', summary: 'a' } },
    ];
    const { timeline, events } = buildToolTrace(CONTENT, annotations, undefined, true);
    expect(timeline).toBeNull();
    expect(events.map((e) => e.id)).toEqual(['t2', 't1']);
  });
});

/* Bảo đảm fixture của file này đúng ý nghĩa — đổi số ở trên là đỏ. */
describe('fixture', () => {
  it('annotationsAt dựng đúng số tool, đúng thứ tự', () => {
    const timeline = buildTimeline(CONTENT, collectToolEvents(annotationsAt([0, 10, 20]), undefined, true));
    const asText = timeline as TimelineSegment[];
    expect(asText.filter((s) => s.kind === 'tool')).toHaveLength(3);
  });
});