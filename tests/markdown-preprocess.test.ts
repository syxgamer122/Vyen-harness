/**
 * `preprocessMarkdown` loại rác JS bị serialize vào text stream của model
 * (`undefined`, `null`, `NaN`, `[object X]`) — chỉ khi artifact nằm ở DÒNG
 * RIÊNG tại ĐUÔI chuỗi, và chỉ trên segment cuối cùng ngoài code fence.
 *
 * Lớp phòng thủ này chạy trên output của model (không tin cậy) nên vừa phải
 * đúng, vừa phải không treo. Test dưới khoá CẢ HAI chiều: dữ liệu đúng phải
 * được giữ nguyên, và chi phí phải tuyến tính chứ không vuô thành bậc hai.
 */

import { describe, expect, it } from 'vitest';

import { preprocessMarkdown } from '../lib/markdown-preprocess';

describe('stripTrailingArtifacts — dữ liệu đúng phải được giữ', () => {
  it('xoá artifact nằm trên dòng riêng ở đuôi', () => {
    /* Dấu xuống dòng cuối được giữ lại — regex cũ ăn nó, mình phải giữ đúng
     * như vậy, markdown không đổi hiển thị vì đây đã là cuối chuỗi. */
    expect(preprocessMarkdown('Câu trả lời\n\nundefined', false)).toBe('Câu trả lời\n');
    expect(preprocessMarkdown('Kết quả:\n\n[object Object]', false)).toBe('Kết quả:\n');
    expect(preprocessMarkdown('Xong rồi\n\nNaN\n', false)).toBe('Xong rồi\n');
  });

  it('xoá NHIỀU artifact khi nằm cạnh nhau', () => {
    /* Artifact LIỀN KỀ thì regex cũ ăn trọn cả khối kể cả dấu \n dẫn vào nó,
     * nên kết quả không còn dấu xuống dòng — khác với ca 1 artifact. */
    expect(preprocessMarkdown('Câu trả lời\nundefined\nnull', false)).toBe('Câu trả lời');
    expect(preprocessMarkdown('Câu trả lời\r\nundefined\r\nnull', false)).toBe('Câu trả lời');
  });


  it('CHỈ xoá artifact cuối khi các artifact ngăn cách bởi dòng trống', () => {
    /* Hành vi có từ regex cũ và phải giữ nguyên: khoảng cách giữa hai dòng
     * artifact chỉ chấp nhận space/tab, KHÔNG chấp nhận dòng trống. Model
     * chỉ rác nối đuôi ở 1-2 dòng cuối nên không thấy khác biệt. */
    expect(preprocessMarkdown('Câu trả lời\n\nundefined\n\nnull', false)).toBe(
      'Câu trả lời\n\nundefined\n',
    );
  });


  it('GIỮ câu hợp lệ chứa từ undefined', () => {
    /* Bài toán nguyên bản: regex `/\bundefined\b$/` trần sẽ xoá đoạn này. */
    const valid = 'Biến này trả về undefined khi chưa khởi tạo.';
    expect(preprocessMarkdown(valid, false)).toBe(valid);
  });

  it('KHÔNG xoá artifact ở giữa văn bản', () => {
    /* Chỉ artifact ở ĐUÔI mới là rác. Ở giữa thì chưa biết model còn đang
     * viết dở hay không — nên để nguyên. */
    const mid = 'Câu 1\n\nundefined\nCâu 2';
    expect(preprocessMarkdown(mid, false)).toBe(mid);
  });

  it('KHÔNG xoá artifact nếu sau nó còn văn bản', () => {
    const s = 'Đoạn văn\n\n[object Object]\nphần còn lại';
    expect(preprocessMarkdown(s, false)).toBe(s);
  });

  it('không đụng artifact nằm trong code fence', () => {
    const s = '```js\nconst x = undefined;\n```';
    expect(preprocessMarkdown(s, false)).toBe(s);
  });

  it('giữ nguyên chuỗi khi KHÔNG có artifact nào để xoá', () => {
    /* Kể cả khi chuỗi toàn khoảng trắng — regex cũ chỉ ăn khoảng trắng đuôi
     * khi nó đã khớp, tức là khi đã xoá artifact. */
    expect(preprocessMarkdown('   ', false)).toBe('   ');
    expect(preprocessMarkdown('Câu trả lời bình thường.', false)).toBe(
      'Câu trả lời bình thường.',
    );
  });

  it('xoá đúng cả khi xuống dòng kiểu CRLF', () => {
    /* `end` phải lùi qua `\r`; nếu quên thì dòng đang xét mang theo `\r`
     * và ARTIFACT_LINE không khớp -> sót rác. */
    expect(preprocessMarkdown('Câu trả lời\r\n\r\nundefined', false)).toBe('Câu trả lời\r\n');
    expect(preprocessMarkdown('Câu trả lời\r\n\r\nundefined\r\n', false)).toBe('Câu trả lời\r\n');
  });


  it('xoá được artifact dính ngay sau delimiter toán/HTML đóng', () => {
    expect(preprocessMarkdown('$$\nx^2\n$$undefined', false)).toContain('$$');
    expect(preprocessMarkdown('$$\nx^2\n$$undefined', false)).not.toContain('undefined');
  });
});

describe('stripTrailingArtifacts — chi phí phải tuyến tính', () => {
  /* Bản regex cũ `(?:\r?\n[ \t]*TOKEN[ \t]*)+[\s]*$` không neo nên engine thử
   * lại ở MỌI vị trí `\n`, mỗi lần quét hết tới cuối chuỗi -> O(n²). Đo được
   * 5.4s với chuỗi 160KB. Bản quét ngược chạy 1.6ms trên cùng input.
   *
   * Ngân sách 500ms (giống fence ReDoS ở tests/secret-registry.test.ts) nằm
   * giữa hai mức với biên rất rộng: bản mới dư ~300x, bản cũ vượt ~10x. Nên
   * gate này đỏ vì hồi quy thật, không phải vì máy chậm. */
  const BUDGET_MS = 500;

  it('160KB artifact + đuôi không khớp vẫn nằm trong ngân sách', () => {
    const adversarial =
      Array.from({ length: 16_000 }, () => '\nundefined').join('') + '\ntext thuong';

    const started = performance.now();
    preprocessMarkdown(adversarial, false);
    const elapsed = performance.now() - started;

    expect(
      elapsed,
      `${adversarial.length} ký tự mất ${elapsed.toFixed(0)}ms — nghi vấn O(n²)`,
    ).toBeLessThan(BUDGET_MS);
  });

  it('vẫn bằng luận 2x thêm dữ liệu thì không bật lên bậc hai', () => {
    /* Bậc hai nhân 4 mỗi lần gấp đôi. Bản tuyến tính nhân ~2. Đo cả hai
     * cỡ rồi so TỶ LỆ — bắt được hồi quy ngay cả khi máy chậm đến mức
     * bản cũ vẫn lọt dưới BUDGET_MS tuyệt đối. */
    const build = (n: number) =>
      Array.from({ length: n }, () => '\nundefined').join('') + '\ntext thuong';

    const time = (s: string) => {
      const t0 = performance.now();
      preprocessMarkdown(s, false);
      return performance.now() - t0;
    };

    time(build(1_000)); // warm-up
    const small = time(build(4_000));
    const large = time(build(16_000));

    // Cho phép rộng vì JIT rung; O(n²) thật là ~16x.
    expect(large, `${small.toFixed(1)}ms -> ${large.toFixed(1)}ms`).toBeLessThan(
      Math.max(small * 8, 20),
    );
  });
});
