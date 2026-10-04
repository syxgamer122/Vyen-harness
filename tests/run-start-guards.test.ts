/**
 * Khoá HỢP ĐỒNG của `startFreshRun()` trong react/use-chat-orchestration.ts.
 *
 * tests/run-wiring.test.ts khoá chiều "cổng nào PHẢI mở run mới". File này
 * khoá chiều ngược lại: "cổng nào KHÔNG ĐƯỢC mở run giữa lúc đang stream".
 *
 * Vì sao cần chiều thứ hai: `startFreshRun()` gọi `resetRun()` vô điều kiện
 * và chính docblock của nó nói rõ "Mọi call site bên dưới đều chặn trước bằng
 * `isLoading`/`isStreaming`" — nhưng không có gì CHẶN cái đó cả. `continue`
 * và `goal loop` lọt, và con đường `continue` là lỗi thật: nút "Viết tiếp"
 * nằm trên tin nhắn CŨ bị cắt, message-list chỉ tắt nút ở TIN CUỐI, nên bấm
 * được giữa lượt → `resetRun()` cưỡng chế reset run ĐANG CHẠY (reconcile dừng
 * ở terminal, stall detector im, `canRepair` bị xoá, deadline không bắn) rồi
 * nối prompt vào giữa lượt đó.
 *
 * tests/run-lifecycle.test.ts không bắt được: nó chỉ chạy `lib/run-lifecycle.ts`
 * rời file, đúng cái file mà regression KHÔNG nằm trong đó.
 *
 * Đây là file React hook không có seam thuần để import — nên theo convention
 * tests/run-wiring.test.ts, đọc SOURCE. Bù lại: mọi test dưới đây đều trả lời
 * được "đổi dòng nào thì đỏ?".
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getFinalStoredStatus } from '@/lib/chat-tree-persistence';
import { describeEvidence } from '@/lib/evidence';

const ORCHESTRATION_PATH = path.resolve(__dirname, '../react/use-chat-orchestration.ts');
/**
 * Chuẩn hoá CRLF → LF trước khi regex, y hệt tests/run-wiring.test.ts:34.
 * Repo bật `core.autocrlf` nên file trên đĩa là CRLF; regex viết cứng `\n` thì
 * test XANH ở máy này và ĐỎ ở CI (hoặc ngược lại) — tệ hơn là không có test.
 */
const source = fs.readFileSync(ORCHESTRATION_PATH, 'utf8').replace(/\r\n/g, '\n');

/** Mẫu bắt buộc cho CALL STATEMENT: dấu `;` ngay sau `)` và trống trên dòng. */
const CALL = /^\s*startFreshRun\(\);$/m;

/**
 * Xoá comment + nội dung chuỗi, GIỮ NGUYÊN ĐỘ DÀI (thay bằng khoảng trắng)
 * để mọi offset vẫn khớp với `source`.
 *
 * Hai việc, cùng một thao tác:
 *  1. Bộ đếm ngoặc ở `guardBeforeCall` không được lệch — file này đầy comment
 *     tiếng Việt và câu chuỗi có dấu `(`/`{` KHÔNG cân bằng.
 *  2. Regex CALL không được khớp nhầm dòng comment nhắc lại `startFreshRun()`.
 *
 * Vì giữ độ dài, `source.slice(a, b)` vẫn cho đúng đoạn gốc cho các assert
 * đọc CHỮ (docblock, chuỗi `'abort'`) — xem `span()`.
 */
function blankNonCode(src: string): string {
  const out = src.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (two === '//') {
      const nl = src.indexOf('\n', i);
      const stop = nl === -1 ? src.length : nl;
      blank(i, stop);
      i = stop;
      continue;
    }
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\') j += 1;
        else if (src[j] === '\n' && ch !== '`') break;
        j += 1;
      }
      blank(i + 1, Math.min(j, src.length));
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/** Source đã xoá comment/chuỗi — dùng cho MỌI phép so khớp cấu trúc. */
const code = blankNonCode(source);

/** Offset trong `code` của một mốc — assert là mốc ĐÓ tồn tại (không trả -1 im lặng). */
function at(needle: string): number {
  const i = code.indexOf(needle);
  expect(i, `không tìm thấy mốc (code): ${needle}`).toBeGreaterThan(-1);
  return i;
}

/**
 * Cắt cùng một khoảng ra HAI bản: `code` để đếm ngoặc, `src` để đọc chữ.
 * Offset lấy từ `code` (comment đã xoá) nhưng độ dài hai bản bằng nhau nên vẫn
 * trỏ đúng đoạn trong `source`.
 */
function span(from: number, to: number): { code: string; src: string } {
  return { code: code.slice(from, to), src: source.slice(from, to) };
}

/** Thân một callback: từ khai báo tới khai báo kế tiếp. */
function body(decl: string, nextDecl: string) {
  return span(at(decl), at(nextDecl));
}

/** Offset trong `src` của một mốc nằm trong COMMENT/CHUỖI (docblock, nhãn UI). */
function atSrc(needle: string): number {
  const i = source.indexOf(needle);
  expect(i, `không tìm thấy mốc (source): ${needle}`).toBeGreaterThan(-1);
  return i;
}

/** Index trong `src` của dấu `)` khớp với `(` tại `openIdx`. */
function matchParen(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Index trong `src` của dấu `}` khớp với `{` tại `openIdx`.
 *
 * PHẢI chạy trên cả `src`, không phải trên đoạn cắt tại lời gọi: với dạng
 * `if (!isLoading) { … startFreshRun(); … }` thì dấu `}` đóng nhánh nằm SAU lời
 * gọi. Cắt trước lời gọi thì không dấu `}` nào khớp → kết luận "không chặn"
 * oan, đúng cái lỗi lần chạy đầu của test này.
 */
function matchBrace(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

type GuardShape = {
  /** `if (isLoading) ... return;` — chặn rồi thoát sớm TRƯỚC lời gọi. */
  earlyReturn: boolean;
  /** `if (!isLoading) { ...startFreshRun();... }` — lời gọi nằm trong nhánh KHÔNG stream. */
  negatedBranch: boolean;
};

/**
 * Lời gọi `startFreshRun();` trong `src` có được chặn bởi `isLoading` không.
 *
 * Nhận diện CẢ HAI dạng đang dùng trong file, và cả hai đều phải "chi phối"
 * lời gọi — dạng nào không chi phối thì không tính là chặn:
 *  - chặn rồi thoát: `if (isLoading) { return; }` … `startFreshRun();`
 *  - lời gọi trong nhánh không stream: `if (!isLoading) { … startFreshRun(); … }`
 */
function guardBeforeCall(src: string): GuardShape {
  const callIdx = src.search(CALL);
  expect(callIdx, 'không tìm thấy call statement startFreshRun();').toBeGreaterThan(-1);

  const shape: GuardShape = { earlyReturn: false, negatedBranch: false };
  const head = src.slice(0, callIdx);

  for (const m of head.matchAll(/\bif\s*\(/g)) {
    const parenOpen = m.index + m[0].length - 1;
    const parenClose = matchParen(src, parenOpen);
    if (parenClose < 0) continue;
    const cond = src.slice(parenOpen + 1, parenClose);
    if (!/\bisLoading\b/.test(cond)) continue;

    const tail = src.slice(parenClose + 1);
    const ws = tail.search(/\S/);
    if (ws < 0) continue;
    const bodyOpen = parenClose + 1 + ws;

    if (/(^|[^\w!])!\s*isLoading\b/.test(cond)) {
      // Dạng `!isLoading`: lời gọi phải nằm GIỮA `{` mở và `}` đóng của nhánh.
      if (src[bodyOpen] !== '{') continue;
      const bodyClose = matchBrace(src, bodyOpen);
      if (bodyOpen < callIdx && callIdx < bodyClose) shape.negatedBranch = true;
      continue;
    }

    if (src[bodyOpen] !== '{') {
      if (/^return\b/.test(tail.slice(ws))) shape.earlyReturn = true;
      continue;
    }
    const bodyClose = matchBrace(src, bodyOpen);
    // `return` PHẢI nằm trong thân nhánh VÀ PHẢI trước lời gọi — chặn mà không
    // thoát thì vẫn chạy tới `startFreshRun()`.
    const stop = Math.min(bodyClose < 0 ? callIdx : bodyClose, callIdx);
    if (/\breturn\b/.test(src.slice(bodyOpen, stop))) shape.earlyReturn = true;
  }

  return shape;
}

/**
 * Sáu cổng mở lượt mới. Cổng thứ bảy mà quên khai ở đây sẽ bị test "đúng SÁU
 * call statement" bắt — đó là lý do danh sách này phải đủ.
 */
const GATES: ReadonlyArray<{ name: string; decl: string; next: string }> = [
  {
    name: 'submitTurn — gửi tin',
    decl: 'const submitTurn = useCallback(',
    next: 'const onSubmit = useCallback(',
  },
  {
    name: 'handleRegenerate — Tạo lại',
    decl: 'const handleRegenerate = useCallback(',
    next: 'const startEdit = useCallback(',
  },
  {
    name: 'saveEdit — Lưu chỉnh sửa',
    decl: 'const saveEdit = useCallback(',
    next: 'const copyMessage = useCallback(',
  },
  {
    name: 'handleApprovePlan — duyệt kế hoạch',
    decl: 'const handleApprovePlan = useCallback(',
    next: 'useStickToBottom(',
  },
  {
    name: 'handleGoalLoopClick — kickoff goal loop',
    decl: 'const handleGoalLoopClick = useCallback(',
    next: 'const continueGenerating = useCallback(',
  },
  {
    name: 'continueGenerating — Viết tiếp',
    decl: 'const continueGenerating = useCallback(',
    next: 'const handleApprovePlan = useCallback(',
  },
];

describe('startFreshRun — không cổng nào mở run giữa lúc đang stream', () => {
  it('đúng SÁU call statement trong cả file — không có cổng thứ bảy lọt vào', () => {
    // Chốt bằng SỐ call statement (không tính định nghĩa `const startFreshRun`):
    // thêm một cổng mà quên khai ở GATES → ĐỎ. Đếm trên `code` nên comment
    // tiếng Việt nhắc lại tên hàm không làm đếm nhầm.
    const calls = code.match(/^\s*startFreshRun\(\);$/gm) ?? [];
    expect(calls.length).toBe(GATES.length);
  });

  for (const { name, decl, next } of GATES) {
    it(`${name} chặn isLoading TRƯỚC startFreshRun()`, () => {
      const src = body(decl, next).code;
      expect(src, `${name} mất lời gọi startFreshRun()`).toMatch(CALL);

      const shape = guardBeforeCall(src);
      expect(
        shape.earlyReturn || shape.negatedBranch,
        [
          `${name} gọi startFreshRun() mà không có chặn isLoading nào chi phối lời gọi.`,
          'resetRun() không kiểm tra → cưỡng chế reset run đang chạy: reconcile dừng ở',
          'terminal, stall detector và auto-repair im, canRepair bị xoá, deadline không',
          'bắn. Thêm `if (isLoading) return;` (hoặc bọc lời gọi trong `if (!isLoading)`)',
          'trước khi gọi.',
        ].join(' '),
      ).toBe(true);
    });
  }

  it('docblock của startFreshRun nói đúng sự thật — và hàm KHÔNG tự chặn', () => {
    // Docblock là hợp đồng: nó khẳng định "Mọi call site bên dưới đều chặn trước
    // bằng isLoading/isStreaming". Block này làm cho câu đó không còn là lời
    // hứa suông — xoá chặn ở một cổng thì câu trên phải ĐỎ.
    const decl = span(
      atSrc('* Bắt đầu một lượt trả lời MỚI'),
      at('const runRecipeChecksRef'),
    );
    expect(decl.src).toMatch(/Mọi call site bên dưới đều chặn trước bằng/);
    expect(decl.src).toMatch(/isLoading`\/`isStreaming/);

    // Trách nhiệm thuộc call site. Nếu sau này ai đó thêm chặn BÊN TRONG hàm,
    // câu này ĐỎ để họ viết lại docblock cho khớp — im lặng nuốt luật chơi.
    const fn = body('const startFreshRun = useCallback(() => {', 'const runRecipeChecksRef').code;
    expect(fn.slice(fn.indexOf('{') + 1)).not.toMatch(/\bisLoading\b/);
  });

  it('continueGenerating BÁO cho người dùng — im lặng sẽ thành "bấm không ăn"', () => {
    // Khác 5 cổng còn lại: nút "Viết tiếp" nằm trên tin nhắn CŨ, message-list
    // chỉ tắt ở TIN CUỐI, nên người dùng bấm được lúc đang stream mà không có
    // dấu hiệu gì báo nút sẽ bị từ chối. Đây đúng lớp "đang bận" mà
    // `webBusyRef` trong submitTurn đã xử lý bằng showNotice.
    const src = body('const continueGenerating = useCallback(', 'const handleApprovePlan = useCallback(').code;
    const callIdx = src.search(CALL);
    expect(callIdx).toBeGreaterThan(-1);
    expect(src, 'continueGenerating mất chặn isLoading').toMatch(/if \(isLoading\)/);
    const guardBlock = src.slice(src.indexOf('if (isLoading)'), callIdx);
    expect(guardBlock, 'chặn của continueGenerating phải gọi showNotice').toMatch(/showNotice\(/);
    expect(guardBlock, 'báo xong thì phải thoát, không chạy tiếp xuống append').toMatch(/\breturn;/);
  });

  it('handleGoalLoopClick chặn TRƯỚC startGoalLoop — chặn sau thì loop mồ côi', () => {
    // `if (isLoading) return;` nằm sau `startGoalLoop(...)` thì goal đã vào state
    // 'active' + composer đã bị xoá, nhưng lượt kickoff chưa hề chạy: vòng lặp
    // treo. Thứ tự này là một phần của hợp đồng, không phải sở thích.
    const src = body('const handleGoalLoopClick = useCallback(', 'const continueGenerating = useCallback(').code;
    expect(src, 'handleGoalLoopClick mất chặn isLoading').toMatch(/if \(isLoading\) return;/);
    expect(src.indexOf('if (isLoading) return;')).toBeLessThan(src.indexOf('startGoalLoop(chatId'));
    expect(src.indexOf('startGoalLoop(chatId')).toBeLessThan(src.search(CALL));
  });

  it('nhánh "goal đang chạy → bấm để DỪNG" không bị chặn nhầm', () => {
    // Nút có hai nghĩa: khi loop active thì bấm là DỪNG. Chặn `isLoading` phải
    // nằm SAU nhánh dừng, nếu không thì không dừng được giữa lượt — mà dừng
    // giữa lượt chính là điều người dùng cần đúng lúc đó.
    const src = body('const handleGoalLoopClick = useCallback(', 'const continueGenerating = useCallback(').code;
    expect(src, 'mất nhánh dừng goal loop').toMatch(/stopGoalLoop\(chatId\)/);
    expect(src.indexOf('stopGoalLoop(chatId)')).toBeLessThan(src.indexOf('if (isLoading) return;'));
  });
});

describe('evidence của lượt BỊ DỪNG — status strip và badge phải cùng kết luận', () => {
  /**
   * Wave 3 dạy message-item báo `blocked` cho lượt `status:'aborted'`. Nếu lane
   * của HUD vẫn ghim `reported_done` vô điều kiện thì bấm "Dừng" ra HAI badge
   * trái ý nhau cho CÙNG một lượt.
   *
   * Dùng hàm thuần của repo để chứng minh mắt xích không đứt:
   * `finishRef='abort'` → `getFinalStoredStatus` → `status:'aborted'` →
   * message-item map sang `blocked`.
   */
  it('finishRef "abort" là nguồn duy nhất của status "aborted" — HUD phải đọc đúng nó', () => {
    expect(getFinalStoredStatus('abort')).toBe('aborted');
    expect(getFinalStoredStatus('stop')).toBe('complete');
    expect(getFinalStoredStatus('error')).toBe('error');

    // Hai nhãn từng hiện cùng lúc trên cùng một lượt — đây là chúng.
    expect(describeEvidence('blocked').badgeText).toBe('Bị chặn');
    expect(describeEvidence('reported_done').badgeText).toBe('Code · đã báo xong');
  });

  it('upsertLane trong onFinish suy evidence từ finishRef, không ghim vô điều kiện', () => {
    const onFinish = body(
      'onFinish: (message, { finishReason, usage }) => {',
      'onError: (err) => {',
    );
    // Ghim cứng `evidence: 'reported_done'` → dòng này ĐỎ, và đúng như vậy:
    // đó là toàn bộ regression mà Wave 3 đã sửa ở message-item.
    expect(onFinish.src).toMatch(
      /evidence: finishRef\.current === 'abort' \? 'blocked' : 'reported_done',/,
    );
    // Chặn trước bằng ref chứ không phải biến render: `onFinish` của useChat
    // không đóng lại theo render nên `isLoading` lúc gọi đã là giá trị cũ.
    expect(onFinish.src).toMatch(/upsertLane\([\s\S]{0,400}evidence: finishRef\.current === 'abort'/);
  });

  it('không sinh bậc evidence mới — "blocked" và "reported_done" đã có sẵn trong lib', () => {
    // lib/evidence.ts không thuộc patch này; nếu ai đó tự chế bậc thứ bảy thì
    // describeEvidence phải đổi theo — test này khoá ranh giới.
    for (const level of ['blocked', 'reported_done'] as const) {
      expect(describeEvidence(level).badgeText.length).toBeGreaterThan(0);
    }
  });
});