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
  /* BỀ MẶT — 5 tầng gần như đều nhau trên nền trắng. */
  sunken: '#f7f7f7',
  base: '#fcfcfc',
  surface: '#ffffff',
  raised: '#f5f5f5',
  overlay: '#ffffff',

  /* CHỮ — 4 tầng, mỗi tầng đều đạt WCAG AA trên nền trắng. */
  primary: '#18181b',
  secondary: '#575757',
  tertiary: '#6f6f6f',
  disabled: '#a3a3a3',

  /* VIỀN — 3 tầng. `default` đạt 3.03:1 (WCAG 1.4.11 cho ranh giới control). */
  subtle: '#e5e5e5',
  default: '#949494',
  strong: '#525252',

  accent: '#2a7360',
  'accent-dim': '#7fb8a6',
  'accent-soft': '#f0f4f3',
  'on-fill': '#ffffff',
  success: '#167a4a',
  warning: '#9a6206',
  danger: '#b3261e',
  info: '#0369a1',
  reasoning: '#6d4aa8',

  'diff-add': '#1f7a3d',
  'diff-del': '#b3261e',
  'diff-ctx': '#575757',
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
  'amber-warn': hex.warning,
  'rose-danger': hex.danger,

  /*
   * ĐÃ XOÁ trong đợt sửa viền (2026-09-27) — 8 key dưới đây đã rỗng hoàn toàn,
   * tức không component nào còn gọi tới:
   *   emerald-safe, violet-reasoning — lượt gọi cuối ở `stream-bubble.tsx`
   *   canvas, surface-elevated, surface-subtle, surface-glass, border-control
   *   ambient-glow, reasoning-glow — key bóng `'none'`, không sinh CSS nào
   *
   * Chúng chỉ là những cách viết khác của token đã có sẵn ở `hex`, nên xoá đi
   * không đổi màu gì được vẽ ra. Giữ lại là đẻ thêm cách gọi cho cùng một màu.
   */

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
        /*
         * NỀN NHẤN NHẠT — token NỀN, không phải token chữ. Tách riêng khỏi
         * `accent` vì `accent` còn dùng làm màu chữ (link, con trỏ, viền
         * focus) và nền nhạt trên giấy trắng chỉ đạt ~1.1:1 — không đọc
         * được nếu dùng làm chữ.
         */
        'accent-soft': hex['accent-soft'],
        'on-fill': hex['on-fill'],
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
        /*
         * BO GÓC ĐỀU, NHỎ — phong cách hiện đại tối giản.
         *
         * Đã bỏ toàn bộ dạng bất đối xứng (`ink`/`wobble`). Hai lý do, đều
         * đo được chứ không phải thẩm mỹ:
         *   1. Mép chữ dịch. Bán kính lệch nhau giữa bốn góc làm vị trí
         *      ký tự đầu/cuối dòng đổi theo chiều cao khối — cùng một nội
         *      dung mà hai lần hiển thị lệch nhau.
         *   2. Một bán kính cho cả bốn góc là thứ mắt đọc nhanh nhất trên
         *      nền trắng, vì ranh giới khối đã do VIỀN đảm nhiệm, không cần
         *      bo góc thêm một lớp tín hiệu nữa.
         *
         *   sm    4px  — chip nhỏ, badge, ô inline
         *   md    6px  — DEFAULT: control nhỏ, ô nhập một dòng
         *   lg    8px  — control: nút, input, menu item
         *   xl   10px  — khối nội dung: thẻ settings, panel
         *   2xl   12px — khối lớn: bubble, khung modal
         *   3xl   16px — vỏ composer, popover lớn nhất
         */
        none: '0px',
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '20px',
        full: '9999px',
      },
      boxShadow: {
        /*
         * BÓNG MỀM MỜ DẦN — chiều sâu DUY NHẤT của hệ này (bóng lệch cứng
         * kiểu vẽ tay đã bị gỡ; xem DESIGN.md §5).
         *
         * Đây là đổi hệ thống so với bóng mềm trước đây: bóng mềm đọc "chiều
         * sâu" theo kiểu vật lý, còn bóng lệch cứng đọc "vẽ tay" — cùng một
         * đường viền mực và một vệt mực đọn lệch ra, đúng cách người vẽ tạo
         * cảm giả nổi. Trên nền tối bóng mềm phải dùng alpha tăng dần mới đọc
         * ra (nền gần đen nuốt bóng); trên giấy trắng nét lệch cứng tự nó đã
         * đọc ra ngay mà không cần blur.
         *
         * `lift-md` / `lift-lg` có lớp thứ hai rất nhạt (`/0.10`, `/0.14`) để
         * khối lớn không bị cắt khúc ở góc. Lớp `0 … 0` được bỏ hẳn: nó
         * không vẽ ra gì mà chỉ làm test so số lớp khó đọc.
         *
         * Giá trị phải khớp BYTE với `.lift-sm` / `.lift-md` / `.lift-lg` /
         * `.well` trong globals.css — sửa một bên thì phải sửa cả bên kia.
         *
         * `inner` vẫn là `none`: ô nhập chìm dùng `.well` (inset), không dùng
         * `shadow-inner` của Tailwind.
         */
        none: 'none',
        DEFAULT: 'none',
        'lift-sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'lift-md': '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 6px 16px -4px rgb(0 0 0 / 0.08)',
        'lift-lg': '0 2px 6px 0 rgb(0 0 0 / 0.07), 0 16px 40px -8px rgb(0 0 0 / 0.12)',
        inner: 'none',
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
         * BA HỌ, BA VIỆC.
         *
         * `next/font` chỉ tạo biến `--font-sans` / `--font-mono`;
         * nếu không map vào đây thì class của Tailwind sẽ rơi về font hệ thống và
         * font đã tải kèm subset tiếng Việt không bao giờ được dùng.
         *
         *   sans — Inter: TOÀN BỘ nhãn, nút, tiêu đề, prose dài. Hệ mới bỏ
         *          chữ vẽ tay (Patrick Hand) vì nó chỉ có một nét đậm —
         *          phân cấp đậm/nhạt bắt buộc phải làm bằng cỡ chữ, nên nhãn
         *          12px mỏng đến mức dưới ngưỡng đọc thoải mái trên nền trắng.
         *          Xem `.uic` trong globals.css và DESIGN.md §3.
         *   mono — JetBrains Mono: MỌI thứ do máy sinh ra. Code, token, id,
         *          đường dẫn, hash, timestamp, số đếm, nhãn trường.
         */
        sans: ['var(--font-sans)', 'Geist', 'Inter', ...defaultTheme.fontFamily.sans],
        mono: [['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'], { fontFeatureSettings: '"calt" 1, "zero" 1' }],
      },
      maxWidth: {
        /**
         * Chiều rộng cột hội thoại — dùng chung cho message list & composer.
         *
         * TRƯỚC ĐÂY cột hội thoại là `48rem` nhưng composer là `max-w-4xl`
         * (56rem) viết riêng trong JSX, nên ô nhập lấn ra 64px mỗi bên so với
         * nội dung đang đọc — đo được @1360px là composer 896px vs thread 768px.
         * Nay CẢ HAI gọi chung `thread` nên không còn cách nào lệch nhau: muốn
         * đổi thì đổi đúng một số này.
         */
        thread: '48rem',
        /**
         * Cột phụ bên phải (Plan / Context / Workspace checkpoints) khi màn
         * hình đủ rộng. Chỉ dùng ở ≥1400px — dưới ngưỡng đó các khối này quay
         * về nằm giữa cột hội thoại như trước (xem `chat-interface.tsx`).
         */
        rail: '20rem',
      },
      screens: {
        /* Mốc bật cột phụ: 256 (sidebar) + 768 (thread) + 320 (rail) + gutter. */
        rail: '1432px',
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
