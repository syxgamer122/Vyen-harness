/*
 * "Chạy ngay" phải luôn kết thúc ở một trạng thái cuối, và luôn nói được
 * với người dùng.
 *
 * Lỗi đang hỏng: `executeScheduleTrigger` bọc toàn bộ phần ghi trạng thái
 * trong `if (res.sessionId)`. `bridge.scheduler.runNow` trả
 * `{ ok: false, error }` mà KHÔNG kèm sessionId khi lịch không có trong
 * daemon. Nhánh đó bị bỏ qua trọn: không ghi gì vào Dexie nên dòng đó mắc
 * ở `lastStatus: 'running'` mãi mãi, `problem` vẫn null nên
 * `setErrorMessage` không chạy — spinner quay mãi, không lỗi, không ai bấm
 * được gì nữa.
 *
 * Ba điều khoá ở đây, đều là thứ KHÔNG ĐƯỢC phá:
 *   - không bịa session id: không có phiên thì không sinh id,
 *   - "success" chỉ đến từ câu trả lời của bridge, không gõ tay,
 *   - thiếu scheduler là THIẾU TÍNH NĂNG, không phải lần chạy hỏng.
 *
 * Suite chạy environment 'node' (không jsdom) nên phần JSX khoanh bằng đọc
 * source, comment cắt trước vì comment tiếng Việt hay NHẮC ĐÚNG những thứ
 * đã bị gỡ. `core.autocrlf`: CRLF trên đĩa, LF ở CI → chuẩn hoá một lần.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (c) => c.replace(/[^\n]/g, ' '));
}

const code = stripComments(read('components/scheduler/scheduler-panel.tsx'));

const triggerStart = code.indexOf('async function executeScheduleTrigger');
const triggerEnd = code.indexOf('export function SchedulerPanel');
const trigger = triggerStart > -1 ? code.slice(triggerStart, triggerEnd) : '';

/** Nhánh xử lý khi bridge trả về mà không kèm sessionId. */
function noSessionBranch(): string {
  const i = trigger.indexOf('if (!res.sessionId)');
  expect(i, 'không tìm thấy nhánh `if (!res.sessionId)` trong executeScheduleTrigger').toBeGreaterThan(-1);
  return trigger.slice(i, i + 700);
}

describe('scheduler — "chạy ngay" không bao giờ mắc ở running', () => {
  it('cắt được thân executeScheduleTrigger để soi', () => {
    expect(triggerStart, 'không tìm thấy executeScheduleTrigger').toBeGreaterThan(-1);
    expect(trigger.length).toBeGreaterThan(200);
  });

  /**
   * ĐỎ khi: quay về `if (res.sessionId) { … }` bọc phần ghi trạng thái — nhánh
   * không-có-sessionId lại không ghi gì, dòng đó treo ở 'running' vĩnh viễn.
   */
  it('phần ghi trạng thái không bị bỏ trống khi bridge không trả sessionId', () => {
    expect(trigger).not.toMatch(/if \(res\.sessionId\)\s*\{/);
    expect(noSessionBranch()).toMatch(/lastStatus:\s*'failure'/);
  });

  /**
   * ĐỎ khi: nhánh đó chỉ ghi `lastError` mà không đóng trạng thái, hoặc ghi
   * `lastStatus` bằng thứ không phải trạng thái cuối ('running' lại, 'idle'…).
   */
  it('nhánh không có sessionId đóng run bằng một trạng thái CUỐI', () => {
    const branch = noSessionBranch();
    expect(branch, 'phải đóng lastRunAt để dòng không còn trông như đang chạy').toMatch(
      /lastRunAt:\s*Date\.now\(\)/,
    );
    expect(branch, 'không được để lastStatus ở running').not.toMatch(/lastStatus:\s*'running'/);
    /* `success` gõ tay ở đây là thành công bịa: không có phiên nào sinh ra. */
    expect(branch, 'không có phiên nào thì không được ghi success').not.toMatch(
      /lastStatus:\s*'success'/,
    );
  });

  /**
   * ĐỎ khi: nhánh đó ghi xong rồi `return null` — `handleRunNow` chỉ gọi
   * `setErrorMessage` khi `problem` khác null, nên lỗi của bridge im lặng
   * mất và người dùng chỉ còn một dòng đổi màu mà không có lý do.
   */
  it('nhánh không có sessionId trả về câu để panel hiện lỗi', () => {
    const branch = noSessionBranch();
    const tail = branch.slice(0, branch.indexOf('\n}'));
    expect(tail, 'nhánh phải return một chuỗi lỗi').toMatch(/return\s+`[^`]*\$\{/);
    expect(tail, 'không được return null trong nhánh lỗi').not.toMatch(/return\s+null/);
    expect(tail, 'lỗi phải lấy từ bridge, không phải chuỗi rỗng').toMatch(/res\.error/);
  });

  /**
   * ĐỎ khi: thêm `sched-…` hay id tự chế trong nhánh này để "có phiên cho nó
   * hiện". Không có phiên thì không sinh id — đây là điều
   * tests/scheduler-panel-honesty.test.ts khoá cho cả thân hàm.
   */
  it('nhánh lỗi không sinh session id giả', () => {
    expect(noSessionBranch()).not.toMatch(/sched-|simSessionId|Math\.random/);
  });

  /**
   * ĐỎ khi: đổi nguồn của "success" khỏi câu trả lời của bridge.
   */
  it('"success" vẫn chỉ đến từ câu trả lời của bridge', () => {
    expect(trigger).toMatch(/lastStatus: res\.ok \? 'success' : 'failure'/);
  });

  /**
   * ĐỎ khi: sau lần ghi `lastStatus: 'running'`, thân try ghi thêm một trạng
   * thái không phải trạng thái cuối (`'running'` lần nữa, `'idle'`, hoặc
   * `'success'` gõ tay). Bất kỳ dòng `lastStatus` nào trong đoạn đó phải là
   * `failure` hoặc câu hỏi trực tiếp bridge — không có nguồn thứ ba.
   */
  it('mọi lần ghi trạng thái sau "running" đều là trạng thái CUỐI', () => {
    const fromRunning = trigger.indexOf("lastStatus: 'running'");
    expect(fromRunning, 'không tìm thấy lần ghi running').toBeGreaterThan(-1);
    const tryEnd = trigger.indexOf('} catch', fromRunning);
    /* Bắt đầu SAU dòng running: đây là những lần ghi phải đóng run. */
    const writes = [
      ...trigger
        .slice(fromRunning + "lastStatus: 'running'".length, tryEnd)
        .matchAll(/lastStatus:[^\n]*/g),
    ].map((m) => m[0]);
    expect(writes.length, 'không tìm thấy dòng lastStatus nào trong try — mốc đã đổi').toBeGreaterThan(1);
    for (const write of writes) {
      expect(write, `trạng thái không phải trạng thái cuối: ${write}`).toMatch(
        /^lastStatus: (?:'failure'|res\.ok \? 'success' : 'failure'),?$/,
      );
    }
  });
});

describe('scheduler — copy trong chữ người dùng đọc', () => {
  /** Chỉ chữi STRING sau khi cắt comment: đó mới là chữ hiện lên màn hình. */
  function stringLiterals(source: string): string[] {
    const out: string[] = [];
    const re = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) out.push(m[1] ?? m[2] ?? m[3] ?? '');
    return out;
  }

  /**
   * ĐỎ khi: đưa dấu gạch dài (em dash) trở lại vào bất kỳ chuỗi nào trong file.
   * Em dash đã từng lọt vào đúng câu này: "Không bật/tắt được kill-switch —
   * bridge trả lỗi." Đó là chữ đọc ra thành tiếng, không phải comment.
   */
  it('không có em dash trong chữ người dùng đọc', () => {
    const bad = stringLiterals(code).filter((s) => s.includes('—'));
    expect(bad, `em dash trong copy: ${bad.join(' | ')}`).toEqual([]);
  });

  /**
   * ĐỎ khi: thêm emoji vào chữ (một icon là ngôn ngữ, emoji thì không).
   */
  it('không có emoji trong chữ người dùng đọc', () => {
    const bad = stringLiterals(code).filter((s) => /\p{Extended_Pictographic}/u.test(s));
    expect(bad, `emoji trong copy: ${bad.join(' | ')}`).toEqual([]);
  });
});