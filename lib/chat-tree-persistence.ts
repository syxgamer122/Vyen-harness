/*
 * Logic persistence cho cây hội thoại — tách khỏi chat-interface.tsx.
 * Toàn bộ hàm thuần (không React), dễ unit-test độc lập.
 */
import type { Message } from 'ai/react';
import { toParentKey, fromParentKey, type StoredMessage, type StoredAttachment } from '@/lib/db';
import { reconstructActiveThread } from '@/lib/tree-utils';
import { toPersistableText } from '@/lib/message-text';
import { nextTurnId, type TurnIntent } from '@/lib/turns';

export const CONTINUE_PROMPT =
  'Câu trả lời trước bị ngắt giữa chừng. Hãy viết tiếp CHÍNH XÁC từ chỗ bị cắt, ' +
  'không lặp lại phần đã viết, không mở đầu lại, giữ nguyên định dạng LaTeX.';

/** Nội dung lưu/hiển thị luôn phải là string sạch. */
export function sanitizeContent(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'object') return toPersistableText(raw as any);
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/(?:\r?\n[ \t]*(?:\[object [A-Za-z]+\]|undefined|null|NaN)[ \t]*)+[\s]*$/g, '')
    .replace(/(\$\$|\\\]|\\\)|>)[ \t]*(?:\[object [A-Za-z]+\]|undefined|null|NaN)+[\s]*$/g, '$1')
    .replace(/[\s\u200B]+$/, '');
}

/** Backend gắn annotation type:'finish' — dùng để biết tin nhắn có bị cắt hay không. */
export function getFinishInfo(m: Message): { truncated: boolean; message?: string } {
  const ann = (m.annotations as any[] | undefined) ?? [];
  const finish = ann.find((a) => a && a.type === 'finish');
  return { truncated: Boolean(finish?.truncated), message: finish?.message };
}

const attachmentCache = new WeakMap<object, StoredAttachment | null>();

async function toStoredAttachment(a: any): Promise<StoredAttachment | null> {
  if (typeof a === 'object' && a !== null && attachmentCache.has(a)) {
    return attachmentCache.get(a)!;
  }

  const name = a.name ?? 'file';
  const contentType = a.contentType ?? '';

  const newId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  let stored: StoredAttachment | null = null;

  if (a.blob instanceof Blob) {
    stored = {
      id: newId(),
      name,
      contentType: contentType || a.blob.type,
      size: a.blob.size,
      blob: a.blob,
    };
  } else {
    const url = typeof a.url === 'string' ? a.url : '';

    if (url.startsWith('data:') || url.startsWith('blob:')) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        stored = {
          id: newId(),
          name,
          contentType: contentType || blob.type,
          size: blob.size,
          blob,
        };
      } catch {
        // Không fetch được blob tạm — attachment không dùng được.
        stored = null;
      }
    } else if (/^https?:\/\//i.test(url)) {
      stored = {
        id: newId(),
        name,
        contentType,
        size: 0,
        remoteUrl: url,
      };
    }
  }

  if (typeof a === 'object' && a !== null) {
    attachmentCache.set(a, stored);
  }
  return stored;
}

async function getStoredAttachments(
  message: Message,
): Promise<StoredAttachment[] | undefined> {
  const rawAttachments =
    message.experimental_attachments as
      | any[]
      | undefined;

  if (
    !rawAttachments ||
    rawAttachments.length === 0
  ) {
    return undefined;
  }

  const converted = await Promise.all(
    rawAttachments.map(toStoredAttachment),
  );
  const usable = converted.filter(
    (attachment): attachment is StoredAttachment => attachment !== null,
  );
  return usable.length ? usable : undefined;
}

function getMessageCreatedAt(
  message: Message,
  fallback: number,
): number {
  if (typeof message.createdAt === 'number') {
    return message.createdAt;
  }

  if (message.createdAt instanceof Date) {
    return message.createdAt.getTime();
  }

  return fallback;
}

export function revokeObjectUrls(urls: Set<string>) {
  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
  urls.clear();
}

function createAttachmentUrl(attachment: StoredAttachment, urls: Set<string>): string {
  if (attachment.blob) {
    const url = URL.createObjectURL(attachment.blob);
    urls.add(url);
    return url;
  }
  return attachment.remoteUrl ?? '';
}

/**
 * Trần ký tự cho reasoning ĐƯỢC GHI (không phải trần hiển thị).
 *
 * Vì sao vẫn phải có trần: reasoning là chuỗi không biên dịch dài nhất từng
 * đi vào IndexedDB và nó NHÂN theo số lượt — `components/storage-quota-meter.tsx`
 * tồn tại vì người dùng đã dính quota. Một model chạy lỗi (lặp thought, không
 * chạm `finish_reason`) có thể đẩy hàng MB vào MỘT row.
 *
 * Vì sao trần rộng: reasoning CHÍNH LÀ nội dung mà tính năng này sinh ra để
 * giữ. 150.000 ký tự ≈ 37k reasoning token — hơn trọn một trace high-effort
 * của dòng o — và ~6× trần tool result (24k, xem STORED_TOOL_RESULT_CHARS).
 * Cắt dứt ở con số nhỏ hơn sẽ phá đúng thứ tính năng sinh ra.
 */
export const STORED_REASONING_CHARS = 150_000;

/** Chừa chỗ cho ghi chú cắt trần, kể cả khi con số ký tự bị mất dài thêm vài chữ số. */
const REASONING_CUT_NOTE_RESERVE = 96;

function reasoningCutNote(dropped: number): string {
  return `\n\n[… ${dropped} ký tự reasoning cuối đã bị cắt khi lưu …]`;
}

/**
 * Reasoning tới từ Message của useChat: có thể undefined (model không suy
 * luận, hoặc row cũ chưa có trường này) và không phải string thì bỏ luôn.
 *
 * Vượt trần thì giữ ĐẦU và kèm ghi chú nói rõ đã bị cắt — không cắt trầm
 * lặng, vì reasoning hiển thị thẳng cho người đọc trong ThinkingBlock và đoạn
 * bị cắt phải trông như đoạn bị cắt, không như suy nghĩ kết thúc ở đó.
 *
 * Hàm này chạy ở CẢ HAI vế của hasStoredMessageChanged, nên nó idempotent:
 * một reasoning dài bị cắt rồi thì so sánh với bản đã cắt vẫn ra kết quả
 * giống nhau — không sinh lượt ghi mỗi lần reconcile vì lý do cắt trần.
 */
function toStoredReasoning(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  if (raw.length <= STORED_REASONING_CHARS) return raw;
  let keep = STORED_REASONING_CHARS - REASONING_CUT_NOTE_RESERVE;
  let note = reasoningCutNote(raw.length - keep);
  /* Số ký tự bị mất nằm trong chính ghi chú nên độ dài ghi chú phụ thuộc nó:
     chừa lại đúng bằng phần dư. Vòng lặp hội tụ (mỗi vòng thêm ít nhất 1 ký tự
     vào `keep`, còn số chữ số chỉ dài thêm có hạn) → tổng luôn ≤ trần. */
  while (note.length > REASONING_CUT_NOTE_RESERVE) {
    keep -= note.length - REASONING_CUT_NOTE_RESERVE;
    note = reasoningCutNote(raw.length - keep);
  }
  return raw.slice(0, keep) + note;
}

export function toChatMessage(
  row: StoredMessage,
  objectUrls: Set<string>,
): Message & {
  status?: StoredMessage['status'];
  finishReason?: StoredMessage['finishReason'];
  turnId?: string;
  createdAtMs?: number;
} {
  return {
    id: row.id,
    role: row.role as Message['role'],
    content: sanitizeContent(row.content),
    status: row.status,
    finishReason: row.finishReason,
    /* Mốc thời gian của row, dạng số. `Message.createdAt` của SDK là `Date`,
       nên trường này đặt tên riêng để không đè lên kiểu của SDK: turn header
       cần con số để in giờ, không cần một `Date` dựng thêm mỗi lần vẽ. */
    createdAtMs: row.createdAt,
    /* Lượt là dữ liệu ĐÃ LƯU (xem lib/turns.ts): trả lại nguyên vẹn cho tầng
       hiển thị, kèm `undefined` khi row cũ chưa từng có — lúc đó `groupTurns`
       gom bằng đúng một luật dùng chung, không phải mỗi màn hình đoán riêng. */
    ...(row.turnId ? { turnId: row.turnId } : {}),
    annotations: row.annotations as Message['annotations'],
    /* Reasoning là của chính model này và chỉ phục vụ hiển thị lại, nhưng mất
       nó thì khối ThinkingBlock biến mất sau khi tải trang. Chỉ gắn khi thật
       sự có chữ: `reasoning: undefined` luôn hiện diện sẽ khiến so sánh
       memo ở phía render tưởng message đổi mỗi vòng. */
    ...(toStoredReasoning(row.reasoning)
      ? { reasoning: row.reasoning as string }
      : {}),
    /* Kết quả fs_* đã lưu: phải trả lại useChat để lượt gửi sau còn
       toolInvocations gửi lên route (attachToolResultParts dựng tool-call
       parts từ đây). Thiếu nó, sau khi tải lại trang model mất kết quả cũ
       và gọi lại tool từ đầu; ContextMeter cũng đếm hụt ngân sách. */
    ...(row.toolInvocations?.length
      ? { toolInvocations: row.toolInvocations as NonNullable<Message['toolInvocations']> }
      : {}),
    experimental_attachments: row.attachments?.map(
      (attachment) => ({
        name: attachment.name,
        contentType: attachment.contentType,
        url: createAttachmentUrl(
          attachment,
          objectUrls,
        ),
      }),
    ) as any,
  };
}

export function getNextBranchOrder(
  allMessages: StoredMessage[],
  parentId: string | null,
): number {
  let maxBranchOrder = -1;

  for (const message of allMessages) {
    if (message.parentId !== parentId) {
      continue;
    }

    const order =
      typeof message.branchOrder === 'number'
        ? message.branchOrder
        : 0;

    if (order > maxBranchOrder) {
      maxBranchOrder = order;
    }
  }

  return maxBranchOrder + 1;
}

export function getNextSequence(
  allMessages: StoredMessage[],
): number {
  let maxSequence = -1;

  for (const message of allMessages) {
    if (
      typeof message.seq === 'number' &&
      Number.isFinite(message.seq) &&
      message.seq > maxSequence
    ) {
      maxSequence = message.seq;
    }
  }

  return maxSequence + 1;
}

export function reconstructParentPath(
  allMessages: StoredMessage[],
  parentId: string | null,
): StoredMessage[] {
  if (parentId === null) {
    return [];
  }

  return reconstructActiveThread(
    allMessages,
    parentId,
  );
}

export function getFinalStoredStatus(
  finishReason: StoredMessage['finishReason'],
): StoredMessage['status'] {
  switch (finishReason) {
    case 'abort':
      return 'aborted';

    case 'error':
      return 'error';

    case 'stop':
    default:
      return 'complete';
  }
}

interface ReconcileResult {
  /**
   * Toàn bộ tree sau khi reconcile.
   */
  allRows: StoredMessage[];

  /**
   * Chỉ các row cần ghi vào IndexedDB (row đã tồn tại, nội dung thay đổi).
   */
  changedRows: StoredMessage[];

  /**
   * Row chưa từng có trong DB — PHẢI chèn qua db.appendMessage
   * để seq/branchOrder được cấp nguyên tử trong transaction.
   */
  newRows: StoredMessage[];

  /**
   * Leaf mới nhất của active projection.
   */
  activeLeafId: string | null;

  /**
   * Assistant mới được phát hiện trong lần reconcile này.
   */
  createdAssistantId?: string;
}

function attachmentMetadataSignature(
  attachments:
    | StoredAttachment[]
    | undefined,
): string {
  if (!attachments?.length) {
    return '';
  }

  return attachments
    .map((attachment) =>
      [
        attachment.name,
        attachment.contentType,
        attachment.remoteUrl ?? '',
        attachment.blob?.size ?? 0,
      ].join(':'),
    )
    .join('|');
}

function hasStoredMessageChanged(
  previous: StoredMessage,
  next: StoredMessage,
): boolean {
  return (
    previous.content !== next.content ||
    previous.status !== next.status ||
    previous.finishReason !==
      next.finishReason ||
    attachmentMetadataSignature(
      previous.attachments,
    ) !==
      attachmentMetadataSignature(
        next.attachments,
      ) ||
    /* Không so sánh trường này thì kết quả fs_* KHÔNG BAO GIỜ được ghi:
       content của assistant message thường không đổi ở step chỉ có tool
       call, nên reconcile sẽ coi row là "không thay đổi" và bỏ qua. */
    toolInvocationSignature(previous.toolInvocations) !==
      toolInvocationSignature(next.toolInvocations) ||
    /* Không so sánh reasoning thì nó KHÔNG BAO GIỜ được ghi: có những lượt
       content không đổi trong lúc reasoning còn chảy tiếp (tool call, hoặc
       model suy nghĩ xong mới bắt đầu trả lời) — reconcile coi row là "không
       đổi" và bỏ qua, reasoning chết lặng. So qua toStoredReasoning để
       undefined và chuỗi rỗng không sinh lượt ghi vô nghĩa. */
    toStoredReasoning(previous.reasoning) !==
      toStoredReasoning(next.reasoning) ||
    /* Không so sánh lượt thì việc NÂNG CẤP dữ liệu không bao giờ được ghi:
       với row cũ, `turnId` là trường DUY NHẤT đổi, nên reconcile sẽ coi row là
       "không thay đổi" và hội thoại cũ mãi mãi không có lượt. So sánh này
       idempotent: ghi xong hai bên bằng nhau, không sinh lượt ghi thừa. */
    (previous.turnId ?? '') !== (next.turnId ?? '')
  );
}

/**
 * Chữ ký rẻ cho danh sách tool invocation: chỉ id + tên + trạng thái + độ dài
 * kết quả. Không hash toàn bộ payload (có thể tới 24k ký tự mỗi cái) vì hàm
 * này chạy mỗi lần reconcile trong lúc stream.
 */
function toolInvocationSignature(
  list: StoredMessage['toolInvocations'],
): string {
  if (!list?.length) return '';
  return list
    .map((inv) => {
      let size = 0;
      try {
        size = JSON.stringify(inv.result ?? null)?.length ?? 0;
      } catch {
        size = -1;
      }
      return `${inv.toolCallId}:${inv.toolName}:${inv.state}:${size}`;
    })
    .join('|');
}

export async function reconcileActiveMessages(
  chatId: string,
  visibleMessages: Message[],
  currentTree: StoredMessage[],
  pendingFork: PendingAssistantFork | null,
  isCurrentlyLoading: boolean,
  finishReason: StoredMessage['finishReason'],
  /**
   * Ý định của SỰ KIỆN vừa tạo tin người dùng cuối cùng — `'new'` khi người
   * dùng bảo "việc khác" (New task / follow-up đã xếp hàng), `'continue'` khi
   * đó là điều chỉnh việc đang làm (steering, goal loop, trả lời câu đang chờ
   * quyền). Không truyền gì thì luật suy từ dữ liệu của row liền trước.
   */
  turnIntent: TurnIntent | null = null,
): Promise<ReconcileResult> {
  if (visibleMessages.length === 0) {
    return {
      allRows: currentTree,
      changedRows: [],
      newRows: [],
      activeLeafId: null,
    };
  }

  /**
   * Map toàn bộ tree hiện tại để lookup O(1).
   */
  const rowById = new Map<string, StoredMessage>();

  for (const row of currentTree) {
    rowById.set(row.id, row);
  }

  /**
   * workingRows chứa cả dữ liệu cũ và node mới được phát hiện
   * trong cùng một lượt reconcile.
   */
  const workingRows = [...currentTree];
  const changedRows: StoredMessage[] = [];
  const newRows: StoredMessage[] = [];

  let nextSequence =
    getNextSequence(currentTree);

  let previousVisibleId: string | null = null;
  let createdAssistantId: string | undefined;

  /*
   * Con trỏ LƯỢT của lần reconcile này (§15.1 chốt trước).
   *
   * Hội thoại cũ chưa từng có `turnId` vẫn đi qua ĐÚNG hàm này: row nào chưa
   * có thì được cấp ngay trong lần ghi kế tiếp và giữ nguyên từ đó về sau —
   * nâng cấp một lần, không phải suy lại mỗi lần vẽ.
   *
   * `lastUserId` là row duy nhất chịu tác động của `turnIntent`: mọi sự kiện
   * tạo tin người dùng đều chỉ tạo đúng một tin, và nó là tin cuối.
   */
  const lastUserId =
    [...visibleMessages].reverse().find((message) => message.role === 'user')?.id ?? null;
  let turnCursor: string | null = null;

  const turnIdForRow = (
    id: string,
    role: string,
    previousRow: StoredMessage | null,
  ): string => {
    const resolved = rowById.get(id) ?? null;
    const turnId = nextTurnId(
      turnCursor,
      {
        id,
        role,
        turnId: resolved?.turnId,
        status: resolved?.status,
        finishReason: resolved?.finishReason,
        toolInvocations: resolved?.toolInvocations,
      },
      previousRow,
      id === lastUserId ? turnIntent : null,
    );
    turnCursor = turnId;
    return turnId;
  };

  for (
    let index = 0;
    index < visibleMessages.length;
    index++
  ) {
    const message = visibleMessages[index];
    const existing = rowById.get(message.id);

    const isLast =
      index === visibleMessages.length - 1;

    const isStreamingAssistant =
      isCurrentlyLoading &&
      isLast &&
      message.role === 'assistant';

    /**
     * Message đã tồn tại trong tree.
     */
    if (existing) {
      /*
       * Row cũ chưa có lượt: cấp ngay lượt cho nó trong lần ghi này. Không làm
       * thì mọi row lịch sử mãi mãi không thuộc lượt nào, và tầng hiển thị phải
       * tự đoán — đúng thứ §15.1 cấm.
       */
      const previousRow = previousVisibleId ? rowById.get(previousVisibleId) ?? null : null;
      const resolvedTurnId = turnIdForRow(existing.id, existing.role, previousRow);

      const nextFinishReason:
        StoredMessage['finishReason'] =
        isStreamingAssistant
          ? existing.finishReason
          : isLast &&
              message.role === 'assistant'
            ? finishReason ?? 'stop'
            : existing.finishReason ?? 'stop';

      const nextStatus:
        StoredMessage['status'] =
        isStreamingAssistant
          ? 'streaming'
          : isLast &&
              message.role === 'assistant'
            ? getFinalStoredStatus(
                nextFinishReason,
              )
            : existing.status ?? 'complete';

      const updated: StoredMessage = {
        ...existing,
        /* Cấp một lần rồi giữ nguyên: gán lại theo mỗi lần reconcile sẽ khiến
           hai tab cùng mở một hội thoại ghi ra hai ranh giới lượt khác nhau. */
        ...(existing.turnId ? {} : { turnId: resolvedTurnId }),

        /**
         * Content có thể thay đổi từng token trong lúc stream.
         */
        content: sanitizeContent(message.content),

        /**
         * Không thay đổi:
         * - parentId
         * - seq
         * - branchOrder
         */
        finishReason: nextFinishReason,
        status: nextStatus,
        annotations: (message.annotations as any[]) ?? existing.annotations,
        /* Kết quả fs_* điền dần qua các step của maxSteps — cập nhật theo
           bản mới nhất, giữ bản cũ khi lượt này không mang gì (tránh xoá
           trắng lịch sử tool của message đang stream). */
        toolInvocations:
          (message as { toolInvocations?: StoredMessage['toolInvocations'] })
            .toolInvocations ?? existing.toolInvocations,
        /* Cùng quy tắc: lượt này không mang reasoning thì giữ bản đã lưu. */
        reasoning:
          toStoredReasoning(message.reasoning) ??
          existing.reasoning,
      };

      if (
        hasStoredMessageChanged(
          existing,
          updated,
        )
      ) {
        changedRows.push(updated);
        rowById.set(updated.id, updated);

        const existingIndex =
          workingRows.findIndex(
            (row) => row.id === updated.id,
          );

        if (existingIndex >= 0) {
          workingRows[existingIndex] =
            updated;
        }
      }

      previousVisibleId = existing.id;
      continue;
    }

    /**
     * Message mới chưa tồn tại trong cây.
     */
    let parentId: string | null =
      previousVisibleId;

    let branchOrder: number;

    const isPendingForkAssistant =
      message.role === 'assistant' &&
      pendingFork !== null &&
      pendingFork.chatId === chatId &&
      !pendingFork.assistantMessageId &&
      previousVisibleId ===
        pendingFork.parentId;

    if (isPendingForkAssistant) {
      /**
       * Assistant được tạo bởi Edit hoặc Regenerate.
       * Metadata phải lấy từ reservation đã tạo trước reload().
       */
      parentId = pendingFork.parentId;
      branchOrder =
        pendingFork.branchOrder;

      createdAssistantId = message.id;
    } else {
      /**
       * Message bình thường nối vào message trước đó
       * trong active projection.
       */
      branchOrder = getNextBranchOrder(
        workingRows,
        // So sánh trên key đã chuẩn hoá — row trong workingRows luôn mang '__ROOT__' ở cấp gốc.
        toParentKey(parentId),
      );
    }

    const attachments =
      await getStoredAttachments(message);

    const now = Date.now();

    const newRow: StoredMessage = {
      id: message.id,
      chatId,
      role:
        message.role as StoredMessage['role'],
      content: sanitizeContent(message.content),

      /*
       * Lượt của row mới — cấp tại ĐÂY, trong cùng transaction ghi row, nên
       * ranh giới lượt là dữ liệu lưu trữ chứ không phải phép gom lúc vẽ.
       * Row liền trước lấy từ `rowById` (đã chứa cả row mới của vòng lặp này).
       */
      turnId: turnIdForRow(
        message.id,
        message.role as string,
        previousVisibleId ? rowById.get(previousVisibleId) ?? null : null,
      ),

      parentId: toParentKey(parentId),

      seq: nextSequence++,

      createdAt: getMessageCreatedAt(
        message,
        now + index,
      ),

      attachments,

      branchOrder,

      branchTieBreaker: message.id,

      annotations: (message.annotations as any[]) ?? undefined,

      toolInvocations:
        (message as { toolInvocations?: StoredMessage['toolInvocations'] })
          .toolInvocations ?? undefined,

      reasoning: toStoredReasoning(message.reasoning),

      finishReason:
        isStreamingAssistant
          ? undefined
          : isLast &&
              message.role === 'assistant'
            ? finishReason ?? 'stop'
            : 'stop',

      status:
        isStreamingAssistant
          ? 'streaming'
          : isLast &&
              message.role === 'assistant'
            ? getFinalStoredStatus(
                finishReason ?? 'stop',
              )
            : 'complete',
    };

    workingRows.push(newRow);
    newRows.push(newRow);
    rowById.set(newRow.id, newRow);

    previousVisibleId = newRow.id;
  }

  return {
    allRows: workingRows,
    changedRows,
    newRows,
    activeLeafId:
      visibleMessages[
        visibleMessages.length - 1
      ]?.id ?? null,
    createdAssistantId,
  };
}

type AssistantForkSource =
  | 'edit'
  | 'regenerate';

export interface PendingAssistantFork {
  chatId: string;

  /**
   * User message mà assistant mới sẽ trả lời.
   */
  parentId: string;

  /**
   * Thứ tự assistant mới trong nhóm siblings.
   */
  branchOrder: number;

  source: AssistantForkSource;

  /**
   * Khi useChat tạo assistant thực tế, lưu id tại đây.
   */
  assistantMessageId?: string;

  createdAt: number;
}

