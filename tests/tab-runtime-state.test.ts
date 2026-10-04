/**
 * Bug: reload trang -> app rơi vào OBSERVER và người dùng không gõ được.
 *
 * Nguyên nhân đã đọc source: `react/use-agent-runtime.ts` khởi tạo
 * `tabMode` bằng `'LEADER'` NGAY LÚC MOUNT, tức là khẳng định một quyền chưa
 * tồn tại. `acquireRuntimeLock` resolve chậm hoặc reject sẽ đổi nó thành
 * OBSERVER, nên state NHẢY LEADER -> OBSERVER ngay trước mặt người dùng và
 * UI khoá ô nhập cho tới khi họ bấm "Chiếm quyền điều khiển".
 *
 * Repo không có jsdom / happy-dom / @testing-library
 * (`vitest.config.mts:11` đặt `environment: 'node'`) nên không mount được hook.
 * Vì vậy phần quy tắc được rút ra thành hai hàm thuần
 * (`initialTabRuntimeState`, `reduceTabRuntimeState`) và test thẳng chúng,
 * cộng thêm các khẳng định wiring đọc SOURCE — vì chỉ test hàm thuần thì đổi
 * `useState` trong hook lại về `'LEADER'` cứu được code mà test vẫn xanh.
 *
 * Mỗi describe ghi rõ dòng nào đổi làm test ĐỎ.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  initialTabRuntimeState,
  reduceTabRuntimeState,
  type LockGrant,
  type TabRuntimeState,
} from '@/react/use-agent-runtime';

const HOOK_PATH = path.resolve(__dirname, '../react/use-agent-runtime.ts');
/**
 * Repo bật `core.autocrlf` nên file trên đĩa là CRLF, còn checkout sạch ở CI
 * là LF. Regex viết cứng `\n` sẽ XANH ở máy này và ĐỎ ở máy kia — tệ hơn cả
 * là không có test. Chuẩn hoá một lần ở đây cho mọi regex bên dưới.
 */
const source = fs.readFileSync(HOOK_PATH, 'utf8').replace(/\r\n/g, '\n');

/** Đoạn source giữa hai mốc, có assert mốc tồn tại. */
function slice(start: string, end: string): string {
  const i = source.indexOf(start);
  expect(i, `không tìm thấy mốc: ${start}`).toBeGreaterThan(-1);
  const j = source.indexOf(end, i);
  expect(j, `không tìm thấy mốc: ${end}`).toBeGreaterThan(-1);
  return source.slice(i, j);
}

const FORCE_STEAL_BLOCK = slice(
  'const forceStealLock = useCallback(',
  '// Đồng bộ trạng thái Actor',
);
const ACQUIRE_EFFECT_BLOCK = slice(
  'useEffect(() => {\n    if (!autoAcquireLock || !chatId) return;',
  'const forceStealLock = useCallback(',
);
const EFFECT_CLEANUP_BLOCK = slice(
  '      mounted = false;',
  '  }, [chatId, autoAcquireLock, applyLockGrant]);',
);

/** Người dùng còn hành động được không: nút chiếm quyền chỉ hiện khi `!isLeader`. */
function isUserBlocked(mode: TabRuntimeState): boolean {
  return mode === 'LEADER';
}

describe('initial state — chưa hỏi lock thì KHÔNG được tự nhận LEADER', () => {
  /**
   * ĐỎ khi: `initialTabRuntimeState` trả 'LEADER' cho case có chatId.
   * Đó chính là dòng khởi tạo cũ, chỉ khác là nằm trong hàm thuần thay vì
   * nằm thẳng trong `useState`.
   */
  it('có chatId + bật lock -> ACQUIRING, không phải LEADER', () => {
    expect(initialTabRuntimeState({ chatId: 'c1', autoAcquireLock: true })).toBe('ACQUIRING');
    expect(initialTabRuntimeState({ chatId: 'c1', autoAcquireLock: true })).not.toBe('LEADER');
  });

  /**
   * ĐỎ khi: `initialTabRuntimeState` nhét `chatId` vào điều kiện (thành
   * `chatId && autoAcquireLock ? ... : 'LEADER'`). `chatId` rỗng lúc mount là
   * "chưa hỏi được ai", không phải "không có gì để giành": effect giành lock
   * early-return trên `!chatId`, nên không coordinator nào tồn tại và
   * `forceStealLock` là no-op — LEADER ở đó là khẳng định quyền chưa có.
   *
   * `autoAcquireLock: false` thì vẫn LEADER, và vẫn đúng: đó là quyết định của
   * caller ("tao không điều phối"), không phải suy đoán của hook.
   */
  it('chatId rỗng + bật lock -> ACQUIRING; tắt lock -> LEADER', () => {
    expect(initialTabRuntimeState({ chatId: '', autoAcquireLock: true })).toBe('ACQUIRING');
    expect(initialTabRuntimeState({ chatId: 'c1', autoAcquireLock: false })).toBe('LEADER');
    expect(initialTabRuntimeState({ chatId: '', autoAcquireLock: false })).toBe('LEADER');
  });

  /**
   * Wiring cho test trên: chỉ cần một lỗi gõ trong biểu thức trả về là hỏng.
   * ĐỎ khi ai đó đưa `chatId` trở lại điều kiện — `chatId` vẫn nằm trong kiểu
   * tham số (đúng, đó là options của hook) nhưng KHÔNG được đọc trong thân
   * hàm. Đây là hợp đồng, không phải chi tiết vụn vặt: nó là lý do
   * `chatKey` đổi từ `c1` sang `''` không khiến tab rơi về LEADER giữa chừng.
   */
  it('initialTabRuntimeState KHÔNG đọc chatId, chỉ autoAcquireLock quyết định', () => {
    const body = slice('export function initialTabRuntimeState(', 'export type LockGrant');
    /* `chatId: string` trong kiểu tham số là hợp lệ — cấm cả khối sẽ bắt nhầm nó. */
    expect(body).not.toMatch(/return[^;]*chatId/);
    expect(body).toMatch(/return autoAcquireLock \? 'ACQUIRING' : 'LEADER';/);
  });

  /**
   * Wiring: hàm thuần xanh không bảo chứng hook dùng nó. ĐỎ khi ai đó ghi lại
   * `useState<TabRuntimeMode>('LEADER')` trong `useAgentRuntime` — hàm thuần
   * vẫn xanh, bug quay lại đúng chỗ cũ.
   */
  it('hook khởi tạo tabMode TỪ hàm thuần, không hardcode LEADER', () => {
    expect(source).toMatch(/useState<TabRuntimeState>\(\(\)\s*=>/);
    expect(source).not.toMatch(/useState<[^>]*>\(\s*'LEADER'\s*\)/);
  });

  /**
   * Wiring: `isLeader` phải suy ra từ state, không được hằng cứng. ĐỎ khi ai
   * đó đổi `isLeader: tabMode === 'LEADER'` thành `isLeader: true` để "vá"
   * triệu chứng — UI sẽ lại tự nhận quyền.
   */
  it('isLeader suy ra từ tabMode, không hằng cứng', () => {
    expect(source).toMatch(/isLeader:\s*tabMode === 'LEADER'/);
  });
});

describe('acquire resolve muộn trả OBSERVER — không được tự nhận LEADER', () => {
  /**
   * ĐỎ khi: `reduceTabRuntimeState` bỏ qua điều kiện `requestId`, hoặc đổi
   * nhánh `mode` thành giữ nguyên 'LEADER'. Chuỗi dưới đây là đúng kịch bản
   * reload của người dùng: mount -> chờ -> resolve chậm ra OBSERVER.
   */
  it('kịch bản reload: ACQUIRING -> (resolve chậm) -> OBSERVER, không bao giờ qua LEADER', () => {
    const states: TabRuntimeState[] = [initialTabRuntimeState({ chatId: 'c1', autoAcquireLock: true })];

    // Lock resolve chậm: nhiều lần render trước khi có kết quả, state vẫn ACQUIRING.
    states.push(reduceTabRuntimeState(states[states.length - 1]!, 1, { requestId: 1, mode: 'OBSERVER' }));

    expect(states).toEqual(['ACQUIRING', 'OBSERVER']);
    expect(states).not.toContain('LEADER');
  });

  /**
   * Bất biến của toàn bộ bug: KHÔNG grant nào mang `mode: 'LEADER'` thì state
   * không bao giờ được LEADER, bất kể có bao nhiêu kết quả OBSERVER/lỗi xếp
   * cạnh nhau. ĐỎ khi có một đường nào đó tự nâng state lên LEADER.
   */
  it('không grant LEADER nào thì state không bao giờ LEADER', () => {
    const nonLeaderGrants: LockGrant[] = [
      { requestId: 7, mode: 'OBSERVER' },
      { requestId: 7, error: new Error('bumpEpoch failed') },
    ];
    let mode = initialTabRuntimeState({ chatId: 'c1', autoAcquireLock: true });
    for (const grant of nonLeaderGrants) {
      mode = reduceTabRuntimeState(mode, 7, grant);
      expect(mode).not.toBe('LEADER');
    }
  });

  /**
   * ĐỎ khi: bỏ nhánh `if ('error' in grant) return 'OBSERVER'` hoặc đổi nó
   * thành `return current` — lần giành quyền nổi sẽ treo tab ở ACQUIRING và
   * người dùng không có nút chiếm quyền để bấm.
   */
  it('acquire reject -> OBSERVER, người dùng vẫn bấm lại được', () => {
    const rejected = reduceTabRuntimeState('ACQUIRING', 3, {
      requestId: 3,
      error: new Error('lock hỏng'),
    });
    expect(rejected).toBe('OBSERVER');
    expect(isUserBlocked(rejected)).toBe(false);
  });
});

describe('forceStealLock — nổi thì không nuốt lỗi, không kẹt người dùng', () => {
  /**
   * ĐỎ khi: bỏ `.catch` khỏi chuỗi `forceStealLock` (đúng thứ đang hỏng ở bản
   * cũ — chỉ có `.then`, nên reject là unhandled rejection im lặng), hoặc đổi
   * nhánh lỗi thành trả về ACQUIRING.
   */
  it('steal reject -> OBSERVER (hành động được), không phải ACQUIRING', () => {
    const afterFailedSteal = reduceTabRuntimeState('ACQUIRING', 9, {
      requestId: 9,
      error: new Error('steal hỏng'),
    });
    expect(afterFailedSteal).toBe('OBSERVER');
    expect(isUserBlocked(afterFailedSteal)).toBe(false);
  });

  /**
   * Wiring: `.then` không có `.catch` là unhandled rejection. ĐỎ khi ai đó
   * xoá `.catch` khỏi khối `forceStealLock`.
   */
  it('chuỗi forceStealLock có .catch bắt rejection', () => {
    expect(FORCE_STEAL_BLOCK).toMatch(/forceStealLock\(/);
    expect(FORCE_STEAL_BLOCK).toMatch(/\.catch\(/);
  });

  /**
   * Wiring: lỗi phải được log chứ không phải bị nuốt. ĐỎ khi ai đó đổi
   * `console.error(...)` trong khối này thành rỗng, hoặc xoá hẳn.
   */
  it('lỗi lock được log ra, không nuốt im lặng', () => {
    expect(FORCE_STEAL_BLOCK).toMatch(/console\.error\(/);
  });

  /**
   * Wiring: trong lúc steal còn bay, state phải là ACQUIRING chứ không giữ
   * LEADER cũ — giữ LEADER là tự nhận quyền khi chưa có lock. ĐỎ khi xoá
   * `setTabMode('ACQUIRING')` trong `forceStealLock`.
   */
  it('trong lúc steal đang bay, state là ACQUIRING chứ không giữ LEADER cũ', () => {
    expect(FORCE_STEAL_BLOCK).toMatch(/setTabMode\('ACQUIRING'\)/);
  });

  /**
   * ĐỎ khi: xoá dòng `setTabMode('ACQUIRING')` trong effect acquire. Khi đó
   * `chatId` đổi, tab giữ nguyên LEADER/OBSERVER của chat CŨ cho tới khi
   * `acquireRuntimeLock` của chat mới resolve — cùng một loại "khẳng định
   * quyền của chat khác".
   */
  it('đổi chatId thì reset về ACQUIRING, không giữ quyền của chat trước', () => {
    expect(ACQUIRE_EFFECT_BLOCK).toMatch(/setTabMode\('ACQUIRING'\)/);
  });
});

describe('coordinator đã dispose không được nằm lại trong ref', () => {
  /**
   * Vòng đời `chatId: 'c1'` -> `'c2'` (hoặc unmount): cleanup dispose coordinator
   * cũ nhưng nếu ref vẫn trỏ tới nó, `forceStealLock` gọi được vào một
   * coordinator đã đóng BroadcastChannel — `channel.postMessage` im lặng bỏ qua,
   * tab chính không hề hay biết phải nhường, còn tab này thì báo đã giành xong.
   * ĐÓ là cách người dùng bấm nút rồi vẫn bị kẹt ở Observer, lần thứ hai.
   *
   * ĐỎ khi: xoá dòng `lockCoordinatorRef.current = null;` khỏi cleanup.
   */
  it('cleanup dọn ref trước khi dispose coordinator', () => {
    expect(EFFECT_CLEANUP_BLOCK).toMatch(/lockCoordinatorRef\.current = null;/);
    /* Thứ tự cũng là hợp đồng: ref sạch TRƯỚC lúc coordinator chết. */
    expect(EFFECT_CLEANUP_BLOCK.indexOf('lockCoordinatorRef.current = null;')).toBeLessThan(
      EFFECT_CLEANUP_BLOCK.indexOf('coordinator.dispose();'),
    );
  });

  /**
   * Ngược lại: `forceStealLock` phải dừng lại khi KHÔNG có coordinator sống —
   * đó là cách `!coordinator` bảo vệ nó khỏi chính object đã dispose. ĐỎ khi ai
   * đó xoá chặn `|| !coordinator`, hoặc đổi nó thành `coordinator?.` im lặng.
   */
  it('forceStealLock dừng lại khi không có coordinator sống', () => {
    expect(FORCE_STEAL_BLOCK).toMatch(/if \(!chatId \|\| !coordinator\) return;/);
  });
});

describe('grant cũ đến muộn không được ghi đè lần giành quyền mới hơn', () => {
  /**
   * Kịch bản: người dùng bấm "Chiếm quyền điều khiển" khi acquire đầu tiên
   * còn đang bay. Steal (id 2) lên LEADER, rồi promise cũ (id 1) resolve
   * OBSERVER. ĐỎ khi bỏ điều kiện `grant.requestId !== latestRequestId`.
   */
  it('steal xong rồi acquire cũ resolve OBSERVER thì giữ nguyên LEADER', () => {
    const stolen = reduceTabRuntimeState('ACQUIRING', 2, { requestId: 2, mode: 'LEADER' });
    expect(stolen).toBe('LEADER');

    const lateAcquire = reduceTabRuntimeState(stolen, 2, { requestId: 1, mode: 'OBSERVER' });
    expect(lateAcquire).toBe('LEADER');
  });

  /**
   * Ngược chiều: steal MỚI hơn thì kết quả cũ bị bỏ qua, nhưng steal mới lại
   * nổi thì phải thắng (OBSERVER). ĐỎ khi đảo điều kiện so sánh thành `<`.
   */
  it('steal mới hơn thắng, kể cả khi nó là kết quả lỗi', () => {
    expect(reduceTabRuntimeState('LEADER', 4, { requestId: 2, mode: 'OBSERVER' })).toBe('LEADER');
    expect(reduceTabRuntimeState('LEADER', 4, { requestId: 4, error: new Error('x') })).toBe('OBSERVER');
  });
});

describe('mọi nơi bật/tắt quyền đều xử lý được ACQUIRING', () => {
  /**
   * `UseAgentRuntimeReturn.tabMode` đã nới thành `TabRuntimeState`. Bất kỳ
   * `switch` hết mạch nào trên state này sẽ khiến `tsc --noEmit` đỏ — assert
   * ở đây chỉ để nhắc rằng hợp đồng đó đang được giữ, không phải để thay
   * tsc. ĐỎ khi: ai đó thu hẹp `tabMode` về `TabRuntimeMode` để "cho khớp".
   */
  it('kiểu trả về expose isAcquiring để UI không phải đoán', () => {
    expect(source).toMatch(/tabMode:\s*TabRuntimeState;/);
    expect(source).toMatch(/isAcquiring:\s*boolean;/);
    expect(source).toMatch(/isAcquiring:\s*tabMode === 'ACQUIRING'/);
  });

  /**
   * ĐỎ khi: xoá `isAcquiring` khỏi object trả về của hook — UI mất tín hiệu để
   * hiện đúng thông điệp "đang giành quyền" thay vì in thẳng tên enum ra cho
   * người dùng.
   */
  it('object trả về của hook expose isAcquiring cùng tabMode', () => {
    const returnObject = slice('  return {\n    state: snapshot.state,', '\n  };');
    expect(returnObject).toMatch(/\n    tabMode,/);
    expect(returnObject).toMatch(/\n    isAcquiring: tabMode === 'ACQUIRING',/);
  });
});