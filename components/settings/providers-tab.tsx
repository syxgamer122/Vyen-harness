'use client';

/**
 * Settings → tab "Model & Nhà cung cấp"
 *
 * Quản lý provider preset, định tuyến model và model đọc ảnh.
 *
 * (Tách ra từ components/settings-dialog.tsx.)
 *
 * Không nhận prop: tự đọc `useAppStore` như các section khác trong
 * components/settings/ — tránh luồn chục prop qua nhiều tầng chỉ để lấy `settings`.
 */

import dynamic from 'next/dynamic';
import { useAppStore, SERVER_PROVIDER_ID } from '@/lib/store';
import { SectionLoading } from '@/components/settings/section-loading';
import { VisionModelSection } from '@/components/settings/vision-model-section';

const ProviderManager = dynamic(() => import('@/components/provider-manager').then((m) => m.ProviderManager), { ssr: false, loading: SectionLoading });
const RoutingSettingsPanel = dynamic(() => import('@/components/routing-settings-panel').then((m) => m.RoutingSettingsPanel), { ssr: false, loading: SectionLoading });

export function ProvidersTab() {
  const activeProviderId = useAppStore((s) => s.activeProviderId);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  return (
    <>
      <div className="border-b border-subtle pb-2">
        <h3 className="text-read font-semibold text-primary">Model &amp; Nhà cung cấp</h3>
        <p className="mt-0.5 text-meta text-tertiary">
          Quản lý API key cá nhân (BYOK), danh sách model, vision model và chiến lược điều phối Lead/Worker.
        </p>
      </div>

      {activeProviderId === SERVER_PROVIDER_ID && (
        <div>
          <label htmlFor="server-api-key" className="field-label mb-1.5 block">
            API Key OpenAI (máy chủ mặc định)
          </label>
          <input
            id="server-api-key"
            type="password"
            value={settings.apiKey || ''}
            onChange={(e) => updateSettings({ apiKey: e.target.value })}
            placeholder="sk-..."
            className="field w-full"
          />
          <p className="field-hint mt-1">
            Chỉ lưu trong phiên này, không persist vào đĩa. Key này được gửi
            thẳng tới api.openai.com khi gọi model OpenAI.
          </p>
        </div>
      )}

      <div>
        <h4 className="field-label mb-1.5 block text-read">Nhà cung cấp API (BYOK)</h4>
        <p className="mb-2 text-ui leading-relaxed text-tertiary">
          Lưu nhiều nhà cung cấp chuẩn OpenAI-compatible, tải danh sách model và chuyển
          nhanh mà không cần cấu hình lại server.
        </p>
        <ProviderManager />
      </div>

      <div className="border-t border-subtle pt-3">
        <VisionModelSection />
      </div>

      <div className="border-t border-subtle pt-3">
        <label htmlFor="access-code" className="field-label mb-1.5 block">
          Mã truy cập (Access Code cho server gateway)
        </label>
        <input
          id="access-code"
          type="password"
          value={settings.accessCode || ''}
          onChange={(e) => updateSettings({ accessCode: e.target.value })}
          placeholder="Nhập mã truy cập..."
          className="field w-full"
        />
        <p className="field-hint mt-1">
          Gửi kèm mỗi yêu cầu tới server gateway dùng chung. Để trống nghĩa là không yêu cầu.
        </p>
      </div>

      <div className="border-t border-subtle pt-3">
        <RoutingSettingsPanel />
      </div>
    </>
  );
}
