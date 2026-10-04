/**
 * Comprehensive Unit Tests for the SAST Engine.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  SecuritySastScanner,
  runSecuritySast,
  SAST_RULES,
  SastFinding,
} from '../lib/security-sast';

describe('Chaitin Security SAST Security Engine', () => {
  const scanner = new SecuritySastScanner(process.cwd());

  it('khởi tạo thành công với bộ quy tắc chuẩn Security', () => {
    expect(SAST_RULES.length).toBeGreaterThanOrEqual(10);
    const ruleIds = SAST_RULES.map((r) => r.id);
    expect(ruleIds).toContain('CMD-INJ-001');
    expect(ruleIds).toContain('PATH-TRAV-001');
    expect(ruleIds).toContain('SECRET-OPENAI-001');
    expect(ruleIds).toContain('SECRET-PRIVKEY-001');
    expect(ruleIds).toContain('EVAL-001');
    expect(ruleIds).toContain('XSS-001');
    expect(ruleIds).toContain('SSRF-001');
    expect(ruleIds).toContain('CRYPTO-001');
  });

  it('phát hiện lỗ hổng Command Injection (CWE-78)', () => {
    const cmdRule = SAST_RULES.find((r) => r.id === 'CMD-INJ-001')!;
    const vulnerableLine = 'const out = execSync(`git checkout ${branchName}`);';
    const safeLine = "const out = spawnSync('git', ['checkout', branchName]);";

    expect(cmdRule.match(vulnerableLine, 1, vulnerableLine, 'src/service.ts')).toBe(true);
    expect(cmdRule.match(safeLine, 1, safeLine, 'src/service.ts')).toBe(false);
  });

  it('phát hiện lỗ hổng Path Traversal (CWE-22)', () => {
    const pathRule = SAST_RULES.find((r) => r.id === 'PATH-TRAV-001')!;
    const vulnerableLine = 'const content = fs.readFileSync(req.query.file, "utf8");';
    const safeLine = 'const content = fs.readFileSync(resolveWithin(root, relPath), "utf8");';

    expect(pathRule.match(vulnerableLine, 1, vulnerableLine, 'app/api/file.ts')).toBe(true);
    expect(pathRule.match(safeLine, 1, safeLine, 'app/api/file.ts')).toBe(false);
  });

  it('phát hiện rò rỉ khóa bí mật OpenAI, Anthropic, AWS, GitHub và Private Key (CWE-798)', () => {
    const openaiRule = SAST_RULES.find((r) => r.id === 'SECRET-OPENAI-001')!;
    const anthropicRule = SAST_RULES.find((r) => r.id === 'SECRET-ANTHROPIC-001')!;
    const githubRule = SAST_RULES.find((r) => r.id === 'SECRET-GITHUB-001')!;
    const awsRule = SAST_RULES.find((r) => r.id === 'SECRET-AWS-001')!;
    const privKeyRule = SAST_RULES.find((r) => r.id === 'SECRET-PRIVKEY-001')!;

    expect(openaiRule.match('const key = "sk-abcdef1234567890abcdef123456";', 1, '', 'src/client.ts')).toBe(true);
    expect(anthropicRule.match('const key = "sk-ant-api03-abcdef123456789012345678";', 1, '', 'src/client.ts')).toBe(true);
    expect(githubRule.match('const token = "ghp_1234567890abcdef1234567890abcdef12";', 1, '', 'src/client.ts')).toBe(true);
    expect(awsRule.match('const awsKey = "AKIAIOSFODNN7EXAMPLE";', 1, '', 'src/client.ts')).toBe(true);
    expect(privKeyRule.match('-----BEGIN RSA PRIVATE KEY-----', 1, '', 'src/cert.pem')).toBe(true);

    // Không báo động giả với placeholder hoặc biến môi trường
    expect(openaiRule.match('const key = process.env.OPENAI_API_KEY;', 1, '', 'src/client.ts')).toBe(false);
    expect(openaiRule.match('const key = "sk-placeholder-not-real";', 1, '', 'src/client.ts')).toBe(false);
  });

  it('phát hiện Regular Expression Denial of Service / ReDoS (CWE-1333)', () => {
    const redosRule = SAST_RULES.find((r) => r.id === 'REDOS-001')!;
    const vulnerableLine = 'const regex = /([a-zA-Z0-9]+)+$/;';
    const safeLine = 'const regex = /^[a-zA-Z0-9]+$/;';

    expect(redosRule.match(vulnerableLine, 1, vulnerableLine, 'src/validator.ts')).toBe(true);
    expect(redosRule.match(safeLine, 1, safeLine, 'src/validator.ts')).toBe(false);
  });

  it('phát hiện Dangerous Eval & Dynamic Execution (CWE-95)', () => {
    const evalRule = SAST_RULES.find((r) => r.id === 'EVAL-001')!;
    const funcRule = SAST_RULES.find((r) => r.id === 'EVAL-002')!;

    expect(evalRule.match('const result = eval(userExpression);', 1, '', 'src/calc.ts')).toBe(true);
    expect(funcRule.match('const fn = new Function("a", "b", userCode);', 1, '', 'src/calc.ts')).toBe(true);
    expect(evalRule.match('const result = JSON.parse(userJson);', 1, '', 'src/calc.ts')).toBe(false);
  });

  it('phát hiện Cross-Site Scripting / XSS (CWE-79)', () => {
    const xssRule = SAST_RULES.find((r) => r.id === 'XSS-001')!;
    const vulnerableLine = '<div dangerouslySetInnerHTML={{ __html: userRawHtml }} />';
    const sanitizedLine = '<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userRawHtml) }} />';

    expect(xssRule.match(vulnerableLine, 1, vulnerableLine, 'components/post.tsx')).toBe(true);
    expect(xssRule.match(sanitizedLine, 1, sanitizedLine, 'components/post.tsx')).toBe(false);
  });

  it('phát hiện Insecure Cryptography MD5/SHA1 (CWE-327)', () => {
    const cryptoRule = SAST_RULES.find((r) => r.id === 'CRYPTO-001')!;
    expect(cryptoRule.match('const h = crypto.createHash("md5").update(pwd).digest("hex");', 1, '', 'src/auth.ts')).toBe(true);
    expect(cryptoRule.match('const h = crypto.createHash("sha256").update(pwd).digest("hex");', 1, '', 'src/auth.ts')).toBe(false);
  });

  it('bỏ qua comment JSX `{/* … */}` nhưng VẪN bắt code thật trên cùng dòng', () => {
    /*
     * Regression: bộ lọc comment chỉ nhận dạng block comment khi dòng BẮT ĐẦU
     * bằng nó. Trong JSX, comment bọc trong `{ ... }` nên `trimmed` mở đầu bằng
     * dấu ngoặc nhọn và prose trong đó bị quét như code — đúng loại báo động giả
     * HIGH đã làm đỏ `tests/web-bridge.test.ts` (audit exit 1).
     */
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyen-sast-jsx-'));
    try {
      // (a) prose nguy hiểm CHỈ nằm trong comment JSX -> phải im lặng.
      fs.writeFileSync(
        path.join(testDir, 'commented.tsx'),
        [
          'export function Args({ current }: { current: unknown }) {',
          '  return (',
          '    <div>',
          '      {/* JSON là MÁY, và luôn là text child, KHÔNG BAO GIỜ',
          '          `dangerouslySetInnerHTML`: đây là dữ liệu từ server bên thứ ba. */}',
          '      <pre>{formatArgs(current)}</pre>',
          '    </div>',
          '  );',
          '}',
        ].join('\n'),
        'utf8',
      );
      // (b) dangerouslySetInnerHTML THẬT vẫn phải bị bắt.
      fs.writeFileSync(
        path.join(testDir, 'real-xss.tsx'),
        'export const bad = <div dangerouslySetInnerHTML={{ __html: userRawHtml }} />;\n',
        'utf8',
      );

      const report = runSecuritySast(testDir);
      const xss = report.findings.filter((f) => f.ruleId === 'XSS-001');
      expect(
        xss.map((f) => f.file),
        'chỉ file có dangerouslySetInnerHTML thật mới được báo',
      ).toEqual(['real-xss.tsx']);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('bắt code nằm SAU dòng đóng comment — không bỏ cả dòng', () => {
    /*
     * Regression nghiêm trọng hơn: lần sửa trước chuẩn hoá `{/*`→`/*` rồi bỏ
     * cả dòng khi nó mở comment. Nhưng dòng ĐÓNG một comment nhiều dòng lại mở
     * đầu bằng dấu đóng, nên bị nhận là "vẫn trong comment" và cả dòng biến mất
     * — kéo theo code thật ngay sau đó. Đã đo được: một `dangerouslySetInnerHTML`
     * thật trên dòng đóng comment JSX khiến `ok=true score=100`. Báo động giả
     * HIGH chỉ làm đỏ test; mất finding HIGH thì lọt thẳng khỏi cổng audit.
     *
     * Vì vậy bộ lọc phải CẮT phần comment, không bỏ dòng.
     */
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyen-sast-tail-'));
    try {
      // (a) code thật nằm ngay sau dấu đóng comment JSX nhiều dòng.
      fs.writeFileSync(
        path.join(testDir, 'after-jsx-comment.tsx'),
        [
          'export const v = (',
          '  <div>{/*',
          '    Render raw HTML below -- review before shipping.',
          '  */} <span dangerouslySetInnerHTML={{ __html: serverHtml }} />',
          '  );',
        ].join('\n'),
        'utf8',
      );
      // (b) cùng hình dạng trong block comment thường, file .ts.
      fs.writeFileSync(
        path.join(testDir, 'after-block-comment.ts'),
        ['function f(input) {', '  /* note', '   */ return eval(input);', '}'].join('\n'),
        'utf8',
      );
      // (c) comment một dòng đóng ngay, code đi sau trên CHÍNH dòng đó.
      fs.writeFileSync(
        path.join(testDir, 'same-line.ts'),
        'function g(x) { /* run */ eval(x); }\n',
        'utf8',
      );

      const report = runSecuritySast(testDir);
      const found = new Set(report.findings.map((f) => `${f.ruleId}@${f.file}`));
      expect(found, 'XSS-001 phải bắt được code sau dòng đóng comment JSX').toContain(
        'XSS-001@after-jsx-comment.tsx',
      );
      expect(found, 'EVAL-001 phải bắt được code sau dòng đóng block comment').toContain(
        'EVAL-001@after-block-comment.ts',
      );
      expect(found, 'EVAL-001 phải bắt được code sau comment một dòng').toContain(
        'EVAL-001@same-line.ts',
      );
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('tính điểm an ninh chính xác theo trọng số mức độ nghiêm trọng', () => {
    /*
     * Dùng thư mục tạm RIÊNG cho mỗi lần chạy (mkdtempSync) thay vì đường dẫn
     * cố định trong repo root. Lý do: đường dẫn cố định khiến một lần chạy đứt
     * giữa chừng để lại `vuln.ts`, và lần chạy SAU sẽ quét thấy nó ngay ở bước
     * "file sạch" → test đỏ dù code không sai. Thư mục riêng cũng không còn làm
     * bẩn repo và không bị `tsc --noEmit` quét nhầm file cố tình lỗi.
     */
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyen-sast-'));
    try {
      // File sạch: đạt điểm 100 và Grade A
      fs.writeFileSync(path.join(testDir, 'clean.ts'), 'export const hello = "world";\n', 'utf8');
      const cleanReport = runSecuritySast(testDir);
      expect(cleanReport.score).toBe(100);
      expect(cleanReport.grade).toBe('A');
      expect(cleanReport.ok).toBe(true);

      // File chứa 1 lỗ hổng Critical (Command Injection): bị trừ 25 điểm -> Score <= 75, Grade F
      fs.writeFileSync(
        path.join(testDir, 'vuln.ts'),
        'export function run(cmd: string) { execSync(`rm -rf ${cmd}`); }\n',
        'utf8'
      );
      const vulnReport = runSecuritySast(testDir);
      expect(vulnReport.ok).toBe(false);
      expect(vulnReport.summary.critical).toBeGreaterThanOrEqual(1);
      expect(vulnReport.score).toBeLessThanOrEqual(75);
      expect(vulnReport.grade).toBe('F');
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('bỏ qua file env CỤC BỘ nhưng vẫn quét file env được commit', () => {
    /*
     * `.env.local` là kho BYOK cục bộ: luôn gitignore, không bao giờ commit.
     * Quét nó chỉ sinh false-positive "hardcoded API key" và làm đỏ
     * `tests/web-bridge.test.ts` (vyen audit exit 1) mỗi lần dev dán key thật.
     * `.env` / `.env.production` thường ĐƯỢC commit nên phải bắt lỗi như cũ —
     * đây là ranh giới hành vi, không phải nới lỏng quét bí mật.
     */
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyen-sast-env-'));
    try {
      const secret = 'OPENAI_API_KEY=sk-test0000000000000000000000000000\n';

      // 1. File env CỤC BỘ bị bỏ qua
      fs.writeFileSync(path.join(testDir, '.env.local'), secret, 'utf8');
      const localReport = runSecuritySast(testDir);
      expect(localReport.findings.filter((f) => f.file.endsWith('.env.local'))).toHaveLength(0);
      expect(localReport.ok).toBe(true);

      // 2. File env được commit vẫn phải bị bắt
      fs.writeFileSync(path.join(testDir, '.env'), secret, 'utf8');
      const committedReport = runSecuritySast(testDir);
      const secretHits = committedReport.findings.filter(
        (f) => f.file.endsWith('.env') && f.severity === 'high',
      );
      expect(secretHits.length).toBeGreaterThan(0);
      expect(committedReport.ok).toBe(false);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('tạo text report chuẩn hóa với đầy đủ thông tin remediation', () => {
    const report = scanner.scan({ maxFiles: 10 });
    expect(report.textReport).toContain('Vyen Security & Code Audit (Security Standard)');
    expect(report.textReport).toContain('Security Score:');
    expect(report.textReport).toContain('Vulnerability Summary:');
  });
});
