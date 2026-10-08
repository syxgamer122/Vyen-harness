'use client';

import React, { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  Bookmark,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileCode,
  FileEdit,
  FilePlus,
  FileText,
  Folder,
  GitBranch,
  Globe,
  ListTodo,
  Loader2,
  Plug,
  Search,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import { SubagentCard, getSubagentAnnotations } from '@/components/subagent-card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { ErrorBoundary } from '@/components/error-boundary';
import { resolveToolEntry } from '@/lib/tool-catalog';
import { stripEmulatedToolMarkup } from '@/lib/text-tool-guard';
import { sanitizeContent } from '@/lib/chat-tree-persistence';
import { toolResultBody } from '@/lib/agent-tools';
import {
  TOOL_SCOPE_LABEL,
  groupByPhase,
  toolScopeOf,
  type ToolPhaseGroup,
} from '@/lib/tool-phases';

export interface ToolEvent {
  id: string;
  name: string;
  /** true = đã có kết quả; false = đang chạy. */
  done: boolean;
  args: string;
  summary: string;
  isError?: boolean;
  /**
   * Vị trí (chỉ số ký tự) trong `message.content` mà model bắt đầu gọi tool.
   * Server gửi kèm; thiếu ở tin cũ thì chip rơi về danh sách phẳng cuối.
   */
  at?: number;
  /**
   * Nội dung THẬT của kết quả. `summary` chỉ là nhãn một dòng kiểu
   * `12 phần tử` — không phải thứ người đọc muốn xem. `body` là thứ mở ra
   * được; `summary` chỉ còn làm chữ dự phòng khi body rỗng.
   */
  body?: string;
  /**
   * Đã bắt đầu mà KHÔNG BAO GIỜ có `phase:'done'` trong khi tin nhắn chủ nó
   * đã hết stream — lượt bị dừng giữa chừng. Không có phase `'cancelled'`, nên
   * nếu không có cờ này thì chip quay về "đang chạy" và thay vì đó cứ quay
   * mãi: một trạng thái tải không có lối ra (R-27).
   */
  abandoned?: boolean;
}

interface ToolInvocationLike {
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  state?: string;
  result?: unknown;
}

/** `JSON.stringify` an toàn — args/kết quả tool từ MCP có thể là object vòng. */
function safeStringify(value: unknown, fallback: string): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return fallback;
  }
}

/** Gộp annotation tool + toolInvocations thành chuỗi sự kiện theo id.
 *  Export để test thuần (repo không có hạ tầng render DOM). */
export function collectToolEvents(
  annotations: Array<Record<string, unknown>> | undefined,
  toolInvocations: ToolInvocationLike[] | undefined,
  /**
   * Tin nhắn chủ nó còn đang stream không. Chỉ khi `false` thì tool đã bắt
   * đầu mà chưa xong mới bị gắn cờ `abandoned`; bỏ trống = chưa biết, giữ hành
   * vi cũ (coi như còn chạy) thay vì bịa ra một chip "bị bỏ dở" oan.
   */
  streaming: boolean = true,
): ToolEvent[] {
  if (!annotations?.length && !toolInvocations?.length) return [];
  const order: string[] = [];
  const byId = new Map<string, ToolEvent>();
  /*
   * Tool có invocation VÀ invocation đó chưa trả kết quả. Đây là bằng chứng
   * duy nhất cho "lượt bị dừng giữa chừng": không có invocation thì KHÔNG biết
   * tool đó ra sao, và đoán là bị bỏ dở chính là nói dối.
   *
   * Vì sao phải cần: `lib/db.ts` chỉ persist invocation ở trạng thái `result`
   * và chỉ giữ 12 cái gần nhất (STORED_TOOL_INVOCATIONS_MAX). Một lượt agent
   * dài hơn 12 tool thì các invocation cũ biến mất khỏi DB, trong khi
   * annotation `phase:'start'` vẫn còn đủ 68 cái. Đoán "chưa xong" cho chúng
   * biến một lượt chạy thành công thành 56 chip "bị bỏ dở" sau khi F5.
   */
  const pendingInvocations = new Set<ToolEvent>();
  const push = (key: string) => {
    if (!byId.has(key)) {
      byId.set(key, { id: key, name: '', done: false, args: '', summary: '' });
      order.push(key);
    }
    return byId.get(key)!;
  };

  for (const ann of annotations ?? []) {
    const tool = ann?.tool as Record<string, unknown> | undefined;
    if (!tool || typeof tool !== 'object') continue;
    const id = String(tool.id ?? '');
    const key = id || `${String(tool.name)}:${order.length}`;
    const ev = push(key);
    ev.name = String(tool.name ?? ev.name ?? '');
    if (tool.phase === 'start') {
      ev.args = typeof tool.args === 'string' ? tool.args : '';
      ev.done = false;
      if (typeof tool.at === 'number') ev.at = tool.at;
    } else if (tool.phase === 'done') {
      ev.summary = typeof tool.summary === 'string' ? tool.summary : '';
      ev.done = true;
      /* `preview` rỗng không phải body — để nó che mất `summary` thật. */
      if (typeof tool.preview === 'string' && tool.preview.trim()) ev.body = tool.preview;
      if (tool.error || tool.isError) ev.isError = true;
    }
  }

  for (const inv of toolInvocations ?? []) {
    if (!inv?.toolCallId) continue;
    const invId = String(inv.toolCallId);
    const ev = push(invId);
    if (inv.state !== 'result') pendingInvocations.add(ev);
    if (!ev.name && (inv as any).toolName) {
      ev.name = String((inv as any).toolName);
    }
    if (!ev.args && (inv as any).args !== undefined && (inv as any).args !== null) {
      if (typeof (inv as any).args === 'string') {
        ev.args = (inv as any).args;
      } else {
        /*
         * Args đến từ model/MCP, có thể là object vòng (circular) — JSON.stringify
         * ném TypeError và chết luôn dòng tin nhắn, vì ErrorBoundary ở
         * message-item.tsx chỉ bọc quanh bubble chứ không bọc quanh ToolTrace.
         * `db.ts` đã có cùng cách xử lý cho `result`; args thì chưa.
         */
        ev.args = safeStringify((inv as any).args, '[tham số không serialize được]');
      }
    }

    if (inv.state === 'result') {
      ev.done = true;
      if (typeof inv.result === 'string' && !ev.summary) {
        ev.summary = inv.result;
      }
      /*
       * Đường DUY NHẤT cho các tool client-side (`fs_*`, `code_*`): chúng không
       * phát annotation `phase:'done'` trong cùng stream nên không có
       * `preview`. Bỏ nhánh này thì kết quả của chúng vĩnh viễn rỗng.
       *
       * Đi qua `toolResultBody`, KHÔNG stringify thô: client tool trả
       * `JSON.stringify(data)` nên bỏ qua hàm đó là chip hiện một dòng JSON
       * thoát (`{"path":"a.ts","content":"…"}`) thay vì nội dung file — và
       * tệ hơn, `fs_read('.env')` dán thẳng khoá bí mật lên màn hình rồi bị
       * "Sao chép kết quả" chép nguyên văn. `toolResultBody` rút đúng thân
       * đọc được và redact trước khi cắt.
       */
      if (!ev.body && inv.result !== undefined && inv.result !== null) {
        /* Gán cả khi rỗng: `ev.body = ''` CHẶN đường lùi về `summary`, mà
           `summary` ở đây là chính chuỗi `JSON.stringify` thô. Rút không ra
           thân đọc được thì không hiện gì còn hơn hiện JSON thô chưa redact. */
        ev.body = toolResultBody(ev.name, inv.result);
      }
    }
  }

  if (!streaming) {
    for (const ev of pendingInvocations) {
      if (!ev.done) ev.abandoned = true;
    }
  }

  return order.map((k) => byId.get(k)!).filter((ev) => ev.name);
}

/** Một mảnh của lượt trả lời, đúng thứ tự model tạo ra nó. */
export type TimelineSegment =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; event: ToolEvent };

/*
 * `slice` của chuỗi JS cắt theo CODE UNIT: chém đôi surrogate pair (emoji thành
 * ký tự lơ lửng) và tách dấu thanh khỏi chữ của nó khi chuỗi ở dạng NFD. App
 * này tiếng Việt nên đó là hỏng dữ liệu hiển thị, không phải xấu xí. `Intl
 * .Segmenter` là cách duy nhất biết đâu mới là ranh giới thật — cùng công cụ
 * `lib/agent-tools.ts` dùng để cắt phần thân tool, và ở đây dùng để cắt lát
 * timeline.
 */
const GRAPHEME_SEGMENTER =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('vi', { granularity: 'grapheme' })
    : null;

/** Dấu tổ hợp (NFD) — regex KHÔNG có cờ `g` nên `.test` không giữ trạng thái. */
const COMBINING_MARK = /\p{M}/u;

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
  if (end > 0) {
    const code = text.charCodeAt(end);
    if (code >= 0xdc00 && code <= 0xdfff) end -= 1;
  }
  return text.slice(0, end);
}

/**
 * Đẩy mỗi điểm cắt về ranh giới grapheme GẦN NHẤT bên trái.
 *
 * Chỉ đẩy về TRÁI: lát cắt thụt lùi thì mọi đoạn vẫn phủ kín content và thứ
 * tự đọc không đổi, còn đẩy sang phải có thể vượt qua điểm cắt kế tiếp.
 *
 * Đọc `Intl.Segmenter` MỘT lần cho cả lượt: các điểm cắt đến tăng dần nên
 * iterator chỉ tiến; có điểm cắt lùi về sau (offset rác trong annotation cũ)
 * thì đọc lại từ đầu. Không cắt chuỗi để tìm — `content.slice(pos)` trong
 * vòng lặp là O(n²) và với content 1.000.000 ký tự thì treo tab.
 */
function makeGraphemeSnapper(source: string): (index: number) => number {
  if (!GRAPHEME_SEGMENTER) {
    return (index) => {
      let at = Math.max(0, Math.min(index, source.length));
      while (at > 0 && COMBINING_MARK.test(source[at])) at -= 1;
      const code = at > 0 ? source.charCodeAt(at) : 0;
      if (code >= 0xdc00 && code <= 0xdfff) at -= 1;
      return at;
    };
  }

  let iterator = GRAPHEME_SEGMENTER.segment(source)[Symbol.iterator]();
  let pending: string | null = null;
  let pos = 0;

  return (index) => {
    const target = Math.max(0, Math.min(index, source.length));
    if (target < pos) {
      iterator = GRAPHEME_SEGMENTER.segment(source)[Symbol.iterator]();
      pending = null;
      pos = 0;
    }
    if (target <= pos) return pos;
    while (pos < target) {
      let step = pending;
      pending = null;
      if (step === null) {
        const next = iterator.next();
        if (next.done) break;
        step = next.value.segment;
      }
      if (pos + step.length > target) {
        /* Điểm cắt nằm GIỮA grapheme này — giữ lại cho lần hỏi kế tiếp. */
        pending = step;
        break;
      }
      pos += step.length;
    }
    return pos;
  };
}

/**
 * Dựng timeline thật: lời của model và chip tool xen kẽ như Claude Code /
 * OpenCode / Codex — đọc lại lượt trả lời như đọc một dòng thời gian.
 *
 * Trả `null` khi KHÔNG event nào có `at`: đó là tin nhắn cũ, sinh trước khi
 * server bắt đầu gửi offset. Khi đó `ToolTrace` rơi về danh sách chip phẳng
 * như trước — hàm này không bao giờ cố đoán vị trí.
 */
export function buildTimeline(content: string, events: ToolEvent[]): TimelineSegment[] | null {
  const source = typeof content === 'string' ? content : '';
  const positioned = events
    .filter((e) => typeof e.at === 'number')
    .sort((a, b) => (a.at as number) - (b.at as number));
  if (positioned.length === 0) return null;

  const segments: TimelineSegment[] = [];
  /* Hai tool liền nhau sẽ cho ra `''` ở giữa — bỏ, nếu không có một lỗ hổng
     trắng vô nghĩa. Text kề nhau thì nối lại, không tách đôi. */
  const pushText = (text: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last?.kind === 'text') last.text += text;
    else segments.push({ kind: 'text', text });
  };

  const snap = makeGraphemeSnapper(source);
  let cursor = 0;
  for (const ev of positioned) {
    /*
     * `at` là chỉ số ký tự vào content thô, tức dữ liệu do server gửi và
     * không qua kiểm tra gì. Âm / vượt đuôi / NaN thì cắt tại `cursor` hiện tại
     * — mất một nhịp cắt còn hơn ném lỗi giết cả dòng tin nhắn.
     *
     * Sau đó đẩy về ranh giới grapheme: `at` rơi giữa một emoji hay giữa chữ
     * và dấu thanh (NFD) thì lát cắt sẽ mở ra một ký tự lơ lửng, và React vẽ
     * nó thành chữ vỡ. Ranh giới đúng ở đây là ranh giới ĐỌC ĐƯỢC, còn
     * invariant "ghép mọi mảnh ra đúng content" vẫn giữ vì chỉ có điểm cắt
     * dịch chứ không mất ký tự nào.
     */
    const raw = ev.at as number;
    const at = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), source.length) : cursor;
    const cut = Math.max(cursor, snap(Math.floor(at)));
    pushText(source.slice(cursor, cut));
    segments.push({ kind: 'tool', event: ev });
    cursor = cut;
  }
  /* Phần đuôi sau tool cuối là KẾT LUẬN của model — giữ nguyên, kể cả khi
     nó rỗng thì cũng không phải chuyện để cắt bớt. */
  pushText(source.slice(cursor));

  /* Tool không có `at` không được biến mất: người đọc cần bằng chứng tool đã
     chạy. Xếp cuối, giữ nguyên thứ tự gốc. */
  for (const ev of events) {
    if (typeof ev.at === 'number') continue;
    segments.push({ kind: 'tool', event: ev });
  }

  return segments;
}

/**
 * Các mảnh mà `ToolTrace` chịu trách nhiệm VẼ.
 *
 * Bubble ở `message-item.tsx` đã đưa mảnh lời ĐẦU TIÊN vào ô tròn rồi, nên
 * `ToolTrace` bắt đầu từ mảnh kế tiếp. Trước đây nó vẽ cả timeline từ 0,
 * thành ra câu mở đầu bị in hai lần, cách nhau vài dòng — lỗi người đọc thấy
 * ngay, không cần debugger.
 *
 * Cố tình KHÔNG `slice(1)` mù: khi model gọi tool trước khi kịp nói gì
 * (`at: 0`) thì mảnh đầu là TOOL, không phải lời — cắt cứng là nuốt mất chip
 * đầu tiên. Chỉ bỏ khi mảnh đầu đúng là lời.
 */
export function traceSegments(timeline: TimelineSegment[]): TimelineSegment[] {
  return timeline[0]?.kind === 'text' ? timeline.slice(1) : timeline;
}

/**
 * Một lần dựng, một kết quả cho CẢ HAI bên vẽ.
 *
 * `message-item.tsx` cần `timeline` để quyết định bubble có vẽ ô tròn không;
 * `ToolTrace` cần `events` để vẽ chip. Trước đây mỗi bên tự gọi
 * `collectToolEvents` + `buildTimeline` RIÊNG, tức mỗi token stream quét lại
 * cả lượt hai lần — đo được 3,6 ms mỗi lượt trên content 8.000 ký tự — và
 * tệ hơn: hai bên gọi khác số đối số (`ToolTrace` truyền
 * `isStreaming !== false`, còn `message-item` bỏ trống nên `collectToolEvents`
 * lấy mặc định `true`) nên cờ `abandoned` lệch nhau, lệch thì bubble và chip
 * list nói hai chuyện khác nhau về cùng một lượt.
 *
 * Ở đây chỉ có MỘT chỗ biết `abandoned` bật khi nào; hai bên cùng nhận đúng
 * một kết quả nên không thể trôi lệch nữa.
 */
export interface ToolTraceData {
  events: ToolEvent[];
  /** `null` = tin nhắn cũ, không event nào có offset `at`. */
  timeline: TimelineSegment[] | null;
}

export function buildToolTrace(
  content: string,
  annotations: Array<Record<string, unknown>> | undefined,
  toolInvocations: ToolInvocationLike[] | undefined,
  streaming: boolean,
): ToolTraceData {
  const events = collectToolEvents(annotations, toolInvocations, streaming);
  return { events, timeline: buildTimeline(content, events) };
}

/**
 * Dùng timeline CHA ĐÃ DỰNG, không dựng lại.
 *
 * Phân biệt `undefined` với `null` là cả hợp đồng: `undefined` là "chưa ai
 * dựng" (tin cũ, hoặc call site chưa nối dây) thì dựng; còn `null` là câu trả
 * lời dứt khoát "lượt này không có offset" và phải trả về y nguyên. Gộp hai
 * thứ này (`??`) thì tin nhắn cũ lại bị quét mỗi lần render — đúng cái việc
 * ta đang xoá.
 */
export function resolveTimeline(
  prebuilt: TimelineSegment[] | null | undefined,
  content: string | undefined,
  events: ToolEvent[],
): TimelineSegment[] | null {
  if (prebuilt !== undefined) return prebuilt;
  return typeof content === 'string' ? buildTimeline(content, events) : null;
}

/**
 * Nội dung ĐỂ VẼ của một mảnh lời.
 *
 * `buildTimeline` cắt trên content THÔ vì `at` là chỉ số ký tự trong bản gốc.
 * `stripEmulatedToolMarkup` lại RÚT NGẮN chuỗi, nên cắt trên chuỗi đã strip là
 * lệch mọi offset phía sau. Fixture ở `tests/tool-trace.test.ts` đo được: hai
 * khối markup làm chuỗi ngắn 90 ký tự, hai offset sau đó vượt hẳn đuôi chuỗi,
 * `buildTimeline` clamp về cuối và DỒN HẾT lời của model lên trên mọi tool —
 * vẫn ra chữ nên bằng mắt trông như hợp lệ. Vì vậy: cắt thô, dọn lúc vẽ.
 * Ở đây là lúc vẽ.
 *
 * `sanitizeContent` là cùng lớp dọn mà bubble dùng, giữ hai bên hiển thị như
 * nhau.
 *
 * Ba việc thêm, mỗi việc một lý do:
 *
 * 1. `dropCutHead` — `at` có thể rơi VÀO GIỮA một khối markup tool-call. Lớp
 *    strip chỉ khớp khối bắt đầu ở ranh giới dòng, nên khi bị cắt đôi thì cả
 *    hai nửa đều không khớp và JSON thô in thẳng lên màn hình. Nửa sau mở
 *    đầu bằng `{`/`[` — dấu vết của khối bị cắt — nên phần đó phải bị dọn
 *    trước khi lớp strip kịp nhìn thấy nó.
 * 2. `balanceFences` — cắt giữa ``` để lại fence hở, và MarkdownRenderer sẽ
 *    coi MỌI thứ còn lại của lượt là code.
 * 3. `.normalize('NFC')` — lát cắt nằm trên ranh giới grapheme nên không dấu
 *    nào bị rời khỏi chữ, nhưng chuỗi gốc vẫn có thể ở dạng NFD (macOS, nhiều
 *    editor). Ghép các mảnh đã chuẩn hoá lại phải ra đúng content đã NFC.
 */
export function displayText(raw: string): string {
  const stripped = sanitizeContent(stripEmulatedToolMarkup(dropCutHead(raw)).text);
  return balanceFences(stripped).normalize('NFC');
}

/**
 * Dấu đóng mồ côi của khối markup: `at` cắt giữa khối thì nửa sau mở đầu bằng
 * payload JSON và kết thúc bằng dấu đóng không có dấu mở.
 */
const ORPHAN_CLOSE_LINE =
  /^[ \t]*<\/(?:tool_call|tool-call|toolcall|function_call|function-call|tool_use|tooluse|invoke|\uFF5C\uFF5CDSML\uFF5C\uFF5C[a-z_]+)>[ \t]*\r?\n?/gim;

/**
 * Bỏ phần đầu mảnh khi nó là dấu vết của khối markup bị đường cắt làm đôi.
 *
 * Chỉ khi mảnh BẮT ĐẦU bằng `{`/`[` VÀ có dấu đóng mồ côi ở đâu đó phía sau:
 * đó là hình dạng duy nhất của khối markup bị `at` cắt. Lời của model bắt đầu
 * bằng chữ, còn JSON hợp lệ không mang dấu đóng mồ côi — nên không nuốt nhầm.
 *
 * Cắt tới DÁU ĐÓNG ĐẦU TIÊN chứ không phải cuối cùng: phần đằng sau có thể
 * chứa thêm một khối markup trọn vẹn, và khối đó thuộc về lớp strip.
 */
function dropCutHead(raw: string): string {
  const head = raw.trimStart();
  if (!head.startsWith('{') && !head.startsWith('[')) return raw;
  ORPHAN_CLOSE_LINE.lastIndex = 0;
  const close = ORPHAN_CLOSE_LINE.exec(head);
  ORPHAN_CLOSE_LINE.lastIndex = 0;
  return close ? head.slice(close.index + close[0].length) : raw;
}

/** Fence hở trong một mảnh: markdown sẽ nuốt hết phần còn lại của lượt. */
function balanceFences(text: string): string {
  const markers = text.match(/```/g)?.length ?? 0;
  return markers % 2 === 0 ? text : `${text}\n\`\`\``;
}

const TOOL_META: Record<string, { label: string; Icon: React.ElementType; color?: string }> = {
  // Core agent tools
  read: { label: 'read', Icon: FileText },
  write: { label: 'write', Icon: FilePlus },
  edit: { label: 'edit', Icon: FileEdit },
  bash: { label: 'bash', Icon: Terminal },
  run_command: { label: 'bash', Icon: Terminal },
  shell: { label: 'shell', Icon: Terminal },

  // Filesystem
  fs_readFile: { label: 'read', Icon: FileText },
  fs_writeFile: { label: 'write', Icon: FilePlus },
  fs_editFile: { label: 'edit', Icon: FileEdit },
  fs_listDir: { label: 'ls', Icon: Folder },
  list_dir: { label: 'ls', Icon: Folder },
  read_file: { label: 'read', Icon: FileText },
  write_to_file: { label: 'write', Icon: FilePlus },
  replace_file_content: { label: 'edit', Icon: FileEdit },

  // Web & search
  web_search: { label: 'search', Icon: Search },
  search_web: { label: 'search', Icon: Search },
  web_fetch: { label: 'fetch', Icon: FileCode },
  read_url_content: { label: 'fetch', Icon: FileCode },

  // Utilities
  memory_search: { label: 'memory', Icon: Brain },
};

/**
 * Icon cho tool KHÔNG có trong TOOL_META.
 *
 * TOOL_META và catalog phủ phần lớn toolset thật, nhưng `mcp__*` và mọi
 * tool client-side mới thêm vẫn rơi xuống đây. Trước đây tất cả những tool đó
 * nhận CÙNG một icon `Wrench`, nên phần lớn chip trong một lượt có gương mặt
 * giống hệt nhau. Suy ra icon từ TIỀN TỐ tên tool: mắt nhận ra nhóm việc
 * (đọc file / chạy lệnh / gọi MCP) trước kịp đọc nhãn.
 */
const TOOL_ICON_BY_PREFIX: ReadonlyArray<[string, React.ElementType]> = [
  ['mcp__', Plug],
  ['fs_', FileText],
  ['code_', FileCode],
  ['bg_', Activity],
  ['git_', GitBranch],
  ['plan_', ListTodo],
  ['web_', Globe],
  ['memory', Brain],
  ['lesson', Bookmark],
  ['chat_', Search],
];

/** Thứ tự ưu tiên: field nào trả lời "tool này đang làm gì" thì đứng trước. */
const DETAIL_KEYS: ReadonlyArray<string> = [
  'path',
  'filePath',
  'file_path',
  'targetFile',
  'command',
  'cmd',
  'query',
  'url',
  'name',
  'title',
  'instructions',
  'message',
  'text',
];

const DETAIL_MAX = 120;

/** JSON.parse mà không ném lỗi; `ok:false` nghĩa là chuỗi không phải JSON. */
function tryParseJson(text: string): { ok: boolean; value: unknown } {
  const first = text[0];
  if (first !== '{' && first !== '[') return { ok: false, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, value: undefined };
  }
}

/**
 * Rút tham số đọc được từ args của tool, hoặc `null` nếu không có gì để rút.
 *
 * Args là JSON (`{"path":"src/a.ts"}`). Trước đây điều kiện lấy field là
 * `if (parsed.path || …)`, nên `''` bị coi như không có rồi rơi xuống
 * `return text` — in thẳng JSON thô lên chip. Đây là bản soát danh sách khoá
 * có thứ tự, chỉ nhận giá trị KHÔNG RỔNG, và không bao giờ trả JSON thô.
 *
 * Chip là MỘT dòng nên còn hai luật nữa: `trim()` TRƯỚC khi dò JSON (client
 * tool gửi kèm khoảng trắng, dò `text[0]` trên chuỗi chưa trim thì JSON hợp
 * lệ rơi xuống nhánh "in nguyên văn"), và gộp mọi khoảng trắng — `\n` trong
 * args làm chip cao thêm dòng và phá thẳng cột dọc của timeline.
 */
export function formatToolDetail(text: string): string | null {
  const source = typeof text === 'string' ? text.trim() : '';
  if (!source) return null;
  let detail = source;
  const parsed = tryParseJson(source);
  if (parsed.ok) {
    /* JSON không phải object (mảng, số) cũng không in thô — in ra `[1,2]`
       trên chip cũng vô nghĩa y như `{"path":""}`. */
    if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
      return null;
    }
    const record = parsed.value as Record<string, unknown>;
    let found: string | null = null;
    for (const key of DETAIL_KEYS) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        found = value;
        break;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        found = String(value);
        break;
      }
    }
    if (!found) return null;
    detail = found;
  } else if (isTruncatedJson(source)) {
    /* `{`/`[` mở ra, không đóng, và có dấu nháy bên trong: đó là JSON bị stream
       cắt cụt. In nửa vỡ của nó lên chip chỉ là rác — trả `null` để chip rơi
       về nhãn tool. KHÔNG nuốt `{không phải json` (không có dấu nháy): đó là
       lệnh shell, không phải JSON. */
    return null;
  }

  const single = detail.replace(/\s+/g, ' ').trim();
  if (!single) return null;
  return single.length > DETAIL_MAX
    ? `${cutToGrapheme(single, DETAIL_MAX - 1)}…`
    : single;
}

/** `{`/`[` mở mà không đóng, và có dấu nháy → JSON bị cắt cụt, không phải lệnh. */
function isTruncatedJson(text: string): boolean {
  if (!/^[[{]/.test(text)) return false;
  const opens = text.match(/[[{]/g)?.length ?? 0;
  const closes = text.match(/[\]}]/g)?.length ?? 0;
  return opens !== closes && text.includes('"');
}

/**
 * Khối `max-h-60` cao 240px, mỗi dòng ~16px → 15 dòng vừa khung. Số dòng còn
 * lại là thứ ĐỌC ĐƯỢC, khác với dấu `…` trần: người đọc biết chính xác mình
 * đang bị giấu bao nhiêu thay vì phải đoán.
 */
const PREVIEW_LINES = 240 / 16;

/** Số dòng khối đang thu gọn giấu đi (0 = không giấu gì). */
export function hiddenLineCount(body: string): number {
  if (!body) return 0;
  return Math.max(0, body.split('\n').length - PREVIEW_LINES);
}

/**
 * Hai event NHƯ NHAU thì chip vẽ ra y hệt — và mỗi lượt có hàng chục chip.
 *
 * Không có hàm này thì mỗi token stream dựng lại toàn bộ danh sách chip, mà
 * thân chip cắt chuỗi kết quả (`split('\n')`) cho từng cái: đo được 1,25 ms
 * cho 68 chip mỗi token, lớn hơn cả lần dựng timeline. Còn khi tool đã xong
 * từ lâu, dữ liệu của nó không đổi một byte nào suốt phần còn lại của lượt.
 *
 * So SÂU THEO TRƯỜNG, không so tham chiếu: `buildToolTrace` tạo object mới mỗi
 * lần gọi nên `ev` luôn khác tham chiếu, dù dữ liệu không đổi.
 */
export function sameToolEvent(a: ToolEvent, b: ToolEvent): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.done === b.done &&
    a.args === b.args &&
    a.summary === b.summary &&
    a.body === b.body &&
    a.at === b.at &&
    Boolean(a.isError) === Boolean(b.isError) &&
    Boolean(a.abandoned) === Boolean(b.abandoned)
  );
}

/*
 * LOẠI TOOL — quyết định CÁCH TRÌNH BÀY, không quyết định nội dung.
 *
 * §15.2 điểm 7: "không dùng một khuôn chung cho tất cả". Ba nhóm dưới đây là
 * ba câu trả lời khác nhau cho câu hỏi "tool này vừa cho thấy gì": sửa tệp thì
 * con số đáng đọc là số dòng thay đổi; chạy lệnh thì là lượng đầu ra; đọc/tìm
 * thì là lượng thứ đã lấy về. Nhóm theo TIỀN TỐ TÊN TOOL (dữ liệu có thật),
 * không đoán theo nội dung đầu ra.
 */
export function toolKindOf(name: string): 'edit' | 'run' | 'read' {
  const n = (name || '').toLowerCase();
  if (/fs_edit|fs_write|apply_patch|edit_file|write_file|code_patch|multiedit/.test(n)) return 'edit';
  if (/shell|bash|exec|command|spawn|git_commit|npm|yarn|pnpm|test|build|lint/.test(n)) return 'run';
  return 'read';
}

/**
 * QUY MÔ của một lần gọi — vế "bao nhiêu" trong dòng gọn (§15.2 điểm 6+7).
 *
 * Đếm trên ĐẦU RA ĐANG HIỂN THỊ (`ev.body ?? ev.summary`), không parse nội
 * dung để đoán "N file" / "N test pass": số dòng chia được là đúng số dòng
 * người dùng mở ra sẽ thấy, nên nó không nói dối kể cả với tệp lạ, tool lạ hay
 * đầu ra thù địch. Con số sai trong một dòng trông rất chắc chắn — đó là lý do
 * duy nhất để chọn cách đếm được. Hàm thuần, export cho test.
 */
export function toolScaleOf(ev: ToolEvent): string | null {
  const output = ev.body ?? ev.summary ?? '';
  if (!output.trim()) return null;
  const lines = output.split('\n');
  const kind = toolKindOf(ev.name);
  if (kind === 'edit') {
    let added = 0;
    let removed = 0;
    for (const line of lines) {
      /* Bỏ dòng tiêu đề của diff (`+++ b/tệp`, `--- a/tệp`) — đếm chúng thành
         thay đổi thật là thổi số lên đúng 2 dòng mỗi tệp. */
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+')) added += 1;
      else if (line.startsWith('-')) removed += 1;
    }
    if (added || removed) return `+${added} −${removed}`;
    return `±${lines.length} dòng`;
  }
  if (kind === 'run') return `${lines.length} dòng ra`;
  return `${lines.length} dòng`;
}

/**
 * THỜI GIAN CHẠY — chỉ khi chip TỰ THẤY tool chuyển từ đang chạy sang xong.
 *
 * Annotation không mang mốc thời gian (`collectToolEvents` chỉ đọc `phase`,
 * `args`, `summary`, `at`), nên KHÔNG có cách nào biết một tool đã chạy bao lâu
 * khi mở lại lịch sử. Đo bằng đồng hồ của chính chip thì đúng cho phần đang
 * diễn ra trước mắt — và chỉ cho phần đó: chip mount ra ở trạng thái đã xong thì
 * không có mốc bắt đầu, in `0,1s` là bịa. Vì vậy `armed` chỉ bật sau khi ta
 * từng thấy nó đang chạy.
 *
 * Không có vòng tick mỗi giây: số chỉ được tính MỘT lần, lúc tool kết thúc —
 * chip nào cũng vừa render lại lúc đó rồi.
 */
function useElapsed(running: boolean, done: boolean): string | null {
  const startedRef = useRef<number | null>(null);
  const armedRef = useRef(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    if (running) {
      armedRef.current = true;
      if (startedRef.current === null) startedRef.current = Date.now();
      return;
    }
    if (armedRef.current && done && startedRef.current !== null) {
      setElapsed(Date.now() - startedRef.current);
      armedRef.current = false;
    }
  }, [running, done]);

  if (elapsed === null) return null;
  const seconds = elapsed / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

/**
 * DÒNG TIÊU ĐỀ CỬA MỘT ĐOẠN PHASE (§14.3 lớp 5, §15.2 điểm 8).
 *
 * Vì sao là chữ trên nền chứ không phải một dải có nền riêng: §15.3 điểm 13
 * cấm khắc phục phân cấp bằng cách thêm viền và nền khắp nơi; ở đây nhóm đã
 * được phân biệt bằng VỊ TRÍ (đứng trước cả cụm) và thứ tự đọc. Con số đi kèm
 * là số lần gọi trong đoạn — thông tin phụ, cỡ `meta`.
 *
 * "N lỗi" chỉ hiện khi đoạn THẬT SỰ có lần gọi lỗi: một dòng `0 lỗi` trên mọi
 * đoạn là nhiễu, và dễ bị đọc thành lời trấn an.
 */
const ToolPhaseBand = memo(function ToolPhaseBand({
  group,
}: {
  group: ToolPhaseGroup<ToolEvent>;
}) {
  return (
    <div
      className="flex items-center gap-2 pt-3 pb-1 font-sans text-meta text-tertiary"
      data-testid="tool-phase"
      data-tool-phase={group.phase}
    >
      <span className="text-secondary">{group.label}</span>
      <span className="tabular-nums">{group.count} thao tác</span>
      {group.errorCount > 0 && <span className="text-danger">{group.errorCount} lỗi</span>}
    </div>
  );
});

/** Chip là ĐƯỜNG MỘT, mọi thứ bên ngoài nó (khoảng cách, viền) do cha quyết. */
const ToolChip = memo(function ToolChip({ ev }: { ev: ToolEvent }) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const meta = TOOL_META[ev.name];
  // Mô tả tooltip lấy từ catalog (khớp cả tên di sản như read/bash qua alias),
  // nhãn fallback cũng theo catalog để chip lạ vẫn đọc được tiếng Việt.
  const catalogEntry = resolveToolEntry(ev.name);
  // Icon tra sẵn ở module scope: `react-hooks/static-components` chặn việc gọi
  // hàm trả về component bên trong thân render, vì mỗi lần chip render lại sẽ
  // là một type component mới → remount cây con. Ở đây chỉ tra bảng Module tĩnh.
  const Icon = meta?.Icon ?? TOOL_ICON_BY_PREFIX.find(([p]) => ev.name.startsWith(p))?.[1] ?? Wrench;
  const label = meta?.label ?? catalogEntry?.shortLabel ?? ev.name;

  const displayParam = formatToolDetail(ev.args);
  const output = ev.body ?? ev.summary;
  const hasBody = Boolean(output && output.trim());
  const failed = Boolean(ev.isError);
  /* `abandoned` = đã bắt đầu mà lượt đã dừng giữa chừng. Không có nó thì chip
     quay về "đang chạy" mãi — trạng thái tải không có lối ra (R-27). */
  const abandoned = Boolean(ev.abandoned);
  const running = !ev.done && !abandoned;

  const body = output ?? '';
  const hidden = hiddenLineCount(body);
  const shown = showAll ? body : body.split('\n').slice(0, PREVIEW_LINES).join('\n');

  /*
   * Trạng thái phải nằm trong TÊN phần tử, không chỉ trong màu hay trong icon
   * `aria-hidden` — nếu không, người đọc bằng screen reader không biết tool
   * đang chạy, đã lỗi hay bị bỏ dở (R-25).
   */
  const statusLabel = failed
    ? 'lỗi'
    : abandoned
      ? 'bị bỏ dở'
      : running
        ? 'đang chạy'
        : 'xong';
  const ariaLabel = [label, displayParam, statusLabel].filter(Boolean).join(', ');

  const onCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [body]);

  /* Sắc + bề mặt của trạng thái, kèm hover RIÊNG cho từng trạng thái. Không
     gộp một `hover:` chung: bấm rê lên chip lỗi mà nền đổi sang xám là mất
     luôn dấu hiệu lỗi đúng lúc người đọc đang nhìn. */
  /*
   * §14.3 lớp 4: ĐƯỜNG TRẠNG THÁI BÊN TRÁI — tín hiệu thứ hai ngoài màu, và
   * nay có mặt ở CẢ BỐN trạng thái. Trước đây chỉ lỗi/bỏ dở mới có vạch, nên
   * mắt phải đọc chữ ở cuối dòng mới biết một tool đang chạy hay đã xong —
   * đúng lúc danh sách dài, đó là khác biệt duy nhất giữa hai thứ rất khác nhau.
   * Mỗi trạng thái một màu vạch, và chữ trạng thái vẫn luôn đi kèm (§6).
   */
  const tone = running
    ? 'lift-sm rounded-lg border-l-2 border-l-accent bg-raised pl-2 text-secondary'
    : failed
      ? 'rounded-lg border-l-2 border-l-danger bg-danger/5 pl-2 text-danger hover:bg-danger/10'
      : abandoned
        ? 'rounded-lg border-l-2 border-l-warning bg-warning/5 pl-2 text-warning hover:bg-warning/10'
        : 'rounded-lg border-l-2 border-l-subtle pl-2 text-tertiary hover:bg-sunken hover:text-secondary';
  const layout = 'flex w-full items-center gap-2 px-2 py-1 text-left';

  /*
   * Màu của NHÃN TRẠNG THÁI (chữ, ở đuôi dòng). Chỉ là lớp thứ hai — nhãn đã
   * là chữ nên màu không mang thông tin một mình (§6). Chọn theo đúng bảng
   * §15.5: đang chạy → accent, lỗi → danger, bị bỏ dở → warning, xong →
   * tertiary (xong KHÔNG được đội lốt thành công — "xong" chỉ nói lệnh đã kết
   * thúc, không nói kết quả đúng).
   */
  const statusTone = failed
    ? 'text-danger'
    : abandoned
      ? 'text-warning'
      : running
        ? 'text-accent'
        : 'text-tertiary';
  const scale = toolScaleOf(ev);
  const elapsed = useElapsed(running, ev.done);
  /* Phạm vi là thông tin của THẺ (lớp 1 §14.3), không phải của dòng gọn: dòng
     gọn đã có tham số chỉ thẳng tệp/lệnh ngay cạnh nhãn (§15.2 điểm 6). */
  const scope = toolScopeOf(ev.name, ev.args);

  /* Thân dùng chung cho cả hai nhánh bên dưới: cùng bố cục, chỉ khác cách
     tương tác — tách riêng thì hai nhánh sẽ trôi khỏi nhau sau vài lần sửa. */
  const inner = (
    <>
      {/* Ô icon cố định bề rộng: cả cột icon thẳng hàng, mắt quét dọc
          không bị vỡ vì mỗi chip một độ dài nhãn khác nhau, và việc đổi
          trạng thái không đẩy dòng. */}
      <span className="flex w-5 shrink-0 items-center justify-center">
        {running ? (
          <Loader2 size={11} className="animate-spin text-accent" />
        ) : failed ? (
          <XCircle size={11} className="text-danger" />
        ) : abandoned ? (
          <AlertTriangle size={11} className="text-warning" />
        ) : (
          <Icon size={11} className="text-tertiary" />
        )}
      </span>

      <span className="min-w-0 truncate">
        {label}
        {/*
         * Tham số là CHỮ MÁY (đường dẫn, lệnh, pattern) nên giữ mono; nhãn
         * hành động đứng trước nó thì không — xem DESIGN.md §13.2. Trước đây
         * cả dòng chip là mono nên mọi loại tool đọc giống hệt nhau.
         */}
        {displayParam ? (
          <span className="font-mono text-tertiary"> · {displayParam}</span>
        ) : null}
      </span>

      {/*
       * BA THỨ Ở ĐUÔI DÒNG GỌN, đúng thứ tự đọc của §15.2 điểm 6
       * (`Đọc cấu hình build · 8 file · đang chạy · 2,4s`):
       *
       *   quy mô   — "bao nhiêu", tính từ đầu ra THẬT SỰ đang hiển thị
       *              (`toolScaleOf`), không phải con số đoán từ nội dung
       *   thời gian — đo bằng đồng hồ của chính lần chạy này, chỉ khi chip tự
       *              thấy tool chuyển từ đang chạy sang xong; mở lại lịch sử thì
       *              không có số nào để bịa (xem `useElapsed`)
       *   trạng thái — CHỮ, không chỉ icon hay màu (§6: ý nghĩa không được chỉ
       *              dựa vào màu). Đây là nhãn DUY NHẤT trùng bảng §15.5.
       */}
      <span className="ml-auto flex shrink-0 items-center gap-2 pl-2">
        {scale ? <span className="tabular-nums text-tertiary">{scale}</span> : null}
        {elapsed ? <span className="tabular-nums text-tertiary">{elapsed}</span> : null}
        <span className={statusTone}>{statusLabel}</span>
        {hasBody && (
          <span className="text-tertiary" aria-hidden>
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </span>
        )}
      </span>
    </>
  );

  return (
    /* Dòng gọn của tool là CHROME (nhãn hành động + trạng thái) nên là Inter;
       chữ máy — tham số, lệnh, log — tự khai mono tại chỗ. DESIGN.md §13.2. */
    <div className="font-sans text-meta">
      {/*
       * KHÔNG có gì để mở thì KHÔNG vẽ nút.
       *
       * Nút bấm không bấm được là điều hướng sai: rê chuột đổi nền, trỏ chuột
       * nhọn, bàn phím Tab dừng lại — rồi bấm không có gì xảy ra. `disabled`
       * cũng không phải câu trả lời (bàn phím bỏ qua phần tử disabled, nên
       * người đọc bằng bàn phím mất luôn dấu vết tool đã chạy). Nên phần tử ở
       * nhánh này là văn bản thuần, giữ đúng bố cục để cột chip không bị vỡ.
       */}
      {hasBody ? (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={ariaLabel}
          title={catalogEntry?.description}
          className={`${layout} transition-colors ${tone}`}
        >
          {inner}
        </button>
      ) : (
        <div aria-label={ariaLabel} title={catalogEntry?.description} className={`${layout} ${tone}`}>
          {inner}
          {/* Trạng thái VIẾT RA, không chỉ tô màu. Ở nhánh này không có tên
              phần tử để bám nhãn (aria-label trên `div` trần là thuộc tính bị
              cấm với vai `generic`, nên screen reader không bảo đảm đọc), và
              "đang chạy" hay "bị bỏ dở" là tin người đọc CẦN, không phải
              phần trang trí. "xong" thì không ghi: đó là trạng thái mặc
              định, đọc ra được từ việc không có gì để mở. */}
          {statusLabel !== 'xong' && (
            <span className="ml-auto shrink-0 pl-2">{statusLabel}</span>
          )}
        </div>
      )}

      {expanded && hasBody && (
        /*
         * `lift-md` + `bg-base`, KHÔNG `.well`: `.well` là bóng chìm dành cho ô
         * NHẬP (DESIGN.md §5.3), còn đây là khối đọc — dùng bậc "panel" thì
         * đúng vai. `bg-base` là token DESIGN.md gán cho mã/đầu ra; `bg-sunken`
         trước đây trùng nền trang nên viền `border-subtle` bên trong gần như
         không thấy.
         */
        <div className="lift-md mt-1 rounded-lg bg-base p-3">
          {/* "Xem đủ" chỉ hiện khi thật sự bị cắt: nút mở thêm mà không còn
              gì để mở thì là nói dối người đọc. */}
          <div className="flex items-center justify-between gap-2 pb-1.5">
            {/* Phạm vi đứng cạnh lượng còn lại: hai thông tin phụ của cùng một
                hàng, không tranh chỗ với nội dung đang đọc. */}
            <span className="flex min-w-0 items-center gap-2 truncate text-meta text-tertiary">
              <span data-testid="tool-scope">{TOOL_SCOPE_LABEL[scope]}</span>
              <span>{hidden > 0 ? `còn ${hidden} dòng nữa` : null}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  className="text-ui text-accent transition-colors hover:text-primary"
                >
                  {showAll ? 'Thu gọn' : 'Xem đủ'}
                </button>
              )}
              <button
                type="button"
                onClick={onCopy}
                className="flex items-center gap-1 text-ui text-tertiary transition-colors hover:text-secondary"
              >
                {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
                <span>{copied ? 'Đã sao chép' : 'Sao chép kết quả'}</span>
              </button>
            </span>
          </div>
          {/* Mở đủ vẫn phải có trần: khối cao hơn viewport làm trang nhảy. */}
          {/*
           * Đầu ra thô (stdout/stderr/payload) là chữ MÁY: giữ mono kể cả khi
           * vỏ chip đã chuyển sang sans — đây là thứ người dùng soi từng ký tự,
           * và cột ký tự thẳng hàng mới đọc được.
           */}
          <pre
            className={`overflow-y-auto whitespace-pre-wrap border border-subtle p-2 font-mono text-secondary ${
              showAll ? 'max-h-[70vh]' : 'max-h-60'
            }`}
          >
            {shown}
          </pre>
        </div>
      )}
    </div>
  );
},
/*
 * Bỏ qua lần vẽ lại khi dữ liệu của chip không đổi — kể cả khi object event là
 * object MỚI. `memo` bỏ qua thì không render lại, mà `useState` bên trong vẫn
 * giữ: chip đang mở không bị gập lại mỗi khi model gõ thêm một từ.
 */
(prev, next) => sameToolEvent(prev.ev, next.ev));

export const ToolTrace = memo(function ToolTrace({
  annotations,
  toolInvocations,
  content,
  isStreaming,
  events: prebuiltEvents,
  timeline: prebuiltTimeline,
}: {
  annotations?: Array<Record<string, unknown>>;
  toolInvocations?: ToolInvocationLike[];
  /**
   * `message.content` THÔ của tin nhắn — offset `at` là chỉ số ký tự trong bản
   * gốc, nên đưa vào chuỗi đã strip là lệch mọi vị trí sau khối bị xoá.
   * Chỉ đọc khi phải tự dựng (thiếu `timeline`); có `timeline` truyền vào thì
   * chuỗi này không được đụng tới.
   */
  content?: string;
  /**
   * `events` + `timeline` do `message-item.tsx` dựng SẴN rồi truyền xuống:
   * nó cần timeline cho bubble nên dựng một lần, để ở đây tự dựng thêm lần
   * nữa là quét lại cả lượt ở MỖI token lúc stream, và lệch `abandoned` với
   * bubble là câu chuyện hai bên nói khác nhau về cùng một lượt.
   *
   * Thiếu cả hai (tin cũ, chưa ai nối dây) thì tự dựng như trước — cùng một
   * đường dựng, không phải nhánh nào khác.
   */
  events?: ToolEvent[];
  timeline?: TimelineSegment[] | null;
  /**
   * Tin nhắn chủ nó còn đang stream không — `false` là tín hiệu DUY NHẤT cho
   * biết một tool đã bắt đầu mà không bao giờ xong (lượt bị dừng giữa chừng;
   * không có phase `'cancelled'` để nói việc đó). Bỏ trống = chưa biết, coi
   * như còn chạy — thà hiện "đang chạy" quá thì còn hơn bịa ra chip "bị bỏ
   * dở" oan.
   */
  isStreaming?: boolean;
}) {
  /*
   * `??` ở đây CỐ Ý khác `resolveTimeline`: thiếu `events` là chưa ai dựng,
   * nên tự dựng; còn `timeline` phải phân biệt `null` (không có offset) với
   * `undefined` (chưa dựng) — xem `resolveTimeline`.
   */
  const events =
    prebuiltEvents ?? collectToolEvents(annotations, toolInvocations, isStreaming !== false);
  /*
   * ĐOẠN PHASE (§14.3 lớp 5, §15.2 điểm 8) — cắt từ CHÍNH mảng sự kiện đang vẽ,
   * nên nhóm không thể lệch với chip: cả hai đọc chung một dữ liệu. Cắt trên cả
   * mảng (không cắt theo từng đoạn lời) là cố ý: một đoạn `Thực hiện` vẫn là một
   * đoạn kể cả khi model viết vài câu xen giữa hai lần gọi tool.
   */
  const phaseGroups = useMemo(() => groupByPhase(events), [events]);
  const bandByEventId = useMemo(() => {
    const map = new Map<string, ToolPhaseGroup<ToolEvent>>();
    for (const group of phaseGroups) {
      const first = group.events[0];
      if (first) map.set(first.id, group);
    }
    return map;
  }, [phaseGroups]);

  const subagentAnns = getSubagentAnnotations(annotations);
  if (events.length === 0 && subagentAnns.length === 0) return null;

  const timeline = resolveTimeline(prebuiltTimeline, content, events);
  /* Bỏ mảnh lời đầu vì bubble đã vẽ nó rồi — xem `traceSegments`. */
  const owned = timeline ? traceSegments(timeline) : null;

  return (
    <>
      {subagentAnns.map((ann, i) => (
        <SubagentCard key={i} annotation={ann} />
      ))}

      {/*
       * Cột THẲNG với chữ trả lời. Từ đợt P1 (§15.1 điểm 2), trợ lý KHÔNG còn
       * khung và avatar chỉ hiện ở tin mở khối, nên cột chữ bắt đầu ngay sau
       * `avatar 26px + gap-2 (8px)` = **34px**; đệm 16px của hộp cũ đã bị gỡ cùng
       * hộp. Trước đây trace là mảnh rời không vỏ nên mọi đoạn xen kẽ bắt đầu ở
       * 0 và nhãn chip ở ~8px — một lượt có câu mở đầu lệch vài chữ, câu sau
       * thẳng cột, đọc như lỗi căn chỉnh chứ không phải lựa chọn bố cục.
       * Đổi bố cục câu trả lời thì phải đổi ĐÚNG con số này.
       */}
      <div className="pl-[34px]">
        {owned
          ? owned.map((seg, i) => {
              if (seg.kind === 'tool') {
                /* Tiêu đề đoạn mở ở chip ĐẦU TIÊN của đoạn đó — cùng một chip,
                   hai lớp thông tin: đoạn đang làm gì, rồi việc cụ thể. */
                const band = bandByEventId.get(seg.event.id);
                return (
                  <React.Fragment key={seg.event.id}>
                    {band && <ToolPhaseBand group={band} />}
                    <ToolChip ev={seg.event} />
                  </React.Fragment>
                );
              }
              const shown = displayText(seg.text);
              /* Mảnh toàn markup rác dọn ra thành chuỗi rỗng — vẽ nó là một
                 khoảng trắng 8px giữa hai chip. */
              if (!shown.trim()) return null;
              /*
               * Đoạn lời của model, xen giữa các chip. `shown` là lát cắt THÔ đã
               * dọn lúc vẽ (xem `displayText`) và đi qua MarkdownRenderer y như
               * bubble. Bọc ErrorBoundary vì lý do ghi ở message-item.tsx: một
               * markdown hỏng không được phép xóa trắng cả dòng tin nhắn — nên
               * fallback hiện lại chính đoạn lời dạng thô.
               */
              return (
                <div key={`text-${i}`} className="claude-prose py-1 text-primary">
                  <ErrorBoundary
                    resetKey={seg.text}
                    fallback={
                      <div className="whitespace-pre-wrap py-1 text-body text-secondary">{shown}</div>
                    }
                  >
                    <MarkdownRenderer content={shown} />
                  </ErrorBoundary>
                </div>
              );
            })
          : events.length > 0 && (
              /* Vạch ngăn giữa các chip: trước đây 10–20 chip trong một lượt
                 dính thành một vệt xám không phân biệt được đâu là tool nào
                 lỗi. Cố ý KHÔNG gắn vai danh sách: con của nó là `<button>`
                 trần chứ không phải mục danh sách, nên screen reader đọc ra
                 "danh sách, 0 mục" — và nhãn tiếng Anh trong khi UI là tiếng
                 Việt. */
              <div className="my-2 flex flex-col divide-y divide-subtle">
                {events.map((ev) => (
                  /* Mỗi mục là MỘT đoạn-chip: khoá nằm ở vỏ để vạch ngăn cắt
                     giữa hai lần gọi, không cắt giữa tiêu đề đoạn và chip đầu
                     của chính nó. */
                  <div key={ev.id}>
                    {bandByEventId.get(ev.id) && (
                      <ToolPhaseBand group={bandByEventId.get(ev.id)!} />
                    )}
                    <ToolChip ev={ev} />
                  </div>
                ))}
              </div>
            )}
      </div>
    </>
  );
});