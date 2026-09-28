'use client';

import React, { memo, useState, useCallback } from 'react';
import {
  Activity,
  ArrowLeftRight,
  Bookmark,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
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
import { resolveToolEntry } from '@/lib/tool-catalog';

interface ToolEvent {
  id: string;
  name: string;
  /** true = đã có kết quả; false = đang chạy. */
  done: boolean;
  args: string;
  summary: string;
  isError?: boolean;
}

interface ToolInvocationLike {
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  state?: string;
  result?: unknown;
}

/** Gộp annotation tool + toolInvocations thành chuỗi sự kiện theo id.
 *  Export để test thuần (repo không có hạ tầng render DOM). */
export function collectToolEvents(
  annotations: Array<Record<string, unknown>> | undefined,
  toolInvocations: ToolInvocationLike[] | undefined,
): ToolEvent[] {
  if (!annotations?.length && !toolInvocations?.length) return [];
  const order: string[] = [];
  const byId = new Map<string, ToolEvent>();
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
    } else if (tool.phase === 'done') {
      ev.summary = typeof tool.summary === 'string' ? tool.summary : '';
      ev.done = true;
      if (tool.error || tool.isError) ev.isError = true;
    }
  }

  for (const inv of toolInvocations ?? []) {
    if (!inv?.toolCallId) continue;
    const ev = push(String(inv.toolCallId));
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
         * message-item.tsx chỉ bọc quanh MarkdownRenderer chứ không bọc ToolTrace.
         * `db.ts` đã có cùng cách xử lý cho `result`; args thì chưa.
         */
        try {
          ev.args = JSON.stringify((inv as any).args);
        } catch {
          ev.args = '[tham số không serialize được]';
        }
      }
    }

    if (inv.state === 'result') {
      ev.done = true;
      if (typeof inv.result === 'string' && !ev.summary) {
        ev.summary = inv.result;
      }
    }
  }

  return order.map((k) => byId.get(k)!).filter((ev) => ev.name);
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
  weather: { label: 'weather', Icon: Cloud },
  exchange_rates: { label: 'exchange', Icon: ArrowLeftRight },
  memory_search: { label: 'memory', Icon: Brain },
};

/**
 * Icon cho tool KHÔNG có trong TOOL_META.
 *
 * TOOL_META và catalog phủ phần lớn toolset thật, nhưng `mcp__*` và mọi
 * tool client-side mới thêm vẫn rơi xuống đây. Trước đây tất cả những tool đó
 * nhận CÙNG một icon `Wrench`, nên phần lớn chip trong một lượt có gương mặt
 * giống hệt nhau. Suy ra icon từ TIỀN TỐ tên tool: mắt nhận ra nhóm việc
 * (đọc file / chạy lệnh / gọi MCP) trước khi kịp đọc nhãn.
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

function formatToolDetail(text: string) {
  if (!text) return null;
  // If text contains JSON string, extract relevant field
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.path || parsed.filePath || parsed.targetFile) {
        return parsed.path || parsed.filePath || parsed.targetFile;
      }
      if (parsed.command || parsed.cmd) {
        return parsed.command || parsed.cmd;
      }
      if (parsed.query) {
        return parsed.query;
      }
      if (parsed.url) {
        return parsed.url;
      }
    } catch {
      // ignore
    }
  }
  return text;
}

/** Chip là ĐƯỜNG MỘT, mọi thứ bên ngoài nó (khoảng cách, viền) do cha quyết. */
function ToolChip({ ev, className }: { ev: ToolEvent; className?: string }) {
  const [expanded, setExpanded] = useState(false);
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
  const hasOutput = Boolean(ev.summary && ev.summary.trim());
  const failed = Boolean(ev.isError);
  const running = !ev.done;

  const onCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(ev.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [ev.summary]);

  return (
    <div className={`font-mono text-meta ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => hasOutput && setExpanded(!expanded)}
        disabled={!hasOutput}
        aria-expanded={hasOutput ? expanded : undefined}
        title={catalogEntry?.description}
        className={`flex w-full items-center gap-2 py-1 text-left transition-colors ${
          running
            ? 'lift-sm rounded-lg bg-raised text-secondary shadow-lift-sm'
            : failed
              ? 'text-danger hover:bg-danger/5'
              : 'text-tertiary hover:text-secondary'
        }`}
      >
        {/* Ô icon cố định bề rộng: cả cột icon thẳng hàng, mắt quét dọc
            không bị vỡ vì mỗi chip một độ dài nhãn khác nhau. */}
        <span className="flex w-5 shrink-0 items-center justify-center">
          {running ? (
            <Loader2 size={11} className="animate-spin text-accent" />
          ) : failed ? (
            <XCircle size={11} className="text-danger" />
          ) : (
            <Icon size={11} className="text-disabled" />
          )}
        </span>

        <span className="min-w-0 truncate">
          {label}
          {displayParam ? <span className="text-disabled"> · {displayParam}</span> : null}
        </span>

        {hasOutput && (
          <span className="ml-auto shrink-0 pl-2 text-disabled" aria-hidden>
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </span>
        )}
      </button>

      {expanded && hasOutput && (
        <div className="well mt-1 rounded-lg bg-sunken p-3">
          <div className="flex items-center justify-end pb-1.5">
            <button
              type="button"
              onClick={onCopy}
              className="flex items-center gap-1 text-disabled transition-colors hover:text-secondary"
            >
              {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
              <span>{copied ? 'Đã sao chép' : 'Sao chép kết quả'}</span>
            </button>
          </div>
          <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap border border-subtle p-2 text-secondary">
            {ev.summary}
          </pre>
        </div>
      )}
    </div>
  );
}

export const ToolTrace = memo(function ToolTrace({
  annotations,
  toolInvocations,
}: {
  annotations?: Array<Record<string, unknown>>;
  toolInvocations?: ToolInvocationLike[];
}) {
  const events = collectToolEvents(annotations, toolInvocations);
  const subagentAnns = getSubagentAnnotations(annotations);
  if (events.length === 0 && subagentAnns.length === 0) return null;

  return (
    <>
      {subagentAnns.map((ann, i) => (
        <SubagentCard key={i} annotation={ann} />
      ))}
      {events.length > 0 && (
        <div className="my-2 flex flex-col" role="list" aria-label="Tool executions">
          {events.map((ev, i) => (
            <ToolChip
              key={ev.id}
              ev={ev}
              // Chỉ tách khối đang mở (nhiều dòng) ra khỏi dòng trên — chip một
              // dòng dán liền nhau, không lên thang so le.
              className={i > 0 && ev.summary?.trim() ? 'mt-2' : undefined}
            />
          ))}
        </div>
      )}
    </>
  );
});
