import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireDiskLock } from '../lib/file-lock';
import { FileLockManager, normalizeLockPath } from '../lib/teamwork/file-lock';

describe('normalizeLockPath', () => {
  it('normalizes standard posix paths', () => {
    expect(normalizeLockPath('lib/teamwork/types.ts')).toBe('lib/teamwork/types.ts');
  });

  it('normalizes windows backslashes to forward slashes', () => {
    expect(normalizeLockPath('lib\\teamwork\\types.ts')).toBe('lib/teamwork/types.ts');
    expect(normalizeLockPath('src\\components\\ui\\button.tsx')).toBe('src/components/ui/button.tsx');
  });

  it('strips redundant leading ./ and / and trailing slashes', () => {
    expect(normalizeLockPath('./lib/teamwork/types.ts')).toBe('lib/teamwork/types.ts');
    expect(normalizeLockPath('.\\lib\\teamwork\\types.ts')).toBe('lib/teamwork/types.ts');
    expect(normalizeLockPath('/lib/teamwork/types.ts/')).toBe('lib/teamwork/types.ts');
    expect(normalizeLockPath('///lib///teamwork///types.ts///')).toBe('lib/teamwork/types.ts');
  });

  it('resolves relative segments like . and .. safely', () => {
    expect(normalizeLockPath('lib/foo/../teamwork/types.ts')).toBe('lib/teamwork/types.ts');
    expect(normalizeLockPath('lib/./teamwork/./types.ts')).toBe('lib/teamwork/types.ts');
  });

  it('normalizes case for cross-platform and NTFS collision safety', () => {
    expect(normalizeLockPath('Lib/Teamwork/Types.TS')).toBe('lib/teamwork/types.ts');
    expect(normalizeLockPath('C:\\Project\\Lib\\A.ts', 'C:/Project')).toBe('lib/a.ts');
  });

  it('strips workspaceRoot prefix when provided', () => {
    const root = 'C:/projects/vyen';
    expect(normalizeLockPath('C:/projects/vyen/lib/teamwork/types.ts', root)).toBe(
      'lib/teamwork/types.ts'
    );
    expect(normalizeLockPath('C:\\projects\\vyen\\lib\\teamwork\\types.ts', root)).toBe(
      'lib/teamwork/types.ts'
    );
  });

  it('không cắt nhầm workspaceRoot khi path chỉ trùng TIỀN TỐ với root', () => {
    const root = '/a/proj';

    // "/a/project" KHÔNG nằm trong "/a/proj" dù chuỗi là prefix của nhau
    expect(normalizeLockPath('/a/project/src/a.ts', root)).toBe('a/project/src/a.ts');

    // Path nằm thật sự trong root thì vẫn phải được cắt bỏ root
    expect(normalizeLockPath('/a/proj/src/a.ts', root)).toBe('src/a.ts');

    // Hệ quả quan trọng: hai file hoàn toàn khác nhau không được gộp về cùng một lock key
    expect(normalizeLockPath('/a/proj/src/a.ts', root)).not.toBe(
      normalizeLockPath('/a/project/src/a.ts', root),
    );
  });

  it('không cắt root khi path nằm ngoài root dù dùng backslash và khác hoa/thường', () => {
    const root = 'C:/projects/vyen';
    expect(normalizeLockPath('C:\\projects\\vyen-other\\lib\\a.ts', root)).toBe(
      'c:/projects/vyen-other/lib/a.ts',
    );
    expect(normalizeLockPath('C:\\PROJECTS\\VYEN\\lib\\a.ts', root)).toBe('lib/a.ts');
  });

  it('handles empty and whitespace inputs gracefully', () => {
    expect(normalizeLockPath('')).toBe('');
    expect(normalizeLockPath('   ')).toBe('');
  });
});

describe('FileLockManager — Exclusive File Ownership', () => {
  it('successfully acquires locks on free files', () => {
    const lockMgr = new FileLockManager();
    const files = ['lib/a.ts', 'lib/b.ts'];

    expect(lockMgr.canAcquire('worker-1', files)).toBe(true);
    lockMgr.acquire('worker-1', files);

    expect(lockMgr.isLocked('lib/a.ts')).toBe(true);
    expect(lockMgr.isLocked('lib/b.ts')).toBe(true);
    expect(lockMgr.isLocked('lib/c.ts')).toBe(false);

    expect(lockMgr.getLockOwner('lib/a.ts')).toBe('worker-1');
    expect(lockMgr.getLockOwner('lib/b.ts')).toBe('worker-1');
    expect(lockMgr.getLockOwner('lib/c.ts')).toBeUndefined();
  });

  it('detects conflicts across different path representations', () => {
    const lockMgr = new FileLockManager();
    lockMgr.acquire('worker-1', ['lib/teamwork/types.ts']);

    // Same file with backslashes
    expect(lockMgr.isLocked('lib\\teamwork\\types.ts')).toBe(true);
    expect(lockMgr.canAcquire('worker-2', ['lib\\teamwork\\types.ts'])).toBe(false);

    // Same file with case variation
    expect(lockMgr.isLocked('LIB/TEAMWORK/TYPES.TS')).toBe(true);
    expect(lockMgr.canAcquire('worker-2', ['LIB/TEAMWORK/TYPES.TS'])).toBe(false);

    // Same file with ./ prefix
    expect(lockMgr.canAcquire('worker-2', ['./lib/teamwork/types.ts'])).toBe(false);

    // Attempting to acquire throws conflict error
    expect(() => {
      lockMgr.acquire('worker-2', ['lib\\teamwork\\types.ts']);
    }).toThrow(/File lock conflict/);
  });

  it('enforces atomic acquisition — rolls back/aborts if any file is locked', () => {
    const lockMgr = new FileLockManager();
    lockMgr.acquire('worker-1', ['lib/shared.ts']);

    // worker-2 tries to acquire free file1.ts AND locked shared.ts
    expect(lockMgr.canAcquire('worker-2', ['lib/file1.ts', 'lib/shared.ts'])).toBe(false);

    expect(() => {
      lockMgr.acquire('worker-2', ['lib/file1.ts', 'lib/shared.ts']);
    }).toThrow(/File lock conflict/);

    // file1.ts must NOT have been locked by worker-2
    expect(lockMgr.isLocked('lib/file1.ts')).toBe(false);
    expect(lockMgr.getLockOwner('lib/file1.ts')).toBeUndefined();
    expect(lockMgr.getActiveWorkers()).not.toContain('worker-2');
  });

  it('allows same worker to re-acquire or expand its own file locks', () => {
    const lockMgr = new FileLockManager();
    lockMgr.acquire('worker-1', ['lib/a.ts']);

    // Re-acquiring same file by same worker is allowed (idempotent)
    expect(lockMgr.canAcquire('worker-1', ['lib/a.ts'])).toBe(true);
    expect(() => lockMgr.acquire('worker-1', ['lib/a.ts', 'lib/b.ts'])).not.toThrow();

    expect(lockMgr.isLocked('lib/a.ts')).toBe(true);
    expect(lockMgr.isLocked('lib/b.ts')).toBe(true);
    expect(lockMgr.getActiveWorkers()).toEqual(['worker-1']);
  });

  it('handles duplicate file representations within the same acquire call', () => {
    const lockMgr = new FileLockManager();
    expect(() => {
      lockMgr.acquire('worker-1', ['lib/a.ts', 'lib\\a.ts', './lib/a.ts', 'LIB/A.TS']);
    }).not.toThrow();

    expect(lockMgr.getActiveLocks().size).toBe(1);
    expect(lockMgr.getLockOwner('lib/a.ts')).toBe('worker-1');
  });
});

describe('FileLockManager — Concurrency Ceiling (Max 2 Parallel Workers)', () => {
  it('allows 2 disjoint workers to run concurrently', () => {
    const lockMgr = new FileLockManager(2);

    expect(lockMgr.canAcquire('worker-1', ['lib/a.ts'])).toBe(true);
    lockMgr.acquire('worker-1', ['lib/a.ts']);

    expect(lockMgr.canAcquire('worker-2', ['lib/b.ts'])).toBe(true);
    lockMgr.acquire('worker-2', ['lib/b.ts']);

    expect(lockMgr.getActiveWorkers().sort()).toEqual(['worker-1', 'worker-2']);
    expect(lockMgr.getActiveLocks().size).toBe(2);
  });

  it('strictly blocks a 3rd worker when concurrency cap of 2 is reached', () => {
    const lockMgr = new FileLockManager(2);
    lockMgr.acquire('worker-1', ['lib/a.ts']);
    lockMgr.acquire('worker-2', ['lib/b.ts']);

    // worker-3 touches completely disjoint lib/c.ts, but cap is reached!
    expect(lockMgr.canAcquire('worker-3', ['lib/c.ts'])).toBe(false);
    expect(() => {
      lockMgr.acquire('worker-3', ['lib/c.ts']);
    }).toThrow(/Concurrency limit reached/);

    // Existing active workers are unaffected
    expect(lockMgr.getActiveWorkers().sort()).toEqual(['worker-1', 'worker-2']);
    expect(lockMgr.isLocked('lib/c.ts')).toBe(false);
  });

  it('allows an already active worker to acquire more files even when concurrency cap is reached', () => {
    const lockMgr = new FileLockManager(2);
    lockMgr.acquire('worker-1', ['lib/a.ts']);
    lockMgr.acquire('worker-2', ['lib/b.ts']);

    // worker-1 is already 1 of the 2 active workers, acquiring another free file does not increase active workers
    expect(lockMgr.canAcquire('worker-1', ['lib/extra.ts'])).toBe(true);
    expect(() => lockMgr.acquire('worker-1', ['lib/extra.ts'])).not.toThrow();

    expect(lockMgr.getActiveWorkers().length).toBe(2);
    expect(lockMgr.getLockOwner('lib/extra.ts')).toBe('worker-1');
  });

  it('partial release giải phóng đúng slot khi worker không còn giữ file nào', () => {
    const lockMgr = new FileLockManager(2);
    lockMgr.acquire('worker-1', ['lib/a.ts', 'lib/b.ts']);
    lockMgr.acquire('worker-2', ['lib/c.ts']);

    // Chạm cap: worker mới bị chặn
    expect(lockMgr.canAcquire('worker-3', ['lib/d.ts'])).toBe(false);

    // worker-1 nhả 1 file nhưng vẫn còn file khác → vẫn giữ slot
    lockMgr.release('worker-1', ['lib/a.ts']);
    expect(lockMgr.getWorkerFiles('worker-1')).toEqual(['lib/b.ts']);
    expect(lockMgr.getActiveWorkers().sort()).toEqual(['worker-1', 'worker-2']);
    expect(lockMgr.canAcquire('worker-3', ['lib/d.ts'])).toBe(false);

    // worker-1 nhả nốt file cuối cùng → slot phải được trả lại
    lockMgr.release('worker-1', ['lib/b.ts']);
    expect(lockMgr.getActiveWorkers()).toEqual(['worker-2']);
    expect(lockMgr.isLocked('lib/a.ts')).toBe(false);
    expect(lockMgr.isLocked('lib/b.ts')).toBe(false);

    // worker mới phải vào được ngay
    expect(lockMgr.canAcquire('worker-3', ['lib/d.ts'])).toBe(true);
    lockMgr.acquire('worker-3', ['lib/d.ts']);
    expect(lockMgr.getActiveWorkers().sort()).toEqual(['worker-2', 'worker-3']);
  });

  it('partial release qua releaseFile() cũng trả lại slot concurrency', () => {
    const lockMgr = new FileLockManager(2);
    lockMgr.acquire('worker-1', ['lib/a.ts']);
    lockMgr.acquire('worker-2', ['lib/b.ts']);
    expect(lockMgr.canAcquire('worker-3', ['lib/c.ts'])).toBe(false);

    expect(lockMgr.releaseFile('worker-1', 'lib/a.ts')).toBe(true);
    expect(lockMgr.getActiveWorkers()).toEqual(['worker-2']);
    expect(lockMgr.canAcquire('worker-3', ['lib/c.ts'])).toBe(true);
    lockMgr.acquire('worker-3', ['lib/c.ts']);
    expect(lockMgr.getActiveWorkers().sort()).toEqual(['worker-2', 'worker-3']);
  });

  it('double release là idempotent và không làm hỏng state', () => {
    const lockMgr = new FileLockManager(2);
    lockMgr.acquire('worker-1', ['lib/a.ts']);
    lockMgr.acquire('worker-2', ['lib/b.ts']);

    lockMgr.release('worker-1', ['lib/a.ts']);
    // Gọi lại lần nữa (partial + releaseFile + full release) không được ném lỗi
    expect(() => {
      lockMgr.release('worker-1', ['lib/a.ts']);
      expect(lockMgr.releaseFile('worker-1', 'lib/a.ts')).toBe(false);
      lockMgr.release('worker-1');
    }).not.toThrow();

    // State phải nhất quán: worker-1 biến mất hoàn toàn, worker-2 nguyên vẹn
    expect(lockMgr.getActiveWorkers()).toEqual(['worker-2']);
    expect(lockMgr.getWorkerFiles('worker-1')).toEqual([]);
    expect(lockMgr.getActiveLocks().size).toBe(1);
    expect(lockMgr.getLockOwner('lib/b.ts')).toBe('worker-2');
    expect(lockMgr.isLocked('lib/a.ts')).toBe(false);

    // Slot không bị đốt cháy: vẫn còn đúng 1 slot trống
    expect(lockMgr.canAcquire('worker-3', ['lib/c.ts'])).toBe(true);
    lockMgr.acquire('worker-3', ['lib/c.ts']);
    expect(lockMgr.getActiveWorkers().sort()).toEqual(['worker-2', 'worker-3']);
    expect(lockMgr.getActiveLocks().size).toBe(2);
  });

  it('allows 3rd worker to acquire as soon as one worker releases', () => {
    const lockMgr = new FileLockManager(2);
    lockMgr.acquire('worker-1', ['lib/a.ts']);
    lockMgr.acquire('worker-2', ['lib/b.ts']);

    // worker-1 releases
    lockMgr.release('worker-1');
    expect(lockMgr.getActiveWorkers()).toEqual(['worker-2']);
    expect(lockMgr.isLocked('lib/a.ts')).toBe(false);

    // worker-3 can now acquire
    expect(lockMgr.canAcquire('worker-3', ['lib/c.ts'])).toBe(true);
    lockMgr.acquire('worker-3', ['lib/c.ts']);
    expect(lockMgr.getActiveWorkers().sort()).toEqual(['worker-2', 'worker-3']);
  });
});

describe('FileLockManager — Release and Query APIs', () => {
  it('releases all files for a worker on release()', () => {
    const lockMgr = new FileLockManager();
    lockMgr.acquire('worker-1', ['lib/a.ts', 'lib/b.ts']);
    expect(lockMgr.getActiveLocks().size).toBe(2);

    lockMgr.release('worker-1');
    expect(lockMgr.getActiveLocks().size).toBe(0);
    expect(lockMgr.getActiveWorkers().length).toBe(0);
    expect(lockMgr.isLocked('lib/a.ts')).toBe(false);
    expect(lockMgr.isLocked('lib/b.ts')).toBe(false);
  });

  it('releases individual files via releaseFile()', () => {
    const lockMgr = new FileLockManager();
    lockMgr.acquire('worker-1', ['lib/a.ts', 'lib/b.ts']);

    expect(lockMgr.releaseFile('worker-1', 'lib/a.ts')).toBe(true);
    expect(lockMgr.isLocked('lib/a.ts')).toBe(false);
    expect(lockMgr.isLocked('lib/b.ts')).toBe(true);
    expect(lockMgr.getActiveWorkers()).toEqual(['worker-1']);

    // Another worker can now acquire lib/a.ts
    expect(lockMgr.canAcquire('worker-2', ['lib/a.ts'])).toBe(true);
    lockMgr.acquire('worker-2', ['lib/a.ts']);
    expect(lockMgr.getLockOwner('lib/a.ts')).toBe('worker-2');

    // Releasing b unregisters worker-1
    expect(lockMgr.releaseFile('worker-1', 'lib/b.ts')).toBe(true);
    expect(lockMgr.getActiveWorkers()).toEqual(['worker-2']);
  });

  it('rejects releaseFile() if called by wrong worker or non-existent file', () => {
    const lockMgr = new FileLockManager();
    lockMgr.acquire('worker-1', ['lib/a.ts']);

    expect(lockMgr.releaseFile('worker-2', 'lib/a.ts')).toBe(false);
    expect(lockMgr.releaseFile('worker-1', 'lib/nonexistent.ts')).toBe(false);
    expect(lockMgr.isLocked('lib/a.ts')).toBe(true);
  });

  it('provides getDetailedLocks() with timestamp and original path', () => {
    const lockMgr = new FileLockManager();
    lockMgr.acquire('worker-1', ['lib\\MyPath.ts']);

    const detailed = lockMgr.getDetailedLocks();
    const entry = detailed.get('lib/mypath.ts');
    expect(entry).toBeDefined();
    expect(entry?.filePath).toBe('lib\\MyPath.ts');
    expect(entry?.normalizedPath).toBe('lib/mypath.ts');
    expect(entry?.workerId).toBe('worker-1');
    expect(entry?.acquiredAt).toBeGreaterThan(0);
  });

  it('clears all state cleanly via clear()', () => {
    const lockMgr = new FileLockManager();
    lockMgr.acquire('worker-1', ['lib/a.ts']);
    lockMgr.acquire('worker-2', ['lib/b.ts']);

    lockMgr.clear();
    expect(lockMgr.getActiveWorkers()).toEqual([]);
    expect(lockMgr.getActiveLocks().size).toBe(0);
  });
});

describe('FileLockManager — Disjointness & Parallel Execution Verification', () => {
  it('correctly validates disjoint file sets', () => {
    const lockMgr = new FileLockManager();

    expect(lockMgr.canRunInParallel(['lib/a.ts', 'lib/b.ts'], ['lib/c.ts', 'lib/d.ts'])).toBe(true);
    expect(lockMgr.canRunInParallel(['lib/a.ts', 'lib/b.ts'], ['lib/b.ts', 'lib/c.ts'])).toBe(false);
    expect(lockMgr.canRunInParallel(['lib/a.ts'], ['lib\\a.ts'])).toBe(false);
    expect(lockMgr.canRunInParallel(['./lib/a.ts'], ['lib/a.ts'])).toBe(false);
  });

  it('verifies multi-set disjointness via verifyDisjoint()', () => {
    const lockMgr = new FileLockManager();

    expect(
      lockMgr.verifyDisjoint([
        ['lib/a.ts'],
        ['lib/b.ts'],
        ['lib/c.ts'],
      ])
    ).toBe(true);

    expect(
      lockMgr.verifyDisjoint([
        ['lib/a.ts', 'lib/b.ts'],
        ['lib/c.ts'],
        ['lib/b.ts'], // collision with first set
      ])
    ).toBe(false);
  });
});

/**
 * Test cho `lib/file-lock.ts` (lock workspace trên đĩa .vyen/.lock).
 * Dùng fs thật trong os.tmpdir() + fake timer để điều khiển nhịp heartbeat 5s.
 *
 * LƯU Ý (2026-09): `acquireDiskLock` của lib/file-lock.ts HIỆN CHƯA CÓ CONSUMER
 * THẬT — grep toàn repo chỉ ra tests/teamwork-file-lock.test.ts là file duy
 * nhất import nó. Đừng tưởng 4 test dưới đây đang bảo vệ một đường sống thật:
 * chúng chỉ là regression protection cho logic heartbeat/owner-pid (đã từng
 * đỏ khi đột biến kiểm tra owner-pid), và sẽ bảo vệ tiếp ngay khi ai đó nối
 * `acquireDiskLock` vào luồng chạy workspace.
 *
 * KHÁC với `lib/teamwork/file-lock.ts` (FileLockManager) — cái đó CÓ consumer
 * thật (lib/teamwork/engine.ts, tools.ts, cli.ts) và đã có bộ test riêng.
 */
describe('acquireDiskLock — heartbeat trên .vyen/.lock (lib/file-lock.ts, chưa có consumer)', () => {
  const OTHER_PID = process.pid + 1;
  let tmpDir: string;
  let lockPath: string;
  let releaseLock: (() => void) | undefined;

  /** Ghi đè .vyen/.lock để mô phỏng "process khác đã evict và chiếm lại lock". */
  const stealLock = (): void => {
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: OTHER_PID, acquiredAt: 1, heartbeatAt: 111 }),
    );
  };

  const readLock = (): { pid: number; heartbeatAt: number } =>
    JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid: number; heartbeatAt: number };

  beforeEach(() => {
    vi.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyen-disk-lock-'));
    lockPath = path.join(tmpDir, '.vyen', '.lock');
  });

  afterEach(() => {
    releaseLock?.();
    releaseLock = undefined;
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('chiếm lock và ghi heartbeat khi record vẫn thuộc về mình', async () => {
    releaseLock = await acquireDiskLock(tmpDir);

    const before = readLock();
    expect(before.pid).toBe(process.pid);

    vi.advanceTimersByTime(5_000);
    const after = readLock();
    expect(after.pid).toBe(process.pid);
    expect(after.heartbeatAt).toBeGreaterThan(before.heartbeatAt);
  });

  it('heartbeat KHÔNG ghi đè lock khi record đã thuộc về tiến trình khác (chống split-brain)', async () => {
    releaseLock = await acquireDiskLock(tmpDir);

    // Process bị freeze > 30s, process khác evict rồi chiếm lại lock
    stealLock();

    vi.advanceTimersByTime(5_000);
    const afterSteal = readLock();
    expect(afterSteal.pid).toBe(OTHER_PID);
    expect(afterSteal.heartbeatAt).toBe(111);

    // Heartbeat phải tự dừng: các tick sau cũng không được ghi gì
    fs.writeFileSync(lockPath, JSON.stringify({ pid: OTHER_PID, acquiredAt: 1, heartbeatAt: 222 }));
    vi.advanceTimersByTime(30_000);
    expect(readLock().heartbeatAt).toBe(222);
  });

  it('heartbeat không ghi gì khi file lock đã bị xoá', async () => {
    releaseLock = await acquireDiskLock(tmpDir);
    fs.rmSync(lockPath);

    expect(() => vi.advanceTimersByTime(30_000)).not.toThrow();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('release() không xoá lock của tiến trình khác và gọi hai lần vẫn an toàn', async () => {
    const release = await acquireDiskLock(tmpDir);
    stealLock();

    expect(() => {
      release();
      release();
    }).not.toThrow();

    expect(fs.existsSync(lockPath)).toBe(true);
    expect(readLock().pid).toBe(OTHER_PID);
  });
});

