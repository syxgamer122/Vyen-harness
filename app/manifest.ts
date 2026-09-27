import type { MetadataRoute } from 'next';

/**
 * App dark-only (app/layout.tsx gắn cứng `dark`). `background_color` và
 * `theme_color` phải trùng `viewport.themeColor` của layout — cùng `#0d1116`.
 * Nếu để nền sáng ở đây thì lúc mở bằng "install as app" màn hình splash
 * trắng nháy trước khi shell tối kịp vẽ, đúng thứ `theme_color` sinh ra để
 * chống.
 */
const APP_BACKGROUND = '#0d1116';

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
