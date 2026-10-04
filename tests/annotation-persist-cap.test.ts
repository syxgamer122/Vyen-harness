/**
 * `annotations` là trường persisted DUY NHẤT chưa từng có trần nào. Trần
 * attachments, trần toolInvocations (12 cái × 24k) đều có từ trước; annotations
 * thì không — và giờ server ghi MỘT annotation `phase:'done'` cho mỗi tool
 * result, mỗi cái mang preview tới TOOL_PREVIEW_MAX_CHARS (4k).
 *
 * `maxSteps` phía client không trần (CLIENT_MAX_STEPS_UNBOUNDED) và doom-loop
 * guard chỉ bắt (tool, args) lặp LIÊN TIẾP, nên model đổi qua lại hai tool là
 * không bao giờ chạm ngưỡng. 100 tool call = ~400 KB trên một row, không trần.
 *
 * Nguy hiểm thứ hai của `annotations`: nó KHÔNG chỉ mang tool data. Usage,
 * biên nhận route, retry, subagent, đề xuất ghi nhớ đều đi qua cùng mảng.
 * Cắt "cho gọn" ở đây là xoá ngầm tính năng — nên phần lớn lớp test dưới đây
 * là kiểm tra các loại KHÔNG tool phải sống sót.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  sanitizeAnnotations,
  STORED_ANNOTATION_PREVIEWS_MAX,
  STORED_ANNOTATION_PREVIEW_CHARS,
} from '@/lib/db';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type Ann = Record<string, unknown>;

function toolStart(i: number): Ann {
  return {
    requestId: 'r1',
    tool: { id: `t${i}`, name: 'fs_read', phase: 'start', at: i * 10, args: 'path=a.ts' },
  };
}

function toolDone(i: number, preview: string): Ann {
  return {
    requestId: 'r1',
    tool: { id: `t${i}`, name: 'fs_read', phase: 'done', summary: 'ok', preview },
  };
}

const previewsOf = (list: Ann[]): unknown[] =>
  list.filter((a) => typeof (a.tool as Record<string, unknown> | undefined)?.preview === 'string');

const idsOf = (list: Ann[]): string[] =>
  list.map((a) => (a.tool as Record<string, unknown>).id as string);

/**
 * Mọi loại annotation KHÔNG phải tool đang được ghi trong repo. Danh sách này
 * phải đầy đủ: thêm một loại mới ở route.ts mà quên khoá ở đây thì hàm cắt
 * trần ngày sau sẽ ăn mất nó mà không ai thấy.
 */
const NON_TOOL_KINDS: Ann[] = [
  { requestId: 'r1', routeReceipt: { provider: 'openai', model: 'gpt-x', slot: 2 } },
  { requestId: 'r1', lastStepUsage: { promptTokens: 1234, completionTokens: 56 } },
  { requestId: 'r1', usage: { promptTokens: 9000, completionTokens: 800 }, model: 'gpt-x', routingRole: 'lead', est: true },
  { requestId: 'r1', subagentCall: { toolCallId: 's1', toolName: 'fs_read', args: { path: 'a.ts' } } },
  { requestId: 'r1', subagent: { phase: 'done', runId: 'r9', result: 'xong' } },
  { requestId: 'r1', memoryProposal: { text: 'user thích viết test trước' } },
  { requestId: 'r1', capabilityProjection: { includedCount: 30, excludedCount: 4, droppedCount: 2 } },
  { requestId: 'r1', attempt: 2, totalAttempts: 5, key: 'openai/gpt-x', model: 'gpt-x' },
  { requestId: 'r1', hb: 1730000000000 },
  { requestId: 'r1', error: 'UPSTREAM_POOL_EXHAUSTED' },
  { requestId: 'r1', orchestratorAdopted: { goal: 'sửa lỗi đăng nhập', adoptedAt: 1730000000000 } },
  { requestId: 'r1', evidenceLevel: 'verified' },
  { requestId: 'r1', type: 'finish', truncated: false, message: 'done' },
];

/* ------------------------------------------------------------------ */
/* Trần của preview                                                    */
/* ------------------------------------------------------------------ */

describe('preview của annotation tool bị cắt trần khi ghi', () => {
  it('preview vượt trần: cắt, kèm ghi chú, tổng không vượt trần', () => {
    const huge = 'p'.repeat(50_000);
    const out = sanitizeAnnotations([toolDone(1, huge)])!;
    const preview = (out[0].tool as Record<string, unknown>).preview as string;
    expect(preview.length).toBeLessThanOrEqual(STORED_ANNOTATION_PREVIEW_CHARS);
    /* Cắt trầm lặng khiến người đọc tin rằng đó là hết kết quả — phải nói rõ. */
    expect(preview).toMatch(/bị cắt khi lưu/);
  });

  it('preview đúng bằng trần: giữ nguyên, không thêm ghi chú', () => {
    const exact = 'p'.repeat(STORED_ANNOTATION_PREVIEW_CHARS);
    const input = [toolDone(1, exact)];
    expect(sanitizeAnnotations(input)).toBe(input);
  });

  it('preview rỗng không phải preview — không tính vào hạn ngạch', () => {
    const input = [toolDone(1, '')];
    expect(sanitizeAnnotations(input)).toBe(input);
  });

  it('preview cắt ở giữa chừng vẫn giữ phần đầu (đầu thường là metadata)', () => {
    const out = sanitizeAnnotations([toolDone(1, 'ĐẦU-' + 'p'.repeat(50_000))])!;
    const preview = (out[0].tool as Record<string, unknown>).preview as string;
    expect(preview.startsWith('ĐẦU-')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Trần SỐ LƯỢNG preview                                                */
/* ------------------------------------------------------------------ */

describe('số annotation tool có preview bị giới hạn', () => {
  it('0 và 1 preview: giữ nguyên tất cả', () => {
    expect(previewsOf(sanitizeAnnotations([]) ?? [])).toHaveLength(0);
    const one = [toolDone(1, 'x')];
    expect(sanitizeAnnotations(one)).toBe(one);
  });

  it('50 preview: chỉ giữ N mới nhất', () => {
    const input = Array.from({ length: 50 }, (_, i) => toolDone(i, 'x'.repeat(100)));
    const out = sanitizeAnnotations(input)!;
    expect(previewsOf(out)).toHaveLength(STORED_ANNOTATION_PREVIEWS_MAX);
    /* Cái mới nhất phải còn — nó gần câu hỏi hiện tại nhất. */
    expect(idsOf(out)).toContain('t49');
  });

  it('500 preview: vẫn chỉ còn N, và tổng payload nhỏ lại rõ rệt', () => {
    const input = Array.from({ length: 500 }, (_, i) => toolDone(i, 'x'.repeat(4_000)));
    const out = sanitizeAnnotations(input)!;
    expect(previewsOf(out)).toHaveLength(STORED_ANNOTATION_PREVIEWS_MAX);
    /* Trước khi có trần: 500 × 4.000 = 2 MB trên MỘT row. */
    expect(JSON.stringify(out).length).toBeLessThan(200_000);
  });

  it('hạn ngạch preview phải khớp hạn ngạch toolInvocations', async () => {
    /* Lệch nhau thì timeline trong UI và tập kết quả gửi lại model nhìn thấy
       hai danh sách tool call khác nhau. */
    const { STORED_TOOL_INVOCATIONS_MAX } = await import('@/lib/db');
    expect(STORED_ANNOTATION_PREVIEWS_MAX).toBe(STORED_TOOL_INVOCATIONS_MAX);
  });
});

/* ------------------------------------------------------------------ */
/* Các loại KHÔNG phải tool phải sống sót                               */
/* ------------------------------------------------------------------ */

describe('annotation không phải tool không bị đụng tới', () => {
  it('mảng toàn loại khác tool: giữ nguyên từng phần tử, không cắt gì', () => {
    const input = [...NON_TOOL_KINDS];
    const out = sanitizeAnnotations(input)!;
    expect(out).toEqual(NON_TOOL_KINDS);
    expect(out).toBe(input);
  });

  it('500 loại khác tool: không rớt cái nào', () => {
    const input = Array.from({ length: 500 }, (_, i) => ({ requestId: 'r1', usage: { i } }));
    const out = sanitizeAnnotations(input)!;
    expect(out).toHaveLength(500);
  });

  it('trộn 500 preview tool với mọi loại khác: loại khác sống nguyên', () => {
    const input = [
      ...Array.from({ length: 500 }, (_, i) => toolDone(i, 'x'.repeat(4_000))),
      ...NON_TOOL_KINDS,
    ];
    const out = sanitizeAnnotations(input)!;
    expect(previewsOf(out)).toHaveLength(STORED_ANNOTATION_PREVIEWS_MAX);
    for (const kind of NON_TOOL_KINDS) {
      expect(out).toContainEqual(kind);
    }
  });

  it('loại khác nằm xen giữa vẫn không bị xoá', () => {
    const out = sanitizeAnnotations([
      toolDone(1, 'a'),
      { requestId: 'r1', memoryProposal: { text: 'giữ lại em' } },
      toolDone(2, 'b'),
    ])!;
    expect(out).toHaveLength(3);
    expect(out[1]).toEqual({ requestId: 'r1', memoryProposal: { text: 'giữ lại em' } });
  });

  it('annotation tool phase start (dựng timeline) KHÔNG bị loại', () => {
    /* tool-trace.tsx dựng timeline từ phase 'start' (id + at). Bỏ nó thì các
       tool call còn lại mất vị trí trong bong bóng — mất dấu vết người đọc
       dùng để kiểm chứng, không phải dữ liệu thừa. */
    const input = [
      ...Array.from({ length: 100 }, (_, i) => toolStart(i)),
      ...Array.from({ length: 100 }, (_, i) => toolDone(i, 'x'.repeat(4_000))),
    ];
    const out = sanitizeAnnotations(input)!;
    /* 100 phase 'start' giữ nguyên; trong 100 phase 'done' chỉ còn N preview. */
    expect(out).toHaveLength(100 + STORED_ANNOTATION_PREVIEWS_MAX);
    const phases = out.map((a) => (a.tool as Record<string, unknown>).phase);
    expect(phases.filter((p) => p === 'start')).toHaveLength(100);
    expect(phases.filter((p) => p === 'done')).toHaveLength(
      STORED_ANNOTATION_PREVIEWS_MAX,
    );
    for (const ann of out) {
      if ((ann.tool as Record<string, unknown>).phase === 'start') {
        /* `at` là offset đặt tool call vào trong dòng chữ — mất nó thì timeline
           không còn biết chip thuộc đâu. */
        expect((ann.tool as Record<string, unknown>).at).toBeTypeOf('number');
      }
    }
  });

  it('mảng rỗng / undefined đi qua không đổi', () => {
    const empty: Ann[] = [];
    expect(sanitizeAnnotations(undefined)).toBeUndefined();
    expect(sanitizeAnnotations(empty)).toBe(empty);
  });

  it('không đụng vào mảng đầu vào', () => {
    const input = [
      toolDone(1, 'x'.repeat(50_000)),
      ...Array.from({ length: 50 }, (_, i) => toolDone(i, 'y')),
    ];
    const snapshot = JSON.stringify(input);
    sanitizeAnnotations(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('trường khác của annotation tool được giữ khi preview bị cắt', () => {
    const out = sanitizeAnnotations([
      {
        requestId: 'r1',
        tool: {
          id: 't1',
          name: 'fs_read',
          phase: 'done',
          summary: 'đọc xong',
          preview: 'x'.repeat(50_000),
          isError: false,
        },
      },
    ])!;
    const tool = out[0].tool as Record<string, unknown>;
    expect(tool.id).toBe('t1');
    expect(tool.phase).toBe('done');
    expect(tool.summary).toBe('đọc xong');
  });
});

/* ------------------------------------------------------------------ */
/* Đường ghi thật: cả hai hook + appendMessage                          */
/* ------------------------------------------------------------------ */

describe('sanitizeAnnotations được gọi ở mọi đường ghi message', () => {
  const dbSource = fs
    .readFileSync(path.resolve(__dirname, '../lib/db.ts'), 'utf8')
    .replace(/\r\n/g, '\n');

  it('hook creating chuẩn hoá annotations', () => {
    const hook = dbSource.slice(
      dbSource.indexOf("this.messages.hook('creating'"),
      dbSource.indexOf("this.messages.hook('updating'"),
    );
    expect(hook).toMatch(/obj\.annotations = sanitizeAnnotations\(obj\.annotations\)/);
  });

  it('hook updating chuẩn hoá annotations', () => {
    const hook = dbSource.slice(
      dbSource.indexOf("this.messages.hook('updating'"),
      dbSource.indexOf("this.chats.hook('creating'"),
    );
    expect(hook).toMatch(/if \('annotations' in mods\)/);
    expect(hook).toMatch(/patch\.annotations = sanitizeAnnotations\(mods\.annotations\)/);
  });

  it('appendMessage chuẩn hoá annotations (row mới đi qua hook nên vẫn an toàn)', () => {
    const fn = dbSource.slice(
      dbSource.indexOf('export async function appendMessage('),
      dbSource.indexOf('export async function deleteChatCascade('),
    );
    expect(fn).toMatch(/annotations: sanitizeAnnotations\(input\.annotations\)/);
  });
});