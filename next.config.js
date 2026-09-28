/**
 * A8-CSP (CRITIQUE_RECONCILIATION §A8): app local-first — XSS ở tầng render
 * (GFM/KaTeX/Prism) đọc được toàn bộ IndexedDB. Sanitizer đã chạy trước
 * KaTeX; CSP là lớp phòng thủ thứ hai bắt buộc.
 *
 * Ngoại lệ bắt buộc (đã khảo sát thật của app):
 * - `'unsafe-inline'` cho script: khối chống flash theme ở app/layout.tsx
 *   phải chạy TRƯỚC hydrate (không nonce được vì headers() tĩnh).
 * - `'unsafe-eval'` ở dev: React/Next dev overlay đòi hỏi.
 * - fonts.googleapis.com: Pixelify Sans load qua <link> ở layout.
 * - connect-src *: BYOK (x-api-base do user cấu hình) + bridge desktop
 *   (127.0.0.1:<port>) + gateway tuỳ ý — thiết kế hiện tại gửi key từ
 *   renderer (CRITIQUE_RECONCILIATION A8(b), quyết định kiến trúc riêng).
 * - worker-src blob: / child-src blob:: KaTeX/Prism và thư viện render có
 *   thể tạo worker; 'self' cho service worker /sw.js.
 * - frame-ancestors 'none': chống clickjacking (app không nhúng iframe nào).
 * - object-src 'none', base-uri 'self', form-action 'self': chuẩn hardening.
 */
const isDev = process.env.NODE_ENV === 'development';

const CSP = [
  "default-src 'self'",
  // strict-dynamic không dùng được với 'unsafe-inline' tĩnh — chấp nhận inline
  // cho khối theme; sanitizer + hydration là tuyến chính ở dev.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  // KaTeX chèn style inline khi render công thức.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // Markdown render ảnh từ web (sanitizer đã lọc scheme) + data URI inline.
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  // BYOK + desktop bridge + provider tuỳ ý — xem ghi chú kiến trúc A8(b).
  "connect-src *",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Vyen desktop (Electron) mở app qua http://127.0.0.1:<port> trong khi
     server dev quảng bá localhost — Next 16 mặc định chặn dev resource
     cross-origin ("Blocked cross-origin request to Next.js dev resource").
     Cho phép cả hai tên máy cục bộ để shell không mất chunk JS. */
  allowedDevOrigins: ['127.0.0.1', 'localhost', '*.monkeycode-ai.live'],

  /* Dự án nằm trong Downloads trên filesystem mà Next cảnh báo "Slow
     filesystem" (~400-550ms). Với mặc định 'auto', Turbopack sau khi snapshot
     cache ra đĩa sẽ 'evict' bản trong RAM rồi phải đọc lại từ đĩa mỗi lần —
     đọc lại trên đĩa chậm thì tệ hơn nhiều so với giữ trong RAM.
     `false` = không evict, cache nằm trong RAM suốt đời process.

     Chỉ có tác dụng ở `next dev` khi FileSystem Cache bật (mặc định từ 16.1+).
     Đánh đổi: giữ cache trong RAM tốn RAM hơn — `.next/dev` của repo này
     lớn ~442MB, nên nếu máy thiếu RAM thì bỏ mục này lại. */
  experimental: {
    turbopackMemoryEviction: false,
  },

  /* A8-CSP: áp cho mọi route — header tĩnh, không cần async vì không dùng
     nonce (khối chống flash theme ở app/layout.tsx dùng 'unsafe-inline'). */
  headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
