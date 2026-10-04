/**
 * Khoá WIRING của run-lifecycle trong react/use-chat-orchestration.ts.
 *
 * Block `nhiều lượt — reset trước mỗi lượt` trong tests/run-lifecycle.test.ts
 * chỉ kiểm tra `lib/run-lifecycle.ts` — file đó KHÔNG nằm trong diff. Xoá
 * `resetRun()` khỏi `startFreshRun()`, hoặc xoá cả lời gọi `startFreshRun()`
 * ở một call site, thì toàn bộ block kia vẫn xanh. Đây là test bù cho đúng
 * lỗ hổng đó: đọc SOURCE và khoá từng call site.
 *
 * Theo đúng convention tests/chat-route-fixes.test.ts: regex lên source, đảo
 * wiring → ĐỎ. Ở đây "đảo" nghĩa là xoá `startFreshRun()` khỏi một call site,
 * hoặc dời `succeedRun()` lên trên các drain.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  STALL_TIMEOUT_MS,
  beginRun,
  markSucceeded,
  newRun,
  reconcile,
  touchProgress,
} from '@/lib/run-lifecycle';

const ORCHESTRATION_PATH = path.resolve(__dirname, '../react/use-chat-orchestration.ts');
/**
 * Chuẩn hoá CRLF → LF trước khi regex. Repo bật `core.autocrlf` nên file trên
 * đĩa là CRLF trong khi checkout sạch (CI, git khác autocrlf) là LF; nếu
 * regex viết cứng `\n` thì test ĐỎ ở máy này và XANH ở máy kia — tệ hơn
 * cả là không có test. Chuẩn hoá một lần ở đây cho mọi regex bên dưới.
 */
const source = fs.readFileSync(ORCHESTRATION_PATH, 'utf8').replace(/\r\n/g, '\n');

/**
 * Chỉ đếm CALL STATEMENT, không đếm chữ trong comment. `use-chat-orchestration.ts`
 * giải thích rất nhiều bằng comment tiếng Việt có chứa đúng tên hàm, nên đếm
 * bằng `split('succeedRun()')` thì đếm nhầm comment và test ĐỎ oan. Mẫu bắt
 * buộc dấu `;` ngay sau `)` và không có gì khác trên dòng — một dòng comment
 * luôn có `*` hoặc `//` ở đầu nên không bao giờ khớp.
 */
const CALL = (fn: string) => new RegExp(`^\\s*${fn}\\(\\);$`, 'm');

/** Đếm call statement dạng `fn();` trong một đoạn source. */
function countCalls(src: string, fn: string): number {
  return src.match(new RegExp(`^\\s*${fn}\\(\\);$`, 'gm'))?.length ?? 0;
}

/** Vị trí (index) của một mốc trong source — assert là mốc ĐÓ tồn tại. */
function at(needle: string): number {
  const i = source.indexOf(needle);
  expect(i, `không tìm thấy mốc: ${needle}`).toBeGreaterThan(-1);
  return i;
}

/** Thân một callback: từ khai báo tới khai báo kế tiếp. */
function body(decl: string, nextDecl: string): string {
  return source.slice(at(decl), at(nextDecl));
}

/**
 * Offset của mốc TRONG một đoạn đã cắt, có assert là mốc tồn tại.
 * Bắt buộc dùng khi so với offset lấy từ chính đoạn đó.
 */
function within(src: string, needle: string): number {
  const i = src.indexOf(needle);
  expect(i, `không tìm thấy mốc trong đoạn: ${needle}`).toBeGreaterThan(-1);
  return i;
}

describe('run-lifecycle — call site nào PHẢI mở run mới', () => {
  /**
   * Sáu cổng do NGƯỜI DÙNG chủ động mở một lượt trả lời mới. Không có
   * `startFreshRun()` ở bất kỳ cổng nào thì lượt đó chạy mà không còn ai canh:
   * `beginRun()` trên run terminal là no-op im lặng (run-lifecycle.ts:144), vòng
   * reconcile dừng ở `isTerminal`, stall detector 20s và auto-repair không
   * chạy, còn `startedAt` bị ghim vào lượt đầu nên RUN_DEADLINE_MS không bao
   * giờ bắn.
   *
   * Cổng mới THÊM → thêm một entry ở đây, nếu không nó sẽ chạy không giám sát
   * và không có gì báo.
   */
  const OPENS_NEW_TURN: ReadonlyArray<{ name: string; decl: string; next: string }> = [
    {
      name: 'submitTurn — gửi tin',
      decl: 'const submitTurn = useCallback(',
      next: 'onSubmit = useCallback(',
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
      name: 'continueGenerating — Tiếp tục',
      decl: 'const continueGenerating = useCallback(',
      next: 'const handleApprovePlan = useCallback(',
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
  ];

  for (const { name, decl, next } of OPENS_NEW_TURN) {
    it(`${name} gọi startFreshRun()`, () => {
      expect(body(decl, next)).toMatch(CALL('startFreshRun'));
    });
  }

  it('danh sách trên vẫn bám đúng — không có cổng thứ bảy lọt vào', () => {
    // Chốt bằng SỐ call statement trong cả file: đúng bằng số cổng liệt kê.
    // Thêm một cổng mà quên khai báo ở trên → ĐỎ.
    expect(countCalls(source, 'startFreshRun')).toBe(OPENS_NEW_TURN.length);
  });
});

/**
 * `succeedRun()` phải đứng SAU ba drain, không phải trước.
 *
 * `onFinish` chốt `succeeded` thì run thành BẤT BIẾN (isTerminal). Ba drain
 * (steering, goal-loop continue, follow-up) đều `append()` mở một lượt mới
 * ngay sau đó mà KHÔNG gọi `startFreshRun()` — chúng nối tiếp đúng run này để
 * `startedAt` giữ nguyên canh trọn một câu trả lời dài. Nếu `succeedRun()`
 * chạy trước: run terminal → `reconcile` trả `{kind:'none'}` ngay
 * (run-lifecycle.ts:318) → vòng canh dừng, `touchRun()` no-op qua
 * `touchProgress` → mọi lượt nối tiếp (kể cả 5 vòng goal loop) chạy không
 * giám sát.
 */
describe('run-lifecycle — succeedRun đứng sau các drain', () => {
  const onFinish = source.slice(
    at('onFinish: (message, { finishReason, usage }) => {'),
    at('onError: (err) => {'),
  );

  it('đúng HAI lần gọi succeedRun trong onFinish: nhánh recipe + lượt cuối', () => {
    // Hai lần, và chỉ đúng hai: recipe chốt rồi return; còn lại là lượt không
    // còn drain nào đứng sau. Thêm lần thứ ba = chốt succeeded ở giữa, đúng
    // cái bug đang chặn.
    expect(countCalls(onFinish, 'succeedRun')).toBe(2);
  });

  it('lần succeedRun thứ HAI nằm sau cả ba drain', () => {
    const calls: number[] = [];
    for (const m of onFinish.matchAll(/^\s*succeedRun\(\);$/gm)) calls.push(m.index!);
    expect(calls.length).toBe(2);

    // `within()` chứ không phải `at()`: hai chỉ số phải cùng HỆ TOẠ ĐỘ.
    // `calls` là offset trong SLICE `onFinish`, còn `at()` trả offset trong
    // CẢ FILE (~137k) — so chéo sẽ luôn sai. `within` cũng assert mốc tồn
    // tại, vì `indexOf` trả -1 và -1 < 0 thì phép so luôn ĐÚNG (xanh oan).
    const last = calls[1]!;
    expect(last).toBeGreaterThan(within(onFinish, 'drainQueue(steeringRef.current'));
    expect(last).toBeGreaterThan(within(onFinish, 'evaluateGoalTurn('));
    expect(last).toBeGreaterThan(within(onFinish, 'drainQueue(followUpRef.current'));
  });

  it('nhánh recipe chốt succeeded ngay trước khi chạy checks rồi return', () => {
    // Recipe không drain: pass/stop là xong thật, retry thì submitTurn tự
    // startFreshRun. `succeedRun()` phải nằm trước `return` của nhánh này.
    expect(onFinish).toMatch(
      /^\s*succeedRun\(\);\n\s*void runRecipeChecksRef\.current\(clean\);\n\s*return;$/m,
    );
  });

  it('ba drain KHÔNG reset run — reset sẽ mất giám sát chính lượt đang chạy', () => {
    // startFreshRun() gọi resetRun() vô điều kiện, nên đặt nó trong drain
    // là xoá mất startedAt của chính câu trả lời đang stream.
    expect(onFinish).not.toMatch(CALL('startFreshRun'));
  });

  it('state máy: lượt nối tiếp sau drain vẫn được canh, run KHÔNG terminal', () => {
    // Diễn lại chuỗi thật: lượt chạy → drain append → KHÔNG succeed → lượt
    // nối tiếp. Chỉ lượt CUỐI (không còn drain đứng sau) mới chốt succeeded.
    const T0 = 1_700_000_000_000;
    const turn = touchProgress(beginRun(newRun('r1', T0), T0), T0 + 1_000);

    // Bản chốt sai: succeedRun chạy TRƯỚC drain. Đây chính là bug.
    const broken = markSucceeded(turn, T0 + 30_000);

    // Lượt nối tiếp đi kèm drain: heartbeat là no-op vì run đã terminal, và
    // `reconcile` trả none ngay — im lặng vô thời hạn, dù vẫn đang stream.
    const continued = touchProgress(broken, T0 + 31_000);
    expect(reconcile(continued, T0 + 31_000 + STALL_TIMEOUT_MS * 10).action).toEqual({
      kind: 'none',
    });

    // Bản chốt đúng: chưa succeed, run còn sống qua ranh giới drain và vòng
    // canh vẫn bắt được lượt nối tiếp.
    const alive = touchProgress(turn, T0 + 30_000);
    expect(alive.observed).toBe('running');
    expect(alive.startedAt).toBe(T0);

    const stalled = reconcile(alive, T0 + 30_000 + STALL_TIMEOUT_MS + 1);
    expect(stalled.next.observed).toBe('stalled');
  });
});