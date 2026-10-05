'use client';

import React, { memo, useState, useEffect, useRef } from 'react';
import { Square, Sparkles, ChevronDown, ChevronUp, BrainCircuit } from 'lucide-react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { TextShimmer } from '@/components/effects';

export interface StreamBubbleProps {
  content: string;
  reasoning?: string;
  isStreaming: boolean;
  onStop?: () => void;
  role?: 'assistant' | 'user';
}

function StreamThinkingBlock({
  reasoning,
  isStreaming,
}: {
  reasoning: string;
  isStreaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const lines = reasoning.trim().split('\n').filter(Boolean);
  const preview = lines[lines.length - 1] || 'thinking...';

  return (
    /*
     * Suy luận là CHROME, không phải nội dung: nó là một thẻ bo tròn TÔ MÀU
     * NHẠT (`reasoning/10`) với sườn trái — KHÔNG phải khối `bg-reasoning`
     * đặc. Nền đặc `#a78bd4` làm `text-primary` rơi còn 2.39:1 (fail WCAG AA),
     * còn icon `text-reasoning` trên chính nền đó là 1.00:1 — vô hình.
     * Cùng cách làm với khối suy luận ở `chat/message-item.tsx:28`.
     */
    <div className="my-2 rounded-r-xl border-l-2 border-reasoning/40 bg-reasoning/10 p-3 shadow-lift-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 text-left transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2">
          <BrainCircuit size={14} className="flex-shrink-0 text-reasoning animate-pulse" />            <span className="font-medium text-ui text-primary">Đang suy luận (Reasoning)</span>
          {isStreaming && <span className="w-1.5 h-3 bg-cyan-glow inline-block align-middle ml-1 animate-pulse" aria-hidden="true" />}
          {!open && <span className="truncate text-xs text-secondary italic">· {preview}</span>}
        </span>
        <span className="flex items-center gap-1 text-micro text-secondary flex-shrink-0">
          <span>{open ? 'Thu gọn' : 'Chi tiết'}</span>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>
      {open && (
        <div className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono text-ui leading-relaxed text-secondary pt-2 border-t border-reasoning/40">
          {reasoning}
        </div>
      )}
    </div>
  );
}

export const StreamBubble = memo(function StreamBubble({
  content,
  reasoning = '',
  isStreaming,
  onStop,
  role = 'assistant',
}: StreamBubbleProps) {
  const [handoffActive, setHandoffActive] = useState(false);
  const prevStreamingRef = useRef(isStreaming);

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && content) {
      setHandoffActive(true);
      const timer = setTimeout(() => {
        setHandoffActive(false);
      }, 100);
      return () => clearTimeout(timer);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, content]);

  if (!isStreaming && !handoffActive && !content && !reasoning) {
    return null;
  }
  if (!isStreaming && !handoffActive) {
    return null;
  }

  return (
    <div
      data-testid="stream-bubble"
      aria-live="polite"
      className={`sticky bottom-0 z-10 w-full px-4 py-3 bg-surface/80 backdrop-blur-md border-t border-subtle transition-opacity duration-100 ${
        handoffActive && !isStreaming ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="mx-auto max-w-4xl space-y-2">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-1.5 font-mono text-meta text-cyan-glow">
            <Sparkles size={12} className={isStreaming ? 'animate-pulse text-cyan-glow' : ''} />
            <span className="uppercase tracking-wider font-semibold">{role}</span>
            {isStreaming && <span className="text-micro text-text-muted font-normal">(streaming...)</span>}
          </div>

          {isStreaming && onStop && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-meta font-mono rounded-lg border border-danger/40 bg-danger/10 hover:bg-rose-danger/20 text-rose-danger transition-colors"
              title="Dừng sinh phản hồi"
            >
              <Square size={10} className="fill-current" />
              <span>Dừng</span>
            </button>
          )}
        </div>

        {reasoning && (
          <StreamThinkingBlock reasoning={reasoning} isStreaming={isStreaming} />
        )}

        <div className="relative text-sm text-text-primary leading-relaxed">
          {content ? (
            <MarkdownRenderer content={content} />
          ) : (
            isStreaming && (
              <div className="flex items-center gap-2 text-xs font-mono text-text-muted py-1 italic">
                <TextShimmer text="Đang chờ phản hồi từ model..." />
                <span className="w-2 h-4 bg-cyan-glow inline-block align-middle ml-1 animate-pulse" aria-hidden="true" />
              </div>
            )
          )}
          {isStreaming && content && (
            <span className="w-2 h-4 bg-cyan-glow inline-block align-middle ml-1 animate-pulse" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
});
