/*
 * Tab Đo đạc không được vẽ ra thứ nó không có.
 *
 * Sự thật đã kiểm bằng đọc mã: bản build này KHÔNG gọi
 * `globalTracer.startSpan` ở bất kỳ đâu trong mã chạy thật (chỉ
 * `tests/telemetry-tracer.test.ts` gọi), nên bộ đệm luôn rỗng và Waterfall
 * luôn trống. Trước khi sửa, tab in `0 / 500 spans` NGAY CẠNH dòng "Chưa có
 * dữ liệu đo đạc", trông như đang đếm thứ không bao giờ tới.
 *
 * Repo không có jsdom nên phần JSX được khoanh bằng cách đọc source (cùng
 * cách tests/design-system.test.ts và tests/staging-panel-keyboard.test.ts làm).
 * Phần thuần thì test thẳng.
 *
 * Mỗi `it` ghi rõ DÒNG nào đổi làm nó ĐỎ.
 *
 * `core.autocrlf`: file trên đĩa là CRLF còn CI là LF, nên regex viết cứng
 * `\n` sẽ xanh ở máy này và đỏ ở máy kia. Chuẩn hoá đúng một lần.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LightweightTracer, MAX_TELEMETRY_SPANS } from '@/core/telemetry/tracer';

const ROOT = path.resolve(__dirname, '..');

/** Đọc + chuẩn hoá EOL. Mọi assert source bên dưới đều đi qua đây. */
function read(rel: string): string {
  return fs.readFileSync(path.resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Cắt comment trước khi soi. Comment tiếng Việt trong repo hay NHẮC ĐÚNG
 * những thứ đã bị gỡ (ví dụ khi viết chú thích cho nhánh "mô phỏng" cũ), nên
 * để nguyên comment thì bài test báo động giả. Thay bằng newline rỗng để
 * số dòng trong thông điệp đỏ vẫn khớp thật.
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (c) => c.replace(/[^\n]/g, ' '));
}

/** Chỉ những CHỮI STRING trong mã đã cắt comment: đó mới là chữ người đọc. */
function stringLiterals(code: string): string[] {
  const out: string[] = [];
  const re = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  return out;
}

const tabCode = stripComments(read('components/settings/telemetry-tab.tsx'));

describe('tracer — phân biệt "chưa bật đo đạc" với "đã xoá cache"', () => {
  /*
   * Hai trạng thái rỗng này đòi hai câu chữ khác nhau. Gộp chung thì một
   * trong hai nói sai, nên trạng thái phải sống được trong chính tracer chứ
   * không suy từ `size === 0` lúc render.
   */

  it('tracer mới thì chưa từng start span nào', () => {
    expect(new LightweightTracer().hasEverStartedSpan).toBe(false);
  });

  it('start rồi end một span là đã bật đo đạc', () => {
    const tracer = new LightweightTracer();
    const span = tracer.startSpan('turn:execute');
    tracer.endSpan(span.id);
    expect(tracer.hasEverStartedSpan).toBe(true);
  });

  it('span đang mở (chưa end) vẫn tính là đã bật', () => {
    const tracer = new LightweightTracer();
    tracer.startSpan('tool:fs_read');
    expect(tracer.hasEverStartedSpan, 'đang ghi thì không phải "đệm rỗng vì xoá"').toBe(true);
  });

  it('clear() xoá span nhưng KHÔNG xoá dấu vết đã start', () => {
    const tracer = new LightweightTracer();
    const span = tracer.startSpan('turn:execute');
    tracer.endSpan(span.id);
    tracer.clear();
    expect(tracer.size).toBe(0);
    expect(
      tracer.hasEverStartedSpan,
      'nếu clear() xoá cờ này thì tab sẽ nói "chưa bật đo đạc" sau khi người dùng vừa xoá cache',
    ).toBe(true);
  });

  it('vẫn giữ trần ring buffer sau khi thêm cờ đếm', () => {
    const tracer = new LightweightTracer(3);
    for (let i = 0; i < 6; i++) tracer.endSpan(tracer.startSpan(`span-${i}`).id);
    expect(tracer.size, 'thêm state không được phá trần bộ đệm xoay vòng').toBe(3);
    expect(MAX_TELEMETRY_SPANS).toBe(500);
  });
});

describe('telemetry tab — không vẽ bộ đếm cho đệm rỗng', () => {
  /*
   * Đổi `bufferedSpans > 0 &&` thành `>= 0`, hoặc bỏ hẳn điều kiện, là ĐỎ.
   */

  it('bộ đếm span nằm trong nhánh chỉ hiện khi đệm có span', () => {
    expect(tabCode).toMatch(
      /\{bufferedSpans > 0 && \(\s*<span[^>]*>\s*\{bufferedSpans\} \/ \{MAX_TELEMETRY_SPANS\} spans/,
    );
  });

  it('tử số lấy từ kích thước thật của ring buffer, không phải 100 span vừa tải', () => {
    expect(tabCode, 'tab phải đọc size của tracer').toMatch(/const bufferedSpans = globalTracer\.size;/);
  });

  it('không còn mẫu số 500 gõ cứng', () => {
    expect(tabCode).not.toMatch(/500 spans/);
    expect(
      tabCode,
      'gõ 500 cứng là đoán: đổi hằng MAX_TELEMETRY_SPANS thì tab vẫn in 500',
    ).not.toMatch(/\/ 500\b/);
  });

  it('nhánh rỗng nói thẳng đo đạc chưa bật thay vì hứa dữ liệu sẽ tới', () => {
    const literals = stringLiterals(tabCode);
    expect(literals.join('\n')).toContain('Đo đạc chưa được bật trong bản này.');
    expect(
      literals.join('\n'),
      'câu cũ hứa "khi bạn trò chuyện... sẽ xuất hiện" là nói dối: không có mã nào ghi span',
    ).not.toContain('Chưa có dữ liệu đo đạc.');
  });

  it('trạng thái rỗng phân nhánh theo đo đạc đã bật hay chưa', () => {
    expect(tabCode, 'phải đọc cờ hasEverStartedSpan để chọn câu chữ').toMatch(
      /const instrumentationStarted = globalTracer\.hasEverStartedSpan;/,
    );
    expect(tabCode).toMatch(/instrumentationStarted\s*\?[^:]*:\s*'Đo đạc chưa được bật trong bản này\.'/);
  });

  it('không có em dash trong chữ người dùng đọc', () => {
    const bad = stringLiterals(tabCode).filter((s) => s.includes('—'));
    expect(bad, `em dash trong copy: ${bad.join(' | ')}`).toEqual([]);
  });
});