/**
 * Tiêu đề phiên phải giữ được link và dấu chấm trong từ.
 *
 * Bug gốc: `PREAMBLE_RE` cũ là `/^\s*(?:\[[^\][\n]*\]\s*)+/` — lớp ký tự
 * đóng ở `]`, rồi `\s*` khớp được CỐ KHÔNG ký tự, nên `[React](https://...)`
 * bị nuốt trọn như tiền tố. Người dùng dán link, phiên được đặt tên
 * "https react dev giúp tôi hiểu hooks" — mảnh url thay cho lời họ.
 *
 * Sửa: `(?=\s|$)` — sau `]` phải là hết chuỗi hoặc khoảng trắng.
 *
 * Sợ nhầm ngược (regex ngừng khớp tiền tố thật) thì tệ hơn bug đang sửa, nên
 * ở đây tiền tố không được hardcode theo trí nhớ: `planBranch` cắt thẳng từ
 * source `lib/cli/interactive-agent.ts` và lấy đúng chuỗi mà nhánh `/plan` còn
 * gửi đi. Đổi emitter -> test đỏ ngay ở chỗ cần đổi, không âm thầm lệch.
 *
 * Mỗi `it` ghi rõ điều kiện đảo ngược nào làm nó ĐỎ. Không có `it` nào ở đây
 * mà câu hỏi "đổi dòng nào thì nó đỏ" không có câu trả lời.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TITLE, deriveTitle } from '@/lib/use-title-generator';

const ROOT = path.resolve(__dirname, '..');

/** Đọc source đã normalize CRLF → LF (repo bật `core.autocrlf`). */
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

const cliSource = read('lib/cli/interactive-agent.ts');

/** Nhánh `if (trimmed.startsWith('/plan') ...)` — nơi duy nhất còn gửi tiền tố. */
const planBranch = (() => {
  const start = cliSource.indexOf("if (trimmed.startsWith('/plan')");
  expect(start, 'không tìm thấy nhánh /plan trong lib/cli/interactive-agent.ts').toBeGreaterThan(-1);
  const end = cliSource.indexOf('rl.prompt();', start);
  expect(end, 'nhánh /plan không kết thúc bằng rl.prompt()').toBeGreaterThan(start);
  return cliSource.slice(start, end);
})();

/** Chữ trong `[...]` mà nhánh `/plan` thật sự ghép vào tin nhắn người dùng. */
const livePlanPrefix = planBranch.match(/`\[([^\][\n]*)\]/)?.[1] ?? '';

describe('tiền tố hệ thống: bỏ tiền tố thật, giữ link thật', () => {
  it('tiền tố /plan của CLI là mẫu duy nhất còn được gửi đi', () => {
    /* ĐỎ nếu emitter đổi nội dung hoặc bỏ ngoặc vuông: `livePlanPrefix` rỗng
       thì các test dưới im lặng chạy trên chuỗi bịa ra. Không assert đúng
       câu chữ — chỉ assert nó còn là nhãn tiền tố dạng "Chế độ ...". */
    expect(livePlanPrefix).toMatch(/^Chế độ .+ - .+$/);
    // Dấu xuống dòng của lời gọi hàm không quan tâm: nối khoảng trắng lại trước.
    expect(planBranch.replace(/\s+/g, ' ')).toContain(`agent.streamTurn( \`[${livePlanPrefix}]`);
  });

  it('tiền tố thật vẫn bị bỏ, lời người dùng phía sau được giữ nguyên', () => {
    /* ĐỎ nếu PREAMBLE_RE mất `(?=\s|$)`? Không — `]` ở đây theo sau bởi
       khoảng trắng nên vẫn khớp. ĐỎ nếu mất `+`, mất neo `^`, hoặc xoá hẳn
       PREAMBLE_RE: lúc đó tiêu đề mở đầu bằng "Chế độ Lập Kế Hoạch". */
    const asked = 'Hãy sửa lỗi trong auth.ts';
    expect(deriveTitle(`[${livePlanPrefix}] ${asked}`)).toBe(asked);
  });

  it('tiền tố thật đứng một mình (hết chuỗi) vẫn bị bỏ', () => {
    /* ĐỎ nếu bỏ `|$` khỏi `(?=\s|$)`: chuỗi còn nguyên ngoặc vuông. */
    expect(deriveTitle(`[${livePlanPrefix}]`)).toBe(DEFAULT_TITLE);
  });

  it('tiền tố + câu người dùng có dấu chấm trong tên file: cả hai đều đúng', () => {
    /* ĐỎ nếu mất firstSentence ("Sửa auth.ts. Rồi chạy test." bị dán làm
       một mảnh), ĐỎ nếu NOISE_RE nuốt mất dấu `.` trong `auth.ts`, ĐỎ nếu
       tiền tố không bị bỏ. Ba hỏng nằm chung một hàng này. */
    expect(deriveTitle(`[${livePlanPrefix}] Sửa auth.ts. Rồi chạy test.`)).toBe('Sửa auth.ts');
  });
});

describe('link markdown ở đầu tin nhắn không phải tiền tố', () => {
  it('nhãn link sống sót, mảnh url không thành tên phiên', () => {
    /* ĐỎ nếu bỏ `(?=\s|$)` khỏi PREAMBLE_RE: khi đó `]` khớp rồi `\s*` khớp
       rỗng, `[React]` bị ăn và tiêu đề mở đầu bằng "https". */
    const title = deriveTitle('[React](https://react.dev) giúp tôi hiểu hooks');
    expect(title).toBe('React https react.dev giúp tôi hiểu hooks');
    expect(title.startsWith('React')).toBe(true);
    expect(title.startsWith('https')).toBe(false);
  });

  it('link là cả tin nhắn vẫn ra tiêu đề, không rơi về tên mặc định', () => {
    /* ĐỎ nếu PREAMBLE_RE ăn mất nhãn rồi chuỗi rỗng -> DEFAULT_TITLE. */
    expect(deriveTitle('[React](https://react.dev)')).toBe('React https react.dev');
  });

  it('tiền tố đứng trước link thì bỏ tiền tố, giữ link', () => {
    /* ĐỎ nếu nhóm `+` ngừng lặp sau lần khớp đầu: `(?=\s|$)` làm lần khớp
       đầu ngừng ngay sau `]`, nên phải còn `+` mới bỏ được cả hai. */
    expect(deriveTitle(`[${livePlanPrefix}] [React](https://react.dev) hooks`)).toBe(
      'React https react.dev hooks',
    );
  });

  it('link ở GIỮA câu không đụng tới PREAMBLE_RE (đã có neo `^`)', () => {
    /* ĐỎ nếu neo `^\s*` bị gỡ. */
    expect(deriveTitle('Xem tài liệu [React](https://react.dev) đi')).toBe(
      'Xem tài liệu React https react.dev đi',
    );
  });
});

describe('dấu chấm và gạch chéo trong tên file không bị nuốt', () => {
  it('. nằm giữa chữ/số thì giữ, dấu ở CUỐI câu thì vẫn cắt', () => {
    /* ĐỎ nếu NOISE_RE quay về `[^\p{L}\p{N}\s]+`: `auth.ts` -> `auth ts`.
       ĐỎ nếu cho phép `.` ở cuối sống: `nhé!` -> `nhé!`. */
    expect(deriveTitle('sửa file auth.ts')).toBe('sửa file auth.ts');
    expect(deriveTitle('sửa file auth.ts nhé!')).toBe('sửa file auth.ts nhé');
  });

  it('/ nằm trong đường dẫn thì giữ nguyên cả đường dẫn', () => {
    /* ĐỎ nếu NOISE_RE bỏ `/` không điều kiện. */
    expect(deriveTitle('sửa src/app/page.tsx nhé')).toBe('sửa src/app/page.tsx nhé');
  });

  it('hai câu vẫn cắt đúng ranh giới câu, dấu chấm câu không lọt vào tiêu đề', () => {
    /* ĐỎ nếu mất firstSentence (ra "Xin chào Trả lời đúng"), ĐỎ nếu NOISE_RE
       giữ luôn dấu `.` ở cuối câu (ra "Xin chào."). */
    expect(deriveTitle('Xin chào. Trả lời đúng 3 dòng.')).toBe('Xin chào');
  });
});

describe('đánh đổi đã biết được khoá lại, không âm thầm', () => {
  it('ngoặc vuông ở đầu mà không phải tiền tố vẫn mất (chấp nhận, có ghi)', () => {
    /* ĐỎ nếu ai đó sửa hành vi này mà không cập nhật docblock ở PREAMBLE_RE:
       khi đó dòng "Đánh đổi đã biết" trong docblock thành nói dối. */
    expect(deriveTitle('[1] nguồn tham khảo đây')).toBe('nguồn tham khảo đây');
    expect(deriveTitle('[ghi chú riêng]')).toBe(DEFAULT_TITLE);
  });

  it('chuỗi rỗng / khoảng trắng thuần -> tên mặc định', () => {
    expect(deriveTitle('')).toBe(DEFAULT_TITLE);
    expect(deriveTitle('  \n\t ')).toBe(DEFAULT_TITLE);
    expect(deriveTitle(null)).toBe(DEFAULT_TITLE);
    expect(deriveTitle(undefined)).toBe(DEFAULT_TITLE);
  });
});