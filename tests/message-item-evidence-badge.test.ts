/*
 * Badge bằng chứng dưới tin nhắn assistant: đúng MỘT cái, và nó không được
 * nói "đã báo xong" cho một lượt bị dừng.
 *
 * Repo không có jsdom (vitest environment: 'node') nên phần JSX được khoanh
 * bằng đọc source, comment đã cắt vì comment tiếng Việt trong repo hay nhắc
 * đúng tên thứ đang được kiểm (EvidenceBadge, aborted...).
 *
 * Mỗi `it` ghi rõ DỒNG nào đổi làm nó ĐỎ.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ITEM_PATH = path.resolve(__dirname, '../components/chat/message-item.tsx');

/* CRLF trên đĩa, LF ở CI: chuẩn hoá một lần rồi mới assert. */
const source = fs.readFileSync(ITEM_PATH, 'utf8').replace(/\r\n/g, '\n');
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/.*$/gm, (c) => c.replace(/[^\n]/g, ' '));

describe('message-item — badge bằng chứng render đúng một lần', () => {
  /*
   * Lý do có bài này: một lượt assistant từng in badge hai lần ở hai chỗ khác
   * nhau trong cùng file, cộng thêm một lần ở HUD là ba. Dán thêm một
   * `<EvidenceBadge` nữa vào bất kỳ đâu trong message-item.tsx là ĐỎ — đó là
   * điều khoản để lỗi này không quay lại lần nữa.
   */
  it('chỉ có đúng một call site <EvidenceBadge trong cả file', () => {
    const calls = code.match(/<EvidenceBadge/g) ?? [];
    expect(calls.length, `phải có đúng 1 badge, thấy ${calls.length}`).toBe(1);
  });

  it('badge nằm trong hàng usage/evidence của nhánh assistant', () => {
    /*
     * Thứ tự đọc của lượt assistant: usage + badge nằm cạnh nhau, suy luận ở
     * đáy (xem tests/message-item-timeline.test.ts). Ở đây chỉ khoá badge ở
     * đúng chỗ: dời nó xuống dưới ThinkingBlock là ĐỎ.
     */
    const usage = code.indexOf('<MessageUsage');
    const badge = code.indexOf('<EvidenceBadge');
    const think = code.indexOf('<ThinkingBlock');
    expect(usage, 'không tìm thấy MessageUsage').toBeGreaterThan(-1);
    expect(badge, 'không tìm thấy badge').toBeGreaterThan(usage);
    expect(
      badge < think,
      'badge phải nằm trong hàng usage, không phải ở đáy khối suy luận',
    ).toBe(true);
  });

  it('badge chỉ hiện khi annotation có evidenceLevel hoặc routeReceipt', () => {
    expect(code).toMatch(/'evidenceLevel' in a \|\| 'routeReceipt' in a/);
  });
});

describe('message-item — lượt bị dừng không được mặc định là "đã báo xong"', () => {
  /*
   * `reported_done` in ra chữ "Code · đã báo xong". Một lượt bị dừng giữa
   * chừng thì không có gì để báo xong, và nhãn đó nằm ngay trên
   * MessageStatusBadge "aborted" ở dưới. Trả về biểu thức cũ
   * `?? (isStreaming ? 'running' : 'reported_done')` là ĐỎ.
   */
  it('biểu thức suy mức bằng chứng có nhánh riêng cho lượt bị dừng', () => {
    const expr = code.match(/const level =[\s\S]{0,240}?;/);
    expect(expr, 'không tìm thấy biểu thức `const level =`').not.toBeNull();
    expect(expr![0]).toMatch(/evidenceAnn\.evidenceLevel \?\?/);
    expect(expr![0], 'thiếu nhánh aborted').toMatch(/status === 'aborted'/);
    expect(expr![0], 'lượt bị dừng phải là blocked, không phải reported_done').toMatch(
      /'blocked'/,
    );
  });

  it('không còn mặc định một dòng coi mọi lượt đã xong là "đã báo xong"', () => {
    expect(code).not.toMatch(
      /evidenceAnn\.evidenceLevel \?\? \(isStreaming \? 'running' : 'reported_done'\)/,
    );
  });
});