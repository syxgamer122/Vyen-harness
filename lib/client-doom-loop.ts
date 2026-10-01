/**
 * Doom-loop guard cho tool chạy phía CLIENT (fs_*, shell, git, plan_*,
 * MCP… trên máy user) — đối xứng với checkDoomLoop của tool server
 * (lib/tool-call-budget.ts, bọc qua guarded()).
 *
 * Vì sao cần ở client: fs_* KHÔNG có execute() phía server — route chỉ relay
 * kết quả, server không đếm được call client. Trần bước cũ (CLIENT_MAX_STEPS)
 * từng là "chốt chặn" ngầm cho vòng lặp client; khi bỏ trần (agent không tự
 * cản tay mình), cần một guard thực sự: cùng một (tool, args) lặp LIÊN TIẾP
 * tới ngưỡng thì KHÔNG thực thi nữa — trả note điều hướng để model đổi hướng.
 *
 * Đọc nhiều file / gọi nhiều lệnh khác nhau không bao giờ dính: chữ ký gồm
 * cả args, và chỉ đếm chuỗi LIÊN TIẾP ở đuôi (call khác xen vào reset chuỗi).
 * Giữ bộ đếm thuần + module-level theo chatId để callback của useChat (được
 * tạo lại mỗi render, có thể đếm trùng khi StrictMode double-invoke) dùng
 * chung một trạng thái ổn định xuyên cả phiên.
 */

import { DOOM_LOOP_THRESHOLD } from '@/lib/tool-limits';

/** Trần số chữ ký giữ lại mỗi phiên — chống phình bộ nhớ. */
const WINDOW = 12;

/** Trần số phiên giữ đồng thời — sweep TTL dưới đây dọn phần còn lại. */
const MAX_SESSIONS = 500;

/** Bucket hết hạn sau khoảng này kể từ lần chạm cuối. */
const SESSION_TTL_MS = 10 * 60_000;

const sessions = new Map<string, string[]>();
const lastTouchAt = new Map<string, number>();

function sweep(now: number): void {
  for (const [key, lastTouch] of lastTouchAt) {
    if (now - lastTouch > SESSION_TTL_MS) {
      lastTouchAt.delete(key);
      sessions.delete(key);
    }
  }
  if (sessions.size <= MAX_SESSIONS) return;
  const sorted = [...lastTouchAt.entries()].sort((a, b) => a[1] - b[1]);
  for (const [key] of sorted.slice(0, sessions.size - MAX_SESSIONS)) {
    lastTouchAt.delete(key);
    sessions.delete(key);
  }
}

export interface ClientDoomVerdict {
  /** true khi call NÀY là lần lặp thứ >= ngưỡng — KHÔNG thực thi. */
  blocked: boolean;
  /** Số lần lặp liên tiếp tính cả call hiện tại (khi blocked). */
  counted: number;
}

/**
 * Băm FNV-1a 32-bit nhanh (đủ tốt cho fingerprint phân biệt, không cần
 * crypto-grade). Trả hex 8 ký tự.
 */
function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply (dùng Math.imul để giữ 32-bit).
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Chữ ký call client — tên tool + hash TOÀN BỘ args đã serialize.
 *
 * Trước đây chỉ lấy 300 ký tự đầu của args JSON: hai lần fs_edit KHÁC NHAU
 * ở phần đuôi (block SEARCH/REPLACE sau ký tự 300) bị coi là CÙNG một call
 * → doom-loop guard chặn nhầm thao tác hợp lệ. Hash toàn bộ args giữ chữ ký
 * nhỏ gọn mà không mất khả năng phân biệt.
 */
export function clientToolSignature(toolName: string, args: unknown): string {
  let raw: string;
  try {
    raw = JSON.stringify(args ?? {});
  } catch {
    raw = String(args);
  }
  return `${toolName}:${fnv1a32(raw)}`;
}

/**
 * Ghi nhận call client sắp thực thi. Trả blocked=true khi đây là lần lặp
 * LIÊN TIẾP thứ DOOM_LOOP_THRESHOLD trở lên — caller trả note thay vì chạy.
 * Call KHÔNG blocked được push vào chuỗi; call bị chặn KHÔNG push (giữ mép
 * ngưỡng, lần sau vẫn báo) — khớp hành vi checkDoomLoop phía server.
 */
export function checkClientDoomLoop(chatKey: string, signature: string): ClientDoomVerdict {
  const now = Date.now();
  sweep(now);
  lastTouchAt.set(chatKey, now);

  const recent = sessions.get(chatKey) ?? [];
  let counted = 1;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i] !== signature) break;
    counted += 1;
  }

  if (counted >= DOOM_LOOP_THRESHOLD) {
    return { blocked: true, counted };
  }

  recent.push(signature);
  if (recent.length > WINDOW) {
    recent.splice(0, recent.length - WINDOW);
  }
  sessions.set(chatKey, recent);
  return { blocked: false, counted };
}

/**
 * Đặt lại lịch sử lặp của một hội thoại khi người dùng gửi tin nhắn MỚI.
 * TTL 10 phút chỉ là giới hạn dọn bộ nhớ, KHÔNG phải ranh giới lượt: trước
 * đây đọc lại cùng một file ở hai lượt người dùng khác nhau trong 10 phút
 * bị chặn oan ở lần thứ ba. Lượt người dùng mới = ngữ cảnh mới, chuỗi lặp
 * cũ không được ảnh hưởng.
 */
export function resetClientDoomLoop(chatKey: string): void {
  sessions.delete(chatKey);
  lastTouchAt.delete(chatKey);
}

/** Chỉ dùng trong test. */
export function __clearAllClientDoomLoops(): void {
  sessions.clear();
  lastTouchAt.clear();
}
