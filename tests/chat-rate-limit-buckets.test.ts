/**
 * Hợp đồng rate limit /api/chat sau khi bỏ throttle kiểu web-chat.
 *
 * Vyen là harness agent coding local-first: mỗi tool call client (fs_*, shell,
 * git) resubmit MỘT POST /api/chat, nên KHÔNG được throttle request HỢP LỆ
 * theo phút — mọi coding agent (Claude Code, Codex CLI, Cline, Aider…) đều
 * không tự rate-limit vòng lặp của mình. Chỉ còn bucket chống brute-force
 * ACCESS_CODE: request SAI/THIẾU mã bị đếm (mã đúng không tốn quota).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/security', () => ({
  checkSameOrigin: () => true,
  getClientIp: () => '1.2.3.4',
  checkRateLimit: vi.fn(),
  verifyAccessAuth: vi.fn(),
}));

import { POST } from '@/app/api/chat/route';
import { checkRateLimit, verifyAccessAuth } from '@/lib/security';

const checkRateLimitMock = vi.mocked(checkRateLimit);
const verifyAccessAuthMock = vi.mocked(verifyAccessAuth);

const OK_LIMIT = {
  ok: true,
  allowed: true,
  limit: 0,
  remaining: 0,
  resetAt: 0,
  retryAfterSec: 0,
} as never;

/** Model đã ngừng → route trả 410 ngay sau parse, không chạm upstream. */
const RETIRED_MODEL = 'flux-pro';

function request(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'xin chào' }],
      agentTools: false,
      ...body,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyAccessAuthMock.mockReturnValue({ ok: true, authorized: true } as never);
  checkRateLimitMock.mockReturnValue(OK_LIMIT);
});

afterEach(() => vi.clearAllMocks());

describe('rate limit /api/chat — không throttle vòng lặp agent', () => {
  it('request HỢP LỆ không bị rate-limit (resubmit fs_*/shell chạy tự do)', async () => {
    const res = await POST(request({ model: RETIRED_MODEL }));
    // 410 nằm SAU tầng bảo vệ ⇒ request đã đi qua, không dính 429.
    expect(res.status).toBe(410);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it('request HỢP LỆ cũng không bị đếm khi có key BYOK', async () => {
    const res = await POST(request({ model: RETIRED_MODEL }, { 'x-api-key': 'sk-test-key' }));
    expect(res.status).toBe(410);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it('mã SAI → đếm vào bucket chat-auth (chống brute-force)', async () => {
    verifyAccessAuthMock.mockReturnValue({
      ok: false,
      authorized: false,
      status: 401,
      error: 'sai mã',
    } as never);

    const res = await POST(request({ model: RETIRED_MODEL }));
    expect(res.status).toBe(401);

    const [key, limit] = checkRateLimitMock.mock.calls[0];
    expect(String(key).startsWith('chat-auth:')).toBe(true);
    expect(Number(limit)).toBeGreaterThan(0);
  });

  it('mã SAI vượt trần → 429 kèm Retry-After', async () => {
    verifyAccessAuthMock.mockReturnValue({
      ok: false,
      authorized: false,
      status: 401,
      error: 'sai mã',
    } as never);
    checkRateLimitMock.mockReturnValue({
      ok: false,
      allowed: false,
      limit: 0,
      remaining: 0,
      resetAt: 0,
      retryAfterSec: 7,
    } as never);

    const res = await POST(request({ model: RETIRED_MODEL }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
  });
});
