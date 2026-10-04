/**
 * RED TEAM — TabRuntimeState (react/use-agent-runtime.ts) + nhánh /boost
 * (react/use-chat-orchestration.ts).
 *
 * Câu hỏi tấn công:
 *  1. state có bao giờ rơi vào giá trị mà UI KHÔNG hành động được không?
 *  2. người dùng có bị kẹt với KHÔNG còn nút nào để thoát không?
 *  3. còn chuỗi nào từ /boost còn hứa "cô lập / worktree riêng" không?
 *
 * Repo không có DOM (vitest.config.mts:11), nên phần UI đọc SOURCE — đúng
 * convention của tests/boost-honesty.test.ts và tests/tab-runtime-state.test.ts.
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
import {
  BUILTIN_SLASH_COMMANDS,
  parseSlashCommand,
} from '@/lib/slash-commands';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const HOOK_SRC = read('react/use-agent-runtime.ts');
const UI_SRC = read('components/chat-interface.tsx');
const ORCH_SRC = read('react/use-chat-orchestration.ts');

function block(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  expect(i, `không tìm thấy mốc: ${start}`).toBeGreaterThan(-1);
  const j = src.indexOf(end, i);
  expect(j, `không tìm thấy mốc: ${end}`).toBeGreaterThan(-1);
  return src.slice(i, j);
}

const BOOST_BLOCK = block(
  ORCH_SRC,
  "if (slash.kind === 'boost') {",
  "if (slash.kind === 'plan') {",
);

const BANNER_BLOCK = block(
  UI_SRC,
  '{!isLeader && (',
  '<StatusLine',
);

/** Bỏ comment — chuỗi trong comment không phải chuỗi người đọc thấy. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Nút "Chiếm quyền điều khiển" có hiện không? Đọc đúng điều kiện JSX trong
 * chat-interface.tsx — không hard-code, để đổi điều kiện làm test đỏ.
 *
 * Bản cũ trả thẳng `!isLeader && (isAcquiring || isLeaderFrozen)` như một
 * HẰNG SỐ, tức nó mô hình hoá một source đã cũ: cổng đó biến mất ở source
 * thì helper vẫn trả về đúng câu trả lời, và bốn assertion bên dưới có thể
 * chỉ xanh vì chúng hỏi con rối chứ không hỏi băng. Nay điều kiện được ĐỌC
 * ra từ source rồi mới thực thi, nên băng hỏng là băng đỏ.
 */
function stealButtonVisible(isLeader: boolean, isAcquiring: boolean, isLeaderFrozen: boolean): boolean {
  expect(BANNER_BLOCK).toMatch(/\{!isLeader && \(/);
  expect(BANNER_BLOCK, 'băng phải còn nút gọi forceStealLock').toMatch(/onClick=\{forceStealLock\}/);
  /* Điều kiện nào đứng ngay trước thẻ <button> của nút? `null` = không có. */
  const guard = BANNER_BLOCK.match(
    /\{([^{}]+?)&&\s*\(\s*<button[^>]*onClick=\{forceStealLock\}/,
  );
  if (guard === null) return !isLeader;
  /* Chỉ cho phép biểu thức trên đúng hai cờ trạng thái, không cho lời gọi hàm. */
  const expr = guard[1]!.trim();
  expect(expr, `điều kiện chắn nút chiếm quyền không được gọi hàm: ${expr}`).toMatch(
    /^[\w\s()!&|]+$/,
  );
  const value = new Function(
    'isAcquiring',
    'isLeaderFrozen',
    `return Boolean(${expr});`,
  )(isAcquiring, isLeaderFrozen);
  return !isLeader && value === true;
}

/** Template thông báo /boost lấy từ source, không tự chế ra. */
function boostNoticeTemplate(): string {
  /* Không khoá `${slash.target}` trần: handler bọc target trong
     `noticeSafeLine(...)` + `.slice(...)`, nên template hợp lệ không còn
     khớp mẫu cũ. Khoá theo TÊN biến, không theo hình thức nối chuỗi. */
  const m = stripComments(BOOST_BLOCK).match(/`([^`]*slash\.target[^`]*)`/);
  expect(m, 'không tìm thấy showNotice có nhúng slash.target').not.toBeNull();
  return m![1];
}

/* ------------------------------------------------------------------ */
/* 1. Reducer thuần                                                    */
/* ------------------------------------------------------------------ */

describe('reduceTabRuntimeState — grant cũ không được ghi đè', () => {
  it('grant cũ hơn requestId mới nhất → giữ nguyên state', () => {
    expect(reduceTabRuntimeState('LEADER', 7, { requestId: 6, mode: 'OBSERVER' })).toBe('LEADER');
  });

  it('grant cũ là OBSERVER không được hạ LEADER xuống', () => {
    expect(reduceTabRuntimeState('LEADER', 9, { requestId: 2, mode: 'OBSERVER' })).toBe('LEADER');
  });

  it('grant mới nhất được áp dụng', () => {
    expect(reduceTabRuntimeState('ACQUIRING', 3, { requestId: 3, mode: 'LEADER' })).toBe('LEADER');
    expect(reduceTabRuntimeState('ACQUIRING', 3, { requestId: 3, mode: 'OBSERVER' })).toBe('OBSERVER');
  });

  it('grant nổi → OBSERVER (không kẹt ACQUIRING vô hạn)', () => {
    expect(reduceTabRuntimeState('ACQUIRING', 4, { requestId: 4, error: new Error('x') })).toBe(
      'OBSERVER',
    );
  });

  it('grant nổi CŨ thì không được đụng state hiện tại', () => {
    expect(reduceTabRuntimeState('LEADER', 4, { requestId: 3, error: new Error('x') })).toBe('LEADER');
  });

  it('OBSERVER nhận grant LEADER mới thì lên LEADER (steal xong)', () => {
    expect(reduceTabRuntimeState('OBSERVER', 5, { requestId: 5, mode: 'LEADER' })).toBe('LEADER');
  });

  it('mọi grant hợp lệ chỉ sinh ra state mà UI còn hành động được', () => {
    const grants: LockGrant[] = [
      { requestId: 1, mode: 'LEADER' },
      { requestId: 1, mode: 'OBSERVER' },
      { requestId: 1, error: new Error('e') },
    ];
    const seen = new Set<TabRuntimeState>();
    for (const cur of ['LEADER', 'OBSERVER', 'ACQUIRING'] as TabRuntimeState[]) {
      for (const g of grants) seen.add(reduceTabRuntimeState(cur, 1, g));
    }
    /* Không được sinh ra giá trị lạ nào UI không xử lý. */
    expect([...seen].sort()).toEqual(['LEADER', 'OBSERVER']);
  });
});

describe('initialTabRuntimeState — điều kiện đầu vào rác', () => {
  it('chatId rỗng + autoAcquireLock: không được khẳng định LEADER khi chưa hỏi ai', () => {
    expect(initialTabRuntimeState({ chatId: '', autoAcquireLock: true })).toBe('ACQUIRING');
  });

  it('chatId undefined: không được khẳng định LEADER', () => {
    expect(
      initialTabRuntimeState({ chatId: undefined as unknown as string, autoAcquireLock: true }),
    ).toBe('ACQUIRING');
  });

  it('autoAcquireLock tắt → LEADER (không có lock nào để giành)', () => {
    expect(initialTabRuntimeState({ chatId: 'c1', autoAcquireLock: false })).toBe('LEADER');
  });

  it('có chatId + bật auto → ACQUIRING (trung thực, không nói dối)', () => {
    expect(initialTabRuntimeState({ chatId: 'c1', autoAcquireLock: true })).toBe('ACQUIRING');
  });
});

/* ------------------------------------------------------------------ */
/* 2. Ngõi cụt: state nào không còn nút nào để bấm?                    */
/* ------------------------------------------------------------------ */

describe('UI — mọi trạng thái đều phải còn hành động', () => {
  it('OBSERVER sau khi giành quyền nổi: nút chiếm quyền PHẢI còn hiện', () => {
    /* use-agent-runtime.ts ghi rõ: "đó là trạng thái người dùng hành động
       được (nút chiếm quyền vẫn hiện)". */
    expect(HOOK_SRC).toContain('nút chiếm quyền vẫn hiện');
    expect(stealButtonVisible(false, false, false)).toBe(true);
  });

  it('không trạng thái nào của useAgentRuntime dẫn tới ngõi cụt', () => {
    const deadEnds = (['LEADER', 'OBSERVER', 'ACQUIRING'] as TabRuntimeState[]).filter((mode) => {
      const isLeader = mode === 'LEADER';
      const isAcquiring = mode === 'ACQUIRING';
      const isLeaderFrozen = false;
      /* LEADER = bình thường, có ô nhập. Ba trạng thái còn lại phải có nút. */
      return !isLeader && !stealButtonVisible(isLeader, isAcquiring, isLeaderFrozen);
    });
    expect(deadEnds).toEqual([]);
  });

  it('steal nổi → OBSERVER thì người dùng KHÔNG được kẹt (nút phải quay lại)', () => {
    const after = reduceTabRuntimeState('ACQUIRING', 4, { requestId: 4, error: new Error('x') });
    expect(after).toBe('OBSERVER');
    expect(stealButtonVisible(after === 'LEADER', after === 'ACQUIRING', false)).toBe(true);
  });

  it('rơi về OBSERVER khi mount (tab thứ hai) thì phải có đường ra', () => {
    const after = reduceTabRuntimeState('ACQUIRING', 1, { requestId: 1, mode: 'OBSERVER' });
    expect(after).toBe('OBSERVER');
    expect(stealButtonVisible(false, after === 'ACQUIRING', false)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 3. /boost — còn hứa "cô lập" ở đâu không?                          */
/* ------------------------------------------------------------------ */

describe('/boost — không còn chuỗi nào hứa cô lập', () => {
  const FORBIDDEN = [
    'worktree',
    'Worktree',
    'cô lập',
    'tách biệt',
    'riêng biệt',
    'workspace riêng',
    'Git Worktree',
  ];

  it('nhánh /boost không chứa từ nào hứa cô lập', () => {
    /* Chuỗi trong COMMENT (giải thích lỗi cũ) không phải chuỗi người đọc
       thấy — chỉ quét phần code, comment đã bị gỡ. */
    const code = stripComments(BOOST_BLOCK);
    for (const w of FORBIDDEN) {
      expect(code).not.toContain(w);
    }
  });

  it('mô tả /boost trong menu "/" không hứa cô lập', () => {
    const def = BUILTIN_SLASH_COMMANDS.find((c) => c.name === 'boost');
    expect(def).toBeDefined();
    for (const w of FORBIDDEN) {
      expect(`${def!.description} ${def!.syntax}`).not.toContain(w);
    }
  });

  it('/boost KHÔNG được chèn tiền tố mô tả chế độ chạy vào tin nhắn', () => {
    /* Tiền tố mô tả chế độ chạy cũng là câu đầu mà trình sinh tiêu đề phiên
       đọc. */
    expect(BOOST_BLOCK).toMatch(/return submitTurn\(slash\.target\)/);
  });

  it('notice của /boost phải nói thẳng là sửa file thật', () => {
    expect(BOOST_BLOCK).toMatch(/sửa file thật/);
  });
});

describe('/boost — mục tiêu rác', () => {
  it('/boost trần → target rỗng → handler phải chặn, không gửi tin rỗng', () => {
    expect(parseSlashCommand('/boost')).toEqual({ kind: 'boost', target: '' });
    expect(parseSlashCommand('/boost    ')).toEqual({ kind: 'boost', target: '' });
    expect(BOOST_BLOCK).toMatch(/if \(!slash\.target\)/);
  });

  it('/boost chỉ chứa ký tự điều khiển → vẫn là target hợp lệ, không nuốt', () => {
    const parsed = parseSlashCommand('/boost [31m') as { kind: string; target: string };
    expect(parsed.kind).toBe('boost');
  });

  it('/boost với mục tiêu chứa dấu nháy không được vỡ câu thông báo', () => {
    /* Template của app bọc target trong một cặp nháy; nếu target tự mang
       nháy vào thì câu thông báo hỏng, đọc ra là hai câu rác.
       Chỉ kiểm được MỐI NỐI ở đây: nối thẳng `${slash.target}` vào template
       là lộ, vì thay thế chuỗi rồi đếm nháy sẽ lách qua đúng bước khử
       mà ta đang kiểm. Hành vi thật của bước khử được
       tests/boost-notice-text.test.ts chạy thật trên hàm thật. */
    const tpl = boostNoticeTemplate();
    expect(tpl).not.toMatch(/\$\{slash\.target\}/);
    expect(tpl).toMatch(/noticeSafeLine\(/);
  });

  it('/boost với mục tiêu 200.000 ký tự không được dánh nguyên vào thông báo', () => {
    const tpl = boostNoticeTemplate();
    expect(tpl).toMatch(/slash\.target\.slice\(/);
  });

  it('/boost /mode yolo KHÔNG được đổi chính sách phê duyệt (submitTurn không parse lại)', () => {
    const parsed = parseSlashCommand('/boost /mode yolo') as { kind: string; target: string };
    expect(parsed.kind).toBe('boost');
    expect(parsed.target).toBe('/mode yolo');
  });

  it('/BOOST viết HOA vẫn ra lệnh boost', () => {
    expect(parseSlashCommand('/BOOST làm đi')!.kind).toBe('boost');
  });

  it('/boost với mục tiêu là lệnh khác không bị parse thành custom recipe', () => {
    const parsed = parseSlashCommand('/boost /skills', { skills: 'r1' });
    expect(parsed!.kind).toBe('boost');
  });
});
