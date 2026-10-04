/*
 * Khoá THỨ TỰ ĐỌC của lượt assistant trong components/chat/message-item.tsx.
 *
 * Trước đây ba khối viền (tool trace, suy luận, rồi mới tới bubble) đẩy câu
 * trả lời xuống dưới tầm mắt. Nay câu trả lời lên đầu, tool trace dưới nó, và
 * suy luận ở đáy. Repo không có jsdom nên không render được React, ta khoá
 * bằng đọc source + regex, đúng convention của tests/chat-route-fixes.test.ts
 * và tests/tool-trace.test.ts.
 *
 * Mỗi test ghi rõ ĐẢO/SỬA dÒng nào thì nó đỏ — đó là hợp đồng của file này.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripEmulatedToolMarkup } from '@/lib/text-tool-guard';
import {
  buildTimeline,
  collectToolEvents,
  displayText,
  traceSegments,
} from '@/components/chat/tool-trace';
import { bubbleOf } from '@/components/chat/message-item';

const ITEM_PATH = path.resolve(__dirname, '../components/chat/message-item.tsx');

/*
 * core.autocrlf: file trên đĩa là CRLF. Regex viết cứng `\n` sẽ pass ở máy
 * Windows và ĐỎ trên CI. Chuẩn hoá đúng một lần rồi mới assert.
 */
const source = fs.readFileSync(ITEM_PATH, 'utf8').replace(/\r\n/g, '\n');

/*
 * Xoá comment khỏi bản sao để các test kiểu "cái gì KHÔNG xuất hiện ở đâu"
 * không bị bắt nhầm: việc comment nhắc tên `ToolTrace` là tài liệu, không phải
 * code gọi tới nó. Thay bằng newline thay vì xoá hẳn để số dòng giữ nguyên.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

const USER_BRANCH = "if (m.role === 'user') {";
const ASSISTANT_BODY = 'const annotations = (m as any).annotations';

const userBranch = code.slice(code.indexOf(USER_BRANCH), code.indexOf(ASSISTANT_BODY));
const assistant = source.slice(source.indexOf(ASSISTANT_BODY));
const comparator = source.slice(source.indexOf('(prev, next) =>'));

/*
 * Thân `bubbleOf` — hàm thuần quyết định nội dung bubble. Tách riêng vì nó
 * nằm TRƯỚC thân component (không phải trong `assistant`), và vì nó là nơi duy
 * nhất được phép gọi `displayText` cho phần lời.
 */
const bubbleHelper = source.slice(
  source.indexOf('export function bubbleOf'),
  source.indexOf('/*\n * Thanh thao tác'),
);

describe('message-item — bubble lên đầu, tool trace dưới, suy luận ở đáy', () => {
  it('ToolTrace render SAU bubble, không phải trên', () => {
    const trace = assistant.indexOf('<ToolTrace');
    const bubble = assistant.indexOf('bubble-bot');
    expect(bubble, 'không tìm thấy bubble-bot trong nhánh assistant').toBeGreaterThan(-1);
    expect(trace, 'không tìm thấy call site <ToolTrace trong nhánh assistant').toBeGreaterThan(-1);
    expect(
      trace,
      'ToolTrace phải nằm sau bubble: dời nó lên trên khối bubble-bot là ĐỎ',
    ).toBeGreaterThan(bubble);
  });

  it('ThinkingBlock render SAU khối usage/evidence', () => {
    const think = assistant.indexOf('<ThinkingBlock');
    const usage = assistant.indexOf('<MessageUsage');
    expect(usage, 'không tìm thấy MessageUsage').toBeGreaterThan(-1);
    expect(think, 'không tìm thấy ThinkingBlock').toBeGreaterThan(-1);
    expect(
      think,
      'ThinkingBlock phải nằm dưới hàng usage/evidence: dời nó lên trên là ĐỎ',
    ).toBeGreaterThan(usage);
    expect(think, 'ThinkingBlock phải là khối cuối cùng').toBeGreaterThan(
      assistant.indexOf('<EvidenceBadge'),
    );
  });

  it('khối bọc tin nhắn vẫn đúng 2 hàng và không tự padding ngang', () => {
    /*
     * Nhặt lại luật của tests/design-system.test.ts (gutter ngang). Lặp ở đây
     * để lỗi trỏ thẳng về message-item.tsx thay vì phải tra 1043 dòng test
     * hợp đồng thiết kế. Đổi `<div className="group relative w-full py-N">`
     * thành một hàng thứ ba, hoặc thêm px- vào hai hàng đó, là ĐỎ.
     */
    const rows = [...source.matchAll(/<div className="(group relative w-full py-\d+[^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(rows, `phải có đúng 2 hàng tin nhắn (user + assistant), thấy ${rows.length}`).toHaveLength(2);
    for (const row of rows) {
      expect(row, `hàng tin nhắn không được tự padding ngang: ${row}`).not.toMatch(/(?<![\w-])px-/);
    }
  });

  it('memo comparator vẫn so reasoning/annotations/toolInvocations', () => {
    /*
     * Timeline bám `annotations` + `toolInvocations` + `content`; nếu comparator
     * rơi một trong ba thì tin nhắn không re-render khi tool vừa xong, chip
     * đứng im ở trạng thái "đang chạy" mãi. Xoá dòng nào trong comparator là ĐỎ.
     */
    expect(comparator).toMatch(/\(prev\.m as any\)\.reasoning === \(next\.m as any\)\.reasoning/);
    expect(comparator).toMatch(/prev\.m\.annotations === next\.m\.annotations/);
    expect(comparator).toMatch(
      /\(prev\.m as any\)\.toolInvocations === \(next\.m as any\)\.toolInvocations/,
    );
    expect(comparator, 'comparator phải vẫn bám content').toMatch(
      /prev\.m\.content === next\.m\.content/,
    );
  });

  it('nhánh user không bị đụng', () => {
    /*
     * Thay đổi này chỉ dành cho assistant. Đưa ToolTrace/ThinkingBlock/
     * buildTimeline vào trong nhánh user là ĐỎ.
     */
    expect(userBranch.length, 'không cắt được nhánh user').toBeGreaterThan(100);
    for (const token of ['ToolTrace', 'ThinkingBlock', 'bubble-bot', 'buildTimeline', 'bubbleOf']) {
      expect(userBranch, `nhánh user không được chứa ${token}`).not.toContain(token);
    }
  });
});

/*
 * R-27 — tín hiệu "lượt đã hết stream" phải tới được ToolTrace.
 *
 * `ToolTrace` có trạng thái "bị bỏ dở" cho tool đã bắt đầu mà stream bị dừng
 * giữa chừng, nhưng nó chỉ bật được khi NHẬN ĐƯỢC `isStreaming === false`.
 * Mặc định của nó là "chưa biết" (coi như còn chạy) — cố ý, vì bịa ra chip
 * "bị bỏ dở" oan tệ hơn là hiện "đang chạy" quá. Nhưng `MessageItem` là nơi
 * DUY NHẤT biết tin nhắn này còn stream hay không, nên không truyền xuống thì
 * cả trạng thái đó là code chết trong app: chip quay mãi như thể việc còn
 * đang chạy, sau khi lượt đã chết từ lâu.
 *
 * Test này trả lời câu hỏi bắt buộc: xoá dòng `isStreaming={isStreaming}` ở
 * call site là ĐỎ.
 */
describe('message-item — truyền tín hiệu isStreaming xuống ToolTrace', () => {
  it('thẻ <ToolTrace> phải mang isStreaming={isStreaming}', () => {
    const traceTag = assistant.match(/<ToolTrace[\s\S]*?\/>/);
    expect(traceTag, 'không tìm thấy thẻ <ToolTrace ... />').not.toBeNull();
    expect(
      traceTag![0],
      'thiếu isStreaming: trạng thái "bị bỏ dở" không bao giờ bật được',
    ).toContain('isStreaming={isStreaming}');
    /* Truyền hằng `true`/`false` cũng sai: cả hai đều bỏ qua thực tế. */
    expect(traceTag![0]).not.toMatch(/isStreaming=\{(true|false)\}/);
  });

  it('comparator đã so isStreaming nên việc truyền thêm không sinh render thừa', () => {
    /*
     * `MessageItem` là `memo` có comparator tay. Nếu comparator không so
     * `isStreaming` thì tin nhắn không re-render lúc stream kết thúc, chip
     * đứng im "đang chạy" mãi. Đã có sẵn từ trước, và việc truyền xuống
     * ToolTrace không thêm món nào ngoài nó.
     */
    expect(comparator).toMatch(/prev\.isStreaming === next\.isStreaming/);
  });

  /*
   * Hành vi thật của tín hiệu đó, chạy hàm thật của tool-trace: cùng một
   * annotation `phase:'start'` mà lúc đang stream thì chưa gắn cờ, lúc đã hết
   * stream thì gắn. Đổi `isStreaming !== false` thành so sánh khác trong
   * `ToolTrace` là đỏ ở đây.
   */
  it('cùng tool dangling: đang stream thì chạy, hết stream thì bị bỏ dở', () => {
    const started = [{ tool: { id: 't1', name: 'bash', phase: 'start', args: '{}' } }];
    /* Invocation còn treo là bằng chứng duy nhất. Thiếu invocation thì KHÔNG
       đoán: lượt thật có 68 `phase:'start'` nhưng chỉ 12 invocation được lưu
       (STORED_TOOL_INVOCATIONS_MAX), đoán "bỏ dở" biến lượt thành công thành
       56 chip cảnh báo sai. */
    const dangling = [{ toolCallId: 't1', state: 'call' as const }];
    expect(collectToolEvents(started, dangling, true)[0].abandoned).toBeUndefined();
    expect(collectToolEvents(started, dangling, false)[0].abandoned).toBe(true);
  });
});

describe('message-item — offset phải lấy từ m.content NGUYÊN BẢN', () => {
  /*
   * Đây là chỗ dễ sai nhất của cả gói. Offset `at` mà server ghi là chỉ số ký
   * tự trong bản gốc. `stripEmulatedToolMarkup` xoá các khối markup tool nên
   * mọi vị trí nằm SAU khối bị xoá đều lệch. Truyền nhầm chuỗi đã strip thì
   * timeline cắt lệch chỗ mà vẫn ra chữ, lỗi kiểu đó rất khó phát hiện bằng mắt.
   */

  it('ToolTrace nhận content={m.content}, không phải chuỗi đã strip', () => {
    const traceTag = assistant.match(/<ToolTrace[\s\S]*?\/>/);
    expect(traceTag, 'không tìm thấy thẻ <ToolTrace ... />').not.toBeNull();
    expect(traceTag![0], 'phải truyền content={m.content}').toContain('content={m.content}');
    expect(
      traceTag![0],
      'cấm truyền chuỗi đã strip vào ToolTrace: offset sẽ lệch',
    ).not.toContain('stripEmulatedToolMarkup');
  });

  it('buildTimeline cũng nhận m.content nguyên bản', () => {
    /*
     * Hình dạng lời gọi đã đổi: `collectToolEvents` và `buildTimeline` giờ nằm
     * trong `buildToolTrace` để chỉ dựng MỘT lần cho cả bubble lẫn chip list —
     * trước đây mỗi bên tự gọi, tức mỗi token stream quét lại cả lượt hai
     * lần. Ý của luật này không đổi: offset phải cắt trên bản gốc, không phải
     * trên chuỗi đã strip.
     */
    expect(
      assistant,
      'timeline phải cắt trên m.content, không phải trên chuỗi đã strip',
    ).toMatch(/buildToolTrace\(\s*m\.content,/);
    expect(assistant, 'cấm đưa chuỗi đã strip vào phép dựng timeline').not.toMatch(
      /buildToolTrace\([^)]*stripEmulatedToolMarkup/,
    );
    /* `isStreaming !== false` là chỗ DUY NHẤT quyết định cờ `abandoned`; bỏ nó
       thì lượt đã dừng giữa chừng quay về "đang chạy" mãi (R-27). */
    expect(assistant).toMatch(/isStreaming !== false,?\s*\n?\s*\);/);
  });

  it('chuỗi đã dọn vẫn là thứ hiển thị ở nhánh fallback', () => {
    /*
     * Ngược lại với hai test trên: bubble PHẢI hiện chuỗi đã dọn (bỏ rác
     * markup), và chỉ ở nhánh timeline rỗng. Đổi `m.content` thành thứ đã
     * bị cắt, hoặc bỏ hẳn lớp dọn ở nhánh này, là rác XML lọt lên màn hình.
     *
     * Lớp dọn nay là `displayText` (dùng chung với ToolTrace), không còn là
     * `stripEmulatedToolMarkup(...).text` + `sanitizeContent` viết tay — xem
     * describe "bubble dọn bằng displayText" ở dưới.
     */
    expect(assistant).toMatch(/const \{ text: bubbleContent, show: showBubble \} = bubbleOf\(/);
    /*
     * Nhánh tin nhắn CŨ giữ nguyên `stripEmulatedToolMarkup` + `sanitizeContent`,
     * KHÔNG đi qua `displayText`. `dropCutHead` bên trong `displayText` đoán
     * "mảnh bị `at` cắt đôi" mà nhánh này không có lát cắt nào; chạy nó ở đây
     * là nuốt mất chữ thật. Xem describe "tin nhắn cũ" ở dưới.
     */
    expect(bubbleHelper).toMatch(
      /if \(timeline === null\) \{\s*\n\s*return \{ text: sanitizeContent\(stripEmulatedToolMarkup\(content\)\.text\), show: true \};/,
    );
  });

  it('đoạn lời đầu lấy từ segment đầu tiên và đi qua displayText', () => {
    /*
     * Đoạn lời đầu là lát cắt THÔ của content, nên vẫn có thể chứa
     * `<tool_call>` sót lại nếu markup nằm trước tool đầu tiên. Bỏ
     * lớp dọn ở đây là đưa rác XML trở lại bubble, đúng cái lỗi mà lớp
     * dọn sinh ra để chặn.
     */
    expect(bubbleHelper).toMatch(
      /const firstSegment = timeline\[0\];[\s\S]*?displayText\(firstSegment\?\.kind === 'text' \? firstSegment\.text : ''\)/,
    );
    /* Chốt chặn: KHÔNG được tự cắt chuỗi thay buildTimeline. */
    expect(
      assistant,
      'cấm tự cắt chuỗi thay buildTimeline',
    ).not.toMatch(/\.slice\(0,\s*[^)]*\.at\b/);
  });
});

/*
 * BUG 2 — bubble của lượt có tool phải dọn y hệt phần timeline ToolTrace vẽ.
 *
 * Trước đây bubble gọi `stripEmulatedToolMarkup(firstSegment.text).text` rồi
 * mới `sanitizeContent`: THIẾU `balanceFences` và `.normalize('NFC')`, tức là
 * thiếu đúng hai bước mà `displayText` làm. Hai hệ quả đo được:
 *   • `at` rơi vào giữa khối ``` thì lát đầu kết thúc bằng fence hở →
 *     MarkdownRenderer coi phần còn lại của lượt là code → kết luận của model
 *     hiện thành khối code.
 *   • Lát cắt rơi vào giữa chữ+dấu ở dạng NFD → dấu tổ hợp lơ lửng, hiện ra
 *     là ký tự vỡ. App nói tiếng Việt nên đây là hỏng dữ liệu, không phải xấu xí.
 *
 * Đây là test HÀNH VI (gọi hàm thật), không phải regex trên source: đổi
 * `displayText` thành `stripEmulatedToolMarkup(...).text` thì đỏ ở đây.
 */
describe('bubble dọn bằng displayText — cùng hàm với timeline', () => {
  /*
   * `at` rơi vào GIỮA khối code: lát đầu kết thúc bằng fence chưa đóng, còn
   * phần sau là kết luận của model. Đây là hình dạng hỏng gốc.
   */
  const fenced = [
    'Để tôi chạy thử:',
    '```bash',
    'npm test -- --watch',
    'Xong.',
  ].join('\n');

  it('fence hở ở lát đầu được vá, kết luận của model không bị nuốt vào code block', () => {
    const events = collectToolEvents(
      [{ tool: { id: 't1', name: 'bash', phase: 'start', at: fenced.indexOf('npm test') + 2 } }],
      undefined,
    );
    const timeline = buildTimeline(fenced, events)!;

    const bubble = bubbleOf(fenced, timeline).text;
    /* Trước fix: chuỗi bubble kết thúc bằng ``` lẻ, MarkdownRenderer mở code
       block và nuốt luôn phần "Xong." — dòng dưới là ĐỎ. */
    expect((bubble.match(/```/g) ?? []).length % 2, 'bubble có fence hở').toBe(0);
    expect(bubble, 'mất tiền đoạn model nói trước khi gọi tool').toContain('Để tôi chạy thử:');
    /* Cùng bất biến, áp cho mảng do ToolTrace vẽ: hai bên phải cùng số fence. */
    const traceText = traceSegments(timeline)
      .filter((s) => s.kind === 'text')
      .map((s) => displayText((s as { text: string }).text))
      .join('\n');
    expect(
      (traceText.match(/```/g) ?? []).length % 2,
      'timeline và bubble phải dọn bằng cùng một quy tắc',
    ).toBe(0);
  });

  it('chuỗi NFD trong lát đầu được NFC hoá — dấu tiếng Việt không lơ lửng', () => {
    /* 'ô' thành 'o' + U+0300, 'ệ' thành 'e' + U+0323 + U+0301 — dạng NFD mà
       macOS và nhiều editor hay lưu. Mốc cắt lấy bằng chuỗi ASCII 'cho'
       vì 'tôi' trong NFD không còn là một chuỗi liên tục để indexOf. */
    const nfd = 'Để tôi đọc file cho bạn nhé.'.normalize('NFD');
    expect(nfd, 'fixture phải thực sự ở dạng NFD').not.toBe(nfd.normalize('NFC'));
    const events = collectToolEvents(
      [{ tool: { id: 't1', name: 'read', phase: 'start', at: nfd.indexOf(' cho') } }],
      undefined,
    );
    const timeline = buildTimeline(nfd, events)!;

    const bubble = bubbleOf(nfd, timeline).text;
    /* Trước fix: bubble giữ nguyên NFD, dòng dưới là ĐỎ. */
    expect(bubble, 'bubble phải là dạng NFC').toBe(bubble.normalize('NFC'));
    expect(bubble, 'còn dấu tổ hợp lơ lửng sau khi dọn').not.toMatch(/\p{M}/u);
    expect(bubble, 'mất tiền đoạn model nói trước khi gọi tool').toContain('Để tôi đọc file');
  });

  it('markup tool-call sót trong lát đầu vẫn bị dọn khỏi bubble', () => {
    /* Markup nằm TRƯỚC tool đầu tiên nên nó thuộc về lát đầu. */
    const raw = ['Mở đầu.', '<tool_call>{"name":"read"}</tool_call>', 'Xem rồi:'].join('\n');
    const events = collectToolEvents(
      [{ tool: { id: 't1', name: 'read', phase: 'start', at: raw.indexOf('Xem rồi:') } }],
      undefined,
    );

    const bubble = bubbleOf(raw, buildTimeline(raw, events)!).text;
    expect(bubble).not.toContain('tool_call');
    expect(bubble).toContain('Mở đầu.');
  });

  /*
   * HAI NHÁNH KHÔNG ĐƯỢC GỘP. `dropCutHead` bên trong `displayText` đoán
   * "mảnh này bị `at` cắt đôi" bằng cách tìm dấu đóng mồ côi `</tool_call>`
   * đứng riêng dòng. Ở nhánh tin nhắn CŨ không có lát cắt nào — cả tin nhắn là
   * nguyên vẹn — nên dấu đóng của một khối TRỌN VẸN bị đọc thành mồ côi và cả
   * phần đầu bị nuốt mất.
   *
   * Fixture này dựng đúng hình dạng đó: model mở đầu bằng JSON rồi gọi tool.
   * Đổi nhánh legacy sang `displayText` là ĐỎ ở đây — mất chữ thật, tệ hơn nhiều
   * so với mất cân bằng fence.
   */
  it('tin nhắn cũ mở đầu bằng JSON không bị nuốt mất phần đầu', () => {
    const OPEN = String.fromCharCode(60) + 'tool_call>';
    const CLOSE = String.fromCharCode(60) + '/tool_call>';
    const raw = ['{"r": 1}', OPEN, '{"name":"read"}', CLOSE, 'Xong.'].join('\n');

    /* Khối tool bị strip như mọi tin nhắn cũ. */
    expect(stripEmulatedToolMarkup(raw).stripped, 'fixture phải thực sự bị strip').toBe(1);
    const bubble = bubbleOf(raw, null).text;
    expect(bubble, 'mất mở đầu JSON của model').toContain('{"r": 1}');
    expect(bubble).toContain('Xong.');
    expect(bubble).not.toContain('tool_call');
  });

  it('tin nhắn cũ có fence hở KHÔNG bị vá — giữ đúng hành vi cũ, không sinh dấu lạ', () => {
    /*
     * Nhánh legacy cố ý KHÔNG qua `displayText`, nên KHÔNG vá fence. Đây là
     * hệ quả được chấp nhận: tin nhắn cũ không bị cắt nên fence của nó thường
     * cân; nếu không cân thì markdown hiện như trước bản này. Test khoá đúng
     * hành vi đó để đổi nhánh legacy là ĐỎ, thay vì âm thầm lệch.
     */
    const raw = 'Đọc file này:\n```bash\nnpm test\n```\nXong.';
    expect(bubbleOf(raw, null).text).toBe(stripEmulatedToolMarkup(raw).text);

    const halfOpen = 'Đọc file này:\n```bash\nnpm test';
    expect(bubbleOf(halfOpen, null).text, 'tin nhắn cũ không được tự vá fence').not.toContain(
      `${'```'}\n${'```'}`,
    );
  });
});

/*
 * HÀNH VI của quyết định "có vẽ ô tròn rỗng hay không".
 *
 * Test regex trên source không bắt được loại lỗi ở đây: đổi điều kiện thành
 * `timeline === null || true` (luôn vẽ ô tròn trắng) hay thành
 * `bubbleContent.trim().length > 1` (bỏ mất lượt chỉ có một chữ) đều đọc source
 * thấy hợp lý và test regex vẫn xanh. Ở đây gọi hàm thật nên đổi là đỏ.
 */
describe('bubbleOf — quyết định vẽ ô tròn', () => {
  it('tin nhắn cũ (timeline null) luôn vẽ bubble kể cả khi rỗng', () => {
    expect(bubbleOf('', null)).toEqual({ text: '', show: true });
    expect(bubbleOf('   \n  ', null).show, 'tin nhắn cũ rỗng giữ nguyên ô tròn').toBe(true);
  });

  it('timeline bật mà mảnh đầu rỗng thì KHÔNG vẽ ô tròn trắng', () => {
    /* Model gọi tool trước khi kịp nói gì (`at: 0`) → mảnh 0 là TOOL. */
    const timeline = buildTimeline('Kết luận.', [
      { id: 't1', name: 'bash', done: false, args: '', summary: '', at: 0 },
    ])!;
    expect(timeline[0].kind).toBe('tool');
    expect(bubbleOf('Kết luận.', timeline)).toEqual({ text: '', show: false });
  });

  it('timeline bật mà mảnh đầu toàn khoảng trắng cũng không vẽ ô tròn trắng', () => {
    const timeline = buildTimeline('   \nXong.', [
      { id: 't1', name: 'bash', done: true, args: '', summary: '', at: 4 },
    ])!;
    expect(timeline[0]).toMatchObject({ kind: 'text', text: '   \n' });
    expect(bubbleOf('   \nXong.', timeline).show).toBe(false);
  });

  it('mảnh đầu có lời thì vẽ bubble, kể cả lượt chỉ có MỘT chữ', () => {
    /*
     * Fixture một chữ, không phải "Ok.". `length > 1` (điều kiện sai dạng
     * hay gõ tay) bỏ qua "Ok." vì 3 ký tự, nhưng bỏ mất lượt chỉ có "Ừ" —
     * và lượt đó có thật: model trả lời một tiếng rồi gọi tool. Test này phải
     * ĐỎ khi điều kiện đổi, không chỉ khi có ai XOÁ hẳn điều kiện.
     */
    const timeline = buildTimeline('Ừ', [
      { id: 't1', name: 'bash', done: true, args: '', summary: '', at: 1 },
    ])!;
    expect(timeline[0]).toMatchObject({ kind: 'text', text: 'Ừ' });
    expect(bubbleOf('Ừ', timeline)).toEqual({ text: 'Ừ', show: true });
  });
});

/*
 * Bằng chứng đo được cho luật "offset tính trên content THÔ", không phải trên
 * chuỗi đã strip. Test này chạy hàm thật của lib và của tool-trace nên nó đỏ
 * nếu một trong hai hàm đổi hành vi, chứ không chỉ khoá hình dạng source.
 */
describe('bằng chứng — offset tính trên content thô, không phải chuỗi đã strip', () => {
  const raw = [
    'Để tôi đọc file xem.',
    '<tool_call>{"name":"read"}</tool_call>',
    '',
    'Kết luận: file đó ổn.',
  ].join('\n');

  it('strip trước khi cắt làm timeline sai thứ tự', () => {
    const stripped = stripEmulatedToolMarkup(raw);
    expect(stripped.stripped, 'fixture này phải thực sự bị strip').toBe(1);
    expect(
      raw.indexOf('Kết luận') - stripped.text.indexOf('Kết luận'),
      'offset lệch sau khi strip',
    ).toBe(38);

    const events = collectToolEvents(
      [{ tool: { id: 't1', name: 'read', phase: 'start', at: raw.indexOf('Kết luận') } }],
      undefined,
    );

    /* Bản gốc: lời, tool, rồi kết luận. */
    expect(buildTimeline(raw, events)).toEqual([
      { kind: 'text', text: expect.stringContaining('Để tôi đọc file xem.') },
      { kind: 'tool', event: expect.objectContaining({ id: 't1' }) },
      { kind: 'text', text: 'Kết luận: file đó ổn.' },
    ]);

    /* Bản đã strip: cắt lệch, kết luận bị nuốt lên trên tool. */
    const wrong = buildTimeline(stripped.text, events)!;
    expect(wrong[wrong.length - 1].kind).toBe('tool');
    expect(wrong[0]).toMatchObject({ kind: 'text' });
  });
});

describe('message-item — khi timeline bật, bubble chỉ giữ đoạn lời đầu', () => {
  it('MarkdownRenderer ăn bubbleContent, không ăn thẳng m.content', () => {
    const mdTag = assistant.match(/<MarkdownRenderer[\s\S]*?\/>/);
    expect(mdTag, 'không tìm thấy thẻ <MarkdownRenderer ... />').not.toBeNull();
    expect(mdTag![0], 'bubble phải lấy bubbleContent').toContain('content={bubbleContent}');
    expect(
      mdTag![0],
      'không được nhét m.content thô vào bubble: sẽ lặp lại đoạn ToolTrace đã vẽ',
    ).not.toContain('m.content');
  });

  it('bubbleContent lấy đúng segment đầu tiên qua hàm export, không tự cắt', () => {
    /*
     * Cấm tự cắt chuỗi ở đây (ví dụ `content.slice(0, ev.at)`): logic cắt phải
     * nằm MỘT chỗ trong buildTimeline, nếu không hai bên lệch nhau là timeline
     * và bubble cắt ở hai điểm khác nhau. Viết lại thành slice tay là ĐỎ.
     */
    expect(bubbleHelper).toMatch(/const firstSegment = timeline\[0\];/);
    expect(bubbleHelper).toMatch(/firstSegment\?\.kind === 'text'/);
    /* Component chỉ được GỌI helper, không tự dựng lại lần nữa bên trong. */
    expect(assistant).toMatch(
      /const \{ text: bubbleContent, show: showBubble \} = bubbleOf\(m\.content, timeline\);/,
    );
    expect(
      assistant,
      'cấm tự cắt chuỗi thay buildTimeline',
    ).not.toMatch(/\.slice\(0,\s*[^)]*\.at\b/);
  });

  it('tin nhắn cũ (timeline null) luôn vẽ bubble, kể cả khi rỗng', () => {
    /*
     * Regression guard của Task 4: bố cục cũ phải y hệt. Đổi điều kiện này
     * thành `text.trim() !== ''` một mình cho CẢ HAI nhánh, tin nhắn cũ rỗng
     * sẽ mất ô bong bóng trắng mà trước đây có, tức là đã đổi bố cục cũ.
     * Hành vi thật của cả hai nhánh được khoá bằng hàm thật ở describe
     * "bubbleOf — quyết định vẽ ô tròn"; dòng regex ở đây chỉ chặn việc
     * dựng lại điều kiện ở chỗ khác.
     */
    expect(bubbleHelper).toMatch(/show: true \};?\s*$/m);
    expect(bubbleHelper).toMatch(/return \{ text, show: text\.trim\(\) !== '' \};/);
    expect(assistant).toMatch(/\{showBubble && \(/);
    expect(assistant).not.toMatch(/const showBubble = /);
  });
});