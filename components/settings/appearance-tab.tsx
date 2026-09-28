'use client';

/**
 * Settings → tab "Giao diện & trải nghiệm"
 *
 * Tham số model mặc định, thao tác nhập liệu, hàng đợi và hiệu năng hiển thị.
 *
 * (Tách ra từ components/settings-dialog.tsx.)
 *
 * Không nhận prop: tự đọc `useAppStore` như các section khác trong
 * components/settings/ — tránh luồn chục prop qua nhiều tầng chỉ để lấy `settings`.
 */

import { useAppStore } from '@/lib/store';
import { isQueueMode } from '@/lib/message-queue';

/**
 * Mặc định của `perf.throttleMs` ở store (lib/store.ts:252). Khai báo lại ở
 * đây vì store không export hằng — nhưng `<select>` PHẢI có option 50 nếu không
 * cài mới sẽ không có option nào khớp `value` và trình duyệt hiện nhầm 80ms.
 */
const DEFAULT_THROTTLE_MS = 50;

export function AppearanceTab() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const updatePerf = useAppStore((s) => s.updatePerf);

  return (
    <>
      <div className="border-b border-subtle pb-2">
        <h3 className="text-read font-semibold text-primary">Giao diện &amp; trải nghiệm</h3>
        <p className="mt-0.5 text-meta text-tertiary">
          Cấu hình tham số mô hình mặc định, thao tác nhập liệu và hiệu năng hiển thị.
        </p>
      </div>

      <div className="settings-card settings-card-body">
        <h4 className="field-label text-read">Tham số mô hình</h4>

        <div>
          <label htmlFor="temperature" className="field-label mb-1.5 flex items-baseline justify-between gap-2">
            <span>Temperature (Độ sáng tạo)</span>
            <span className="font-mono tabular-nums text-ui text-accent">
              {settings.temperature.toFixed(2)}
            </span>
          </label>
          <input
            id="temperature"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.temperature}
            onChange={(e) => updateSettings({ temperature: parseFloat(e.target.value) })}
            className="w-full accent-accent"
          />
          <p className="field-hint mt-1">
            Thấp = trả lời ổn định, sát dữ kiện. Cao = sáng tạo, biến thiên nhiều hơn.
          </p>
        </div>

        <div>
          <label htmlFor="system-prompt" className="field-label mb-1.5 block">
            System Prompt cốt lõi
          </label>
          <textarea
            id="system-prompt"
            value={settings.systemPrompt}
            onChange={(e) => updateSettings({ systemPrompt: e.target.value })}
            rows={4}
            className="field w-full resize-y"
          />
        </div>
      </div>

      <div className="settings-card settings-card-body">
        <h4 className="field-label text-read">Nhập liệu &amp; Hàng đợi</h4>

        <label htmlFor="send-on-enter" className="flex cursor-pointer items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="field-label block">Enter để gửi tin nhắn</span>
            <span className="mt-0.5 block text-meta leading-relaxed text-tertiary">
              Tắt thì Enter xuống dòng, gửi bằng Ctrl/⌘ + Enter.
            </span>
          </span>
          <input
            id="send-on-enter"
            type="checkbox"
            checked={settings.sendOnEnter}
            onChange={(e) => updateSettings({ sendOnEnter: e.target.checked })}
            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full accent-accent"
          />
        </label>

        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="field-label block">Tin xếp hàng khi AI đang chạy</span>
            <span className="mt-0.5 block text-meta leading-relaxed text-tertiary">
              Enter khi AI đang trả lời = steering (gửi ngay khi lượt xong), Alt+Enter =
              follow-up (gửi khi AI rảnh). Chọn cách bắn hàng đợi khi đến lượt.
            </span>
          </span>
          <span className="flex flex-shrink-0 flex-col gap-1">
            <select
              aria-label="Chế độ steering"
              value={settings.steeringMode}
              onChange={(e) => {
                const v: unknown = e.target.value;
                updateSettings({ steeringMode: isQueueMode(v) ? v : 'one-at-a-time' });
              }}
              className="field"
            >
              <option value="one-at-a-time">Steering: từng tin</option>
              <option value="all">Steering: tất cả</option>
            </select>
            <select
              aria-label="Chế độ follow-up"
              value={settings.followUpMode}
              onChange={(e) => {
                const v: unknown = e.target.value;
                updateSettings({ followUpMode: isQueueMode(v) ? v : 'one-at-a-time' });
              }}
              className="field"
            >
              <option value="one-at-a-time">Follow-up: từng tin</option>
              <option value="all">Follow-up: tất cả</option>
            </select>
          </span>
        </div>
      </div>

      <div className="settings-card settings-card-body">
        <h4 className="field-label text-read">Hiệu năng &amp; Hiển thị</h4>

        <label htmlFor="auto-compact-toggle" className="flex cursor-pointer items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="field-label block">Nén hội thoại tự động (Compaction)</span>
            <span className="mt-0.5 block text-meta leading-relaxed text-tertiary">
              Khi hội thoại gần trần ngữ cảnh của model, tự tóm tắt phần cũ và chỉ gửi
              tóm tắt + tin mới lên AI.
            </span>
          </span>
          <input
            id="auto-compact-toggle"
            type="checkbox"
            checked={settings.autoCompact}
            onChange={(e) => updateSettings({ autoCompact: e.target.checked })}
            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full accent-accent"
          />
        </label>

        <label htmlFor="anim-toggle" className="flex cursor-pointer items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="field-label block">Hiệu ứng chuyển động (Animations)</span>
            <span className="mt-0.5 block text-meta leading-relaxed text-tertiary">
              Tắt để giảm tải GPU/CPU trên máy yếu. Cờ này KHÔNG tự bật lại theo
              prefers-reduced-motion của hệ điều hành.
            </span>
          </span>
          <input
            id="anim-toggle"
            type="checkbox"
            checked={settings.perf?.animations ?? true}
            onChange={(e) => updatePerf({ animations: e.target.checked })}
            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full accent-accent"
          />
        </label>

        <div>
          <label htmlFor="throttle-ms" className="field-label mb-1.5 block">
            Tần suất vẽ lại khi streaming token
          </label>
          <select
            id="throttle-ms"
            value={settings.perf?.throttleMs ?? DEFAULT_THROTTLE_MS}
            onChange={(e) => updatePerf({ throttleMs: Number(e.target.value) })}
            className="field w-full"
          >
            <option value={50}>Mượt nhất — 50ms (mặc định)</option>
            <option value={80}>Mượt — 80ms</option>
            <option value={150}>Cân bằng — 150ms</option>
            <option value={250}>Tiết kiệm — 250ms</option>
            <option value={400}>Nhẹ nhất — 400ms (máy yếu)</option>
          </select>
          <p className="field-hint mt-1">
            50ms là mặc định của phiên mới: token hiện gần như tức thì, vẫn gom đủ render
            để máy yếu không phải vẽ từng ký tự.
          </p>
        </div>
      </div>
    </>
  );
}
