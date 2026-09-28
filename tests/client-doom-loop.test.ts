import { beforeEach, describe, expect, it } from 'vitest';

import {
  __clearAllClientDoomLoops,
  checkClientDoomLoop,
  clientToolSignature,
} from '@/lib/client-doom-loop';
import { DOOM_LOOP_THRESHOLD } from '@/lib/tool-limits';

describe('clientToolSignature', () => {
  it('gồm tên tool + args — đọc file khác nhau thì chữ ký khác nhau', () => {
    const a = clientToolSignature('fs_read', { path: 'src/a.ts' });
    const b = clientToolSignature('fs_read', { path: 'src/b.ts' });
    const c = clientToolSignature('fs_list', { path: 'src' });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('cùng tool cùng args → cùng chữ ký', () => {
    expect(clientToolSignature('fs_read', { path: 'a.ts' })).toBe(
      clientToolSignature('fs_read', { path: 'a.ts' }),
    );
  });
});

describe('checkClientDoomLoop — guard tool client (fs_*/shell/git)', () => {
  beforeEach(() => {
    __clearAllClientDoomLoops();
  });

  it('đọc N file khác nhau liên tiếp → không bao giờ bị chặn', () => {
    for (let i = 0; i < 20; i += 1) {
      const v = checkClientDoomLoop('chat-1', clientToolSignature('fs_read', { path: `f${i}.ts` }));
      expect(v.blocked).toBe(false);
    }
  });

  it('lặp Y HỆT cùng call tới ngưỡng → bị chặn ở lần DOOM_LOOP_THRESHOLD', () => {
    const sig = clientToolSignature('fs_read', { path: 'same.ts' });
    for (let i = 1; i < DOOM_LOOP_THRESHOLD; i += 1) {
      expect(checkClientDoomLoop('chat-1', sig).blocked).toBe(false);
    }
    const blocked = checkClientDoomLoop('chat-1', sig);
    expect(blocked.blocked).toBe(true);
    expect(blocked.counted).toBe(DOOM_LOOP_THRESHOLD);
  });

  it('call khác xen vào → chuỗi reset, call gốc chạy lại bình thường', () => {
    const a = clientToolSignature('fs_read', { path: 'a.ts' });
    const b = clientToolSignature('shell_run', { command: 'npm test' });
    for (let i = 0; i < DOOM_LOOP_THRESHOLD - 1; i += 1) {
      checkClientDoomLoop('chat-1', a);
    }
    checkClientDoomLoop('chat-1', b); // xen vào
    const v = checkClientDoomLoop('chat-1', a);
    expect(v.blocked).toBe(false);
    expect(v.counted).toBe(1);
  });

  it('call bị chặn KHÔNG kéo dài chuỗi — vẫn báo đúng mép ngưỡng', () => {
    const sig = clientToolSignature('fs_read', { path: 'stuck.ts' });
    for (let i = 1; i < DOOM_LOOP_THRESHOLD; i += 1) {
      checkClientDoomLoop('chat-1', sig);
    }
    // Bị chặn nhiều lần liên tiếp — counted vẫn đúng ngưỡng, không phình.
    for (let i = 0; i < 5; i += 1) {
      const v = checkClientDoomLoop('chat-1', sig);
      expect(v.blocked).toBe(true);
      expect(v.counted).toBe(DOOM_LOOP_THRESHOLD);
    }
    // Model đổi hướng (call khác) → chuỗi reset.
    checkClientDoomLoop('chat-1', clientToolSignature('fs_list', { path: '' }));
    expect(checkClientDoomLoop('chat-1', sig).blocked).toBe(false);
  });

  it('hai hội thoại độc lập nhau', () => {
    const sig = clientToolSignature('fs_read', { path: 'x.ts' });
    for (let i = 1; i < DOOM_LOOP_THRESHOLD; i += 1) {
      checkClientDoomLoop('chat-A', sig);
    }
    expect(checkClientDoomLoop('chat-A', sig).blocked).toBe(true);
    expect(checkClientDoomLoop('chat-B', sig).blocked).toBe(false);
  });
});
