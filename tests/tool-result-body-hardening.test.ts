/**
 * `toolResultBody` — các bất biến mà hợp đồng ghi ra nhưng trước đây KHÔNG có
 * ai canh:
 *
 *  1. KHÔNG BAO GIỜ NÉM thật sự: kết quả tới từ bridge Electron và từ model,
 *     có thể có getter/Proxy ném khi đọc — lời gọi này nằm trên đường render.
 *  2. THÂN ĐÃ REDACT: route.ts ghi vào annotation rồi lưu xuống IndexedDB,
 *     nên đây là chốt chặn cuối chứ không phải tiện ích.
 *  3. `maxChars` là hợp đồng: mọi giá trị (kể cả 0 / âm / NaN) đều phải giữ
 *     được `length <= maxChars`.
 *  4. Cắt không được chém rụng grapheme: dấu tiếng Việt rơi lệch chữ và emoji
 *     thành ký tự lơ lửng là hỏng dữ liệu hiển thị.
 *
 * Các hình dạng ở đây lấy từ code thật: client tool `JSON.stringify` trước khi
 * trả (react/use-chat-orchestration.ts:1666, core/agent-runtime/tool-runner.ts:395),
 * FsEntry/FsReadResult (lib/fs-access.ts:289,324), VyenRunResult
 * (lib/desktop-bridge.ts:49).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { toolResultBody } from '@/lib/agent-tools';
import {
  REDACT_PLACEHOLDER,
  __resetDefaultSecretRegistry,
  getDefaultSecretRegistry,
} from '@/lib/secret-registry';

/* Chuỗi token GitHub ghép từ mảnh: bản literal `ghp_<36 ký tự>` bị GitHub Push
   Protection chặn push dù đây chỉ là fixture test. Giá trị lúc chạy không đổi
   nên rule PATTERN vẫn được đo đúng. */
const GHP = `ghp_${'a'.repeat(36)}`;
const OPENAI = 'sk-proj-abcdefghijklmnopqrstuvwx';

afterEach(() => {
  __resetDefaultSecretRegistry();
});

/* ------------------------------------------------------------------ */
/* 1. Redact                                                           */
/* ------------------------------------------------------------------ */

describe('toolResultBody — thân phải ĐÃ REDACT trước khi cắt', () => {
  it('khoá khớp PATTERN biến mất khỏi thân', () => {
    const body = toolResultBody('fs_read', { content: `token của tôi: ${GHP} hết` });
    expect(body).not.toContain(GHP);
    expect(body).toContain(REDACT_PLACEHOLDER);
  });

  it('redact ĐÚNG đường client: kết quả là chuỗi JSON đã stringify', () => {
    const body = toolResultBody('shell_run', JSON.stringify({ code: 0, stdout: `x ${OPENAI}` }));
    expect(body).not.toContain(OPENAI);
    expect(body).toContain(REDACT_PLACEHOLDER);
  });

  it('giá trị ĐÃ ĐĂNG KÝ (không khớp pattern nào) vẫn bị che', () => {
    /* Đây là lớp `guarded()` đang dùng: bí mật lấy từ env, không có hình dạng
       nào cho pattern nhận ra. */
    getDefaultSecretRegistry().register('khoa-bi-mat-tuy-chon-9876', 'MY_TOKEN');
    const body = toolResultBody('fs_read', { content: 'export const TOKEN = "khoa-bi-mat-tuy-chon-9876";' });
    expect(body).not.toContain('khoa-bi-mat-tuy-chon-9876');
    expect(body).toContain(REDACT_PLACEHOLDER);
  });

  it('khoá NẰM VẮT ranh giới cắt vẫn phải bị che trọn', () => {
    /* Nếu ai đó đảo thứ tự thành cắt-trước-rồi-redact, nửa khoá còn lại
       (`ghp`) không khớp rule nào nên lọt thẳng ra. Đây là test canh đúng
       thứ tự ghi ở lib/tool-limits.ts:62-65. */
    const body = toolResultBody('fs_read', { content: `${'x'.repeat(50)} ${GHP}` }, 55);
    expect(body).not.toContain('ghp');
    expect(body).not.toContain(GHP);
    /* Chữ '[' đầu tiên của placeholder phải còn: chứng minh redact đã chạy
       TRƯỚC khi cắt (nếu cắt trước thì chỗ này còn là ký tự thô của khoá). */
    expect(body).toContain('[re');
  });

  it('không rò qua khối content dạng MCP', () => {
    const body = toolResultBody('mcp__github__create_issue', {
      content: [{ type: 'text', text: `đã tạo issue với ${GHP}` }],
    });
    expect(body).not.toContain(GHP);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Không bao giờ ném                                                */
/* ------------------------------------------------------------------ */

describe('toolResultBody — dữ liệu lỗi không được giết dòng tin nhắn', () => {
  const hostile: Array<[label: string, value: unknown]> = [
    ['getter ném', { get content(): string { throw new Error('boom'); } }],
    ['Proxy mà get ném', new Proxy({}, { get() { throw new Error('boom'); } })],
    ['toJSON ném', { toJSON() { throw new Error('boom'); } }],
    ['Buffer', Buffer.from('abc')],
    ['số', 42],
    ['boolean', true],
    ['null', null],
    ['undefined', undefined],
    ['BigInt', BigInt(7)],
    ['Symbol', Symbol('s')],
  ];

  for (const name of ['fs_read', 'fs_list', 'shell_run', 'git_diff', 'web_search']) {
    for (const [label, value] of hostile) {
      it(`${name} + ${label} → trả chuỗi, không ném`, () => {
        let out: unknown;
        expect(() => {
          out = toolResultBody(name, value);
        }).not.toThrow();
        expect(typeof out).toBe('string');
      });
    }
  }

  it('getter ném → nói thẳng là không đọc được, KHÔNG trả chuỗi rỗng', () => {
    /* Trả rỗng ở đây là "giấu lỗi bằng cách làm người dùng tưởng công cụ
       chưa chạy" — nhãn trên chip vẫn còn, nên phải nói rõ phần thân hỏng. */
    const body = toolResultBody('fs_read', {
      get content(): string {
        throw new Error('boom');
      },
    });
    expect(body).toContain('Không đọc được');
  });

  it('getter ném không được nuốt mất nội dung dung bộ phá vỡ', () => {
    const body = toolResultBody('fs_read', {
      path: 'a.ts',
      get content(): string {
        throw new Error('boom');
      },
    });
    expect(body.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Hợp đồng maxChars                                                 */
/* ------------------------------------------------------------------ */

describe('toolResultBody — bất biến length <= maxChars', () => {
  const budgets: Array<[label: string, max: number]> = [
    ['0', 0],
    ['âm', -5],
    ['NaN', Number.NaN],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['1', 1],
    ['2', 2],
    ['17', 17],
    ['4000', 4000],
  ];

  for (const [label, max] of budgets) {
    it(`maxChars ${label}: không bao giờ vượt ngân sách`, () => {
      const body = toolResultBody('fs_read', { content: 'abc'.repeat(2000) }, max);
      /* NaN không so sánh được với gì — ngân sách hỏng thì mốc là rỗng. */
      const cap = Number.isNaN(max) ? 0 : Math.max(0, max);
      expect(body.length).toBeLessThanOrEqual(cap);
    });
  }

  it('maxChars 0 / âm / NaN → rỗng, KHÔNG phải dấu "…" nói dối là còn nội dung', () => {
    expect(toolResultBody('fs_read', { content: 'abc' }, 0)).toBe('');
    expect(toolResultBody('fs_read', { content: 'abc' }, -5)).toBe('');
    expect(toolResultBody('fs_read', { content: 'abc' }, Number.NaN)).toBe('');
  });

  it('maxChars +Infinity → không trần, trả nguyên thân', () => {
    const content = 'x'.repeat(20_000);
    expect(toolResultBody('fs_read', { content }, Number.POSITIVE_INFINITY)).toBe(content);
  });

  it('đúng bằng trần thì giữ nguyên, không thêm dấu cắt', () => {
    expect(toolResultBody('fs_read', { content: 'abcde' }, 5)).toBe('abcde');
    expect(toolResultBody('fs_read', { content: 'abcdef' }, 5)).toBe('abcd…');
  });
});

/* ------------------------------------------------------------------ */
/* 4. Cắt theo grapheme                                                */
/* ------------------------------------------------------------------ */

describe('toolResultBody — cắt không chém rụng grapheme', () => {
  const cases: Array<[label: string, text: string]> = [
    ['emoji đơn', '😀'.repeat(200)],
    ['emoji có skin tone', '👍🏽'.repeat(200)],
    ['emoji ZWJ (gia đình)', '👨‍👩‍👧'.repeat(200)],
    ['cờ bang', '🇻🇳🇻🇳'.repeat(200)],
    ['tiếng Việt NFD xếp dấu', ('Việt Nam đẹp lắm, Hòa bạn nhé ').repeat(40).normalize('NFD')],
    ['tiếng Việt NFC', 'Việt Nam đẹp lắm, Hòa bạn nhé '.repeat(40)],
  ];

  for (const [label, text] of cases) {
    it(`${label}: mọi ngân sách 1..40 đều không vỡ ký tự`, () => {
      for (let max = 1; max <= 40; max += 1) {
        const out = toolResultBody('fs_read', { content: text }, max);
        expect(out.length).toBeLessThanOrEqual(max);
        expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|[\uDC00-\uDFFF]/u.test(out)).toBe(false);
        expect(/^\p{M}/u.test(out)).toBe(false);
        expect(/[̀-ͯ]$/u.test(out)).toBe(false);
      }
    });
  }

  it('grapheme bị chém đúng một nửa thì lùi hẳn về ranh giới cụm', () => {
    /* "a👨‍👩‍👧b" + trần 4: nếu cắt mù bằng code unit sẽ ra nửa emoji. */
    const out = toolResultBody('fs_read', { content: `a👨‍👩‍👧b${'x'.repeat(20)}` }, 4);
    expect(out).toBe('a…');
  });
});

/* ------------------------------------------------------------------ */
/* 5. Kết quả client là CHUỖI JSON                                      */
/* ------------------------------------------------------------------ */

describe('toolResultBody — đường client (kết quả = JSON.stringify)', () => {
  it('fs_read bọc trong object', () => {
    const raw = JSON.stringify({ path: 'a.ts', content: 'export const a = 1;', truncated: false });
    expect(toolResultBody('fs_read', raw)).toBe('export const a = 1;');
  });

  it('fs_read trả chuỗi thô (không bọc object)', () => {
    expect(toolResultBody('fs_read', 'export const a = 1;')).toBe('export const a = 1;');
  });

  it('fs_read JSON hỏng → coi chính chuỗi đó là thân, không trả rỗng', () => {
    expect(toolResultBody('fs_read', '{"path":"a')).toBe('{"path":"a');
  });

  it('fs_list là mảng entry', () => {
    const raw = JSON.stringify([{ name: 'src', type: 'dir' }, { name: 'a.ts', type: 'file' }]);
    expect(toolResultBody('fs_list', raw).split('\n')).toEqual(['src/', 'a.ts']);
  });

  it('fs_list là mảng tên thô', () => {
    expect(toolResultBody('fs_list', JSON.stringify(['a.txt', 'b.ts'])).split('\n')).toEqual([
      'a.txt',
      'b.ts',
    ]);
  });

  it('fs_list entry theo bridge Electron (kind: directory)', () => {
    const raw = JSON.stringify([{ name: 'docs', kind: 'directory', size: 0 }]);
    expect(toolResultBody('fs_list', raw)).toBe('docs/');
  });

  it('fs_search là mảng match', () => {
    const raw = JSON.stringify([{ path: 'src/a.ts', line: 7, text: 'const x = 1;' }]);
    expect(toolResultBody('fs_search', raw)).toBe('src/a.ts:7: const x = 1;');
  });

  it('shell_run là VyenRunResult đã stringify', () => {
    const raw = JSON.stringify({ code: 1, stdout: 'a', stderr: 'lỗi' });
    expect(toolResultBody('shell_run', raw)).toBe('a\nlỗi');
  });

  it('git_diff bọc trong `{ diff }`', () => {
    expect(toolResultBody('git_diff', JSON.stringify({ diff: '+ dòng mới' }))).toBe('+ dòng mới');
  });

  it('git_status không có nhánh riêng → mô tả hình dạng', () => {
    const raw = JSON.stringify({ branch: 'main', entries: [{ x: 'M', y: ' ', path: 'a.ts' }] });
    expect(toolResultBody('git_status', raw)).toContain('trường');
  });

  it('chuỗi không phải JSON giữ nguyên làm thân (shell raw)', () => {
    expect(toolResultBody('git_diff', 'diff --git a/x b/x')).toBe('diff --git a/x b/x');
  });

  it('chuỗi JSON rác gốn ("null", "42") không bị biến mất im lặng', () => {
    expect(toolResultBody('fs_read', 'null')).toBe('null');
    expect(toolResultBody('fs_read', '42')).toBe('42');
  });
});

/* ------------------------------------------------------------------ */
/* 6. Hình dạng lệch chuẩn                                             */
/* ------------------------------------------------------------------ */

describe('toolResultBody — hình dạng lệch phải hiện được', () => {
  it('fs_read content là mảng khối MCP', () => {
    expect(toolResultBody('fs_read', { content: [{ type: 'text', text: 'dòng 1' }] })).toBe('dòng 1');
  });

  it('shell_run chỉ có `output`', () => {
    expect(toolResultBody('shell_run', { code: 0, output: 'hello' })).toBe('hello');
  });

  it('shell_run ưu tiên stdout/stderr, `output` chỉ là dự phòng', () => {
    expect(toolResultBody('shell_run', { stdout: 'thật', output: 'dự phòng' })).toBe('thật');
  });

  it('fs_read ảnh rơi về `description`', () => {
    expect(toolResultBody('fs_read', { kind: 'image', description: 'một con mèo' })).toBe(
      'một con mèo',
    );
  });

  it('tool chưa có nhánh riêng thì vẫn mô tả hình dạng', () => {
    expect(toolResultBody('plan_create', { title: 'Refactor', subtasks: [] })).toContain('trường');
    expect(toolResultBody('delegate', { applied: true })).toContain('trường');
    expect(toolResultBody('code_skeleton', [1, 2, 3])).toBe('3 phần tử');
  });

  it('kết quả rỗng thật vẫn rỗng', () => {
    expect(toolResultBody('memory_save', {})).toBe('');
    expect(toolResultBody('fs_list', { error: 'Đường dẫn không hợp lệ' })).toBe('');
    expect(toolResultBody('fs_read', undefined)).toBe('');
  });
});