'use client';

import { Z_CLASS } from '@/lib/ui-z';
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { TOOL_CATEGORY_ICON_COMPONENTS } from '@/components/tool-category-icons';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';
import {
  ALL_TOOL_CATEGORIES,
  TOOL_CATALOG,
  TOOL_CATEGORY_LABELS,
  toolsByCategory,
  type ToolCatalogEntry,
  type ToolCategory,
} from '@/lib/tool-catalog';
import {
  PERMISSION_OPTIONS,
  useAppStore,
  type PermissionOverride,
  type ToolPermissions,
} from '@/lib/store';

/* Pure helpers: export để test thuần (repo không có hạ tầng DOM). */

export interface ToolPanelSection {
  category: ToolCategory;
  label: string;
  icon: string;
  tools: readonly ToolCatalogEntry[];
}

/**
 * 8 section theo đúng thứ tự ALL_TOOL_CATEGORIES; tool trong nhóm giữ thứ tự
 * TOOL_CATALOG. Catalog là dữ liệu tĩnh nên kết quả xác định qua mọi lần gọi.
 */
export function buildPanelSections(): ToolPanelSection[] {
  const byCategory = toolsByCategory();
  return ALL_TOOL_CATEGORIES.map((category) => ({
    category,
    label: TOOL_CATEGORY_LABELS[category].label,
    icon: TOOL_CATEGORY_LABELS[category].icon,
    tools: byCategory[category],
  }));
}

/**
 * Lọc tool theo tên / mô tả / shortLabel, không phân biệt hoa thường.
 * Query rỗng (hoặc chỉ khoảng trắng) trả nguyên danh sách; query có từ khoá
 * thì nhóm rỗng bị bỏ để section không hiện header chết.
 */
export function filterPanelSections(
  sections: ToolPanelSection[],
  query: string,
): ToolPanelSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  return sections
    .map((section) => ({
      ...section,
      tools: section.tools.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.shortLabel.toLowerCase().includes(q),
      ),
    }))
    .filter((section) => section.tools.length > 0);
}

const PERMISSION_VALUES: readonly PermissionOverride[] = ['default', 'auto', 'ask', 'deny'];

/**
 * Đổi quyền MỘT category, bất biến: trả bản sao mới, giữ nguyên 7 nhóm còn lại
 * và không sửa object đầu vào. Value lạ ném lỗi để bug UI nổ ngay ở dev.
 */
export function updateToolPermission(
  permissions: ToolPermissions,
  category: ToolCategory,
  value: PermissionOverride,
): ToolPermissions {
  if (!PERMISSION_VALUES.includes(value)) {
    throw new Error(`Giá trị quyền không hợp lệ: ${value}`);
  }
  return { ...permissions, [category]: value };
}

/* UI */

/**
 * Panel "Công cụ & quyền": toàn bộ catalog tool của agent nhóm theo 8 category,
 * kèm quyền auto-pilot theo nhóm. Đây là bản GUI của `vyen tool list` / /tools:
 * người dùng xem được AI có tool gì, tool nào chạy ở đâu, và chặn/đặt quyền.
 */
export function ToolsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toolPermissions = useAppStore((s) => s.settings.toolPermissions);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [query, setQuery] = useState('');

  const sections = useMemo(() => filterPanelSections(buildPanelSections(), query), [query]);
  const shown = sections.reduce((acc, s) => acc + s.tools.length, 0);

  const containerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useFocusTrap(containerRef, {
    active: open,
    onEscape: onClose,
  });

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tools-panel-title"
      className={`fixed inset-0 ${Z_CLASS.navigation} flex justify-end bg-black/60`}
      onClick={onClose}
    >
      <aside
        className="flex h-full w-[min(30rem,100vw)] flex-col overflow-hidden rounded-none border border-subtle bg-overlay font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-subtle bg-raised px-4 py-3">
          <div className="min-w-0">
            <h2 id="tools-panel-title" className="flex items-center gap-2 text-read font-semibold text-primary">
              <span className="font-bold text-accent">$</span>
              <span className="text-accent">tools</span>
              <span>
                · {TOOL_CATALOG.length} tool · {ALL_TOOL_CATEGORIES.length} nhóm
              </span>
            </h2>
            <div className="text-meta text-tertiary">
              Toàn bộ tool AI đang có, nhóm theo loại, kèm quyền chạy.
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng panel công cụ"
            className="icon-btn icon-btn-md relative rounded-none after:absolute after:-inset-[6px] after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            <X size={14} />
          </button>
        </div>

        <div className="border-b border-subtle px-3 py-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lọc theo tên, mô tả hoặc nhãn..."
            aria-label="Tìm tool"
            className="field-sm"
          />
          {query.trim() && (
            <div role="status" className="mt-1 px-1 text-micro text-tertiary">
              {shown} / {TOOL_CATALOG.length} tool
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {sections.map((section) => {
            const Icon = TOOL_CATEGORY_ICON_COMPONENTS[section.icon];
            return (
              <section
                key={section.category}
                aria-label={section.label}
                className="border-b border-subtle last:border-b-0"
              >
                <div className="flex items-center gap-2 bg-raised px-3 py-2">
                  {Icon && <Icon size={13} className="flex-none text-accent" aria-hidden="true" />}
                  <span className="flex-none text-ui font-semibold text-primary">
                    {section.label}
                  </span>
                  <span className="flex-none text-meta text-tertiary">
                    {section.tools.length} tool
                  </span>
                  <span className="min-w-1 flex-1" />
                  <label
                    htmlFor={`tools-panel-perm-${section.category}`}
                    className="sr-only"
                  >
                    Quyền nhóm {section.label}
                  </label>
                  <select
                    id={`tools-panel-perm-${section.category}`}
                    value={toolPermissions[section.category] ?? 'default'}
                    onChange={(e) => {
                      updateSettings({
                        toolPermissions: updateToolPermission(
                          toolPermissions,
                          section.category,
                          e.target.value as PermissionOverride,
                        ),
                      });
                    }}
                    className="field-sm min-h-[38px] w-[7.5rem] flex-none text-meta"
                  >
                    {PERMISSION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <ul>
                  {section.tools.map((tool) => (
                    <li key={tool.name} className="border-t border-subtle px-3 py-2">
                      <div className="flex items-baseline gap-2">
                        <span className="flex-none text-ui text-primary">{tool.name}</span>
                        <span className="min-w-0 flex-1 truncate text-meta text-tertiary">
                          {tool.shortLabel}
                        </span>
                        {tool.desktopOnly && (
                          <span
                            title="Chỉ chạy ở bản desktop, cần desktop bridge đang kết nối"
                            className="flex-none text-micro text-tertiary"
                          >
                            chỉ bản desktop
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-meta leading-relaxed text-tertiary">
                        {tool.description}
                      </p>
                      <p className="text-micro text-tertiary">
                        {tool.kind === 'client' ? 'chạy trên máy người dùng' : 'chạy trên backend'}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {sections.length === 0 && (
            <div role="status" className="px-3 py-8 text-center text-ui text-tertiary">
              Không có tool khớp &quot;{query.trim()}&quot;.
            </div>
          )}
        </div>

        <div className="border-t border-subtle bg-raised px-4 py-2.5">
          <p className="text-micro leading-relaxed text-tertiary">
            Chặn: tool trong nhóm trả lỗi ngay và không chạy (áp dụng cho tool chạy trên máy bạn;
            tool backend như tìm web vẫn chạy). Quyền nhóm đè chính sách duyệt chung của
            Auto-pilot; lệnh nguy hiểm (rm -rf /, mkfs) luôn phải hỏi.
          </p>
        </div>
      </aside>
    </div>
  );
}
