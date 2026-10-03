'use client';

import React, {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import TextareaAutosize from 'react-textarea-autosize';
import {
  ArrowUp,
  Check,
  ChefHat,
  CornerDownLeft,
  FileText,
  FolderOpen,
  Globe,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Square,
  Target,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { PulseGlow, useHaptics } from '@/components/effects';
import { filterPrompts } from '@/lib/slash-commands';
import { ModelSelector } from '@/components/model-selector';
import type { ModelOption, ModelFavorite, RecentModel } from '@/components/model-selector';
import { TOOL_CATALOG } from '@/lib/tool-catalog';
import { useAnchoredPanel } from '@/lib/hooks/use-anchored-panel';
import { Z_CLASS } from '@/lib/ui-z';

export interface Attachment {
  id: string;
  name: string;
  size?: number;
}

export interface SlashPrompt {
  id: string;
  title: string;
  content: string;
  /**
   * 'recipe': mục là workflow (panel Recipes) — chọn sẽ MỞ panel thay vì chèn
   * text; composer hiển thị nhãn 🍳 để phân biệt với prompt chèn thường.
   * 'command': lệnh built-in (vd /plan) — chọn chỉ chèn tiền tố lệnh, Enter
   * gửi thẳng cho ChatInterface xử lý.
   */
  kind?: 'prompt' | 'recipe' | 'command';
}

export interface ComposerApi {
  getText: () => string;
  setText: (text: string) => void;
  appendText: (text: string) => void;
  clear: () => void;
  focus: () => void;
}

const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const DRAFT_KEY_PREFIX = 'vyen:draft:';
export const getDraftStorageKey = (chatId?: string) => `${DRAFT_KEY_PREFIX}${chatId || 'default'}`;

/**
 * Nút icon 32px như thanh công cụ; vùng chạm mở rộng bằng pseudo `after:-inset-6px`
 * (32+12=44px) để đạt tap target mobile mà không phình thanh công cụ.
 */
function ToolbarButton({
  icon: Icon,
  active,
  disabled,
  onClick,
  label,
  badge,
  className,
  ariaExpanded,
  buttonRef,
}: {
  icon: React.ElementType;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
  className?: string;
  ariaExpanded?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-expanded={ariaExpanded}
      title={label}
      className={`relative flex h-8 w-8 flex-none items-center justify-center rounded-lg transition-colors duration-150 after:absolute after:-inset-[6px] after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        active
          ? 'bg-raised text-accent'
          : 'text-tertiary hover:bg-raised hover:text-primary'
      } disabled:cursor-not-allowed disabled:opacity-30 ${className ?? ''}`}
    >
      <Icon size={14} />
      {badge && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-warning px-0.5 text-micro font-mono font-bold text-on-fill">
          {badge}
        </span>
      )}
    </button>
  );
}

function SendButton({
  isStreaming,
  canSubmit,
  onStop,
}: {
  isStreaming: boolean;
  canSubmit: boolean;
  onStop: () => void;
}) {
  return (
    <button
      type={isStreaming ? 'button' : 'submit'}
      onClick={isStreaming ? onStop : undefined}
      disabled={!isStreaming && !canSubmit}
      aria-label={isStreaming ? 'Dừng tạo' : 'Gửi tin nhắn'}
      className={`relative flex h-8 w-8 flex-none items-center justify-center transition-all duration-200 after:absolute after:-inset-[6px] after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        isStreaming
          ? 'rounded-md bg-danger/20 text-danger border border-danger/40 animate-pulse hover:bg-danger/30'
          : canSubmit
            ? 'rounded-full bg-accent text-on-fill hover:scale-105 active:scale-95 transition-transform'
            : 'rounded-full bg-raised text-disabled cursor-not-allowed'
      }`}
    >
      {isStreaming ? (
        <Square size={11} className="fill-current" aria-hidden="true" />
      ) : (
        <ArrowUp size={15} strokeWidth={2.5} aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * Mô tả một mục trong menu "Tác vụ".
 */
interface TaskSpec {
  key: string;
  icon: React.ElementType;
  /** Nhãn đầy đủ — tooltip/aria. */
  label: string;
  /** Nhãn gọn trong menu. */
  shortLabel?: string;
  /** Mô tả một dòng dưới nhãn: nói rõ mục này LÀM GÌ, chống "tool lộn xộn". */
  description?: string;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  /** Mục mở panel overlay: focus nút Tác vụ trước khi chạy để panel đóng
   * xong trả focus về đúng nút đã mở (không rơi về body). */
  returnsFocusToTrigger?: boolean;
  onClick: () => void;
}

interface TaskGroupSpec {
  key: string;
  label: string;
  items: TaskSpec[];
}

function TaskMenu({ groups }: { groups: TaskGroupSpec[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const { pos, panelRef } = useAnchoredPanel({
    open,
    triggerRef,
    width: 288,
    align: 'left',
    placement: 'auto',
    withMaxHeight: true,
    close,
  });

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        const firstEnabled = flatItems.findIndex((it) => !it.disabled);
        if (firstEnabled !== -1) {
          itemRefs.current[firstEnabled]?.focus();
        }
      }, 10);
    }
  }, [open, flatItems]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const enabledIndices = flatItems
      .map((item, idx) => (!item.disabled ? idx : -1))
      .filter((idx) => idx !== -1);
    if (enabledIndices.length === 0) return;

    const currentIdx = itemRefs.current.findIndex((el) => el === document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = currentIdx === -1
        ? enabledIndices[0]
        : enabledIndices[(enabledIndices.indexOf(currentIdx) + 1) % enabledIndices.length];
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = currentIdx === -1
        ? enabledIndices[enabledIndices.length - 1]
        : enabledIndices[(enabledIndices.indexOf(currentIdx) - 1 + enabledIndices.length) % enabledIndices.length];
      itemRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      itemRefs.current[enabledIndices[0]]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      itemRefs.current[enabledIndices[enabledIndices.length - 1]]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const activeCount = groups.reduce((acc, g) => acc + g.items.filter((t) => t.active).length, 0);

  return (
    <div ref={wrapRef} className="relative">
      <ToolbarButton
        icon={open ? X : MoreHorizontal}
        active={activeCount > 0}
        onClick={() => setOpen((v) => !v)}
        label="Tác vụ"
        badge={activeCount > 1 ? String(activeCount) : undefined}
        ariaExpanded={open}
        buttonRef={triggerRef}
      />
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="Tác vụ"
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            style={{
              position: 'fixed',
              ...(pos.top !== undefined ? { top: pos.top } : {}),
              ...(pos.bottom !== undefined ? { bottom: pos.bottom } : {}),
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
            }}
            className={`surface-panel ${Z_CLASS.dropdown} flex animate-slide-up flex-col overflow-y-auto p-1.5`}
          >
            {groups.map((group) => (
              <div key={group.key} role="presentation">
                <div
                  aria-hidden="true"
                  className="px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-accent"
                >
                  {group.label}
                </div>
                {group.items.map((t) => {
                  const flatIndex = flatItems.findIndex((it) => it.key === t.key);
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.key}
                      ref={(el) => {
                        itemRefs.current[flatIndex] = el;
                      }}
                      type="button"
                      role="menuitem"
                      disabled={t.disabled}
                      onClick={() => {
                        if (t.returnsFocusToTrigger) triggerRef.current?.focus();
                        t.onClick();
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Icon
                        size={15}
                        className={`flex-none ${t.active ? 'text-success' : 'text-tertiary'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-primary">
                          {t.shortLabel ?? t.label}
                        </span>
                        {t.description && (
                          <span className="block truncate text-[10.5px] leading-tight text-tertiary">
                            {t.description}
                          </span>
                        )}
                      </span>
                      {t.badge && (
                        <span className="flex-none rounded-full bg-warning px-1.5 text-micro font-bold text-on-fill">
                          {t.badge}
                        </span>
                      )}
                      {t.active && !t.badge && (
                        <Check size={13} className="flex-none text-success" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

interface ComposerProps {
  onSubmit: (draft: string, opts?: { queueAs?: 'steer' | 'follow-up' }) => Promise<boolean>;
  isStreaming: boolean;
  onStop: () => void;
  attachments: Attachment[];
  onAddFiles: (files: FileList | File[] | null) => void;
  onRemoveAttachment: (id: string) => void;
  slashPrompts?: SlashPrompt[];
  /** Chọn mục slash: trả true = đã xử lý riêng (vd mở panel), bỏ qua insert. */
  onApplySlashPrompt?: (prompt: SlashPrompt) => boolean;
  webSearch?: boolean;
  onToggleWebSearch?: () => void;
  agentMode?: 'plan' | 'act';
  onToggleAgentMode?: () => void;
  autoPilot?: boolean;
  approvalPolicy?: 'always' | 'smart' | 'never' | 'chat_only';
  onCycleAutoPilot?: () => void;
  goalLoopActive?: boolean;
  goalLoopInfo?: string;
  onGoalLoopClick?: (goalText: string) => void;
  stagedFileCount?: number;
  onOpenStaging?: () => void;
  /** Mở panel "Công cụ & quyền" (catalog tool + quyền theo nhóm). */
  onOpenToolsPanel?: () => void;
  /** Mở panel Recipes (workflow đóng gói tái sử dụng). */
  onOpenRecipes?: () => void;
  webBusy?: boolean;
  workspace?: { connected: boolean; name: string | null };
  onPickWorkspace?: () => Promise<void>;
  onDisconnectWorkspace?: () => void;
  sendOnEnter: boolean;
  isTouchDevice: boolean;
  canContinue?: boolean;
  onContinue?: () => void;
  maxFileBytes?: number;
  composerApiRef?: React.MutableRefObject<ComposerApi | null>;
  /** P3.1 (Alt+↑): lấy lại tin đã queue mới nhất vào ô nhập. false = queue rỗng. */
  onTakeBackQueued?: () => boolean;
  /** P2.3: chatId của phiên hiện tại để phân tách draft lưu localStorage */
  chatId?: string;

  /*
   * Chọn model — đặt Ở ĐÂY vì đây là nơi tay đang gõ, không phải status line
   * trên cùng. Status line vẫn hiển thị TĨNH model đang dùng, nhưng chỉ còn MỘT
   * control tương tác cho việc chọn (trước đây ở status line, kèm ghi chú
   * "khỏi chiếm chỗ trong composer" — đổi lại vì khoảng cách tới tay quá xa).
   */
  models: ModelOption[];
  model: string;
  onModelChange: (id: string) => void;
  modelSelectorDisabled?: boolean;
  /** id provider đang active: Gần đây/Yêu thích của picker scoped theo đây. */
  modelProviderId: string;
  /** true khi danh sách model là catalog built-in (hiện section Đề xuất). */
  modelCatalogBuiltin: boolean;
  modelFavorites: ModelFavorite[];
  modelRecents: RecentModel[];
  onToggleModelFavorite: (id: string) => void;
}

/**
 * Ô nhập terminal (DESIGN.md): full-bleed, hairline, prompt glyph.
 *
 * Draft là state NỘI BỘ composer: mỗi keystroke không re-render ChatInterface
 * (trước đây input nằm ở useChat trong component 4.8k dòng — gõ một phím là
 * re-render cả cây). onSubmit nhận snapshot draft và trả true nếu tin nhắn đã
 * được đẩy vào pipeline — composer chỉ xoá draft khi được nhận, và chỉ xoá nếu
 * draft chưa bị gõ tiếp trong lúc chờ.
 */
export const Composer = memo(function Composer({
  onSubmit,
  isStreaming,
  onStop,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  slashPrompts,
  webSearch,
  onToggleWebSearch,
  agentMode,
  onToggleAgentMode,
  autoPilot,
  approvalPolicy,
  onCycleAutoPilot,
  goalLoopActive,
  goalLoopInfo,
  onGoalLoopClick,
  stagedFileCount,
  onOpenStaging,
  onOpenToolsPanel,
  onOpenRecipes,
  onApplySlashPrompt,
  webBusy,
  workspace,
  onPickWorkspace,
  onDisconnectWorkspace,
  sendOnEnter,
  isTouchDevice,
  canContinue,
  onContinue,
  maxFileBytes = DEFAULT_MAX_FILE_BYTES,
  composerApiRef,
  onTakeBackQueued,
  chatId,
  models,
  model,
  onModelChange,
  modelSelectorDisabled,
  modelProviderId,
  modelCatalogBuiltin,
  modelFavorites,
  modelRecents,
  onToggleModelFavorite,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  /**
   * Khoá gửi ĐỒNG BỘ (P1 double-send). `onSubmit` await `db.chats.put` +
   * `gatherWebContext` (~15s) TRƯỚC khi append, nên `isLoading` phía
   * orchestration vẫn là giá trị closure cũ suốt cửa sổ đó và không chặn
   * được Enter thứ hai. State không đóng được cửa sổ (setState là bất đồng
   * bộ) nên phải dùng ref: set rồi mới await, clear trong finally.
   */
  const submittingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pickPending, setPickPending] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const currentChatIdRef = useRef(chatId);
  currentChatIdRef.current = chatId;
  const prevChatIdRef = useRef<string | undefined>(chatId);

  const flushDraft = useCallback((targetChatId: string | undefined, text: string) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const key = getDraftStorageKey(targetChatId);
      if (text.trim().length > 0) {
        window.localStorage.setItem(key, text);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Bỏ qua quota/private mode
    }
  }, []);

  // P2.3: Khi đổi chat, flush ngay draft của chat cũ rồi nạp draft của chat mới
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      if (prevChatIdRef.current !== undefined) {
        flushDraft(prevChatIdRef.current, draftRef.current);
      }
      prevChatIdRef.current = chatId;
    }

    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const saved = window.localStorage.getItem(getDraftStorageKey(chatId));
      const loaded = saved !== null ? saved : '';
      setDraft(loaded);
      draftRef.current = loaded;
    } catch {
      // Bỏ qua lỗi truy cập localStorage
    }
  }, [chatId, flushDraft]);

  // P2.3: Persist draft vào localStorage debounced 300ms khi gõ
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const timer = setTimeout(() => {
      flushDraft(chatId, draft);
    }, 300);
    return () => clearTimeout(timer);
  }, [chatId, draft, flushDraft]);

  // P2.3: Flush draft khi đóng tab hoặc unmount để không mất dữ liệu chưa kịp debounce
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleBeforeUnload = () => {
      flushDraft(currentChatIdRef.current, draftRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushDraft(currentChatIdRef.current, draftRef.current);
    };
  }, [flushDraft]);

  useImperativeHandle(
    composerApiRef,
    () => ({
      getText: () => draft,
      setText: (text: string) => {
        setDraft(text);
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          }
        });
      },
      appendText: (text: string) => {
        setDraft((d) => d + (d.length > 0 && !/\s$/.test(d) ? ' ' : '') + text);
      },
      clear: () => setDraft(''),
      focus: () => textareaRef.current?.focus(),
    }),
    [draft],
  );

  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);

  const slashQuery =
    draft.startsWith('/') && !draft.includes('\n') ? draft.slice(1) : null;

  const slashMatches = useMemo(
    () => (slashQuery === null ? [] : filterPrompts(slashPrompts ?? [], slashQuery)),
    [slashPrompts, slashQuery],
  );

  const slashOpen =
    slashQuery !== null && !slashDismissed && slashMatches.length > 0;

  useEffect(() => {
    setSlashIndex(0);
    setSlashDismissed(false);
  }, [slashQuery]);

  const applyPrompt = useCallback(
    (prompt: SlashPrompt) => {
      // Recipe: nhường cho ChatInterface mở panel — không chèn text.
      if (prompt.kind === 'recipe' && onApplySlashPrompt?.(prompt)) {
        setSlashDismissed(true);
        return;
      }
      setDraft(prompt.content);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
      setSlashDismissed(true);
    },
    [onApplySlashPrompt],
  );

  const hasContent = draft.trim().length > 0 || attachments.length > 0;
  /* P3.1: KHÔNG chặn khi đang stream — Enter/Alt+Enter khi agent chạy là
     steering/follow-up queue (onSubmit ở ChatInterface tự route). SendButton
     vẫn hiện Stop khi streaming (type="button"), nên đổi này không phá nút dừng. */
  const canSubmit = hasContent;

  const acceptFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return;
      const list = Array.from(files);
      const tooBig = list.filter((f) => f.size > maxFileBytes);
      const ok = list.filter((f) => f.size <= maxFileBytes);
      setFileError(
        tooBig.length > 0
          ? `Bỏ qua ${tooBig.length} tệp vượt ${Math.round(maxFileBytes / 1024 / 1024)}MB.`
          : null,
      );
      if (ok.length > 0) onAddFiles(ok);
    },
    [maxFileBytes, onAddFiles],
  );

  const haptics = useHaptics();

  const submitDraft = useCallback(
    async (opts?: { queueAs?: 'steer' | 'follow-up' }) => {
      if (!canSubmit) return;
      const text = draft;
      const accepted = await onSubmit(text, opts);
      if (accepted) {
        // Chỉ xoá khi draft KHÔNG bị gõ tiếp trong lúc chờ (web search có thể
        // mất tới ~15s) — draft mới của người dùng luôn được giữ.
        setDraft((d) => {
          if (d === text) {
            flushDraft(chatId, '');
            draftRef.current = '';
            return '';
          }
          return d;
        });
      }
    },
    [canSubmit, draft, onSubmit, chatId, flushDraft],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
      if (composingRef.current || native.isComposing || native.keyCode === 229) {
        if (e.key === 'Enter') e.stopPropagation();
        return;
      }

      if (slashOpen && slashMatches.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashIndex((i) => (i + 1) % slashMatches.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          applyPrompt(slashMatches[slashIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setSlashDismissed(true);
          return;
        }
      }

      /* P3.1: Alt+Enter = follow-up queue ; Alt+↑ = lấy lại tin đã queue. */
      if (e.key === 'Enter' && e.altKey && !isTouchDevice) {
        e.preventDefault();
        void submitDraft({ queueAs: 'follow-up' });
        return;
      }
      if (e.key === 'ArrowUp' && e.altKey && !isTouchDevice) {
        e.preventDefault();
        onTakeBackQueued?.();
        return;
      }
      if (e.key === 'Escape') {
        onStop();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !isTouchDevice && sendOnEnter) {
        e.preventDefault();
        void submitDraft();
      }
    },
    [slashOpen, slashMatches, slashIndex, applyPrompt, onStop, isTouchDevice, sendOnEnter, submitDraft, onTakeBackQueued],
  );

  const handleFormSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      haptics.trigger('light');
      void submitDraft();
    },
    [canSubmit, submitDraft, haptics],
  );

  const handlePickWorkspace = useCallback(async () => {
    if (!onPickWorkspace || pickPending) return;
    // Pressed/pending state renders ngay trong cùng tick của click — nhãn
    // phản hồi tức thì thay vì im lặng chờ dialog native (baseline: 252ms).
    setPickPending(true);
    try {
      await onPickWorkspace();
    } finally {
      setPickPending(false);
    }
  }, [onPickWorkspace, pickPending]);

  const sessionTasks: TaskSpec[] = [];
  const extensionTasks: TaskSpec[] = [];

  if (onToggleAgentMode) {
    sessionTasks.push({
      key: 'agent-mode',
      icon: Pencil,
      active: agentMode === 'plan',
      disabled: isStreaming,
      label: agentMode === 'plan' ? 'Chuyển sang ACT mode' : 'Chuyển sang PLAN mode',
      shortLabel: 'PLAN mode',
      description: 'PLAN chỉ đọc, ACT được ghi file và chạy lệnh',
      onClick: onToggleAgentMode,
    });
  }

  if (onCycleAutoPilot) {
    const currentPolicy = approvalPolicy ?? (autoPilot ? 'smart' : 'always');
    const policyLabel =
      currentPolicy === 'never'
        ? 'Autonomous'
        : currentPolicy === 'always'
          ? 'Manual'
          : currentPolicy === 'chat_only'
            ? 'Chat Only'
            : 'Smart';
    const isChatOnly = currentPolicy === 'chat_only';
    const isManual = currentPolicy === 'always';
    sessionTasks.push({
      key: 'auto-pilot',
      icon: Zap,
      active: currentPolicy === 'smart' || currentPolicy === 'never',
      disabled: isStreaming,
      label: isChatOnly
        ? 'Chế độ: Chat Only (vô hiệu tools) · bấm để đổi'
        : isManual
          ? 'Chế độ: Manual (luôn hỏi duyệt) · bấm để đổi'
          : `Chế độ: ${policyLabel} · bấm để đổi`,
      shortLabel: policyLabel,
      description: isChatOnly
        ? 'Vô hiệu hoàn toàn tool, dùng cho phân tích & viết'
        : isManual
          ? 'Luôn hỏi xác nhận trước khi chạy bất kỳ tool nào'
          : currentPolicy === 'never'
            ? 'Tự động duyệt mọi tool an toàn, trừ lệnh phá hoại'
            : 'Tự duyệt đọc & safe shell, hỏi ghi/destructive',
      onClick: onCycleAutoPilot,
    });
  }

  if (onToggleWebSearch) {
    sessionTasks.push({
      key: 'web',
      icon: Globe,
      active: webSearch,
      disabled: isStreaming,
      label: webSearch ? 'Tắt tìm kiếm web' : 'Bật tìm kiếm web',
      shortLabel: 'Tìm kiếm web',
      description: 'Cho phép agent tìm kiếm web khi trả lời',
      onClick: onToggleWebSearch,
    });
  }

  if (onGoalLoopClick) {
    sessionTasks.push({
      key: 'goal-loop',
      icon: Target,
      active: goalLoopActive ?? false,
      disabled: isStreaming && !(goalLoopActive ?? false),
      label: goalLoopActive
        ? `Goal loop đang chạy${goalLoopInfo ? ` (lượt ${goalLoopInfo})` : ''} · bấm để dừng`
        : 'Goal loop · gõ mục tiêu vào ô nhập rồi bấm để agent tự lặp đến khi hoàn thành',
      shortLabel: goalLoopActive ? `Goal ${goalLoopInfo ?? ''}`.trim() : 'Goal loop',
      description: 'Agent tự lặp từng lượt tới khi xong mục tiêu',
      onClick: () => onGoalLoopClick(draft),
    });
  }

  if (onOpenStaging && (stagedFileCount ?? 0) > 0) {
    extensionTasks.push({
      key: 'staging',
      icon: FileText,
      label: `${stagedFileCount} file đang staged`,
      shortLabel: 'File đã staged',
      badge: String(stagedFileCount),
      description: 'Xem diff, Apply hoặc Reject trước khi ghi đĩa',
      onClick: onOpenStaging,
    });
  }

  if (onOpenToolsPanel) {
    extensionTasks.push({
      key: 'tools-panel',
      icon: Wrench,
      label: 'Công cụ & quyền…',
      description: `Xem ${TOOL_CATALOG.length} tool AI đang có và đặt quyền`,
      returnsFocusToTrigger: true,
      onClick: onOpenToolsPanel,
    });
  }

  if (onOpenRecipes) {
    extensionTasks.push({
      key: 'recipes-panel',
      icon: ChefHat,
      label: 'Recipes…',
      description: 'Workflow đóng gói chạy lại được: tham số, kiểm chứng, retry',
      returnsFocusToTrigger: true,
      onClick: onOpenRecipes,
    });
  }

  if (onDisconnectWorkspace && workspace?.connected) {
    extensionTasks.push({
      key: 'workspace-disconnect',
      icon: FolderOpen,
      disabled: isStreaming,
      label: `Ngắt kết nối: ${workspace.name ?? 'workspace'}`,
      shortLabel: 'Ngắt thư mục làm việc',
      description: 'Gỡ kết nối thư mục làm việc hiện tại khỏi phiên',
      onClick: onDisconnectWorkspace,
    });
  }

  const taskGroups: TaskGroupSpec[] = [
    { key: 'session', label: 'Chế độ phiên', items: sessionTasks },
    { key: 'extensions', label: 'Công cụ & mở rộng', items: extensionTasks },
  ].filter((g) => g.items.length > 0);

  return (
    /*
     * Gutter ngang PHẢI khớp hệt container cuộn của message list (`px-5 md:px-8`),
     * vì cả hai cùng bám `max-w-thread`. Trước đây vỏ ở đây là `px-4` còn
     * message list là `px-4 md:px-8` + `px-4` bên trong mỗi hàng — mép ô nhập
     * lệch 40px so với mép chữ. Giờ cả hai cùng một con số, nên nhìn dọc thấy
     * thẳng hàng.
     *
     * `pb-[env(safe-area-inset-bottom)]` giữ nguyên: vỏ ngoài phải full-bleed
     * để nền chạy hết chiều rộng, chỉ khối dán bên trong mới canh giữa.
     */
    <div className="w-full px-5 pb-[env(safe-area-inset-bottom)] pt-3 md:px-8 flex-none">
      <div className="relative mx-auto max-w-thread z-20">
        {canContinue && !isStreaming && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={onContinue}
              className="lift-sm flex items-center gap-1.5 rounded-full border border-default bg-overlay px-4 py-1.5 font-mono text-ui font-medium text-accent transition-all duration-150 hover:border-strong hover:bg-raised hover:text-primary"
            >
              <CornerDownLeft size={12} aria-hidden="true" />
              Viết tiếp
            </button>
          </div>
        )}

        {fileError && (
          <div role="status" className="notice-warn mb-2 px-3.5 py-2 rounded-lg border border-warning/40 bg-warning/10 text-amber-warn text-xs">
            {fileError}
          </div>
        )}

        <form
          onSubmit={handleFormSubmit}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            acceptFiles(e.dataTransfer?.files ?? null);
          }}
          className={`group relative lift-md rounded-ink bg-surface shadow-lift-md transition-all duration-200 ${
            isFocused
              ? 'border-2 border-accent'
              : 'border-2 border-default'
          } ${dragging ? 'border-2 border-accent' : ''}`}
        >
          <PulseGlow active={isFocused} />

          {/*
           * Dải công cụ dính trên ô nhập. Đường kẻ `border-b` ở đây là MỘT
           * trong ba đường trang trí chồng lên nhau (đường kẻ này + viền ngoài
           * của form + nền khác) — bỏ đi, khoảng trống giữa dải và vùng gõ đã
           * đủ tách hai vùng. Giữ lại nền `bg-raised/40` để dải vẫn nổi nhẹ.
           */}
          {/* Bo góc phải khớp `rounded-ink` của vỏ form, nếu không dải này bo
              kiểu control trong khi vỏ bo kiểu vẽ tay — thấy ngay mép lệch. */}
          <div className="flex items-center justify-between rounded-t-[15px_6px_0_0] bg-raised/60 px-4 py-2.5">
            <div className="flex items-center gap-2 flex-nowrap overflow-x-auto no-scrollbar min-w-0">
              <ModelSelector
                models={models}
                value={model}
                onChange={onModelChange}
                disabled={modelSelectorDisabled}
                providerId={modelProviderId}
                builtinCatalog={modelCatalogBuiltin}
                favorites={modelFavorites}
                recents={modelRecents}
                onToggleFavorite={onToggleModelFavorite}
              />
              <TaskMenu groups={taskGroups} />
              {approvalPolicy && (
                <button
                  type="button"
                  onClick={onCycleAutoPilot}
                  title="Chế độ phê duyệt (bấm để đổi)"
                  className="inline-flex items-center gap-1 rounded-full bg-raised transition-colors px-3 py-1 text-xs text-tertiary hover:text-primary"
                >
                  <Zap size={11} className={approvalPolicy === 'never' ? 'text-amber-warn' : 'text-accent'} />
                  <span>{approvalPolicy === 'never' ? 'Autonomous' : approvalPolicy === 'always' ? 'Manual' : approvalPolicy === 'chat_only' ? 'Chat Only' : 'Smart'}</span>
                </button>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-tertiary select-none">
              <span>(Ctrl+K / / for Commands)</span>
            </div>
          </div>

          {slashOpen && (
            <div
              role="listbox"
              aria-label="Danh sách prompt"
              className="absolute bottom-full left-0 right-0 z-30 mb-3 max-h-64 overflow-y-auto lift-lg rounded-2xl border border-default bg-overlay p-2 font-mono shadow-lift-lg"
              onMouseDown={(e) => e.preventDefault()}
            >
              {slashMatches.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === slashIndex}
                  id={`slash-opt-${p.id}`}
                  onClick={() => applyPrompt(p)}
                  onMouseEnter={() => setSlashIndex(i)}
                  className={`flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                    i === slashIndex ? 'bg-panel-soft text-primary' : 'text-primary hover:bg-accent-mint/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-primary">
                    {p.kind === 'recipe' ? (
                      <ChefHat size={11} aria-hidden="true" className="flex-none text-accent" />
                    ) : null}
                    {p.kind === 'command' ? (
                      <ListChecks size={11} aria-hidden="true" className="flex-none text-accent" />
                    ) : null}
                    /{p.title}
                  </span>
                  <span className="line-clamp-1 w-full text-[11px] text-tertiary">
                    {p.kind === 'recipe'
                      ? 'workflow · mở panel để chạy'
                      : p.kind === 'command'
                        ? 'lệnh · lập kế hoạch bằng planner model (PLAN mode)'
                        : p.content.replace(/\n+/g, ' ').trim()}
                  </span>
                </button>
              ))}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3.5">
              {attachments.map((a) => (
                <span
                  key={a.id}
                  className="group/chip lift-sm flex max-w-[220px] items-center gap-1.5 rounded-full border border-subtle bg-raised px-3 py-1.5 font-mono text-meta text-primary transition-colors hover:border-default"
                >
                  <Paperclip size={11} aria-hidden="true" className="flex-shrink-0 text-accent" />
                  <span className="truncate">{a.name}</span>
                  {a.size !== undefined && (
                    <span className="text-micro text-tertiary">
                      ({a.size > 1024 * 1024 ? `${(a.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(a.size / 1024)} KB`})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(a.id)}
                    aria-label={`Gỡ ${a.name}`}
                    className="ml-0.5 rounded-full p-0.5 text-tertiary opacity-40 transition-opacity hover:opacity-100 group-hover/chip:opacity-100 hover:bg-raised hover:text-primary"
                  >
                    <X size={10} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {webBusy && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 font-mono text-[12px] leading-relaxed">
              <span className="flex min-w-0 items-center gap-1.5 text-tertiary">
                <span aria-hidden="true" className="terminal-cursor" />
                <span className="truncate">Đang tra cứu web…</span>
              </span>
            </div>
          )}

          <div className="relative flex items-start px-4 pt-3">
            <TextareaAutosize
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData?.files ?? []);
                if (files.length > 0) {
                  e.preventDefault();
                  acceptFiles(files);
                }
              }}
              minRows={1}
              maxRows={10}
              aria-label="Nội dung tin nhắn"
              aria-autocomplete={slashOpen ? 'list' : undefined}
              aria-activedescendant={
                slashOpen ? `slash-opt-${slashMatches[slashIndex]?.id}` : undefined
              }
              placeholder="Soạn thảo prompt hoặc tác vụ, gõ / để mở danh sách lệnh..."
              className="w-full resize-none border-none bg-transparent p-0 font-sans text-[15px] leading-relaxed text-primary outline-none focus:ring-0 placeholder:text-tertiary"
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              acceptFiles(e.target.files);
              e.target.value = '';
            }}
          />


          <div className="flex items-center justify-between gap-2 px-3 pb-3.5 pt-1.5">
            {/* Cụm TRÁI: đính kèm + thư mục + Voice STT */}
            <div className="flex min-w-0 items-center gap-1">
              <ToolbarButton
                icon={Paperclip}
                label="Đính kèm tệp"
                className="rounded-lg hover:bg-accent-mint/50"
                onClick={() => fileInputRef.current?.click()}
              />
              {onPickWorkspace && (
                <ToolbarButton
                  icon={pickPending ? Loader2 : FolderOpen}
                  className={`rounded-lg hover:bg-accent-mint/50 ${pickPending ? 'animate-spin' : ''}`}
                  active={workspace?.connected}
                  label={
                    workspace?.connected
                      ? `Workspace: ${workspace.name}`
                      : 'Kết nối thư mục làm việc'
                  }
                  onClick={handlePickWorkspace}
                />
              )}
            </div>

            {/* Cụm GIỮA: Autonomous / Smart Budget Badge */}
            <div className="hidden md:flex items-center gap-2">
              {(approvalPolicy === 'never' || approvalPolicy === 'smart' || autoPilot) && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-raised border border-subtle px-2.5 py-0.5 font-mono text-[11px] text-tertiary">
                  <Zap size={11} className="text-amber-warn" />
                  <span>{goalLoopInfo || 'Autonomous Tools Active'}</span>
                </span>
              )}
            </div>

            {/* Cụm PHẢI: Gửi */}
            <div className="flex flex-none items-center gap-2">
              <SendButton
                isStreaming={isStreaming}
                canSubmit={canSubmit}
                onStop={onStop}
              />
            </div>
          </div>
        </form>
        <div className="mt-3 hidden sm:block text-center font-mono text-[10.5px] text-disabled">
          Enter để gửi · Shift+Enter xuống dòng · Enter/Alt+Enter khi AI chạy = xếp hàng · Alt+↑ lấy lại · / lệnh nhanh
        </div>
      </div>
    </div>
  );
});
