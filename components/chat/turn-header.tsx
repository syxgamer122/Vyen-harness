'use client';

/*
 * TURN HEADER — hàng đầu của một LƯỢT (DESIGN.md §15.1 điểm 4, §14.2).
 *
 * Yêu cầu chốt ở §15.1 điểm 4: nội dung header CHỈ là TÊN VIỆC + TRẠNG THÁI;
 * thời gian, số tool, số file là thông tin PHỤ. §14.2 liệt kê năm thứ ngang nhau
 * (số thứ tự, tên việc, giờ bắt đầu, số hành động, số file) và điểm 4 thu lại
 * đúng vì lý do này: một hàng đầy badge thì nhìn lướt lịch sử không phân biệt
 * được lượt nào sửa tính năng, lượt nào điều tra lỗi — mà đó là việc duy nhất
 * header phải làm được.
 *
 * Ba quyết định, đều để không lặp lại lỗi cũ:
 *   1. KHÔNG badge, không viền, không nền — theo đúng idiom của
 *      `components/chat/status-line.tsx`: chữ trên một nền, `·` phân nhịp, màu
 *      chỉ nhấn khi trạng thái thật sự đáng báo. §15.3 điểm 13 cấm khắc phục
 *      phân cấp bằng cách thêm viền và bóng.
 *   2. Trạng thái LUÔN có cả ICON lẫn CHỮ (§6: ý nghĩa không được chỉ dựa vào
 *      màu; §15.2 điểm 6 đã áp cùng luật cho dòng gọn tool). Nhãn lấy nguyên
 *      văn bảng §15.5 qua `TURN_STATUS_LABEL` — không tự đặt tên khác, vì ba
 *      trục trạng thái phải đọc ra khác nhau.
 *   3. KHÔNG dấu tick cho trạng thái `xong`: §15.5 chốt "xong" chỉ nghĩa agent
 *      đã dừng và báo hoàn tất, còn "đã xác minh" là trục BẰNG CHỨNG riêng.
 *      Một tick xanh ở đây là tự cấp chứng nhận mà không ai kiểm.
 */
import React, { memo } from 'react';
import {
  Ban,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleSlash,
  Clock,
  Hand,
  LoaderCircle,
  OctagonPause,
  TriangleAlert,
} from 'lucide-react';
import {
  TURN_STATUS_MEANING,
  turnClock,
  type TurnStatus,
  type TurnSummary,
} from '@/lib/turns';

/**
 * Một dòng cho mỗi trạng thái: icon + lớp màu. Màu là lớp THỨ HAI — bỏ màu đi
 * vẫn đọc được vì chữ đã nói đủ.
 */
const STATUS_LOOK: Record<TurnStatus, { Icon: React.ElementType; tone: string; spin?: boolean }> = {
  queued: { Icon: Clock, tone: 'text-tertiary' },
  running: { Icon: LoaderCircle, tone: 'text-accent', spin: true },
  waiting_approval: { Icon: Hand, tone: 'text-warning' },
  stopping: { Icon: OctagonPause, tone: 'text-warning' },
  /* Trung tính có chủ đích: "xong" không phải thành tích, nó là mốc dừng. */
  completed: { Icon: Circle, tone: 'text-tertiary' },
  blocked: { Icon: CircleSlash, tone: 'text-warning' },
  failed: { Icon: TriangleAlert, tone: 'text-danger' },
  cancelled: { Icon: Ban, tone: 'text-tertiary' },
};

interface TurnHeaderProps {
  turn: TurnSummary;
  /** Lượt đã đóng → có thân để gập (§15.1 điểm 3). Lượt đang mở thì không. */
  foldable?: boolean;
  /** Đang gập thân lượt — chỉ có nghĩa khi `foldable`. */
  collapsed?: boolean;
  onToggleFold?: (turnId: string) => void;
}

export const TurnHeader = memo(function TurnHeader({
  turn,
  foldable = false,
  collapsed = false,
  onToggleFold,
}: TurnHeaderProps) {
  const look = STATUS_LOOK[turn.status];
  const { Icon } = look;
  const clock = turnClock(turn.startedAt);

  /*
   * Phần phụ chỉ hiện khi có gì thật để nói. Lượt hỏi-đáp không tool mà vẫn kèm
   * một dòng "0 thao tác · 0 file" là nhiễu — đúng thứ §15.6 gọi là "ít nhiễu
   * nhưng nhiều thông tin hữu ích".
   */
  const stats: string[] = [];
  /*
   * "đã gập" là CHỮ, không phải badge: nó trả lời câu "đây là cả lượt hay còn phần
   * đang ẩn?" — không có nó thì một lượt đã gập trông giống hệt một lượt rỗng.
   * Xếp vào dòng phụ vì nó là thông tin phụ, không được tranh chỗ với tên việc.
   */
  if (collapsed) stats.push('đã gập');
  if (turn.toolCount > 0) stats.push(`${turn.toolCount} thao tác`);
  if (turn.filesTouched > 0) stats.push(`${turn.filesTouched} file`);

  return (
    <div
      className="mx-auto flex w-full max-w-thread flex-col gap-0.5 pt-7 pb-0"
      data-testid="turn-header"
      data-turn-status={turn.status}
    >
      <div className="flex min-w-0 items-center gap-2">
        {foldable && (
          /*
           * Nút gập đứng TRƯỚC tên việc: nó điều khiển khối bên dưới, nên đọc như
           * một disclosure của cả hàng, không phải một hành động của tên việc.
           * Không viền, không nền — cùng luật với phần còn lại của header.
           */
          <button
            type="button"
            onClick={() => onToggleFold?.(turn.id)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Mở lượt: ${turn.title}` : `Gập lượt: ${turn.title}`}
            title={collapsed ? 'Mở lượt này' : 'Gập thân lượt này'}
            data-testid="turn-fold"
            data-turn-collapsed={collapsed ? 'true' : 'false'}
            className="flex-none rounded p-0.5 text-tertiary transition-colors hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent-steel"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
        <h3
          className="min-w-0 flex-1 truncate font-sans text-ui font-medium text-primary"
          title={turn.title}
        >
          {turn.title}
        </h3>
        <span
          className={`flex flex-none items-center gap-1 font-sans text-meta ${look.tone}`}
          title={TURN_STATUS_MEANING[turn.status]}
        >
          <Icon size={12} className={look.spin ? 'animate-spin' : undefined} aria-hidden="true" />
          {turn.label}
        </span>
      </div>
      {(clock || stats.length > 0) && (
        <p className="flex flex-wrap items-center gap-x-2 font-sans text-meta text-tertiary">
          {clock && <span className="font-mono tabular-nums">{clock}</span>}
          {stats.map((stat) => (
            <span key={stat} className="font-mono tabular-nums">
              {stat}
            </span>
          ))}
        </p>
      )}
    </div>
  );
});
