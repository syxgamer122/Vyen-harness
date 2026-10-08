/*
 * PHASE CỦA TOOL + PHẠM VI CỦA TOOL — hai tầng dữ liệu cho thẻ tool (§14.3).
 *
 * §14.3 lớp 5 đòi nhóm tool theo phase `PLAN → IMPLEMENT → REVIEW`, và §15.2
 * điểm 8 nói rõ nhóm phải "chứa được kiểm tra → sửa → test lỗi → sửa tiếp" —
 * tức KHÔNG phải ba rổ cố định, mà là các ĐOẠN nối tiếp: sửa xong test lại hỏng
 * thì mở đoạn `Thực hiện` mới. Vì vậy `groupByPhase` cắt theo thay đổi phase,
 * giữ nguyên vòng lặp trong dữ liệu.
 *
 * Phân loại dựa trên TÊN TOOL và THAM SỐ (hai thứ có thật), không đọc đầu ra để
 * đoán: đoán sai một lần là UI gọi một lệnh `rm -rf` là "khảo sát". Danh sách
 * dưới đây là bảng tra cố định, test khoá từng dòng — thêm tool mới thì thêm
 * dòng, không suy diễn.
 *
 * Tool không khớp bảng nào rơi vào `other` và hiện nhãn "Khác": thà nói không
 * biết còn hơn gán bừa nó vào một phase trông rất chắc chắn.
 */
export type ToolPhaseName = 'plan' | 'implement' | 'review' | 'other';

/** Nhãn hiển thị của nhóm — chữ người đọc, không phải tên biến. */
export const TOOL_PHASE_LABEL: Record<ToolPhaseName, string> = {
  plan: 'Khảo sát',
  implement: 'Thực hiện',
  review: 'Kiểm chứng',
  other: 'Khác',
};

/**
 * Lệnh được coi là KIỂM CHỨNG. Danh sách cố ý hẹp: chỉ những lệnh mà bản thân
 * tên lệnh đã nói lên việc kiểm tra. `npm run dev` hay `npm run build` KHÔNG
 * nằm đây — chúng tạo ra thứ để kiểm, không phải kiểm.
 */
const VERIFY_COMMAND =
  /(?:^|[\s;&|()"'])(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|tests|lint|typecheck|vitest|jest|tsc|eslint)\b|\b(?:vitest|jest|pytest|mypy|tsc|eslint)\b|cargo\s+test|go\s+test|npx\s+(?:vitest|jest|tsc|eslint)/;

/**
 * Lệnh thật của một lần gọi `shell_run`-kiểu.
 *
 * Tham số đi qua JSON (`{"command":"npm test"}`), nên dò thẳng trên chuỗi thô
 * là dò trên dấu ngoặc kép: lần đầu làm vậy và MỌI lệnh test bị xếp vào "Thực
 * hiện". Đọc đúng khoá lệnh trước, chỉ rơi về chuỗi thô khi tham số không phải
 * JSON.
 */
function commandArgOf(args?: string): string {
  if (typeof args !== 'string' || !args) return '';
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      for (const key of ['command', 'cmd', 'script', 'shell'] as const) {
        const value = parsed[key];
        if (typeof value === 'string' && value.trim() !== '') return value;
      }
    }
  } catch {
    /* Không phải JSON — dùng nguyên chuỗi, ranh giới đã tính cả dấu nháy. */
  }
  return args;
}

/** Tên tool mà việc CỦA NÓ là kiểm chứng — dữ liệu, không suy luận. */
const REVIEW_TOOLS =
  /verify|test|lint|typecheck|diagnos|code_verify|check_types/;

/** Tên tool SỬA ĐỔI trạng thái (tệp, git, bộ nhớ, lịch). */
const IMPLEMENT_TOOLS =
  /fs_edit|fs_write|apply_patch|edit_file|write_file|code_patch|multiedit|shell|bash|exec|command|spawn|git_add|git_commit|git_push|remember_memory|remove_memory|recipe|schedule|delegate|run_code|todo_write|update_plan|create_|delete_|move_|rename_/;

/**
 * Phase của MỘT lần gọi tool.
 *
 * Thứ tự xét là thứ tự ưu tiên: kiểm chứng trước (một lệnh test cũng là
 * `shell_run`, nên nếu xét `shell` trước thì mọi lần chạy test bị gọi là "thực
 * hiện"), rồi tới sửa đổi, rồi tới khảo sát, cuối cùng là `other`.
 */
export function phaseOfTool(name: string, args?: string): ToolPhaseName {
  const n = (name || '').toLowerCase();
  /*
   * Tool MCP: tên chỉ nói NGUỒN, không nói nó đọc hay ghi (`mcp__github__create_issue`
   * và `mcp__fs__read` cùng hình dạng). Không đoán được thì trả `other` — xem
   * đầu file.
   */
  if (n.startsWith('mcp__')) return 'other';
  if (REVIEW_TOOLS.test(n)) return 'review';
  if (n === 'git_diff' || n === 'git_status') return 'review';
  const command = commandArgOf(args);
  /* Lệnh kiểm chứng chỉ tính khi tool ĐÚNG LÀ tool chạy lệnh: `fs_read` có
     tham số chứa chữ "test" không phải là chạy test. */
  if (/shell|bash|exec|command|spawn|run/.test(n) && VERIFY_COMMAND.test(command)) return 'review';
  if (IMPLEMENT_TOOLS.test(n)) return 'implement';
  if (PLAN_TOOLS.test(n)) return 'plan';
  return 'other';
}

export interface ToolPhaseGroup<T> {
  phase: ToolPhaseName;
  label: string;
  /** Số lần gọi trong đoạn này — con số của dòng tiêu đề nhóm. */
  count: number;
  /** Số lần gọi lỗi trong đoạn — hiện thành chữ ở dòng tiêu đề nhóm. */
  errorCount: number;
  events: T[];
}

/** Dữ liệu tối thiểu để cắt đoạn: tên tool, tham số, và cờ lỗi. */
interface PhaseInput {
  name: string;
  args?: string;
  isError?: boolean;
}

/**
 * Cắt danh sách sự kiện thành các ĐOẠN theo phase, giữ nguyên thứ tự.
 *
 * Luật duy nhất: đổi phase thì mở đoạn mới. Hai đoạn `Thực hiện` liền nhau chỉ
 * xảy ra khi giữa chúng có một đoạn khác — đó chính là vòng
 * `sửa → test → sửa`, nên vòng lặp hiện ra mà không cần dựng thêm dữ liệu.
 * Đoạn rỗng không bao giờ được sinh.
 */
export function groupByPhase<T extends PhaseInput>(events: readonly T[]): ToolPhaseGroup<T>[] {
  const groups: ToolPhaseGroup<T>[] = [];
  let current: ToolPhaseGroup<T> | null = null;

  for (const ev of events) {
    const phase = phaseOfTool(ev.name, ev.args);
    if (!current || current.phase !== phase) {
      current = { phase, label: TOOL_PHASE_LABEL[phase], count: 0, errorCount: 0, events: [] };
      groups.push(current);
    }
    current.events.push(ev);
    current.count += 1;
    if (ev.isError) current.errorCount += 1;
  }

  return groups;
}

/**
 * PHẠM VI của một lần gọi (§14.3 lớp 1: project / file / workspace).
 *
 * Đọc từ tham số, không đoán: có đường dẫn tệp thì là `file`; tool chạm trạng
 * thái phiên (bộ nhớ, plan, recall) thì là `workspace`; còn lại chạm dự án
 * (git, shell, tìm kiếm toàn workspace).
 */
export type ToolScope = 'file' | 'project' | 'workspace';

export const TOOL_SCOPE_LABEL: Record<ToolScope, string> = {
  file: 'một tệp',
  project: 'dự án',
  workspace: 'phiên làm việc',
};

/** Khoá tham số mang đường dẫn tệp — cùng bộ khoá với `countFiles` ở lib/turns. */
const FILE_ARG_KEYS = ['file_path', 'filePath', 'path'] as const;

/** Tên tool KHẢO SÁT — đọc, tìm, liệt kê, xem trạng thái/lịch sử. */
const PLAN_TOOLS =
  /fs_read|fs_list|fs_search|fs_glob|fs_stat|web_|search|read|list|glob|fetch|load|recall|skeleton|symbols|inspect|log|^plan$|chat_recall|tools_search/;

/** Tên tool chạm trạng thái PHIÊN chứ không chạm mã nguồn. */
const SESSION_TOOLS = /memory|recall|recipe|schedule|conversation|chat_|session/;

export function toolScopeOf(name: string, args?: string): ToolScope {
  const n = (name || '').toLowerCase();
  if (SESSION_TOOLS.test(n)) return 'workspace';
  const raw = typeof args === 'string' ? args : '';
  if (!raw) return 'project';
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      for (const key of FILE_ARG_KEYS) {
        const value = parsed[key];
        if (typeof value === 'string' && value.trim() !== '') return 'file';
      }
    }
  } catch {
    /* Tham số không phải JSON (một số tool gửi chuỗi thô): rơi về phép dò thô
       bên dưới, KHÔNG kết luận `file` chỉ vì thấy dấu chấm. */
  }
  return 'project';
}
