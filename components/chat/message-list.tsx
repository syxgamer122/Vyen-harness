/*
 * Danh sách tin nhắn virtualized + các chiến lược scroll/pin.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Message } from 'ai/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown } from 'lucide-react';
import { ChatErrorBoundary } from '@/components/chat-error-boundary';
import { MessageItem, type BranchInfo, type RunPosition } from './message-item';
import { TurnHeader } from './turn-header';
import { foldedRowIds, groupTurns, isFoldableTurn, turnRowsOf, type TurnSummary } from '@/lib/turns';

/**
 * Trường mà `toChatMessage` gắn thêm cho tầng hiển thị (lib/chat-tree-persistence.ts).
 * Đọc qua đúng một chỗ để không rải `as any` khắp file — và để khi thêm trường
 * mới thì chỉ phải sửa một khai báo.
 */
interface MessageExtras {
  turnId?: string;
  status?: string;
  finishReason?: string;
  createdAtMs?: number;
  toolInvocations?: Array<{ state?: string; args?: unknown }>;
}

const extrasOf = (message: Message): MessageExtras => message as unknown as MessageExtras;

/* ------------------------------------------------------------------ */
/* Subcomponent 2: Memoized MessageList with Virtualization           */
/* ------------------------------------------------------------------ */

/**
 * Bounded LRU cache cho chiều cao dòng theo `${chatId}:${messageId}:${widthBucket}`.
 * Tự động giới hạn trần 2.000 bản ghi, chống rò rỉ bộ nhớ qua các phiên dài.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();
  constructor(private readonly maxSize: number = 2000) {}

  get(key: K): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  get size(): number {
    return this.map.size;
  }
}

export function getWidthBucket(width?: number): number {
  if (!width || width <= 0) return 800;
  return Math.round(width / 50) * 50;
}

/** Cache chiều cao thật theo chatId:messageId:widthBucket — sống qua unmount/đổi chat. */
const HEIGHT_CACHE = new LruCache<string, number>(2000);
const cacheKey = (chatId: string, id: string, widthBucket: number) =>
  `${chatId}:${id}:${widthBucket}`;

/** Ước lượng sát thực tế cho hàng chưa từng render. */
function estimateMessageHeight(m: Message): number {  const text = m.content ?? '';
  const newlines = text.match(/\n/g)?.length ?? 0;
  const wrapped = Math.ceil(text.length / 68);
  let h = 64 + Math.max(newlines, wrapped) * 26;

  h += Math.floor((text.match(/```/g)?.length ?? 0) / 2) * 150;  // code block
  h += Math.floor((text.match(/\$\$/g)?.length ?? 0) / 2) * 58;  // math block
  h += (text.match(/\\\[/g)?.length ?? 0) * 58;                  // \[...\]
  h += (text.match(/^\|/gm)?.length ?? 0) * 14;                  // dòng bảng
  if (m.experimental_attachments?.length) h += 210;

  return Math.min(Math.max(h, 72), 8000);
}

/** Lỗi từ API về dạng JSON thô (`{"error":...}`) → rút ra câu thông báo. */
function friendlyErrorMessage(raw?: string): string {
  if (!raw) return 'Đã xảy ra lỗi.';
  try {
    const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
    const text = [parsed.error, parsed.message].find((v) => typeof v === 'string') as
      | string
      | undefined;
    return text || raw;
  } catch {
    return raw;
  }
}

/**
 * Hàng "AI đang xử lý" — hiện giữa lúc chờ token đầu tiên (user vừa gửi,
 * hoặc regenerate chưa nhả chữ). Chấm nảy + số giây đã chờ để người dùng biết
 * hệ thống còn hoạt động, không phải treo.
 *
 * Tông màu theo độ chờ (mượn ý UI): <10s bình thường, 10-30s chờ
 * dài (vàng), >30s đỏ kèm chú thích. Model suy luận nặng từng đo TTFT tới
 * 60s nên đỏ không có nghĩa là lỗi, chỉ là "còn chờ hơi lâu".
 */
function ThinkingIndicator() {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    setElapsedSec(0);
    // 100ms cho số lẻ 12.3s: con số chạy thấy được tự nó là tín hiệu "còn sống".
    const timer = setInterval(() => {
      setElapsedSec((Date.now() - startedAt) / 1000);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const slowTone = elapsedSec >= 30;
  const tone = slowTone
    ? 'text-status-error'
    : elapsedSec >= 10
      ? 'text-status-warning'
      : 'text-text-muted';

  return (
    <div className="mx-auto flex max-w-thread items-start gap-3 py-3">
      <p className="flex min-w-0 items-baseline gap-2 py-1 font-sans text-xs" role="status">
        <span className="text-text-muted">$</span>
        <span className="text-text-primary">đang soạn câu trả lời</span>
        <span className={`tabular-nums ${tone}`}>{elapsedSec >= 1 ? `${elapsedSec.toFixed(1)}s` : ''}</span>
        {slowTone && (
          <span className="text-status-error">model nặng có thể chờ 30-60s</span>
        )}
        <span className="terminal-cursor" aria-hidden="true" />
      </p>
    </div>
  );
}

interface MessageListProps {
  chatId: string;
  messages: Message[];

  branchInfoByMessageId: Map<
    string,
    BranchInfo
  >;

  isLoading: boolean;
  lastMessageId?: string;
  editingId: string | null;
  copiedId: string | null;
  draft: string;
  isTouchDevice: boolean;
  sendOnEnter: boolean;
  throttleMs: number;
  error?: Error;
  isAtBottom: boolean;
  isAtBottomRef: React.MutableRefObject<boolean>;
  pin: (durationMs?: number) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;

  onScroll: () => void;
  onScrollToBottom: () => void;
  onCopy: (m: Message) => void;
  onRegenerate: (id: string) => void;

  onSwitchBranch: (
    messageId: string,
    direction: 'previous' | 'next',
  ) => void;

  onStartEdit: (m: Message) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDraftChange: (text: string) => void;
  onSelectSuggestion: (prompt: string) => void;
  onReload: () => void;
  onContinueGenerating?: () => void;

  /** Marker nén hội thoại — banner gắn vào tin ĐẦU TIÊN sau ranh giới. */
  compaction?: {
    upToId: string;
    summary: string;
    compactedCount: number;
  } | null;
}

export const MessageList = memo(function MessageList({
  chatId,
  messages,
  branchInfoByMessageId,
  isLoading,
  lastMessageId,
  editingId,
  copiedId,
  draft,
  isTouchDevice,
  sendOnEnter,
  throttleMs,
  error,
  isAtBottom,
  isAtBottomRef,
  pin,
  scrollRef,
  onScroll,
  onScrollToBottom,
  onCopy,
  onRegenerate,
  onSwitchBranch,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDraftChange,
  onSelectSuggestion,
  onReload,
  onContinueGenerating,
  compaction,
}: MessageListProps) {
  const lastMsg = messages[messages.length - 1];
  const lastRole = lastMsg?.role;
  const lastContentLen = lastMsg?.content?.length ?? 0;
  const hasToolInvocations = Boolean((lastMsg as any)?.toolInvocations && (lastMsg as any).toolInvocations.length > 0);

  /**
   * Đang chờ token đầu tiên mà tin nhắn assistant cuối vẫn rỗng: hàng rỗng
   * (avatar + caret nháy trên bong bóng trống) bị ẩn, ThinkingIndicator đại
   * diện — nếu không sẽ có 2 avatar Vyen cùng lúc cho 1 câu trả lời. Ký tự
   * đầu tiên tới → hàng hiện lại và indicator tự ẩn (caret tiếp quản).
   */
  const pendingEmptyAssistant =
    isLoading && lastRole === 'assistant' && lastContentLen === 0 && !(lastMsg as any)?.reasoning && !hasToolInvocations;

  /**
   * P2.1: Tin nhắn assistant đang stream (đã có nội dung hoặc reasoning)
   * được tách khỏi virtualizer để render ở sticky footer container bên dưới,
   * triệt tiêu hoàn toàn đo đạc giật lag (measurement thrashing) trên từng token.
   */
  const isStreamingAssistant =
    isLoading && lastRole === 'assistant' && (Boolean((lastMsg as any)?.reasoning) || lastContentLen > 0 || hasToolInvocations);

  const visibleMessages = useMemo(() => {
    if (pendingEmptyAssistant || isStreamingAssistant) {
      return messages.slice(0, -1);
    }
    return messages;
  }, [messages, pendingEmptyAssistant, isStreamingAssistant]);

  /*
   * LƯỢT CỦA TIN NHẮN — gom MỘT chỗ (§15.1 chốt trước), ở đây vì đây là nơi có đủ
   * danh sách đang đọc. Mọi màn hình khác cần biết lượt đều gọi `groupTurns` với
   * cùng dữ liệu, không tự gom lại.
   *
   * `messages` (không phải `visibleMessages`): tổng kết của lượt phải phản ánh cả
   * tin ĐANG STREAM nằm ngoài virtualizer — nếu tính trên `visibleMessages` thì đúng
   * lúc agent đang làm việc, header lại báo trạng thái cũ.
   */
  const turns = useMemo(() => {
    const createdAtById = new Map<string, number>();
    const toolArgsById = new Map<string, ReadonlyArray<unknown>>();

    for (const message of messages) {
      const extras = extrasOf(message);
      if (typeof extras.createdAtMs === 'number') createdAtById.set(message.id, extras.createdAtMs);
      if (extras.toolInvocations?.length) {
        toolArgsById.set(
          message.id,
          extras.toolInvocations.map((invocation) => invocation.args),
        );
      }
    }

    return groupTurns(
      /*
       * Row dựng bằng `turnRowsOf`, không tự ghép từng trường ở đây: bản đầu của
       * chỗ này tự map và bỏ sót `content`, làm MỌI header mất tên việc (rơi về
       * "Lượt chưa có yêu cầu") mà không có lỗi biên dịch nào.
       */
      turnRowsOf(messages, extrasOf),
      {
        createdAtOf: (id) => createdAtById.get(id) ?? null,
        toolArgsOf: (id) => toolArgsById.get(id) ?? [],
      },
    );
  }, [messages]);

  const turnStartByMessageId = useMemo(() => {
    const starts = new Map<string, TurnSummary>();
    for (const turn of turns) {
      const first = turn.messageIds[0];
      if (first) starts.set(first, turn);
    }
    return starts;
  }, [turns]);

  /*
   * GẬP THÂN LƯỢT — trạng thái ĐỌC, không phải dữ liệu của lượt (§15.1 điểm 3).
   *
   * Vì sao không ghi xuống DB: gập là cách đọc lịch sử, không phải thứ người dùng
   * giao cho agent. Ghi vào DB thì một lần bấm chuột của hôm nay sẽ ẩn nội dung ở
   * mọi phiên sau, trên mọi thiết bị — và không ai nhớ vì sao nó ẩn.
   */
  const [collapsedTurnIds, setCollapsedTurnIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const hiddenRowIds = useMemo(
    () => foldedRowIds(turns, collapsedTurnIds),
    [turns, collapsedTurnIds],
  );

  /*
   * `renderedMessages` — danh sách THẬT SỰ vẽ: đã bỏ tin của lượt đang gập, và đã
   * bỏ tin đang stream (nằm ngoài virtualizer). Mọi phép tính phục vụ vẽ (vị trí
   * trong khối, banner nén, virtualizer) đọc từ đây; đọc `visibleMessages` thì thứ
   * tự đang vẽ lệch với dữ liệu gom lượt ngay khi có lượt gập.
   */
  const renderedMessages = useMemo(
    () =>
      hiddenRowIds.size === 0
        ? visibleMessages
        : visibleMessages.filter((m) => !hiddenRowIds.has(m.id)),
    [visibleMessages, hiddenRowIds],
  );

  /** Theo dõi kích thước container để chọn width bucket cho HEIGHT_CACHE */
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const updateWidth = () => {
      const w = el.clientWidth;
      if (w > 0) {
        setContainerWidth((prev) => {
          const prevBucket = getWidthBucket(prev);
          const newBucket = getWidthBucket(w);
          return prevBucket !== newBucket ? w : prev;
        });
      }
    };
    updateWidth();
    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRef]);

  /** Banner nén gắn vào tin ĐẦU TIÊN nằm sau ranh giới marker. */
  const compactionBannerBeforeId = useMemo(() => {
    if (!compaction) return null;
    const idx = renderedMessages.findIndex((m) => m.id === compaction.upToId);
    const next = idx >= 0 ? renderedMessages[idx + 1] : undefined;
    return next?.id ?? null;
  }, [compaction, renderedMessages]);

  // App không bật React Compiler; useVirtualizer của TanStack trả về hàm
  // mỗi render là hành vi chủ đích của thư viện — bỏ cảnh báo nhiễu.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: renderedMessages.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => renderedMessages[index]?.id ?? `row-${index}`,
    overscan: 6,
    paddingStart: 16,
    paddingEnd: isStreamingAssistant ? 16 : 96,
    estimateSize: (index) => {
      const m = renderedMessages[index];
      if (!m) return 140;
      const bucket = getWidthBucket(containerWidth || scrollRef.current?.clientWidth);
      return HEIGHT_CACHE.get(cacheKey(chatId, m.id, bucket)) ?? estimateMessageHeight(m);
    },
    measureElement: (el) => {
      const h = el.getBoundingClientRect().height;
      const id = el.getAttribute('data-message-id');
      const bucket = getWidthBucket(
        containerWidth || scrollRef.current?.clientWidth || el.getBoundingClientRect().width,
      );
      if (id && h > 0) HEIGHT_CACHE.set(cacheKey(chatId, id, bucket), h);
      return h;
    },
  });

  const toggleTurnFold = useCallback(
    (turnId: string) => {
      setCollapsedTurnIds((prev) => {
        const next = new Set(prev);
        if (next.has(turnId)) next.delete(turnId);
        else next.add(turnId);
        return next;
      });
      /*
       * Chiều cao từng hàng còn lại không đổi, nhưng VỊ TRÍ của chúng đổi; đo lại
       * để vòng vẽ kế tiếp dùng bảng offset mới thay vì bảng cũ — không thì các
       * hàng dưới nhảy một nhịp.
       */
      rowVirtualizer.measure();
      if (isAtBottomRef.current) pin(300);
    },
    [isAtBottomRef, pin, rowVirtualizer],
  );

  /*
   * VỊ TRÍ TRONG KHỐI LIÊN TIẾP CÙNG VAI — tính MỘT chỗ cho cả danh sách.
   *
   * §15.1 chốt trước: ranh giới lượt phải là dữ liệu gắn theo sự kiện, không
   * suy đoán lúc vẽ, "nếu mỗi chỗ render tự gom lại thì hai màn hình sẽ gom
   * khác nhau". Quan hệ "tin liền trước / liền sau cùng vai" là dữ liệu có
   * thật của danh sách đang đọc (thứ tự thật của cây, không phân loại nội
   * dung), nên nó là nguồn duy nhất để vẽ nhịp khoảng cách và avatar.
   *
   * Không có tin nào bị bỏ vì việc này: đổi danh sách là map này tính lại,
   * chi phí O(n) trên mảng đã có trong bộ nhớ.
   */
  const runPositionById = useMemo(() => {
    const map = new Map<string, RunPosition>();
    for (let i = 0; i < renderedMessages.length; i += 1) {
      const m = renderedMessages[i];
      const sameBefore = renderedMessages[i - 1]?.role === m.role;
      /*
       * Tin CUỐI danh sách còn có thể được nối tiếp bởi tin ĐANG STREAM — tin
       * đó nằm ngoài virtualizer nên không có trong mảng này. Bỏ qua nó thì
       * ranh giới khối rơi vào giữa một lượt đang chạy: mắt thấy một khoảng
       * ngắt giữa hai câu của cùng một việc, đúng thứ §15.1 điểm 5 cấm.
       */
      const sameAfter =
        i + 1 < renderedMessages.length
          ? renderedMessages[i + 1].role === m.role
          : isStreamingAssistant && lastRole === m.role;
      map.set(m.id, sameBefore ? (sameAfter ? 'middle' : 'end') : 'start');
    }
    return map;
  }, [renderedMessages, isStreamingAssistant, lastRole]);

  /*
   * Tin ĐANG STREAM nằm ngoài virtualizer vì thế nó KHÔNG được mở header thứ
   * hai: nó là phần thân của lượt đang hiện, không mở lượt nào — cùng luật với
   * `runPositionById`. Header chỉ gắn vào tin ĐẦU của lượt (`messageIds[0]`), và
   * lượt nào cũng mở đầu bằng tin người dùng.
   */

  const branchLayoutSignature = useMemo(
    () =>
      messages
        .map((message) => {
          const info =
            branchInfoByMessageId.get(message.id);

          return [
            message.id,
            info?.currentIndex ?? -1,
            info?.total ?? 1,
          ].join(':');
        })
        .join('|'),
    [messages, branchInfoByMessageId],
  );

  /* 1. Đổi chat: nhảy đáy TỨC THÌ rồi ghim 1s để bù các lần đo lại.
     HEIGHT_CACHE là bounded LRU (2.000 phần tử) nên tự giới hạn trần bộ nhớ,
     giữ chiều cao các chat gần đây sống qua unmount/đổi chat để không bị giật layout. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;
    el.scrollTop = el.scrollHeight;
    pin(1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  /* 2. Có tin nhắn mới */
  useEffect(() => {
    if (messages.length === 0) return;
    if (lastRole === 'user') {
      pin(1500); // user vừa gửi → LUÔN về đáy
    } else if (isAtBottomRef.current) {
      pin(600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, lastRole, pin]);

  /* 3. Streaming: hook đã ghim vô hạn. Nhích thêm khi nội dung tăng */
  useEffect(() => {
    if (isLoading && isAtBottomRef.current) pin(200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastContentLen, isLoading, pin]);

  /* 3b. Kết thúc streaming (isLoading: true -> false):
     Tin nhắn chuyển từ sticky footer vào virtualizer list.
     Đảm bảo virtualizer đo lại và giữ vị trí đáy mượt mà nếu đang ở đáy. */
  const prevLoadingRef = useRef(isLoading);
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      rowVirtualizer.measure();
      if (isAtBottomRef.current) pin(400);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, pin, rowVirtualizer, isAtBottomRef]);

  /* 4. Font KaTeX/mono nạp xong */
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      HEIGHT_CACHE.clear();
      rowVirtualizer.measure();
      if (isAtBottomRef.current) pin(700);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowVirtualizer, pin]);

  /* 5. Ảnh trong markdown load xong */
  useEffect(() => {
    let raf = 0;
    const onImageLoaded = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (isAtBottomRef.current) pin(300);
      });
    };
    window.addEventListener('chat:image-loaded', onImageLoaded);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('chat:image-loaded', onImageLoaded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  /* 6. Đổi nhánh */
  useEffect(() => {
    rowVirtualizer.measure();
    if (isAtBottomRef.current) pin(700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchLayoutSignature]);

  const suggestions = useMemo(
    () => [
      'Giải thích máy tính lượng tử một cách dễ hiểu',
      'Viết script Python để thu thập dữ liệu web',
    ],
    [],
  );

  const hasMessages = messages.length > 0;

  return (
    <>
      <div
        ref={scrollRef as any}
        onScroll={onScroll}
        tabIndex={0}
        role="log"
        aria-label="Danh sách tin nhắn"
        style={{ overflowAnchor: 'none' }}
        className="chat-scroll h-full overflow-hidden overflow-y-auto px-5 md:px-8 [overflow-anchor:none]"
      >
        {!hasMessages ? (
          /*
           * Gutter ngang do CHÍNH container cuộn nắm (`px-5 md:px-8` ở trên),
           * nên trang trạng thái rỗng không thêm padding nữa — trước đây nó
           * cộng thêm `px-4` và lệch khỏi cột so với mọi tin nhắn thật.
           */
          <div className="mx-auto flex h-full max-w-thread flex-col justify-center pb-20 pt-8">
            <h1 className="uic text-[28px] tracking-[0.05em] text-text-primary ">
              VYEN<span className="text-accent-steel">_</span>
            </h1>
            <p className="mt-3 max-w-prose font-sans text-xs leading-relaxed text-text-muted">
              Agent harness tối giản: session tree, core tools, tự mở rộng theo workflow của bạn.
            </p>

            <div className="mt-8 flex w-full max-w-lg flex-col gap-3">
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSelectSuggestion(prompt)}
                  className="rounded-xl border border-subtle bg-surface px-4 py-3.5 text-left font-sans text-xs text-text-primary transition-colors duration-150 hover:bg-raised"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                margin: '0 auto',
                position: 'relative',
              }}
              className="max-w-thread"
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const m = renderedMessages[virtualRow.index];
                if (!m) return null;
                /* Header chỉ thuộc tin ĐẦU của lượt; `turn` undefined là bình thường. */
                const turn = turnStartByMessageId.get(m.id);

                return (
                  <div
                    key={m.id}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    data-message-id={m.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingBottom: '1.5rem',
                    }}
                  >
                    {turn && (
                      <TurnHeader
                        turn={turn}
                        foldable={isFoldableTurn(turn.status)}
                        collapsed={collapsedTurnIds.has(turn.id)}
                        onToggleFold={toggleTurnFold}
                      />
                    )}
                    {compaction && compactionBannerBeforeId === m.id && (
                      <div className="mb-2">
                        {compaction.summary ? (
                          <details className="lift-sm rounded-lg border border-accent-dim bg-raised px-4 py-2.5 font-sans text-xs text-status-warning">
                            <summary className="cursor-pointer select-none font-medium text-accent-steel">
                              Đã nén {compaction.compactedCount} tin nhắn trước đó. Bấm để xem tóm tắt
                            </summary>
                            <div className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-meta leading-relaxed text-status-warning">
                              {compaction.summary}
                            </div>
                          </details>
                        ) : (
                          <div className="lift-sm rounded-lg border border-accent-dim bg-raised px-4 py-2.5 font-sans text-xs text-status-warning">
                            Đã lược bỏ {compaction.compactedCount} tin nhắn cũ
                          </div>
                        )}
                      </div>
                    )}
                    <ChatErrorBoundary
                      onReset={() => rowVirtualizer.measure()}
                      resetKey={`${m.id}:${m.content.length}`}
                    >
                      <MessageItem
                        m={m}
                        runPosition={runPositionById.get(m.id) ?? 'end'}
                        branchInfo={branchInfoByMessageId.get(m.id)}
                        isStreaming={isLoading && m.role === 'assistant' && m.id === lastMessageId}
                        isEditing={editingId === m.id}
                        isCopied={copiedId === m.id}
                        draft={editingId === m.id ? draft : ''}
                        isTouchDevice={isTouchDevice}
                        sendOnEnter={sendOnEnter}
                        throttleMs={throttleMs}
                        onCopy={onCopy}
                        onRegenerate={onRegenerate}
                        onSwitchBranch={onSwitchBranch}
                        onStartEdit={onStartEdit}
                        onSaveEdit={onSaveEdit}
                        onCancelEdit={onCancelEdit}
                        onDraftChange={onDraftChange}
                        onContinueGenerating={onContinueGenerating}
                        onContentResize={() => {
                          if (isAtBottomRef.current) pin(300);
                        }}
                      />
                    </ChatErrorBoundary>
                  </div>
                );
              })}
            </div>

            {isLoading &&
              !hasToolInvocations &&
              !(
                lastRole === 'assistant' &&
                ((lastMsg as any)?.reasoning || lastContentLen > 0)
              ) &&
              <ThinkingIndicator />}

            {isStreamingAssistant && lastMsg && (
              <div className="mx-auto w-full max-w-thread pb-24">
                <ChatErrorBoundary
                  onReset={() => rowVirtualizer.measure()}
                  resetKey={`${lastMsg.id}:${lastMsg.content.length}`}
                >
                  <MessageItem
                    m={lastMsg}
                    /* Tin đang stream tiếp nối khối nếu tin liền trước cũng là
                       trợ lý — cùng luật với danh sách, chỉ khác nguồn: nó nằm
                       ngoài virtualizer nên không có trong `visibleMessages`. */
                    runPosition={
                      renderedMessages[renderedMessages.length - 1]?.role === 'assistant'
                        ? 'end'
                        : 'start'
                    }
                    branchInfo={branchInfoByMessageId.get(lastMsg.id)}
                    isStreaming={true}
                    isEditing={editingId === lastMsg.id}
                    isCopied={copiedId === lastMsg.id}
                    draft={editingId === lastMsg.id ? draft : ''}
                    isTouchDevice={isTouchDevice}
                    sendOnEnter={sendOnEnter}
                    throttleMs={throttleMs}
                    onCopy={onCopy}
                    onRegenerate={onRegenerate}
                    onSwitchBranch={onSwitchBranch}
                    onStartEdit={onStartEdit}
                    onSaveEdit={onSaveEdit}
                    onCancelEdit={onCancelEdit}
                    onDraftChange={onDraftChange}
                    onContinueGenerating={onContinueGenerating}
                    onContentResize={() => {
                      if (isAtBottomRef.current) pin(300);
                    }}
                  />
                </ChatErrorBoundary>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="notice-error mx-auto mb-4 flex max-w-thread flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
            <span className="min-w-0">{friendlyErrorMessage(error.message)}</span>
            <button
              type="button"
              onClick={onReload}
              className="flex-shrink-0 rounded-lg bg-danger px-3.5 py-1.5 font-sans text-xs font-medium text-on-fill transition-colors hover:bg-danger/85"
            >
              Thử lại
            </button>
          </div>
        )}
      </div>

      {!isAtBottom && (
        <button
          type="button"
          onClick={onScrollToBottom}
          aria-label="Xuống tin nhắn mới nhất"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 lift-md rounded-full border border-subtle bg-panel-bg p-2.5 text-accent-steel transition-colors hover:border-border-hover hover:bg-panel-soft hover:text-text-primary"
        >
          <ArrowDown size={16} />
        </button>
      )}
    </>
  );
});

