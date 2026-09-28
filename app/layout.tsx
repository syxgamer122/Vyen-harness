import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Patrick_Hand } from 'next/font/google';
import { PWARegister } from '@/components/pwa-register';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-sans',
});

/**
 * Chữ vẽ tay — nét kẻ cho nhãn, nút, tiêu đề.
 *
 * CHỈ có weight 400: font-data.json của `next/font` liệt kê `weights: ['400']`
 * cho Patrick Hand. Nên phân cấp đậm/nhạt trong UI không đến từ `font-bold` mà
 * đến từ cỡ chữ + độ đậm của nét mực — xem `.uic` trong globals.css.
 */
const patrickHand = Patrick_Hand({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  weight: '400',
  variable: '--font-hand',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Vyen — Minimal Agent Harness',
  description: 'Trợ lý AI cá nhân với hội thoại phân nhánh và công cụ mở rộng — dữ liệu lưu ngay trên thiết bị của bạn.',
  referrer: 'no-referrer',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Vyen',
  },
  icons: {
    apple: '/icons/icon-180.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
  colorScheme: 'light',
  themeColor: '#f2f2ef',
};

/**
 * Ứng dụng LIGHT-ONLY (một theme, xem globals.css).
 *
 * Không còn script chống FOUC: theme không đổi theo hệ điều hành nên không có
 * gì để nhấp nháy — trước first-paint nền đã là giấy trắng, tức cùng màu với
 * màn trắng trình duyệt. Cổng chặn FOUC của một theme động không áp dụng ở đây.
 */

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} ${patrickHand.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      {/*
        KHÔNG còn `<head>` với preconnect tới fonts.googleapis.com: cả ba họ font
        đều đi qua `next/font/google`, tức được tải và TỰ HOST lúc build. Trình
        duyệt không hề gọi ra Google Fonts lúc chạy, nên preconnect chỉ là một
        DNS+TLS tới một host không bao giờ được dùng.
      */}
      <body className="relative min-h-dvh bg-sunken font-sans text-primary antialiased overscroll-none selection:bg-accent-mint/40 selection:text-primary">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}