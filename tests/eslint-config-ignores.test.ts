/*
 * `npm run lint` phải chạy được trên cây mã của dự án.
 *
 * `temp-test-profile/` là profile Chrome tạo lúc thử launcher desktop. Nó đã
 * nằm trong `.gitignore`, nhưng ESLint 9 flat config KHÔNG đọc .gitignore, nên
 * JS extension đi kèm trong profile đó (background.js, content.js, main.js...)
 * báo 9 lỗi react/display-name + react-hooks/rules-of-hooks và làm hỏng lint
 * cả repo.
 *
 * Cách sửa đúng là bỏ qua thư mục, KHÔNG sửa bundle của bên thứ ba bên trong
 * nó. Bài test khoá lại đúng việc đó.
 *
 * Mỗi `it` ghi rõ DÒNG nào đổi làm nó ĐỎ.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CONFIG_PATH = path.resolve(__dirname, '../eslint.config.mjs');

/* CRLF trên đĩa, LF ở CI: chuẩn hoá một lần rồi mới assert. */
const config = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/\r\n/g, '\n');

describe('eslint.config.mjs — bỏ qua thư mục không phải mã dự án', () => {
  it('có temp-test-profile trong mảng ignores', () => {
    expect(
      config,
      'thiếu ignore cho temp-test-profile: 9 lỗi trong bundle extension sẽ làm đỏ npm run lint',
    ).toMatch(/ignores:\s*\[[^\]]*'temp-test-profile\/\*\*'[^\]]*\]/);
  });

  it('bỏ qua MỌI file trong thư mục, không chỉ cấp một', () => {
    expect(
      config,
      "'temp-test-profile' trần khớp đúng thư mục đó chứ không phải mọi thứ bên dưới; cần dạng /**",
    ).not.toMatch(/'temp-test-profile'/);
  });

  it('giữ nguyên các ignore đã có', () => {
    for (const entry of ['node_modules/**', '.next/**', 'out/**', 'gui-test-screenshots/**']) {
      expect(config, `mất ignore ${entry}`).toContain(`'${entry}'`);
    }
  });

  it('bỏ qua .teamwork (state runtime của teamwork engine, có bản sao repo bên trong)', () => {
    expect(
      config,
      'thiếu ignore .teamwork: mỗi worktree sinh ra lại nhân báo động lint lên với số lần',
    ).toMatch(/ignores:\s*\[[^\]]*'\.teamwork\/\*\*'[^\]]*\]/);
  });

  it('.gitignore có temp-test-profile (bằng chứng đây là rác tạm, không phải mã dự án)', () => {
    const gitignore = fs
      .readFileSync(path.resolve(__dirname, '../.gitignore'), 'utf8')
      .replace(/\r\n/g, '\n');
    expect(gitignore).toMatch(/^temp-test-profile\/?$/m);
  });
});