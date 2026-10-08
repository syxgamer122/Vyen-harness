/**
 * Code Mode — Thực thi mã JavaScript on-demand gọi MCP tools (code mode).
 *
 * Thay vì đăng ký hàng chục/hàng trăm tool MCP riêng lẻ vào LLM context,
 * Code Mode cung cấp duy nhất 1 công cụ `run_code(code)`.
 *
 * Trong môi trường sandbox:
 * - Inject sẵn đối tượng `mcp.call(serverId, toolName, args)`.
 * - Hỗ trợ top-level await và console.log.
 * - Giới hạn thời gian (timeout mặc định 30s).
 * - Output được cắt tối đa 24.000 ký tự (quy chuẩn Vyen).
 * - Vẫn tuân thủ đầy đủ cổng phê duyệt an toàn (auto-pilot / modal).
 *
 * Ranh giới bảo mật (đợt vá 2026-10-08):
 * - Mã model chạy trong WORKER THREAD riêng (`node:worker_threads`), KHÔNG còn
 *   chạy trên event loop của host. Vòng lặp promise vi mô
 *   (`while (true) await null`) chỉ làm đói worker; timer của host vẫn chạy.
 *   Hết hạn thì `worker.terminate()` dừng cứng worker — không còn kiểu "giảm
 *   thiểu bằng clear timer" như bản in-process (bản cũ vẫn treo host vì code
 *   chạy đồng bộ/microtask trên chính event loop của host).
 * - Worker nhận `env: {}`, `argv: []`, `execArgv: []` và `resourceLimits`
 *   (RAM/stack) — không kế thừa biến môi trường của host, nên secret không đi
 *   qua env dù worker có bị thoát khỏi vm.
 * - `node:vm` KHÔNG phải ranh giới cách ly — nó chỉ an toàn khi KHÔNG có
 *   object/function thuộc realm host lọt vào context. Vì vậy bridge được cài TỪ
 *   BÊN TRONG realm của context, và MỌI hàm host (kể cả hàm ném lỗi) được bọc
 *   try/catch rồi rethrow `Error` tạo TRONG realm sandbox: code sandbox bắt được
 *   lỗi cũng không lấy được `Function` của realm host qua `.constructor`.
 * - `mcp.call` chỉ đi qua `postMessage`; kết quả MCP được clone bằng JSON ngay
 *   trong sandbox nên object thật của host không bao giờ lọt vào context.
 *
 * Giới hạn còn lại (chưa nối trong phạm vi này): worker thread vẫn CÙNG process
 * với host — escape thành công sẽ chạm được filesystem của worker (dù không có
 * env), không chỉ `process.pid`. Cách ly thật cần tiến trình con với permission
 * model của Node: `--permission` (Node >= 22.13, alias cũ `--experimental-permission`;
 * môi trường hiện tại Node v22.23.2 — `node --help` có cả hai alias). Việc đó cần
 * đổi cách khởi động tiến trình nên để đợt sau.
 */

import { Worker } from 'node:worker_threads';
import { z } from 'zod';
import { tool } from 'ai';

export const CODE_MODE_MAX_OUTPUT_CHARS = 24_000;
export const CODE_MODE_DEFAULT_TIMEOUT_MS = 30_000;
/** Trần cứng. Mã của model chạy trong worker thread riêng nên không còn chặn
 *  event loop của host; trần này chỉ để một lượt code không giữ worker quá lâu
 *  (mỗi lượt tạo worker mới và `terminate()` khi xong). */
export const CODE_MODE_MAX_TIMEOUT_MS = 60_000;

/** Giới hạn tài nguyên của worker: sandbox không được ngốn RAM/stack của host. */
const CODE_MODE_WORKER_RESOURCE_LIMITS = {
  maxOldGenerationSizeMb: 128,
  maxYoungGenerationSizeMb: 32,
  stackSizeMb: 4,
} as const;

/** Ép `timeoutMs` (kể cả giá trị từ client qua bridge) vào khoảng [1s, 60s]. */
export function clampCodeModeTimeout(ms: number | undefined): number {
  return Math.min(Math.max(ms ?? CODE_MODE_DEFAULT_TIMEOUT_MS, 1_000), CODE_MODE_MAX_TIMEOUT_MS);
}

export interface CodeModeExecutionOptions {
  mcpCaller?: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  timeoutMs?: number;
  maxOutputChars?: number;
}

export interface CodeModeResult {
  ok: boolean;
  output: string;
  returnValue?: unknown;
  error?: string;
  durationMs: number;
  truncated?: boolean;
}

/**
 * Truncate chuỗi output nếu vượt quá trần ký tự (24.000).
 */
export function truncateCodeOutput(
  text: string,
  maxChars = CODE_MODE_MAX_OUTPUT_CHARS,
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  const notice = `\n\n[... Cắt ngắn: Kết quả vượt quá ${maxChars} ký tự quy chuẩn ...]`;
  return {
    text: text.slice(0, maxChars - notice.length) + notice,
    truncated: true,
  };
}

/**
 * Source của installer bridge — chạy bằng `vm.runInContext` nên TOÀN BỘ hàm
 * trong đây thuộc realm của sandbox. Bốn hàm host (`hostCall`, `hostLog`,
 * `hostSetTimeout`, `hostClearTimeout`) chỉ là tham số cục bộ, không phải
 * property của `globalThis`, nên code trong sandbox không có đường chạm tới
 * realm host qua `.constructor`.
 *
 * Lưu ý từng đường rò đã bịt:
 * - Không nạp intrinsic host (Object/Array/Math/...): context trống tự có
 *   intrinsic riêng của nó.
 * - Kết quả `mcp.call` được clone bằng JSON ngay TRONG sandbox: object MCP trả
 *   về thuộc realm host, nếu đưa thẳng cho code sandbox thì `.constructor` của
 *   nó là `Function` của host.
 * - `setTimeout` trả về id dạng SỐ (primitive qua realm an toàn), không trả
 *   handle Timeout của host (handle là object realm host → lại là cửa escape).
 * - MỌI lỗi ném ra từ hàm host được bắt TRONG bridge rồi rethrow `Error` mới
 *   tạo trong realm sandbox. Nếu để lỗi host (ví dụ `new Error` do mcpCaller
 *   ném, hay `JSON.stringify` của host ném trên object vòng) xuyên thẳng vào
 *   sandbox thì `err.constructor.constructor` chính là `Function` của host —
 *   đúng vector escape đã đo được từ trước đợt vá này.
 */
const SANDBOX_BRIDGE_SOURCE = `(function (hostCall, hostLog, hostSetTimeout, hostClearTimeout) {
  'use strict';
  var sandboxError = function (prefix, err) {
    var message = err && err.message ? String(err.message) : String(err);
    return new Error(prefix + message);
  };
  var callHost = async function (serverId, toolName, args) {
    var hostResult;
    try {
      hostResult = await hostCall(String(serverId), String(toolName), args);
    } catch (err) {
      throw sandboxError('MCP call thất bại: ', err);
    }
    if (hostResult === undefined) return undefined;
    var kind = typeof hostResult;
    if (kind === 'function') return undefined;
    if (kind !== 'object' || hostResult === null) return hostResult;
    try {
      return JSON.parse(JSON.stringify(hostResult));
    } catch (err) {
      throw new Error('Kết quả MCP không chuyển được qua ranh giới sandbox: ' + (err && err.message ? err.message : String(err)));
    }
  };
  var bridge = {
    call: async function (serverId, toolName, args) {
      return await callHost(serverId, toolName, args);
    },
    log: function () {
      try {
        hostLog.apply(null, arguments);
      } catch (err) {
        throw sandboxError('console.log thất bại: ', err);
      }
    },
  };
  globalThis.mcp = bridge;
  globalThis.console = {
    log: bridge.log,
    info: bridge.log,
    warn: bridge.log,
    error: bridge.log,
  };
  globalThis.setTimeout = function (fn, ms) {
    if (typeof fn !== 'function') throw new TypeError('setTimeout yêu cầu callback là hàm.');
    var extra = Array.prototype.slice.call(arguments, 2);
    try {
      return hostSetTimeout(function () {
        return fn.apply(undefined, extra);
      }, ms);
    } catch (err) {
      throw sandboxError('setTimeout thất bại: ', err);
    }
  };
  globalThis.clearTimeout = function (handle) {
    try {
      return hostClearTimeout(handle);
    } catch (err) {
      throw sandboxError('clearTimeout thất bại: ', err);
    }
  };
})`;

/**
 * Source của worker — chạy trong thread riêng, chỉ giao tiếp với host qua
 * `postMessage`. Không import module dự án (worker `eval` chỉ có builtin của
 * Node), nhận user code + bridge source qua `workerData`.
 */
const CODE_MODE_WORKER_SOURCE = `
'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');

const logs = [];
function captureLog() {
  try {
    const line = Array.prototype.map
      .call(arguments, function (a) {
        return typeof a === 'object' && a !== null ? JSON.stringify(a, null, 2) : String(a);
      })
      .join(' ');
    logs.push(line);
  } catch (err) {
    logs.push('[log error] ' + (err && err.message ? err.message : String(err)));
  }
}

let nextRequestId = 1;
const pendingCalls = new Map();
function hostCall(serverId, toolName, args) {
  return new Promise(function (resolve, reject) {
    const id = nextRequestId++;
    pendingCalls.set(id, { resolve: resolve, reject: reject });
    try {
      parentPort.postMessage({ type: 'mcp-call', id: id, serverId: serverId, toolName: toolName, args: args });
    } catch (err) {
      pendingCalls.delete(id);
      reject(new Error('Không gửi được yêu cầu MCP qua worker: ' + (err && err.message ? err.message : String(err))));
    }
  });
}

parentPort.on('message', function (msg) {
  if (!msg || msg.type !== 'mcp-result') return;
  const entry = pendingCalls.get(msg.id);
  if (!entry) return;
  pendingCalls.delete(msg.id);
  if (msg.ok) entry.resolve(msg.value);
  else entry.reject(new Error(String(msg.error)));
});

let timerSeq = 0;
const timers = new Map();
function hostSetTimeout(fn, ms) {
  if (typeof fn !== 'function') throw new TypeError('setTimeout yêu cầu callback là hàm.');
  const delay = Math.min(Math.max(Number(ms) || 0, 0), 2147483647);
  const id = ++timerSeq;
  const handle = setTimeout(function () {
    timers.delete(id);
    try {
      fn();
    } catch (err) {
      /* Callback của sandbox ném lỗi là chuyện nội bộ của nó — không được làm sập worker. */
    }
  }, delay);
  timers.set(id, handle);
  return id;
}
function hostClearTimeout(handle) {
  const id = Number(handle);
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

/* Context KHÔNG nạp gì từ worker. Bẫy đã đo: vm.createContext({}) khiến chuỗi
   prototype của global chạy về Object.prototype của HOST (worker) →
   globalThis.constructor.constructor('return process')() lấy được process.
   Cách vá: sandbox object phải có prototype NULL, rồi gắn prototype chuẩn của
   realm SANDBOX bằng setPrototypeOf chạy TRONG context. */
const context = vm.createContext(Object.create(null));
vm.runInContext('Object.setPrototypeOf(globalThis, Object.prototype)', context, {
  filename: 'code-mode-realm-fix.js',
});

const installBridge = vm.runInContext(workerData.bridgeSource, context, {
  filename: 'code-mode-bridge.js',
});
installBridge(hostCall, captureLog, hostSetTimeout, hostClearTimeout);

function sanitizeResult(value) {
  if (value === undefined) return { present: false };
  try {
    return { present: true, value: structuredClone(value) };
  } catch (err) {
    /* rơi xuống JSON */
  }
  try {
    return { present: true, value: JSON.parse(JSON.stringify(value)) };
  } catch (err) {
    /* rơi xuống String */
  }
  return { present: true, value: String(value) };
}

function finish(value) {
  parentPort.postMessage({ type: 'result', logs: logs, result: sanitizeResult(value) });
}
function fail(err) {
  parentPort.postMessage({
    type: 'error',
    logs: logs,
    message: String(err && err.message ? err.message : err),
  });
}

try {
  const wrapped = '(async () => {\\n' + workerData.code + '\\n})()';
  const script = new vm.Script(wrapped, { filename: 'code-mode.js' });
  const promise = script.runInContext(context, { displayErrors: true });
  Promise.resolve(promise).then(finish, fail);
} catch (err) {
  fail(err);
}
`;

const EMPTY_LOGS: string[] = [];

function extractLogs(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((line): line is string => typeof line === 'string') : EMPTY_LOGS;
}

/**
 * Thực thi đoạn mã JavaScript trong worker thread cách ly, có trần thời gian cứng.
 */
export async function executeCodeMode(
  code: string,
  options: CodeModeExecutionOptions = {},
): Promise<CodeModeResult> {
  const startTime = Date.now();
  const timeoutMs = clampCodeModeTimeout(options.timeoutMs);
  const maxChars = options.maxOutputChars ?? CODE_MODE_MAX_OUTPUT_CHARS;

  const buildErrorResult = (errorMsg: string, logs: string[]): CodeModeResult => {
    const durationMs = Date.now() - startTime;
    const logOutput = logs.join('\n').trim();
    const errorOutput = logOutput ? `${logOutput}\n\n[Lỗi]: ${errorMsg}` : `[Lỗi]: ${errorMsg}`;
    const { text: finalOutput, truncated } = truncateCodeOutput(errorOutput, maxChars);
    return { ok: false, output: finalOutput, error: errorMsg, durationMs, truncated };
  };

  const buildSuccessResult = (rawResult: unknown, logs: string[]): CodeModeResult => {
    const durationMs = Date.now() - startTime;
    const logOutput = logs.join('\n').trim();

    let combinedOutput = '';
    if (logOutput) {
      combinedOutput += logOutput;
    }

    let returnSerialized = '';
    if (rawResult !== undefined) {
      returnSerialized =
        typeof rawResult === 'object' && rawResult !== null
          ? JSON.stringify(rawResult, null, 2) ?? String(rawResult)
          : String(rawResult);
      if (combinedOutput) combinedOutput += '\n\n[Return Value]:\n';
      combinedOutput += returnSerialized;
    }

    if (!combinedOutput) {
      combinedOutput = '(Mã thực thi thành công không có output)';
    }

    const { text: finalOutput, truncated: outputTruncated } = truncateCodeOutput(combinedOutput, maxChars);

    // `returnValue` cũng phải chịu trần 24k: nếu để nguyên, lớp orchestration
    // `JSON.stringify(res)` sẽ mang cả object vượt trần ra ngoài.
    let returnValue: unknown = rawResult;
    let returnValueTruncated = false;
    if (rawResult !== undefined) {
      const merged = truncateCodeOutput(returnSerialized, maxChars);
      if (merged.truncated) {
        returnValue = merged.text;
        returnValueTruncated = true;
      }
    }

    return {
      ok: true,
      output: finalOutput,
      returnValue,
      durationMs,
      truncated: outputTruncated || returnValueTruncated,
    };
  };

  return new Promise<CodeModeResult>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    let worker: Worker | null = null;

    const finish = (result: CodeModeResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (!worker) {
        resolve(result);
        return;
      }
      /* terminate() dừng cứng worker: mọi timer/promise/microtask còn treo trong
         sandbox chết theo, không thể chạy nền sau khi lượt chạy kết thúc. */
      void worker
        .terminate()
        .catch(() => {})
        .then(() => resolve(result));
    };

    const respond = (payload: Record<string, unknown>): void => {
      if (settled || !worker) return;
      try {
        worker.postMessage(payload);
      } catch (err) {
        // Kết quả MCP có thể chứa thứ không clone được qua ranh giới worker.
        if (payload.ok) {
          try {
            worker.postMessage({
              type: 'mcp-result',
              id: payload.id,
              ok: false,
              error: `Kết quả MCP không chuyển được qua ranh giới worker: ${err instanceof Error ? err.message : String(err)}`,
            });
          } catch {
            /* worker đã chết */
          }
        }
      }
    };

    const handleMcpCall = (msg: Record<string, unknown>): void => {
      const id = typeof msg.id === 'number' ? msg.id : -1;
      const serverId = String(msg.serverId);
      const toolName = String(msg.toolName);
      const args = (
        typeof msg.args === 'object' && msg.args !== null ? msg.args : {}
      ) as Record<string, unknown>;

      if (!options.mcpCaller) {
        respond({
          type: 'mcp-result',
          id,
          ok: false,
          error: `MCP caller chưa được cấu hình cho Code Mode khi gọi ${serverId}/${toolName}.`,
        });
        return;
      }

      void Promise.resolve()
        .then(() => options.mcpCaller!(serverId, toolName, args))
        .then(
          (value) => respond({ type: 'mcp-result', id, ok: true, value }),
          (err) =>
            respond({
              type: 'mcp-result',
              id,
              ok: false,
              error: String(err instanceof Error ? err.message : err),
            }),
        );
    };

    try {
      worker = new Worker(CODE_MODE_WORKER_SOURCE, {
        eval: true,
        workerData: { code, bridgeSource: SANDBOX_BRIDGE_SOURCE },
        name: 'vyen-code-mode',
        // Không kế thừa env/argv/execArgv của host: dù worker có bị thoát khỏi
        // vm, `process.env` bên trong cũng rỗng và cờ Node của host không lọt vào.
        env: {},
        argv: [],
        execArgv: [],
        resourceLimits: CODE_MODE_WORKER_RESOURCE_LIMITS,
        // Không để stdout/stderr của worker chảy thẳng vào log của host; pipe
        // được drain bằng resume() bên dưới.
        stdout: true,
        stderr: true,
      });
    } catch (err) {
      finish(buildErrorResult(err instanceof Error ? err.message : String(err), EMPTY_LOGS));
      return;
    }

    // Luôn drain để sandbox có lỡ ghi vào stdout của worker cũng không bị chặn
    // bởi backpressure, và cũng không rơi vào log của host.
    worker.stdout?.resume();
    worker.stderr?.resume();

    worker.on('message', (msg: unknown) => {
      if (settled || !msg || typeof msg !== 'object') return;
      const m = msg as Record<string, unknown>;

      if (m.type === 'mcp-call') {
        handleMcpCall(m);
        return;
      }

      if (m.type === 'result') {
        const logs = extractLogs(m.logs);
        const payload = (typeof m.result === 'object' && m.result !== null ? m.result : {}) as {
          present?: unknown;
          value?: unknown;
        };
        const rawResult = payload.present ? payload.value : undefined;
        try {
          finish(buildSuccessResult(rawResult, logs));
        } catch (err) {
          finish(buildErrorResult(err instanceof Error ? err.message : String(err), logs));
        }
        return;
      }

      if (m.type === 'error') {
        finish(
          buildErrorResult(
            String(m.message ?? 'Lỗi không xác định trong worker Code Mode.'),
            extractLogs(m.logs),
          ),
        );
      }
    });

    worker.on('error', (err: Error) => {
      finish(buildErrorResult(String(err instanceof Error ? err.message : err), EMPTY_LOGS));
    });

    worker.on('exit', (exitCode: number) => {
      if (settled) return;
      finish(buildErrorResult(`Worker Code Mode kết thúc bất thường (exit ${exitCode}).`, EMPTY_LOGS));
    });

    timer = setTimeout(() => {
      finish(buildErrorResult(`Thực thi mã quá thời gian cho phép (${timeoutMs / 1000}s).`, EMPTY_LOGS));
    }, timeoutMs);
  });
}

/* ------------------------------------------------------------------ */
/* Tool Definition                                                    */
/* ------------------------------------------------------------------ */

export const CODE_MODE_TOOL_NAME = 'run_code';

export const RUN_CODE_DEF = tool({
  description:
    'Thực thi đoạn mã JavaScript trong môi trường Node.js. ' +
    'Cung cấp sẵn `mcp.call(serverId, toolName, args)` (trả về Promise) để gọi các công cụ MCP theo kịch bản ' +
    'và xử lý kết quả trực tiếp mà không cần nhiều lượt hội thoại với LLM. ' +
    'Có sẵn console.log(...) để in kết quả.',
  parameters: z.object({
    code: z
      .string()
      .describe('Đoạn mã JavaScript cần thực thi. Hỗ trợ top-level await, mcp.call(...), console.log(...).'),
  }),
});
