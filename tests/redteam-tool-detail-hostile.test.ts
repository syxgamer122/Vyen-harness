/**
 * RED TEAM — formatToolDetail (components/chat/tool-trace.tsx).
 *
 * Hợp đồng ghi trong docblock: chỉ nhận giá trị KHÔNG RỖNG và "không bao giờ
 * trả JSON thô". Chip là một dòng `truncate` nên mọi giá trị trả về cũng phải
 * là MỘT dòng, không vỡ surrogate, không vỡ dấu tiếng Việt.
 */
import { describe, expect, it } from 'vitest';
import { formatToolDetail, hiddenLineCount, type ToolEvent } from '@/components/chat/tool-trace';
import { collectToolEvents } from '@/components/chat/tool-trace';

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (n >= 0xdc00 && n <= 0xdfff) {
        i += 1;
        continue;
      }
      return true;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

function countLines(s: string): number {
  return s.split('\n').length;
}

/* ------------------------------------------------------------------ */

describe('formatToolDetail — không bao giờ in JSON thô', () => {
  const cases: Array<[string, unknown]> = [
    ['{path:""} — lỗi gốc', '{"path":""}'],
    ['{} rỗng', '{}'],
    ['path null', '{"path":null}'],
    ['path 0', '{"path":0}'],
    ['path false', '{"path":false}'],
    ['path là object', '{"path":{"a":1,"b":2}}'],
    ['path là mảng', '{"path":["a","b"]}'],
    ['path chỉ khoảng trắng', '{"path":"   "}'],
    ['chỉ có khoá ngoài danh sách', '{"foo":"bar","baz":1}'],
    ['mảng JSON', '["a","b"]'],
    ['số JSON', '42'],
    ['chuỗi JSON', '"x"'],
    ['null JSON', 'null'],
    ['true JSON', 'true'],
    ['JSON có khoảng trắng đầu', '   {"path":"src/a.ts"}'],
    ['JSON có khoảng trắng cuối', '{"path":"src/a.ts"}   '],
    ['JSON có xuống dòng đầu', '\n{"path":"src/a.ts"}'],
    ['JSON hỏng, mở nhưng không đóng', '{"path":"src/a.ts"'],
    ['JSON toàn số lớn', '{"path":1e999}'],
  ];

  for (const [label, args] of cases) {
    it(`${label} → không được lộ JSON thô lên chip`, () => {
      const out = formatToolDetail(args as string);
      if (out === null) return;
      expect(out).not.toMatch(/^\s*[[{]/);
      expect(out).not.toMatch(/[[{][^[\]]*["'][^"']*["']\s*[:,}]/);
    });
  }

  it('JSON hỏng vẫn phải cắt trần, không trả nguyên khối nghìn ký tự', () => {
    const out = formatToolDetail('{' + 'x'.repeat(5000));
    expect(out === null || out.length <= 120).toBe(true);
  });

  it('args rỗng / toàn khoảng trắng → null', () => {
    expect(formatToolDetail('')).toBeNull();
    expect(formatToolDetail('    ')).toBeNull();
    expect(formatToolDetail('{}')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe('formatToolDetail — chip là MỘT dòng', () => {
  it('giá trị có newline không được làm chip nhiều dòng', () => {
    const out = formatToolDetail('{"command":"npm test\\necho xong"}')!;
    expect(countLines(out)).toBe(1);
  });

  it('args thô có newline (đường không phải JSON) cũng phải là một dòng', () => {
    const out = formatToolDetail('echo a\necho b\necho c')!;
    expect(countLines(out)).toBe(1);
  });

  it('giá trị có CR (\r\n) không được làm chip nhiều dòng', () => {
    const out = formatToolDetail('{"command":"npm test\r\necho xong"}')!;
    expect(countLines(out)).toBe(1);
  });

  it('không cắt đôi surrogate pair khi cắt trần ở DETAIL_MAX', () => {
    /* Emoji nằm ngay quanh vị trí cắt 120. */
    const pad = 'a'.repeat(118);
    const out = formatToolDetail(`{"path":"${pad}😀😀😀😀"}`)!;
    expect(hasLoneSurrogate(out)).toBe(false);
  });

  it('không cắt dấu tiếng Việt (NFD) khi cắt trần', () => {
    const nfd = ('Hòa bạn nhé, đây là ' + 'Việt Nam rất đẹp. ').repeat(6).normalize('NFD');
    const out = formatToolDetail(`{"path":"${nfd}"}`)!;
    expect(/^\p{M}/u.test(out)).toBe(false);
  });

  it('không kéo dài chip vô hạn: mọi kết quả <= 120 ký tự', () => {
    const inputs = [
      '{"path":"' + 'x'.repeat(5000) + '"}',
      'y'.repeat(5000),
      '{"query":"' + 'z'.repeat(5000) + '"}',
    ];
    for (const i of inputs) {
      const out = formatToolDetail(i);
      if (out !== null) expect(out.length).toBeLessThanOrEqual(120);
    }
  });
});

/* ------------------------------------------------------------------ */

describe('formatToolDetail qua collectToolEvents (đường thật)', () => {
  it('args là object vòng không được làm chết dòng tin nhắn', () => {
    const circular: Record<string, unknown> = { path: 'a' };
    circular.self = circular;
    const events = collectToolEvents(undefined, [
      { toolCallId: 'c1', toolName: 'read', state: 'call', args: circular as unknown },
    ]);
    expect(events[0].args).toBeTypeOf('string');
  });

  it('args là object có toJSON ném → vẫn ra chuỗi dùng được', () => {
    const events = collectToolEvents(undefined, [
      {
        toolCallId: 'c1',
        toolName: 'read',
        state: 'call',
        args: { toJSON() { throw new Error('x'); } } as unknown,
      },
    ]);
    expect(formatToolDetail(events[0].args)).not.toMatch(/throw/);
  });

  it('args object thật được stringify rồi KHÔNG được lộ JSON thô lên chip', () => {
    const events = collectToolEvents(undefined, [
      { toolCallId: 'c1', toolName: 'weird', state: 'call', args: { not_a_detail_key: 'v' } },
    ]);
    const out = formatToolDetail(events[0].args);
    expect(out === null || !out.includes('{')).toBe(true);
  });

  it('args là string đã JSON của client, có khoảng trắng thừa → vẫn lấy được path', () => {
    const events = collectToolEvents(undefined, [
      { toolCallId: 'c1', toolName: 'read', state: 'call', args: '  {"path":"src/a.ts"} ' },
    ]);
    expect(formatToolDetail(events[0].args)).toBe('src/a.ts');
  });
});

/* ------------------------------------------------------------------ */

describe('hiddenLineCount — số dòng bị giấu phải khớp khung', () => {
  it('nội dung 1 dòng: không giấu gì', () => {
    expect(hiddenLineCount('một dòng')).toBe(0);
  });

  it('nội dung 100 dòng: giấu đúng phần dư', () => {
    expect(hiddenLineCount(Array.from({ length: 100 }, () => 'x').join('\n'))).toBe(85);
  });

  it('hiddenLineCount không bao giờ âm dù body rỗng/toàn khoảng trắng', () => {
    expect(hiddenLineCount('')).toBe(0);
    expect(hiddenLineCount('   ')).toBeGreaterThanOrEqual(0);
  });

  it('số dòng bị giấu phải khớp số dòng ToolChip thực sự không vẽ', () => {
    /* ToolChip: shown = body.split('\n').slice(0, 15).join('\n') */
    const body = Array.from({ length: 40 }, (_, i) => `dòng ${i}`).join('\n');
    const shown = body.split('\n').slice(0, 15).join('\n');
    expect(hiddenLineCount(body)).toBe(body.split('\n').length - shown.split('\n').length);
  });
});

/* ------------------------------------------------------------------ */

describe('collectToolEvents — id trùng / thiếu', () => {
  it('tool id rỗng vẫn phải ra chip (không nuốt mất bằng chứng tool đã chạy)', () => {
    const events = collectToolEvents([{ tool: { id: '', name: 'bash', phase: 'start' } }], undefined);
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('bash');
  });

  it('hai tool khác id nhưng cùng tên vẫn là hai chip', () => {
    const events = collectToolEvents(
      [
        { tool: { id: 'a', name: 'bash', phase: 'start' } },
        { tool: { id: 'b', name: 'bash', phase: 'start' } },
      ],
      undefined,
    );
    expect(events).toHaveLength(2);
  });

  it('phase start không có args → args rỗng, chip không in thừa', () => {
    const events = collectToolEvents(
      [{ tool: { id: 'a', name: 'bash', phase: 'start', args: { command: 'ls' } } }],
      undefined,
    );
    expect(formatToolDetail(events[0].args)).toBeNull();
  });

  it('event không có tên bị lọc (không vẽ chip vô danh)', () => {
    const events: ToolEvent[] = collectToolEvents(
      [{ tool: { id: 'a', phase: 'start' } }],
      undefined,
    );
    expect(events).toHaveLength(0);
  });
});
