import { describe, expect, it, vi } from 'vitest';
import {
  CODE_MODE_MAX_OUTPUT_CHARS,
  CODE_MODE_MAX_TIMEOUT_MS,
  CODE_MODE_DEFAULT_TIMEOUT_MS,
  clampCodeModeTimeout,
  executeCodeMode,
} from '@/lib/mcp/code-mode';

/**
 * Probe escape đo bằng chứng THẬT: code sandbox cố lấy `process.pid` của host.
 * Bất kỳ case nào chạm được host process → pid trả về bằng pid của test runner.
 *
 * (Bẫy đã ghi trong PLAN.md: `mcp.call.constructor` là AsyncFunction — phải
 * `await` rồi mới kết luận, `typeof` một mình trả "object" và dễ đoán nhầm.)
 */
const HOST_PID = process.pid;

type EscapeProbeResult = { escaped: boolean; pid?: unknown; note?: string; error?: string };

async function runEscapeProbe(
  code: string,
  options?: Parameters<typeof executeCodeMode>[1],
): Promise<EscapeProbeResult> {
  const res = await executeCodeMode(code, options);
  expect(res.ok).toBe(true);
  return res.returnValue as EscapeProbeResult;
}

function expectBlocked(result: EscapeProbeResult): void {
  expect(result.escaped).toBe(false);
  expect(result.pid).not.toBe(HOST_PID);
}

describe('Code Mode — escape qua .constructor phải bị CHẶN', () => {
  it('Object.constructor (intrinsic realm sandbox, không phải host)', async () => {
    const result = await runEscapeProbe(`
      try {
        const hostProcess = Object.constructor('return process')();
        return { escaped: true, pid: hostProcess.pid };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });

  it('mcp.call.constructor (AsyncFunction — phải await mới đo được)', async () => {
    const result = await runEscapeProbe(`
      try {
        const hostProcess = await mcp.call.constructor('return process')();
        return { escaped: true, pid: hostProcess.pid };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });

  it('setTimeout.constructor', async () => {
    const result = await runEscapeProbe(`
      try {
        const hostProcess = setTimeout.constructor('return process')();
        return { escaped: true, pid: hostProcess.pid };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });

  it('clearTimeout.constructor', async () => {
    const result = await runEscapeProbe(`
      try {
        const hostProcess = clearTimeout.constructor('return process')();
        return { escaped: true, pid: hostProcess.pid };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });

  it('console.log.constructor và mcp.log.constructor', async () => {
    const result = await runEscapeProbe(`
      try {
        const hostProcess = console.log.constructor('return process')();
        return { escaped: true, pid: hostProcess.pid };
      } catch (err) {
        try {
          const hostProcess = mcp.log.constructor('return process')();
          return { escaped: true, pid: hostProcess.pid };
        } catch (err2) {
          return { escaped: false, error: String(err2) };
        }
      }
    `);
    expectBlocked(result);
  });

  it('Function trực tiếp trong context', async () => {
    const result = await runEscapeProbe(`
      try {
        const hostProcess = Function('return process')();
        return { escaped: true, pid: hostProcess.pid };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });

  it('arrow function .constructor', async () => {
    const result = await runEscapeProbe(`
      try {
        const hostProcess = (() => {}).constructor('return process')();
        return { escaped: true, pid: hostProcess.pid };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });

  it('chuỗi prototype: ({}).__proto__.constructor.constructor và Object.getPrototypeOf(mcp.call)', async () => {
    const result = await runEscapeProbe(`
      try {
        const viaProto = ({ counter: 1 }).__proto__.constructor.constructor('return process')();
        return { escaped: true, pid: viaProto.pid };
      } catch (err) {
        try {
          // AsyncFunction trả Promise — phải await mới thật sự chạy thân hàm.
          const viaGetProto = await Object.getPrototypeOf(mcp.call).constructor('return process')();
          return { escaped: true, pid: viaGetProto.pid };
        } catch (err2) {
          return { escaped: false, error: String(err2) };
        }
      }
    `);
    expectBlocked(result);
  });

  it('globalThis.constructor.constructor (bẫy realm của vm.createContext)', async () => {
    const result = await runEscapeProbe(`
      try {
        const hostProcess = globalThis.constructor.constructor('return process')();
        return { escaped: true, pid: hostProcess.pid };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });

  it('global mang prototype của realm SANDBOX (không phải Object.prototype của host)', async () => {
    const res = await executeCodeMode(`
      return {
        protoIsSandboxObject: Object.getPrototypeOf(globalThis) === Object.prototype,
        ctorIsSandboxObject: globalThis.constructor === Object,
        hasOwnPropertyUsable: typeof globalThis.hasOwnProperty === 'function',
      };
    `);
    expect(res.ok).toBe(true);
    expect(res.returnValue).toEqual({
      protoIsSandboxObject: true,
      ctorIsSandboxObject: true,
      hasOwnPropertyUsable: true,
    });
  });

  it('this của hàm non-strict (function(){ return this })', async () => {
    const result = await runEscapeProbe(`
      try {
        const hostProcess = (function () { return this; })().constructor.constructor('return process')();
        return { escaped: true, pid: hostProcess.pid };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });

  it('this.constructor.constructor ở top-level script', async () => {
    const result = await runEscapeProbe(`
      try {
        const hostProcess = this.constructor.constructor('return process')();
        return { escaped: true, pid: hostProcess.pid };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });

  it('function đã bind: setTimeout.bind(null).constructor', async () => {
    const result = await runEscapeProbe(`
      try {
        const hostProcess = setTimeout.bind(null).constructor('return process')();
        return { escaped: true, pid: hostProcess.pid };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });

  it('generator/async-generator constructor (phải next() mới chạy thân hàm)', async () => {
    const result = await runEscapeProbe(`
      try {
        const gen = (function*(){}).constructor('return process')();
        const step = gen.next();
        return { escaped: true, pid: step.value && step.value.pid };
      } catch (err) {
        try {
          const it = (async function*(){}).constructor('return process')();
          const step = await it.next();
          return { escaped: true, pid: step.value && step.value.pid };
        } catch (err2) {
          return { escaped: false, error: String(err2) };
        }
      }
    `);
    expectBlocked(result);
  });

  it('dynamic import trong context không có module loader', async () => {
    const result = await runEscapeProbe(`
      try {
        const fs = await import('node:fs');
        return { escaped: true, pid: fs ? 0 : null };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });

  it('object trả về từ mcp.call không được mang realm host vào (clone JSON)', async () => {
    const result = await runEscapeProbe(
      `
        try {
          const hostResult = await mcp.call('srv', 'tool', {});
          const hostProcess = hostResult.constructor.constructor('return process')();
          return { escaped: true, pid: hostProcess.pid };
        } catch (err) {
          return { escaped: false, error: String(err) };
        }
      `,
      { mcpCaller: async () => ({ ok: true, nested: { a: 1 } }) },
    );
    expectBlocked(result);
  });
});

describe('Code Mode — host không tồn tại trong sandbox', () => {
  it('process.pid trực tiếp → ReferenceError', async () => {
    const result = await runEscapeProbe(`
      try {
        const p = process.pid;
        return { escaped: true, pid: p };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });

  it('globalThis.process là undefined', async () => {
    const result = await runEscapeProbe(`
      const p = globalThis.process;
      if (p === undefined) return { escaped: false, note: 'process undefined' };
      return { escaped: true, pid: p.pid };
    `);
    expectBlocked(result);
  });

  it('require là undefined', async () => {
    const result = await runEscapeProbe(`
      if (typeof require === 'undefined') return { escaped: false, note: 'require undefined' };
      return { escaped: true, pid: 0 };
    `);
    expectBlocked(result);
  });

  it('process.getBuiltinModule("fs") → ReferenceError', async () => {
    const result = await runEscapeProbe(`
      try {
        const fs = process.getBuiltinModule('fs');
        return { escaped: true, pid: fs ? 0 : null };
      } catch (err) {
        return { escaped: false, error: String(err) };
      }
    `);
    expectBlocked(result);
  });
});

describe('Code Mode — vá escape KHÔNG được hỏng chức năng', () => {
  it('mcp.call vẫn gọi được bridge thật và trả dữ liệu nguyên vẹn', async () => {
    const caller = vi.fn(async () => ({ user: 'vyen_ai', role: 'developer' }));
    const res = await executeCodeMode(
      `
        const user = await mcp.call('github', 'get_user', { username: 'vyen_ai' });
        return user.role;
      `,
      { mcpCaller: caller },
    );
    expect(res.ok).toBe(true);
    expect(res.returnValue).toBe('developer');
    expect(caller).toHaveBeenCalledTimes(1);
    const callArgs = caller.mock.calls[0] as unknown as unknown[];
    expect(callArgs[0]).toBe('github');
    expect(callArgs[1]).toBe('get_user');
    expect((callArgs[2] as { username: string }).username).toBe('vyen_ai');
  });

  it('console.log vẫn ra output', async () => {
    const res = await executeCodeMode(`
      console.log('xin chào', 42);
    `);
    expect(res.ok).toBe(true);
    expect(res.output).toContain('xin chào 42');
  });

  it('intrinsic của realm sandbox vẫn đủ dùng (Map/Set/Math/JSON/Date)', async () => {
    const res = await executeCodeMode(`
      const m = new Map([['a', 1]]);
      const s = new Set([1, 2, 2]);
      return {
        math: Math.max(1, 5),
        json: JSON.stringify({ ok: true }),
        map: m.get('a'),
        set: s.size,
        date: typeof Date.now(),
      };
    `);
    expect(res.ok).toBe(true);
    expect(res.returnValue).toEqual({ math: 5, json: '{"ok":true}', map: 1, set: 2, date: 'number' });
  });
});

describe('Code Mode — timeout thật sự dừng sandbox (A2)', () => {
  it('timer sau timeout không bao giờ được chạy', async () => {
    const lateCall = vi.fn(async () => 'không được gọi');
    const res = await executeCodeMode(
      `
        setTimeout(() => { mcp.call('srv', 'late_timer'); }, 1300);
        await new Promise(() => {});
      `,
      { mcpCaller: lateCall, timeoutMs: 1000 },
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('quá thời gian');

    // Chờ vượt mốc 1300ms: nếu timer không bị clear, spy đã bị gọi.
    await new Promise((r) => setTimeout(r, 500));
    expect(lateCall).not.toHaveBeenCalled();
  });

  it('timer còn treo không chạy sau khi lượt chạy kết thúc bình thường', async () => {
    const lateCall = vi.fn(async () => 'không được gọi');
    const res = await executeCodeMode(
      `
        setTimeout(() => { mcp.call('srv', 'late_timer'); }, 50);
        return 'xong';
      `,
      { mcpCaller: lateCall },
    );
    expect(res.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 300));
    expect(lateCall).not.toHaveBeenCalled();
  });
});

describe('Code Mode — chi tiết ranh giới realm', () => {
  it('object trả về từ mcp.call là bản sao SÂU — object lồng nhau cũng thuộc realm sandbox', async () => {
    const result = await runEscapeProbe(
      `
        try {
          const hostResult = await mcp.call('srv', 'tool', {});
          const hostProcess = hostResult.nested.constructor.constructor('return process')();
          return { escaped: true, pid: hostProcess.pid };
        } catch (err) {
          return { escaped: false, error: String(err) };
        }
      `,
      { mcpCaller: async () => ({ nested: { a: 1 } }) },
    );
    expectBlocked(result);
  });

  it('setTimeout trả về id dạng SỐ, không phải handle Timeout của host', async () => {
    const res = await executeCodeMode(`
      const id = setTimeout(() => {}, 10);
      clearTimeout(id);
      return typeof id;
    `);
    expect(res.ok).toBe(true);
    expect(res.returnValue).toBe('number');
  });
});

describe('Code Mode — returnValue chịu trần 24k (A3)', () => {
  it('object returnValue > 24k bị cắt, không lách trần qua JSON.stringify cả res', async () => {
    const res = await executeCodeMode(`return { blob: 'R'.repeat(30000) };`);
    expect(res.ok).toBe(true);
    expect(res.truncated).toBe(true);
    expect(typeof res.returnValue).toBe('string');
    expect((res.returnValue as string).length).toBeLessThanOrEqual(CODE_MODE_MAX_OUTPUT_CHARS);
    expect(String(res.returnValue)).toContain('Cắt ngắn');
  });

  it('returnValue nhỏ vẫn nguyên vẹn kiểu dữ liệu', async () => {
    const res = await executeCodeMode(`return { sum: 30, list: [1, 2, 3] };`);
    expect(res.ok).toBe(true);
    expect(res.truncated).toBeFalsy();
    expect(res.returnValue).toEqual({ sum: 30, list: [1, 2, 3] });
  });
});

describe('Code Mode — trần timeout bị chặn cứng', () => {
  /* Client (renderer) tự truyền `timeoutMs` qua bridge `vyen:code-run`, nên
     không có chặn này thì client tăng tới bao lâu cũng được — trong khi mã model
     chạy đồng bộ và chặn event loop của host (đo: spin 1.2s → 0 tick timer). */
  it('client xin 5 phút vẫn bị cắt xuống trần 60s', () => {
    expect(clampCodeModeTimeout(300_000)).toBe(CODE_MODE_MAX_TIMEOUT_MS);
  });

  it('client xin 50ms vẫn bị nâng lên sàn 1s (không cắt cụt việc hợp lệ)', () => {
    expect(clampCodeModeTimeout(50)).toBe(1_000);
  });

  it('không truyền → dùng mặc định 30s; truyền trong khoảng → giữ nguyên', () => {
    expect(clampCodeModeTimeout(undefined)).toBe(CODE_MODE_DEFAULT_TIMEOUT_MS);
    expect(clampCodeModeTimeout(12_345)).toBe(12_345);
  });
});
