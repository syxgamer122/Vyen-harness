/**
 * Hợp đồng: /api/chat KHÔNG còn tự throttle request.
 *
 * Vyen là harness agent coding local-first: mỗi tool call client (fs_*, shell,
 * git) resubmit MỘT POST /api/chat. Throttle request HỢP LỆ theo phút tức là tự
 * chặn vòng lặp agent giữa task — mọi coding agent (Claude Code, Codex CLI,
 * Cline, Aider…) đều không làm vậy, chúng tôn trọng 429 của nhà cung cấp rồi
 * backoff.
 *
 * Lỗi từng có: trần 20/phút trong khi CLIENT_MAX_STEPS cho phép một lượt refactor
 * 30-50 tool call ⇒ task hợp lệ bị chặn giữa chừng, client chỉ hiện toast "vui
 * lòng đợi vài giây".
 *
 * File này viết theo hướNG ĐẢO: khẳng định KHÔNG có limiter. Dán lại
 * `checkRateLimit` vào app/api/chat/route.ts là file này ĐỎ.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROUTE = path.resolve(__dirname, '../app/api/chat/route.ts');
const source = fs.readFileSync(ROUTE, 'utf8');

describe('/api/chat không tự throttle request hợp lệ', () => {
  it('route không import checkRateLimit', () => {
    // Điều kiện đảo: thêm lại import này là ĐỎ.
    expect(source).not.toMatch(/import \{[^}]*checkRateLimit[^}]*\} from '@\/lib\/security'/);
  });

  it('route không gọi checkRateLimit', () => {
    expect(source).not.toMatch(/checkRateLimit\s*\(/);
  });

  it('không còn mã lỗi RATE_LIMITED của ta', () => {
    // 429 VẪN xuất hiện trong route — nhưng là 429 từ PROVIDER (nằm trong
    // RETRYABLE_SAME_MODEL_STATUSES và nhánh diagnoseUpstreamError). Cái
    // bị gỡ là mã lỗi do limiter CỦA TA phát ra.
    expect(source).not.toMatch(/'RATE_LIMITED'/);
  });

  it('vẫn xử lý 429 từ provider (không mất failover)', () => {
    // Điều kiện đảo: xoá nhánh này là ĐỎ — 429 upstream là lỗi TẠM, phải
    // retry model khác chứ không phải lỗi của người dùng.
    expect(source).toMatch(/RETRYABLE_SAME_MODEL_STATUSES/);
    expect(source).toMatch(/UPSTREAM_RATE_LIMIT_429/);
  });

  it('vẫn còn guard thật: same-origin + body cap + schema', () => {
    // Đảo điều kiện: xoá hết các guard này là ĐỎ.
    expect(source).toMatch(/checkSameOrigin/);
    expect(source).toMatch(/MAX_BODY_BYTES/);
    expect(source).toMatch(/BodySchema\.safeParse/);
  });
});

describe('bridge giữ bucket chống brute-force token', () => {
  const bridge = fs.readFileSync(
    path.resolve(__dirname, '../app/api/bridge/route.ts'),
    'utf8',
  );

  it('/api/bridge vẫn đếm request sai token', () => {
    // Điều kiện đảo: gỡ checkRateLimit khỏi bridge là ĐỎ — đây là chống đoán
    // bridge-token 32 byte, KHÁC hẳn throttle request hợp lệ.
    expect(bridge).toMatch(/checkRateLimit\s*\(/);
  });

  it('bridge so sánh token bằng timingSafeEqual', () => {
    expect(bridge).toMatch(/verifyBridgeToken|timingSafeEqual/);
  });
});