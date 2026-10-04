/**
 * Evidence Ladder: bậc thang bằng chứng 6 cấp độ.
 *
 * Phân biệt rạch ròi giữa lời nói của model và bằng chứng thực tế:
 * - prepared: "Kế hoạch · chưa chạy": kế hoạch đã sẵ, chưa chạy gì
 * - running: "Code · đang chạy": executor đang chạy và đang được quan sát
 * - reported_done: "Code · đã báo xong": model/lệnh nói xong, CHƯA AI KIỂM CHỨNG
 * - verified: "Kiểm thử · đã xác minh": test/CI thật sự pass (có VerificationReceipt
 *   exitCode=0 và qua completion gate)
 * - blocked / failed: bị chặn có lý do hoặc thất bại terminal.
 *
 * Nhãn trả về là COPY tiếng Việt, nên nó đổi theo giọng của app. `EvidenceLevel`
 * thì không: đó là giá trị lưu trong history, đổi là mất dữ liệu đã ghi.
 */

import type { VerificationReceipt } from '@/lib/verification';
import { evaluateCompletionIntegrity } from '@/lib/completion-gate';

export type EvidenceLevel =
  | 'prepared'
  | 'running'
  | 'reported_done'
  | 'verified'
  | 'blocked'
  | 'failed';

export interface EvidenceHistoryEntry {
  level: EvidenceLevel;
  timestamp: number;
  note?: string;
}

export interface EvidenceState {
  level: EvidenceLevel;
  receipt?: VerificationReceipt;
  blockedReason?: string;
  failureReason?: string;
  integrityViolations?: string[];
  history: EvidenceHistoryEntry[];
}

export function createInitialEvidence(level: EvidenceLevel = 'prepared'): EvidenceState {
  return {
    level,
    history: [{ level, timestamp: Date.now() }],
  };
}

/**
 * Chuyển trạng thái bằng chứng theo quy tắc nghiêm ngặt:
 * Không bao giờ nhảy lên 'verified' nếu không có VerificationReceipt pass và qua được Completion Gate!
 */
export function transitionEvidence(
  current: EvidenceState,
  target: EvidenceLevel,
  context?: {
    receipt?: VerificationReceipt;
    diff?: string;
    blockedReason?: string;
    failureReason?: string;
    note?: string;
    timestamp?: number;
  },
): { state: EvidenceState; error?: string } {
  const now = context?.timestamp ?? Date.now();

  // 1. Nếu đích đến là 'verified'
  if (target === 'verified') {
    if (!context?.receipt) {
      // Thiếu receipt -> chỉ được nâng lên 'reported_done'
      const fallbackState: EvidenceState = {
        ...current,
        level: 'reported_done',
        history: [
          ...current.history,
          {
            level: 'reported_done',
            timestamp: now,
            note: 'Model báo xong nhưng chưa có biên nhận kiểm thử thực tế',
          },
        ],
      };
      return {
        state: fallbackState,
        error: 'Thiếu VerificationReceipt: không thể xác minh khi chưa chạy test thực tế.',
      };
    }

    if (context.receipt.exitCode !== 0) {
      // Lệnh kiểm thử trả về lỗi
      const failedState: EvidenceState = {
        ...current,
        level: 'failed',
        receipt: context.receipt,
        failureReason: `Lệnh kiểm thử thất bại với exit code ${context.receipt.exitCode}`,
        history: [
          ...current.history,
          {
            level: 'failed',
            timestamp: now,
            note: `Kiểm thử không đạt: ${context.receipt.command}`,
          },
        ],
      };
      return {
        state: failedState,
        error: `Kiểm thử thất bại (exit code ${context.receipt.exitCode}).`,
      };
    }

    // Kiểm tra tính liêm chính của code / diff qua Completion Gate
    if (context.diff) {
      const gateResult = evaluateCompletionIntegrity(context.diff);
      if (!gateResult.ok) {
        const fallbackState: EvidenceState = {
          ...current,
          level: 'reported_done',
          receipt: context.receipt,
          integrityViolations: gateResult.violations,
          history: [
            ...current.history,
            {
              level: 'reported_done',
              timestamp: now,
              note: `Bị chặn bởi Completion Gate: ${gateResult.violations.join('; ')}`,
            },
          ],
        };
        return {
          state: fallbackState,
          error: `Completion Gate từ chối xác minh: ${gateResult.violations.join('; ')}`,
        };
      }
    }

    // Đạt đủ mọi tiêu chuẩn -> verified
    const verifiedState: EvidenceState = {
      ...current,
      level: 'verified',
      receipt: context.receipt,
      integrityViolations: undefined,
      history: [
        ...current.history,
        {
          level: 'verified',
          timestamp: now,
          note: context.note || `Đã kiểm chứng thành công bằng: ${context.receipt.command}`,
        },
      ],
    };
    return { state: verifiedState };
  }

  // 2. Chuyển sang các trạng thái khác
  const nextState: EvidenceState = {
    ...current,
    level: target,
    receipt: context?.receipt ?? current.receipt,
    blockedReason: target === 'blocked' ? context?.blockedReason : undefined,
    failureReason: target === 'failed' ? context?.failureReason : undefined,
    history: [
      ...current.history,
      {
        level: target,
        timestamp: now,
        note: context?.note || (target === 'blocked' ? context?.blockedReason : undefined),
      },
    ],
  };

  return { state: nextState };
}

/**
 * Trả về nhãn định dạng chuẩn hiển thị trên UI badge.
 */
export function describeEvidence(level: EvidenceLevel): {
  stage: string;
  cert: string;
  badgeText: string;
  variant: 'default' | 'running' | 'warning' | 'success' | 'danger';
} {
  switch (level) {
    case 'prepared':
      return {
        stage: 'Kế hoạch',
        cert: 'chưa chạy',
        badgeText: 'Kế hoạch · chưa chạy',
        variant: 'default',
      };
    case 'running':
      return {
        stage: 'Code',
        cert: 'đang chạy',
        badgeText: 'Code · đang chạy',
        variant: 'running',
      };
    case 'reported_done':
      return {
        stage: 'Code',
        cert: 'đã báo xong',
        badgeText: 'Code · đã báo xong',
        variant: 'warning',
      };
    case 'verified':
      return {
        stage: 'Kiểm thử',
        cert: 'đã xác minh',
        badgeText: 'Kiểm thử · đã xác minh',
        variant: 'success',
      };
    case 'blocked':
      return {
        stage: 'Bị chặn',
        cert: 'bị chặn',
        badgeText: 'Bị chặn',
        variant: 'danger',
      };
    case 'failed':
      return {
        stage: 'Thất bại',
        cert: 'thất bại',
        badgeText: 'Thất bại',
        variant: 'danger',
      };
  }
}
