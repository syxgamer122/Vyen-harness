'use client';

import { Z_CLASS, Z_INDEX } from '@/lib/ui-z';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/lib/store';
import { Search, X } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';
import { AppearanceTab } from '@/components/settings/appearance-tab';
import { ProvidersTab } from '@/components/settings/providers-tab';
import { SafetyTab } from '@/components/settings/safety-tab';
import { ExtensionsTab } from '@/components/settings/extensions-tab';
import { MemoryTab } from '@/components/settings/memory-tab';
import { DataTab } from '@/components/settings/data-tab';
import { TelemetryTab } from '@/components/settings/telemetry-tab';
import {
  SETTINGS_TABS,
  SETTINGS_SEARCH_ITEMS,
  resolveSettingsTab,
  type SettingsTab,
} from '@/components/settings/settings-tabs';

/*
 * Re-export để importer cũ không phải đổi đường dẫn — `tests/a11y-contract.test.ts`
 * đọc `SETTINGS_TABS` từ chính file này để kiểm chứng liên kết ARIA tab ↔ panel.
 */
export { SETTINGS_TABS };
export type { SettingsTab };

/** id listbox kết quả tìm — hằng số vì SettingsDialog chỉ có một bản trong DOM. */
const SEARCH_LISTBOX_ID = 'settings-search-listbox';
const searchOptionId = (itemId: string) => `settings-search-option-${itemId}`;

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settingsInitialTab = useAppStore((s) => s.settingsInitialTab);

  const initialTab = resolveSettingsTab(settingsInitialTab);
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [visited, setVisited] = useState<Set<SettingsTab>>(() => new Set<SettingsTab>([initialTab]));
  const [searchQuery, setSearchQuery] = useState('');
  /** Dòng đang được con trỏ trong listbox kết quả tìm (-1 = chưa chọn dòng nào). */
  const [searchCursor, setSearchCursor] = useState(-1);

  const panelRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const switchTab = useCallback((t: SettingsTab) => {
    setTab(t);
    setVisited((prev) => {
      if (prev.has(t)) return prev;
      const next = new Set(prev);
      next.add(t);
      return next;
    });
  }, []);

  useEffect(() => {
    if (settingsInitialTab) {
      const target = resolveSettingsTab(settingsInitialTab);
      switchTab(target);
    }
  }, [settingsInitialTab, switchTab]);

  useFocusTrap(panelRef, {
    active: true,
    onEscape: onClose,
  });

  /**
   * Roving tabindex (APG tabs): ←/→ cuộn vòng, Home/End nhảy về hai đầu.
   * Focus được chuyển bằng `tabListRef` + `[role="tab"]` chứ không phải
   * `parentElement.children[next]` — cách cũ chỉ đúng khi các nút là con trực
   * tiếp DUY NHẤT của tablist, và sẽ vỡ ngay nếu mai mốt thêm một node trang trí.
   */
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = SETTINGS_TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % SETTINGS_TABS.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length
          : e.key === 'Home'
            ? 0
            : SETTINGS_TABS.length - 1;
    switchTab(SETTINGS_TABS[next].id);
    const tabs = tabListRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs?.[next]?.focus();
  };

  /* Tìm kiếm trong cài đặt */
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return SETTINGS_SEARCH_ITEMS.filter((item) => {
      const haystack = `${item.title} ${item.description} ${item.keywords}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery]);

  const searchOpen = searchQuery.trim().length > 0;

  const handleSelectSearchResult = (targetTab: SettingsTab) => {
    switchTab(targetTab);
    setSearchQuery('');
    setSearchCursor(-1);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!searchOpen) return;
    const last = searchResults.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Danh sách rỗng: giữ con trỏ ở -1, Enter không có gì để chọn.
      setSearchCursor(last < 0 ? -1 : (searchCursor + 1) % (last + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchCursor(last < 0 ? -1 : (searchCursor <= 0 ? last : searchCursor - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = searchResults[searchCursor];
      if (picked) handleSelectSearchResult(picked.tab);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSearchCursor(-1);
      searchInputRef.current?.blur();
    }
  };

  // Gõ lại thì con trỏ về dòng đầu, nếu không nó trỏ sang vị trí cũ của
  // danh sách ngắn hơn (hoặc treo lơ lửng ở -1).
  useEffect(() => {
    setSearchCursor(-1);
  }, [searchQuery]);

  /* Đóng drawer sidebar mobile nếu đang mở để không kẹt dưới modal */
  useEffect(() => {
    useAppStore.getState().setSidebarOpen(false);
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      /*
       * `Z_CLASS.system` = `z-[100]` — một class ARBITRARY nằm trong hằng số
       * `lib/ui-z.ts`, mà `tailwind.config.ts` chỉ quét `pages|components|app`.
       * Tailwind không thấy nó ở đâu nên KHÔNG sinh rule `.z-\[100\]{z-index:100}`
       * → backdrop rơi về `z-index:auto`, và nội dung trang (composer dính
       * `sticky` + `z-20`) vẽ ĐÈ lên modal. Đo trong Chrome: cùng một dải
       * y=532..627, chuột ở trên dialog nhưng `elementFromPoint` trả về node
       * của trang, và bánh xe cuộn KHÔNG cuộn được panel.
       *
       * Vì vậy lớp z đặt bằng inline `style` — luôn thật, không phụ thuộc
       * safelist. `Z_CLASS` vẫn được giữ nguyên ở đây để khai báo ý định.
       */
      style={{ zIndex: Z_INDEX.system }}
      className={`fixed inset-0 ${Z_CLASS.system} flex animate-fade-in items-center justify-center bg-sunken/70 p-3 sm:p-4`}
    >
      {/*
       * PHẳNG, không kính. `.glass-panel` ép `box-shadow` drop-shadow bằng
       * `!important` — thứ mà hợp đồng token cấm (`.lift-sm` / `.lift-md` là
       * hai `box-shadow` hợp lệ DUY NHẤT). Modal là tầng trên cùng nên đủ tư
       *ơng để tách khỏi nền: `bg-overlay` + `shadow-lift-lg`.
       */}
      {/*
       * Trần chiều cao. Số 70vh không phải ngẫu nhiên: 85vh cũ ép modal phủ 85%
       * chiều cao màn hình — đọc như một tấm kín dán lên trang dù thực tế chỉ
       * chiếm 56% DIỆN TÍCH. Bỏ hẳn trần còn tệ hơn: thử nghiệm đo được modal
       * phủ 96-97% chiều cao, vì nội dung 6 tab dài là 914-1782px, lớn hơn màn
       * hình, nên thứ giữ nó lại chỉ có thể là trần.
       *
       * `min(...)` với `100dvh` để không bao giờ tràn trên màn hình thấp; `w-full`
       * + `max-w-4xl` phía dưới giữ chiều rộng không đổi so với trước.
       *
       * Lưu ý: bỏ `flex-1` ở hàng bên dưới KHÔNG phải nguyên nhân chuyện này —
       * nó chỉ quyết định trường hợp tab NGẮN hơn trần (Telemetry co được nhờ
       * đó). 6 tab dài hơn trần thì `flex-1` có hay không đều bị trần ép.
       */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabIndex={-1}
        className="relative flex max-h-[min(70vh,calc(100dvh-3rem))] w-full max-w-4xl flex-col overflow-hidden lift-lg rounded-2xl border border-default bg-overlay font-mono shadow-lift-lg focus:outline-none"
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-subtle bg-raised px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-dim text-micro font-bold text-accent">
              $
            </span>
            <div className="flex items-center gap-2">
              <h2
                id="settings-dialog-title"
                className="text-ui font-semibold uppercase tracking-wider text-primary"
              >
                Studio Settings
              </h2>
              <span className="hidden items-center text-micro text-tertiary sm:inline-flex">
                <kbd className="rounded-full border border-subtle bg-sunken px-2 py-0.5 text-micro text-secondary">
                  ⌘,
                </kbd>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cài đặt"
            className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-subtle bg-raised text-secondary transition-colors after:absolute after:-inset-[8px] after:content-[''] hover:border-strong hover:text-primary"
          >
            <X size={15} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative flex-shrink-0 border-b border-subtle bg-surface px-4 py-1.5">
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary"
            />
            <input
              ref={searchInputRef}
              type="search"
              role="combobox"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Tìm cài đặt (vd: hiệu ứng, temperature, mcp, sao lưu, quyền, routing...)"
              className="field-sm w-full pl-8"
              aria-label="Tìm kiếm trong cài đặt"
              aria-autocomplete="list"
              aria-expanded={searchOpen}
              aria-controls={searchOpen ? SEARCH_LISTBOX_ID : undefined}
              aria-activedescendant={
                searchCursor >= 0 && searchResults[searchCursor]
                  ? searchOptionId(searchResults[searchCursor].id)
                  : undefined
              }
            />
          </div>

          {searchOpen && (
            <div className="surface-panel absolute left-4 right-4 top-full z-20 mt-1 max-h-56 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="px-3 py-3 text-ui leading-relaxed text-tertiary">
                  Không có cài đặt nào khớp &ldquo;{searchQuery.trim()}&rdquo;. Thử từ khoá ngắn
                  hơn (ví dụ: <span className="text-secondary">mcp</span>,{' '}
                  <span className="text-secondary">sao lưu</span>,{' '}
                  <span className="text-secondary">quyền</span>).
                </p>
              ) : (
                <div id={SEARCH_LISTBOX_ID} role="listbox" aria-label="Kết quả tìm cài đặt">
                  {searchResults.map((item, idx) => {
                    const tabMeta = SETTINGS_TABS.find((t) => t.id === item.tab);
                    const active = idx === searchCursor;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        id={searchOptionId(item.id)}
                        aria-selected={active}
                        onClick={() => handleSelectSearchResult(item.tab)}
                        onPointerEnter={() => setSearchCursor(idx)}
                        className={`flex w-full items-start justify-between gap-2 border-b border-subtle p-2.5 text-left text-ui transition-colors last:border-b-0 ${
                          active ? 'bg-raised' : 'hover:bg-raised'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-primary">{item.title}</div>
                          <div className="text-meta text-tertiary">{item.description}</div>
                        </div>
                        <span className="flex-shrink-0 rounded-full border border-subtle bg-sunken px-2 py-0.5 text-micro text-accent">
                          {tabMeta?.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2-Column Body: Left Sidebar Nav + Right Content Panel */}
        {/*
         * KHÔNG dùng `flex-1` ở đây. Panel cha cao theo nội dung, nên hàng này
         * `flex-1` sẽ giãn hết khoảng trống của cha, khiến modal cao tối đa
         * dù tab nào chỉ có vài dòng. `flex-row` + cột trái `sm:w-56` đã đủ để
         * xếp cạnh nhau; cột phải tự cao theo nội dung rồi mới cuộn trong nó.
         *
         * Cần phân biệt: đây KHÔNG phải thứ gây ra hiện tượng "modal che màn
         * hình" trước đây — trần 85vh trên panel cha mới là thứ đó. Sửa ở đây
         * chỉ giúp các tab NGẮN hơn trần co lại đúng bằng nội dung.
         */}
        <div className="flex min-h-0 flex-col overflow-hidden sm:flex-row">
          {/* Left Navigation Sidebar */}
          <div className="flex-shrink-0 overflow-x-auto border-b border-subtle bg-surface p-1.5 sm:w-48 sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r sm:border-subtle sm:p-2">
            <div
              ref={tabListRef}
              className="flex gap-1 sm:flex-col"
              role="tablist"
              aria-label="Nhóm cài đặt"
            >
              {SETTINGS_TABS.map((t) => {
                const Icon = t.icon;
                const isActive = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`settings-tab-${t.id}`}
                    aria-selected={isActive}
                    aria-controls={`settings-panel-${t.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => switchTab(t.id)}
                    onKeyDown={onTabKeyDown}
                    className={`flex flex-shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left font-mono text-ui transition-colors duration-150 ${
                      isActive
                        ? 'border-strong bg-raised font-medium text-accent'
                        : 'border-transparent text-secondary hover:border-subtle hover:bg-raised hover:text-primary'
                    }`}
                  >
                    <Icon size={14} className={isActive ? 'text-accent' : 'text-tertiary'} />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Content Panels Container */}
          {/* Không `flex-1`: cột này phảI cao theo nội dung tab đang mở, không
              phải cao theo khoảng trống còn lại của hàng. `min-h-0` giữ cho nó
              cuộn được khi nội dung dài hơn trần của panel cha. */}
          <div className="min-h-0 w-full overflow-y-auto bg-sunken sm:flex-1">
            {/* TAB 1: GIAO DIỆN & TRẢI NGHIỆM */}
            <div
              role="tabpanel"
              id="settings-panel-appearance"
              aria-labelledby="settings-tab-appearance"
              hidden={tab !== 'appearance'}
              className={`settings-panel p-3 sm:p-4 ${tab === 'appearance' ? 'block' : 'hidden'}`}
            >
              {visited.has('appearance') && <AppearanceTab />}
            </div>

            {/* TAB 2: MODEL & NHÀ CUNG CẤP */}
            <div
              role="tabpanel"
              id="settings-panel-providers"
              aria-labelledby="settings-tab-providers"
              hidden={tab !== 'providers'}
              className={`settings-panel p-3 sm:p-4 ${tab === 'providers' ? 'block' : 'hidden'}`}
            >
              {visited.has('providers') && <ProvidersTab />}
            </div>

            {/* TAB 3: QUYỀN & AN TOÀN */}
            <div
              role="tabpanel"
              id="settings-panel-safety"
              aria-labelledby="settings-tab-safety"
              hidden={tab !== 'safety'}
              className={`settings-panel p-3 sm:p-4 ${tab === 'safety' ? 'block' : 'hidden'}`}
            >
              {visited.has('safety') && <SafetyTab />}
            </div>

            {/* TAB 4: MỞ RỘNG */}
            <div
              role="tabpanel"
              id="settings-panel-extensions"
              aria-labelledby="settings-tab-extensions"
              hidden={tab !== 'extensions'}
              className={`settings-panel p-3 sm:p-4 ${tab === 'extensions' ? 'block' : 'hidden'}`}
            >
              {visited.has('extensions') && <ExtensionsTab />}
            </div>

            {/* TAB 5: BỘ NHỚ */}
            <div
              role="tabpanel"
              id="settings-panel-memory"
              aria-labelledby="settings-tab-memory"
              hidden={tab !== 'memory'}
              className={`settings-panel p-3 sm:p-4 ${tab === 'memory' ? 'block' : 'hidden'}`}
            >
              {visited.has('memory') && <MemoryTab />}
            </div>

            {/* TAB 6: DỮ LIỆU & TỰ ĐỘNG HOÁ */}
            <div
              role="tabpanel"
              id="settings-panel-data"
              aria-labelledby="settings-tab-data"
              hidden={tab !== 'data'}
              className={`settings-panel p-3 sm:p-4 ${tab === 'data' ? 'block' : 'hidden'}`}
            >
              {visited.has('data') && <DataTab />}
            </div>

            {/* TAB 7: ĐO ĐẠC & QUAN SÁT (TELEMETRY) */}
            <div
              role="tabpanel"
              id="settings-panel-telemetry"
              aria-labelledby="settings-tab-telemetry"
              hidden={tab !== 'telemetry'}
              className={`settings-panel p-3 sm:p-4 ${tab === 'telemetry' ? 'block' : 'hidden'}`}
            >
              {visited.has('telemetry') && <TelemetryTab />}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
