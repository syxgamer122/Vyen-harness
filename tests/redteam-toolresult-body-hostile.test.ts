/**
 * RED TEAM — toolResultBody (lib/agent-tools.ts).
 *
 * Hợp đồng ghi trong docblock: "Không bao giờ ném" + "maxChars là hợp đồng với
 * tầng render". Hai điều đó là thứ đáng tấn công trước, vì call site là
 * `app/api/chat/route.ts:2434` ngay trên đường stream — ném ở đây giết luôn
 * dòng tin nhắn, còn trả chuỗi hỏng thì người dùng đọc phải.
 */
import { describe, expect, it } from 'vitest';
import { toolResultBody } from '@/lib/agent-tools';
import { TOOL_PREVIEW_MAX_CHARS } from '@/lib/tool-limits';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

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

function startsWithCombiningMark(s: string): boolean {
  return s.length > 0 && /^\p{M}/u.test(s[0]);
}

/** Object vòng — JSON.stringify ném TypeError. */
function circular(): Record<string, unknown> {
  const o: Record<string, unknown> = { name: 'a' };
  o.self = o;
  return o;
}

/** Tên tool MCP hợp lệ (mcp__<server>__<tool>). */
const MCP = 'mcp__github__create_issue';

/** Mọi tên tool mà code thực sự có nhánh riêng. */
const SHAPED_TOOLS = [
  'fs_read',
  'fs_list',
  'fs_search',
  'shell_run',
  'bg_status',
  'git_diff',
  'git_log',
  'web_fetch',
  'web_search',
  MCP,
];

/* ------------------------------------------------------------------ */

describe('toolResultBody — KHÔNG BAO GIỜ ném', () => {
  const nasty: Array<[string, unknown]> = [
    ['object vòng', circular()],
    ['undefined', undefined],
    ['null', null],
    ['chuỗi ở chỗ cần object', 'đây là chuỗi thuần'],
    ['object ở chỗ cần mảng', { 0: 'a', length: 1 }],
    ['NaN', Number.NaN],
    ['BigInt', BigInt(9007199254740993)],
    ['Symbol', Symbol('x')],
    ['hàm', () => 0],
    ['Map', new Map([['a', 'b']])],
    ['Set', new Set(['a', 'b'])],
    ['object chỉ có khoá Symbol', { [Symbol('k')]: 'v' }],
    ['toJSON ném', { toJSON() { throw new Error('boom'); } }],
    ['getter ném', { get content(): string { throw new Error('boom'); } }],
    ['mảng rỗng', []],
    ['mảng lồng nhau sâu', JSON.parse('['.repeat(400) + ']'.repeat(400))],
  ];

  for (const name of SHAPED_TOOLS) {
    for (const [label, value] of nasty) {
      it(`${name} + ${label} → trả về chuỗi, không ném`, () => {
        let out: unknown;
        expect(() => {
          out = toolResultBody(name, value);
        }).not.toThrow();
        expect(typeof out).toBe('string');
      });
    }
  }

  it('shell_run với stdout: null không ném và vẫn lấy được stderr', () => {
    expect(toolResultBody('shell_run', { code: 1, stdout: null, stderr: 'lỗi thật' })).toBe('lỗi thật');
  });

  it('kết quả chứa giá trị undefined không sinh chuỗi "undefined" nào', () => {
    const out = toolResultBody(MCP, { content: undefined, a: undefined, b: 'giữ' });
    expect(out).not.toContain('undefined');
  });

  it('bg_status với job không phải object không ném', () => {
    expect(() => toolResultBody('bg_status', { jobs: [null, 3, 'x', { id: 'j' }] })).not.toThrow();
  });

  it('web_search với phần tử null/undefined/số không ném', () => {
    expect(() => toolResultBody('web_search', { results: [null, undefined, 7, { title: 'T' }] })).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */

describe('toolResultBody — hợp đồng maxChars', () => {
  it('kết quả vượt trần: độ dài trả về <= maxChars', () => {
    const body = toolResultBody('fs_read', { content: 'a'.repeat(10_000) });
    expect(body.length).toBeLessThanOrEqual(TOOL_PREVIEW_MAX_CHARS);
  });

  for (const max of [1, 2, 7, 120, 4000]) {
    it(`maxChars=${max}: độ dài trả về <= max`, () => {
      const body = toolResultBody('fs_read', { content: 'x'.repeat(5000) }, max);
      expect(body.length).toBeLessThanOrEqual(max);
    });
  }

  it('maxChars=0: ngân sách bằng 0 thì phải trả CHUỖI RỖNG, không phải dấu "…"', () => {
    const body = toolResultBody('fs_read', { content: 'abc' }, 0);
    expect(body).toBe('');
    expect(body.length).toBeLessThanOrEqual(0);
  });

  it('maxChars âm: không được trả chuỗi dài hơn ngân sách đã cho', () => {
    const body = toolResultBody('fs_read', { content: 'abc' }, -5);
    expect(body.length).toBeLessThanOrEqual(0);
  });

  it('maxChars=NaN: không được ném và không được trả cả body', () => {
    let out = '';
    expect(() => {
      out = toolResultBody('fs_read', { content: 'abc' }, Number.NaN);
    }).not.toThrow();
    expect(out.length).toBeLessThanOrEqual(0);
  });

  it('không cắt dấu tiếng Việt: không mảnh nào bắt đầu bằng dấu thanh tổ hợp', () => {
    /* Tiếng Việt ở dạng NFD — dạng nhiều editor/parser hay lưu. */
    const nfd = ('Hòa bạn, chào bạn ' + 'Việt Nam đẹp lắm ').repeat(40).normalize('NFD');
    for (let max = 1; max <= 40; max += 1) {
      const out = toolResultBody('fs_read', { content: nfd }, max);
      expect(startsWithCombiningMark(out)).toBe(false);
    }
  });

  it('không cắt đôi surrogate pair: không mảnh nào chứa surrogate lẻ', () => {
    const emoji = '😀'.repeat(200);
    for (let max = 1; max <= 40; max += 1) {
      const out = toolResultBody('fs_read', { content: emoji }, max);
      expect(hasLoneSurrogate(out)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */

describe('toolResultBody — dữ liệu không được biến mất im lặng', () => {
  it('fs_list trả mảng CHUỖI (nhiều fs implementation trả vậy) không được ra rỗng', () => {
    const body = toolResultBody('fs_list', ['a.txt', 'b.ts', 'src/']);
    expect(body).toContain('a.txt');
    expect(body).toContain('b.ts');
  });

  it('fs_list entry thiếu `name` không được khiến cả danh sách biến mất', () => {
    const body = toolResultBody('fs_list', [{ type: 'dir' }, { name: 'ok.txt' }]);
    expect(body).toContain('ok.txt');
  });

  it('fs_list entry `name` là số/boolean vẫn phải hiện', () => {
    const body = toolResultBody('fs_list', [{ name: 42 }, { name: true }]);
    expect(body).not.toBe('');
  });

  it('fs_search match thiếu `path` vẫn phải hiện phần `line: text`', () => {
    const body = toolResultBody('fs_search', [{ line: 7, text: 'const x = 1;' }]);
    expect(body).toContain('const x = 1;');
    expect(body).toContain('7');
  });

  it('fs_read trả CHUỖI THÔ (không bọc object) thì phải ra nội dung file', () => {
    expect(toolResultBody('fs_read', 'export const a = 1;')).toBe('export const a = 1;');
  });

  it('fs_read với content dạng mảng khối (MCP-style) phải ra nội dung', () => {
    const body = toolResultBody('fs_read', { content: [{ type: 'text', text: 'nội dung' }] });
    expect(body).toContain('nội dung');
  });

  it('shell_run chỉ có `output` (không phải stdout) vẫn phải ra nội dung', () => {
    const body = toolResultBody('shell_run', { code: 0, output: 'hello' });
    expect(body).toBe('hello');
  });

  it('fs_list trả STRING đã JSON.stringify (đường client) vẫn phải ra danh sách', () => {
    const raw = JSON.stringify([{ name: 'src', type: 'dir' }, { name: 'a.ts', type: 'file' }]);
    const body = toolResultBody('fs_list', raw);
    expect(body).toContain('src/');
    expect(body).toContain('a.ts');
  });

  it('git_diff trả string JSON đã stringify vẫn phải ra diff', () => {
    const raw = JSON.stringify({ diff: '+ thêm dòng' });
    expect(toolResultBody('git_diff', raw)).toContain('+ thêm dòng');
  });

  it('tool lạ (không có nhánh) vẫn mô tả được hình dạng, không trả rỗng', () => {
    const body = toolResultBody('some_unknown_tool', { alpha: 1, beta: 2, gamma: 3 });
    expect(body).toContain('3');
  });
});