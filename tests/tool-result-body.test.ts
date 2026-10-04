/**
 * `toolResultBody` — phần THÂN kết quả tool để người dùng mở ra đọc.
 *
 * Tách khỏi `summarizeToolResult` (nhãn một dòng trên chip) là CỐ Ý: hai hàm
 * trả hai thứ khác nhau cho hai nơi khác nhau. Test ở đây giữ luôn ranh giới
 * đó — không test sự tồn tại của hàm kia.
 *
 * Hình dạng trong test lấy từ code thật, không lấy từ bảng trong đề bài:
 *  - fs_list / fs_search trả MẢNG ở gốc (use-chat-orchestration.ts:1665,1744)
 *  - fs_read trả object `{ content }` (FsReadResult, lib/fs-access.ts:324)
 *  - shell_run trả `{ stdout, stderr }` (VyenRunResult, lib/desktop-bridge.ts:49)
 *  - bg_status trả `{ jobs: [{ outputTail }] }` — KHÔNG có `stdout`
 *  - git_diff/git_log bọc trong `{ diff }` / `{ log }`
 */

import { describe, expect, it } from 'vitest';
import { summarizeToolArgs, toolResultBody } from '@/lib/agent-tools';
import { TOOL_PREVIEW_MAX_CHARS } from '@/lib/tool-limits';

describe('toolResultBody — thân theo từng tool', () => {
  it('fs_read trả nội dung file thô', () => {
    expect(toolResultBody('fs_read', { content: 'abc' })).toBe('abc');
  });

  it('fs_read ảnh rơi về `description` khi không có `content`', () => {
    /* fs_read ảnh đi qua /api/vision và trả WorkspaceImageToolResult — không
       có trường `content` (lib/fs-vision.ts:34). Chỉ đọc `content` thì khung
       xem trước của mọi lần đọc ảnh sẽ trống. */
    expect(toolResultBody('fs_read', { path: 'a.png', kind: 'image', description: 'một con mèo' })).toBe(
      'một con mèo',
    );
  });

  it('fs_list: mỗi entry một dòng, thư mục hậu / để phân biệt với file', () => {
    const body = toolResultBody('fs_list', [
      { name: 'src', type: 'dir' },
      { name: 'README.md', type: 'file', size: 12 },
    ]);
    expect(body.split('\n')).toEqual(['src/', 'README.md']);
  });

  it('fs_search: path:line: text đúng kiểu grep', () => {
    const body = toolResultBody('fs_search', [
      { path: 'src/a.ts', line: 7, text: 'const x = 1;' },
      { path: 'src/b.ts', line: 9, text: 'const y = 2;' },
    ]);
    expect(body.split('\n')).toEqual([
      'src/a.ts:7: const x = 1;',
      'src/b.ts:9: const y = 2;',
    ]);
  });

  it('shell_run gộp cả stdout lẫn stderr — lệnh fail thường chỉ đổ vào stderr', () => {
    const body = toolResultBody('shell_run', { code: 1, stdout: 'a', stderr: 'b' });
    expect(body).toContain('a');
    expect(body).toContain('b');
  });

  it('shell_run chỉ có stderr vẫn trả nội dung', () => {
    expect(toolResultBody('shell_run', { code: 1, stdout: '', stderr: 'lỗi' })).toBe('lỗi');
  });

  it('bg_status đọc `jobs[].outputTail` — không phải `stdout`', () => {
    /* bridge.shell.bgStatus trả `{ jobs: VyenBgJob[] }` (lib/desktop-bridge.ts:315);
       đọc `r.stdout` sẽ trả '' mọi lần gọi. */
    const body = toolResultBody('bg_status', {
      jobs: [{ id: 'j1', status: 'done', exitCode: 0, outputTail: 'done in 3s' }],
    });
    expect(body).toContain('j1');
    expect(body).toContain('done in 3s');
  });

  it('git_diff/git_log đọc trường bọc `diff`/`log`', () => {
    expect(toolResultBody('git_diff', { diff: '@@ -1 +1 @@' })).toBe('@@ -1 +1 @@');
    expect(toolResultBody('git_log', { log: 'abc123 sửa lỗi' })).toBe('abc123 sửa lỗi');
  });

  it('web_search: `title - url` dùng DẤU GẠCH NỔI, không dùng gạch dài', () => {
    const body = toolResultBody('web_search', {
      results: [{ title: 'Tin A', url: 'https://a.com' }],
    });
    expect(body).toBe('Tin A - https://a.com');
    /* Gạch dài là ký tự copy-slop; quy tắc repo cấm trong chuỗi người thấy. */
    expect(body).not.toContain('—');
  });

  it('web_fetch trả nội dung trang', () => {
    expect(toolResultBody('web_fetch', { content: 'nội dung trang' })).toBe('nội dung trang');
  });

  it('mcp__*: content dạng chuỗi được giữ nguyên', () => {
    expect(toolResultBody('mcp__server__tool', { content: 'kết quả mcp' })).toBe('kết quả mcp');
  });

  it('mcp__*: object vòng KHÔNG được ném — lời gọi này nằm trên đường render', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => toolResultBody('mcp__x__y', circular)).not.toThrow();
    expect(toolResultBody('mcp__x__y', circular)).toBe('');
  });

  it('tool lạ không có thân riêng thì mô tả HÌNH DẠNG, không trả rỗng', () => {
    /* Trước đây nhánh default trả '' và không bao giờ gọi `briefShape` — chip
       "Hoàn tất" với vùng output trống khiến người dùng tưởng công cụ không
       trả gì. Mô tả hình dạng vẫn là KHÔNG đoán bừa nội dung. */
    expect(toolResultBody('unknown_tool_xyz', { a: 1, b: 2 })).toBe('2 trường');
  });

  it('kết quả rỗng THẬT vẫn trả chuỗi rỗng — không bịa nội dung để lấp chỗ trống', () => {
    expect(toolResultBody('unknown_tool_xyz', {})).toBe('');
    expect(toolResultBody('unknown_tool_xyz', null)).toBe('');
  });

  it('mảng rỗng nói rõ "0 phần tử" — chạy xong mà không có gì, khác với trống', () => {
    expect(toolResultBody('unknown_tool_xyz', [])).toBe('0 phần tử');
  });
});

describe('toolResultBody — trần ký tự', () => {
  it('thân vượt trần bị cắt về đúng maxChars ký tự', () => {
    /* maxChars nhỏ để assert tất định: mặc định 4.000 sẽ phải dựng 4.001 ký tự
       mới chứng minh được điều gì. */
    const body = toolResultBody('fs_read', { content: 'x'.repeat(5000) }, 100);
    expect(body.length).toBeLessThanOrEqual(100);
    /* Ký tự cuối là dấu cắt — nếu không có, hàm chỉ cắt im lặng và người đọc
       tưởng nội dung thật dừng ở đó. */
    expect(body.endsWith('…')).toBe(true);
  });

  it('thân ngắn hơn trần thì giữ nguyên, không thêm dấu cắt', () => {
    expect(toolResultBody('fs_read', { content: 'ngắn' }, 100)).toBe('ngắn');
  });

  it('mặc định lấy TOOL_PREVIEW_MAX_CHARS', () => {
    const body = toolResultBody('fs_read', { content: 'y'.repeat(TOOL_PREVIEW_MAX_CHARS + 1) });
    expect(body.length).toBeLessThanOrEqual(TOOL_PREVIEW_MAX_CHARS);
  });
});

describe('toolResultBody — dữ liệu rác không được làm vỡ', () => {
  it('undefined / null trả chuỗi rỗng, không ném', () => {
    expect(toolResultBody('fs_read', undefined)).toBe('');
    expect(toolResultBody('fs_read', null)).toBe('');
  });

  it('object đúng thay chỗ mảng (fs_list) không ném', () => {
    /* Lỗi từ fs-access tới dạng `{ error: ... }`, KHÔNG phải mảng — nếu gọi
       .map trực tiếp lên nó thì sập cả khung chat. */
    expect(toolResultBody('fs_list', { error: 'Đường dẫn không hợp lệ' })).toBe('');
  });

  it('mảng rỗng trả chuỗi rỗng, không trả dấu xuống dòng', () => {
    expect(toolResultBody('fs_list', [])).toBe('');
    expect(toolResultBody('fs_search', [])).toBe('');
    expect(toolResultBody('web_search', { results: [] })).toBe('');
  });

  it('content là số/boolean thì coi như không có thân', () => {
    expect(toolResultBody('fs_read', { content: 42 })).toBe('');
  });

  it('git_diff trả raw string (đường cũ) vẫn đọc được', () => {
    expect(toolResultBody('git_diff', 'diff --git a/x b/x')).toBe('diff --git a/x b/x');
  });
});

describe('summarizeToolArgs — fs_list với path rỗng', () => {
  it('path rỗng nghĩa là gốc workspace, hiện "." chứ không rơi sang briefArgs', () => {
    /* `??` không bắt được chuỗi rỗng: chip sẽ rơi xuống briefArgs và in thô
       `{"path":""}` — người dùng thấy JSON thay vì đường dẫn. */
    expect(summarizeToolArgs('fs_list', { path: '' })).toBe('.');
  });

  it('path thường vẫn giữ nguyên — chứng minh không làm hỏng case bình thường', () => {
    expect(summarizeToolArgs('fs_list', { path: 'src' })).toBe('src');
  });

  it('path thiếu hẳn vẫn ra "."', () => {
    expect(summarizeToolArgs('fs_list', {})).toBe('.');
  });
});