/**
 * Agentic tools cho /api/chat — model TỰ quyết khi nào cần dữ liệu ngoài
 * (pattern fx/OpenClaw): không còn đoán ý định bằng regex hay toggle thủ công.
 *
 * - web_search / web_fetch: tái dùng đúng đường ống SSRF-guarded của /api/web
 * - weather / exchange_rates: bọc live-tools (Open-Meteo, open.er-api)
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
import { fetchRates, fetchWeather } from '@/lib/live-tools';
import { WEB_LIMITS } from '@/lib/web-context';
import { judgeInjection } from '@/lib/injection-guard';
import { getToolCallBudget, checkDoomLoop } from '@/lib/tool-call-budget';
import { TOOL_RESULT_MAX_CHARS } from '@/lib/tool-limits';
import { redactSecretsDeep } from '@/lib/secret-registry';
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
  /** Tắt riêng khi client đã lấy được dữ liệu thời tiết cho lượt này. */
  includeWeather?: boolean;
  /** Tắt riêng khi client đã lấy được tỷ giá cho lượt này. */
  includeExchangeRates?: boolean;
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
    return Object.entries(a)
      .slice(0, 3)
      .map(([k, v]) => {
        const raw = typeof v === 'string' ? v : JSON.stringify(v);
        return `${k}=${String(raw ?? '').slice(0, 40)}`;
      })
      .join(' ');
  }
  switch (name) {
    case 'web_search':
      return String(a.query ?? '').slice(0, 80);
    case 'web_fetch':
      return shortenUrl(String(a.url ?? ''));
    case 'weather':
      return String(a.location ?? '').slice(0, 60);
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
    default:
      return '';
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
    case 'weather':
      return r.report ? 'Có báo cáo thời tiết' : String(r.note ?? 'Không tra được');
    case 'exchange_rates':
      return r.rates ? 'Có bảng tỷ giá' : String(r.note ?? 'Thất bại');
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
      return typeof r.note === 'string' ? r.note.slice(0, 80) : typeof r.error === 'string' ? (r.error as string).slice(0, 80) : '';
  }
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

/**
 * Băm FNV-1a 32-bit nhanh (đủ tốt cho fingerprint phân biệt, không cần
 * crypto-grade). Trả hex 8 ký tự.
 */
function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply (dùng Math.imul để giữ 32-bit).
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Chữ ký call server — tên tool + hash TOÀN BỘ args đã serialize.
 *
 * Trước đây chỉ lấy 300 ký tự đầu của args JSON: hai lần fs_edit KHÁC NHAU
 * ở phần đuôi (block SEARCH/REPLACE sau ký tự 300) bị coi là CÙNG một call
 * → doom-loop guard chặn nhầm thao tác hợp lệ. Hash toàn bộ args giữ chữ ký
 * nhỏ gọn mà không mất khả năng phân biệt.
 */
function stableKey(name: string, args: unknown): string {
  let raw: string;
  try {
    raw = JSON.stringify(args ?? {});
  } catch {
    raw = String(args);
  }
  // Chuẩn hoá thứ tự key đã đủ vì args đến từ zod-parse của SDK (thứ tự ổn định).
  return `${name}:${fnv1a32(raw)}`;
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

    weather: tool({
      description:
        'Thời tiết hiện tại + dự báo 2 ngày theo tên nơi (thành phố, tỉnh, quốc gia). ' +
        'Dùng khi người dùng hỏi thời tiết/nhiệt độ/mưa.',
      parameters: z.object({
        location: z.string().min(1).max(80).describe('Tên nơi, ví dụ "Hà Nội", "Tokyo", "Paris"'),
      }),
      execute: async (args) =>
        guarded(
          'weather',
          args,
          async () => {
            const report = await fetchWeather(args.location);
            return report ? { report } : { report: null, note: `Không tra được thời tiết "${args.location}".` };
          },
          { report: null },
        ),
    }),

    exchange_rates: tool({
      description:
        'Tỷ giá hối đoái hôm nay, quy về gốc USD. Dùng khi người dùng hỏi tỷ giá hoặc cần quy ' +
        'đổi tiền tệ. KHÔNG nhận tham số và LUÔN trả về TOÀN BỘ bảng các đồng phổ biến ' +
        '(VND, EUR, JPY, CNY, KRW...) — tự tìm đồng cần dùng trong bảng đó rồi tính, đừng gọi ' +
        'lại nhiều lần cho từng đồng tiền.',
      parameters: z.object({}).describe('Không cần tham số'),
      execute: async (args) =>
        guarded(
          'exchange_rates',
          args,
          async () => {
            const block = await fetchRates();
            return block ? { rates: block } : { rates: null, note: 'Tra tỷ giá thất bại.' };
          },
          { rates: null },
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

  return serverTools;
}
