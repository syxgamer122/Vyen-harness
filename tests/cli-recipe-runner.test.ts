import { describe, expect, it } from 'vitest';
import { emitResult, parseRecipeRunArgv, withTurnTimeout, type RecipeRunArgs } from '@/lib/cli/recipe-runner';
import { resolveDispatch, COMMANDS } from '@/lib/cli/cli-surface';

describe('cli recipe-runner — parseRecipeRunArgv', () => {
  it('đủ cờ cơ bản', () => {
    const r = parseRecipeRunArgv(['--recipe', 'fix-tests.yaml', '--params', 'path=src']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.args.recipePath).toBe('fix-tests.yaml');
      expect(r.args.params).toEqual({ path: 'src' });
      expect(r.args.output).toBe('text');
      expect(r.args.noSession).toBe(false);
    }
  });

  it('--recipe=<file>, --params lặp + phân cách phẩy, --output json, --no-session', () => {
    const r = parseRecipeRunArgv([
      '--recipe=lint.yaml',
      '--params', 'a=1,b=x y',
      '--params', 'c=true',
      '--output=json',
      '--no-session',
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.args.recipePath).toBe('lint.yaml');
      expect(r.args.params).toEqual({ a: '1', b: 'x y', c: 'true' });
      expect(r.args.output).toBe('json');
      expect(r.args.noSession).toBe(true);
    }
  });

  it('đường dẫn positional không có cờ', () => {
    const r = parseRecipeRunArgv(['fix-tests.yaml']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.args.recipePath).toBe('fix-tests.yaml');
  });

  it('thiếu recipe → lỗi có ví dụ; cờ lạ → lỗi; --output rác → lỗi', () => {
    expect(parseRecipeRunArgv([]).ok).toBe(false);
    expect(parseRecipeRunArgv(['--wat']).ok).toBe(false);
    expect(parseRecipeRunArgv(['--recipe', 'a.yaml', '--output', 'xml']).ok).toBe(false);
    expect(parseRecipeRunArgv(['a.yaml', 'thừa']).ok).toBe(false);
  });

  it('--model đè model của recipe', () => {
    const r = parseRecipeRunArgv(['--recipe', 'a.yaml', '--model', 'qwen3.5-flash']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.args.model).toBe('qwen3.5-flash');
  });
});

describe('cli recipe-runner — withTurnTimeout chặn promise treo', () => {
  it('promise settle trong hạn → ok kèm giá trị', async () => {
    const outcome = await withTurnTimeout(Promise.resolve('xong'), 1_000);
    expect(outcome).toEqual({ status: 'ok', value: 'xong' });
  });

  it('promise KHÔNG settle (provider chết) → timeout thay vì treo mãi', async () => {
    /* Đây là bài toán thật: `streamTurn` với endpoint chết không resolve cũng
       không reject, tiến trình tự thoát exit 0 im lặng. */
    const never = new Promise<string>(() => {});
    const outcome = await withTurnTimeout(never, 20);
    expect(outcome).toEqual({ status: 'timeout' });
  });

  it('promise reject → lỗi được ném nguyên vẹn, KHÔNG bị đổi thành timeout', async () => {
    await expect(withTurnTimeout(Promise.reject(new Error('502 upstream')), 1_000)).rejects.toThrow('502 upstream');
  });

  it('hạn <= 0 vẫn lập tức timeout (không treo do setTimeout âm)', async () => {
    const outcome = await withTurnTimeout(new Promise<string>(() => {}), 0);
    expect(outcome).toEqual({ status: 'timeout' });
  });
});

describe('cli recipe-runner — emitResult validate structured output theo json_schema', () => {
  const args: RecipeRunArgs = { recipePath: 'r.yaml', params: {}, output: 'json', noSession: true };

  function capture() {
    const lines: string[] = [];
    const io = { writeOut: (s: string) => lines.push(s), writeErr: (s: string) => lines.push(s) };
    return { io, lines };
  }

  it('có schema + output sai kiểu → ok:false kèm errors (không phát text thô ok:true)', () => {
    const { io, lines } = capture();
    const ok = emitResult(io, args, 'demo', '{"count":"hai"}', 1, [], undefined, {
      type: 'object',
      required: ['count'],
      properties: { count: { type: 'number' } },
    });
    const payload = JSON.parse(lines.join('').trim());
    expect(payload.ok).toBe(false);
    expect(payload.errors.length).toBeGreaterThan(0);
    /* Giá trị trả về là thứ quyết định exit code: sai schema phải là fail. */
    expect(ok).toBe(false);
  });

  it('có schema + output hợp lệ → ok:true với data đã parse', () => {
    const { io, lines } = capture();
    const ok = emitResult(io, args, 'demo', '{"count":2}', 1, [], undefined, {
      type: 'object',
      required: ['count'],
      properties: { count: { type: 'number' } },
    });
    const payload = JSON.parse(lines.join('').trim());
    expect(payload).toEqual({ recipe: 'demo', ok: true, data: { count: 2 } });
    expect(ok).toBe(true);
  });

  it('không schema → giữ hành vi cũ: ok:true với text thô', () => {
    const { io, lines } = capture();
    const ok = emitResult(io, args, 'demo', 'không phải JSON', 1, []);
    const payload = JSON.parse(lines.join('').trim());
    expect(payload).toEqual({ recipe: 'demo', ok: true, data: 'không phải JSON' });
    expect(ok).toBe(true);
  });

  it('checks fail → ok:false với errors như cũ', () => {
    const { io, lines } = capture();
    const ok = emitResult(io, args, 'demo', 'x', 1, ['check exit=1'], 'checks');
    const payload = JSON.parse(lines.join('').trim());
    expect(payload.ok).toBe(false);
    expect(payload.errors).toContain('check exit=1');
    expect(ok).toBe(false);
  });

  it('chế độ text: pass → true, checks fail → false (exit code theo kết quả này)', () => {
    const textArgs: RecipeRunArgs = { recipePath: 'r.yaml', params: {}, output: 'text', noSession: true };
    const pass = capture();
    expect(emitResult(pass.io, textArgs, 'demo', 'xong', 1, [])).toBe(true);
    expect(pass.lines.join('')).toContain('PASS');

    const fail = capture();
    expect(emitResult(fail.io, textArgs, 'demo', 'xong', 1, ['check exit=2'], 'checks')).toBe(false);
    expect(fail.lines.join('')).toContain('FAIL');
  });
});

describe('cli dispatch — run --recipe đi vào recipe runner', () => {
  it("'run' + --recipe → lệnh recipe (không rơi vào REPL)", () => {
    const res = resolveDispatch(['run', '--recipe', 'fix-tests.yaml', '--params', 'path=src']);
    expect(res.branch).toBe('command');
    expect(res.command?.name).toBe('recipe');
  });

  it("'run' không có --recipe vẫn là REPL (giữ compat)", () => {
    const res = resolveDispatch(['run']);
    expect(res.command?.name).toBe('cli');
  });

  it("'recipe' là lệnh nhóm agent — dispatch ngay ở nhánh đầu", () => {
    const res = resolveDispatch(['recipe', 'list']);
    expect(res.branch).toBe('command');
    expect(res.command?.name).toBe('recipe');
  });

  it('registry có mô tả tiếng Việt cho help', () => {
    expect(COMMANDS.recipe.description.length).toBeGreaterThan(10);
  });
});
