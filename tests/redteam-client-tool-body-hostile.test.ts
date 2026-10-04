/**
 * RED TEAM — thân chip của tool chạy phía CLIENT.
 *
 * Đọc mạch thật, không đoán:
 *  react/use-chat-orchestration.ts:1348  → rawHandleClientToolCall (Promise<string>)
 *  react/use-chat-orchestration.ts:2100  → arm client trả JSON.stringify(data)
 *  react/use-chat-orchestration.ts  → addToolResult → message.toolInvocations[].result
 *  components/chat/tool-trace.tsx:139-141 → ev.body = inv.result (nguyên văn)
 *  components/chat/tool-trace.tsx:491  → <pre>{shown}</pre>
 *
 * `toolResultBody` (lib/agent-tools.ts) — hàm viết riêng để "rút phần thân đọc
 * được" — CHỈ được gọi ở tầng server cho tool server. Tool client không bao giờ
 * đi qua nó. File này khẳng định điều người đọc phải thấy khi bấm mở chip.
 */
import { describe, expect, it } from 'vitest';

import { collectToolEvents } from '@/components/chat/tool-trace';
import { toolResultBody } from '@/lib/agent-tools';

/** Đúng hình dạng tool client trả về — JSON.stringify, không parse lại. */
function runnerOutput(data: unknown): string {
  return JSON.stringify(data);
}

function chipBody(toolName: string, result: unknown): string | undefined {
  return collectToolEvents(undefined, [
    { toolCallId: 't1', toolName, state: 'result', args: {}, result },
  ])[0].body;
}

/* ------------------------------------------------------------------ */

describe('thân chip tool client — phải là nội dung đọc được, không phải JSON thô', () => {
  it('fs_read: chip phải hiện nội dung file, không phải {"path":...,"content":...}', () => {
    const result = runnerOutput({
      path: 'src/a.ts',
      content: 'export const a = 1;\nexport const b = 2;',
      truncated: false,
    });
    expect(chipBody('fs_read', result)).toBe('export const a = 1;\nexport const b = 2;');
  });

  it('fs_list: chip phải hiện danh sách tên file, không phải JSON mảng', () => {
    const result = runnerOutput([{ name: 'src', type: 'dir' }, { name: 'a.ts', type: 'file' }]);
    expect(chipBody('fs_list', result)).toBe('src/\na.ts');
  });

  it('fs_search: chip phải hiện path:line: text', () => {
    const result = runnerOutput([{ path: 'src/a.ts', line: 7, text: 'const x = 1;' }]);
    expect(chipBody('fs_search', result)).toBe('src/a.ts:7: const x = 1;');
  });

  it('shell_run: chip phải hiện stdout, không phải {"code":0,"stdout":"..."}', () => {
    const result = runnerOutput({ code: 0, stdout: 'npm ok\n', stderr: '' });
    expect(chipBody('shell_run', result)).toBe('npm ok\n');
  });

  it('không mảnh chip nào được BẮT ĐẦU bằng dấu { hoặc [', () => {
    const bodies = [
      chipBody('fs_read', runnerOutput({ path: 'a.ts', content: 'x' })),
      chipBody('fs_list', runnerOutput([{ name: 'a', type: 'file' }])),
      chipBody('fs_search', runnerOutput([{ path: 'a', line: 1, text: 'x' }])),
      chipBody('shell_run', runnerOutput({ code: 0, stdout: 'x' })),
    ];
    for (const b of bodies) {
      expect((b ?? '').trimStart().slice(0, 1)).not.toMatch(/[[{]/);
    }
  });

  it('toolResultBody phải đọc được CÙNG hình dạng đó (hai đường phải cùng ý)', () => {
    /* Hai đường đang bất đồng: hàm viết cho việc này lại không đọc được dữ
       liệu của đường kia. */
    const result = runnerOutput({ path: 'a.ts', content: 'nội dung file' });
    expect(toolResultBody('fs_read', result)).toBe('nội dung file');
  });
});