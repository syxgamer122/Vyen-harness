/*
 * Tab đo đạc không được bày nút làm việc mà không có gì để làm.
 *
 * Sự thật đã có trong chính file component: bản build này không có mã nào gọi
 * `globalTracer.startSpan` khi bạn trò chuyện, nên ring buffer LUÔN rỗng và
 * Waterfall luôn trống (xem ghi chú ở `core/telemetry/tracer.ts:1-16`).
 *
 * Đợt sửa trước đã hiểu ra điều đó và ẩn bộ đếm `0 / 500` cạnh dòng "chưa có
 * dữ liệu" — rồi bỏ lại đúng hai nút mà dòng đó nói là không có gì: "Làm mới"
 * đọc lại một bộ đệm rỗng, "Xóa cache" xoá không có gì. Hai nút bấm được mà
 * màn hình không đổi: đúng loại nút giả (affordance chết), cùng loại với cái
 * nút kill-switch trên web mà `scheduler-panel.tsx` đã phải thay bằng span tĩnh.
 *
 * Vì vậy cụm nút phải dùng CÙNG một cổng với bộ đếm: `bufferedSpans > 0`.
 *
 * Repo không có jsdom (vitest.config.mts:11 `environment: 'node'`) nên phần
 * JSX khoanh bằng đọc source. `core.autocrlf`: CRLF trên đĩa, LF ở CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (c) => c.replace(/[^\n]/g, ' '));
}

const code = stripComments(read('components/settings/telemetry-tab.tsx'));

/** Khối header chứa bộ đếm và cụm nút (neo bằng class vì comment đã bị cắt). */
const headerStart = code.indexOf('justify-between gap-3 border-b border-subtle pb-3');
const headerEnd = code.indexOf('{traces.length === 0 ? (');
expect(headerStart, 'không tìm thấy khối header trong telemetry-tab.tsx').toBeGreaterThan(-1);
expect(headerEnd, 'không tìm thấy đầu nhánh bảng Waterfall').toBeGreaterThan(headerStart);
const HEADER = code.slice(headerStart, headerEnd);

/** Cổng của bộ đếm span, đọc thẳng từ source. */
const counterGate = code.match(/\{(bufferedSpans\s*[><=]+\s*\d+)\s*&&\s*\(\s*<span/)?.[1];
expect(counterGate, 'không tìm thấy cổng của bộ đếm span').toBeTruthy();

describe('telemetry tab — cụm nút chỉ hiện khi có gì để làm', () => {
  /**
   * ĐỎ khi: bỏ cổng khỏi cụm nút (trả về `<div className="flex items-center
   * gap-2">` trần), tức hai nút hiện trên bộ đệm rỗng.
   */
  it('cụm nút nằm sau một cổng, không render trần', () => {
    const buttons = HEADER.match(/<button[\s\S]*?<\/button>[\s\S]*?<button[\s\S]*?<\/button>/);
    expect(buttons, 'header phải còn hai nút Làm mới / Xóa cache').toBeTruthy();
    const gateAt = HEADER.search(/\{bufferedSpans\s*[><=]+\s*\d+\s*&&\s*\(\s*<div/);
    expect(gateAt, 'cụm nút phải mở bằng {bufferedSpans … && ( <div>').toBeGreaterThan(-1);
    expect(gateAt, 'cổng phải nằm TRƯỚC nút đầu tiên').toBeLessThan(HEADER.indexOf('<button'));
  });

  /**
   * ĐỎ khi: dùng một cổng KHÁC với bộ đếm (vd `traces.length > 0`, hoặc
   * `instrumentationStarted`). Bộ đếm nói "chỉ khi đệm có span", cụm nút nói
   * "chỉ khi đã từng có span" — hai ngưỡng khác nhau là hai câu trả lời khác
   * nhau cho cùng một câu hỏi.
   */
  it('cụm nút dùng ĐÚNG cổng của bộ đếm', () => {
    const gate = HEADER.match(/\{(bufferedSpans\s*[><=]+\s*\d+)\s*&&\s*\(\s*<div/)?.[1];
    expect(gate, 'cụm nút phải mở bằng {bufferedSpans … && (').toBeTruthy();
    expect(gate!.replace(/\s+/g, ''), 'cổng của cụm nút lệch cổng của bộ đếm').toBe(
      counterGate!.replace(/\s+/g, ''),
    );
  });

  /**
   * ĐỎ khi: đổi cổng thành `bufferedSpans >= 0` hoặc bỏ hẳn điều kiện của
   * bộ đếm — lúc đó cả hai cùng luôn hiện và lỗi này quay lại nguyên trạng.
   */
  it('cổng là "đệm CÓ span", không phải "luôn hiện"', () => {
    expect(counterGate!.replace(/\s+/g, '')).toBe('bufferedSpans>0');
  });

  /**
   * ĐỎ khi: đóng cổng sớm (return sớm khi rỗng) để hai nút "không bao giờ
   * hiện". Nghĩa là đúng, nhưng thay vì ẩn nút thì ẩn luôn tiêu đề tab —
   * bài toán của file này là ẩn VIỆC, không phải ẩn bảng.
   */
  it('không thoát sớm làm mất tiêu đề khi đệm rỗng', () => {
    expect(code).toContain('OpenTelemetry Waterfall');
    expect(code).not.toMatch(/if\s*\(\s*bufferedSpans\s*===\s*0\s*\)\s*return/);
  });
});

describe('telemetry tab — chữ người dùng đọc', () => {
  /**
   * ĐỎ khi: thêm emoji vào bất kỳ chuỗi nào (một icon là ngôn ngữ, emoji
   * thì không).
   */
  it('không có emoji trong chữ người dùng đọc', () => {
    const bad: string[] = [];
    const re = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      const lit = m[1] ?? m[2] ?? m[3] ?? '';
      if (/\p{Extended_Pictographic}/u.test(lit)) bad.push(lit);
    }
    expect(bad, `emoji trong copy: ${bad.join(' | ')}`).toEqual([]);
  });

  /**
   * ĐỎ khi: nhánh rỗng hứa dữ liệu sẽ tới (câu cũ: "Chưa có dữ liệu đo đạc"
   * đứng cạnh một bộ đếm trông như đang tải). Không có mã nào ghi span thì
   * không được hứa.
   */
  it('nhánh rỗng nói thẳng là chưa bật, không hứa dữ liệu sẽ tới', () => {
    const literals: string[] = [];
    const re = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) literals.push(m[1] ?? m[2] ?? m[3] ?? '');
    expect(literals.join('\n')).toContain('Đo đạc chưa được bật trong bản này.');
    expect(literals.join('\n')).not.toContain('Chưa có dữ liệu đo đạc.');
    expect(literals.join('\n'), 'không có em dash trong copy').not.toContain('—');
  });
});