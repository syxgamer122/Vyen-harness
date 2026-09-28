/**
 * Trạng thái loop-guard theo HỘI THOẠI cho các tool server (web/memory/…).
 *
 * Vấn đề đã sửa: guarded() giữ bộ đếm/log trong closure của buildAgentTools —
 * mỗi request tạo bộ tool mới nên trạng thái reset về 0. Với agent coding, mỗi
 * lần client thực thi fs_* xong là useChat resubmit → request mới, nên detector
 * phải sống XUYÊN request mới bắt được vòng lặp thật.
 *
 * Giải pháp: bucket theo conversationId, TTL tự dọn. Bộ nhớ tiến trình là đủ —
 * mất bucket khi restart chỉ nghĩa là lượt đó bắt đầu lại lịch sử loop, không
 * phải lỗi bảo mật.
 *
 * File này giữ: (1) trạng thái doom-loop (recentSignatures) và
 * (2) host provenance (knownHosts). Trần tổng số call/lượt cùng dedupe "gọi
 * trùng thì từ chối" và trần bước client (CLIENT_MAX_STEPS=48) đã bị XÓA —
 * chúng là quota kiểu web-chat, chặn oan lần gọi lại hợp lệ của agent; vòng
 * lặp bị chặn bởi doom-loop detector ở CẢ HAI tầng (server tools qua guarded
 * và client tools qua wrapper executeClientToolCall).
 */

import { DOOM_LOOP_THRESHOLD } from '@/lib/tool-limits';

/** Bucket hết hạn sau khoảng này kể từ lần chạm cuối. */
export const BUDGET_TTL_MS = 10 * 60_000;

/** Trần số bucket giữ đồng thời — chặn rò rỉ bộ nhớ khi nhiều hội thoại. */
const MAX_BUCKETS = 500;

/**
 * Số chữ ký call gần nhất giữ lại để phát hiện vòng lặp. Đủ lớn để bắt
 * chuỗi lặp A→B→A→B mà một bộ đếm call-trùng đơn thuần không thấy, đủ nhỏ để
 * không phình bucket.
 */
const DOOM_LOOP_WINDOW = 12;

export interface ToolCallBudget {
  /** Host đã có nguồn gốc hợp lệ, tích lũy qua các lượt (provenance). */
  knownHosts: Set<string>;
  /**
   * Chữ ký N lần gọi gần nhất (cũ → mới). Dùng cho doom-loop detector:
   * đếm số lần lặp LIÊN TIẾP ở đuôi.
   */
  recentSignatures: string[];
  touchedAt: number;
}

const buckets = new Map<string, ToolCallBudget>();

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.touchedAt > BUDGET_TTL_MS) buckets.delete(key);
  }
  if (buckets.size <= MAX_BUCKETS) return;
  // Vẫn quá đông sau khi dọn hạn → bỏ những bucket cũ nhất.
  const sorted = [...buckets.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt);
  for (const [key] of sorted.slice(0, buckets.size - MAX_BUCKETS)) buckets.delete(key);
}

/**
 * Lấy (hoặc tạo) bucket của hội thoại. `conversationId` rỗng/thiếu → trả
 * bucket dùng-một-lần (không giữ trạng thái giữa các request).
 */
export function getToolCallBudget(conversationId?: string | null): ToolCallBudget {
  const now = Date.now();
  if (!conversationId) {
    return { knownHosts: new Set(), recentSignatures: [], touchedAt: now };
  }
  sweep(now);
  const existing = buckets.get(conversationId);
  if (existing) {
    existing.touchedAt = now;
    return existing;
  }
  const fresh: ToolCallBudget = { knownHosts: new Set(), recentSignatures: [], touchedAt: now };
  buckets.set(conversationId, fresh);
  return fresh;
}

/* ------------------------------------------------------------------ */
/* Doom-loop detector (port doom_loop.rs của evot)                      */
/* ------------------------------------------------------------------ */

export interface DoomLoopResult {
  /** true khi cùng một chữ ký call lặp DOOM_LOOP_THRESHOLD lần liên tiếp. */
  triggered: boolean;
  /** Số lần lặp liên tiếp tính cả call hiện tại. */
  counted: number;
}

/**
 * Kiểm tra vòng lặp doom cho một call MỚI. KHÔNG ghi vào recentSignatures khi
 * trigger — detector giữ ở đúng mép ngưỡng để lần sau vẫn báo, cho tới khi
 * model thực sự đổi hướng (call khác sẽ push signature mới, reset chuỗi).
 *
 * Chữ ký = `stableKey(name, args)` từ agent-tools.ts. Đây là loop-guard DUY
 * NHẤT còn lại sau khi bỏ dedupe: cùng một call lặp LIÊN TIẾP tới ngưỡng thì
 * trả steering message mạnh buộc model đổi hướng.
 */
export function checkDoomLoop(budget: ToolCallBudget, signature: string): DoomLoopResult {
  const recent = budget.recentSignatures;
  let counted = 1;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i] !== signature) break;
    counted += 1;
  }

  if (counted >= DOOM_LOOP_THRESHOLD) {
    return { triggered: true, counted };
  }

  recent.push(signature);
  if (recent.length > DOOM_LOOP_WINDOW) {
    recent.splice(0, recent.length - DOOM_LOOP_WINDOW);
  }
  return { triggered: false, counted };
}

/**
 * Đặt lại lịch sử loop khi người dùng gửi tin nhắn MỚI (không phải resubmit
 * của tool). Một lượt hội thoại mới không nên bị oan từ chuỗi lặp của lượt cũ.
 */
export function resetToolCallBudget(conversationId?: string | null): void {
  if (!conversationId) return;
  const bucket = buckets.get(conversationId);
  if (!bucket) return;
  bucket.recentSignatures.length = 0;
  bucket.touchedAt = Date.now();
  // knownHosts CỐ Ý giữ lại: URL người dùng dán ở lượt trước vẫn là nguồn
  // hợp lệ cho web_fetch ở lượt sau.
}

/** Chỉ dùng trong test. */
export function __clearAllToolCallBudgets(): void {
  buckets.clear();
}
