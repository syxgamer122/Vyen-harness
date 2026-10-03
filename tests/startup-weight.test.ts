/**
 * Startup weight & latency — khoá chặt các tối ưu giảm trọng lượng khởi động:
 *
 *  (a) globals.css KHÔNG còn @import render-blocking (font Pixelify + KaTeX).
 *  (b) layout.tsx giữ đúng MỘT nguồn tải Pixelify Sans (<link>) + preconnect.
 *  (d) use-web-search: fetchPage các trang chạy song song (Promise.allSettled)
 *      và timeout mạng hạ xuống 8s.
 *  (e) components/effects/index.tsx không còn phụ thuộc framer-motion.
 *
 * Phần (a)(b)(d)(e) dùng source-inspection như tests/design-system.test.ts —
 * hành vi tải là thuộc tính của source nên inspection đủ chặt: thêm lại dòng
 * đã xoá là test đỏ ngay.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
}

/* ------------------------------------------------------------------ */
/* (a) + (b): CSS khởi động & nguồn font                               */
/* ------------------------------------------------------------------ */

describe('globals.css — không còn @import render-blocking', () => {
  it('không có dòng @import nào (KaTeX đã chuyển theo chunk KaTeX, font đã có <link>)', () => {
    const css = read('../app/globals.css');
    // @import phải đứng đầu chuỗi statement — khớp theo đầu dòng để không
    // dính phải chữ "@import" nằm trong comment giải thích.
    expect(css).not.toMatch(/^[ \t]*@import/m);
  });

  it('CSS KaTeX đi theo chunk dynamic của rehype-katex trong markdown-renderer', () => {
    const src = read('../components/markdown-renderer.tsx');
    expect(src).toMatch(/import\('katex\/dist\/katex\.min\.css'\)/);
  });
});

describe('layout.tsx — không còn font Pixelify, chỉ next/font tự host', () => {
  const layout = read('../app/layout.tsx');

  /*
   * Trước đây test này canh "đúng MỘT nguồn tải Pixelify qua <link>". Pixelify
   * đã bị gỡ khỏi hệ thiết kế (thay bằng Patrick Hand qua `next/font`, tự
   * host ở build) nên giờ KHÔNG còn <link> font nào trong <head> — mọi họ
   * font đều đi qua `next/font/google`, tức không có request nào ra
   * fonts.googleapis.com lúc chạy.
   *
   * Bất biến còn giữ nguyên: KHÔNG được thêm lại <link> font thủ công, vì
   * đó là một chuỗi request render-blocking nối đuôi sau CSS chính — đúng
   * thứ `globals.css` đã dâng @import vì lý do này.
   */
  it('không còn <link> tải font thủ công (mọi họ đi qua next/font)', () => {
    expect(layout).not.toMatch(/Pixelify/);
    expect(layout).not.toMatch(/fonts\.googleapis\.com\/css2/);
    expect(layout).not.toMatch(/rel="stylesheet"[^>]*font/i);
  });

  it('không có @import nào trong globals.css (không render-blocking)', () => {
    const css = read('../app/globals.css');
    expect(css).not.toMatch(/^[ \t]*@import/m);
  });
});


/* ------------------------------------------------------------------ */
/* (d): use-web-search — trang song song + timeout 8s                  */
/* ------------------------------------------------------------------ */

describe('use-web-search — thu thập web không chặn lâu', () => {
  const src = read('../lib/use-web-search.ts');

  it('các fetchPage chạy song song bằng Promise.allSettled (một trang chết không kéo cả cụm)', () => {
    expect(src).toContain('Promise.allSettled(pageUrls.map((u) => fetchPage(u)))');
  });

  it('timeout search + fetchPage hạ xuống 8s (REQUEST_TIMEOUT_MS)', () => {
    expect(src).toMatch(/REQUEST_TIMEOUT_MS\s*=\s*8_000/);
    expect(src).not.toMatch(/REQUEST_TIMEOUT_MS\s*=\s*15_000/);
  });
});

/* ------------------------------------------------------------------ */
/* (e): effects — sạch framer-motion                                   */
/* ------------------------------------------------------------------ */

describe('components/effects — không còn framer-motion', () => {
  it('file không nhắc framer-motion (thay bằng CSS animation thuần)', () => {
    const src = read('../components/effects/index.tsx');
    expect(src).not.toContain('framer-motion');
  });

  it('useFxEnabled vẫn tôn trọng prefers-reduced-motion qua matchMedia', () => {
    const src = read('../components/effects/index.tsx');
    expect(src).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
  });
});
