'use client';

import { WorkspaceCheckpointBar, useUndoTarget } from '@/components/workspace-checkpoints';
import { PlanPanel } from '@/components/plan-panel';
import { RAIL_QUERY, useMediaQuery } from '@/lib/hooks/use-media-query';
import type { Plan } from '@/lib/subtask-plan';

/**
 * Cột phụ bên phải — chỉ xuất hiện ở màn rộng (≥ `RAIL_QUERY`).
 *
 * VÌ SAO CÓ: ở 1360px cột hội thoại chiếm 768px và phần trống hai bên nhỏ đến
 * mức mắt không để ý. Ở 1920px phần trống đó là 448px mỗi bên — cột phụ khiến
 * màn rộng dùng được phần đất mà trước đó chỉ đổi lấy khoảng trống.
 *
 * VÌ SAO LẠI Ở DƯỚI NGƯỠNG THÌ VẪN NẰM GIỮA: Plan và thanh undo hiện đang nằm
 * giữa cột hội thoại (xem `chat-interface.tsx`). Không đổi hành vi đó ở màn
 * hẹp — chỉ chuyển chỗ đứng khi đủ rộng, nên không có nhánh nào phải đổi layout.
 *
 * Mốc bật cột lấy từ `RAIL_QUERY`, KHÔNG viết thẳng `min-[1400px]`: cùng một
 * con số đó phải nói với JS và với Tailwind, và test so hai bên.
 */
export function SessionRail({
  currentChatId,
  isLoading,
  onNotice,
  plan,
  planHidden,
  onHidePlan,
  canApprove,
  onApprovePlan,
}: {
  currentChatId: string | null;
  isLoading: boolean;
  onNotice?: (msg: string, durationMs?: number) => void;
  plan: Plan | null;
  planHidden: boolean;
  onHidePlan: () => void;
  canApprove: boolean;
  onApprovePlan: () => void;
}) {
  const wide = useMediaQuery(RAIL_QUERY);
  /* Cùng nguồn với chính thanh undo, nên rail không bao giờ bật trống. */
  const undoTarget = useUndoTarget(currentChatId);

  const hasPlan = !!plan && !planHidden;
  /* Chỉ bật khi thật sự có gì để đặt — một cột 320px trống trơn tệ hơn là không có. */
  if (!wide || (!hasPlan && !undoTarget)) return null;

  return (
    <aside
      aria-label="Kế hoạch và hoàn tác"
      className="w-80 max-w-rail flex-none space-y-4 overflow-y-auto border-l border-subtle bg-sunken px-4 py-5"
    >
      {hasPlan && (
        <PlanPanel
          plan={plan!}
          onHide={onHidePlan}
          canApprove={canApprove}
          onApprove={onApprovePlan}
        />
      )}
      <WorkspaceCheckpointBar chatId={currentChatId} busy={isLoading} onNotice={onNotice} />
    </aside>
  );
}
