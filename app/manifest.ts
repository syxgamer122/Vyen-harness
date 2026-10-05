import type { MetadataRoute } from 'next';

/**
 * App LIGHT-ONLY (một theme, xem globals.css). `background_color` và
 * `theme_color` phải trùng `viewport.themeColor` của layout — cùng `#f7f7f7`.
 *
 * Đây là màu splash khi mở bằng "install as app", nên nó PHẢI khớp nền app:
 * lệch một bậc là thấy một vệt trắng/vàng nháy trước khi shell kịp vẽ.
 */
const APP_BACKGROUND = '#f7f7f7';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Vyen — AI Innovations',
    short_name: 'Vyen',
    description:
      'Trợ lý AI hội thoại phân nhánh — dữ liệu lưu ngay trên thiết bị của bạn.',
    lang: 'vi',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: APP_BACKGROUND,
    theme_color: APP_BACKGROUND,
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
