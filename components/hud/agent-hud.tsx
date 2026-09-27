'use client';

import React from 'react';
import { useHudStore, type HudLane } from '@/lib/hud-store';
import { CATEGORY_DESCRIPTIONS } from '@/lib/routing/categories';
import { EvidenceBadge } from '@/components/evidence-badge';

interface AgentHudProps {
  className?: string;
}

/**
 * PHIẾU CỦA LƯỢT GẦN NHẤT — không phải HUD telemetry sống.
 *
 * Store `hud-store` có đủ 9 mutator, nhưng vị trí ghi DUY NHẤT là
 * `use-chat-orchestration.ts` trong `onFinish` — tức là SAU khi lượt đã xong.
 * Vì vậy ở thời điểm render, store chỉ có thể trả lời chính xác cho: model +
 * effort, category, số token, và cost. Các trường còn lại trong `HudLane`
 * (`turn`, `elapsedSec`, `parallelShots`) không có call site nào ghi vào, nên
 * chúng LUÔN bằng 0 — hiện chúng sẽ là những con số không bao giờ đúng.
 *
 * Vì vậy strip này không hiện chúng, và cũng không giả vờ làm nguồn số liệu
 * trực tiếp. Muốn nó sống trở lại thì phải có call site ghi ở đầu lượt —
 * xem ghi chú trong `lib/hud-store.ts`.
 */
export function AgentHud({ className = '' }: AgentHudProps) {
  const lanes = useHudStore((s) => s.lanes);
  const laneList = Object.values(lanes);

  if (laneList.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      aria-label="Last run receipt"
      className={`border-b border-subtle bg-surface px-3 py-1.5 text-meta font-mono text-tertiary ${className}`}
    >
      {laneList.map((lane) => (
        <HudRow key={lane.laneId} lane={lane} />
      ))}
    </div>
  );
}

/**
 * MỘT dòng cố định: danh tính lượt · token · cost · mức bằng chứng.
 * Không wrap — `truncate` để thanh receipt không đẩy layout khi tên model dài.
 */
function HudRow({ lane }: { lane: HudLane }) {
  const catInfo = CATEGORY_DESCRIPTIONS[lane.category] ?? { label: lane.category };

  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-secondary">{catInfo.label}</span>
      <Dot />
      {/* `min-w-0`: mặc định flex item có `min-width:auto` nên không co lại
          dưới kích thước nội dung — `truncate` sẽ không bao giờ kích hoạt. */}
      <span className="min-w-0 truncate">{lane.model}:{lane.effort}</span>
      {lane.kind !== 'main' && (
        <>
          <Dot />
          <span className="shrink-0 uppercase tracking-wider">{lane.kind}</span>
        </>
      )}
      <Dot />
      <span className="shrink-0 tabular-nums">
        {lane.tokensIn}↓ {lane.tokensOut}↑
      </span>
      <Dot />
      {/* Model chưa có hợp đồng giá → `calculateModelCost` trả 'unknown'. Gạch
          đầu dòng nói "không biết", không phải con số 0 và không phải chữ
          "unknown" đọc như một số đo hỏng. */}
      {lane.costUsd === 'unknown' ? (
        <span className="shrink-0 text-disabled">—</span>
      ) : (
        <span className="shrink-0 tabular-nums text-secondary">${lane.costUsd.toFixed(4)}</span>
      )}
      <Dot />
      <EvidenceBadge level={lane.evidence} size="md" className="shrink-0" />
    </div>
  );
}

function Dot() {
  return <span className="shrink-0 text-disabled">·</span>;
}
