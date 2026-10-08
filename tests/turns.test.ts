/*
 * Hợp đồng của MÔ HÌNH LƯỢT (DESIGN.md §15.1 "chốt trước" + bảng §15.5).
 *
 * Đây là test chạy HÀM THẬT, không soi source: `lib/turns.ts` là nguồn duy nhất
 * quyết định ranh giới lượt, nên phải khoá HÀNH VI của nó, gồm cả các ca dữ
 * liệu xấu (row lạ, hội thoại rỗng, chuỗi chỉ có xuống dòng).
 *
 * Mỗi test ghi rõ phá gì thì nó đỏ — đó là hợp đồng của file này.
 */
import { describe, expect, it } from 'vitest';
import {
  TURN_STATUS_LABEL,
  TURN_TITLE_MAX,
  assignTurnIds,
  countFiles,
  groupTurns,
  isOpenTurnRow,
  nextTurnId,
  turnClock,
  foldedRowIds,
  isFoldableTurn,
  turnRowsOf,
  turnStatusOf,
  turnTitleOf,
  type TurnRow,
  type TurnSummary,
} from '@/lib/turns';

/** Bơm id tất định: `a`, `b`, `c`… để test đọc được ranh giới lượt. */
function minter() {
  let n = 0;
  return () => {
    n += 1;
    return `t${n}`;
  };
}

describe('lib/turns — ranh giới lượt do SỰ KIỆN quyết định, không do nội dung', () => {
  it('tin gõ tay khi agent đang chạy thì thuộc LƯỢT đang mở (điều chỉnh việc hiện tại)', () => {
    /* §15.1: "Gửi từ composer khi có lượt đang chạy = điều chỉnh việc hiện tại".
       Phá gì thì đỏ: đổi `isOpenTurnRow` để row `streaming` là lượt đóng → tin
       thứ hai rơi ra thành lượt riêng. */
    const rows: TurnRow[] = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant', status: 'streaming' },
      { id: 'u2', role: 'user' },
    ];
    const assigned = assignTurnIds(rows, { mintId: minter() });
    expect(assigned.get('u1')).toBe('t1');
    expect(assigned.get('a1')).toBe('t1');
    expect(assigned.get('u2'), 'tin gửi giữa lượt phải nằm CHUNG lượt đang mở').toBe('t1');
  });

  it('follow-up (việc khác) mở LƯỢT MỚI dù agent còn đang chạy', () => {
    /* §15.1: "Giao một việc khác phải đi qua New task → lượt mới ở trạng thái
       chờ bắt đầu, không được gộp âm thầm vào lượt cũ". Trong app, sự kiện này
       là Alt+Enter (queue `follow-up`) — xem `queueWhileBusy` trong
       react/use-chat-orchestration.ts. */
    const rows: TurnRow[] = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant', status: 'streaming' },
      { id: 'u2', role: 'user' },
    ];
    const assigned = assignTurnIds(rows, { intent: 'new', mintId: minter() });
    expect(assigned.get('u2'), 'việc khác không phải là phần thân của việc đang làm').toBe('t2');
  });

  it('steering luôn ở lại lượt đang mở, kể cả khi row liền trước đã đóng', () => {
    /* Steering được bơm từ onFinish, có lúc row liền trước đã mang trạng thái
       kết thúc. Ý định của SỰ KIỆN thắng trạng thái row — nếu không, cùng một
       vòng lặp công việc lại bị cắt thành nhiều lượt. */
    const rows: TurnRow[] = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant', status: 'complete' },
      { id: 'u2', role: 'user' },
    ];
    const assigned = assignTurnIds(rows, { intent: 'continue', mintId: minter() });
    expect(assigned.get('u2')).toBe('t1');
  });

  it('gửi sau khi lượt đã xong thì mở lượt mới', () => {
    const rows: TurnRow[] = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant', status: 'complete' },
      { id: 'u2', role: 'user' },
    ];
    const assigned = assignTurnIds(rows, { mintId: minter() });
    expect(assigned.get('u2')).toBe('t2');
  });

  it('Retry sau lỗi KHÔNG tạo lượt mới — chỉ thêm một lần thử trong cùng lượt', () => {
    /* §15.1: "Lỗi cũ phải còn nhìn thấy được; lượt mang trạng thái của lần thử
       cuối". Tạo lại là một row trợ lý mới nối vào chính lượt đó. */
    const rows: TurnRow[] = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant', status: 'error' },
      { id: 'a2', role: 'assistant', status: 'streaming' },
    ];
    const assigned = assignTurnIds(rows, { mintId: minter() });
    expect(assigned.get('a2')).toBe('t1');
  });

  it('tin trả lời câu đang chờ quyền thuộc lượt cũ; tin khác thì không', () => {
    /* Dấu hiệu "đang chờ quyền" là DỮ LIỆU: còn tool invocation chưa có kết
       quả (`state` khác `result`). Cùng một lượt nhưng đã có kết quả tool →
       lượt đã đi tiếp, nên tin kế tiếp là việc mới. */
    const pending: TurnRow[] = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant', toolInvocations: [{ state: 'call' }] },
      { id: 'u2', role: 'user' },
    ];
    expect(assignTurnIds(pending, { mintId: minter() }).get('u2')).toBe('t1');

    const resolved: TurnRow[] = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant', toolInvocations: [{ state: 'result' }] },
      { id: 'u2', role: 'user' },
    ];
    expect(assignTurnIds(resolved, { mintId: minter() }).get('u2')).toBe('t2');
  });

  it('row đã có turnId thì giữ nguyên — không gán lại theo lần reconcile mới', () => {
    /* Hai tab cùng mở một hội thoại: gán lại là hai ranh giới lượt khác nhau. */
    const rows: TurnRow[] = [
      { id: 'u1', role: 'user', turnId: 'luot-cu' },
      { id: 'a1', role: 'assistant', status: 'complete' },
      { id: 'u2', role: 'user' },
    ];
    const assigned = assignTurnIds(rows, { mintId: minter() });
    expect(assigned.has('u1'), 'row đã có lượt không được nằm trong danh sách gán').toBe(false);
    expect(assigned.get('a1')).toBe('luot-cu');
    expect(assigned.get('u2')).toBe('t1');
  });

  it('row trợ lý mở đầu hội thoại vẫn phải thuộc một lượt (dữ liệu bị cắt đầu)', () => {
    const rows: TurnRow[] = [{ id: 'a1', role: 'assistant', status: 'complete' }];
    expect(assignTurnIds(rows, { mintId: minter() }).get('a1')).toBe('t1');
  });

  it('hội thoại rỗng không sinh lượt nào', () => {
    expect(assignTurnIds([], { mintId: minter() }).size).toBe(0);
    expect(groupTurns([])).toEqual([]);
  });

  it('nextTurnId là LUẬT DÙNG CHUNG của cả đường ghi lẫn đường đọc', () => {
    /* Đường ghi (reconcile) và đường đọc (groupTurns) phải trả lời cùng một
       câu hỏi theo cùng một cách; nếu không, hai màn hình sẽ gom hai kiểu. */
    const mint = minter();
    const open: TurnRow = { id: 'a1', role: 'assistant', status: 'streaming' };
    const closed: TurnRow = { id: 'a2', role: 'assistant', status: 'complete' };
    expect(nextTurnId('t9', { id: 'u2', role: 'user' }, open, null, mint)).toBe('t9');
    expect(nextTurnId('t9', { id: 'u3', role: 'user' }, closed, null, mint)).toBe('t1');
    expect(nextTurnId('t9', { id: 'u4', role: 'user' }, open, 'new', mint)).toBe('t2');
    expect(nextTurnId('t9', { id: 'u5', role: 'user' }, closed, 'continue', mint)).toBe('t9');
    expect(nextTurnId(null, { id: 'u6', role: 'user' }, closed, 'continue', mint), 'continue mà chưa có lượt nào thì phải mở lượt').toBe('t3');
    expect(nextTurnId('t9', { id: 'u7', role: 'user', turnId: 'da-co' }, open, 'new', mint)).toBe('da-co');
  });
});

describe('lib/turns — trạng thái LƯỢT theo bảng §15.5, không gộp với trạng thái tool', () => {
  const user: TurnRow = { id: 'u1', role: 'user' };

  it('chưa có trợ lý nào → chờ bắt đầu', () => {
    expect(turnStatusOf([user])).toBe('queued');
    expect(TURN_STATUS_LABEL.queued).toBe('chờ bắt đầu');
  });

  it('đang stream → đang làm', () => {
    expect(turnStatusOf([user, { id: 'a1', role: 'assistant', status: 'streaming' }])).toBe('running');
  });

  it('còn tool chưa trả kết quả → chờ bạn quyết định', () => {
    expect(
      turnStatusOf([user, { id: 'a1', role: 'assistant', toolInvocations: [{ state: 'call' }] }]),
    ).toBe('waiting_approval');
  });

  it('Stop khi tool chưa ngừng → đang dừng, KHÔNG phải đã hủy', () => {
    /* §15.1: "nếu UI báo đã hủy mà tiến trình vẫn đang ghi file thì người dùng
       sẽ tin một trạng thái không có thật". */
    const rows: TurnRow[] = [user, { id: 'a1', role: 'assistant', toolInvocations: [{ state: 'call' }] }];
    expect(turnStatusOf(rows, { stopRequested: true })).toBe('stopping');
    expect(turnStatusOf(rows, { stopRequested: false })).toBe('waiting_approval');
  });

  it('lượt bị hủy: mọi tool đã ngừng và lần thử cuối bị abort → đã hủy', () => {
    const rows: TurnRow[] = [user, { id: 'a1', role: 'assistant', status: 'aborted', finishReason: 'abort' }];
    expect(turnStatusOf(rows)).toBe('cancelled');
    expect(turnStatusOf(rows, { stopRequested: true })).toBe('stopping');
  });

  it('lỗi và bị chặn là hai chuyện khác nhau', () => {
    /* "Bị chặn" là biết vì sao và còn lối ra; "lỗi" là đã thử và hỏng. Chặn
       không tự biến thành lỗi sau vài lần thử, và lỗi không được hiển thị như
       chặn (§15.5). */
    const failed: TurnRow[] = [user, { id: 'a1', role: 'assistant', status: 'error', finishReason: 'error' }];
    expect(turnStatusOf(failed)).toBe('failed');
    expect(turnStatusOf(failed, { blockedReason: 'thiếu quyền ghi thư mục' })).toBe('blocked');
  });

  it('xong khi lần thử cuối kết thúc bình thường — không kèm ý kiểm chứng', () => {
    expect(turnStatusOf([user, { id: 'a1', role: 'assistant', status: 'complete' }])).toBe('completed');
    expect(TURN_STATUS_LABEL.completed).toBe('xong');
  });

  it('mọi trạng thái trong bảng §15.5 đều có nhãn hiển thị, không nhãn nào rỗng', () => {
    for (const [key, label] of Object.entries(TURN_STATUS_LABEL)) {
      expect(label.trim(), `nhãn của "${key}" không được rỗng`).not.toBe('');
    }
    expect(Object.keys(TURN_STATUS_LABEL).sort()).toEqual(
      ['blocked', 'cancelled', 'completed', 'failed', 'queued', 'running', 'stopping', 'waiting_approval'],
    );
  });
});

describe('lib/turns — tên việc của lượt', () => {
  const userRow = (content: string): TurnRow & { content: string } => ({ id: 'u1', role: 'user', content });

  it('bỏ dấu markdown mở dòng và lấy dòng ĐẦU CÓ CHỮ', () => {
    expect(turnTitleOf([userRow('\n\n## Sửa lỗi đăng nhập\n\n')])).toBe('Sửa lỗi đăng nhập');
    expect(turnTitleOf([userRow('- thêm test cho parser')])).toBe('thêm test cho parser');
  });

  it('gộp khoảng trắng, không trả chuỗi rỗng', () => {
    expect(turnTitleOf([userRow('   \n  \t ')])).toBe('Lượt chưa có yêu cầu');
    expect(turnTitleOf([])).toBe('Lượt chưa có yêu cầu');
    expect(turnTitleOf([userRow('a    b')])).toBe('a b');
  });

  it('cắt ở ranh giới TỪ và không vượt trần', () => {
    const long = `${'từ '.repeat(40)}cuối`;
    const title = turnTitleOf([userRow(long)]);
    expect(title.length).toBeLessThanOrEqual(TURN_TITLE_MAX + 1);
    expect(title.endsWith('…')).toBe(true);
    expect(title.endsWith('từ…'), 'phải cắt ở ranh giới TỪ, không cắt giữa chữ').toBe(true);
  });

  it('turnRowsOf bơm chữ của tin, nên tên việc KHÔNG rơi về chuỗi dự phòng', () => {
    /* Regression: bản đầu của `message-list.tsx` tự map row và bỏ sót
       `content` — mọi thứ vẫn biên dịch, header vẫn vẽ, chỉ có tên việc là mất.
       Test này gọi HÀM THẬT dựng row nên thiếu chữ là đỏ ngay tại đây, không
       phải chờ tới lúc soi ảnh. */
    const rows = turnRowsOf(
      [
        { id: 'u1', role: 'user', content: 'Sửa lỗi đăng nhập ở lib/auth.ts' },
        { id: 'a1', role: 'assistant', content: 'Đang đọc file.' },
      ],
      (message) => ({ turnId: message.id === 'u1' ? 'T1' : 'T1', status: 'complete' }),
    );
    expect(groupTurns(rows)[0].title).toBe('Sửa lỗi đăng nhập ở lib/auth.ts');
  });

  it('turnRowsOf không đưa nội dung KHÔNG phải chuỗi vào tên việc', () => {
    /* Tin đa phần không có "dòng đầu" để đặt tên; in ra object là kiểu hỏng
       tệ hơn chuỗi dự phòng vì nó trông như dữ liệu thật. */
    const rows = turnRowsOf(
      [{ id: 'u1', role: 'user', content: [{ type: 'image' }] }],
      () => ({}),
    );
    expect(turnTitleOf(rows)).toBe('Lượt chưa có yêu cầu');
  });

  it('lấy yêu cầu NGƯỜI DÙNG mở lượt, không lấy câu trả lời', () => {
    /* Câu trả lời hay mở đầu bằng "Chắc chắn rồi" — vô nghĩa khi nhìn lướt
       lịch sử, mà §15.1 điểm 4 đòi phân biệt được lượt nào sửa tính năng, lượt
       nào điều tra lỗi. */
    const rows: Array<TurnRow & { content: string }> = [
      { id: 'u1', role: 'user', content: 'Điều tra lỗi đăng nhập' },
      { id: 'a1', role: 'assistant', content: 'Chắc chắn rồi. Trước hết tôi sẽ…' },
    ];
    expect(turnTitleOf(rows)).toBe('Điều tra lỗi đăng nhập');
  });
});

describe('lib/turns — gom nhóm cho màn hình', () => {
  it('gộp đúng lượt và tổng hợp số liệu PHỤ (thời gian, số tool, số file)', () => {
    const rows: TurnRow[] = [
      { id: 'u1', role: 'user', turnId: 'A' },
      { id: 'a1', role: 'assistant', status: 'complete', turnId: 'A', toolInvocations: [{ state: 'result' }, { state: 'result' }] },
      { id: 'u2', role: 'user', turnId: 'B' },
      { id: 'a2', role: 'assistant', status: 'streaming', turnId: 'B', toolInvocations: [{ state: 'call' }] },
    ];
    const turns = groupTurns(rows, {
      createdAtOf: (id) => (id === 'u1' ? 1_700_000_000_000 : 1_700_000_060_000),
      toolArgsOf: (id) =>
        id === 'a1'
          ? [{ file_path: 'lib/a.ts' }, { file_path: 'lib/a.ts' }, { path: 'lib/b.ts' }, { query: 'x' }]
          : id === 'a2'
            ? [{ file_path: 'lib/c.ts' }]
            : [],
    });

    expect(turns.map((turn) => turn.id)).toEqual(['A', 'B']);
    expect(turns[0]).toMatchObject({ status: 'completed', toolCount: 2, filesTouched: 2 });
    expect(turns[1]).toMatchObject({ status: 'waiting_approval', toolCount: 1, filesTouched: 1 });
    expect(turns[1].messageIds).toEqual(['u2', 'a2']);
    expect(turns[0].startedAt, 'thời gian lấy từ row ĐẦU của lượt').toBe(1_700_000_000_000);
  });

  it('row cũ chưa có turnId vẫn gom được bằng ĐÚNG một luật, không đoán riêng', () => {
    const rows: TurnRow[] = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant', status: 'complete' },
      { id: 'u2', role: 'user' },
      { id: 'a2', role: 'assistant', status: 'complete' },
    ];
    const turns = groupTurns(rows, { mintId: minter() });
    expect(turns).toHaveLength(2);
    expect(turns[0].messageIds).toEqual(['u1', 'a1']);
    expect(turns[1].messageIds).toEqual(['u2', 'a2']);
  });

  it('turnId rỗng coi như chưa có lượt — row vẫn được xếp vào một lượt, không bị bỏ', () => {
    /* `messageIds[0]` là chỗ duy nhất màn hình gắn header, nên một row không
       thuộc lượt nào sẽ mất header và mất luôn mốc ngắt giữa các lượt. */
    const turns = groupTurns([{ id: 'x', role: 'assistant', turnId: '' }], { mintId: minter() });
    expect(turns).toHaveLength(1);
    expect(turns[0].messageIds).toEqual(['x']);
  });
});

describe('lib/turns — luật GẬP thân lượt (§15.1 điểm 3)', () => {
  const turn = (over: Partial<TurnSummary> & { id: string }): TurnSummary => ({
    title: 'một việc',
    status: 'completed',
    label: 'xong',
    startedAt: null,
    toolCount: 0,
    filesTouched: 0,
    messageIds: [`${over.id}-u`, `${over.id}-a`],
    ...over,
  });

  it('lượt đã ĐÓNG thì gập được; lượt còn việc để xem thì không', () => {
    /* Phá gì thì đỏ: cho `running` vào danh sách gập — người dùng sẽ không thấy
       tiến trình sống, đúng thứ §15.1 điểm 3 dựng khối để tránh. */
    for (const status of ['completed', 'failed', 'blocked', 'cancelled'] as const) {
      expect(isFoldableTurn(status), `lượt "${status}" đã đóng, phải gập được`).toBe(true);
    }
    for (const status of ['queued', 'running', 'waiting_approval', 'stopping'] as const) {
      expect(isFoldableTurn(status), `lượt "${status}" còn việc để xem, KHÔNG được gập`).toBe(
        false,
      );
    }
  });

  it('gập thì ẩn THÂN và giữ row đầu — header ở lại để đọc lướt', () => {
    const hidden = foldedRowIds([turn({ id: 'T1' })], new Set(['T1']));
    expect(hidden.has('T1-u'), 'row chứa header không được ẩn').toBe(false);
    expect(hidden.has('T1-a')).toBe(true);
  });

  it('lượt đang mở không bị ẩn kể cả khi id còn nằm trong tập gập', () => {
    /* Tập gập là trạng thái ĐỌC: nó không được tự dọn khi trạng thái lượt đổi —
       luật ở đây mới là thứ bảo đảm lượt đang chạy luôn hiện. */
    expect(foldedRowIds([turn({ id: 'T1', status: 'running' })], new Set(['T1'])).size).toBe(0);
    expect(foldedRowIds([turn({ id: 'T1', status: 'waiting_approval' })], new Set(['T1'])).size).toBe(
      0,
    );
  });

  it('tập rỗng, id lạ, và lượt chỉ có một row: không ẩn gì', () => {
    expect(foldedRowIds([turn({ id: 'T1' })], new Set()).size).toBe(0);
    expect(foldedRowIds([turn({ id: 'T1' })], new Set(['T2'])).size).toBe(0);
    expect(foldedRowIds([turn({ id: 'T1', messageIds: ['T1-u'] })], new Set(['T1'])).size).toBe(0);
    expect(foldedRowIds([], new Set(['T1'])).size).toBe(0);
  });

  it('gập nhiều lượt một lúc: mỗi lượt giữ đúng row đầu của nó', () => {
    const turns = [turn({ id: 'T1' }), turn({ id: 'T2', status: 'failed' })];
    expect([...foldedRowIds(turns, new Set(['T1', 'T2']))].sort()).toEqual(['T1-a', 'T2-a']);
  });
});

describe('lib/turns — chi tiết nhỏ nhưng dùng ở nhiều chỗ', () => {
  it('countFiles đếm đường dẫn KHÁC NHAU, bỏ qua giá trị không phải chuỗi', () => {
    expect(
      countFiles([
        { file_path: 'a.ts' },
        { file_path: 'a.ts' },
        { path: 'b.ts' },
        { file_path: 42 },
        { file_path: '   ' },
        null,
        'không phải object',
        { query: 'không có khoá đường dẫn' },
      ]),
    ).toBe(2);
  });

  it('isOpenTurnRow: row người dùng luôn để lượt mở, row lạ thì không', () => {
    expect(isOpenTurnRow({ id: 'u', role: 'user' })).toBe(true);
    expect(isOpenTurnRow({ id: 'a', role: 'assistant', status: 'complete' })).toBe(false);
    expect(isOpenTurnRow({ id: 't', role: 'tool' })).toBe(false);
    expect(isOpenTurnRow(null)).toBe(false);
  });

  it('turnClock im khi không có mốc thời gian thật — không bịa giờ', () => {
    expect(turnClock(null)).toBe('');
    expect(turnClock(Number.NaN)).toBe('');
    expect(turnClock(new Date(2026, 0, 2, 9, 5).getTime())).toMatch(/^09:0?5$/);
  });
});
