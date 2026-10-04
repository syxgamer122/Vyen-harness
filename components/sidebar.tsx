'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteChatCascade, type ChatSession } from '@/lib/db';
import { chatBroadcast } from '@/lib/chat-broadcast';
import { useAppStore } from '@/lib/store';
import { searchChats, type ChatSearchResult } from '@/lib/chat-search';
import { groupChatsByDate } from '@/lib/date-groups';
import { exportJson, exportMarkdown } from '@/lib/backup';
import { Highlight } from '@/components/highlight';
import type { SnippetSegment } from '@/lib/search-utils';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { MD_QUERY, useMediaQuery } from '@/lib/hooks/use-media-query';
import { BackupReminder } from '@/components/backup-reminder';
import { VyenLogo } from '@/components/vyen-logo';
import { Z_CLASS } from '@/lib/ui-z';
import {
  Plus, Pin, Trash2, Search, Settings as SettingsIcon,
  X, MoreHorizontal, FileJson, FileText, Loader2, PanelLeftClose, PanelLeftOpen,
  Pencil, ExternalLink, Play,
} from 'lucide-react';

const EMPTY_CHATS: ChatSession[] = [];
const CHAT_PAGE_SIZE = 200;

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface ChatItemProps {
  chat: ChatSession;
  isActive: boolean;
  titleSegments?: SnippetSegment[];
  snippets?: SnippetSegment[][];
  extraHits?: number;
  onSelect: (id: string) => void;
  onTogglePin: (id: string, currentPin: 0 | 1) => void;
  onDelete: (id: string) => void;
  onExport: (id: string, format: 'json' | 'md') => void;
  onRename?: (id: string, newTitle: string) => void;
}

const ChatItem = memo(function ChatItem({
  chat, isActive, titleSegments, snippets, extraHits,
  onSelect, onTogglePin, onDelete, onExport, onRename,
}: ChatItemProps) {
  const [menuRect, setMenuRect] = useState<{ top: number; right: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chat.title);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuOpen = menuRect !== null;

  useEffect(() => {
    if (!isEditing) setEditTitle(chat.title);
  }, [chat.title, isEditing]);

  const handleSaveRename = useCallback(() => {
    setIsEditing(false);
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== chat.title) {
      onRename?.(chat.id, trimmed);
    } else {
      setEditTitle(chat.title);
    }
  }, [editTitle, chat.title, chat.id, onRename]);

  const openMenu = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setMenuRect({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };
  const closeMenu = useCallback(() => setMenuRect(null), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) closeMenu();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeMenu(); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [menuOpen, closeMenu]);

  const menu = menuOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Tuỳ chọn cuộc trò chuyện"
          style={{ position: 'fixed', top: menuRect.top, right: menuRect.right }}
          className={`surface-panel ${Z_CLASS.dropdown} w-52 animate-pop-in rounded-xl border border-default bg-overlay p-1.5 font-mono`}
        >
          <button
            type="button" role="menuitem"
            onClick={() => { onSelect(chat.id); closeMenu(); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-ui text-primary transition-colors duration-150 hover:bg-raised hover:text-primary"
          >
            <Play size={13} className="text-accent" />
            Tiếp tục (Resume)
          </button>
          <button
            type="button" role="menuitem"
            onClick={() => { setIsEditing(true); closeMenu(); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-ui text-primary transition-colors duration-150 hover:bg-raised hover:text-primary"
          >
            <Pencil size={13} className="text-accent" />
            Đổi tên phiên
          </button>
          <button
            type="button" role="menuitem"
            onClick={() => {
              /* `noopener` bắt buộc: không có nó, tab mới mở ra nhận
                 `window.opener` trỏ về app này và bất kỳ script nào chạy trong
                 đó đều điều khiển được app (đọc IndexedDB chứa lịch sử chat,
                 provider key). encodeURIComponent để id chứa ký tự lạ không
                 phá URL. */
              window.open(`/?chatId=${encodeURIComponent(chat.id)}`, '_blank', 'noopener,noreferrer');
              closeMenu();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-ui text-primary transition-colors duration-150 hover:bg-raised hover:text-primary"
          >
            <ExternalLink size={13} className="text-accent" />
            Mở cửa sổ mới
          </button>
          <div className="my-1 border-t border-subtle" />
          <button
            type="button" role="menuitem"
            onClick={() => { onTogglePin(chat.id, (chat.pinned ?? 0) as 0 | 1); closeMenu(); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-ui text-primary transition-colors duration-150 hover:bg-raised hover:text-primary"
          >
            <Pin size={13} className="text-accent" />
            {chat.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}
          </button>
          <button
            type="button" role="menuitem"
            onClick={() => { onExport(chat.id, 'json'); closeMenu(); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-ui text-primary transition-colors duration-150 hover:bg-raised hover:text-primary"
          >
            <FileJson size={13} className="text-accent" /> Xuất JSON
          </button>
          <button
            type="button" role="menuitem"
            onClick={() => { onExport(chat.id, 'md'); closeMenu(); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-ui text-primary transition-colors duration-150 hover:bg-raised hover:text-primary"
          >
            <FileText size={13} className="text-accent" /> Xuất Markdown
          </button>
          <div className="my-1 border-t border-subtle" />
          <button
            type="button" role="menuitem"
            onClick={() => { onDelete(chat.id); closeMenu(); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-ui text-danger transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 size={13} /> Xóa cuộc trò chuyện
          </button>
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      className={`group relative flex w-full flex-col rounded-lg text-left transition-colors duration-150 ease-out ${
        isActive
          ? 'bg-overlay font-sans font-semibold text-primary'
          : 'font-sans text-secondary hover:bg-raised hover:text-primary'
      }`}
    >
      {/*
        SỰ CHỌN ĐƯỢC BÁO HAI LẦN, không chỉ bằng màu:
        1. hàng tụt xuống đúng một bậc nền (`bg-overlay`) — hàng chỉ hover mới lên
           `bg-raised`, nên hai trạng thái không lẫn vào nhau;
        2. chuyển sang `font-semibold`.

        Trước đây còn một vạch 3px gradient ở mép trái. Vạch đó là ĐƯỜNG TRANG
        TRÍ thứ ba cho cùng một thông tin (nền + đậm chữ đã đủ), và nó ép mọi
        hàng phải có bo góc vuông ở mép trái để vạch không bị lệch. Nay bỏ
        vạch, hàng bo tròn 10px — mềm hơn và ít viền hơn.
      */}
      <div className="flex w-full items-center justify-between gap-1 px-3 py-2">
        {isEditing ? (
          <input
            autoFocus
            type="text"
            aria-label="Đổi tên cuộc trò chuyện"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setIsEditing(false);
                setEditTitle(chat.title);
              }
            }}
            onBlur={handleSaveRename}
            className="w-full rounded-md border border-strong bg-raised px-2 py-1 font-sans text-ui text-primary outline-none focus:border-accent"
          />
        ) : (
          <button
            type="button"
            onClick={() => onSelect(chat.id)}
            onDoubleClick={() => setIsEditing(true)}
            aria-current={isActive ? 'page' : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 -mx-1.5 text-left outline-none"
          >
            <span className="truncate text-ui">{titleSegments ? <Highlight segments={titleSegments} /> : chat.title}</span>
          </button>
        )}

        <div className="flex items-center gap-0.5">
          {chat.pinned && <Pin size={10} className="rotate-45 text-warning" aria-label="Đã ghim" />}
          <button
            ref={triggerRef}
            type="button"
            aria-label="Tùy chọn cuộc trò chuyện"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => (menuOpen ? closeMenu() : openMenu())}
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-tertiary transition-all hover:bg-overlay hover:text-primary ${
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
            }`}
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>

      {snippets?.length ? (
        <div className="px-3 pb-2.5">
          {snippets.slice(0, 2).map((seg, i) => (
            <p key={i} className="truncate text-meta leading-relaxed text-tertiary">
              <Highlight segments={seg} />
            </p>
          ))}
          {extraHits ? (
            <p className="text-meta text-tertiary">+{extraHits} kết quả khác</p>
          ) : null}
        </div>
      ) : null}

      {menu}
    </div>
  );
});

interface SearchState {
  query: string;
  results: ChatSearchResult[];
}

export function Sidebar() {
  const currentChatId = useAppStore((s) => s.currentChatId);
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const isSidebarCollapsed = useAppStore((s) => s.isSidebarCollapsed);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  const isDesktop = useMediaQuery(MD_QUERY);
  const isDrawerHidden = !isDesktop && !isSidebarOpen;
  const collapsed = isDesktop && isSidebarCollapsed;

  useEffect(() => {
    if (isDesktop && isSidebarOpen) {
      setSidebarOpen(false);
    }
  }, [isDesktop, isSidebarOpen, setSidebarOpen]);

  const [searchQuery, setSearchQuery] = useState('');
  const [search, setSearch] = useState<SearchState | null>(null);
  const [searchError, setSearchError] = useState(false);
  const debouncedQuery = useDebouncedValue(searchQuery, 250);
  const trimmedQuery = debouncedQuery.trim();

  const chats =
    useLiveQuery(
      () => db.chats.orderBy('updatedAt').reverse().limit(CHAT_PAGE_SIZE).toArray(),
      [],
    ) ?? EMPTY_CHATS;

  const isSearching = trimmedQuery.length > 0 && search?.query !== trimmedQuery && !searchError;
  const showingSearch = trimmedQuery.length > 0;

  useEffect(() => {
    if (!trimmedQuery) {
      setSearch(null);
      setSearchError(false);
      return;
    }
    const controller = new AbortController();
    setSearchError(false);

    (async () => {
      try {
        const results = await searchChats(trimmedQuery, { signal: controller.signal });
        if (!controller.signal.aborted) setSearch({ query: trimmedQuery, results });
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        console.error('[Sidebar] search error:', err);
        setSearch({ query: trimmedQuery, results: [] });
        setSearchError(true);
      }
    })();

    return () => controller.abort();
  }, [trimmedQuery]);

  const handleSelect = useCallback((id: string) => {
    useAppStore.getState().setCurrentChatId(id);
    if (window.matchMedia('(max-width: 767px)').matches) {
      useAppStore.getState().setSidebarOpen(false);
    }
  }, []);

  const newChatBusyRef = useRef(false);

  const handleNewChat = useCallback(async () => {
    if (newChatBusyRef.current) return;
    newChatBusyRef.current = true;
    try {
      const recent = await db.chats.orderBy('updatedAt').reverse().limit(5).toArray();
      for (const c of recent) {
        const count = await db.messages.where('chatId').equals(c.id).count();
        if (count === 0) {
          useAppStore.getState().setCurrentChatId(c.id);
          return;
        }
      }
      const id = newId();
      const now = Date.now();
      await db.chats.add({ id, title: 'Cuộc trò chuyện mới', pinned: 0, createdAt: now, updatedAt: now });
      useAppStore.getState().setCurrentChatId(id);
    } finally {
      newChatBusyRef.current = false;
    }
  }, []);

  const handleTogglePin = useCallback(async (id: string, cur: 0 | 1) => {
    /*
     * KHÔNG chạm `updatedAt`. Nhóm ngày trong sidebar xếp theo `updatedAt`
     * (lib/date-groups.ts), nên ghim một chat cũ — hoặc BỎ ghim — sẽ đẩy nó
     * lên nhóm "Hôm nay" và làm nó nhảy lên đầu danh sách. Ghim là thay đổi
     * vị trí, không phải thay đổi nội dung, nên nó không được sửa dòng thời gian.
     */
    await db.chats.update(id, { pinned: cur === 1 ? 0 : 1 });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa cuộc trò chuyện này?')) return;
    await deleteChatCascade(id);
    chatBroadcast.publish({
      type: 'chat-deleted',
      sessionId: id,
      mutationId: crypto.randomUUID(),
    });
    if (useAppStore.getState().currentChatId === id) {
      useAppStore.getState().setCurrentChatId(null);
    }
  }, []);

  const handleExport = useCallback(async (id: string, format: 'json' | 'md') => {
    if (format === 'json') await exportJson(id);
    else await exportMarkdown(id);
  }, []);

  const handleRename = useCallback(async (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const { tokenize } = await import('@/lib/search-utils');
    await db.chats.update(id, {
      title: trimmed,
      titleTokens: tokenize(trimmed),
      updatedAt: Date.now(),
    });
  }, []);

  /*
   * `now` đặt ở state chứ không gọi thẳng `Date.now()` trong `useMemo`: nếu
   * không, "Hôm nay" chỉ đổi khi `chats` đổi — tức là lúc 00:00 danh sách vẫn
   * giữ nhóm của hôm qua cho tới lần gõ tiếng. Tick 60s là đủ thô cho một
   * nhóm ngày. setState cùng giá trị là no-op nên interval không render lại vô ích.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const groups = useMemo(
    () => (showingSearch ? [] : groupChatsByDate(chats, now)),
    [chats, showingSearch, now],
  );

  useEffect(() => {
    if (!isSidebarOpen || isDesktop) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [isSidebarOpen, isDesktop, setSidebarOpen]);

  const visibleResults = search?.query === trimmedQuery ? search.results : null;

  return (
    <>
      {isSidebarOpen && !isDesktop && (
        <div
          role="presentation"
          onClick={() => setSidebarOpen(false)}
          className={`fixed inset-0 ${Z_CLASS.sidebarBackdrop} bg-sunken/70 animate-fade-in md:hidden`}
        />
      )}

      {!collapsed && (
        <aside
          aria-label="Danh sách cuộc trò chuyện"
          aria-hidden={isDrawerHidden ? true : undefined}
          inert={isDrawerHidden ? true : undefined}
          className={`fixed inset-y-0 left-0 ${Z_CLASS.sidebarDrawer} flex w-[18rem] max-w-[85vw] flex-col border-r border-subtle bg-sunken pt-[env(safe-area-inset-top)] transition-transform duration-200 ease-out md:static md:w-72 md:max-w-none md:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <VyenLogo size="sm" />
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Thu gọn thanh bên"
                title="Thu gọn (Ctrl+\)"
                onClick={() => setSidebarCollapsed(true)}
                className="hidden h-7 w-7 items-center justify-center rounded-lg text-tertiary transition-colors hover:bg-raised hover:text-primary md:inline-flex"
              >
                <PanelLeftClose size={15} />
              </button>
              <button
                type="button"
                aria-label="Đóng thanh bên"
                onClick={() => setSidebarOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-tertiary transition-colors hover:bg-raised hover:text-primary md:hidden"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="px-4 pb-3">
            <button
              type="button"
              onClick={handleNewChat}
              className="lift-sm flex w-full items-center justify-center gap-2 rounded-wobble border-2 border-default bg-accent-mint/60 px-4 py-2.5 font-mono text-ui text-primary transition-all duration-150 hover:bg-accent-mint/80 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <Plus size={15} className="text-accent" />
              <span>$ new session</span>
            </button>
          </div>

          <BackupReminder chatCount={chats.length} />

          <div className="px-4 pb-3">
            <div className="relative flex items-center">
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 text-tertiary" />
              <input
                type="search"
                aria-label="Tìm trong các cuộc trò chuyện"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="$ /search..."
                className="well w-full rounded-wobble border-2 border-default bg-base py-2.5 pl-9 pr-8 font-mono text-ui text-primary outline-none transition-colors duration-150 placeholder:text-tertiary focus:border-accent"
              />
              {isSearching ? (
                <Loader2 size={12} aria-hidden="true" className="absolute right-2 animate-spin text-accent" />
              ) : searchQuery ? (
                <button
                  type="button"
                  aria-label="Xóa từ khóa"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 flex h-5 w-5 items-center justify-center rounded-full text-tertiary transition-colors hover:bg-raised hover:text-primary"
                >
                  <X size={11} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-1">
            {showingSearch ? (
              <div aria-busy={isSearching} className="flex flex-col gap-1">
                {visibleResults === null ? (
                  <div className="py-8 text-center text-ui text-tertiary">
                    <Loader2 size={14} className="mx-auto animate-spin" />
                    <span className="sr-only">Đang tìm kiếm…</span>
                  </div>
                ) : visibleResults.length === 0 ? (
                  <div className="py-8 text-center text-ui text-tertiary">
                    {searchError ? 'Tìm kiếm gặp lỗi' : 'Không tìm thấy kết quả'}
                  </div>
                ) : (
                  visibleResults.map((res) => (
                    <ChatItem
                      key={res.chat.id}
                      chat={res.chat}
                      isActive={res.chat.id === currentChatId}
                      titleSegments={res.titleSegments}
                      snippets={res.snippets}
                      extraHits={res.extraHits}
                      onSelect={handleSelect}
                      onTogglePin={handleTogglePin}
                      onDelete={handleDelete}
                      onExport={handleExport}
                      onRename={handleRename}
                    />
                  ))
                )}
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.label} className="pt-2">
                  <h2 className="px-3 pb-1.5 pt-1 uic text-meta font-semibold uppercase tracking-[0.08em] text-accent">
                    $ {g.label}
                  </h2>
                  <div className="flex flex-col gap-1">
                    {g.chats.map((c) => (
                      <ChatItem
                        key={c.id}
                        chat={c}
                        isActive={c.id === currentChatId}
                        onSelect={handleSelect}
                        onTogglePin={handleTogglePin}
                        onDelete={handleDelete}
                        onExport={handleExport}
                        onRename={handleRename}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-subtle px-3 pb-[env(safe-area-inset-bottom)] pt-2 font-mono">
            <button
              type="button"
              onClick={() => {
                if (!isDesktop) setSidebarOpen(false);
                setSettingsOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-meta text-tertiary transition-colors duration-150 hover:bg-raised hover:text-primary"
            >
              <SettingsIcon size={13} />
              <span>Cài đặt</span>
            </button>
          </div>
        </aside>
      )}

      {collapsed && (
        <aside
          aria-label="Thanh bên thu gọn"
          className="hidden w-14 flex-col items-center border-r border-subtle bg-sunken pt-[env(safe-area-inset-top)] transition-colors duration-200 md:static md:flex md:w-14 md:flex-shrink-0"
        >
          <div className="flex flex-col items-center gap-1 py-2">
            <button
              type="button"
              aria-label="Mở rộng thanh bên"
              title="Mở rộng (Ctrl+\)"
              onClick={() => setSidebarCollapsed(false)}
              className="icon-btn h-9 w-9"
            >
              <PanelLeftOpen size={16} />
            </button>
            <button
              type="button"
              aria-label="Đoạn chat mới"
              title="Đoạn chat mới (Ctrl+Alt+N)"
              onClick={() => void handleNewChat()}
              className="icon-btn h-9 w-9"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex-1" />
          <div className="flex flex-col items-center gap-1 py-2 pb-[env(safe-area-inset-bottom)]">
            <button
              type="button"
              aria-label="Cài đặt"
              title="Cài đặt"
              onClick={() => {
                if (!isDesktop) setSidebarOpen(false);
                setSettingsOpen(true);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-tertiary transition-colors hover:bg-raised hover:text-primary"
            >
              <SettingsIcon size={14} />
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
