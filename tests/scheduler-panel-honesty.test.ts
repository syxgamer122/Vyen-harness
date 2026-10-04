/*
 * Scheduler panel không được báo thành công cho việc chưa từng chạy.
 *
 * Bản web không có tiến trình scheduler. Trước khi sửa,
 * `executeScheduleTrigger` rơi vào nhánh "mô phỏng / fallback trên Web": bịa
 * một sessionId `sched-...` rồi đặt `lastStatus: 'success'`. Đó là thành công
 * bịa, đúng thứ luật "không được nói cái mình không làm" cấm.
 *
 * Bẫy phải tránh: `vyenDesktop()` trả null khi chạy SSR, khi
 * `window.vyen?.desktop !== true`, VÀ khi app mở localhost qua launcher có
 * token thì nó trả về web bridge CÓ scheduler. Nên `null` KHÔNG đồng nghĩa
 * "đang ở trình duyệt" — điều kiện đúng là bridge có mặt `scheduler` không.
 *
 * Suite chạy environment 'node' (không jsdom), nên phần JSX khoanh bằng đọc
 * source, comment đã cắt vì comment tiếng Việt hay nhắc đúng tên thứ đã bị
 * gỡ ("mô phỏng", "sched-"...).
 *
 * Mỗi `it` ghi rõ DÒNG nào đổi làm nó ĐỎ.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

/** Đọc + chuẩn hoá EOL (file trên đĩa là CRLF, CI là LF). */
function read(rel: string): string {
  return fs.readFileSync(path.resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (c) => c.replace(/[^\n]/g, ' '));
}

const code = stripComments(read('components/scheduler/scheduler-panel.tsx'));

/* Chỉ phần thân hàm chạy lịch: `handleSave` cũng sinh id `sched-...`, đó là id
 * bản ghi thật nên không được quy vào tội bịa session id. */
const triggerStart = code.indexOf('async function executeScheduleTrigger');
const triggerEnd = code.indexOf('export function SchedulerPanel');
const trigger = triggerStart > -1 ? code.slice(triggerStart, triggerEnd) : '';

describe('scheduler — không bịa kết quả khi không có scheduler', () => {
  it('cắt được thân executeScheduleTrigger để soi', () => {
    expect(triggerStart, 'không tìm thấy executeScheduleTrigger').toBeGreaterThan(-1);
    expect(trigger.length).toBeGreaterThan(200);
  });

  it('không ghi lastStatus "success" bằng chữ ở bất kỳ đâu', () => {
    expect(trigger).not.toMatch(/lastStatus:\s*'success'/);
    expect(
      trigger,
      'ghi thành công bằng chữ là báo cáo một trạng thái hệ thống chưa tạo ra',
    ).not.toMatch(/lastStatus:\s*"success"/);
  });

  it('nguồn duy nhất của "success" là câu trả lời của bridge', () => {
    expect(trigger).toMatch(/lastStatus: res\.ok \? 'success' : 'failure'/);
  });

  it('không bịa session id lúc không có scheduler', () => {
    expect(trigger).not.toContain('sched-');
    expect(trigger).not.toContain('simSessionId');
  });

  it('thoát sớm, không đụng Dexie, khi bridge không có scheduler', () => {
    expect(trigger).toMatch(/if \(!bridge\?\.scheduler\?\.runNow\) \{\s*return NO_SCHEDULER_MESSAGE;/);
    const guardAt = trigger.indexOf('if (!bridge?.scheduler?.runNow)');
    const firstWriteAt = trigger.indexOf('db.schedules.update');
    expect(
      firstWriteAt,
      'ghi "running" trước khi kiểm tra bridge là tự bịa một lần chạy',
    ).toBeGreaterThan(guardAt);
  });

  it('thiếu scheduler thì báo thiếu tính năng, không báo lần chạy hỏng', () => {
    expect(trigger).not.toMatch(/lastStatus:\s*'failure'[\s\S]{0,40}NO_SCHEDULER/);
    expect(code).toMatch(/const NO_SCHEDULER_MESSAGE =/);
  });
});

describe('scheduler — điều kiện hỏi đúng chỗ, không hỏi nhầm', () => {
  /*
   * Gate bằng `vyenDesktop() === null` sẽ khóa cả web bridge cục bộ, vốn CÓ
   * scheduler. Đổi điều kiện về dạng đó là ĐỎ.
   */
  it('hỏi bridge có mặt scheduler, không hỏi bridge có tồn tại không', () => {
    expect(code).toMatch(/vyenDesktop\(\)\?\.scheduler/);
    expect(code).not.toMatch(/vyenDesktop\(\)\s*===\s*null/);
    expect(code).not.toMatch(/vyenDesktop\(\)\s*==\s*null/);
    expect(code).not.toMatch(/!vyenDesktop\(\)\s*\?\./);
  });

  it('run now bị khoá khi không có scheduler', () => {
    expect(code, 'nút Run now phải disabled khi không có tiến trình').toMatch(
      /disabled=\{[^}]*!canRunSchedule/,
    );
  });
});

describe('scheduler — affordance "không khả dụng" không được bấm được', () => {
  /*
   * Nút bấm được mà bên trong chỉ setErrorMessage là một cái nút bấm giả:
   * trông như có việc để làm. Bỏ `{canKillSwitch ? (` (hoặc đổi nhánh else
   * từ <span> sang <button>) là ĐỎ.
   */
  it('nhánh có kill-switch render nút, nhánh không có render span tĩnh', () => {
    expect(code, 'thiếu nhánh ternary của kill-switch').toMatch(/\{canKillSwitch \? \(\s*<button/);
    expect(code, 'nhánh "không có" phải là <span tĩnh, không phải <button>').toMatch(
      /\)\s*:\s*\(\s*<span[\s\S]{0,400}?<\/span>\s*\)\s*\}/,
    );
  });

  it('span "chỉ bản desktop" kèm giải thích bằng title', () => {
    expect(code).toMatch(/<span[\s\S]{0,300}?title="[^"]*[Dd]esktop[\s\S]{0,120}?>\s*chỉ bản desktop/);
  });

  it('nhãn thẻ kill-switch nói thẳng là không có scheduler, không phải lỗi đọc trạng thái', () => {
    expect(code).toMatch(/'Scheduler không có trong bản này'/);
  });
});

describe('scheduler — lỗi phải hiện được với người dùng', () => {
  it('thông báo lỗi nằm ở cấp panel, không kẹp trong form', () => {
    const noticeAt = code.indexOf('{errorMessage && (');
    const formAt = code.indexOf('{isEditing && (');
    expect(noticeAt, 'không tìm thấy khối hiện lỗi').toBeGreaterThan(-1);
    expect(
      noticeAt < formAt,
      'lỗi của Run now phát ra ngoài form: nằm trong form thì người dùng không bao giờ thấy',
    ).toBe(true);
  });
});