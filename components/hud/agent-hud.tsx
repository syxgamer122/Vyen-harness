'use client';

import React from 'react';
import { useHudStore, type HudLane } from '@/lib/hud-store';
import { CATEGORY_DESCRIPTIONS } from '@/lib/routing/categories';
import { EvidenceBadge } from '@/components/evidence-badge';
import { TOKEN_ARROW_IN, TOKEN_ARROW_OUT } from '@/lib/message-usage';

interface AgentHudProps {
  className?: string;
}

/**
 * Ô token của thanh trạng thái.
 *
 * Mũi tên lấy từ `lib/message-usage.ts` — cùng hằng số với dòng thống kê dưới
 * tin nhắn. Trước đây chỗ này in `tokensIn↓ tokensOut↑`, ngược hẳn dòng kia
 * (`↑prompt ↓completion`): cùng một lượt, hai bề mặt mang hai nghĩa, và bề mặt
 * sai là bề mặt khiến người dùng tưởng mình đã trả ra token ra.
 *
 * Số 0 bị BỎ HẲN, giống hệt `formatMessageUsage`. `hud-store` mặc định
 * `tokensIn`/`tokensOut` về 0, nên một lane vừa tạo mà chưa có lượt nào chạy
 * sẽ in ra `0↓ 0↑` — hai con số không có nguồn đo mà trông như phép đo.
 */
export function hudTokenText(lane: HudLane): string | null {
  const parts: string[] = [];
  if (lane.tokensIn > 0) parts.push(`${TOKEN_ARROW_IN}${lane.tokensIn}`);
  if (lane.tokensOut > 0) parts.push(`${TOKEN_ARROW_OUT}${lane.tokensOut}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Ô chi phí. `hud-store` để `'unknown'` khi model chưa có hợp đồng giá — ô đó
 * bị bỏ hẳn thay vì in một ký tự thay chữ, vì dòng dưới tin nhắn cũng bỏ hẳn
 * phần không tính được.
 */
export function hudCostText(lane: HudLane): string | null {
  if (lane.costUsd === 'unknown') return null;
  /*
   * Cả hai số token đều 0 nghĩa là CHƯA ĐO ĐƯỢC (gateway không báo usage),
   * không phải "lượt này miễn phí": `calculateModelCost` nhân 0 với bảng giá
   * ra đúng 0. In `$0.0000` ở đó là con số không có phép đo nào đứng sau, và
   * nó trái đúng luật store đã ghi: "TUYỆT ĐỐI không $0".
   * Ô giá chỉ có nghĩa khi đứng cạnh một phép đo token.
   */
  if (lane.tokensIn <= 0 && lane.tokensOut <= 0) return null;
  return `$${lane.costUsd.toFixed(4)}`;
}

/**
 * PHIẾU CỦA LƯỢT GẦN NHẤT — không phải HUD telemetry sống.
 *
 * Store `hud-store` có đủ 9 mutator, nhưng vị trí ghi DUY NHẤT là
 * `use-chat-orchestration.ts` trong `onFinish` — tức là SAU khi lượt đã xong.
 * Vì vậy ở thời điểm render, store chỉ có thể trả lời chính xác cho: model +
 * effort, category, số token, và cost. Các trường còn lại trong `HudLane`
 * (`turn`, `elapsedSec`, `parallelShots`) không có call site nào ghi vào, nên
 * chúng LUÔN bằng 0 — và strip này không in chúng. Số 0 giả còn tệ hơn số
 * thật sai: nó không báo cho người đọc biết mình đang đoán.
 *
 * Vì vậy strip này cũng không giả vờ làm nguồn số liệu trực tiếp. Muốn
 * `turn`/`elapsedSec`/`parallelShots` sống trở lại thì phải có call site ghi ở
 * đầu lượt — xem ghi chú trong `lib/hud-store.ts`.
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
      aria-label="Phiếu lượt chạy gần nhất"
      className={`border-b border-subtle bg-surface px-3 py-1.5 text-meta font-sans text-tertiary ${className}`}
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
  const tokens = hudTokenText(lane);
  const cost = hudCostText(lane);

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
      {tokens !== null && (
        <>
          <Dot />
          <span className="shrink-0 tabular-nums">{tokens}</span>
        </>
      )}
      {cost !== null && (
        <>
          <Dot />
          <span className="shrink-0 tabular-nums text-secondary">{cost}</span>
        </>
      )}
      <Dot />
      <EvidenceBadge level={lane.evidence} size="md" className="shrink-0" />
    </div>
  );
}

function Dot() {
  return <span className="shrink-0 text-disabled">·</span>;
}
