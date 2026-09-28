import { describe, it, expect } from 'vitest';

/**
 * Lưới an toàn cho onToolCall (react/use-chat-orchestration.ts).
 *
 * `ai@4` giữ invocation ở state `call` mãi mãi khi onToolCall không trả gì →
 * stream kết thúc `finish=tool-calls` nhưng không resubmit, người dùng thấy
 * agent "dừng giữa chừng" mà không có lý do. Quan sát thực tế trên máy:
 * fs_list trên thư mục không tồn tại → ENOENT → log ghi rồi im lặng, không có
 * request kế tiếp.
 *
 * Hàm dưới đây là bản sao logic của wrapper `executeClientToolCall`. Giữ
 * nguyên văn để test bám sát code thật; đổi wrapper thì cập nhật kèm.
 */
async function executeClientToolCall(
  raw: (call: { toolCall: { toolName: string; args?: unknown } }) => Promise<string>,
  call: { toolCall: { toolName: string; args?: unknown } },
): Promise<string> {
  const toolName = call.toolCall.toolName;
  let result: string;
  try {
    result = await raw(call);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    result = JSON.stringify({ error: `Tool "${toolName}" thất bại: ${detail}`, tool: toolName });
  }
  if (typeof result !== 'string' || result.length === 0) {
    result = JSON.stringify({ error: `Tool "${toolName}" trả về rỗng — không có kết quả để xử lý.`, tool: toolName });
  }
  return result;
}

describe('onToolCall guard — không bao giờ trả rỗng', () => {
  it('handler throw ENOENT thì trả JSON lỗi thay vì treo', async () => {
    // Đảo điều kiện: bỏ try/catch trong wrapper thì promise reject → test đỏ.
    const raw = async () => {
      throw new Error("ENOENT: no such file or directory, scandir 'C:\\repo\\src'");
    };
    const out = await executeClientToolCall(raw, { toolCall: { toolName: 'fs_list' } });

    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(JSON.parse(out)).toMatchObject({ tool: 'fs_list' });
    expect(JSON.parse(out).error).toContain('ENOENT');
  });

  it('handler trả undefined/null/rỗng thì vẫn trả string khác rỗng', async () => {
    // Trả về undefined là dấu hiệu handler quên return — `ai@4` coi là
    // "chưa xong" và treo. Mọi kiểu rỗng phải bị chặn.
    for (const empty of [undefined as unknown as string, null as unknown as string, '']) {
      const out = await executeClientToolCall(async () => empty, { toolCall: { toolName: 'fs_read' } });
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
      expect(JSON.parse(out).error).toContain('trả về rỗng');
    }
  });

  it('kết quả thành công đi qua nguyên vẹn, không bị bọc lại', async () => {
    const raw = async () => JSON.stringify({ result: [{ name: 'app', kind: 'directory' }] });
    const out = await executeClientToolCall(raw, { toolCall: { toolName: 'fs_list' } });
    expect(JSON.parse(out)).toEqual({ result: [{ name: 'app', kind: 'directory' }] });
  });

  it('lỗi không phải Error (string/object) vẫn stringify được', async () => {
    for (const thrown of ['lỗi thuần string', { code: 'EACCES' }, 42]) {
      const out = await executeClientToolCall(
        async () => {
          throw thrown;
        },
        { toolCall: { toolName: 'fs_read' } },
      );
      expect(typeof out).toBe('string');
      expect(JSON.parse(out).tool).toBe('fs_read');
    }
  });
});
