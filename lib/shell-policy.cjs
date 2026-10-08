'use strict';

/**
 * Shell Execution Policy (High-Assurance Hardening).
 *
 * Replaces naive string-based regex denylists with:
 * 1. Tokenized argv parsing (rejecting all shell metacharacters, operators, substitutions, redirections).
 * 2. Strict allowlist for binaries and subcommands.
 * 3. Environment scrubbing (SAFE_ENV stripped of NODE_OPTIONS, LD_PRELOAD, GIT_*, npm_config_*).
 * 4. Safe spawn configuration (shell: false, detached: true, group-kill).
 */

const path = require('node:path');

/**
 * Nạp `lib/path-guard.cjs` theo kiểu lazy — dùng chung canonical realpath jail
 * với mọi đường fs/shell của Vyen desktop, không kéo node:fs vào bundle sớm.
 */
function getPathGuard() {
  return require('./path-guard.cjs');
}

function getFs() {
  return require('node:fs');
}

function getChildProcess() {
  return require('node:child_process');
}

class PolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PolicyError';
  }
}

/**
 * Tokenize a command line string into an array of string arguments.
 * Rejects any command that attempts to use shell operators, pipes, redirections,
 * command substitutions, backticks, newlines, or process substitutions.
 *
 * @param {string} raw
 * @returns {string[]}
 */
function tokenizeCommandLine(raw) {
  if (typeof raw !== 'string') {
    throw new PolicyError('Lệnh shell phải là chuỗi ký tự.');
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new PolicyError('Lệnh rỗng.');
  }

  // Chặn ngay các ký tự phân cách dòng hoặc NUL
  if (/[\r\n\0]/.test(trimmed)) {
    throw new PolicyError('Dấu xuống dòng hoặc ký tự NUL không được phép trong lệnh shell.');
  }

  const tokens = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    const nextChar = trimmed[i + 1];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    // Kiểm tra các shell operator và metacharacter nguy hiểm
    if (inDoubleQuote) {
      // Trong double quote, shell vẫn thực thi substitution: `cmd`, $(cmd), ${var}
      if (char === '`') {
        throw new PolicyError('Command substitution bằng backtick (`) bị cấm tuyệt đối.');
      }
      if (char === '$' && (nextChar === '(' || nextChar === '{')) {
        throw new PolicyError('Command / variable substitution ($(..), ${..}) bị cấm tuyệt đối.');
      }
      current += char;
      continue;
    }

    if (inSingleQuote) {
      current += char;
      continue;
    }

    // Ngoài quote: kiểm tra toán tử shell
    if (char === '`') {
      throw new PolicyError('Command substitution bằng backtick (`) bị cấm tuyệt đối.');
    }
    if (char === '$' && (nextChar === '(' || nextChar === '{')) {
      throw new PolicyError('Command / variable substitution ($(..), ${..}) bị cấm tuyệt đối.');
    }
    if (char === ';' || char === '&' || char === '|' || char === '>' || char === '<' || char === '(' || char === ')') {
      throw new PolicyError(`Shell operator hoặc redirection ('${char}') không được phép.`);
    }
    if (char === '#') {
      throw new PolicyError("Ký tự ghi chú shell ('#') không được phép trong lệnh.");
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (inSingleQuote || inDoubleQuote) {
    throw new PolicyError('Dấu nháy đóng chưa hoàn tất (unclosed quote).');
  }
  if (escaped) {
    throw new PolicyError('Dấu escape (\\) ở cuối chuỗi.');
  }
  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Danh sách allowlist các binary và quy tắc tham số hợp lệ.
 */
const GIT_ALLOWED_SUBCOMMANDS = new Set([
  'status',
  'diff',
  'log',
  'show',
  'add',
  'commit',
  'branch',
  'checkout',
  'rev-parse',
  'stash',
]);

const DANGEROUS_GIT_OPTIONS = [
  '-c',
  '--config',
  '--config-env',
  '--exec-path',
  '--paginate',
  '--no-pager',
  '--upload-pack',
  '--receive-pack',
  '--git-dir',
  '--work-tree',
  '--namespace',
];

const NPM_ALLOWED_SCRIPTS = new Set(['test', 'build', 'lint', 'typecheck', 'check']);
const NPX_ALLOWED_BINS = new Set(['vitest', 'jest', 'eslint', 'tsc', 'prettier', 'webpack']);

/**
 * Tool dưới `npx` chỉ được phép khi đi kèm ĐÚNG subcommand.
 * `npx vite build` / `npx next build` (xuất ra dist rồi thoát) hợp lệ;
 * `npx vite dev` (mở server dài hạn) thì không.
 */
const NPX_REQUIRED_SUBCOMMANDS = { vite: 'build', next: 'build' };

/**
 * Binary CHỈ đọc / in ra stdout: không ghi đĩa, không tự chạy lệnh con.
 *
 * Cố ý KHÔNG xếp `find`/`fd` vào đây dù `SAFE_COMMAND_PATTERNS` của
 * lib/auto-pilot.ts có liệt kê chúng: `find ... -exec <cmd> +` và `-delete`
 * vẫn chạy/ghi được mà tokenizer không chặn (không cần dấu `;`), nên hai
 * binary này phải đòi phê duyệt thay vì auto-approve.
 */
const READ_ONLY_BINS = new Set([
  'rg',
  'ls',
  'dir',
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'wc',
  'file',
  'stat',
  'grep',
  'echo',
  'printf',
]);

/**
 * Binary ĐỌC FILE: mọi tham số KHÔNG phải flag bị coi là đường dẫn và phải nằm
 * trong workspace (xem `assertReadOnlyPathArgs`). `echo`/`printf` chỉ in ra
 * stdout nên không cần kiểm tra đường dẫn.
 */
const PATH_CHECKED_BINS = new Set([
  'rg',
  'ls',
  'dir',
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'wc',
  'file',
  'stat',
  'grep',
]);

/**
 * Cờ có tác dụng phụ với binary chỉ-đọc / git, chặn ở tầng EXECUTION luôn
 * (không chỉ ở auto-approve):
 * - `--pre <cmd>`: ripgrep chạy command tùy ý.
 * - `--output <file>`: git log/diff/show ghi file (có thể ngoài workspace).
 * - `--no-index`: git diff đọc file bất kỳ ngoài repository.
 */
const BLOCKED_TOOL_FLAGS = new Set(['--pre', '--output', '--no-index']);

/** Tên flag bỏ phần giá trị gắn liền (`--output=/tmp/x` → `--output`). */
function flagName(arg) {
  const eq = arg.indexOf('=');
  return eq === -1 ? arg : arg.slice(0, eq);
}

/** Chặn cờ có tác dụng phụ ở tầng execution (mọi đường compile). */
function assertNoSideEffectFlags(bin, args) {
  for (const arg of args) {
    const name = flagName(arg);
    if (BLOCKED_TOOL_FLAGS.has(name)) {
      throw new PolicyError(`Flag có tác dụng phụ bị chặn với "${bin}": ${name}`);
    }
  }
}

/**
 * Kiểm tra lexical khi KHÔNG có workspaceRoot (đường auto-approve không biết
 * workspace): đường dẫn tuyệt đối, `~`, `..`, drive-letter/UNC đều bị coi là
 * thoát workspace.
 */
function isPathLexicallyOutside(arg) {
  if (!arg) return false;
  if (arg.startsWith('~')) return true;
  if (path.isAbsolute(arg)) return true;
  if (/^[a-zA-Z]:[\\/]/.test(arg)) return true;
  if (arg.startsWith('\\\\') || arg.startsWith('//')) return true;
  return arg.split(/[\\/]+/).includes('..');
}

/**
 * Mọi tham số không phải flag của binary đọc-file phải nằm trong workspace.
 * - Có `options.workspaceRoot`: canonical realpath jail (`resolveWithin`) — chặn
 *   cả symlink escape; base để resolve là `options.cwd` (cwd của lệnh) nếu có,
 *   nên `cat ../README.md` từ thư mục con vẫn qua được nếu đích còn trong root.
 * - Không có root: chặn lexical — tuyệt đối/`~`/`..`, và path hệ thống được bảo
 *   vệ (.git/**, node_modules/**).
 *
 * @param {string} bin
 * @param {string[]} args
 * @param {{ workspaceRoot?: string, cwd?: string }} [options]
 */
function assertReadOnlyPathArgs(bin, args, options) {
  const rawRoot =
    options && typeof options.workspaceRoot === 'string' ? options.workspaceRoot : '';
  const guard = getPathGuard();
  const rootAbs = rawRoot ? path.resolve(rawRoot) : '';
  const baseAbs =
    rootAbs && options && typeof options.cwd === 'string' && options.cwd.length > 0 && guard.isWithinRoot(rootAbs, path.resolve(options.cwd))
      ? path.resolve(options.cwd)
      : rootAbs;

  for (const arg of args) {
    if (arg === '--') continue;
    if (arg.length > 1 && arg.startsWith('-')) continue;

    if (rootAbs) {
      const target = path.resolve(baseAbs, arg);
      const rel = path.relative(rootAbs, target);
      let ok = guard.isWithinRoot(rootAbs, target);
      if (ok) {
        try {
          guard.resolveWithin(rootAbs, rel === '' ? '.' : rel);
        } catch {
          ok = false;
        }
      }
      if (!ok) {
        throw new PolicyError(`Đường dẫn "${String(arg).slice(0, 80)}" nằm ngoài workspace của "${bin}".`);
      }
      continue;
    }

    if (isPathLexicallyOutside(arg) || guard.isProtectedSystemPath(arg)) {
      throw new PolicyError(`Đường dẫn "${String(arg).slice(0, 80)}" nằm ngoài workspace của "${bin}".`);
    }
  }
}

/** Spec cài đặt kéo source từ ngoài registry: URL, git, tarball. */
const NPM_EXTERNAL_SPEC_RE = /^(?:https?|git|ssh|file):\/\/|^git\+|^git@|^github:|^gitlab:|^bitbucket:|^[^\/\s@]+@[^\/\s@]+:/i;
const NPM_TARBALL_SPEC_RE = /\.(?:tgz|tar\.gz|tar)$/i;

/**
 * `npm/pnpm/yarn install` chỉ được cài trong workspace, từ registry.
 * Chặn `-g/--global/--prefix/--location[=global]` và spec URL/tarball/git.
 */
function assertSafeNpmInstallArgs(bin, args) {
  for (const arg of args.slice(1)) {
    if (
      arg === '-g' ||
      arg === '--global' ||
      arg === '--prefix' ||
      arg.startsWith('--prefix=') ||
      /^--location(?:=global)?$/i.test(arg)
    ) {
      throw new PolicyError(`${bin} install ra ngoài workspace (global/prefix) bị chặn: ${arg}`);
    }
    if (arg.length > 1 && arg.startsWith('-')) continue;
    if (NPM_EXTERNAL_SPEC_RE.test(arg) || NPM_TARBALL_SPEC_RE.test(arg)) {
      throw new PolicyError(`${bin} install từ URL/tarball/git bị chặn: ${String(arg).slice(0, 80)}`);
    }
  }
}

/**
 * Phân tích và biên dịch lệnh shell thô sang cấu trúc argv an toàn.
 *
 * @param {string} rawCommand
 * @param {{ workspaceRoot?: string, cwd?: string }} [options]
 * @returns {{ bin: string; args: string[] }}
 */
function compileShellCommand(rawCommand, options = {}) {
  const tokens = tokenizeCommandLine(rawCommand);
  if (tokens.length === 0) {
    throw new PolicyError('Lệnh rỗng.');
  }

  const rawBin = tokens[0];
  const args = tokens.slice(1);

  // Không cho phép binary có chứa đường dẫn (/ hoặc \)
  if (rawBin.includes('/') || rawBin.includes('\\')) {
    throw new PolicyError(`Đường dẫn binary tùy ý bị cấm: ${rawBin}`);
  }

  // Chuẩn hóa tên binary về lowercase (cho Windows case-insensitivity)
  const bin = rawBin.toLowerCase();

  // 1. Git
  if (bin === 'git') {
    // Kiểm tra xem có flag config nguy hiểm nào không
    for (const arg of args) {
      if (arg === '-c' || (arg.startsWith('-c') && !arg.startsWith('-C'))) {
        throw new PolicyError(`Flag cấu hình git nguy hiểm bị cấm: ${arg}`);
      }
      for (const dangerous of DANGEROUS_GIT_OPTIONS) {
        if (
          arg === dangerous ||
          arg.startsWith(dangerous + '=') ||
          (dangerous.startsWith('--') && arg.startsWith(dangerous))
        ) {
          throw new PolicyError(`Flag cấu hình git nguy hiểm bị cấm: ${arg}`);
        }
      }
    }

    assertNoSideEffectFlags('git', args);

    // Tìm subcommand đầu tiên (bỏ qua các flag global lành tính như --no-optional-locks, -C, v.v.)
    let subCmdIndex = -1;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-C') {
        i++; // Bỏ qua tham số đường dẫn của -C
        continue;
      }
      if (!args[i].startsWith('-')) {
        subCmdIndex = i;
        break;
      }
    }

    if (subCmdIndex === -1) {
      if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
        return { bin: 'git', args };
      }
      throw new PolicyError('Lệnh git thiếu subcommand.');
    }

    const subCmd = args[subCmdIndex].toLowerCase();
    if (!GIT_ALLOWED_SUBCOMMANDS.has(subCmd)) {
      throw new PolicyError(`Git subcommand bị chặn hoặc nằm ngoài allowlist: ${subCmd}`);
    }

    return { bin: 'git', args };
  }

  // 2. npm / pnpm / yarn
  if (bin === 'npm' || bin === 'pnpm' || bin === 'yarn') {
    if (args.length === 0) {
      throw new PolicyError(`Lệnh ${bin} thiếu subcommand.`);
    }

    const firstArg = args[0].toLowerCase();

    if (firstArg === 'test' || firstArg === 'lint' || firstArg === 'typecheck' || firstArg === 'build') {
      return { bin, args };
    }

    /* `install` vẫn được phép (cài dependency trong workspace) nhưng KHÔNG được
     * cài global/prefix ngoài workspace hay kéo source từ URL/tarball/git —
     * các dạng đó biến lệnh cài đặt thành đường chạy code từ nguồn tùy ý. */
    if (firstArg === 'install') {
      assertSafeNpmInstallArgs(bin, args);
      return { bin, args };
    }

    if (firstArg === 'run' || firstArg === 'run-script') {
      if (args.length < 2) {
        throw new PolicyError(`Lệnh ${bin} run thiếu tên script.`);
      }
      const scriptName = args[1].toLowerCase();
      if (!NPM_ALLOWED_SCRIPTS.has(scriptName)) {
        throw new PolicyError(`Script "${scriptName}" trong package.json không thuộc allowlist an toàn.`);
      }
      return { bin, args };
    }

    throw new PolicyError(`Subcommand ${bin} bị chặn: ${firstArg}`);
  }

  // 3. npx
  if (bin === 'npx') {
    if (args.length === 0) {
      throw new PolicyError('Lệnh npx thiếu tool name.');
    }
    const tool = args[0].toLowerCase();
    const requiredSub = NPX_REQUIRED_SUBCOMMANDS[tool];
    if (requiredSub) {
      if ((args[1] || '').toLowerCase() !== requiredSub) {
        throw new PolicyError(`npx ${tool} chỉ được phép chạy subcommand "${requiredSub}".`);
      }
      return { bin: 'npx', args };
    }
    if (!NPX_ALLOWED_BINS.has(tool)) {
      throw new PolicyError(`Công cụ npx ngoài allowlist an toàn: ${tool}`);
    }
    return { bin: 'npx', args };
  }

  // 4. Các công cụ kiểm tra và đọc file lành tính
  if (READ_ONLY_BINS.has(bin)) {
    assertNoSideEffectFlags(bin, args);
    if (PATH_CHECKED_BINS.has(bin)) {
      assertReadOnlyPathArgs(bin, args, options);
    }
    return { bin, args };
  }

  // 5. Node / Python — chỉ cho phép kiểm tra phiên bản
  if (bin === 'node') {
    if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
      return { bin: 'node', args };
    }
    throw new PolicyError('Node chỉ được phép gọi để kiểm tra phiên bản (--version). Chạy file/eval bị cấm.');
  }

  if (bin === 'python' || bin === 'python3') {
    if (args.length === 1 && (args[0] === '--version' || args[0] === '-V')) {
      return { bin: 'python', args };
    }
    throw new PolicyError('Python chỉ được phép gọi để kiểm tra phiên bản (--version). Chạy file/eval bị cấm.');
  }

  throw new PolicyError(`Binary ngoài allowlist an toàn: ${rawBin}`);
}

/**
 * Thư mục hệ thống tin cậy dùng để resolve binary — KHÔNG dùng PATH kế thừa.
 *
 * Lý do (residual B1(a) đã ghi ở `CRITIQUE_RECONCILIATION.md` mục A1, tài liệu gỡ
 * 2026-10-04 — lịch sử ở git): kế thừa PATH của
 * user nghĩa là binary được tra cứu trong MỌI thư mục user từng thêm, kể cả
 * thư mục ghi được của người dùng khác (`~/.local/bin`, `/tmp/...`). Chỉ giữ các
 * thư mục hệ thống do OS quản lý là ranh giới tin cậy đúng.
 */
const SYSTEM_BIN_DIRS = process.platform === 'win32'
  ? [
      (() => {
        const root = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
        return path.join(root, 'System32');
      })(),
      (() => {
        const root = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
        return path.join(root, 'Sysnative');
      })(),
      (() => {
        const root = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
        return path.join(root, '');
      })(),
      path.dirname(process.execPath),
      'C:\\Program Files\\Git\\cmd',
      'C:\\Program Files\\Git\\bin',
      'C:\\Program Files (x86)\\Git\\cmd',
      'C:\\Program Files (x86)\\Git\\bin',
    ]
  : ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

/** Các đuôi file thực thi cần thử trên Windows (PATHEXT). */
function windowsExtensions() {
  const raw = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD';
  return raw.split(';').map((e) => e.trim()).filter(Boolean);
}

/**
 * Resolve một tên binary về ĐƯỜNG DẪN TUYỆT ĐỐI trong thư mục hệ thống.
 *
 * - Không chấp nhận tên chứa dấu phân cách đường dẫn (đường dẫn tùy ý bị cấm).
 * - Không quét PATH kế thừa.
 * - Trả `null` nếu không tìm thấy — caller phải TỪ CHỐI, không fallback sang PATH.
 */
function resolveBinaryAbsolute(bin) {
  if (typeof bin !== 'string' || !bin) return null;
  if (bin.includes('/') || bin.includes('\\')) return null;

  if (bin.toLowerCase() === 'node' && process.execPath) {
    return process.execPath;
  }

  const fs = getFs();

  if (process.platform === 'win32') {
    const exts = windowsExtensions();
    const hasExt = Boolean(path.extname(bin));
    for (const dir of SYSTEM_BIN_DIRS) {
      if (hasExt) {
        const candidate = path.join(dir, bin.toLowerCase());
        try {
          if (fs.existsSync(candidate)) return candidate;
        } catch {}
      }
      for (const ext of exts) {
        const candidate = path.join(dir, bin.toLowerCase() + ext.toLowerCase());
        try {
          if (fs.existsSync(candidate)) return candidate;
        } catch {
          // Bỏ qua thư mục không đọc được
        }
      }
    }
    return null;
  }

  for (const dir of SYSTEM_BIN_DIRS) {
    const candidate = path.join(dir, bin);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Bỏ qua
    }
  }
  return null;
}

/**
 * PATH "an toàn" thay cho PATH kế thừa: chỉ gồm thư mục hệ thống do OS quản lý.
 * C-01: Không còn đưa `workspaceRoot/node_modules/.bin` vào PATH để triệt tiêu
 * hoàn toàn nguy cơ binary shim giả mạo công cụ hệ thống.
 */
function buildSafePath(workspaceRoot) {
  // C-01: node_modules/.bin removed from PATH
  return SYSTEM_BIN_DIRS.join(path.delimiter);
}

/**
 * Xây dựng môi trường thực thi đã được lọc sạch (SAFE_ENV).
 * Loại bỏ triệt để các biến môi trường cho phép nạp code động hoặc can thiệp thực thi:
 * NODE_OPTIONS, LD_PRELOAD, GIT_*, npm_config_*, PYTHON*, PERL*, v.v.
 *
 * `PATH` KHÔNG còn kế thừa: được dựng lại từ `buildSafePath(workspaceRoot)`.
 * V4: `comspec` bị gỡ khỏi allowlist để chống chiếm quyền thực thi qua biến môi trường.
 *
 * @param {string} [workspaceRoot]
 * @returns {Record<string, string>}
 */
function getSafeEnv(workspaceRoot) {
  const cleanEnv = {};

  const ALLOWED_ENV_VARS = new Set([
    'home',
    'userprofile',
    'homedrive',
    'homepath',
    'lang',
    'lc_all',
    'lc_ctype',
    'term',
    'tmpdir',
    'temp',
    'tmp',
    'systemroot',
    'windir',
    'appdata',
    'localappdata',
  ]);

  for (const [key, value] of Object.entries(process.env)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.startsWith('node_') ||
      lowerKey.startsWith('git_') ||
      lowerKey.startsWith('npm_') ||
      lowerKey.startsWith('ld_') ||
      lowerKey.startsWith('dyld_') ||
      lowerKey.startsWith('python') ||
      lowerKey.startsWith('perl')
    ) {
      continue;
    }

    if (ALLOWED_ENV_VARS.has(lowerKey)) {
      cleanEnv[key] = value;
    }
  }

  cleanEnv.LANG = 'C.UTF-8';

  // PATH dựng lại, KHÔNG kế thừa PATH của user (residual B1(a)).
  cleanEnv.PATH = buildSafePath(workspaceRoot);

  // V4: Trên Windows, ComSpec được resolve cố định tới System32\cmd.exe thay vì kế thừa env tùy ý
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
    cleanEnv.ComSpec = path.join(root, 'System32', 'cmd.exe');
    if (process.env.PATHEXT) {
      cleanEnv.PATHEXT = process.env.PATHEXT;
    }
  }

  return cleanEnv;
}

/**
 * Tiêu diệt toàn bộ cây tiến trình (process tree) an toàn trên cả Windows và POSIX.
 *
 * @param {import('node:child_process').ChildProcess} child
 */
function killProcessTree(child) {
  if (!child || !child.pid) return;

  const isWin = process.platform === 'win32';
  if (isWin) {
    try {
      const { spawnSync } = getChildProcess();
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      try {
        child.kill();
      } catch {}
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {}
    }
  }
}

/* ------------------------------------------------------------------ */
/* Git auto-approve (Smart mode) — allowlist cờ theo từng subcommand   */
/* ------------------------------------------------------------------ */

/**
 * Allowlist cờ chỉ-đọc cho TỰ DUYỆT theo từng subcommand git (Smart mode).
 * Đây là danh sách CHO PHÉP: cờ lạ → không tự duyệt (execution không bị chặn,
 * người dùng vẫn duyệt được qua modal). Nhờ vậy `git branch -D main`,
 * `git branch <name>` (tạo nhánh), `git stash push`… không còn tự chạy.
 *
 * Chỉ gồm các subcommand nằm trong GIT_ALLOWED_SUBCOMMANDS; `remote`/`tag`/
 * `reflog` vốn đã bị compileShellCommand chặn từ trước nên không có bảng ở đây.
 */
const GIT_AUTO_APPROVE_FLAGS = {
  status: new Set([
    '-s', '--short', '-b', '--branch', '--porcelain', '--long', '-v', '--verbose',
    '--show-stash', '--ignored', '-u', '--untracked-files', '--no-optional-locks',
    '--ahead-behind', '--no-ahead-behind', '--column', '--no-column', '-z', '--null',
  ]),
  diff: new Set([
    '-p', '-u', '--patch', '--no-patch', '-s', '--stat', '--shortstat', '--numstat',
    '--name-only', '--name-status', '--raw', '--cached', '--staged', '--merge-base',
    '--no-color', '--color', '--word-diff', '--word-diff-regex', '--ignore-space-at-eol',
    '--ignore-space-change', '-b', '--ignore-all-space', '--ignore-blank-lines',
    '--ignore-cr-at-eol', '--check', '--summary', '--compact-summary', '--binary',
    '--full-index', '--abbrev', '--src-prefix', '--dst-prefix', '--no-prefix', '-M',
    '--find-renames', '-C', '--find-copies', '--diff-filter', '--pickaxe-all',
    '--pickaxe-regex', '-S', '-G', '--no-ext-diff', '--no-textconv', '--exit-code',
    '--quiet', '--relative', '--no-renames', '--stat-count', '--inter-hunk-context',
    '--function-context', '-W', '--text', '-a', '--unified', '-U',
  ]),
  log: new Set([
    '--oneline', '--graph', '--decorate', '--no-decorate', '--pretty', '--format',
    '--abbrev-commit', '--no-abbrev-commit', '--date', '--all', '--branches', '--tags',
    '--remotes', '--first-parent', '--merges', '--no-merges', '--grep', '--author',
    '--committer', '--since', '--after', '--until', '--before', '--follow', '--reverse',
    '--topo-order', '--date-order', '--author-date-order', '--source', '--use-mailmap',
    '--mailmap', '--show-signature', '--relative-date', '--no-patch', '-s', '--stat',
    '--shortstat', '--numstat', '--name-only', '--name-status', '--raw', '-p', '-u',
    '--patch', '--max-count', '-n', '--skip', '--count', '--no-walk', '--do-walk',
    '--simplify-by-decoration', '--full-history', '--left-right', '--boundary',
    '--cherry-pick', '--cherry-mark', '--cherry', '--right-only', '--left-only',
    '--ancestry-path', '--exclude', '--alternate-refs', '--single-worktree',
    '--expand-tabs', '--notes', '--no-notes', '--show-notes', '--standard-notes',
    '--no-standard-notes', '--color', '--no-color', '-S', '-G', '--diff-filter',
    '--pickaxe-all', '--pickaxe-regex', '--relative', '-z', '--null', '--all-match',
    '--invert-grep', '--regexp-ignore-case', '-i', '--basic-regexp', '--extended-regexp',
    '-E', '--fixed-strings', '-F', '--perl-regexp', '-P', '--remove-empty', '--dense',
    '--sparse', '--min-parents', '--max-parents', '--no-min-parents', '--no-max-parents',
    '--encoding', '--decorate-refs', '--decorate-refs-exclude', '--clear-decorations',
    '--ws-error-highlight', '--unified', '-U', '--inter-hunk-context',
  ]),
  show: new Set([
    '--oneline', '--graph', '--decorate', '--no-decorate', '--pretty', '--format',
    '--abbrev-commit', '--date', '--no-patch', '-s', '--stat', '--shortstat', '--numstat',
    '--name-only', '--name-status', '--raw', '-p', '-u', '--patch', '--no-color',
    '--color', '--word-diff', '--summary', '--compact-summary', '--show-signature',
    '--notes', '--no-notes', '--relative-date', '--submodule', '--expand-tabs',
    '--text', '-a', '-m', '--first-parent', '--unified', '-U', '--diff-filter',
    '--no-ext-diff', '--no-textconv', '--exit-code', '--quiet',
  ]),
  branch: new Set([
    '-l', '--list', '-a', '--all', '-r', '--remotes', '--show-current', '-v', '--verbose',
    '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--sort',
    '--format', '--column', '--no-column', '--omit-empty', '--no-abbrev', '--abbrev',
    '--color', '--no-color', '-i', '--ignore-case',
  ]),
  stash: new Set([
    '-p', '--patch', '--stat', '--oneline', '--name-only', '--name-status', '--format',
    '--pretty', '--date', '-n', '--max-count', '--no-color', '--color',
    '--no-decorate', '--abbrev-commit',
  ]),
};

/** Tìm subcommand git (bỏ qua `-C <path>` của flag global). */
function findGitSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-C') {
      i++;
      continue;
    }
    if (!args[i].startsWith('-')) {
      return { sub: args[i].toLowerCase(), rest: args.slice(i + 1) };
    }
  }
  return null;
}

/** Cờ đơn/gộp/giá-trị-gắn-liền có nằm trong allowlist của subcommand không. */
function isAllowedGitAutoFlag(sub, arg) {
  const table = GIT_AUTO_APPROVE_FLAGS[sub];
  if (!table) return false;
  if (arg === '--') return true;
  if (arg.startsWith('--')) return table.has(flagName(arg));
  if (/^-\d+$/.test(arg)) return true; // git log -5
  if (/^-[SUG].+$/.test(arg)) return true; // -S"term", -G"re", -U3
  if (/^-[a-zA-Z]{2,}$/.test(arg)) {
    // cờ gộp kiểu -sb: từng ký tự phải là cờ hợp lệ
    return arg
      .slice(1)
      .split('')
      .every((ch) => table.has(`-${ch}`));
  }
  return table.has(arg);
}

/**
 * Lệnh git đã compile có đủ điều kiện TỰ DUYỆT ở Smart mode không.
 * Chỉ trả true cho các dạng chỉ-đọc; mọi biến thể ghi (branch -D, remote add,
 * tag <name>, stash push, reflog expire…) đều rơi về "hỏi người dùng".
 *
 * @param {string[]} args argv sau `git` (kết quả compileShellCommand)
 * @returns {boolean}
 */
function isGitAutoApprovable(args) {
  const found = findGitSubcommand(args);
  if (!found) return false;
  const sub = found.sub;
  const rest = found.rest;
  if (!Object.prototype.hasOwnProperty.call(GIT_AUTO_APPROVE_FLAGS, sub)) return false;

  // stash chỉ tự duyệt `stash list` (push/pop/apply/drop/... là ghi).
  if (sub === 'stash') {
    return (
      rest.length > 0 &&
      rest[0].toLowerCase() === 'list' &&
      rest.slice(1).every((a) => isAllowedGitAutoFlag('stash', a))
    );
  }

  // branch: `git branch <name>` là TẠO nhánh → chỉ auto khi ở chế độ list.
  if (sub === 'branch') {
    const listModeFlags = new Set([
      '-l', '--list', '--contains', '--no-contains', '--merged', '--no-merged',
      '--points-at', '--sort', '--format', '--column', '--no-column',
    ]);
    const listMode = rest.some((a) => listModeFlags.has(flagName(a)));
    const nonFlags = rest.filter((a) => a !== '--' && !a.startsWith('-'));
    if (nonFlags.length > 0 && !listMode) return false;
    return rest.every(
      (a) => a === '--' || isAllowedGitAutoFlag('branch', a) || (listMode && !a.startsWith('-')),
    );
  }

  // status/log/diff/show: cờ theo allowlist; tham số không phải flag là
  // ref/pathspec (chỉ đọc), nên vẫn cho qua.
  return rest.every((a) => a === '--' || !a.startsWith('-') || isAllowedGitAutoFlag(sub, a));
}

module.exports = {
  PolicyError,
  tokenizeCommandLine,
  compileShellCommand,
  isGitAutoApprovable,
  getSafeEnv,
  killProcessTree,
  resolveBinaryAbsolute,
  buildSafePath,
  SYSTEM_BIN_DIRS,
};
