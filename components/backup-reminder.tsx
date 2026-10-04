'use client';

import { useCallback, useEffect, useState } from 'react';
import { HardDriveDownload, X } from 'lucide-react';
import {
  backupNow,
  shouldShowReminder,
  snoozeBackupReminder,
  trySilentAutoBackup,
} from '@/lib/auto-backup';

/**
 * Số ngày "Để sau" giấu banner.
 *
 * Việc bỏ qua ĐÃ được ghi xuống localStorage (`vyen-backup-snoozed-at` qua
 * `snoozeBackupReminder`) và sống sót qua reload — nhưng khoản thời gian đó
 * trước đây chỉ nằm trong tham số mặc định của hàm, không ai đọc được. Nút
 * "Để sau" trông như tắt hẳn, thực tế là quay lại sau một ngày.
 *
 * Giữ nguyên 1 ngày: đây là cảnh báo mất dữ liệu thật, và chu kỳ sao lưu mặc
 * định là 7 ngày nên nhắc nhiều lần trước khi dữ liệu gặp rủi ro là đúng.
 * Sửa là CHỌN lại con số này và đồng bộ với dòng chữ bên dưới.
 */
const SNOOZE_DAYS = 1;

/**
 * Hiện banner nhắc sao lưu khi đến kỳ. Nếu người dùng đã cấu hình thư mục
 * tự động (desktop), việc ghi file chạy ngầm ngay khi mở app — banner chỉ
 * xuất hiện khi không ghi được.
 */
export function BackupReminder({ chatCount }: { chatCount: number }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setVisible(chatCount > 0 && shouldShowReminder());
  }, [chatCount]);

  useEffect(() => {
    let cancelled = false;
    // Cố gắng backup ngầm vào thư mục đã chọn trước khi quyết định hiện banner.
    void trySilentAutoBackup().then((done) => {
      if (cancelled) return;
      if (done) setVisible(false);
      else refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  if (!visible) return null;

  /** Ẩn banner và ghi mốc hết hạn — chỉ chạy khi người dùng BẤM, không chạy mỗi render. */
  const dismiss = () => {
    snoozeBackupReminder(SNOOZE_DAYS);
    setVisible(false);
  };

  const handleBackup = async () => {
    setBusy(true);
    try {
      const result = await backupNow('prefer-folder');
      if (result.ok) setVisible(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="notice-warn mx-2 mt-2">
      <div className="flex items-start gap-2">
        <HardDriveDownload size={14} aria-hidden="true" className="mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="leading-relaxed">
            Đã lâu chưa sao lưu dữ liệu. Chat đang lưu trên thiết bị này thôi.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleBackup}
              disabled={busy}
              className="rounded-lg bg-warning px-3 py-1.5 font-medium text-on-fill transition hover:bg-warning/85 disabled:opacity-50"
            >
              {busy ? 'Đang sao lưu…' : 'Sao lưu ngay'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-2.5 py-1 text-status-warning transition hover:bg-warning/10"
            >
              Để sau
            </button>
          </div>
          <p className="mt-1 text-meta text-text-muted">
            Để sau chỉ ẩn thông báo này. Sau {SNOOZE_DAYS} ngày chưa sao lưu thì nó hiện lại.
          </p>
        </div>
        <button
          type="button"
          aria-label="Đóng nhắc nhở"
          onClick={dismiss}
          className="-mr-1 -mt-0.5 flex-shrink-0 rounded-lg p-1 text-text-muted transition hover:bg-warning/10 hover:text-status-warning"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
