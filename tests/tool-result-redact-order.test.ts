/**
 * THỨ TỰ redact → cắt trong sanitizeToolInvocations (lib/db.ts).
 *
 * lib/tool-limits.ts:62-65 nói thẳng vì sao thứ tự này là bảo mật chứ không phải
 * thẩm mỹ: "nếu cắt trước, một khoá nằm vắt qua ranh giới cắt sẽ chỉ còn nửa
 * chuỗi và không khớp rule nào nữa". Nửa khoá đó không bị che, rồi được ghi vào
 * IndexedDB và đọc lại lên ngữ cảnh ở lượt sau — đường rò đúng kiểu mà
 * `sanitizeAttachments` đã tránh được và `sanitizeToolInvocations` thì không.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  sanitizeToolInvocations,
  STORED_TOOL_RESULT_CHARS,
} from '@/lib/db';
import {
  __resetDefaultSecretRegistry,
  getDefaultSecretRegistry,
  redactSecretText,
  REDACT_PLACEHOLDER,
} from '@/lib/secret-registry';

afterEach(() => {
  __resetDefaultSecretRegistry();
});

/**
 * Khoá đã ĐĂNG KÝ (value-based) dài hơn phần bị cắt, để mảnh sót lại đủ dài để
 * nhận ra. Chọn đường đăng ký giá trị thay vì pattern vì nó không tuỳ regex.
 */
const SECRET = 'VyenStraddleSecretValue-9f3a7c21';

function registerSecret(): void {
  expect(getDefaultSecretRegistry().register(SECRET, 'test')).toBe(true);
}

/** `preview` mà sanitizeToolInvocations thực sự ghi xuống DB. */
function storedPreview(content: string): string {
  const out = sanitizeToolInvocations([
    { toolCallId: 't1', toolName: 'fs_read', state: 'result', result: { content } },
  ])!;
  expect((out[0].result as { truncated?: boolean }).truncated).toBe(true);
  return (out[0].result as { preview: string }).preview;
}

describe('khoá bí mật nằm VẮT qua ranh giới cắt', () => {
  it('không mảnh nào của khoá sống sót trong phần đã lưu', () => {
    registerSecret();
    /* Đặt khoá bắt đầu 10 ký tự TRƯỚC ranh giới cắt → nếu cắt trước rồi mới
       redact, 10 ký tự đầu của khoá sẽ nằm trong preview đã lưu. */
    const beforeCut = 10;
    const jsonPrefix = '{"content":"';
    const filler = 'x'.repeat(STORED_TOOL_RESULT_CHARS - jsonPrefix.length - beforeCut);
    const stored = storedPreview(filler + SECRET + 'y'.repeat(30_000));

    expect(stored.length).toBeLessThanOrEqual(STORED_TOOL_RESULT_CHARS);
    expect(stored).not.toContain(SECRET.slice(0, beforeCut));
    expect(stored).not.toContain(SECRET.slice(beforeCut));
    expect(stored).not.toContain(SECRET);
    expect(stored).toContain(REDACT_PLACEHOLDER);
  });

  it('đối chứng: nếu cắt trước rồi redact thì mảnh đầu ĐÃ bị lọt', () => {
    /* Test này không đổi hành vi gì — nó khoá lại lý do của lỗi, để sau này
       không ai "tối ưu" lại thành slice() rồi redactSecretText(). */
    registerSecret();
    const beforeCut = 10;
    const jsonPrefix = '{"content":"';
    const filler = 'x'.repeat(STORED_TOOL_RESULT_CHARS - jsonPrefix.length - beforeCut);
    const naiveCutThenRedact = cutThenRedact(filler + SECRET + 'y'.repeat(30_000));

    expect(naiveCutThenRedact).toContain(SECRET.slice(0, beforeCut));
  });

  it('khoá nằm trọn trong phần đầu cũng bị che', () => {
    registerSecret();
    const stored = storedPreview(SECRET + 'x'.repeat(60_000));
    expect(stored).not.toContain(SECRET);
    expect(stored).toContain(REDACT_PLACEHOLDER);
  });

  it('khoá ở CUỐI payload (sau ranh giới cắt) không lọt vào phần đã lưu', () => {
    registerSecret();
    const filler = 'x'.repeat(STORED_TOOL_RESULT_CHARS + 5_000);
    const stored = storedPreview(filler + SECRET);
    expect(stored).not.toContain(SECRET);
  });
});

describe('cắt trần tool result', () => {
  /* Dựng một lần, dùng lại: redact trên chuỗi 1 MB tốn khoảng 2s. */
  const MEGABYTE = 'z'.repeat(1_000_000);

  it('kết quả khổng lồ: preview không vượt trần, có cờ + ghi chú', () => {
    const out = sanitizeToolInvocations([
      { toolCallId: 't1', toolName: 'fs_read', state: 'result', result: { content: MEGABYTE } },
    ])!;
    const result = out[0].result as { truncated?: boolean; preview: string; note?: string };
    expect(result.truncated).toBe(true);
    expect(result.preview.length).toBeLessThanOrEqual(STORED_TOOL_RESULT_CHARS);
    /* Ghi chú nói rõ đã bị cắt, không im lặng. */
    expect(result.note).toMatch(/bị cắt khi lưu/);
  });

  it('kết quả dưới trần giữ nguyên object gốc (redact chỉ áp cho ranh giới cắt)', () => {
    const original = { content: 'ngắn gọn' };
    const out = sanitizeToolInvocations([
      { toolCallId: 't1', toolName: 'fs_read', state: 'result', result: original },
    ])!;
    expect(out[0].result).toBe(original);
  });

  it('kết quả không serialize được vẫn không làm hỏng lượt ghi', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      sanitizeToolInvocations([
        { toolCallId: 't1', toolName: 'x', state: 'result', result: circular },
      ]),
    ).not.toThrow();
  });
});

/**
 * Mô phỏng đúng cái lỗi đã sửa: cắt trước, redact sau. Dùng làm đối chứng để
 * thấy mảnh đầu khoá bí mật SỐNG SÓT qua cả hai bước đó.
 */
function cutThenRedact(content: string): string {
  const raw = JSON.stringify({ content });
  return redactSecretText(raw.slice(0, STORED_TOOL_RESULT_CHARS));
}