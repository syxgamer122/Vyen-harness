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
import { filterPrompts, slashCommitTarget } from '@/lib/slash-commands';
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
  /**
   * Mô tả một dòng dưới tên trong palette "/". Nguồn: `SlashCommandDef.description`
   * (`lib/slash-commands.ts`). KHÔNG tự chế — trước đây composer in một chuỗi
   * cứng cho MỌI lệnh, nên /cost và /memory cũng tự nhận là "lập kế hoạch bằng
   * planner model". Lệnh tùy biến (settings) chưa có mô tả, nên trường này
   * tuỳ chọn và bị thiếu thì palette rơi về câu nói trung tính.
   */
  description?: string;
  /**
   * Gợi ý tham số in MỜ cạnh tên trong palette "/" (mẫu của Claude Code):
   * `/plan <mục tiêu>`. Nguồn: `SlashCommandDef.argumentHint`
   * (`lib/slash-commands.ts`), ràng theo `syntax`.
   *
   * TUỲ CHỌN và có thể vắng: `use-chat-orchestration.ts` dựng hàng palette mà
   * chưa gán trường này, recipe và prompt tự lưu cũng không có tham số nào để
   * gợi ý. Thiếu thì palette chỉ không in gì cạnh tên, không vỡ.
   */
  argumentHint?: string;
}

export type ApprovalPolicy = 'always' | 'smart' | 'never' | 'chat_only';

/**
 * Trần mục hiện trong palette "/".
 *
 * `filterPrompts` mặc định `limit = 8`, còn lệnh built-in đã có 9 — /cost là
 * lệnh thứ 9 nên `slice(0, 8)` cắt mất nó vĩnh viễn: phải gõ `/co` mới thấy,
 * tức phải biết trước tên lệnh mới tìm được lệnh. 20 đủ chứa trọn 9 lệnh +
 * lệnh tùy biến; phần dư bị cắt thì `hiddenSlashLine` báo bằng CON SỐ.
 */
export const SLASH_PALETTE_LIMIT = 20;

/**
 * Lấy HẾT mục khớp, không trần thật — cần biết tổng số để đếm chính xác bao
 * nhiêu mục palette bị cắt. `10_000` là trần an toàn, không phải con số nghiệp vụ.
 */
const SLASH_MATCH_ALL = 10_000;

/**
 * Chia danh sách khớp thành phần hiện + số mục bị cắt.
 *
 * Palette trộn lẫn lệnh built-in, recipe và prompt đã lưu, nên số bị ẩn phải
 * đếm trên TẤT CẢ mục khớp chứ không đoán theo loại.
 */
export function partitionSlashMatches<T>(
  matches: T[],
  limit: number = SLASH_PALETTE_LIMIT,
): { shown: T[]; hidden: number } {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  return { shown: matches.slice(0, cap), hidden: Math.max(0, matches.length - cap) };
}

/**
 * Dòng báo phần palette bị cắt. `null` = không có gì bị cắt, không vẽ.
 *
 * Con số cụ thể thay cho dấu "…": người đọc biết đúng bao nhiêu món đang bị giấu
 * và biết cách lấy ra (gõ thêm chữ để thu hẹp). "…" chỉ cho biết có gì đó bị
 * bỏ mà không cho biết bao nhiêu, nên không đảo ngược được.
 */
export function hiddenSlashLine(hidden: number): string | null {
  if (!(hidden > 0)) return null;
  return `còn ${hidden} mục nữa, gõ thêm chữ để lọc`;
}

/**
 * MỘT nguồn cho cả bốn chế độ phê duyệt, cả ba chỗ hiển thị.
 *
 * Trước đây cùng một trạng thái có tới ba nhãn: pill in tiếng Việt ("Tự chạy
 * tool, không hời"), menu "Tác vụ" in tiếng Anh ("Autonomous"), nút đổi chế độ
 * lại in một bản sao của tiếng Anh đó. Ba nhãn cho bốn trạng thái, hai ngôn
 * ngữ, ba cách viết — người dùng phải tự dò xem chúng có nói cùng một điều
 * không, và không có cách nào kiểm bằng mắt trên một màn hình.
 *
 * `short` là bản rút gọn cho hai chỗ chật (nhãn hàng menu, nút trên dải
 * công cụ); `long` là câu đầy đủ cho pill, nơi có chỗ và cần nói rõ chế độ đó
 * LÀM GÌ chứ không chỉ TÊN nó. `hint` là dòng giải thích dưới nhãn trong menu.
 *
 * Cả ba trường đều tiếng Việt: `Autonomous`/`Manual`/`Smart`/`Chat Only` là tên
 * tiếng Anh của chế độ, không phải tên tiếng Việt, và dải công cụ là nơi người
 * dùng đọc nhanh nhất nên nó phải đọc được bằng tiếng của giao diện.
 */
const APPROVAL_COPY: Record<ApprovalPolicy, { short: string; long: string; hint: string }> = {
  always: {
    short: 'Luôn hỏi',
    long: 'Hỏi trước mọi tool',
    hint: 'Hỏi xác nhận trước khi chạy bất kỳ tool nào',
  },
  smart: {
    short: 'Hỏi khi ghi',
    long: 'Tự chạy lệnh đọc, hỏi trước khi ghi',
    hint: 'Tự duyệt lệnh đọc, hời trước khi ghi hoặc xoá',
  },
  never: {
    short: 'Tự chạy',
    long: 'Tự chạy tool, không hỏi',
    hint: 'Tự duyệt mọi tool an toàn, trừ lệnh phá hoại',
  },
  chat_only: {
    short: 'Không tool',
    long: 'Không dùng tool',
    hint: 'Vô hiệu hoàn toàn tool, dùng cho phân tích và viết',
  },
};

/**
 * Suy ra policy đang chạy. `autoPilot` là đường cũ (bool) nên vẫn phải map
 * về đúng policy, và map ở MỘT chỗ để menu, pill và nút không lệch nhau.
 */
export function resolveApprovalPolicy(
  policy: ApprovalPolicy | undefined,
  autoPilot: boolean | undefined,
): ApprovalPolicy {
  return policy ?? (autoPilot ? 'smart' : 'always');
}

/** Nhãn pill chế độ phê duyệt — câu đầy đủ, nói rõ chế độ đó làm gì. */
export function approvalPillLabel(
  policy: ApprovalPolicy | undefined,
  autoPilot: boolean | undefined,
): string {
  return APPROVAL_COPY[resolveApprovalPolicy(policy, autoPilot)].long;
}

/** Nhãn gọn cho ô chật: hàng menu "Tác vụ" và nút đổi chế độ trên dải. */
export function approvalShortLabel(
  policy: ApprovalPolicy | undefined,
  autoPilot: boolean | undefined,
): string {
  return APPROVAL_COPY[resolveApprovalPolicy(policy, autoPilot)].short;
}

/** Dòng giải thích một dòng dưới nhãn trong menu "Tác vụ". */
export function approvalHint(
  policy: ApprovalPolicy | undefined,
  autoPilot: boolean | undefined,
): string {
  return APPROVAL_COPY[resolveApprovalPolicy(policy, autoPilot)].hint;
}

export interface StagedFilesChip {
  label: string;
  title: string;
}

/**
 * Chip file đang chờ duyệt. `null` khi không có file nào — lúc đó KHÔNG vẽ
 * chip, để "đang có gì chờ" luôn là một tín hiệu có ý nghĩa chứ không phải
 * một vùng trống quen thuộc.
 */
export function stagedFilesChip(count: number): StagedFilesChip | null {
  if (!(count > 0)) return null;
  return {
    label: `${count} tệp chờ duyệt`,
    title: `${count} tệp đã thay đổi, chưa ghi vào đĩa`,
  };
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
  /*
   * Người dùng đã TỰ bấm phím mũi tên trong palette chưa, hay chưa.
   *
   * Palette mở ra luôn sáng mục đầu tiên, nên nếu Enter chỉ nhìn `slashIndex`
   * thì nó không phân biệt được "mục đang sáng là thứ tôi chỉ định" với "mục
   * đầu tiên hiện ra vì chưa ai chọn". Cờ này là ranh giới đó: Enter chỉ chạy
   * mục đang sáng khi chữ đã gói chính là tên mục, HOẶC khi người dùng vừa
   * điều hướng tới nó. Xem `slashCommitTarget`.
   */
  const [slashNavigated, setSlashNavigated] = useState(false);

  const slashQuery =
    draft.startsWith('/') && !draft.includes('\n') ? draft.slice(1) : null;

  /*
   * Lấy HẾT mục khớp rồi mới cắt ở `SLASH_PALETTE_LIMIT`: `filterPrompts` tự
   * `slice(0, limit)` nên gọi thẳng với mặc định 8 là mất `/cost` (lệnh thứ 9)
   * mà không hề có dấu hiệu gì bị bỏ. Cắt ở chỗ khác thì dòng "còn N mục"
   * báo đúng số đang bị giấu.
   */
  const slashAllMatches = useMemo(
    () =>
      slashQuery === null ? [] : filterPrompts(slashPrompts ?? [], slashQuery, SLASH_MATCH_ALL),
    [slashPrompts, slashQuery],
  );

  const { shown: slashMatches, hidden: slashHiddenCount } = useMemo(
    () => partitionSlashMatches(slashAllMatches),
    [slashAllMatches],
  );

  const slashHiddenLine = hiddenSlashLine(slashHiddenCount);

  const slashOpen =
    slashQuery !== null && !slashDismissed && slashMatches.length > 0;

  useEffect(() => {
    setSlashIndex(0);
    setSlashDismissed(false);
    setSlashNavigated(false);
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
          setSlashNavigated(true);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
          setSlashNavigated(true);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          /*
           * Tab là phím "chấp nhận phần đã điền", nên nó LUÔN áp dụng mục đang
           * sáng. Enter thì không: trước đây nó cũng áp dụng thẳng, nên gõ
           * `/pl` xong bấm Enter là chạy `/plan` — người dùng xin một việc,
           * nhận việc khác, không có dấu hiệu gì cả. Anthropic gỡ hẳn hành vi
           * đó ở Claude Code v2.1.236.
           *
           * Không khớp thì Enter KHÔNG bị nuốt: rơi xuống đường gửi dưới đây,
           * để chữ đã gõ đi tới `parseSlashCommand` và hiện lỗi "không nhận
           * diện", thay vì im lặng chạy lệnh khác.
           */
          const target =
            e.key === 'Enter'
              ? slashCommitTarget(slashMatches, slashIndex, slashQuery ?? '', slashNavigated)
              : slashMatches[slashIndex];
          if (target) {
            e.preventDefault();
            e.stopPropagation();
            applyPrompt(target);
            return;
          }
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
    [slashOpen, slashMatches, slashIndex, slashQuery, slashNavigated, applyPrompt, onStop, isTouchDevice, sendOnEnter, submitDraft, onTakeBackQueued],
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

  /* Chip file đang chờ duyệt: null khi không có gì, để vùng trống luôn nghĩa là
     "không có việc gì đang chờ" chứ không phải "chưa render xong". */
  const stagedChip = stagedFilesChip(stagedFileCount ?? 0);

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
    const currentPolicy = resolveApprovalPolicy(approvalPolicy, autoPilot);
    sessionTasks.push({
      key: 'auto-pilot',
      icon: Zap,
      active: currentPolicy === 'smart' || currentPolicy === 'never',
      disabled: isStreaming,
      label: `Chế độ phê duyệt: ${approvalPillLabel(currentPolicy, autoPilot)} · bấm để đổi`,
      shortLabel: approvalShortLabel(currentPolicy, autoPilot),
      description: approvalHint(currentPolicy, autoPilot),
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

  /*
   * File đang staged KHÔNG còn là một mục trong menu "Tác vụ": ở đó nó nằm
   * sau nút icon 32×32, nên người dùng không biết có thay đổi đang chờ duyệt.
   * Nay nó là một chip có chữ ở dải công cụ (render bên dưới), bấm vào gọi
   * đúng `onOpenStaging` — MỘT đường vào duy nhất, không phải hai lối lệch nhau.
   */

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
          /*
           * `notice-warn` mang sẵn `text-warning` trên `bg-raised` (4.38:1 —
           * hụt AA). Bản ghi đè ở đây còn tệ hơn: nó đặt nền phủ
           * `bg-warning/10` và chữ `text-amber-warn`, ra 4.01:1 trên
           * `bg-sunken`. Cùng một lỗi như chip file chờ duyệt, nên dùng
           * chung cách sửa: giữ nền phủ và viền làm dấu hiệu trạng thái,
           * đổi chữ sang mực (13.97:1) và đặc viền lên (4.54:1).
           */
          <div role="status" className="notice-warn mb-2 px-3.5 py-2 rounded-lg border border-warning bg-warning/10 text-xs text-primary">
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
           *
           * Mép phải dải từng in "(Ctrl+K / / for Commands)". Không nơi nào
           * trong repo bắt Ctrl+K (`grep ctrlKey` chỉ ra `use-branch-keyboard-
           * shortcuts.ts` và `app/page.tsx`, đều là phím khác) — bấm ra không
           * có gì, và dòng đó còn viết tiếng Anh trên giao diện tiếng Việt.
           * Nay dùng chỗ trống đó cho chip file đang chờ duyệt. Gợi ý `/` còn
           * ở dòng hướng dẫn phím dưới ô nhập.
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
                  className="inline-flex items-center gap-1 rounded-full bg-raised px-3 py-1 text-xs text-tertiary transition-colors hover:text-primary"
                >
                  {/* Icon chỉ mang màu, không mang nghĩa: nhãn cạnh nó đã nói
                      chế độ nào. Giữ nó cùng bậc chữ với nhãn để không thành
                      một dấu hiệu riêng. */}
                  <Zap size={11} className="text-accent" aria-hidden="true" />
                  <span>{approvalShortLabel(approvalPolicy, autoPilot)}</span>
                </button>
              )}
            </div>
            {/*
             * File đã staged nhưng chưa ghi đĩa: phải thấy được mà không cần
             * mở menu nào, và phải thấy được KỂ CẢ khi dải công cụ bị cuộn —
             * nên nó nằm NGOÀI cụm `overflow-x-auto` bên trái, không cuộn theo.
             * Đây là lối vào DUY NHẤT của panel staging, cùng `onOpenStaging`
             * với mục cũ trong menu "Tác vụ" (nay đã gỡ).
             */}
            {stagedChip && onOpenStaging && (
              /*
               * CHỮ là `text-primary`, không phải `text-warning`.
               *
               * Cặp cũ `text-warning` trên nền `bg-warning/10` chỉ đạt
               * 4.10:1 ở trạng thái nghỉ và 3.61:1 khi hover — tức CHẾT độ ở
               * đúng lúc người dùng đưa chuột lên đọc. Nền phủ càng đậm thì
               * chữ càng nhạt, tức hover làm nó TỐT hơn, ngược với mọi control
               * khác trong app.
               *
               * Giữ nền phủ và viền màu cảnh báo (chúng là dấu hiệu trạng
               * thái, không phải chữ) nhưng đổi chữ sang mực: nhãn luôn đọc
               * được, màu vẫn nói "đây là việc cần duyệt". Đây cũng là cách
               * `chat-interface.tsx` vẽ băng cảnh báo.
               *
               * Viền đặc `border-warning` thay cho `/40`: ở mức /40 nó hòa
               * vào dải công cụ còn 1.72:1, tức control không có ranh giới
               * nhìn thấy được. Đặc lên là 4.67:1, qua ngưỡng 3:1 của WCAG
               * 1.4.11 mà vẫn là một nét mảnh.
               */
              <button
                type="button"
                onClick={onOpenStaging}
                title={`${stagedChip.title}. Bấm để xem thay đổi trước khi ghi đĩa`}
                className="lift-sm ml-2 inline-flex flex-none items-center gap-1.5 rounded-wobble border border-warning bg-warning/10 px-2.5 py-1 text-ui font-medium text-primary transition-colors hover:border-strong hover:bg-warning/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              >
                <FileText size={12} aria-hidden="true" className="flex-none" />
                {stagedChip.label}
              </button>
            )}
          </div>

          {slashOpen && (
            /*
             * Vỏ ngoài KHÔNG mang role: `role="listbox"` chỉ được chứa `option`,
             * nên dòng "còn N mục" phải là anh em của listbox chứ không phải
             * con. Nhờ vậy dòng đó không cuộn mất: người đọc luôn thấy còn bao
             * nhiêu món đang bị giấu, kể cả khi danh sách dài hơn khung.
             */
            <div
              className="absolute bottom-full left-0 right-0 z-30 mb-3 lift-lg rounded-2xl border border-default bg-overlay font-mono shadow-lift-lg"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div
                role="listbox"
                aria-label="Danh sách prompt"
                /*
                 * Cao theo viewport, không theo pixel cứng.
                 *
                 * `max-h-64` là hằng số 256px, nên nó chỉ đúng với đúng một
                 * hình dạng hàng: hàng một dòng mô tả và tối đa 8 mục. Rồi cả
                 * hai con số đó đều đổi — trần lên 20 (`:78`) và mô tả lên hai
                 * dòng (`line-clamp-2`, vì câu dài nhất 60 ký tự mà điện thoại
                 * chỉ chứa ~47 ký tự mỗi dòng ở 11px mono, nên `line-clamp-1`
                 * cắt mất đúng vế "sửa file thật" của `/boost`).
                 *
                 * Hai thay đổi đó đều đúng; cái sai là container. Hàng cao
                 * hơn 30% và danh sách dài hơn 2.5 lần thì 256px chỉ còn chỗ
                 * 3.7 hàng, và `/summarize` — mục cuối — rơi tới 5 màn cuộn.
                 *
                 * `min(24rem, 55vh)` ràng theo viewport: trên điện thoại thấp
                 * thì `55vh` thắng nên palette không nuốt quá nửa màn, trên
                 * màn rộng thì `24rem` thắng nên nó không thành một tấm bảng
                 * phủ cả cột hội thoại. Không sửa lại hai quyết định ở trên.
                 */
                className="max-h-[min(24rem,55vh)] overflow-y-auto p-2"
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
                    {/*
                     * Tên lệnh + gợi ý tham số MỜ cạnh nhau (mẫu của Claude
                     * Code). Trước đây `syntax` chỉ nằm trong danh mục, không ai
                     * in ra: `/plan` mà không có `<mục tiêu>` thì người dùng
                     * phải đoán rồi mới biết lệnh đó cần gì.
                     *
                     * Tên cắt bằng `truncate` còn gợi ý thì `flex-none`: màn hẹp
                     * phải hy sinh chữ ở giữa, không phải phần nói lệnh cần
                     * tham số gì. `p.argumentHint` là TUỲ CHỌN — thiếu thì
                     * không vẽ gì, không để lại khoảng trống.
                     */}
                    <span className="flex w-full min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-primary">
                      {p.kind === 'recipe' ? (
                        <ChefHat size={11} aria-hidden="true" className="flex-none text-accent" />
                      ) : null}
                      {p.kind === 'command' ? (
                        <ListChecks size={11} aria-hidden="true" className="flex-none text-accent" />
                      ) : null}
                      <span className="truncate">/{p.title}</span>
                      {p.argumentHint ? (
                        <span className="flex-none text-meta font-normal text-tertiary">
                          {p.argumentHint}
                        </span>
                      ) : null}
                    </span>
                    <span className="line-clamp-2 w-full text-[11px] leading-snug text-tertiary">
                      {p.kind === 'recipe'
                        ? 'workflow · mở panel để chạy'
                        : p.kind === 'command'
                          ? (p.description ?? 'lệnh · gõ tên rồi Enter để chạy')
                          : p.content.replace(/\n+/g, ' ').trim()}
                    </span>
                  </button>
                ))}
              </div>
              {/*
               * Số mục bị cắt, đếm trên tập khớp đầy đủ. Chuỗi "…" không nói
               * được còn bao nhiêu nên người đọc không biết mình đang bị giấu
               * bao nhiêu; con số + gợi ý gõ thêm là cách tự lấy lại.
               */}
              {slashHiddenLine && (
                <p className="border-t border-subtle px-4 py-2 text-[11px] text-tertiary">
                  {slashHiddenLine}
                </p>
              )}
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

            {/*
             * Pill chế độ phê duyệt. Trước đây mọi policy khác `always` in
             * "Autonomous Tools Active" — nhưng `smart` (mặc định) là chế độ
             * HỎI trước khi ghi file, nên tên nói ngược hành vi: người dùng
             * tưởng agent tự do ghi đĩa rồi mới phát hiện nó dừng hỏi.
             * Nay nhãn nói đúng việc chế độ đó làm.
             *
             * `text-[11px]` → `text-meta`: cùng 11px nhưng có tên trong thang,
             * nên đổi cỡ ở đây cũng đổi được cả app thay vì chỉ dòng này.
             *
             * Icon `Zap` đổi sang `text-accent`: nó là dấu "chế độ này đang bật",
             * không phải dấu "có cảnh báo" — cảnh báo thật đã có ở chip file
             * chờ duyệt. Giữ `text-warning` ở đây là 4.38:1 trên `bg-raised`,
             * tức hụt ngưỡng AA của chữ trong khi vai trò của nó chỉ là trang
             * trí, nên nó không được làm mất một ô chữ cho màu.
             */}
            <div className="hidden md:flex items-center gap-2">
              {(approvalPolicy === 'never' || approvalPolicy === 'smart' || autoPilot) && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-raised border border-subtle px-2.5 py-0.5 font-mono text-meta text-tertiary">
                  <Zap size={11} aria-hidden="true" className="text-accent" />
                  <span>{goalLoopInfo || approvalPillLabel(approvalPolicy, autoPilot)}</span>
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
        {/*
         * `text-tertiary`, KHÔNG phải `text-disabled`.
         *
         * `text-disabled` (#a1a1aa) nghĩa là "control này không dùng được"
         * (DESIGN.md §2.2), còn năm gợi ý phím dưới đây là thông tin người
         * dùng vẫn cần đọc. Ở mức cũ nó chỉ đạt 2.28:1 trên nền `bg-sunken` —
         * dưới một nửa ngưỡng AA, và nằm NGAY TRÊN nền app nên nó là chữ mờ
         * trên giấy trắng chứ không phải trên nền tối. `text-tertiary` đạt
         * 4.71:1 và là đúng bậc cho gợi ý nhỏ.
         *
         * `text-meta` (11px) thay `text-[10.5px]`: cỡ tự chế không thuộc
         * thang 6 bậc nào, nên không ai nhớ được có đúng một cỡ hay không.
         */}
        <div className="mt-3 hidden text-center font-mono text-meta text-tertiary sm:block">
          Enter để gửi · Shift+Enter xuống dòng · Enter/Alt+Enter khi AI chạy = xếp hàng · Alt+↑ lấy lại · / lệnh nhanh
        </div>
      </div>
    </div>
  );
});
