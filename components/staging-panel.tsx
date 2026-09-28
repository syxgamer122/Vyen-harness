'use client';

import { Z_CLASS } from '@/lib/ui-z';
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Trash2, FileText } from 'lucide-react';
import { lineDiff, renderUnifiedDiff } from '@/lib/naive-diff';
import type { StagingStore, StagingStats } from '@/lib/staging';
import { stagingStats as computeStats } from '@/lib/staging';
import { EvidenceBadge } from '@/components/evidence-badge';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';

export interface StagingPanelState {
  open: boolean;
}

/**
 * Panel review batch thay đổi của agent (staging sandbox).
 * Hiển thị diff từng file, reject từng file hoặc reject all, Apply all.
 * Đĩa CHƯA BAO GIỜ bị đụng cho tới khi user bấm Apply.
 */
export function StagingPanel({
  store,
  onClose,
  onApplyAll,
  onRejectFile,
  onRejectAll,
}: {
  store: StagingStore;
  onClose: () => void;
  onApplyAll: () => void;
  onRejectFile: (path: string) => void;
  onRejectAll: () => void;
}) {
  const stats: StagingStats = useMemo(() => computeStats(store), [store]);
  const files = useMemo(() => Object.values(store).sort((a, b) => a.path.localeCompare(b.path)), [store]);

  const containerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!files.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [files.length, onClose]);

  useFocusTrap(containerRef, {
    active: files.length > 0,
    onEscape: onClose,
  });

  if (!files.length || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="staging-panel-title"
      className={`fixed inset-0 ${Z_CLASS.approval} flex items-center justify-center bg-sunken/70 p-4`}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden lift-md rounded-xl border border-subtle bg-panel-bg font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-subtle bg-raised px-4 py-3">
          <div className="min-w-0">
            <h2 id="staging-panel-title" className="flex items-center gap-2 uic text-[16px] font-semibold text-text-primary ">
              <span className="font-bold text-accent">$</span>
              <span className="text-accent">staged</span>
              <span>· {stats.files} file{stats.files !== 1 ? 's' : ''}</span>
              <EvidenceBadge level="reported_done" className="ml-1" />
            </h2>
            <div className="text-meta text-tertiary">
              {stats.newFiles > 0 && `${stats.newFiles} new · `}
              Thay đổi chưa ghi vào đĩa. Review rồi Apply hoặc Reject.
            </div>
          </div>
          <div className="flex flex-shrink-0 gap-1.5 text-meta font-mono">
            <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success">
              +{stats.addedLines}
            </span>
            <span className="rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-danger">
              -{stats.removedLines}
            </span>
          </div>
        </div>

        {/* File list with diffs */}
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {files.map((file) => {
            const diff = renderUnifiedDiff(lineDiff(file.original ?? '', file.content), { contextLines: 2 });
            return (
              <div key={file.path} className="rounded-lg border border-subtle bg-raised overflow-hidden">
                <div className="flex items-center justify-between gap-2 bg-raised border-b border-subtle px-3 py-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText size={12} className="flex-shrink-0 text-accent" />
                    <span className="truncate font-mono text-meta text-text-primary">{file.path}</span>
                    {file.original === null && (
                      <span className="flex-shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-micro font-mono text-accent">
                        NEW
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRejectFile(file.path)}
                    title="Reject this file"
                    className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-meta text-tertiary hover:bg-danger/10 hover:text-danger"
                  >
                    <X size={12} />
                    Reject
                  </button>
                </div>
                <div className="max-h-48 overflow-auto bg-sunken p-2.5 font-mono text-meta leading-relaxed">
                  {diff.text.split('\n').map((line, idx) => {
                    const isAdd = line.startsWith('+');
                    const isDel = line.startsWith('-');
                    const isHunk = line.startsWith('@');
                    return (
                      <div
                        key={idx}
                        className={
                          isAdd
                            ? 'text-success bg-success/10 px-1'
                            : isDel
                              ? 'text-danger bg-danger/10 px-1'
                              : isHunk
                                ? 'text-accent font-semibold'
                                : 'text-tertiary'
                        }
                      >
                        {line || ' '}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-subtle bg-raised px-4 py-2.5">
          <button
            type="button"
            onClick={onRejectAll}
            className="flex items-center gap-1.5 rounded-lg border border-danger/30 bg-sunken px-3.5 py-1.5 text-xs text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 size={13} />
            Reject All
          </button>
          <div className="flex gap-2">
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="rounded-lg border border-subtle bg-panel-soft px-3.5 py-1.5 text-xs text-text-primary transition-colors hover:border-border-hover"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onApplyAll}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-on-fill transition-colors hover:bg-accent/85"
            >
              <Check size={13} />
              Apply All ({stats.files} files)
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
