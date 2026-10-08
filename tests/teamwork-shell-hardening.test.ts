/**
 * tests/teamwork-shell-hardening.test.ts
 *
 * Regression cho đợt vá audit sandbox (2026-10-08):
 * - Mục 5: `CwdGuard` realpath jail — symlink trong workspace trỏ ra ngoài phải bị chặn.
 * - Mục 6: shellRun / executeSandboxed dùng SAFE_ENV allowlist (getSafeEnv) —
 *   biến bí mật kiểu VYEN_* / GH_TOKEN không còn lọt vào tiến trình con.
 * - Mục 7: timeout diệt cả cây tiến trình (spawn detached + process group).
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { HeadlessToolRunner } from '../lib/teamwork/tools';
import {
  CwdGuard,
  CwdLockdownViolationError,
  SandboxedProcessManager,
} from '../lib/teamwork/sandbox';

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirs.splice(0).map(async (dir) => {
      try {
        await fsp.rm(dir, { recursive: true, force: true });
      } catch {
        /* dọn dẹp best-effort */
      }
    }),
  );
});

describe('CwdGuard — canonical realpath jail (Mục 5)', () => {
  it('chặn symlink trong workspace trỏ ra ngoài', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'vyen-cwd-root-'));
    const outside = await fsp.mkdtemp(path.join(os.tmpdir(), 'vyen-cwd-outside-'));
    cleanupDirs.push(root, outside);
    await fsp.writeFile(path.join(outside, 'TOP-SECRET.txt'), 'secret', 'utf8');
    await fsp.symlink(outside, path.join(root, 'escape-link'), 'dir');

    expect(() => CwdGuard.assertWithinLockdown(root, 'escape-link')).toThrow(
      CwdLockdownViolationError,
    );
    expect(CwdGuard.isWithinLockdown(root, 'escape-link')).toBe(false);
  });

  it('vẫn cho thư mục thật trong workspace, chặn .git/node_modules/..', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'vyen-cwd-root-'));
    cleanupDirs.push(root);
    await fsp.mkdir(path.join(root, 'src'), { recursive: true });
    await fsp.mkdir(path.join(root, '.git'), { recursive: true });
    await fsp.mkdir(path.join(root, 'node_modules'), { recursive: true });

    expect(CwdGuard.assertWithinLockdown(root, 'src')).toBe(path.join(root, 'src'));
    expect(CwdGuard.isWithinLockdown(root, '..')).toBe(false);
    expect(CwdGuard.isWithinLockdown(root, '.git')).toBe(false);
    expect(CwdGuard.isWithinLockdown(root, 'node_modules')).toBe(false);
  });
});

describe('SAFE_ENV allowlist cho tiến trình con teamwork (Mục 6)', () => {
  const secretProbe = `node -e "console.log(JSON.stringify([process.env.VYEN_BRIDGE_TOKEN, process.env.OPENROUTER_API_KEY, process.env.GH_TOKEN, process.env.SSH_AUTH_SOCK]))"`;

  it('shellRun không truyền biến bí mật của process xuống lệnh con', async () => {
    process.env.VYEN_BRIDGE_TOKEN = 'secret-bridge-token';
    process.env.OPENROUTER_API_KEY = 'sk-secret-openrouter';
    process.env.GH_TOKEN = 'gh-secret';
    try {
      const runner = new HeadlessToolRunner({ workspaceRoot: process.cwd() });
      const result = await runner.shellRun(secretProbe);

      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe('[null,null,null,null]');
      expect(result.stdout).not.toContain('secret');
    } finally {
      delete process.env.VYEN_BRIDGE_TOKEN;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GH_TOKEN;
    }
  });

  it('executeSandboxed cũng lọc biến bí mật kiểu VYEN_*', async () => {
    process.env.VYEN_BRIDGE_TOKEN = 'secret-bridge-token';
    try {
      const result = await SandboxedProcessManager.executeSandboxed(process.cwd(), {
        command: secretProbe,
        timeoutMs: 5000,
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toBe('[null,null,null,null]');
      expect(result.stdout).not.toContain('secret');
    } finally {
      delete process.env.VYEN_BRIDGE_TOKEN;
    }
  });
});

describe('Timeout diệt cây tiến trình của shellRun (Mục 7)', () => {
  it.skipIf(process.platform === 'win32')(
    'tiến trình con (cháu) chết theo process group khi shellRun hết hạn',
    async () => {
      const runner = new HeadlessToolRunner({ workspaceRoot: process.cwd() });
      const result = await runner.shellRun('sleep 30 & echo $!; wait', undefined, 600);

      expect(result.code).toBe(124);
      const pid = Number((result.stdout.match(/\d+/) ?? [])[0]);
      expect(Number.isInteger(pid) && pid > 0).toBe(true);

      /* Trước đợt vá (spawn không detached), `process.kill(-pid)` thất bại nên
         chỉ shell bị giết, `sleep` sống tiếp ở trạng thái S. Sau khi vá, cả
         group chết — pid biến mất hoặc chỉ còn zombie (Z) chờ reap. */
      const deadline = Date.now() + 3000;
      let stillAlive = true;
      while (Date.now() < deadline) {
        try {
          const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
          const state = stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3);
          if (state === 'Z' || state === 'X') {
            stillAlive = false;
            break;
          }
        } catch {
          stillAlive = false;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(stillAlive).toBe(false);
    },
    15_000,
  );
});
