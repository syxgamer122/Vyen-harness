/**
 * Thông báo `/boost` không được nuốt chuỗi người dùng gõ tay vào câu của app.
 *
 * `mục tiêu` là ĐẦU VÀO CHƯA TIN: nó do người dùng gõ/dán, không phải app viết.
 * Dán thẳng vào `showNotice` thì:
 *  - dấu nháy của người dùng phá vỡ câu thông báo (`/boost nói "xin chào" nhé`
 *    ra hai câu rác, đọc lên như phần mềm hỏng);
 *  - mục tiêu dài hàng trăm nghìn ký tự bị dán nguyên vào vùng `role="status"`
 *    (components/toast.tsx) — trình đọc màn hình đọc TOÀN BỘ ra thành tiếng.
 *
 * Repo không có DOM (vitest.config.mts:11) nên không render được toast. Thay vào
 * đó test này THỰC SỰ CHẠY template literal của handler: lấy nguyên văn từ
 * source rồi `new Function` với đúng ba binding mà nó dùng. Không chế tác lại
 * câu chữ trong test — đổi một ký tự trong handler là đỏ.
 *
 * `noticeSafeLine` / `BOOST_TARGET_MAX` được IMPORT thật từ hook, không chép
 * lại logic vào test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { BOOST_TARGET_MAX, noticeSafeLine } from '@/react/use-chat-orchestration';

const ORCH_PATH = path.resolve(__dirname, '../react/use-chat-orchestration.ts');
/** CRLF → LF y hệt tests/run-wiring.test.ts:34 (repo bật `core.autocrlf`). */
const ORCH_SRC = fs.readFileSync(ORCH_PATH, 'utf8').replace(/\r\n/g, '\n');

/** Cắt nhánh `/boost` — mốc bắt đầu và mốc kết thúc đều là code, không phải comment. */
function block(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  expect(i, `không tìm thấy mốc: ${start}`).toBeGreaterThan(-1);
  const j = src.indexOf(end, i);
  expect(j, `không tìm thấy mốc: ${end}`).toBeGreaterThan(-1);
  return src.slice(i, j);
}

/** Bỏ comment — chuỗi trong comment không phải chuỗi người đọc thấy. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const BOOST_BLOCK = stripComments(block(
  ORCH_SRC,
  "if (slash.kind === 'boost') {",
  "if (slash.kind === 'plan') {",
));

/**
 * Template literal của thông báo `/boost`, lấy TỪ SOURCE.
 *
 * Regex này cố ý KHÔNG khoá vào `${slash.target}`: template hợp lệ có thể nhúng
 * `slash.target` qua một hàm dàn phẳng (`${noticeSafeLine(slash.target.slice(…))}`)
 * — lúc đó `\$\{slash\.target\}` không khớp và test chết oan dù hành vi đã đúng.
 * Khoá theo `slash.target` (tên biến) vẫn bắt được "thông báo có nhúng mục tiêu
 * vào không", và để mở đường cho việc bọc nó.
 */
function boostNoticeTemplate(): string {
  const m = BOOST_BLOCK.match(/`([^`]*slash\.target[^`]*)`/);
  expect(m, 'không tìm thấy showNotice có nhúng slash.target').not.toBeNull();
  return m![1];
}

/**
 * CHẠY THẬT template đó với một mục tiêu cho trước.
 *
 * `new Function` nhận đúng ba binding mà template dùng, nên hành vi thật của
 * handler được kiểm chứng chứ không phải bản mô phỏng: sửa regex trong
 * `noticeSafeLine`, đổi `BOOST_TARGET_MAX`, bỏ dấu `…`, hay dán thẳng
 * `slash.target` — mọi thay đổi đó đều đổi kết quả ở đây và làm test đỏ.
 */
function renderBoostNotice(target: string): string {
  const template = boostNoticeTemplate();
  const render = new Function(
    'slash',
    'noticeSafeLine',
    'BOOST_TARGET_MAX',
    `return \`${template}\`;`,
  ) as (s: unknown, f: (r: string) => string, m: number) => string;
  return render({ target }, noticeSafeLine, BOOST_TARGET_MAX);
}

/** Số dấu nháy kép do CHÍNH app mang vào thông báo. */
const APP_QUOTES = 2;

describe('/boost — mục tiêu chứa dấu nháy không được vỡ câu thông báo', () => {
  it('nháy của người dùng bị trung hòa — chỉ còn đúng hai nháy của app', () => {
    const notice = renderBoostNotice('nói "xin chào" nhé');
    /* Template của app bọc mục tiêu trong một cặp nháy; mục tiêu tự mang nháy
       vào thì câu hỏng, đọc ra là hai câu rác. */
    expect(notice.match(/"/g) ?? []).toHaveLength(APP_QUOTES);
  });

  it('nháy cong và nháy đơn cũng bị trung hòa', () => {
    /* Người dùng gõ tiếng Việt rất dễ dán “ ” từ tài liệu hoặc từ AI. */
    const notice = renderBoostNotice('viết “báo cáo” rồi gửi ‘sếp’');
    expect(notice).not.toMatch(/[“”‘’']/);
  });

  it('xem trước không còn dấu nháy kép nào của người dùng lọt vào', () => {
    expect(noticeSafeLine('nói "xin chào" nhé')).toBe('nói xin chào nhé');
    /* Cắt bằng khoảng trắng chứ không xoá hẳn: hai từ dính liền ("nóxin") thì
       người đọc tưởng đó là lỗi chính tả trong mục tiêu của họ. */
    expect(noticeSafeLine('sửa"file"A')).toBe('sửa file A');
  });
});

describe('/boost — mục tiêu khổng lồ không được dán nguyên vào thông báo', () => {
  const HUGE = 'x'.repeat(200_000);

  it('thông báo bị chặn ở độ dài đọc được, không phụ thuộc độ dài mục tiêu', () => {
    const short = renderBoostNotice('làm đi');
    const huge = renderBoostNotice(HUGE);
    /* Vùng role="status": đây là thứ trình đọc màn hình đọc thành tiếng. */
    expect(huge.length).toBeLessThan(short.length + BOOST_TARGET_MAX + 1);
    expect(huge.length).toBeLessThan(400);
  });

  it('chỗ cắt PHẢI có dấu … — cắt không dấu đọc ra là toàn bộ mục tiêu', () => {
    /* Không đánh dấu thì thông báo nói dối: nó im lặng bỏ bớt mà trông như đã nói
       hết. Đây là lý do phải cắt CÓ DẤU chứ không cắt trần. */
    expect(renderBoostNotice(HUGE)).toContain('…');
  });

  it('mục tiêu vừa khít thì KHÔNG thêm dấu … — không bịa thêm việc chưa xảy ra', () => {
    const exact = 'y'.repeat(BOOST_TARGET_MAX);
    expect(renderBoostNotice(exact)).not.toContain('…');
    expect(renderBoostNotice('y'.repeat(BOOST_TARGET_MAX + 1))).toContain('…');
  });

  it('template cắt bằng slice trên BOOST_TARGET_MAX, không cắt ở chỗ khác', () => {
    /* Khoá đúng biểu thức lấy phần hiển thị. Đổi hằng số hoặc bỏ slice thì
       dòng này đỏ — đó là toàn bộ điều test này tồn tại. */
    expect(boostNoticeTemplate()).toMatch(/slash\.target\.slice\(0, BOOST_TARGET_MAX\)/);
    expect(boostNoticeTemplate()).toMatch(/slash\.target\.length > BOOST_TARGET_MAX \? '…' : ''/);
  });
});

describe('/boost — dán trần không được đổi thứ gửi đi', () => {
  it('xem trước bị cắt/escape, TIN NHẮN gửi agent vẫn nguyên văn', () => {
    /* Đây là ranh giới quan trọng: cắt ở thông báo là cho NGƯỜI DÙNG đọc, còn
       agent phải nhận đúng mục tiêu họ gõ — cắt trong lúc gửi là mất việc. */
    expect(BOOST_BLOCK).toMatch(/return submitTurn\(slash\.target\)/);
    expect(BOOST_BLOCK).not.toMatch(/submitTurn\(noticeSafeLine|submitTurn\([^)]*slice\(/);
  });

  it('mục tiêu rỗng vẫn bị chặn trước khi dựng thông báo', () => {
    expect(BOOST_BLOCK).toMatch(/if \(!slash\.target\)/);
  });
});

describe('noticeSafeLine — thuần, không phụ thuộc gì', () => {
  it('dấu xuống dòng và ký tự điều khiển không được đẩy câu ra khỏi tầm nhìn', () => {
    expect(noticeSafeLine('dòng 1\ndòng 2')).toBe('dòng 1 dòng 2');
    expect(noticeSafeLine('dòng 1\r\ndòng 2')).toBe('dòng 1 dòng 2');
    expect(noticeSafeLine('a\u0000b')).toBe('a b');
    /* ESC / NUL từ clipboard: \s không bắt, phải có mặt nạ riêng. */
    expect(noticeSafeLine('a\u001bb')).toBe('a b');
    expect(noticeSafeLine('a\u007fb')).toBe('a b');
  });

  it('gộp khoảng trắng thừa và cắt hai đầu', () => {
    expect(noticeSafeLine('  a \t\n  b  ')).toBe('a b');
  });

  it('KHÔNG cắt — chỗ cắt phải mang dấu, mà chỗ biết mình cắt là nơi gọi', () => {
    /* Hàm này không biết mục tiêu gốc dài bao nhiêu, nên cắt im lặng ở đây là cắt
       không dấu — đúng thứ docblock cấm. Hằng số cắt nằm ở chỗ gọi. */
    expect(noticeSafeLine('z'.repeat(500))).toHaveLength(500);
  });
});