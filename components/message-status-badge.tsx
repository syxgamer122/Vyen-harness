"use client";

import type { MessageStatus } from "@/lib/chat-types";
import type { StoredMessageStatus } from "@/lib/db";

interface MessageStatusBadgeProps {
  status?: MessageStatus | StoredMessageStatus;
}

/**
 * Dòng trạng thái cuối của một tin nhắn — CHROME, không phải nội dung.
 *
 * Nó xuất hiện ngay dưới câu trả lời, nên phải đọc được trạng thái mà không
 * giành chỗ của văn bản: `text-meta` / `text-tertiary`, không nền, không viền,
 * không bo tròn. Riêng `error` là ngoại lệ — lỗi là thứ người dùng cần thấy
 * ngay, nên nó lên `text-danger`.
 *
 * Cả ba trạng thái đều được render đúng dù call site hiện tại chỉ truyền
 * `aborted`: đây là hợp đồng của component, không phải suy đoán về nơi dùng.
 */
export function MessageStatusBadge({
  status,
}: MessageStatusBadgeProps) {
  if (status === "streaming") {
    return (
      <span className="font-sans text-meta text-tertiary animate-pulse">
        Đang tạo…
      </span>
    );
  }

  if (status === "aborted") {
    return (
      <span className="font-sans text-meta font-medium text-status-warning">
        Đã dừng giữa chừng
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="font-sans text-meta font-medium text-danger">
        Có lỗi khi tạo nội dung
      </span>
    );
  }

  return null;
}
