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
 * Ranh giới bảo mật: `node:vm` KHÔNG phải sandbox cách ly — nó chỉ an toàn khi
 * KHÔNG có object/function thuộc realm host lọt vào context. Mọi intrinsic của
 * host (kể cả `Object`, `Math`, `setTimeout`, hay object trả về từ MCP) đều mở
 * đường về host qua `.constructor` → `Function` của host → `process`.
 * Vì vậy bridge được cài TỪ BÊN TRONG realm của context, và hàm host chỉ tồn
 * tại dưới dạng tham số của hàm sandbox (xem SANDBOX_BRIDGE_SOURCE).
 */

import vm from 'node:vm';
import { z } from 'zod';
import { tool } from 'ai';

export const CODE_MODE_MAX_OUTPUT_CHARS = 24_000;
export const CODE_MODE_DEFAULT_TIMEOUT_MS = 30_000;

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
 */
const SANDBOX_BRIDGE_SOURCE = `(function (hostCall, hostLog, hostSetTimeout, hostClearTimeout) {
  'use strict';
  var callHost = async function (serverId, toolName, args) {
    var hostResult = await hostCall(String(serverId), String(toolName), args);
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
      hostLog.apply(null, arguments);
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
    return hostSetTimeout(function () {
      return fn.apply(undefined, extra);
    }, ms);
  };
  globalThis.clearTimeout = function (handle) {
    return hostClearTimeout(handle);
  };
})`;

/**
 * Thực thi đoạn mã JavaScript trong sandbox Node.js VM.
 */
export async function executeCodeMode(
  code: string,
  options: CodeModeExecutionOptions = {},
): Promise<CodeModeResult> {
  const startTime = Date.now();
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? CODE_MODE_DEFAULT_TIMEOUT_MS, 1_000), 120_000);
  const maxChars = options.maxOutputChars ?? CODE_MODE_MAX_OUTPUT_CHARS;

  const logs: string[] = [];

  const captureLog = (...args: unknown[]) => {
    const line = args
      .map((a) => (typeof a === 'object' && a !== null ? JSON.stringify(a, null, 2) : String(a)))
      .join(' ');
    logs.push(line);
  };

  /**
   * Trạng thái huỷ của lượt chạy (A2). Khi hết thời gian (hoặc lượt chạy kết
   * thúc), mọi timer còn treo bị clear và `mcp.call` sau đó bị từ chối.
   *
   * Đây là GIẢM THIỂU, không phải dừng cứng: một vòng lặp promise tự dựng
   * (không dùng timer, không qua mcp.call) vẫn có thể chạy nền. Dừng cứng thật
   * sự cần worker thread — chưa làm trong phạm vi này.
   */
  let cancelled = false;
  let timerSeq = 0;
  const timers = new Map<number, NodeJS.Timeout>();

  const cancelRun = () => {
    cancelled = true;
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
  };

  const hostCall = async (
    serverId: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> => {
    if (cancelled) {
      throw new Error(`Code Mode đã kết thúc hoặc quá thời gian — từ chối gọi ${serverId}/${toolName}.`);
    }
    if (!options.mcpCaller) {
      throw new Error(`MCP caller chưa được cấu hình cho Code Mode khi gọi ${serverId}/${toolName}.`);
    }
    return await options.mcpCaller(serverId, toolName, args);
  };

  const hostSetTimeout = (fn: unknown, ms?: unknown): number => {
    if (cancelled) return -1;
    if (typeof fn !== 'function') {
      throw new TypeError('setTimeout yêu cầu callback là hàm.');
    }
    const delay = Math.min(Math.max(Number(ms) || 0, 0), 2_147_483_647);
    const id = ++timerSeq;
    const handle = setTimeout(() => {
      timers.delete(id);
      if (cancelled) return;
      try {
        (fn as () => void)();
      } catch {
        /* Callback của sandbox ném lỗi là chuyện nội bộ của nó — không được làm sập host. */
      }
    }, delay);
    timers.set(id, handle);
    return id;
  };

  const hostClearTimeout = (handle: unknown): void => {
    const id = Number(handle);
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
  };

  /* Context KHÔNG nạp gì từ host. Bẫy ĐÃ ĐO BẰNG PROBE: `vm.createContext({})`
     khiến chuỗi prototype của global chạy về `Object.prototype` của HOST →
     `globalThis.constructor.constructor('return process')()` lấy được pid host
     (escape thật, xem probe-code-mode-adversarial + tests/code-mode-escape).
     Cách vá kiểm chứng được: sandbox object phải có prototype NULL, rồi gắn
     prototype chuẩn của realm SANDBOX bằng setPrototypeOf chạy TRONG context
     (sau bước này `globalThis.constructor === Object` của sandbox và mọi
     intrinsic vẫn dùng được bình thường). */
  const context = vm.createContext(Object.create(null));
  vm.runInContext('Object.setPrototypeOf(globalThis, Object.prototype)', context, {
    filename: 'code-mode-realm-fix.js',
  });

  const installBridge = vm.runInContext(SANDBOX_BRIDGE_SOURCE, context, {
    filename: 'code-mode-bridge.js',
  }) as (
    hostCall: unknown,
    hostLog: unknown,
    hostSetTimeout: unknown,
    hostClearTimeout: unknown,
  ) => void;

  installBridge(hostCall, captureLog, hostSetTimeout, hostClearTimeout);

  // Đóng gói code vào async IIFE để hỗ trợ top-level await và return
  const wrappedScript = `(async () => {\n${code}\n})()`;

  try {
    const script = new vm.Script(wrappedScript, {
      filename: 'code-mode.js',
    });

    // Thực thi script trả về Promise
    const promise = script.runInContext(context, {
      timeout: timeoutMs,
      displayErrors: true,
    }) as Promise<unknown>;

    // Chờ promise với timeout race
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Thực thi mã quá thời gian cho phép (${timeoutMs / 1000}s).`));
      }, timeoutMs);
    });

    let rawResult: unknown;
    try {
      rawResult = await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }

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
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMsg = String(err instanceof Error ? err.message : err);
    const logOutput = logs.join('\n').trim();
    const errorOutput = logOutput ? `${logOutput}\n\n[Lỗi]: ${errorMsg}` : `[Lỗi]: ${errorMsg}`;
    const { text: finalOutput, truncated } = truncateCodeOutput(errorOutput, maxChars);

    return {
      ok: false,
      output: finalOutput,
      error: errorMsg,
      durationMs,
      truncated,
    };
  } finally {
    // Hết lượt chạy (thành công, lỗi, hay quá hạn) → clear timer còn treo và
    // chặn mọi mcp.call đến muộn từ code chạy nền.
    cancelRun();
  }
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
