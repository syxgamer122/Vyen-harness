/*
 * MÔ HÌNH LƯỢT — dữ liệu gắn theo SỰ KIỆN (DESIGN.md §15.1 "chốt trước").
 *
 * Vì sao phải là dữ liệu lưu trữ chứ không phải phép gom lúc vẽ:
 * "Lượt là đơn vị công việc người dùng giao và agent theo đuổi tới lúc dừng".
 * Nếu mỗi chỗ render tự quyết ranh giới lượt thì hai màn hình cùng hội thoại
 * sẽ gom khác nhau — cùng một lịch sử, hai cách đọc. Nên ranh giới do HÀNH
 * ĐỘNG người dùng (gửi / Stop / New task) quyết định và được GHI vào row, chứ
 * không suy từ nội dung tin nhắn.
 *
 * File này là NGUỒN DUY NHẤT của ba việc:
 *   1. cấp `turnId` cho row (lúc ghi, xem `assignTurnIds`);
 *   2. tổng hợp trạng thái của cả lượt theo bảng §15.5 (xem `turnStatusOf`);
 *   3. gom nhóm để vẽ (xem `groupTurns`) — gồm cả đường lui cho row cũ chưa
 *      từng có `turnId`.
 *
 * Bảng phân biệt ranh giới lượt (§15.1 chốt trước):
 *   Gửi khi agent ĐANG chạy          → lượt đang mở, thành đoạn điều chỉnh
 *   Giao việc khác khi đang chạy    → lượt mới (đi qua New task)
 *   Stop rồi gửi tiếp                → lượt mới (lượt cũ đóng khi tool ngừng)
 *   Bấm Retry sau lỗi                → KHÔNG tạo lượt mới (cùng lượt, thêm lần thử)
 *   Trả lời đúng câu đang chờ quyền  → lượt đang mở
 *   Tin khác khi đang chờ quyền      → lượt mới
 *
 * Ba dòng đầu và hai dòng cuối đều đến từ cùng một câu hỏi: "lúc người dùng
 * gửi, lượt trước đã ĐÓNG chưa?". Câu trả lời nằm ở dữ liệu của row cuối
 * (xem `isOpenTurnRow`), không nằm ở nội dung tin nhắn người dùng vừa gõ.
 */

/**
 * Row tối thiểu mà mô hình lượt cần. Cố ý KHÔNG nhận `StoredMessage` để file
 * này test được bằng dữ liệu giả và không kéo Dexie vào vòng import.
 */
export interface TurnRow {
  id: string;
  role: string;
  /** Trường mới (không index, xem lib/db.ts). Row cũ đọc ra là undefined. */
  turnId?: string;
  /** `status` của StoredMessage: streaming / complete / aborted / error… */
  status?: string;
  finishReason?: string;
  /** Kết quả tool client — dùng để biết còn tool nào CHƯA trả về. */
  toolInvocations?: Array<{ state?: string }>;
  /**
   * Chữ của tin. CHỈ tên việc đọc trường này (`turnTitleOf`) — mọi phép tính
   * khác của lượt là chuyện trạng thái, không chuyện nội dung.
   *
   * Khai ra đây thay vì để call site tự thêm: khi nó còn là trường ẩn, một chỗ
   * gọi quên bơm `content` vẫn biên dịch được và MỌI header lặng lẽ rơi về
   * "Lượt chưa có yêu cầu" (đã xảy ra thật ở `message-list.tsx`).
   */
  content?: string;
}

/**
 * Ý định của lần GHI này, do sự kiện quyết định:
 *   `new`      — người dùng bảo "việc khác" (New task), hoặc follow-up
 *   `continue` — điều chỉnh việc đang làm (steering, goal loop, trả lời câu hỏi)
 *   null       — không có tín hiệu nào thêm: suy từ trạng thái row liền trước
 */
export type TurnIntent = 'new' | 'continue';

/** Trạng thái LƯỢT theo bảng chốt ở §15.5 (KHÁC trạng thái tool). */
export type TurnStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'stopping'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled';

/**
 * Nhãn hiển thị — copy nguyên văn bảng §15.5. Không tự đặt tên khác: ba trục
 * trạng thái (tool / lượt / bằng chứng) phải đọc ra khác nhau, và cách duy nhất
 * để chúng khác nhau là dùng đúng chữ đã chốt.
 */
export const TURN_STATUS_LABEL: Record<TurnStatus, string> = {
  queued: 'chờ bắt đầu',
  running: 'đang làm',
  waiting_approval: 'chờ bạn quyết định',
  stopping: 'đang dừng',
  completed: 'xong',
  blocked: 'bị chặn',
  failed: 'lỗi',
  cancelled: 'đã hủy',
};

/**
 * Nghĩa đầy đủ — đưa vào `title` của chip trạng thái để mắt đọc luôn có chỗ
 * tra, vì nhãn 2-3 chữ không tự nói được khác biệt "bị chặn" vs "lỗi".
 * Câu chữ lấy từ cột "Nghĩa chính xác"/"Không dùng khi" của §15.5.
 */
export const TURN_STATUS_MEANING: Record<TurnStatus, string> = {
  queued: 'Đã nhận yêu cầu, chưa bắt đầu xử lý.',
  running: 'Còn tiến triển — kể cả khi đang chờ mạng hoặc tiến trình con.',
  waiting_approval:
    'Agent đã dừng, không tiến triển cho tới khi bạn cấp quyền, chọn phương án hoặc bổ sung thông tin.',
  stopping: 'Bạn đã bấm Stop, vài tool còn đang thực thi.',
  completed: 'Agent đã dừng và báo hoàn tất — chưa nói kết quả đã được kiểm chứng.',
  blocked: 'Không tiếp tục được và đã nói rõ thiếu gì; cần đổi điều kiện rồi chạy lại.',
  failed: 'Đã thử và hỏng.',
  cancelled: 'Mọi tool đã ngừng chạy; lượt đóng ở đây.',
};

let turnCounter = 0;

/**
 * Id lượt mới. Dùng `crypto.randomUUID` khi có (trình duyệt + Node 19+), không
 * thì rơi về chuỗi tăng dần kèm thời gian — id chỉ cần phân biệt trong một
 * phiên chat, không cần khó đoán.
 */
export function newTurnId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  turnCounter += 1;
  return `turn-${Date.now().toString(36)}-${turnCounter}`;
}

/**
 * Row này có để lượt ĐANG MỞ hay không — tức lúc nó được ghi, việc còn đang
 * dang dở. Đây là câu hỏi duy nhất quyết định tin người dùng kế tiếp thuộc lượt
 * cũ hay mở lượt mới, và nó đọc từ DỮ LIỆU của row, không đọc nội dung.
 *
 * Ba dấu hiệu, đều là dữ liệu có thật:
 *   - trợ lý đang stream (`status: 'streaming'`)
 *   - còn tool chưa trả về (`state` khác `result`) — đây chính là ca "trả lời
 *     đúng câu đang chờ quyền": lượt chưa đóng nên không được mở lượt mới
 *   - trợ lý chưa có kết luận nào (`status: 'pending'`)
 *
 * Tin NGƯỜI DÙNG cũng để lượt mở: khi câu trả lời chưa kịp thành row, người
 * dùng gửi tiếp là đang điều chỉnh chính việc đó.
 */
export function isOpenTurnRow(row: TurnRow | null | undefined): boolean {
  if (!row) return false;
  if (row.role === 'user') return true;
  if (row.role !== 'assistant') return false;
  if (row.status === 'streaming' || row.status === 'pending') return true;
  return (row.toolInvocations ?? []).some((inv) => (inv.state ?? '') !== 'result');
}

export interface AssignTurnOptions {
  /**
   * Ý định của sự kiện ghi này — xem `TurnIntent`. Áp cho row NGƯỜI DÙNG CUỐI
   * CÙNG, vì sự kiện nào cũng chỉ vừa tạo đúng một tin người dùng (New task,
   * follow-up, steering, hoặc tin gõ tay).
   */
  intent?: TurnIntent | null;
  /** Id mới cho mỗi lượt cần mở — bơm vào để test tất định. */
  mintId?: () => string;
}

/**
 * LUẬT DUY NHẤT quyết định lượt của một row — dùng cho cả đường GHI
 * (`reconcileActiveMessages` gán cho row mới) lẫn đường ĐỌC (`groupTurns` gom
 * cho màn hình). Hai đường phải hỏi cùng một hàm, nếu không chúng sẽ trả lời
 * khác nhau và đó chính là thứ §15.1 chốt trước cấm.
 *
 * @param cursor lượt đang mở tại thời điểm trước row này (null = chưa có)
 * @param row    row cần quyết định (đã có `turnId` thì trả lại chính nó)
 * @param previous row liền trước trong projection đang đọc
 * @param intent ý định của sự kiện, chỉ có nghĩa với row người dùng cuối cùng
 */
export function nextTurnId(
  cursor: string | null,
  row: TurnRow,
  previous: TurnRow | null,
  intent: TurnIntent | null,
  mintId: () => string = newTurnId,
): string {
  if (row.turnId) return row.turnId;
  if (row.role !== 'user') return cursor ?? mintId();
  if (intent === 'new') return mintId();
  if (intent === 'continue') return cursor ?? mintId();
  /*
   * Không có tín hiệu sự kiện: hỏi thẳng row liền trước còn dang dở hay không.
   * Tin người dùng đứng sau một lượt ĐÓNG là việc mới; đứng sau lượt đang mở là
   * điều chỉnh việc đang làm.
   */
  return isOpenTurnRow(previous) && cursor ? cursor : mintId();
}

/**
 * Cấp `turnId` cho những row CÒN THIẾU, đi một lượt theo đúng thứ tự đang đọc.
 *
 * Trả về Map CHỈ chứa row cần gán — row đã có `turnId` giữ nguyên giá trị đã
 * lưu. Nhờ vậy hàm này dùng được cho cả hai việc:
 *   - row mới trong lần reconcile này;
 *   - row cũ chưa từng có `turnId` (nâng cấp dữ liệu một lần, rồi ghi lại).
 *
 * Điều kiện ranh giới:
 *   - row đầu tiên, hoặc row `user` đứng sau một lượt ĐÃ ĐÓNG → lượt mới;   *   - row `user` có ý định `continue` đứng trong lượt đang mở → giữ lượt đó;
 *   - row `user` có ý định `new` → luôn mở lượt mới (New task / follow-up);
 *   - row khác (trợ lý, tool, system) → nối vào lượt của row liền trước.
 *
 * Trợ lý / tool / system không bao giờ tự mở lượt: chúng là phần thân của việc
 * người dùng vừa giao. Chỉ khi hội thoại mở đầu bằng một row không phải `user`
 * (dữ liệu lạ, hoặc lượt bị cắt đầu) thì mới tự mở, nếu không nó không thuộc
 * lượt nào để vẽ.
 */
export function assignTurnIds(
  rows: readonly TurnRow[],
  options: AssignTurnOptions = {},
): Map<string, string> {
  const mint = options.mintId ?? newTurnId;
  const lastUserId = [...rows].reverse().find((row) => row.role === 'user')?.id ?? null;
  const assigned = new Map<string, string>();
  let current: string | null = null;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const previous = index > 0 ? rows[index - 1] : null;
    const intent = row.id === lastUserId ? options.intent ?? null : null;
    const turnId = nextTurnId(current, row, previous, intent, mint);
    current = turnId;
    if (!row.turnId) assigned.set(row.id, turnId);
  }

  return assigned;
}

export interface TurnStatusOptions {
  /** Lượt này đã được yêu cầu dừng nhưng tool chưa ngừng — §15.1 "Stop". */
  stopRequested?: boolean;
  /** Lượt đã biết thiếu gì và cần người dùng đổi điều kiện (§15.5 `blocked`). */
  blockedReason?: string | null;
}

/**
 * Trạng thái của CẢ LƯỢT từ dữ liệu của các row thuộc lượt đó (§15.5).
 *
 * Thứ tự xét là thứ tự ưu tiên thật, không phải thứ tự bảng:
 *   1. `stopRequested` + còn tool chạy  → `stopping` (KHÔNG được nói "đã hủy"
 *      khi tiến trình còn đang ghi file — người dùng sẽ tin một trạng thái
 *      không có thật)
 *   2. còn tool chưa trả về             → `waiting_approval`
 *   3. trợ lý đang stream / chưa có gì  → `running`
 *   4. chưa có trợ lý nào               → `queued` (đã nhận, chưa xử lý)
 *   5. `blockedReason`                  → `blocked`
 *   6. lần thử cuối lỗi                 → `failed`
 *   7. lần thử cuối bị hủy              → `cancelled`
 *   8. còn lại                          → `completed`
 *
 * "Xong" ở đây KHÔNG kèm dấu tick xanh nào: §15.5 chốt rằng xong chỉ nghĩa
 * agent đã dừng và báo hoàn tất, còn "đã xác minh" là trục BẰNG CHỨNG riêng.
 */
export function turnStatusOf(
  rows: readonly TurnRow[],
  options: TurnStatusOptions = {},
): TurnStatus {
  if (rows.length === 0) return 'queued';

  const assistants = rows.filter((row) => row.role === 'assistant');
  const hasRunningTool = rows.some((row) =>
    (row.toolInvocations ?? []).some((inv) => (inv.state ?? '') !== 'result'),
  );

  if (options.stopRequested && hasRunningTool) return 'stopping';
  if (hasRunningTool) return 'waiting_approval';
  if (rows.some((row) => row.status === 'streaming' || row.status === 'pending')) return 'running';
  if (assistants.length === 0) return 'queued';
  if (options.blockedReason) return 'blocked';

  const last = assistants[assistants.length - 1];
  if (last.status === 'error' || last.finishReason === 'error') return 'failed';
  if (last.status === 'aborted' || last.finishReason === 'abort') {
    return options.stopRequested ? 'stopping' : 'cancelled';
  }
  return 'completed';
}

/**
 * Lượt đã ĐÓNG thì mới gập được (DESIGN.md §15.1 điểm 3).
 *
 * Vì sao phải chặn theo trạng thái chứ không cho gập tự do: gập một lượt đang chạy
 * hay đang chờ quyền là giấu đúng thứ người dùng đang cần nhìn — tiến trình sống và
 * câu hỏi chờ họ trả lời. Cùng lý do, lượt ĐANG MỞ tự mở lại nếu nó từng bị gập: luật
 * nằm ở trạng thái, không nằm ở việc ai đó nhớ bỏ id ra khỏi tập gập.
 *
 * `queued`/`running`/`waiting_approval`/`stopping` đều còn việc để xem, nên không
 * nằm trong danh sách này.
 */
export function isFoldableTurn(status: TurnStatus): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'blocked' ||
    status === 'cancelled'
  );
}

/** Trần ký tự của tên việc trên turn header — đủ để nhận ra lượt, không đủ để thành đoạn văn. */
export const TURN_TITLE_MAX = 72;

/*
 * Dấu markdown mở dòng — `#{1,6}` chứ không phải một dấu `#`: tiêu đề cấp 2
 * (`## Sửa lỗi đăng nhập`) là dạng phổ biến nhất người dùng gõ, và bỏ sót nó
 * thì tên việc hiện ra kèm dấu thừa ngay trên header của MỌI lượt như vậy.
 */
const MARKDOWN_NOISE = /^[ \t]*(?:#{1,6}|[>*\-+]|\d+[.)])\s*/;

/**
 * Tên việc của lượt — lấy từ yêu cầu người dùng MỞ lượt, không lấy từ câu trả
 * lời (câu trả lời có thể bắt đầu bằng "Chắc chắn rồi", vô nghĩa khi nhìn lướt
 * lịch sử; §15.1 điểm 4 đòi "nhìn lướt phải phân biệt được lượt nào sửa tính
 * năng, lượt nào điều tra lỗi").
 *
 * Lấy DÒNG đầu có chữ, bỏ dấu markdown mở đầu, gộp khoảng trắng, cắt trần.
 * Không cắt giữa từ và không bao giờ trả chuỗi rỗng.
 */
export function turnTitleOf(rows: readonly TurnRow[]): string {
  const first = rows.find((row) => row.role === 'user');
  return titleFromText(first ? textOf(first) : '');
}

function titleFromText(raw: string): string {
  const line = raw
    .split('\n')
    .map((candidate) => candidate.replace(MARKDOWN_NOISE, '').trim())
    .find((candidate) => candidate !== '');
  if (!line) return 'Lượt chưa có yêu cầu';
  const flat = line.replace(/\s+/g, ' ').trim();
  if (flat.length <= TURN_TITLE_MAX) return flat;
  const clipped = flat.slice(0, TURN_TITLE_MAX);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > TURN_TITLE_MAX / 2 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

function textOf(row: TurnRow): string {
  return typeof row.content === 'string' ? row.content : '';
}

/**
 * Phần dữ liệu của row mà màn hình lấy từ chỗ khác (không nằm trong nội dung
 * tin): lượt đã lưu, trạng thái, kết quả tool.
 */
export type TurnRowExtras = Omit<TurnRow, 'id' | 'role' | 'content'>;

/**
 * Dựng row cho `groupTurns` từ danh sách tin đang đọc — MỘT chỗ duy nhất, để
 * call site không tự ghép lại hình dạng row bằng tay.
 *
 * Vì sao phải gom: bản đầu của `message-list.tsx` tự map từng trường và bỏ sót
 * `content`; mọi thứ vẫn biên dịch, mọi header vẫn vẽ, chỉ có TÊN VIỆC là mất
 * (rơi về chuỗi dự phòng). Một hàm dựng row dùng chung khiến việc bỏ sót một
 * trường trở thành thay đổi nhìn thấy được, và test gọi được HÀM THẬT.
 *
 * `content` chỉ nhận chuỗi: tin đa phần (parts) không có dòng đầu để đặt tên,
 * nên trả `undefined` để `turnTitleOf` dùng chuỗi dự phòng thay vì in ra
 * "[object Object]".
 */
export function turnRowsOf<T extends { id: string; role: string; content?: unknown }>(
  messages: readonly T[],
  extrasOf: (message: T) => TurnRowExtras,
): TurnRow[] {
  return messages.map((message) => {
    const extras = extrasOf(message);
    return {
      id: message.id,
      role: message.role,
      turnId: extras.turnId,
      status: extras.status,
      finishReason: extras.finishReason,
      toolInvocations: extras.toolInvocations,
      content: typeof message.content === 'string' ? message.content : undefined,
    };
  });
}

/** Đường dẫn file trong tham số tool — chỉ đọc các khoá đã biết, không đoán chuỗi hiển thị. */
const FILE_ARG_KEYS = ['file_path', 'filePath', 'path'] as const;

export interface TurnSummary {
  id: string;
  /** Tên việc: nội dung yêu cầu người dùng mở lượt. */
  title: string;
  status: TurnStatus;
  label: string;
  /** Thời điểm row đầu lượt được tạo — thông tin PHỤ trên header, không phải điểm nhấn. */
  startedAt: number | null;
  /** Số lần gọi tool trong lượt — thông tin PHỤ. */
  toolCount: number;
  /** Số file khác nhau bị nhắc trong tham số tool — thông tin PHỤ. */
  filesTouched: number;
  messageIds: string[];
}

export interface GroupTurnsOptions extends TurnStatusOptions {
  /** Ý định của sự kiện ghi đang chờ, xem `AssignTurnOptions`. */
  intent?: TurnIntent | null;
  mintId?: () => string;
  /** `createdAt` theo id row — thời gian chỉ là thông tin phụ nên được bơm vào. */
  createdAtOf?: (rowId: string) => number | null;
  /** Tham số tool theo id row — nguồn đếm file; bơm vào để hàm thuần test được. */
  toolArgsOf?: (rowId: string) => ReadonlyArray<unknown>;
}

/**
 * Gom row thành danh sách lượt, theo thứ tự đang đọc.
 *
 * Dùng chung cho MỌI màn hình cần biết lượt (danh sách tin nhắn, dải tóm tắt,
 * ảnh nghiệm thu) nên không màn hình nào tự gom lại — đúng yêu cầu §15.1.
 *
 * Row cũ chưa có `turnId` đi qua đúng `assignTurnIds`, tức cũng một luật, không
 * phải một đường suy đoán thứ hai. Kết quả KHÔNG được ghi đè vào DB ở đây: hàm
 * này thuần, còn việc ghi là của `reconcileActiveMessages`.
 */
export function groupTurns(
  rows: readonly TurnRow[],
  options: GroupTurnsOptions = {},
): TurnSummary[] {
  const assigned = assignTurnIds(rows, {
    intent: options.intent,
    mintId: options.mintId,
  });

  const byTurn = new Map<string, TurnRow[]>();
  const order: string[] = [];

  for (const row of rows) {
    /* `||` chứ không `??`: chuỗi rỗng không phải một lượt hợp lệ (dữ liệu cũ ghi
       ra `''`), và nếu coi nó là hợp lệ thì row bị MẤT khỏi mọi lượt — header
       của lượt đó cũng mất theo, vì nó gắn vào tin đầu của lượt. */
    const id = row.turnId || assigned.get(row.id);
    if (!id) continue;
    const bucket = byTurn.get(id);
    if (bucket) {
      bucket.push(row);
    } else {
      byTurn.set(id, [row]);
      order.push(id);
    }
  }

  return order.map((id) => {
    const bucket = byTurn.get(id) ?? [];
    const status = turnStatusOf(bucket, {
      stopRequested: options.stopRequested,
      blockedReason: options.blockedReason,
    });
    const first = bucket[0];
    const toolArgs = bucket.flatMap((row) => options.toolArgsOf?.(row.id) ?? []);
    return {
      id,
      title: turnTitleOf(bucket),
      status,
      label: TURN_STATUS_LABEL[status],
      startedAt: first ? options.createdAtOf?.(first.id) ?? null : null,
      toolCount: bucket.reduce((total, row) => total + (row.toolInvocations?.length ?? 0), 0),
      filesTouched: countFiles(toolArgs),
      messageIds: bucket.map((row) => row.id),
    };
  });
}

/**
 * Id các row bị ẨN khi những lượt này đang gập.
 *
 * Row ĐẦU của lượt luôn ở lại: đó là chỗ gắn turn header, và header chính là thứ
 * còn lại để đọc lướt. Ẩn luôn nó thì lượt biến mất hẳn khỏi lịch sử — khác hẳn ý
 * "gập thân lại".
 *
 * Hàm thuần, nhận `turns` từ `groupTurns` nên dùng đúng một luật ranh giới lượt với
 * mọi màn hình khác, không tự gom lại.
 */
export function foldedRowIds(
  turns: readonly TurnSummary[],
  collapsed: ReadonlySet<string>,
): Set<string> {
  const hidden = new Set<string>();
  if (collapsed.size === 0) return hidden;
  for (const turn of turns) {
    if (!collapsed.has(turn.id)) continue;
    /* Một row thì không có "thân" để gập; và lượt đang mở thì luôn phải nhìn thấy. */
    if (turn.messageIds.length <= 1 || !isFoldableTurn(turn.status)) continue;
    for (const id of turn.messageIds.slice(1)) hidden.add(id);
  }
  return hidden;
}

/** Số đường dẫn KHÁC NHAU mà tool đụng tới. Không parse chuỗi hiển thị: đọc thẳng tham số. */
export function countFiles(args: readonly unknown[]): number {
  const paths = new Set<string>();
  for (const arg of args) {
    if (typeof arg !== 'object' || arg === null) continue;
    for (const key of FILE_ARG_KEYS) {
      const value = (arg as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim() !== '') paths.add(value);
    }
  }
  return paths.size;
}

/**
 * Thời gian chạy dạng ngắn cho phần phụ của header — đây là chữ ĐỌC, không phải
 * số liệu kỹ thuật, nên nó không được ở hạng `micro` (10px): §15.3 điểm 12 cấm
 * để thông tin quyết định nằm ở 10/12px, và "lượt này chạy lúc nào" là thứ dùng
 * để tìm lại lịch sử.
 */
export function turnClock(at: number | null): string {
  if (at === null || !Number.isFinite(at)) return '';
  const date = new Date(at);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
