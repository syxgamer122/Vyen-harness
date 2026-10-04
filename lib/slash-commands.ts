/**
 * Hệ thống Slash Commands chuẩn hoá cho Vyen (P2-10).
 *
 * Cung cấp danh mục các lệnh slash chuẩn hỗ trợ cả Web UI và CLI:
 * - /plan <mục tiêu>               — Lập kế hoạch bằng planner model
 * - /mode <auto|smart|approve|chat> — Chuyển đổi chế độ phê duyệt công cụ
 * - /summarize                     — Nén bộ nhớ ngữ cảnh hội thoại ngay lập tức
 * - /recipe <tên>                  — Kích hoạt chạy recipe theo tên
 * - /skills                        — Quản lý và tra cứu các kỹ năng (Skills)
 * - /memory                        — Tra cứu và quản lý bộ nhớ dài hạn
 * - /tools [query]                 — Tra cứu catalog công cụ hệ thống
 * - /cost                          — Thống kê token và chi phí ước tính
 * - Custom slash commands          — Cho phép ánh xạ /<tên> -> recipeId
 */

import { foldText } from '@/lib/search-utils';
import { DISK_SKILL_LIMITS } from '@/lib/skills/disk';

export interface SlashCommandDef {
  name: string;
  syntax: string;
  /**
   * Phần tham số của `syntax`, in mờ cạnh tên lệnh trong palette "/" (mẫu của
   * Claude Code): `/plan <mục tiêu>` đọc ra `<mục tiêu>`.
   *
   * Tuỳ chọn: lệnh không nhận tham số thì không có gì để in, và trường này
   * không bắt buộc phải có để palette vẫn vẽ được. Ràng bởi
   * `argumentHintFromSyntax` — lệnh nào có tham số trong `syntax` mà thiếu
   * trường này là palette không tự tài liệu hoá được, nên test bắt.
   */
  argumentHint?: string;
  description: string;
  aliases?: string[];
  category: 'agent' | 'session' | 'system';
}

/**
 * Phần tham số của `syntax`: mọi thứ sau tên lệnh, `undefined` nếu không có.
 *
 * `syntax` vốn chỉ là chú thích trong danh mục, không ai hiện ra màn hình, nên
 * `/plan <mục tiêu>` và `/mode <auto|smart|approve|chat>` là thứ người dùng
 * phải đoán. Hàm này là chỗ duy nhất được phép quyết định phần tham số là gì;
 * trường `argumentHint` trên từng lệnh chỉ chép lại kết quả của nó, và test
 * khoá hai thứ bằng nhau để chúng không trôi lệch nhau.
 */
export function argumentHintFromSyntax(syntax: string): string | undefined {
  return /^\/\S+\s+(\S.*)$/.exec(syntax.trim())?.[1];
}

/**
 * Item trong menu "/" sau khi lọc.
 *
 * `kind` quyết định hành vi khi chọn:
 *  - `'command'` — lệnh hệ thống (/plan, /mode...): Enter gửi thẳng, không chèn text.
 *  - `'recipe'`  — workflow: mở panel Recipes thay vì chèn text.
 *  - `'prompt'`  — văn bản mẫu chèn vào ô nhập.
 *
 * `description` là dòng phụ hiển thị dưới tên trong menu "/" (mô tả lệnh làm gì,
 * vd /boost sửa file ở đâu). Tuỳ chọn: recipe và prompt tự lưu hiện chưa có mô tả
 * riêng, lúc đó UI lấy `content` làm dòng phụ. `filterPrompts` cố tình KHÔNG
 * so khớp trên `description`: mô tả là câu dài dánh nhãn, khớp vào nó sẽ đẩy lệnh
 * lên đầu danh sách chỉ vì câu mô tả chứa từ khoá.
 *
 * (Trước đây kiểu này nằm trong `lib/prompt-library.ts` — đã gỡ cùng thư viện
 * prompt chat phổ thông của bản web chat cũ.)
 */
export interface FilterablePrompt {
  id: string;
  title: string;
  content: string;
  kind?: 'prompt' | 'recipe' | 'command';
  description?: string;
}

/**
 * Lọc item menu "/" theo từ khoá, có fold dấu tiếng Việt — gõ "tom tat" ra
 * "Tóm tắt". Ưu tiên: khớp đầu tên > khớp trong tên > khớp trong nội dung.
 */
export function filterPrompts<T extends FilterablePrompt>(
  prompts: T[],
  query: string,
  limit = 8,
): T[] {
  const q = foldText(query.trim());
  if (!q) return prompts.slice(0, limit);

  const scored: Array<{ p: T; score: number }> = [];
  for (const p of prompts) {
    const title = foldText(p.title);
    const content = foldText(p.content);
    let score = -1;
    if (title.startsWith(q)) score = 0;
    else if (title.includes(q)) score = 1;
    else if (content.includes(q)) score = 2;
    if (score >= 0) scored.push({ p, score });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.p);
}

export const BUILTIN_SLASH_COMMANDS: SlashCommandDef[] = [
  {
    name: 'boost',
    syntax: '/boost <mục tiêu>',
    argumentHint: '<mục tiêu>',
    description: 'Chạy tác vụ ngay trong workspace hiện tại, sửa file thật',
    category: 'agent',
  },
  {
    name: 'plan',
    syntax: '/plan <mục tiêu>',
    argumentHint: '<mục tiêu>',
    description: 'Lập kế hoạch khảo sát bằng planner model ở chế độ chỉ-đọc',
    category: 'agent',
  },
  {
    name: 'mode',
    syntax: '/mode <auto|smart|approve|chat>',
    argumentHint: '<auto|smart|approve|chat>',
    description: 'Chuyển chế độ phê duyệt công cụ (auto, smart, approve, chat)',
    aliases: ['policy'],
    category: 'agent',
  },
  {
    name: 'summarize',
    syntax: '/summarize',
    description: 'Nén gọn ngữ cảnh hội thoại ngay lập tức (compaction)',
    aliases: ['compact'],
    category: 'session',
  },
  {
    name: 'recipe',
    syntax: '/recipe <tên>',
    argumentHint: '<tên>',
    description: 'Mở hoặc chạy một workflow recipe theo tên',
    category: 'agent',
  },
  {
    name: 'skills',
    syntax: '/skills',
    description: 'Xem danh sách và quản lý các kỹ năng SKILL.md',
    aliases: ['skill'],
    category: 'system',
  },
  {
    name: 'memory',
    syntax: '/memory',
    description: 'Xem và quản lý bộ nhớ dài hạn ',
    aliases: ['memories'],
    category: 'system',
  },
  {
    name: 'tools',
    syntax: '/tools [query]',
    argumentHint: '[query]',
    description: 'Xem danh mục hoặc tìm kiếm công cụ có sẵn',
    aliases: ['tool'],
    category: 'system',
  },
  {
    name: 'cost',
    syntax: '/cost',
    description: 'Xem số lượng token đã dùng và chi phí ước tính',
    aliases: ['usage', 'tokens'],
    category: 'session',
  },
];

/**
 * Enter trong palette "/" được phép chạy MỤC NÀO.
 *
 * Lỗi: Enter áp dụng thẳng mục đang sáng. Palette luôn sáng mục đầu tiên khi
 * mở, nên gõ `/pl` xong bấm Enter là chạy `/plan` — người dùng xin một việc,
 * nhận việc khác, không có dấu hiệu gì cả. Anthropic gỡ hẳn hành vi đó ở
 * Claude Code v2.1.236: Enter gửi đúng chữ đã gõ để lỗi hiện ra.
 *
 * Vì vậy chỉ có hai đường được chạy:
 *  1. chữ đã gói chính là tên mục đang sáng (fold + trim, nên `/Plan` vẫn
 *     khớp `/plan`), hoặc
 *  2. người dùng vừa TỰ điều hướng bằng mũi tên — khi đó mục đang sáng là
 *     thứ họ chỉ tay vào, không phải thứ palette tự chọn giúp.
 *
 * Còn lại trả `null` để Enter rơi xuống đường gửi thường: chữ gõ sai đi tới
 * `parseSlashCommand`, ra `{ kind: 'unknown' }`, và người dùng thấy lỗi tên
 * lệnh thay vì một lệnh lạ chạy âm thầm.
 *
 * `navigated` phải là cờ "người dùng đã bấm phím mũi tên", không phải
 * `index !== 0`: vòng `slice(0, limit)` hay `ArrowUp` từ mục đầu đều quay về
 * 0, nên suy ra từ index sẽ nhầm "người dùng chỉ định" với "mặc định".
 */
export function slashCommitTarget<T extends FilterablePrompt>(
  matches: T[],
  index: number,
  query: string,
  navigated = false,
): T | null {
  const target = matches[index];
  if (!target) return null;
  if (navigated) return target;
  const q = foldText(query.trim());
  if (!q) return null;
  return foldText(target.title.trim()) === q ? target : null;
}

/** Thân quy tắc, không kèm neo — để parser dựng lại cùng một biểu thức. */
const NAME_BODY = '[a-zA-Z0-9][\\w.-]*';

/**
 * Quy tắc tên lệnh — CÙNG quy tắc với tên skill, không phải luật riêng.
 *
 * `lib/skills/disk.ts` chặn tên skill bằng `^[a-zA-Z0-9][\w.-]*$` + 60 ký tự
 * ngay khi đọc file, nên tên hợp lệ đã được định nghĩa ở đó. Trước đây form
 * slash command tự chế một luật khác (`^[a-zA-Z0-9_-]+$`): cho phép tên bắt
 * đầu bằng `-`, chặn dấu chấm — tức lệnh đặt được lại không dùng được.
 *
 * Hệ quả phải nói rõ: `\w` của JS chỉ gồm ASCII, nên tên có dấu tiếng Việt
 * (`/kiểm tra`) bị từ chối. Đó là đánh đổi của việc dùng chung một quy tắc;
 * giữ luật riêng cũng không giúp, vì parser slash chỉ nhận `[A-Za-z0-9_.-]`.
 */
export const SLASH_COMMAND_NAME_PATTERN = new RegExp(`^${NAME_BODY}$`);

/** `/tên` + tham số, dựng từ cùng `NAME_BODY` — không có cờ `g` nên `.exec` sạch. */
const SLASH_INPUT_RE = new RegExp(`^\\/(${NAME_BODY})(?:\\s+([\\s\\S]*))?$`);

/** Trần độ dài tên — lấy từ giới hạn tên skill, không chép số 60 ra riêng. */
export const SLASH_COMMAND_NAME_MAX = DISK_SKILL_LIMITS.nameChars;

export type SlashCommandNameCheck =
  | { ok: true; name: string }
  | { ok: false; error: string };

/**
 * Kiểm tra tên lệnh tùy biến lúc NGƯỜI DÙNG ĐẶT, trả về lỗi tiếng Việt để
 * form hiện thẳng.
 *
 * Phải chặn trùng tên ở đây chứ không đợi tới lúc chạy: `use-chat-orchestration`
 * dựng hàng palette cho lệnh built-in và lệnh tùy biến với cùng một hình
 * `/<title>`, nên lệnh tùy biến tên `/plan` sinh ra HAI hàng trông y hệt mà
 * hàng custom không bao giờ được gọi tới — `parseSlashCommand` luôn route về
 * built-in. Người dùng thấy một lệnh, chạy một lệnh khác.
 *
 * `existingNames` là các tên đang lưu; trùng thì cũng báo, vì `setCustomSlashCommand`
 * ghi đè im lặng và xoá hàng cũ khỏi palette.
 */
export function validateSlashCommandName(
  raw: string,
  existingNames: Iterable<string> = [],
): SlashCommandNameCheck {
  const name = raw.trim().replace(/^\//, '').toLowerCase();
  if (!name) {
    return {
      ok: false,
      error: 'Vui lòng nhập tên lệnh slash (ví dụ: lint hoặc fix).',
    };
  }
  if (!SLASH_COMMAND_NAME_PATTERN.test(name) || name.length > SLASH_COMMAND_NAME_MAX) {
    return {
      ok: false,
      error: `Tên lệnh gồm chữ cái không dấu (a-z), số và các dấu . _ -, bắt đầu bằng chữ hoặc số, tối đa ${SLASH_COMMAND_NAME_MAX} ký tự.`,
    };
  }
  const builtin = BUILTIN_SLASH_COMMANDS.find(
    (b) => b.name === name || b.aliases?.includes(name),
  );
  if (builtin) {
    return {
      ok: false,
      error: `Tên lệnh "/${name}" đã trùng với lệnh mặc định (/${builtin.name}).`,
    };
  }
  const taken = [...existingNames].some(
    (n) => n.trim().replace(/^\//, '').toLowerCase() === name,
  );
  if (taken) {
    return {
      ok: false,
      error: `Lệnh "/${name}" đã tồn tại. Xoá lệnh cũ trước khi gán lại, nếu không sẽ có hai dòng trùng tên trong palette.`,
    };
  }
  return { ok: true, name };
}

export type ParsedSlashCommand =
  | { kind: 'boost'; target: string }
  | { kind: 'plan'; target: string }
  | { kind: 'mode'; mode: 'always' | 'smart' | 'never' | 'chat_only' }
  | { kind: 'summarize' }
  | { kind: 'recipe'; recipeName: string }
  | { kind: 'skills' }
  | { kind: 'memory' }
  | { kind: 'tools'; query?: string }
  | { kind: 'cost' }
  | { kind: 'custom_recipe'; recipeId: string; args?: string }
  | { kind: 'unknown'; command: string; raw: string }
  | null;

/**
 * Chuẩn hóa tham số mode sang 1 trong 4 approvalPolicy chuẩn:
 * 'always' (approve / manual), 'smart' (smart), 'never' (auto / autonomous), 'chat_only' (chat).
 */
export function normalizeModeParam(input: string): 'always' | 'smart' | 'never' | 'chat_only' | null {
  const lower = input.trim().toLowerCase();
  if (['auto', 'never', 'yolo', 'autonomous'].includes(lower)) return 'never';
  if (['smart'].includes(lower)) return 'smart';
  if (['approve', 'always', 'manual', 'ask'].includes(lower)) return 'always';
  if (['chat', 'chat_only', 'chat-only'].includes(lower)) return 'chat_only';
  return null;
}

/**
 * Phân tích chuỗi nhập vào xem có phải lệnh slash không.
 */
export function parseSlashCommand(
  input: string,
  customMappings?: Record<string, string>,
): ParsedSlashCommand {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  /*
   * Tên lệnh đọc bằng CHÍNH thân quy tắc mà `validateSlashCommandName` chặn
   * (`NAME_BODY`), chứ không phải một biểu thức thứ hai.
   *
   * Trước đây là `[a-zA-Z0-9_-]+`: cho tên bắt đầu bằng `-` hay `_` (mà form
   * đặt lệnh lại chặn) và không đọc được dấu chấm, nên tên mà
   * `validateSlashCommandName` cho qua thì parser không nhận — đặt được nhưng
   * không chạy. Hai đầu phải là một.
   */
  const match = SLASH_INPUT_RE.exec(trimmed);
  if (!match) return null;

  const command = match[1].toLowerCase();
  const args = (match[2] ?? '').trim();

  if (command === 'boost') {
    return { kind: 'boost', target: args };
  }

  if (command === 'plan') {
    return { kind: 'plan', target: args };
  }

  if (command === 'mode' || command === 'policy') {
    const mode = normalizeModeParam(args);
    return mode ? { kind: 'mode', mode } : { kind: 'unknown', command, raw: trimmed };
  }

  if (command === 'summarize' || command === 'compact') {
    return { kind: 'summarize' };
  }

  if (command === 'recipe') {
    return { kind: 'recipe', recipeName: args };
  }

  if (command === 'skills' || command === 'skill') {
    return { kind: 'skills' };
  }

  if (command === 'memory' || command === 'memories') {
    return { kind: 'memory' };
  }

  if (command === 'tools' || command === 'tool') {
    return { kind: 'tools', query: args || undefined };
  }

  if (command === 'cost' || command === 'usage' || command === 'tokens') {
    return { kind: 'cost' };
  }

  // Kiểm tra custom slash command: /<tên> -> recipeId
  if (customMappings && command in customMappings) {
    return {
      kind: 'custom_recipe',
      recipeId: customMappings[command],
      args: args || undefined,
    };
  }

  return { kind: 'unknown', command, raw: trimmed };
}
