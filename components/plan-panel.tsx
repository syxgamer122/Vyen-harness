"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleMinus,
  ListTodo,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import type { Plan, SubtaskStatus } from "@/lib/subtask-plan";
import { planProgress } from "@/lib/subtask-plan";
import { EvidenceBadge } from "@/components/evidence-badge";

/**
 * Checklist tiến độ của plan hiện tại — promise trong khối [PLANNING] của
 * system prompt ("Người dùng sẽ thấy checklist tiến độ trong UI") được minh
 * thực bởi component này. Dữ liệu do plan_create/plan_update ghi vào kv
 * (key `plan:<chatId>`), chat-interface nạp và cập nhật qua props.
 *
 * Phase-TODO Discipline :
 * - Ép tối đa 1 item active (in_progress) tại một thời điểm
 * - Tự động thu gọn (fold) khi danh sách vượt quá 8 dòng
 * - Hiển thị badge bậc thang bằng chứng (Evidence Ladder)
 */

const STATUS_META: Record<
  SubtaskStatus,
  { Icon: typeof Circle; className: string; label: string }
> = {
  pending: { Icon: Circle, className: "text-text-muted", label: "Chờ" },
  in_progress: { Icon: Loader2, className: "animate-spin text-accent-steel", label: "Đang làm" },
  done: { Icon: CheckCircle2, className: "text-status-success", label: "Xong" },
  failed: { Icon: XCircle, className: "text-status-error", label: "Lỗi" },
  skipped: { Icon: CircleMinus, className: "text-text-muted", label: "Bỏ qua" },
};

interface PlanPanelProps {
  plan: Plan;
  onHide: () => void;
  /** Đang ở PLAN mode và agent rảnh → hiện nút "Duyệt & thực hiện" (P1-5). */
  canApprove?: boolean;
  /** Chuyển ACT mode + gửi lượt kick-off thực thi kế hoạch. */
  onApprove?: () => void;
}

export function PlanPanel({ plan, onHide, canApprove = false, onApprove }: PlanPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const prog = planProgress(plan);
  const anyActive = prog.done + prog.failed + prog.skipped < prog.total;

  // Tính evidence level của toàn plan
  const planEvidence = prog.done === prog.total && prog.total > 0
    ? 'verified'
    : anyActive
      ? 'running'
      : 'prepared';

  // Phase-TODO discipline: tìm item in_progress ĐẦU TIÊN làm active item duy nhất
  const firstActiveIdx = plan.subtasks.findIndex((st) => st.status === 'in_progress');
  const normalizedSubtasks = plan.subtasks.map((st, i) => {
    if (st.status === 'in_progress') {
      if (i === firstActiveIdx) {
        return { ...st, isActive: true };
      }
      return { ...st, isActive: false, status: 'pending' as SubtaskStatus };
    }
    return { ...st, isActive: false };
  });

  // Fold khi quá 8 dòng
  const FOLD_LIMIT = 8;
  const isFolded = normalizedSubtasks.length > FOLD_LIMIT && !showAllTasks;
  const visibleTasks = isFolded ? normalizedSubtasks.slice(0, FOLD_LIMIT) : normalizedSubtasks;

  return (
    <div
      className="mx-auto w-full max-w-thread px-4 pb-2 font-sans"
      role="region"
      aria-label={`Kế hoạch: ${plan.title}`}
    >
      <div className="lift-md rounded-xl border border-subtle bg-panel-bg text-xs">
        {/*
         * Badge + bộ đếm nằm NGOÀI nút toggle, ở hàng flex-wrap riêng.
         * Trước đây chúng nằm trong nút cùng tiêu đề: ở cột phụ 320px, ba
         * phần `flex-shrink-0` cùng tranh chỗ với tiêu đề `truncate` nên tiêu
         * đề bị cắt còn 2 ký tự. Ra ngoài thì tiêu đề chiếm hết hàng trên.
         */}
        <div className="flex flex-wrap items-center gap-2 px-3 pb-1 pt-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex min-w-0 flex-1 basis-full items-center gap-2 text-left sm:basis-auto"
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
            )}
            <ListTodo
              className={`h-3.5 w-3.5 flex-shrink-0 ${
                anyActive ? "text-accent-steel" : "text-status-success"
              }`}
              aria-hidden
            />
            <span className="truncate font-semibold text-text-primary">
              <span className="text-accent-steel mr-1">$</span>
              {plan.title}
            </span>
          </button>
          <EvidenceBadge level={planEvidence} />
          <span className="flex-none text-meta tabular-nums text-accent-steel">
            {prog.done}/{prog.total} · {prog.percentComplete}%
          </span>
          {canApprove && onApprove && (
            <button
              type="button"
              onClick={onApprove}
              className="rounded-full border border-success/60 px-2.5 py-1 text-meta font-semibold text-status-success transition-colors hover:bg-success/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[accent]"
              title="Chuyển sang ACT mode và bắt đầu thực thi kế hoạch này"
            >
              Duyệt &amp; thực hiện
            </button>
          )}
          <button
            type="button"
            onClick={onHide}
            className="ml-auto rounded-lg p-1.5 text-text-muted hover:bg-panel-soft hover:text-text-primary"
            aria-label="Ẩn kế hoạch"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Thanh tiến độ mảnh — luôn hiển thị kể cả khi thu gọn */}
        <div className="h-1 overflow-hidden bg-raised">
          <div
            className={`h-full ${anyActive ? "bg-accent" : "bg-success"}`}
            style={{ width: `${Math.max(0, Math.min(100, prog.percentComplete))}%` }}
          />
        </div>

        {expanded && (
          <div className="border-t border-subtle bg-raised px-3 py-2">
            <ol className="space-y-1.5">
              {visibleTasks.map((st) => {
                const meta = STATUS_META[st.status];
                const { Icon } = meta;
                return (
                  <li
                    key={st.id}
                    className={`flex items-start gap-2 rounded px-1.5 py-0.5 transition-colors ${
                      st.isActive ? "bg-accent/10 border border-accent/40" : ""
                    }`}
                  >
                    <Icon className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${meta.className}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-ui leading-5 ${
                            st.status === "done"
                              ? "text-text-muted line-through"
                              : st.isActive
                                ? "font-semibold text-text-primary"
                                : "text-text-muted"
                          }`}
                        >
                          {st.title}
                        </span>
                        {st.isActive && (
                          <span className="text-micro uppercase tracking-wider text-accent-steel font-semibold">
                            [active]
                          </span>
                        )}
                      </div>
                      {st.description && (
                        <p className="text-meta text-text-muted">{st.description}</p>
                      )}
                      {st.files && st.files.length > 0 && (
                        <p className="mt-0.5 truncate font-sans text-micro text-accent-steel">
                          {st.files.join(" · ")}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* Nút toggle fold khi danh sách quá 8 items */}
            {normalizedSubtasks.length > FOLD_LIMIT && (
              <div className="mt-2 pt-1 border-t border-subtle/40 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllTasks(!showAllTasks)}
                  className="text-meta text-accent-steel hover:text-text-primary transition-colors"
                >
                  {showAllTasks
                    ? "▲ Thu gọn danh sách (hiện 8 mục đầu)"
                    : `▼ Xem thêm ${normalizedSubtasks.length - FOLD_LIMIT} công việc nữa...`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
