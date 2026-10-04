/**
 * Headless recipe runner — `vyen run --recipe <file> --params k=v`.
 *
 * Chạy workflow recipe KHÔNG cần UI: render tham số → vòng attempt (LLM qua
 * AutonomousCliAgent, mỗi attempt reset history như spec) → chạy checks bằng
 * harness bash → retry theo state machine lib/recipes/retry.ts → in kết quả
 * MỘT DÒNG JSON khi --output json, exit code ≠ 0 khi checks còn fail (dùng
 * được trong CI).
 *
 * Arg parsing + kế hoạch là hàm thuần để test; chỉ bước chạy thật đụng fs/LLM.
 */

import path from 'node:path';
import {
  parseRecipeText,
  prepareRecipeRun,
  resolveParameters,
  coerceParamValue,
  renderTemplate,
  nextRetryAction,
  processStructuredOutput,
  formatStructuredLine,
  type Recipe,
  type RecipeParamValues,
} from '@/lib/recipes';
import type { RetryCheckOutcome } from '@/lib/recipes/retry';
import { AutonomousCliAgent } from './interactive-agent';

export interface RecipeRunArgs {
  recipePath: string;
  params: Record<string, string>;
  output: 'json' | 'text';
  noSession: boolean;
  model?: string;
  maxTurns?: number;
}

export type RecipeRunParse =
  | { ok: true; args: RecipeRunArgs }
  | { ok: false; error: string };

/**
 * Parse argv của `vyen run --recipe ...`:
 *   --recipe <file> | --recipe=<file>
 *   --params k=v (--params có thể lặp lại; k=v phân cách bằng '=') | --params k=v,k2=v2
 *   --output json|text   (mặc định text)
 *   --no-session         (nhận cho tương thích spec; CLI headless không persist)
 *   --model <id>         (đè model của recipe.settings)
 */
export function parseRecipeRunArgv(argv: readonly string[]): RecipeRunParse {
  let recipePath = '';
  let output: 'json' | 'text' = 'text';
  let noSession = false;
  let model: string | undefined;
  const params: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--recipe') {
      recipePath = argv[++i] ?? '';
    } else if (a.startsWith('--recipe=')) {
      recipePath = a.slice('--recipe='.length);
    } else if (a === '--params' || a === '-p') {
      const raw = argv[++i] ?? '';
      for (const pair of raw.split(',')) {
        const eq = pair.indexOf('=');
        if (eq > 0) params[pair.slice(0, eq).trim()] = pair.slice(eq + 1);
      }
    } else if (a.startsWith('--params=')) {
      for (const pair of a.slice('--params='.length).split(',')) {
        const eq = pair.indexOf('=');
        if (eq > 0) params[pair.slice(0, eq).trim()] = pair.slice(eq + 1);
      }
    } else if (a.startsWith('--output=')) {
      const v = a.slice('--output='.length);
      if (v !== 'json' && v !== 'text') return { ok: false, error: `--output chỉ nhận json|text, nhận "${v}".` };
      output = v;
    } else if (a === '--output') {
      const v = argv[++i];
      if (v !== 'json' && v !== 'text') return { ok: false, error: `--output chỉ nhận json|text, nhận "${v ?? '(trống)'}".` };
      output = v;
    } else if (a === '--no-session') {
      noSession = true;
    } else if (a === '--model') {
      model = argv[++i];
    } else if (a.startsWith('--model=')) {
      model = a.slice('--model='.length);
    } else if (a.startsWith('-')) {
      return { ok: false, error: `Cờ không nhận diện: ${a}` };
    } else if (!recipePath) {
      recipePath = a;
    } else {
      return { ok: false, error: `Tham số thừa: ${a}` };
    }
  }

  if (!recipePath) return { ok: false, error: 'Thiếu --recipe <file>. Ví dụ: vyen run --recipe fix-tests.yaml --params path=src' };
  return { ok: true, args: { recipePath, params, output, noSession, model, maxTurns: undefined } };
}

export interface RecipeRunPlan {
  recipe: Recipe;
  values: RecipeParamValues;
  firstUserMessage: string;
  maxRetries: number;
}

/** Nạp + validate recipe + resolve tham số — tách ra để test không đụng LLM. */
export async function buildRecipeRunPlan(args: RecipeRunArgs): Promise<{ ok: true; plan: RecipeRunPlan } | { ok: false; error: string }> {
  const fs = await import('node:fs/promises');
  let text: string;
  try {
    text = await fs.readFile(args.recipePath, 'utf8');
  } catch (err) {
    return { ok: false, error: `Không đọc được file recipe: ${err instanceof Error ? err.message : String(err)}` };
  }
  const parsed = parseRecipeText(text);
  if (!parsed.ok || !parsed.recipe) return { ok: false, error: parsed.error ?? 'Recipe không hợp lệ.' };
  const recipe = parsed.recipe;

  const values: RecipeParamValues = {};
  for (const p of recipe.parameters ?? []) {
    if (!(p.key in args.params)) continue;
    const coerced = coerceParamValue(args.params[p.key]!, p.input_type);
    if (coerced === null) {
      return { ok: false, error: `Tham số "${p.key}" cần giá trị ${p.input_type}, nhận "${args.params[p.key]}".` };
    }
    values[p.key] = coerced;
  }
  const resolved = resolveParameters(recipe, values);
  if (resolved.missing.length) {
    return { ok: false, error: `Thiếu tham số bắt buộc: ${resolved.missing.join(', ')}. Thêm --params ${resolved.missing.map((k) => `${k}=<giá trị>`).join(' ')}` };
  }
  if (resolved.needsPrompt.length) {
    return { ok: false, error: `Tham số cần nhập tay khi chạy (user_prompt): ${resolved.needsPrompt.join(', ')} — headless yêu cầu --params cho đủ.` };
  }

  const prepared = prepareRecipeRun(recipe, resolved.values, {
    recipeDir: path.dirname(path.resolve(args.recipePath)),
    includeStructuredDirective: true,
  });
  // Headless không có system riêng theo lượt: systemAppend dán lên đầu message.
  const firstUserMessage = prepared.systemAppend
    ? `${prepared.systemAppend}\n\n---\n\n${prepared.firstUserMessage}`
    : prepared.firstUserMessage;

  return {
    ok: true,
    plan: { recipe, values: resolved.values, firstUserMessage, maxRetries: recipe.retry?.max_retries ?? 0 },
  };
}

export interface HeadlessIo {
  writeOut: (s: string) => void;
  writeErr: (s: string) => void;
}

const DEFAULT_IO: HeadlessIo = {
  writeOut: (s) => process.stdout.write(s),
  writeErr: (s) => process.stderr.write(s),
};

/** Exit code: 0 = pass (hoặc không có check); 1 = checks fail; 2 = lỗi cấu hình. */
export async function runRecipeHeadless(args: RecipeRunArgs, io: HeadlessIo = DEFAULT_IO): Promise<number> {
  const planResult = await buildRecipeRunPlan(args);
  if (!planResult.ok) {
    io.writeErr(`[vyen run] ${planResult.error}\n`);
    return 2;
  }
  const { recipe, values, firstUserMessage, maxRetries } = planResult.plan;

  const agent = new AutonomousCliAgent({ workspaceRoot: process.cwd() });
  if (args.model) agent.setModel(args.model);
  else if (recipe.settings?.model) agent.setModel(recipe.settings.model);

  const agentConfig = agent.getConfig();
  if (!agentConfig.hasKey) {
    io.writeErr(
      '[vyen run] Chưa có API key cho LLM. Đặt OPENAI_API_KEY/VYEN_API_KEY... trong env hoặc .env.local trước khi chạy headless.\n',
    );
    return 2;
  }

  const maxTotal = 1 + maxRetries;
  let attempt = 1;
  let lastText = '';
  let failurePrompt: string | null = null;

  for (;;) {
    io.writeOut(`\n[vyen run] Attempt ${attempt}/${maxTotal} — recipe "${recipe.title}"\n`);
    agent.clearHistory(); // reset về trạng thái đầu như spec retry
    const outcome = await withTurnTimeout(agent.streamTurn(failurePrompt ?? firstUserMessage));

    /* Lượt treo (provider chết/502) KHÔNG settle promise — đo được: tiến trình
       tự thoát sau ~7s với exit 0 và in ra không một dòng nào, tức CI coi lỗi
       hạ tầng là đạt. `withTurnTimeout` giữ một timer sống trong suốt lượt nên
       tiến trình không thể thoất im lặng nữa: hết giờ sẽ báo lỗi + exit 1. */
    if (outcome.status === 'timeout') {
      io.writeErr(
        `[vyen run] Model không phản hồi trong ${Math.round(LLM_TURN_TIMEOUT_MS / 1000)}s (lỗi mạng/provider?) — coi như FAIL.\n`,
      );
      return 1;
    }
    const result = outcome.value;
    lastText = result.text;

    /* Model KHÔNG trả lời được (lỗi provider/mạng) hoặc trả rỗng = FAIL, không
       phải kết quả hợp lệ. Trước khi có chặn này lượt đó in "✅ Recipe ... PASS"
       và exit 0 (đo được: endpoint trả HTTP 502). Cùng loại với lỗi "schema sai
       nhưng exit 0" đã sửa ở trên. */
    if (result.error || !lastText.trim()) {
      io.writeErr(
        result.error
          ? `[vyen run] Lượt thất bại do lỗi model/provider — coi như FAIL.\n${result.error}\n`
          : '[vyen run] Model không trả về nội dung — coi như FAIL.\n',
      );
      return 1;
    }

    // Chạy checks tuần tự bằng harness bash (lệnh render với giá trị tham số).
    const outcomes: RetryCheckOutcome[] = [];
    for (const check of recipe.retry?.checks ?? []) {
      const command = renderTemplate(check.command, values);
      io.writeOut(`[vyen run] check: ${command}\n`);
      const res = agent.getHarness().bash(command);
      const ok = res.ok;
      outcomes.push({
        command,
        exitCode: ok ? 0 : 1,
        ok,
        tail: (res.output || res.error || '').slice(-1_500),
      });
      io.writeOut(`[vyen run] check ${ok ? 'PASS' : 'FAIL'} (exit ${ok ? 0 : 1})\n`);
    }

    const action = nextRetryAction({ recipe, state: { attempt, maxRetries }, outcomes });
    const schema = (recipe.response?.json_schema ?? undefined) as Parameters<typeof processStructuredOutput>[1];
    if (action.action === 'pass') {
      /* Exit code bám theo kết quả emitResult: schema sai → 1. Trước đây nhánh
         này luôn trả 0 dù dòng JSON đã là `ok:false`. */
      return emitResult(io, args, recipe.title, lastText, attempt, [], undefined, schema) ? 0 : 1;
    }
    if (action.action === 'stop') {
      emitResult(
        io,
        args,
        recipe.title,
        lastText,
        attempt,
        outcomes.filter((o) => !o.ok).map((o) => `${o.command} exit=${o.exitCode}`),
        action.reason,
        schema,
      );
      return 1;
    }
    failurePrompt = action.failurePrompt;
    attempt = action.nextAttempt;
  }
}

/**
 * In kết quả cuối của recipe.
 *
 * `--output json` khi recipe có `response.json_schema`: validate theo schema
 * (trước đây hardcode `undefined` nên CLI không bao giờ validate); output sai
 * kiểu phải phát `ok:false` kèm `errors` — không được phát text thô với
 * `ok:true` để CI đọc thành pass.
 *
 * TRẢ VỀ `true` = lượt này đạt, `false` = fail (checks hoặc sai schema). Giá trị
 * này là thứ quyết định exit code của `runRecipeHeadless`: trước đây hàm
 * trả `void` nên cả case `ok:false` vẫn khiến tiến trình exit 0 — CI chỉ kiểm
 * `$?` sẽ coi output sai schema là pass. Đo được trên CLI thật trước khi sửa.
 */
/**
 * Trần thời gian chờ MỘT lượt gọi LLM trong headless recipe.
 *
 * Vừa là "hết giờ thì báo lỗi", vừa là thứ GIỮ tiến trình sống: khi provider
 * chết, `streamTurn` không settle (không resolve, không reject) và event loop
 * rỗng nên Node tự thoát với code 0 — im lặng, sai lệch với thực tế. Một timer
 * đang chờ là handle giữ vòng lặp sống tới khi ta tự quyết định.
 */
export const LLM_TURN_TIMEOUT_MS = 60_000;

export type TurnOutcome<T> = { status: 'ok'; value: T } | { status: 'timeout' };

/**
 * Chặn một promise treo bằng giới hạn thời gian.
 * - settle trong hạn   → `{ status: 'ok', value }`
 * - quá hạn (treo)    → `{ status: 'timeout' }`
 * - promise reject     → trả lỗi nguyên vẹn (không nuốt lỗi thành timeout)
 */
export function withTurnTimeout<T>(p: Promise<T>, ms: number = LLM_TURN_TIMEOUT_MS): Promise<TurnOutcome<T>> {
  return new Promise<TurnOutcome<T>>((resolve, reject) => {
    const timer = setTimeout(() => resolve({ status: 'timeout' }), Math.max(1, ms));
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve({ status: 'ok', value });
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function emitResult(
  io: HeadlessIo,
  args: RecipeRunArgs,
  title: string,
  finalText: string,
  attempts: number,
  failedChecks: string[],
  stopReason?: string,
  schema?: Parameters<typeof processStructuredOutput>[1],
): boolean {
  if (args.output === 'json') {
    if (failedChecks.length === 0) {
      // Structured output: recipe có schema → validate; không có → trả text.
      const structured = processStructuredOutput(finalText, schema);
      if (schema && !structured.ok) {
        io.writeOut(formatStructuredLine({ recipe: title, ok: false, errors: structured.errors }) + '\n');
        return false;
      }
      io.writeOut(
        formatStructuredLine({
          recipe: title,
          ok: true,
          ...(structured.ok ? { data: structured.value } : { data: finalText.trim() }),
        }) + '\n',
      );
      return true;
    }
    io.writeOut(
      formatStructuredLine({ recipe: title, ok: false, errors: [...(stopReason ? [`stop:${stopReason}`] : []), ...failedChecks] }) + '\n',
    );
    return false;
  }
  if (failedChecks.length === 0) {
    io.writeOut(`\n[vyen run] ✅ Recipe "${title}" PASS sau ${attempts} attempt.\n`);
    if (finalText.trim()) io.writeOut(`${finalText.trim()}\n`);
    return true;
  }
  io.writeOut(`\n[vyen run] ❌ Recipe "${title}" FAIL sau ${attempts} attempt (${stopReason ?? 'checks'}).\n`);
  for (const f of failedChecks) io.writeOut(`  - ${f}\n`);
  return false;
}
