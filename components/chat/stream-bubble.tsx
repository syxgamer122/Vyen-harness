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
    <div className="my-2 rounded-r-xl border-l-2 border-reasoning/40 bg-reasoning p-3 shadow-reasoning-glow">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 text-left transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2">
          <BrainCircuit size={14} className="flex-shrink-0 text-violet-reasoning animate-pulse" />
          <span className="font-medium text-[12px] text-text-primary">Đang suy luận (Reasoning)</span>
          {isStreaming && <span className="w-1.5 h-3 bg-cyan-glow inline-block align-middle ml-1 animate-pulse" aria-hidden="true" />}
          {!open && <span className="truncate text-xs text-text-muted italic">· {preview}</span>}
        </span>
        <span className="flex items-center gap-1 text-[10.5px] text-text-muted flex-shrink-0">
          <span>{open ? 'Thu gọn' : 'Chi tiết'}</span>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>
      {open && (
        <div className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-text-muted custom-scrollbar pt-2 border-t border-reasoning/40/20">
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
      className={`sticky bottom-0 z-10 w-full px-4 py-3 bg-surface/80 backdrop-blur-md border-t border-white/[0.05] transition-opacity duration-100 ${
        handoffActive && !isStreaming ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="mx-auto max-w-4xl space-y-2">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-cyan-glow">
            <Sparkles size={12} className={isStreaming ? 'animate-pulse text-cyan-glow' : ''} />
            <span className="uppercase tracking-wider font-semibold">{role}</span>
            {isStreaming && <span className="text-[10px] text-text-muted font-normal">(streaming...)</span>}
          </div>

          {isStreaming && onStop && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono rounded-lg border border-danger/40 bg-danger/10 hover:bg-rose-danger/20 text-rose-danger transition-colors"
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
