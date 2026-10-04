/**
 * Khoá hồi quy cho TIMELINE của tool call trong app/api/chat/route.ts.
 *
 * Bài toán: tool trace đi qua kênh annotation không có trường vị trí, nên
 * client không xen kẽ được tool call vào giữa dòng chữ. Sửa: thêm `at` —
 * offset KÝ TỰ model đã phát ra trước tool call đó.
 *
 * Repo đã có pattern đọc-source (tests/chat-route-fixes.test.ts,
 * tests/tool-trace.test.ts): stream của route không mock được thành một
 * unit test đáng tin, nên khoá đúng điều kiện sống còn bằng regex lên source.
 *
 * Bẫy đã gặp ở repo này:
 *  - File trên đĩa là CRLF (core.autocrlf=true). Regex hard-code `\n` chạy
 *    được nội bộ nhưng ĐỎ trên CI → normalize một lần lúc đọc.
 *  - Comment tiếng Việt trong route.ts đã chứa sẵn các từ `at`/`preview`,
 *    nên KHÔNG đếm bằng `split('at')` — cắt riêng từng `writeAnnotation({ tool:``
 *    rồi regex trên đúng khối đó, không đụng vùng comment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTE_PATH = path.resolve(__dirname, '../app/api/chat/route.ts');
// CRLF → LF một lần: mọi regex dưới đây giả định nguồn là LF.
const source = fs.readFileSync(ROUTE_PATH, 'utf8').replace(/\r\n/g, '\n');

/**
 * Cắt ĐÚNG một khối `writeAnnotation({ tool: { ... } })` trong route.ts.
 * Bắt đầu tời lệnh ghi, kết thúc khi thấy `});` đóng cùng cấp — nên comment
 * nằm trong khối vẫn bị lấy, nhưng mọi thứ sau `});` thì không.
 */
function annotationBlock(anchor: string): string {
  const start = source.indexOf(anchor);
  expect(start, `không tìm thấy: ${anchor}`).toBeGreaterThan(-1);
  const end = source.indexOf('});', start);
  expect(end, `khối bắt đầu bằng "${anchor}" không đóng bằng });`).toBeGreaterThan(-1);
  return source.slice(start, end + 3);
}

/** Khối annotation tool của NHÁNH NATIVE trong `for await (...fullStream)`. */
const nativeToolCall = annotationBlock("writeAnnotation({\n                          tool: {\n                            id: String((part as any).toolCallId ?? ''),\n                            name: part.toolName,\n                            phase: 'start',");
const nativeToolResult = annotationBlock("writeAnnotation({\n                          tool: {\n                            id: String((part as any).toolCallId ?? ''),\n                            name: part.toolName,\n                            phase: 'done',");

/**
 * `at` là offset ký tự vào message text — đọc bằng biến `emittedChars` mà
 * `writeText` cộng dồn. Đảo thành số cứng / đổi biến → ĐỎ.
 */
describe('tool timeline — phase start mang vị trí (offset ký tự)', () => {
  it('annotation start ghi `at: emittedChars` (dòng 2371)', () => {
    expect(nativeToolCall).toMatch(/\n\s+at: emittedChars,/);
  });

  it('`at` đứng CÙNG khối phase start, không ở khối khác', () => {
    expect(nativeToolCall).toMatch(/phase: 'start',[\s\S]*?at: emittedChars,/);
    // Đổi chỗ: ghi `at` vào annotation nào đó khác → khối start mất field → ĐỎ.
    expect(nativeToolResult).not.toMatch(/\bat:/);
  });
});

/**
 * Ranh giới dữ liệu (rule 1): `at` CHỈ ở phase 'start'. Dán `at` vào
 * phase 'done' là offset sai — nó sẽ trỏ vào vị trí text SAU khi tool đã chạy
 * xong, và client sẽ render tool lệch chỗ. Đây là hồi quy quan trọng nhất.
 */
describe('tool timeline — phase done KHÔNG mang `at`', () => {
  it('khối done không có trường `at` ở bất kỳ dạng nào', () => {
    expect(nativeToolResult).not.toMatch(/\bat\s*:/);
    // `preview` chứa chuỗi `toolResultBody(` — không được để regex \bat\b
    // bắt nhầm prefix của chữ trong comment; kiểm riêng từ khoá định danh.
    expect(nativeToolResult).not.toMatch(/[{,]\s*at\s*:/);
  });

  it('toàn route chỉ có MỘT chỗ ghi `at:` vào annotation tool', () => {
    const atFields = source.match(/\bat: emittedChars,/g) ?? [];
    expect(atFields).toHaveLength(1);
  });
});

/**
 * `preview` là thân kết quả thật (client mở rộng được), tách khỏi `summary`
 * là dòng metadata một dòng cho chip trong timeline. `preview` đi qua
 * `toolResultBody` — hàm đã cắt + redact sẵn — nên route KHÔNG được cắt/
 * redact lần thứ hai (logic nhân bản thì trôi lệch).
 */
describe('tool timeline — phase done mang preview + giữ nguyên summary', () => {
  it('khối done gọi `preview: toolResultBody(` (dòng 2388)', () => {
    expect(nativeToolResult).toMatch(
      /preview: toolResultBody\(part\.toolName, \(part as any\)\.result\),/,
    );
  });

  it('vẫn gọi summarizeToolResult — không được refactor làm mất dòng tóm tắt', () => {
    expect(nativeToolResult).toMatch(
      /summary: summarizeToolResult\(part\.toolName, \(part as any\)\.result\),/,
    );
  });

  it('preview dùng kết quả THẬT, không dựng lại từ summary', () => {
    // Nếu ai đó gộp `preview: <summary>`, khối done sẽ có 2 summary →
    // `expect` này ĐỎ vì khối mất đúng một lần gọi toolResultBody.
    expect(nativeToolResult.match(/preview:/g) ?? []).toHaveLength(1);
    // route không tự cắt trần lần hai: không có `.slice(` bọc preview.
    expect(nativeToolResult).not.toMatch(/preview:[^,\n]*\.slice\(/);
  });

  it('route import toolResultBody từ lib/agent-tools', () => {
    expect(source).toMatch(/\n\s+toolResultBody,\n/);
    expect(source).toMatch(/from '@\/lib\/agent-tools';/);
  });
});

/**
 * Đường EMULATED (lib/emulated-agent.ts) gọi `opts.onAnnotation`, route
 * forward thẳng qua `onAnnotation: (payload) => writeAnnotation(payload)`.
 * Nó KHÔNG đi qua `for await (fullStream)` — nên phải có nhánh riêng nếu muốn
 * timeline. Test này ghim trạng thái đang biết: đường emulated CHƯA có `at`.
 * Đổi emulated-agent.ts sang gọi route thì đỏ ở đây — đúng, lúc đó phải
 * cập nhật kỳ vọng chứ không để client tưởng đã phủ.
 */
describe('tool timeline — đường emulated chưa có offset (theo dõi)', () => {
  it('forward annotation của emulated loop đi qua writeAnnotation', () => {
    expect(source).toMatch(/onAnnotation: \(payload\) => writeAnnotation\(payload\),/);
  });

  it('đường native là nơi DUY NHẤT ghi at: emittedChars', () => {
    // fullStream loop của native nằm SAU dòng forward emulated; `at` chỉ
    // được nằm trong khối native (đã khoá ở describe trên).
    const emuForward = source.indexOf('onAnnotation: (payload) => writeAnnotation(payload),');
    const nativeLoop = source.indexOf('for await (const part of (result as any).fullStream)');
    expect(emuForward).toBeGreaterThan(-1);
    expect(nativeLoop).toBeGreaterThan(emuForward);
  });
});