import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

/**
 * Hợp đồng design token của Vyen.
 *
 * Mọi màu khai báo dạng channel RGB trong `app/globals.css` (`--token: R G B`)
 * để Tailwind vẫn áp dụng được modifier opacity (`bg-surface/60`) trong khi
 * CSS thuần dùng lại đúng một biến qua `rgb(var(--token) / a)`. Cùng một nguồn
 * sự thật, không thể lệch nhau theo thời gian.
 *
 * Ứng dụng DARK-ONLY: không có nhánh sáng, xem `.dark` no-op trong globals.css.
 */
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`

/**
 * Màu đơn (không có alpha modifier cần thiết) — khai trực tiếp bằng hex.
 * Chỉ dùng cho token KHÔNG nằm trong hệ thống channel RGB.
 */
const hex = {
  sunken: '#07090d',
  base: '#0b0e13',
  surface: '#12161d',
  raised: '#1a1f27',
  overlay: '#20262f',

  primary: '#e8eaed',
  secondary: '#a7b0bb',
  tertiary: '#7c8794',
  disabled: '#5c6673',

  subtle: '#1c222a',
  default: '#3a4552',
  strong: '#5a6675',

  accent: '#7cb7ea',
  'accent-dim': '#3f6a94',
  success: '#5bbd7f',
  warning: '#e0a04a',
  danger: '#ef6f5c',
  info: '#63b3d6',
  reasoning: '#a78bd4',

  'diff-add': '#6cc98d',
  'diff-del': '#f08578',
  'diff-ctx': '#8d97a3',
} as const

/**
 * ALIAS TẠM — giữ cho các component CHƯA migrate sang tên mới.
 *
 * Đây là các key Tailwind đã bị gỡ khỏi hợp đồng nhưng vẫn còn code gọi tới.
 * Chúng trỏ thẳng sang GIÁ TRỊ của token mới, nên đổi tên class không làm
 * đổi màu. Đổi tên class là việc của các agent đang migrate component song
 * song — khi `grep -rn "<tên>" components/` rỗng thì xoá key tương ứng ở đây.
 *
 * KHÔNG thêm alias mới. Thêm là đẻ thêm một cách gọi cho cùng một màu, và đó
 * chính là thứ làm bảng màu cũ loãng.
 */
const legacyAlias = {
  /* Trạng thái cũ → bảng accent/status mới. */
  'cyan-glow': hex.accent,
  'emerald-safe': hex.success,
  'amber-warn': hex.warning,
  'rose-danger': hex.danger,
  'violet-reasoning': hex.reasoning,

  /* Mặt phẳng cũ → thang 5 tầng mới. */
  canvas: hex.sunken,
  'surface-elevated': hex.overlay,
  'surface-subtle': hex.surface,
  'surface-glass': 'rgba(32, 38, 47, 0.82)',

  /* Ranh giới cũ → 3 bậc viền mới. */
  'border-control': hex.default,

  /* Bóng cũ — hai key này KHÔNG còn sinh CSS nào, giữ để class cũ không
     vỡ cú pháp trong lúc component chuyển sang `bevel-out`/`bevel-in`. */
  'ambient-glow': 'none',
  'reasoning-glow': 'none',

  /*
   * THANG ZINC LẬT BẬC — alias cho 5 chỗ dùng sót lại.
   *
   * `zinc` trước đây là một thang màu BỊ LẬT (zinc-50 tối nhất, zinc-950 sáng
   * nhất) để `text-zinc-800` trông sáng trên nền tối. Cơ chế đó giấu nhầm
   * cả những chỗ dùng sai — nên thang đã bị gỡ khỏi hệ màu.
   *
   * Chỉ giữ lại ĐÚNG 3 bậc còn code gọi tới, map theo vai trò thật sự:
   *   zinc-200 — viền ảnh trong markdown-renderer → viền mảnh
   *   zinc-500 — chữ "đang tải" ở app/page.tsx   → chữ phụ
   *   zinc-600 — chữ fallback khi KaTeX lỗi      → chữ phụ
   * Xoá khi grep `zinc-` trong components/ app/ không còn kết quả.
   */
  zinc: {
    200: hex.subtle,
    500: hex.tertiary,
    600: hex.tertiary,
  },
} as const

/**
 * Design tokens dùng chung.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    /*
     * `lib/` chứa `ui-z.ts`, nơi toàn bộ class `z-[NN]` của hệ phân lớp được
     * định nghĩa. Không có glob này thì Tailwind KHÔNG sinh class nào trong
     * Z_CLASS — mọi modal/toast/sidebar rơi về z-index 0 và thứ tự chồng do
     * thứ tự DOM quyết định, tức cơ chế phân lớp trở nên vô nghĩa.
     */
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /* BỀ MẶT — 5 tầng, mỗi tầng sáng hơn tầng trước đúng một bậc. */
        sunken: hex.sunken,
        base: hex.base,
        surface: hex.surface,
        raised: hex.raised,
        overlay: hex.overlay,

        /* CHỮ — 4 tầng theo vai trò. */
        primary: hex.primary,
        secondary: hex.secondary,
        tertiary: hex.tertiary,
        disabled: hex.disabled,

        /*
         * VIỀN — 3 tầng, mỗi tầng đảm nhiệm đúng MỘT việc. Đây là thứ quyết
         * định một khối trông như "khung" hay như "control".
         *   subtle  — đường phân cách giữa các dòng TRONG một khối
         *   default — ranh giới control (input, nút, ô chọn)
         *   strong  — hover / focus / selected
         */
        subtle: hex.subtle,
        default: hex.default,
        strong: hex.strong,

        /* NHẤN & TRẠNG THÁI — một bảng màu cho toàn ứng dụng. */
        accent: hex.accent,
        'accent-dim': hex['accent-dim'],
        success: hex.success,
        warning: hex.warning,
        danger: hex.danger,
        info: hex.info,
        reasoning: hex.reasoning,

        /* DIFF — ba trạng thái của một dòng thay đổi. */
        'diff-add': hex['diff-add'],
        'diff-del': hex['diff-del'],
        'diff-ctx': hex['diff-ctx'],

        /*
         * Hệ cũ, map theo vai trò chứ không theo tên. Giữ cho tới khi các
         * component migrate xong — xem khối ALIAS TẠM ở globals.css.
         * Mỗi dòng là MỘT cách viết khác của đúng token mới ở trên.
         */
        brand: token('--accent'),
        'panel-bg': token('--panel-bg'),
        'panel-soft': token('--panel-soft'),
        'border-hover': token('--border-hover'),
        'border-subtle': token('--border-subtle'),
        'text-primary': token('--text-primary'),
        'text-muted': token('--text-muted'),
        'accent-steel': token('--accent-steel'),
        'status-success': token('--status-success'),
        'status-warning': token('--status-warning'),
        'status-error': token('--status-error'),
        'bg-deep': token('--bg-deep'),
        'bg-canvas': token('--bg-canvas'),

        ...legacyAlias,
      },
      borderRadius: {
        none: '0px',
        sm: '3px',
        DEFAULT: '5px',
        md: '5px',
        full: '9999px',
        /*
         * Cố ý KHÔNG định nghĩa `lg`/`xl`/`2xl`/`3xl`. Mọi bo góc đều là
         * 0px trong ứng dụng này; nếu ai đó gọi `rounded-lg` thì class đó không
         * được sinh ra — thà không có bo góc nào còn hơn là bo góc ngoài ý muốn.
         * (Trước đây khối override `[class*="rounded-lg"]` trong globals.css làm
         * cho cấu hình này bị vô hiệu hoàn toàn; khối đó đã bị xoá.)
         */
      },
      boxShadow: {
        /*
         * Ứng dụng KHÔNG dùng bóng đổ. Mọi key mặc định của Tailwind bị khoá
         * về `none` để không class `shadow-*` nào lọt vào mang theo bóng mềm —
         * ngoại trừ HAI key dưới đây.
         */
        none: 'none',
        DEFAULT: 'none',
        sm: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
        inner: 'none',

        /*
         * BEVEL — chiều sâu hai tông theo kiểu GUI Minecraft/Windows 95: cạnh
         * trên & trái sáng hơn, cạnh dưới & phải tối hơn. Đây là CÁCH DUY NHẤT
         * để tạo tầng bậc trong giao diện phẳng này, nên nó là hai `boxShadow`
         * duy nhất không phải `none`.
         *
         * Dùng `box-shadow` chứ không phải `border-color`: một cạnh viền 1px chỉ
         * mang được một màu, còn bevel cần hai để đọc ra hướng ánh sáng. Cả bốn
         * cạnh đều `inset` nên không đổi kích thước bố cục.
         *
         * Giá trị phải khớp byte với `.bevel-out` / `.bevel-in` trong
         * globals.css — sửa một bên thì phải sửa cả bên kia.
         */
        'bevel-out':
          'inset 0 1px 0 rgb(255 255 255 / 0.07), inset 1px 0 0 rgb(255 255 255 / 0.04), inset 0 -1px 0 rgb(0 0 0 / 0.45), inset -1px 0 0 rgb(0 0 0 / 0.30)',
        'bevel-in':
          'inset 0 1px 0 rgb(0 0 0 / 0.45), inset 1px 0 0 rgb(0 0 0 / 0.30), inset 0 -1px 0 rgb(255 255 255 / 0.06), inset -1px 0 0 rgb(255 255 255 / 0.04)',
      },
      fontSize: {
        /*
         * SÁU BẬC CỠ CHỮ. Trước đây giao diện có 16 kích thước rải rác
         * (`text-[10.5px]`, `text-[12.5px]`, `text-[13.5px]`...) khiến mọi vùng
         * chữ khác nhau một chút và không ai nhớ quy tắc. Nay mỗi bậc là một
         * VAI TRÒ, dùng lại được ở mọi nơi:
         *   micro   — siêu nhỏ, dấu phân biệt, số đếm
         *   meta    — timestamp, metadata, chú thích nhỏ
         *   ui      — nhãn, nút, chữ trong khối giao diện (mặc định)
         *   body    — nội dung trong ô nhập, dòng bảng
         *   read    — văn bản đọc dài (markdown, đoạn văn)
         *   head    — tiêu đề khối lớn
         */
        micro: ['10px', { lineHeight: '1.4' }],
        meta: ['11px', { lineHeight: '1.45' }],
        ui: ['12px', { lineHeight: '1.5' }],
        body: ['13px', { lineHeight: '1.6' }],
        read: ['15px', { lineHeight: '1.7' }],
        head: ['20px', { lineHeight: '1.3' }],

        /*
         * Cỡ chữ Tailwind mặc định giữ NGUYÊN — 146 chỗ dùng `text-xs` và 40
         * chỗ dùng `text-sm` trong component chưa migrate. Đổi số ở đây là đổi
         * diện mạo toàn ứng dụng, nên chỉ chờ khi từng component chuyển sang
         * tên bậc mới rồi mới thay.
         */
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
      },
      fontFamily: {
        /*
         * `next/font` chỉ tạo biến `--font-sans`; nếu không map vào đây thì
         * `font-sans` của Tailwind vẫn là font hệ thống và Inter (đã tải kèm
         * subset tiếng Việt) không bao giờ được dùng.
         */
        sans: ['var(--font-sans)', 'Geist', 'Inter', ...defaultTheme.fontFamily.sans],
        mono: [['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'], { fontFeatureSettings: '"calt" 1, "zero" 1' }],
        /*
         * Font pixel là đạo diện NGUYÊN CẢO — dành cho wordmark (.font-pixel).
         * KHÔNG áp cho tiêu đề trong câu trả lời của model.
         */
        pixel: ['var(--font-pixel)', 'Pixelify Sans', 'Minecraft', 'monospace'],
      },
      maxWidth: {
        /** Chiều rộng cột hội thoại — dùng chung cho message list & composer. */
        thread: '48rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.94)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        /*
         * Ba keyframes dưới thay framer-motion trong components/effects —
         * tham số (giá trị/duration/ease) copy nguyên từ transition cũ để
         * HÀNH VI hiệu ứng không đổi, chỉ đổi cách triển khai (CSS thuần).
         */
        'fx-bar-bounce': {
          '0%, 100%': { height: '4px' },
          '50%': { height: '22px' },
        },
        'fx-dot-bounce': {
          '0%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '50%': { transform: 'translateY(-5px)', opacity: '1' },
        },
        // Vệt quét ShimmerLine: framer chạy 1.4s + repeatDelay 0.4s — CSS
        // không có repeatDelay nên gộp độ trễ vào cuối chu kỳ 1.8s: quét
        // chiếm 1.4/1.8 ≈ 77.8% chu kỳ rồi đứng yên 0.4s.
        'fx-sweep': {
          '0%': { transform: 'translateX(-120%)' },
          '77.8%': { transform: 'translateX(360%)' },
          '100%': { transform: 'translateX(360%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'pop-in': 'pop-in 160ms ease-out',
        'slide-up': 'slide-up 180ms ease-out',
        'fx-bar-bounce': 'fx-bar-bounce 1.1s ease-in-out infinite',
        'fx-dot-bounce': 'fx-dot-bounce 0.9s ease-in-out infinite',
        'fx-sweep': 'fx-sweep 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
export default config
