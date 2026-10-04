/**
 * Agentic tools cho /api/chat — model TỰ quyết khi nào cần dữ liệu ngoài
 * (pattern fx/OpenClaw): không còn đoán ý định bằng regex hay toggle thủ công.
 *
 * - web_search / web_fetch: tái dùng đúng đường ống SSRF-guarded của /api/web
 * - memory_search: tra ghi nhớ dài hạn của người dùng (chỉ đọc)
 *
 * Ba lớp tự vệ trong file này (port triết lý fx auto_classifier):
 *  1. DEDUPE/loop-guard: gọi trùng (tool + args) hoặc vượt trần số call →
 *     trả note bảo model tổng hợp thay vì thực thi lại.
 *  2. PROVENANCE: web_fetch chỉ đọc host có nguồn gốc rõ ràng (tin nhắn user,
 *     kết quả search cùng lượt) — chặn chuỗi crawl do nội dung web dẫn dụ.
 *  3. INJECTION GUARD: kết quả web mang mẫu prompt-injection rõ ràng thì bị
 *     chặn khỏi ngữ cảnh trước khi model bước sang step kế tiếp.
 *
 * Model gọi qua function calling của gateway — hầu hết provider hỗ trợ với
 * model chat hiện đại; gateway từ chối thì route tự tắt tools và thử lại
 * không tools — xem xử lý lỗi trong route.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { capHits, fetchReadablePage, searchWeb } from '@/lib/web-backend';
import { WEB_LIMITS } from '@/lib/web-context';
import { judgeInjection } from '@/lib/injection-guard';
import { getToolCallBudget, checkDoomLoop } from '@/lib/tool-call-budget';
import { TOOL_RESULT_MAX_CHARS, TOOL_PREVIEW_MAX_CHARS } from '@/lib/tool-limits';
import { redactSecretText, redactSecretsDeep } from '@/lib/secret-registry';
import { isMcpToolKey } from '@/lib/mcp/tool-mapper';
import { TOOL_CATALOG } from '@/lib/tool-catalog';
/*
 * Schema của nhóm tool Zero-Mem và Sarsed-Code lấy thẳng từ module thực thi —
 * khai báo lại ở đây sẽ lệch nhau ngay lần sửa đầu tiên.
 */
import {
  zeromemQuerySchema,
  zeromemLogSchema,
  zeromemInspectSchema,
  zeromemStatsSchema,
} from '@/lib/zeromem/tools';
import {
  codeSkeletonSchema,
  codeSymbolsSchema,
  codePatchSchema,
  codeVerifySchema,
} from '@/lib/sarsed/tools';

export type AgentToolSet = ReturnType<typeof buildAgentTools>;

export interface MemoryItem {
  id: string;
  text: string;
}

export interface AgentToolsOptions {
  memories?: MemoryItem[];
  /** Host được phép web_fetch: từ URL user gắn + kết quả search cùng lượt. */
  allowedHosts?: Iterable<string>;
  /** Tắt khi lượt hiện tại đã có webContext được người dùng yêu cầu. */
  includeWeb?: boolean;
  /**
   * Id hội thoại — khoá ngân sách gọi tool sống xuyên các resubmit của
   * client tool. Thiếu id thì rơi về hành vi cũ (đếm theo từng request).
   */
  conversationId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Tìm ghi nhớ (thuần, test được không cần Dexie)                      */
/* ------------------------------------------------------------------ */

/**
 * Tìm fact ghi nhớ khớp query — điểm số = số từ khóa xuất hiện, trả tối đa 5
 * fact tốt nhất.
 */
export function searchMemories(
  memories: MemoryItem[],
  query: string,
): Array<{ id: string; text: string }> {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .filter((w) => w.length >= 2);
  if (!words.length) return [];
  const scored = memories.map((m) => {
    const lower = m.text.toLowerCase();
    const score = words.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
    return { m, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => ({ id: s.m.id, text: s.m.text }));
}

/* ------------------------------------------------------------------ */
/* Summarizer cho UI tool-trace (annotation {tool:{...}})               */
/* ------------------------------------------------------------------ */

/** Args ngắn gọn hiển thị trên chip — KHÔNG đưa nội dung dài vào annotation. */
export function summarizeToolArgs(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  /* Tool MCP: tên đã encode server + tool, arg thì tuỳ server ngoài kia nên
     không có case riêng — gom key/value ngắn để chip có nội dung thay vì trống. */
  if (isMcpToolKey(name)) {
    return briefArgs(a);
  }
  switch (name) {
    case 'web_search':
      return String(a.query ?? '').slice(0, 80);
    case 'web_fetch':
      return shortenUrl(String(a.url ?? ''));
    case 'memory_search':
      return String(a.query ?? '').slice(0, 60);
    case 'shell_run':
      return String(a.command ?? '').slice(0, 80);
    case 'git_commit':
      return String(a.message ?? '').slice(0, 60);
    case 'git_add':
      return Array.isArray(a.paths) ? (a.paths as string[]).join(', ').slice(0, 80) : '';
    case 'git_diff':
      return String(a.path ?? (a.staged ? 'staged' : '')).slice(0, 60);
    /* Nhóm fs_*: đường dẫn là thứ duy nhất đáng đọc trên chip — nội dung
       đọc/ghi và khối SEARCH/REPLACE dài hàng trăm dòng, đưa vào chỉ là loãng. */
    case 'fs_read':
    case 'fs_edit':
    case 'fs_write':
      return String(a.path ?? '').slice(0, 80);
    /* `||` chứ không `??`: model hay gửi `path: ''` để nói "gốc workspace"
       (rỗng là hợp lệ với fs_list — xem zod schema), mà `??` không bắt được
       chuỗi rỗng → chip rơi xuống `briefArgs` và in thô `{"path":""}`. */
    case 'fs_list':
      return String(a.path || '.').slice(0, 80);
    case 'fs_search':
      return String(a.query ?? '').slice(0, 60);
    /* Sarsed-Code dùng `file_path` (không phải `path` như nhóm fs_). */
    case 'code_skeleton':
    case 'code_patch':
      return String(a.file_path ?? '').slice(0, 80);
    case 'code_symbols':
      return String(a.query ?? a.file_path ?? '').slice(0, 60);
    case 'code_verify':
      return String(a.command ?? '').slice(0, 80);
    case 'delegate': {
      /* Dạng song song truyền `tasks` (mỗi task có `instructions`), dạng đơn
         thì `instructions` ở top level — hiện cái nào thì lấy cái đó. */
      const tasks = Array.isArray(a.tasks) ? (a.tasks as Array<{ instructions?: unknown }>) : [];
      if (tasks.length) {
        return `${tasks.length} task · ${String(tasks[0].instructions ?? '')}`.slice(0, 80);
      }
      return String(a.instructions ?? '').slice(0, 80);
    }
    case 'plan_create':
      return String(a.title ?? '').slice(0, 60);
    case 'plan_update':
      return String(`${a.subtaskId ?? ''} ${a.status ?? ''}`.trim()).slice(0, 40);
    case 'skill_load':
      return String(a.name ?? '').slice(0, 60);
    case 'memory_save':
    case 'lesson_save':
      return String(a.text ?? '').slice(0, 60);
    case 'bg_run':
      return String(a.command ?? '').slice(0, 80);
    case 'bg_status':
      /* Không job_id = xem mọi job (xem mô tả tool). */
      return String(a.job_id ?? 'tất cả job');
    case 'bg_stop':
      return String(a.job_id ?? '').slice(0, 60);
    default:
      return briefArgs(a);
  }
}

/** Kết quả tóm tắt một dòng — chỉ metadata, không đem content vào annotation. */
export function summarizeToolResult(name: string, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  switch (name) {
    case 'web_search': {
      const results = Array.isArray(r.results) ? r.results : [];
      if (r.note && results.length === 0) return String(r.note);
      return `${results.length} kết quả`;
    }
    case 'web_fetch': {
      if (r.content === null || r.content === undefined) return String(r.note ?? 'Không đọc được');
      return `${String(r.title ?? '').slice(0, 70) || shortenUrl(String(r.url ?? ''))}`;
    }
    case 'memory_search': {
      const matches = Array.isArray(r.matches) ? r.matches : [];
      return matches.length ? `${matches.length} ghi nhớ khớp` : 'Không có ghi nhớ khớp';
    }
    case 'memory_save': {
      if (r.accepted === true) {
        const t = String(r.text ?? '');
        return `Chấp nhận: "${t.slice(0, 50)}${t.length > 50 ? '…' : ''}"`;
      }
      return String(r.note ?? 'Từ chối');
    }
    case 'shell_run': {
      if (typeof r.error === 'string') return r.error.slice(0, 80);
      const code = r.code;
      return code === 0 ? 'thành công' : `exit ${String(code ?? '?')}`;
    }
    case 'git_status': {
      const entries = Array.isArray((r as { entries?: unknown[] }).entries) ? (r as { entries: unknown[] }).entries : [];
      return `${entries.length} thay đổi${r.branch ? ` (${String(r.branch)})` : ''}`;
    }
    case 'git_diff':
      return typeof r === 'string' ? `${(r as string).split('\n').length} dòng diff` : 'có diff';
    case 'git_log':
      return typeof r === 'string' ? `${(r as string).split('\n').filter(Boolean).length} commit` : 'có log';
    default:
      if (typeof r.note === 'string') return r.note.slice(0, 80);
      if (typeof r.error === 'string') return (r.error as string).slice(0, 80);
      return briefShape(r);
  }
}

/**
 * THÂN kết quả tool để người dùng mở ra đọc.
 *
 * KHÁC `summarizeToolResult` ở trên, và không thay thế được nó: hàm kia trả
 * MỘT DÒNG nhãn để dán lên chip (rẻ, đi vào annotation nên phải ngắn); hàm
 * này trả phần thân người dùng bấm vào mới đọc (đắt, phải có trần — không có
 * ai mở khung 24.000 ký tự để dò một dòng log). Một hỏi khác nhau, hai hàm
 * khác nhau; gộp làm thì hoặc chip bị nhão, hoặc khung xem trước không có trần.
 *
 * Không bao giờ ném: kết quả tool đến từ model và từ bridge Electron, có thể
 * là object vòng (JSON.stringify ném TypeError), có thể có getter ném khi đọc —
 * mà lời gọi này nằm trên đường render. Lỗi ở đây không được im lặng thành
 * chuỗi rỗng (người dùng đọc rồi tưởng công cụ không trả gì), nên khi không
 * rút được thân thì trả đúng một câu nói rõ là khung xem trước hỏng.
 *
 * THÂN ĐÃ REDACT trước khi cắt: kết quả được ghi vào annotation rồi lưu xuống
 * IndexedDB và hiện cho người dùng, nên đây là chốt chặn cuối — xem
 * lib/tool-limits.ts:62-65 cho lý do redact phải ĐỨNG TRƯỚC khi cắt (cắt trước
 * sẽ chẻ đôi một khoá nằm vắt ranh giới cắt, nửa còn lại không khớp rule nào).
 */
export function toolResultBody(
  name: string,
  result: unknown,
  maxChars: number = TOOL_PREVIEW_MAX_CHARS,
): string {
  const budget = previewBudget(maxChars);
  if (budget === 0) return '';
  let body: string;
  try {
    body = redactSecretText(extractToolBody(name, result));
  } catch {
    /* Getter/Proxy ném lúc đọc trường, hoặc chính lớp redact hỏng. KHÔNG trả
       '' — nhãn trên chip (summarizeToolResult) vẫn còn, nên nói thẳng là
       phần thân hỏng hơn là để người dùng tưởng công cụ chưa chạy. */
    body = UNREADABLE_BODY;
  }
  if (body.length <= budget) return body;
  /* Không dùng truncateToolResult: hàm đó giữ 70% đầu + 25% đuôi và CỘNG thêm
     chuỗi báo cắt, nên kết quả dài hơn maxChars — ở đây maxChars là hợp đồng
     với tầng render (UI giới hạn chiều cao khung), nên cắt cứng là đủ. */
  return `${cutToGrapheme(body, budget - 1)}…`;
}

/**
 * `maxChars` là HỢP ĐỒNG với tầng render, không phải lời gợi ý — mọi giá trị
 * phải cho ra `length <= maxChars`.
 */
function previewBudget(maxChars: number): number {
  /* +Infinity là "không trần" → trả nguyên thân. NaN/-Infinity/số âm là ngân
     sách vô nghĩa; hiện rỗng còn hơn hiện sai (và giữ được bất biến trên). */
  if (maxChars === Number.POSITIVE_INFINITY) return Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(maxChars)) return 0;
  return Math.max(0, Math.floor(maxChars));
}

/** Người dùng đọc được gì từ thân khi bị cắt — không phải "cắt im lặng". */
const UNREADABLE_BODY =
  'Không đọc được phần thân kết quả của công cụ này (dữ liệu lỗi khi mở khung xem trước).';

/* ------------------------------------------------------------------ */
/* Cắt chuỗi theo ranh giới grapheme                                   */
/* ------------------------------------------------------------------ */

/*
 * `slice` của chuỗi JS cắt theo CODE UNIT: chém đôi surrogate pair (emoji thành
 * ký tự lơ lửng, hiện thành �) và tách dấu thanh khỏi chữ của nó khi chuỗi ở
 * dạng NFD. App này tiếng Việt nên đó là hỏng dữ liệu hiển thị, không phải xấu
 * xí — dùng `Intl.Segmenter` là cách duy nhất cắt đúng cả chữ+dấu, emoji có
 * skin tone/ZWJ, và cờ biểu quốc gia.
 */
const GRAPHEME_SEGMENTER =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('vi', { granularity: 'grapheme' })
    : null;

/** Dấu tổ hợp (NFD) — regex KHÔNG có cờ `g` nên `.test` không giữ trạng thái. */
const COMBINING_MARK = /\p{M}/u;

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Cắt `text` còn tối đa `limit` ký tự mà không chém rụng grapheme nào. */
function cutToGrapheme(text: string, limit: number): string {
  if (limit <= 0) return '';
  if (text.length <= limit) return text;
  if (GRAPHEME_SEGMENTER) {
    let end = 0;
    for (const { segment } of GRAPHEME_SEGMENTER.segment(text)) {
      const next = end + segment.length;
      if (next > limit) break;
      end = next;
    }
    return text.slice(0, end);
  }
  /* Runtime không có Intl.Segmenter: lùi khỏi dấu tổ hợp và nửa surrogate. */
  let end = limit;
  while (end > 0 && COMBINING_MARK.test(text[end])) end -= 1;
  if (end > 0 && isLowSurrogate(text.charCodeAt(end))) end -= 1;
  return text.slice(0, end);
}

/** Rút phần thân đọc được theo hình dạng THẬT của từng tool (xem docblock). */
function extractToolBody(name: string, result: unknown): string {
  const value = parseMaybeJson(result);
  const r = (value ?? {}) as Record<string, unknown>;

  /* Nhóm fs_*: client tool JSON.stringify trước khi trả, nhưng đường native
     (core/agent-runtime/tool-runner.ts) cũng vậy — object tới đây đã được
     parse, trường bên dưới là hình dạng do fs-access.ts / use-chat-orchestration
     dựng ra. */
  if (name === 'fs_read') {
    return (
      contentText(r.content) ||
      str(r.description) ||
      /* Đường cũ / adapter tự dựng trả nội dung file thô, không bọc object. */
      (typeof value === 'string' ? value : '')
    );
  }
  /* fs_list và fs_search trả MẢNG ở gốc, không bọc object — khác fs_read. */
  if (name === 'fs_list') {
    return listLines(value);
  }
  if (name === 'fs_search') {
    return searchMatches(value);
  }

  /* shell_run: VyenRunResult (lib/desktop-bridge.ts) — stdout + stderr là hai
     luồng RIÊNG, lệnh fail thường chỉ đổ vào stderr. */
  if (name === 'shell_run') {
    return stdoutOf(r);
  }

  /* bg_status: KHÔNG có `stdout`. `bridge.shell.bgStatus` trả
     `{ jobs: VyenBgJob[] }` và phần đuôi log nằm ở `outputTail` trên từng job
     (lib/desktop-bridge.ts) — bảng trong đề bài ghi `r.stdout` là SAI với code
     thật, đọc `stdout` sẽ ra chuỗi rỗng mọi lần gọi bg_status. */
  if (name === 'bg_status') {
    const jobs = r.jobs;
    if (!Array.isArray(jobs)) return '';
    return jobs
      .map((j) => {
        const job = (j ?? {}) as Record<string, unknown>;
        const head = `${job.id ?? '?'} (${job.status ?? '?'})`;
        const tail = str(job.outputTail);
        return tail ? `${head}\n${tail}` : head;
      })
      .filter(Boolean)
      .join('\n');
  }

  /* git_diff/git_log: KHÔNG phải raw string. Cả hai đường đều bọc trong
     object — `use-chat-orchestration.ts` trả `{ diff }` / `{ log }`,
     `executeGit` (tool-runner.ts) JSON.stringify kết quả adapter nên cũng là
     object. `summarizeToolResult` có nhánh `typeof r === 'string'` là dự phòng
     cho đường cũ; ở đây ta chấp nhận cả hai để không phụ thuộc lịch sử. */
  if (name === 'git_diff') {
    return str(r.diff) || (typeof value === 'string' ? value : '');
  }
  if (name === 'git_log') {
    return str(r.log) || (typeof value === 'string' ? value : '');
  }

  if (name === 'web_fetch') {
    return contentText(r.content);
  }
  if (name === 'web_search') {
    const results = r.results;
    if (!Array.isArray(results)) return '';
    return results
      .map((hit) => {
        const h = (hit ?? {}) as Record<string, unknown>;
        return `${str(h.title)} - ${str(h.url)}`.trim();
      })
      .filter(Boolean)
      .join('\n');
  }

  /* Tool MCP: server bên ngoài tự quyết shape. `content` là dạng phổ biến
     (MCP chuẩn, mảng khối text); không có thì JSON.stringify trong try/catch vì
     payload tùy server có thể vòng. */
  if (isMcpToolKey(name)) {
    if (typeof r.content === 'string' || Array.isArray(r.content)) {
      return contentText(r.content);
    }
    return safeStringify(r);
  }

  /* Tool chưa có nhánh riêng (memory_save, git_commit, git_status, plan_*,
     skill_load, lesson_save, code_*, delegate...): mô TẢ HÌNH DẠNG thay vì
     trả rỗng — chip "Hoàn tất" mà vùng output trống khiến người dùng tưởng
     công cụ chưa chạy. Dùng lại đúng hàm mà `summarizeToolResult` đã dùng cho
     nhánh default, nên chip và khung mở rộng không mâu thuẫn nhau. Rỗng THẬT
     (null/undefined/object không field) vẫn ra '' — không bịa nội dung. */
  return briefShape(value);
}

/**
 * Đường CLIENT không trả object — mọi tool client đều `JSON.stringify(data)`
 * trước khi trả (react/use-chat-orchestration.ts:1666 và
 * core/agent-runtime/tool-runner.ts:395), nên `result` tới đây thường là
 * CHUỖI JSON. Bóc lớp đó MỘT LẦN ở đầu thay vì mỗi nhánh tự parse.
 *
 * Không parse được (JSON hỏng, hoặc thân là chuỗi thô như nội dung file/diff)
 * thì giữ nguyên chuỗi gốc làm thân — trả '' vì "parse lỗi" là mất dữ liệu.
 */
function parseMaybeJson(result: unknown): unknown {
  if (typeof result !== 'string') return result;
  const head = result.trimStart()[0];
  /* Chỉ thử parse thứ trông như JSON; `fs_read` trả nội dung file thô có thể
     dài chẳng hạn — parse thử vô nghĩa tốn thời gian trên mỗi khung xem trước. */
  if (head !== '{' && head !== '[') return result;
  try {
    const parsed: unknown = JSON.parse(result);
    /* Chỉ nhận object/array: `"42"`/`"null"` parse ra giá trị vô dụng, giữ
       chuỗi gốc thành thân vẫn đọc được hơn. */
    return parsed !== null && typeof parsed === 'object' ? parsed : result;
  } catch {
    return result;
  }
}

/**
 * `content` chuẩn của MCP là MẢNG khối `{type:'text', text}`; đường fs/web
 * trả chuỗi thuần. Nhận cả hai — và cả trường không có gì để hiện thì để trống.
 */
function contentText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (!Array.isArray(v)) return '';
  return v
    .map((block) => {
      if (typeof block === 'string') return block;
      if (!block || typeof block !== 'object') return '';
      return str((block as Record<string, unknown>).text);
    })
    .filter(Boolean)
    .join('\n');
}

/** FsEntry[] (lib/fs-access.ts) → mỗi entry một dòng, thư mục hậu `/`. */
function listLines(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((e) => {
      /* Entry chuẩn là FsEntry {name, type:'file'|'dir'} (lib/fs-access.ts:289)
         và desktopFsList dựng đúng shape đó — nhưng adapter khác (MCP fs,
         bridge cũ) trả tên file THÔ. Một entry lạ không được làm cả danh
         sách biến mất. */
      if (typeof e === 'string') return e;
      if (!e || typeof e !== 'object') return '';
      const entry = e as Record<string, unknown>;
      const name = scalar(entry.name) || scalar(entry.path);
      if (!name) return '';
      /* `kind: 'directory'` là tên của bridge Electron (VyenFsEntry), `type`
         là tên của FSA. Chấp nhận cả hai để thư mục không lẫn với file. */
      const isDir = entry.type === 'dir' || entry.kind === 'directory';
      return `${name}${isDir ? '/' : ''}`;
    })
    .filter(Boolean)
    .join('\n');
}

/** SearchMatch[] (lib/fs-access.ts) → `path:line: text` đúng kiểu grep. */
function searchMatches(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return (value as unknown[])
    .map((m) => {
      const hit = (m ?? {}) as Record<string, unknown>;
      /* `line` là NUMBER trong SearchMatch, khác `text`/`path` là chuỗi — dùng
         `str` cho cả ba thì số dòng ra thành rỗng, thành `src/a.ts:: code`. */
      const line = typeof hit.line === 'number' ? String(hit.line) : str(hit.line);
      return `${str(hit.path)}:${line}: ${str(hit.text)}`;
    })
    .filter(Boolean)
    .join('\n');
}

function stdoutOf(r: Record<string, unknown>): string {
  const out = str(r.stdout);
  const err = str(r.stderr);
  if (out && err) return `${out}\n${err}`;
  /* `output` là tên trường phổ biến ở adapter khác (shellRunner của Sarsed,
     runner của scheduler, `git_commit` của bridge) — nhận làm luồng dự phòng
     khi stdout/stderr rỗng, thay vì trả '' cho một lệnh đã chạy xong. */
  return out || err || str(r.output);
}

/** Chỉ nhận chuỗi thật — `null`/`undefined`/số đều là "không có thân". */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Giá trị nguyên thuỷ để HIỂN THỊ — khác `str` ở chỗ số/boolean vẫn ra chữ
 * thay vì biến mất. Dùng cho trường kiểu `name` của entry, nơi mất một ký tự
 * là mất hẳn một dòng danh sách.
 */
function scalar(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    ? String(v)
    : '';
}

/** JSON.stringify không ném được; chỗ này là đường cuối trước khi render. */
function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? '';
  } catch {
    return '';
  }
}

/**
 * Nhánh default: trước đây rơi về chuỗi rỗng, chip "Hoàn tất" mà vùng output
 * trống. Chỉ mô TẢ HÌNH DẠNG kết quả (bao nhiêu phần tử / ký tự, bao nhiêu
 * field) — không suy diễn "thành công"/"x kết quả" khi chưa có bằng chứng.
 */
function briefShape(r: unknown): string {
  if (typeof r === 'string') return `${r.length} ký tự`;
  if (Array.isArray(r)) return `${r.length} phần tử`;
  if (!r || typeof r !== 'object') return '';
  const keys = Object.keys(r as Record<string, unknown>);
  if (!keys.length) return '';
  return `${keys.length} trường`;
}

/* Ngưỡng của `briefArgs` — args nén cho chip dưới dạng `key=value` ngắn. */
const BRIEF_ARG_KEYS = [
  'path', 'file', 'file_path', 'name', 'command', 'query', 'url', 'id', 'symbol', 'target',
];
const BRIEF_ARG_VAL_CAP = 40;
const BRIEF_ARG_ARRAY_CAP = 3;
const BRIEF_ARG_MAX = 3;

/** Gom vài key/value đầu tiên — bỏ giá trị to/noise, ưu tiên key trỏ tới đích. */
function briefArgs(a: Record<string, unknown>): string {
  const entries = Object.entries(a).filter(([, v]) => v !== undefined && v !== null);
  if (!entries.length) return '';
  /* Xếp key trỏ tới đích lên đầu: chip `k=v` nhiều khi hữu ích nhờ đúng giá trị
     đích, phần còn lại chỉ bổ sung cho tới khi đủ BRIEF_ARG_MAX ô. */
  const ranked = [...entries].sort(
    (x, y) => rankBriefKey(y[0]) - rankBriefKey(x[0]),
  );
  const parts: string[] = [];
  for (const [k, v] of ranked) {
    if (parts.length >= BRIEF_ARG_MAX) break;
    const brief = briefArgValue(v);
    if (brief) parts.push(`${k}=${brief}`);
  }
  return parts.join(' ');
}

/** 2 = key trỏ tới đích, 1 = tên ngắn, 0 = còn lại. */
function rankBriefKey(key: string): number {
  if (BRIEF_ARG_KEYS.includes(key)) return 2;
  return key.length <= 24 ? 1 : 0;
}

/** Một giá trị args trên chip — chuỗi cắt ngắn, mảng chỉ lấy vài phần tử đầu. */
function briefArgValue(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, BRIEF_ARG_VAL_CAP);
  if (Array.isArray(v)) {
    const head = v.slice(0, BRIEF_ARG_ARRAY_CAP).map((item) => String(item ?? ''));
    const more = v.length > BRIEF_ARG_ARRAY_CAP ? `+${v.length - BRIEF_ARG_ARRAY_CAP}` : '';
    return `${head.join(', ')}${more}`.slice(0, BRIEF_ARG_VAL_CAP);
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  /* Object lồng: kể cả khi bị cắt cũng phải bắt đầu bằng `{` để không giống
     một giá trị chuỗi thật. */
  const json = JSON.stringify(v);
  if (!json || json === '{}' || json === '[]') return '';
  return `${json.slice(0, BRIEF_ARG_VAL_CAP - 1)}…`;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    return `${u.hostname}${path}`.slice(0, 80);
  } catch {
    return url.slice(0, 80);
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Áp trần kích thước cho kết quả tool ở ĐƯỜNG NATIVE. Trước đây chỉ đường
 * emulated cắt (6k) còn native để nguyên — một web_fetch trang dài có thể
 * đẩy cả chục nghìn token vào context mà ContextMeter không kịp phản ánh.
 *
 * Cắt trên TỪNG trường string dài thay vì stringify cả object, để shape kết
 * quả (results[], content, note...) không đổi — model vẫn đọc được cấu trúc.
 */
function capToolResult(result: Record<string, unknown>): Record<string, unknown> {
  let raw: string;
  try {
    raw = JSON.stringify(result) ?? '';
  } catch {
    return { note: 'Kết quả công cụ không đọc được.' };
  }
  if (raw.length <= TOOL_RESULT_MAX_CHARS) return result;

  const out: Record<string, unknown> = {};
  let remaining = TOOL_RESULT_MAX_CHARS;
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && value.length > remaining) {
      out[key] = `${value.slice(0, Math.max(0, remaining))}\n…[đã cắt bớt vì quá dài]`;
      remaining = 0;
    } else {
      out[key] = value;
      if (typeof value === 'string') remaining -= value.length;
    }
  }
  out.truncated = true;
  return out;
}

function stableKey(name: string, args: unknown): string {
  let raw: string;
  try {
    raw = JSON.stringify(args ?? {});
  } catch {
    raw = String(args);
  }
  // Chuẩn hoá thứ tự key đã đủ vì args đến từ zod-parse của SDK (thứ tự ổn định).
  return `${name}:${raw.slice(0, 300)}`;
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export function buildAgentTools(
  memoriesOrOptions: MemoryItem[] | AgentToolsOptions = [],
) {
  const opts: AgentToolsOptions = Array.isArray(memoriesOrOptions)
    ? { memories: memoriesOrOptions }
    : memoriesOrOptions ?? {};
  const memories = opts.memories ?? [];

  /* Ngân sách theo HỘI THOẠI (không phải theo request): mỗi lần client thực
     thi fs_* xong, useChat resubmit tạo request mới — nếu đếm theo request
     thì trần và dedupe reset sạch, đúng kịch bản vòng lặp fs_list vô hạn đã
     gặp. Không có conversationId → bucket dùng-một-lần (hành vi cũ). */
  const budget = getToolCallBudget(opts.conversationId);
  const knownHosts = budget.knownHosts;
  for (const h of opts.allowedHosts ?? []) {
    const host = hostOf(h);
    if (host) knownHosts.add(host);
  }

  /**
   * Wrapper chung: đếm tổng call, chặn gọi TRÙNG (cùng tool + cùng args).
   * Trùng thì trả note hướng dẫn model tổng hợp — rẻ hơn và đoán đúng ý hơn
   * việc để nó thử lại rồi nhận y hệt kết quả cũ.
   * `errorFallback` giữ nguyên SHAPE kết quả của từng tool khi lỗi upstream
   * (vd web_search vẫn có `results: []`) — model đọc được cấu trúc ổn định.
   */
  async function guarded(
    name: string,
    args: Record<string, unknown>,
    run: () => Promise<Record<string, unknown>>,
    errorFallback: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    budget.touchedAt = Date.now();
    const key = stableKey(name, args);
    /* Loop-guard DUY NHẤT còn lại: doom-loop — cùng một (tool, args) lặp
       LIÊN TIẾP tới ngưỡng thì trả steering message buộc model đổi hướng.
       Đã gỡ dedupe "gọi trùng thì từ chối" và trần tổng call/lượt: cả hai là
       quota kiểu web-chat, chặn oan lần gọi lại HỢP LỆ (vd search lại sau khi
       ngữ cảnh đổi). Số bước vẫn bị chặn ở tầng useChat/SERVER_MAX_STEPS nên
       không mở đường vòng lặp vô hạn. */
    const doom = checkDoomLoop(budget, key);
    if (doom.triggered) {
      return {
        ...errorFallback,
        note:
          `Bạn đã gọi cùng công cụ với cùng tham số ${doom.counted} lần LIÊN TIẾP ` +
          'mà không thu được gì mới. TUYỆT ĐỐI không lặp lại. Hãy: (1) thử một công cụ ' +
          'khác, (2) đổi tham số, hoặc (3) nếu đang vướng thì nói thẳng với người dùng ' +
          'bạn vướng ở đâu và cần họ hỗ trợ gì.',
      };
    }
    try {
      /* Che bí mật Ở ĐÂY vì đây là điểm duy nhất mọi kết quả tool SERVER đi qua:
         đường native không serialize gì (SDK tự nhét kết quả vào ngữ cảnh) nên
         không có hook nào khác chặn được. Chỉ áp lên KẾT QUẢ (observation) —
         TUYỆT ĐỐI không áp lên args model sinh ra: args bị che sẽ khiến model
         viết lại đúng nội dung đã che vào file ở step sau. */
      return redactSecretsDeep(capToolResult(await run()));
    } catch {
      // Giữ hành vi cũ: lỗi network/upstream trả payload "trống + note" để
      // model tự chọn hướng đi thay vì văng exception làm đứt step.
      return { ...errorFallback, note: 'Công cụ tạm thời không khả dụng.' };
    }
  }

  const serverTools = {
    web_search: tool({
      description:
        'Tìm kiếm thông tin HIỆN TẠI trên web công khai (tin tức, giá cả, sự kiện sau thời điểm ' +
        'kiến thức của bạn). Trả về danh sách kết quả có title/url/snippet. Khi trình bày kết quả, ' +
        'luôn trích dẫn nguồn dạng [tên ngắn](url).',
      parameters: z.object({
        query: z
          .string()
          .min(1)
          .max(300)
          .describe('Cụm từ tìm kiếm — viết ngắn gọn, chứa từ khóa chính'),
        count: z.number().int().min(1).max(8).optional().describe('Số kết quả tối đa (mặc định 5)'),
      }),
      execute: async (args) =>
        guarded(
          'web_search',
          args,
          async () => {
            const { hits } = await searchWeb(args.query);
            // Host từ kết quả search trở nên HỢP LỆ để web_fetch ở step sau —
            // đây là đường provenance chính thống duy nhất.
            for (const hit of hits) {
              const host = hostOf(hit.url);
              if (host) knownHosts.add(host);
            }
            // Lọc injection trên title+snippet TRƯỚC khi trả cho model.
            const clean = hits.filter(
              (h) => judgeInjection(`${h.title}\n${h.snippet}`) !== 'block',
            );
            const results = capHits(clean, args.count ?? WEB_LIMITS.maxHits);
            return {
              results,
              ...(results.length === 0 && hits.length > 0
                ? { note: 'Mọi kết quả đều chứa mẫu prompt-injection nên đã bị lọc bỏ.' }
                : {}),
            };
          },
          { results: [] },
        ),
    }),

    web_fetch: tool({
      description:
        'Đọc nội dung văn bản của một URL public cụ thể (bài báo, tài liệu, trang chủ...). ' +
        'Chỉ đọc được trang tĩnh — không đăng nhập, không click. ' +
        'RÀNG BUỘC: URL phải xuất hiện trong kết quả web_search của cùng hội thoại hoặc do ' +
        'người dùng gửi; URL lấy từ nội dung một trang khác sẽ BỊ TỪ CHỐI. Cần đọc trang chưa ' +
        'từng thấy thì gọi web_search trước.',
      parameters: z.object({
        url: z.string().max(2048).describe('URL http(s) đầy đủ cần đọc'),
      }),
      execute: async (args) =>
        guarded(
          'web_fetch',
          args,
          async () => {
            /* Provenance check: host lạ (không nằm trong tin nhắn user hay kết
               quả search) → từ chối TRƯỚC khi fetch. Đây là hàng rào chống kịch
               bản "trang A bảo model đọc trang B" — B phải tự qua search/user. */
            const host = hostOf(args.url);
            if (!host || !knownHosts.has(host)) {
              return {
                url: args.url,
                content: null,
                blocked: 'provenance' as const,
                note:
                  'URL không có nguồn gốc rõ ràng (không nằm trong kết quả tìm kiếm hay tin nhắn ' +
                  'người dùng) nên không được đọc. Hãy tìm kiếm trước rồi mới đọc.',
              };
            }
            const page = await fetchReadablePage(args.url);
            // Injection guard trên NỘI DUNG trang — vector nguy hiểm nhất vì
            // model sẽ đọc nó ở step kế tiếp như "dữ liệu đáng tin".
            if (judgeInjection(page.content) === 'block') {
              return {
                url: page.url,
                title: page.title,
                content: null,
                blocked: 'injection' as const,
                note: 'Nội dung trang chứa mẫu prompt-injection rõ ràng nên đã bị chặn khỏi ngữ cảnh.',
              };
            }
            return {
              url: page.url,
              title: page.title,
              content: page.content,
              truncated: page.truncated,
            };
          },
          { url: args.url, content: null },
        ),
    }),

    ...(memories.length
      ? {
          memory_search: tool({
            description:
              'Tra kho GHI NHỚ DÀI HẠN mà người dùng đã yêu cầu lưu (sở thích, tên gọi, quy ước ' +
              'làm việc, ràng buộc cá nhân). CHỈ gọi khi: (a) người dùng nhắc tới thiết lập/sở ' +
              'thích cá nhân của chính họ, (b) họ hỏi "tôi đã nói gì về…", "bạn còn nhớ…", hoặc ' +
              '(c) yêu cầu cần biết quy ước riêng của họ mới làm đúng được. ' +
              'KHÔNG gọi cho câu hỏi kiến thức chung, câu hỏi về code, hay khi đã đủ thông tin ' +
              'để trả lời — kho ghi nhớ nhỏ và không liên quan tới kiến thức phổ thông.',
            parameters: z.object({
              query: z.string().min(1).max(200).describe('Từ khóa cần tra, ví dụ "ngôn ngữ ưa thích"'),
            }),
            execute: async (args) =>
              guarded(
                'memory_search',
                args,
                async () => {
                  const matches = searchMemories(memories, args.query);
                  return {
                    matches,
                    totalMemories: memories.length,
                    note: matches.length ? undefined : 'Không có ghi nhớ nào khớp.',
                  };
                },
                {},
              ),
          }),
        }
      : {}),

    /* memory_save LUÔN có mặt (kể cả khi memories rỗng — đó chính là cách
       fact đầu tiên được lưu). Execute phía server CHỈ validate và chấp nhận
       đề xuất: việc ghi thật vào IndexedDB thuộc về client (route phát
       annotation {memoryProposal}, chat-interface gọi addMemory) vì DB nằm
       trong trình duyệt của user. */
    memory_save: tool({
      description:
        'Lưu một THÔNG TIN DÀI HẠN về người dùng để các hội thoại sau nhớ lại (sở thích, tên gọi, ' +
        'quy ước làm việc, ràng buộc cá nhân). CHỈ gọi khi người dùng yêu cầu nhớ rõ ràng ("nhớ giúp ' +
        'mình...", "ghi lại...") hoặc khi họ chia sẻ fact quan trọng cần tái sử dụng. Một lần gọi = ' +
        'MỘT câu ngắn độc lập, không lưu nội dung nhạy cảm (mật khẩu, số thẻ).',
      parameters: z.object({
        text: z.string().min(4).max(400).describe('Câu ghi nhớ ngắn gọn, đứng độc lập, ví dụ "Người dùng thích code style functional TS"'),
      }),
      execute: async (args) =>
        guarded(
          'memory_save',
          args,
          async () => {
            const verdict = validateMemoryProposal(args.text, memories);
            if (!verdict.ok) {
              return {
                accepted: false,
                note: verdict.reason,
              };
            }
            // Chấp thuận KHÔNG có nghĩa là đã ghi — client mới là nơi ghi.
            return {
              accepted: true,
              text: verdict.text,
              note: undefined,
            };
          },
          { accepted: false },
        ),
    }),
  };

  /* Cờ include* CHỈ còn hiệu lực khi caller yêu cầu tường minh. Mặc định
     KHÔNG gỡ tool nữa dù lượt này đã prefetch dữ liệu: regex đoán ý định có
     thể trích sai địa điểm/truy vấn, gỡ tool đi thì model mất đường sửa sai.
     Route hiện dùng ghi chú trong system prompt thay cho việc gỡ. */
  if (opts.includeWeb === false) {
    Reflect.deleteProperty(serverTools, 'web_search');
    Reflect.deleteProperty(serverTools, 'web_fetch');
  }
  return serverTools;
}

/* ------------------------------------------------------------------ */
/* CLIENT TOOLS — agent coding trên trình duyệt                        */
/* ------------------------------------------------------------------ */

/**
 * fs_* tools KHÔNG có execute: AI SDK v4 phát tool-call rồi dừng step, client
 * (useChat onToolCall) thực thi trên File System Access API rồi tự resubmit
 * với kết quả (maxSteps phía useChat). File nằm trong máy user nên server
 * không thể — và không được phép — chạm vào.
 *
 * Chỉ hoạt động trên đường NATIVE function calling. Đường emulated lọc các
 * tool này ra (xem route) vì client-execution protocol của nó khác.
 */
/* ------------------------------------------------------------------ */
/* Manual sinh TỰ ĐỘNG từ schema thật                                  */
/* ------------------------------------------------------------------ */

/**
 * Trước đây danh mục tool được viết tay ở 3 nơi (bảng TOOL_PROTOCOL_LINES,
 * TOOLS_MANUAL trong emulated-agent, chuỗi [Tools] trong route) và đã drift
 * thật — bản emulated thiếu hẳn start_line/line_count của fs_read khiến model
 * luôn đọc full file. Giờ mọi mô tả đều sinh từ CHÍNH object tool đang chạy.
 */

/** Tên kiểu ngắn gọn cho một zod schema, phục vụ dòng `args: {...}`. */
function zodTypeName(schema: unknown): string {
  const def = (schema as { _def?: { typeName?: string; innerType?: unknown; type?: unknown } })?._def;
  switch (def?.typeName) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodArray':
      return `${zodTypeName(def.type)}[]`;
    case 'ZodObject':
      return 'object';
    case 'ZodOptional':
    case 'ZodDefault':
    case 'ZodNullable':
      return zodTypeName(def.innerType);
    default:
      return 'any';
  }
}

function isOptionalSchema(schema: unknown): boolean {
  const typeName = (schema as { _def?: { typeName?: string } })?._def?.typeName;
  return typeName === 'ZodOptional' || typeName === 'ZodDefault';
}

/** `{"path": string, "start_line"?: number}` từ schema z.object thật. */
function formatArgsSignature(parameters: unknown): string {
  const def = (parameters as { _def?: { typeName?: string; shape?: () => Record<string, unknown> } })?._def;
  if (def?.typeName !== 'ZodObject' || typeof def.shape !== 'function') return '{}';
  const shape = def.shape();
  const parts = Object.entries(shape).map(
    ([key, value]) => `"${key}"${isOptionalSchema(value) ? '?' : ''}: ${zodTypeName(value)}`,
  );
  return `{${parts.join(', ')}}`;
}

export interface ToolLikeForDocs {
  description?: string;
  parameters?: unknown;
}

/**
 * Registry dùng CHO TÀI LIỆU: chính các object tool sẽ chạy lúc runtime.
 * Server tool dựng một lần với memories giả để memory_search có mặt — chỉ
 * đọc `.description`/`.parameters` nên không chạm mạng.
 */
let docRegistryCache: Record<string, ToolLikeForDocs> | null = null;
function getDocRegistry(): Record<string, ToolLikeForDocs> {
  if (docRegistryCache) return docRegistryCache;
  docRegistryCache = {
    ...(buildAgentTools({
      memories: [{ id: '__doc__', text: '__doc__' }],
    }) as unknown as Record<string, ToolLikeForDocs>),
    ...(CLIENT_TOOL_DEFS as unknown as Record<string, ToolLikeForDocs>),
  };
  return docRegistryCache;
}

/**
 * Sinh từ TOOL_CATALOG, nguồn sự thật duy nhất. Bản viết tay trước đây đã
 * drift: thiếu delegate + bg_run/bg_status/bg_stop nên manual emulated không
 * bao giờ mô tả chúng. Ai thêm tool vào catalog là list này tự đủ.
 */
export const ALL_TOOL_PROTOCOL_NAMES: readonly string[] = Object.freeze(
  TOOL_CATALOG.map((t) => t.name),
);

/**
 * Render manual ĐẦY ĐỦ (mô tả + chữ ký args) cho các tool khả dụng.
 *
 * CHỈ dùng cho đường EMULATED: ở đó không có kênh tool-call native nên toàn
 * bộ schema phải nằm trong text. Mô tả lấy nguyên văn từ object tool đang
 * chạy nên ràng buộc (provenance của web_fetch, ngưỡng dòng của
 * fs_edit/fs_write...) luôn tới được model.
 *
 * KHÔNG dùng cho đường native: SDK đã gửi name/description/parameters qua
 * trường `tools` của API, chèn thêm manual là trả tiền token hai lần (~960
 * token mỗi request). Đường đó dùng formatToolNameList().
 */
export function formatToolProtocolManual(
  toolNames: Iterable<string>,
  /**
   * Tool không nằm trong registry tĩnh (MCP từ Electron main chẳng hạn) —
   * chúng chỉ tồn tại trong request hiện tại nên không thể cache vào
   * `docRegistryCache`.
   */
  extraRegistry?: Record<string, ToolLikeForDocs>,
): string {
  const registry = extraRegistry
    ? { ...getDocRegistry(), ...extraRegistry }
    : getDocRegistry();
  const lines: string[] = [];
  for (const name of toolNames) {
    const def = registry[name];
    if (!def) continue;
    const description = (def.description ?? '').replace(/\s+/g, ' ').trim();
    lines.push(`- ${name}: ${description} args: ${formatArgsSignature(def.parameters)}`);
  }
  return lines.join('\n');
}

/**
 * Danh sách TÊN tool kèm nhãn cực ngắn — dùng cho đường native, nơi mô tả
 * đầy đủ đã đi qua trường `tools` của API. Chỉ để nhắc model rằng những
 * capability này tồn tại và nên chủ động dùng. Nhãn lấy từ TOOL_CATALOG
 * (bản viết tay cũ thiếu delegate + bg_*).
 */
export const TOOL_SHORT_LABELS: Record<string, string> = Object.fromEntries(
  TOOL_CATALOG.map((t) => [t.name, t.shortLabel]),
);

export function formatToolNameList(toolNames: Iterable<string>): string {
  const parts: string[] = [];
  for (const name of toolNames) {
    const label = TOOL_SHORT_LABELS[name];
    parts.push(label ? `${name} (${label})` : name);
  }
  return parts.join(', ');
}

export const CLIENT_TOOL_DEFS = {
  fs_list: tool({
    description:
      'Liệt kê MỘT cấp thư mục trong workspace của người dùng (trên máy họ). Dùng để khám phá ' +
      'cấu trúc dự án từng bước. Thư mục con sắp trước file.',
    parameters: z.object({
      path: z.string().max(500).optional().describe('Đường dẫn tương đối trong workspace; rỗng = gốc'),
    }),
  }),
  fs_read: tool({
    description:
      'Đọc nội dung một FILE trong workspace của người dùng (trên máy họ). ' +
      'File TEXT (mã nguồn, cấu hình, tài liệu...): trả nội dung, tối đa 24.000 ký tự tính TỪ start_line ' +
      'trở đi; vượt trần thì kết quả có `truncated: true` — đọc tiếp bằng cách gọi lại với start_line lớn hơn. ' +
      'File ẢNH (.png/.jpg/.webp/.heic): trả `description` — bản mô tả chi tiết do model vision của Nhà cung cấp đang bật tạo (qua /api/vision), ' +
      'kèm transcribe nguyên văn mọi chữ trong ảnh; dùng để xem ảnh, screenshot, diagram trong workspace. ' +
      'Định dạng khác (PDF, font, video, file nén) bị từ chối — với PDF/tài liệu hãy bảo người dùng đính kèm vào khung chat. ' +
      'Với file text lớn, nên dùng fs_search để định vị trước rồi đọc quanh vùng đó bằng ' +
      'start_line/line_count thay vì đọc cả file.',
    parameters: z.object({
      path: z.string().min(1).max(500).describe('Đường dẫn tương đối tới file, vd "src/index.ts"'),
      start_line: z.number().int().min(1).max(1_000_000).optional().describe('Dòng bắt đầu, đánh số từ 1; mặc định 1'),
      line_count: z.number().int().min(1).max(2_000).optional().describe('Số dòng cần đọc; mặc định đọc tới trần ký tự'),
    }),
  }),
  fs_search: tool({
    description:
      'Tìm chuỗi hoặc regex trong toàn bộ file text của workspace (bỏ qua node_modules/.git/dist...). ' +
      'Trả tối đa 30 dòng khớp kèm file:dòng.',
    parameters: z.object({
      query: z.string().min(1).max(300).describe('Chuỗi hoặc regex cần tìm'),
      is_regex: z.boolean().optional().describe('Mặc định false — tìm chuỗi thường'),
    }),
  }),
  skill_load: tool({
    description:
      'Nạp NỘI DUNG đầy đủ một kỹ năng dạng SKILL.md (xem bảng [SKILLS] trong system prompt) — ' +
      'trả body SKILL.md + danh sách file phụ trong thư mục skill (tự fs_read nếu cần). ' +
      'Gọi TRƯỚC khi làm việc thuộc phạm vi kỹ năng đó; mỗi skill chỉ cần gọi MỘT lần.',
    parameters: z.object({
      name: z.string().max(60).describe('Tên skill trong bảng [SKILLS]'),
    }),
  }),
  fs_edit: tool({
    description:
      'Sửa CỤC BỘ một file ĐÃ TỒN TẠI bằng khối SEARCH/REPLACE. Người dùng LUÔN xem diff và PHẢI phê duyệt. ' +
      'BẮT BUỘC gọi fs_read TRƯỚC khi sửa — tool sẽ TỪ CHỐI nếu file chưa được đọc. ' +
      'ĐÂY LÀ LỰA CHỌN MẶC ĐỊNH cho mọi thay đổi trên file đã có — chỉ dùng fs_write khi tạo file mới ' +
      'hoặc khi phải viết lại gần như toàn bộ một file ngắn (dưới ~100 dòng). ' +
      'SEARCH phải khớp NGUYÊN VĂN và DUY NHẤT trong file, copy trực tiếp từ kết quả fs_read. ' +
      'Sửa nhiều chỗ bằng nhiều khối liên tiếp trong một lần gọi. Nếu báo không khớp thì đọc lại file ' +
      'rồi copy nguyên văn, đừng đoán. Nếu bị từ chối, đừng gửi lại y nguyên — hỏi người dùng muốn điều chỉnh gì.',
    parameters: z.object({
      path: z.string().min(1).max(500).describe('Đường dẫn tương đối tới file cần sửa'),
      blocks: z
        .string()
        .min(10)
        .max(100_000)
        .describe(
          'Một hoặc nhiều khối:\n<<<<<<< SEARCH\n(đoạn khớp NGUYÊN VĂN và DUY NHẤT, copy từ fs_read)\n=======\n(nội dung thay thế)\n>>>>>>> REPLACE\nKhông bọc code fence.',
        ),
    }),
  }),
  fs_write: tool({
    description:
      'Ghi TOÀN BỘ nội dung một file trong workspace (ghi đè nếu đã tồn tại). Người dùng LUÔN xem diff ' +
      'và PHẢI phê duyệt. File ĐÃ TỒN TẠI: BẮT BUỘC gọi fs_read TRƯỚC — tool sẽ TỪ CHỐI nếu chưa đọc. ' +
      'File >200 dòng: BỊ CHẶN ghi đè toàn bộ — PHẢI dùng fs_edit để sửa cục bộ thay vì ghi đè cả file lớn. ' +
      'CHỈ dùng khi: (a) tạo file MỚI, hoặc (b) viết lại gần như toàn bộ một file ' +
      'ngắn dưới ~100 dòng. Với file đã tồn tại và dài hơn thế, PHẢI dùng fs_edit — ghi đè cả file lớn ' +
      'dễ làm mất nội dung bạn chưa đọc tới. Nếu bị từ chối, đừng gửi lại y nguyên — hỏi người dùng muốn điều chỉnh gì.',
    parameters: z.object({
      path: z.string().min(1).max(500).describe('Đường dẫn tương đối tới file cần ghi'),
      content: z.string().max(100_000).describe('Toàn bộ nội dung file sau khi ghi'),
    }),
  }),
  // ── Desktop-only tools (chỉ chạy khi window.vyen.desktop === true) ──
  // Trên web thuần các tool này không có mặt — route lọc theo CLIENT_TOOL_NAMES
  // và chat-interface trả lỗi mạch lạc nếu thiếu bridge.
  shell_run: tool({
    description:
      'Chạy LỆNH SHELL trong workspace của người dùng (CHỈ trong Vyen desktop). Dùng để build/test/lint/chạy script. ' +
      'Người dùng LUÔN xem lệnh và PHẢI phê duyệt trước khi chạy. Lệnh chạy qua cmd.exe / sh, timeout mặc định 120s. ' +
      'OUTPUT TRUNCATION (Goose-style): output vượt 2000 dòng hoặc 50KB sẽ bị cắt, giữ phần CUỐI (chứa lỗi/thông báo quan trọng). ' +
      'Full output được lưu vào temp file, kết quả có savedTo (đường dẫn) và previewHint (hướng dẫn đọc tiếp). ' +
      'Khi thấy truncated: true, đọc full output bằng fs_read với path = savedTo ' +
      '(temp file do Vyen tự ghi — NGOẠI LỆ duy nhất fs_read đọc được ngoài workspace; dùng start_line/line_count để phân trang) ' +
      'hoặc chạy lệnh trong previewHint. ' +
      'AUTO-DEBUG: khi lệnh test/build/lint thất bại, kết quả kèm retryGuidance hướng dẫn sửa và chạy lại. ' +
      'KHÔNG dùng để đọc/ghi file → dùng fs_* cho việc đó. Trên web thuần tool này sẽ báo lỗi.',
    parameters: z.object({
      command: z.string().min(1).max(4000).describe('Lệnh shell, vd "npm test" hoặc "npm run build"'),
      cwd: z.string().max(500).optional().describe('Thư mục làm việc tương đối trong workspace, mặc định gốc'),
      timeout_secs: z.number().int().min(1).max(600).optional().describe('Timeout giây (mặc định 120, tối đa 600)'),
    }),
  }),
  git_status: tool({
    description: 'Xem trạng thái git của workspace (CHỈ trong Vyen desktop). Trả branch + danh sách file staged/unstaged.',
    parameters: z.object({}),
  }),
  git_diff: tool({
    description: 'Xem diff git của workspace (CHỈ trong Vyen desktop). Mặc định diff unstaged; staged=true để xem staged.',
    parameters: z.object({
      path: z.string().max(500).optional().describe('Đường dẫn tương đối cần diff; bỏ trống = toàn workspace'),
      staged: z.boolean().optional().describe('True = diff staged (git diff --cached)'),
    }),
  }),
  git_log: tool({
    description: 'Xem lịch sử commit git (CHỈ trong Vyen desktop).',
    parameters: z.object({
      limit: z.number().int().min(1).max(100).optional().describe('Số commit, mặc định 20'),
    }),
  }),
  git_add: tool({
    description:
      'Stage file vào git index (CHỈ trong Vyen desktop). Người dùng KHÔNG cần phê duyệt riêng — git_add an toàn. ' +
      'Chỉ stage đường dẫn người dùng đã thấy qua fs_* trước đó.',
    parameters: z.object({
      paths: z.array(z.string().min(1).max(500)).min(1).max(20).describe('Danh sách đường dẫn tương đối cần stage, vd ["src/index.ts"]'),
    }),
  }),
  git_commit: tool({
    description: 'Tạo commit git (CHỈ trong Vyen desktop). Người dùng PHẢI phê duyệt message trước khi commit.',
    parameters: z.object({
      message: z.string().min(1).max(2000).describe('Commit message'),
    }),
  }),

  /* ------------------------------------------------------------------ */
  /* Sub-task Plan — phân rã task phức tạp thành subtask trackable        */
  /* ------------------------------------------------------------------ */

  plan_create: tool({
    description:
      'Tạo PLAN phân rã task phức tạp thành các subtask nhỏ hơn. Dùng khi nhận task lớn ' +
      '(nhiều file, nhiều bước, refactor toàn bộ...). Mỗi subtask có title, mô tả ngắn, ' +
      'và danh sách file liên quan. Plan giúp bạn và người dùng theo dõi tiến độ. ' +
      'Sau khi tạo plan, bắt đầu làm từng subtask và gọi plan_update để cập nhật trạng thái.',
    parameters: z.object({
      title: z.string().min(1).max(200).describe('Tên plan, vd "Refactor auth module"'),
      subtasks: z
        .array(
          z.object({
            title: z.string().min(1).max(200),
            description: z.string().max(500).optional(),
            files: z.array(z.string().max(500)).max(10).optional(),
          }),
        )
        .min(1)
        .max(20)
        .describe('Danh sách subtask, mỗi cái có title + mô tả ngắn + file liên quan'),
    }),
  }),

  plan_update: tool({
    description:
      'Cập nhật trạng thái một subtask trong plan hiện tại. Gọi SAU KHI hoàn thành hoặc thất bại ' +
      'một subtask. Status: "in_progress" (đang làm), "done" (xong), "failed" (thất bại), "skipped" (bỏ qua).',
    parameters: z.object({
      subtaskId: z.string().min(1).max(20).describe('ID subtask, vd "st-1", "st-2"'),
      status: z.enum(['in_progress', 'done', 'failed', 'skipped']).describe('Trạng thái mới'),
    }),
  }),

  /* ------------------------------------------------------------------ */
  /* Self-Improvement Lessons — lưu bài học từ các phiên trước           */
  /* ------------------------------------------------------------------ */

  lesson_save: tool({
    description:
      'Lưu BÀI HỌC từ kinh nghiệm coding để các phiên sau không lặp lại lỗi. ' +
      'Category: "rule" (quy tắc luôn tuân theo), "pattern" (cách làm hiệu quả), ' +
      '"gotcha" (lỗi/thứ cần tránh). Gọi khi: sửa xong bug khó, phát hiện pattern tốt, ' +
      'hoặc nhận ra gotcha. Text ngắn gọn, actionable, tối đa 400 ký tự.',
    parameters: z.object({
      category: z.enum(['rule', 'pattern', 'gotcha']).describe('Loại bài học'),
      text: z.string().min(5).max(400).describe('Nội dung bài học, vd "Luôn chạy tsc --noEmit trước khi commit TypeScript"'),
    }),
  }),
  /* ------------------------------------------------------------------ */
  /* Subagent Delegation — Goose-style task delegation to isolated worker     */
  /* ------------------------------------------------------------------ */

  delegate: tool({
    description:
      'GIAO TASK cho SUBAGENT độc lập (Goose-style). Subagent chạy với context RIÊNG (không thấy lịch sử chat), ' +
      'có tools giống bạn nhưng KHÔNG thể gọ delegate (không đế quy). Dùng khi: task độc lập cần ' +
      'nhiều bước tool (refactor file, research codebase, chạy test suite...). Max turns mặc định 10, tối đa 25. ' +
      'Chạy NHIỀU TASK SONG SONG: truyền `tasks` (1-4 task, tối đa 3 chạy cùng lúc) thay vì instructions — ' +
      'kết quả trả về theo mảng đúng thứ tự. mode "scout" = chỉ đọc (không fs_write/fs_edit/shell_run) ' +
      'dùng cho research/recon; mode "worker" = đầy đủ (mặc định). context "brief" = kèm tóm tắt bối cảnh ' +
      'hội thoại cha cho subagent (dùng khi task cần hiểu bối cảnh trước đó). Subagent trả kết quả tóm tắt khi xong.',
    parameters: z.object({
      instructions: z
        .string()
        .min(10)
        .max(5000)
        .optional()
        .describe('Mô tả task chi tiết cho subagent (KHÔNG truyền cùng lúc với tasks)'),
      tasks: z
        .array(
          z.object({
            instructions: z.string().min(10).max(5000).describe('Mô tả task chi tiết'),
            max_turns: z.number().int().min(1).max(25).optional(),
            timeout_secs: z.number().int().min(30).max(600).optional(),
            mode: z.enum(['scout', 'worker']).optional(),
          }),
        )
        .min(1)
        .max(4)
        .optional()
        .describe('1-4 task chạy SONG SONG (tối đa 3 cùng lúc). Khi dùng, KHÔNG truyền instructions'),
      max_turns: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe('Số turns tối đa (mặc định 10, max 25). Áp cho mọi task nếu task không tự đè'),
      timeout_secs: z
        .number()
        .int()
        .min(30)
        .max(600)
        .optional()
        .describe('Timeout giây (mặc định 300, max 600). Áp cho mọi task nếu task không tự đè'),
      mode: z
        .enum(['scout', 'worker'])
        .optional()
        .describe('scout = chỉ đọc (recon/research), worker = đầy đủ. Mặc định worker'),
      context: z
        .enum(['fresh', 'brief'])
        .optional()
        .describe("brief = kèm tóm tắt bối cảnh phiên cha; mặc định 'fresh'"),
    }),
  }),

  /* ------------------------------------------------------------------ */
  /* Background shell — lệnh chạy NGỀM, hỏi kết quả sau                  */
  /* (port ý tưởng pi-background-tasks; process sống qua restart app)     */
  /* ------------------------------------------------------------------ */

  bg_run: tool({
    description:
      'CHẠY LỆNH NGẦM (background): lệnh chạy detached, trả jobId NGAY để bạn làm việc khác, ' +
      'không đợi lệnh xong. Dùng cho việc DÀI (test suite, build, crawl). Lệnh vẫn đi qua cơ chế ' +
      'duyệt như shell_run. Sau đó hỏi bg_status với jobId để xem tiến độ/kết quả; bg_stop để dừng. ' +
      'Không dùng cho lệnh ngắn — shell_run trực tiếp sẽ đơn giản hơn.',
    parameters: z.object({
      command: z.string().min(1).max(500).describe('Lệnh cần chạy nền (chạy tại workspace root)'),
      timeout_secs: z
        .number()
        .int()
        .min(1)
        .max(3600)
        .optional()
        .describe('Trần thời gian giây (mặc định 3600). Hết giờ lệnh bị dừng'),
    }),
  }),

  bg_status: tool({
    description:
      'XEM TRẠNG THÁI lệnh nền: có job_id → trạng thái + exit code + đuôi output của job đó; ' +
      'không có job_id → liệt kê mọi job gần nhất. Lệnh nền vẫn chạy cả khi app khởi động lại.',
    parameters: z.object({
      job_id: z.string().max(80).optional().describe('Id nhận từ bg_run; bỏ trống = liệt kê tất cả'),
    }),
  }),

  bg_stop: tool({
    description: 'DỪNG một lệnh nền đang chạy theo job_id.',
    parameters: z.object({
      job_id: z.string().min(1).max(80).describe('Id nhận từ bg_run'),
    }),
  }),

  /* ------------------------------------------------------------------ */
  /* Structured memory — port Goose remember/retrieve/remove (P1-4).     */
  /* Client tool: Dexie nằm trong trình duyệt user nên mọi CRUD chạy ở  */
  /* renderer; mirror file .vyen/memory/<category>.md ghi qua fs thường. */
  /* ------------------------------------------------------------------ */

  remember_memory: tool({
    description:
      'GHI một fact vào bộ nhớ có cấu trúc của người dùng (category + tags + scope). Dùng khi người ' +
      'dùng nói "nhớ giúp", "lưu lại quy ước", hoặc khi phát hiện ràng buộc dự án đáng nhớ. Một lần ' +
      'gọi = một fact độc lập ≤ 2.000 ký tự. is_global=true để dùng cho MỌI dự án (vd "dùng pnpm"); ' +
      'mặc định false = chỉ workspace hiện tại. KHÔNG lưu secret.',
    parameters: z.object({
      category: z.string().min(1).max(60).describe('Nhóm, vd "workflow", "lesson", "preference"'),
      data: z.string().min(4).max(2_000).describe('Nội dung fact — câu hoàn chỉnh, đứng độc lập'),
      tags: z.array(z.string().max(40)).max(8).optional().describe('Thẻ gắn để lọc sau'),
      is_global: z.boolean().optional().describe('true = mọi dự án; false = workspace hiện tại'),
    }),
  }),

  retrieve_memories: tool({
    description:
      'TRA bộ nhớ có cấu trúc theo từ khoá / category / tags. Chỉ mục (category + số lượng) có sẵn ' +
      'trong system prompt — dùng tool này khi cần NỘI DUNG cụ thể. Trả tối đa 8 entry khớp nhất.',
    parameters: z.object({
      query: z.string().max(300).optional().describe('Từ khoá tự do (fold dấu tiếng Việt)'),
      category: z.string().max(60).optional().describe('Lọc theo đúng một category'),
      tags: z.array(z.string().max(40)).max(8).optional().describe('Lọc theo tag (AND trong entry)'),
    }),
  }),

  remove_memory_category: tool({
    description:
      'XOÁ TOÀN BỘ memory của một category (chỉ category, không đụng category khác). Chỉ gọi khi ' +
      'người dùng yêu cầu xoá rõ ràng. Trả số entry đã xoá.',
    parameters: z.object({
      category: z.string().min(1).max(60).describe('Category cần xoá'),
    }),
  }),

  remove_specific_memory: tool({
    description:
      'XOÁ MỘT entry memory theo id (nhận từ retrieve_memories). Chỉ gọi khi người dùng yêu cầu xoá rõ ràng.',
    parameters: z.object({
      id: z.string().min(1).max(80).describe('Id của entry (field id trong kết quả retrieve)'),
    }),
  }),

  /* ------------------------------------------------------------------ */
  /* Chat Recall — tra cứu lịch sử hội thoại trước đây (Goose P2-8)     */
  /* ------------------------------------------------------------------ */

  chat_recall: tool({
    description:
      'TÌM KIẾM toàn bộ lịch sử các phiên trò chuyện trước đây để tra cứu thông tin, quyết định cũ, ' +
      'hoặc ngữ cảnh đã thảo luận trong quá khứ. Hỗ trợ tiếng Việt có dấu và không dấu. Trả về danh sách ' +
      'các phiên kèm trích đoạn nội dung khớp.',
    parameters: z.object({
      query: z.string().min(1).max(300).describe('Từ khóa hoặc cụm từ cần tìm trong lịch sử chat'),
      limit: z.number().min(1).max(20).optional().describe('Số kết quả tối đa cần lấy (mặc định: 5)'),
    }),
  }),

  /* ------------------------------------------------------------------ */
  /* Zero-Mem — bộ nhớ không tiêu hao token (port sarsvankelsion/zero-mem) */
  /* ------------------------------------------------------------------ */
  /*
   * Trước đây nhóm tool này chỉ tồn tại trong `lib/zeromem/tools.ts` mà KHÔNG
   * được khai báo ở đây, nên agent của app không bao giờ gọi được — README
   * quảng cáo tính năng nhưng người dùng không chạm tới. Khai báo tại đây đưa
   * chúng vào catalog thật.
   *
   * Dùng lại schema từ chính module thực thi để hai bên không lệch nhau.
   */

  zeromem_query: tool({
    description:
      'Truy xuất ngữ cảnh từ bộ nhớ Zero-Mem (0 token, chạy cục bộ): tìm trong nhật ký thô đã ghi, ' +
      'đồ thị thực thể và phân cấp episode. Dùng khi cần nhớ lại việc đã làm ở lượt/phiên trước mà ' +
      'không muốn đọc lại toàn bộ hội thoại. Ghi trước bằng zeromem_log thì truy xuất mới có dữ liệu.',
    parameters: zeromemQuerySchema,
  }),
  zeromem_log: tool({
    description:
      'Ghi một dòng nhật ký thô vào bộ nhớ Zero-Mem và tự động trích xuất thực thể + liên kết đồ thị ' +
      '(không tốn token, không gọi LLM). Gọi sau khi hoàn thành một bước quan trọng để lượt sau truy ' +
      'xuất lại được.',
    parameters: zeromemLogSchema,
  }),
  zeromem_inspect: tool({
    description:
      'Soi cấu trúc bộ nhớ Zero-Mem: quan hệ của một thực thể trên đồ thị, danh sách episode theo thời ' +
      'gian, hoặc liệt kê thực thể theo loại. Dùng để kiểm tra bộ nhớ đã ghi đúng chưa.',
    parameters: zeromemInspectSchema,
  }),
  zeromem_stats: tool({
    description:
      'Báo cáo dung lượng bộ nhớ Zero-Mem và số token LLM đã tiết kiệm được nhờ truy xuất cục bộ.',
    parameters: zeromemStatsSchema,
  }),

  /* ------------------------------------------------------------------ */
  /* Sarsed-Code — harness sửa lỗi khép kín (port sarsvankelsion/sarsed-code) */
  /* ------------------------------------------------------------------ */

  code_skeleton: tool({
    description:
      'Nén khung xương AST của một file mã nguồn: giữ nguyên imports/exports/interface/type/chữ ký hàm/' +
      'docstring, thu gọn thân hàm thành comment. Giảm 80–90% token so với đọc cả file. Dùng để khảo sát ' +
      'file dài trước khi quyết định đọc chi tiết bằng fs_read.',
    parameters: codeSkeletonSchema,
  }),
  code_symbols: tool({
    description:
      'Tra chỉ mục ký hiệu toàn workspace: hàm, lớp, interface, kiểu dữ liệu, biến — lọc theo tên, loại ' +
      'hoặc file. Dùng để định vị định nghĩa mà không phải đọc từng file.',
    parameters: codeSymbolsSchema,
  }),
  code_patch: tool({
    description:
      'Vá mã nguồn theo khối SEARCH/REPLACE một cách NGUYÊN TỬ: hoặc mọi khối áp dụng thành công, hoặc ' +
      'hoàn tác toàn bộ về trạng thái sạch. Tự căn chỉnh thụt lề và giữ nguyên kiểu xuống dòng. ' +
      'Khác fs_edit ở chỗ hỗ trợ nhiều khối all-or-nothing và có line_hint để định vị khối trùng nhau.',
    parameters: codePatchSchema,
  }),
  code_verify: tool({
    description:
      'Phân tích đầu ra thô của tsc/eslint/vitest/mypy/cargo thành chẩn đoán có cấu trúc (file, dòng, ' +
      'mã lỗi). Dùng sau khi chạy shell_run để biết chính xác lỗi nằm ở đâu thay vì đọc log dài.',
    parameters: codeVerifySchema,
  }),
} as const;

export type ClientToolSet = typeof CLIENT_TOOL_DEFS;

/** Tên các tool chạy phía client — route dùng để quyết forward part. */
export const CLIENT_TOOL_NAMES: ReadonlySet<string> = new Set(Object.keys(CLIENT_TOOL_DEFS));

/**
 * Tool client KHÔNG được khai báo TRỰC TIẾP ở đường NATIVE (function calling
 * gốc).
 *
 * `delegate` không có execute phía client — renderer không tự chạy được
 * subagent (thiếu model + khoá). Ở native, ROUTE cung cấp một bản SERVER của
 * delegate (tool() với execute → executeDelegate, xem app/api/chat/route.ts
 * + lib/subagent.ts). Set này đảm bảo def CLIENT không bị spread đè lên bản
 * server đó; đường emulated vẫn dùng def client vì loop emulated xử lý
 * delegate qua onDelegateCall.
 */
export const NATIVE_EXCLUDED_CLIENT_TOOLS: ReadonlySet<string> = new Set(['delegate']);

/* ------------------------------------------------------------------ */
/* Validate đề xuất ghi nhớ — thuần, test được                         */
/* ------------------------------------------------------------------ */

export interface MemoryVerdict {
  ok: boolean;
  /** Text đã chuẩn hóa khi ok. */
  text?: string;
  reason?: string;
}

/** Trần ký tự mỗi đề xuất — khớp MAX_MEMORY_CHARS ở db.ts. */
const MEMORY_TEXT_CHARS = 400;

export function validateMemoryProposal(
  rawText: string,
  existingMemories: MemoryItem[],
): MemoryVerdict {
  const text = (rawText ?? '').replace(/\s+/g, ' ').trim().slice(0, MEMORY_TEXT_CHARS);
  if (text.length < 4) {
    return { ok: false, reason: 'Ghi nhớ quá ngắn/không có nội dung.' };
  }
  // Không cho nội dung web/injection chui vào kho dài hạn — đây là dữ liệu
  // sống sót qua nhiều phiên nên phải sạch hơn mọi nơi khác.
  if (judgeInjection(text) === 'block') {
    return { ok: false, reason: 'Nội dung chứa mẫu prompt-injection nên bị từ chối.' };
  }
  if (existingMemories.some((m) => m.text === text)) {
    return { ok: false, reason: 'Ghi nhớ này đã tồn tại.' };
  }
  return { ok: true, text };
}
