'use client';

import { extractMessageUsage, formatMessageUsage } from '@/lib/message-usage';

/**
 * Dòng mờ dưới câu trả lời assistant: ↑token ↓token · thời lượng · chi phí
 * (chỉ khi là số thật). Ẩn hoàn toàn khi message không có usage annotation.
 *
 * Dấu `≈` đứng trướC CẢ DÒNG, không đứng trước một con số — vì `est` là cờ
 * mức bản ghi: khi nó bật thì token RA là đoán (`ceil(ký tự / 4)`) còn token
 * VÀO vẫn là số gateway báo. Gạch vào trước `↓` là nói dối về `↑`.
 */
export function MessageUsage({ annotations }: { annotations?: unknown }) {
  const stats = extractMessageUsage(annotations);
  if (!stats) return null;
  const text = formatMessageUsage(stats);
  if (!text) return null;
  return (
    <p
      className="mt-1 font-sans text-micro tabular-nums text-text-muted"
      title={
        stats.estimated
          ? 'Ước lượng: gateway không báo token ra, số ↓ suy từ độ dài trả lời'
          : 'Token thật do gateway báo'
      }
    >
      {stats.routingRole && (
        <span
          className={`mr-1 ${
            stats.routingRole === 'worker' ? 'text-text-muted' : 'text-accent-steel'
          }`}
          title={
            stats.routingRole === 'planner'
              ? 'Lượt chạy bằng planner model (lệnh /plan)'
              : stats.routingRole === 'lead'
                ? 'Model mạnh (lead): lập kế hoạch hoặc fallback sau thất bại'
                : 'Model rẻ (worker): pha thực thi'
          }
        >
          {stats.routingRole}
        </span>
      )}
      {text}
    </p>
  );
}
