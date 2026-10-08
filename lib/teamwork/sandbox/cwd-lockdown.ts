/**
 * Working Directory (CWD) Lockdown.
 * Enforces strict workspace boundary pinning, preventing child processes or file operations from escaping root.
 */

import path from 'node:path';
import { isWithinRoot, resolveWithin } from '@/lib/path-guard.cjs';

export class CwdLockdownViolationError extends Error {
  public readonly workspaceRoot: string;
  public readonly attemptedPath: string;

  constructor(workspaceRoot: string, attemptedPath: string) {
    super(
      `CWD Lockdown Violation: target directory "${attemptedPath}" escapes workspaceRoot "${workspaceRoot}".`
    );
    this.name = 'CwdLockdownViolationError';
    this.workspaceRoot = workspaceRoot;
    this.attemptedPath = attemptedPath;
  }
}

export class CwdGuard {
  /**
   * Asserts that targetCwd resolves strictly within workspaceRoot.
   * Throws CwdLockdownViolationError if escaping.
   * Returns normalized absolute path within boundary.
   */
  public static assertWithinLockdown(workspaceRoot: string, targetCwd?: string): string {
    const rootAbs = path.resolve(workspaceRoot);
    const resolvedCwd = targetCwd ? path.resolve(rootAbs, targetCwd) : rootAbs;

    // Windows drive-letter / UNC paths phải bị chặn trên POSIX:
    // trên POSIX, `path.resolve` biến chúng thành một tên thư mục hợp lệ
    // (`C:\Windows\System32`) nên dễ bỏ lọt traversal encoded. Test B8 yêu cầu
    // đúng hành vi này.
    if (process.platform !== 'win32') {
      const raw = targetCwd ?? '';
      const isWindowsAbsolute =
        /^[a-zA-Z]:[\\/]+/.test(raw) || // C:\... / C:\\... / C:/...
        /^\\\\[^\/\\]+[\\/]/.test(raw); // \\server\share\...
      if (isWindowsAbsolute) {
        throw new CwdLockdownViolationError(rootAbs, targetCwd ?? resolvedCwd);
      }
    }

    // 1. Kiểm tra lexical: so theo path separator thật (một `rel.startsWith('..')`
    //    thuần cũng từ chối nhầm sibling trong workspace tên bắt đầu bằng dấu chấm,
    //    ví dụ `<root>/..foo`).
    if (!isWithinRoot(rootAbs, resolvedCwd)) {
      throw new CwdLockdownViolationError(rootAbs, targetCwd ?? resolvedCwd);
    }

    // 2. Canonical realpath jail: symlink nằm trong workspace nhưng trỏ ra ngoài
    //    phải bị chặn (bản cũ chỉ so lexical nên lọt). Dùng chung `resolveWithin`
    //    với mọi đường fs/shell khác — đồng thời chặn luôn .git/** và
    //    node_modules/** theo chính sách hiện hành.
    const rel = path.relative(rootAbs, resolvedCwd) || '.';
    try {
      resolveWithin(rootAbs, rel);
    } catch {
      throw new CwdLockdownViolationError(rootAbs, targetCwd ?? resolvedCwd);
    }

    return resolvedCwd;
  }

  /**
   * Tests whether targetPath is safely within workspaceRoot without throwing.
   */
  public static isWithinLockdown(workspaceRoot: string, targetPath: string): boolean {
    try {
      this.assertWithinLockdown(workspaceRoot, targetPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitizes and normalizes a relative path within workspace root.
   */
  public static sanitizeRelativePath(workspaceRoot: string, relPath: string): string {
    const absPath = this.assertWithinLockdown(workspaceRoot, relPath);
    return path.relative(path.resolve(workspaceRoot), absPath).replace(/\\/g, '/');
  }
}
