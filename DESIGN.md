# DESIGN.md — Vyen Harness Design System

> Tài liệu này **mô tả** hệ thống đang chạy, không mô tả hệ thống mong muốn. Mỗi
> khẳng định ở đây đều có một nơi kiểm chứng: `tests/design-system.test.ts`, hoặc
> dòng `file:line` được nêu kèm. Ai viết code mà làm tài liệu này sai sẽ làm
> **test đỏ**, không phải tài liệu sai.
>
> Nguồn sự thật cho màu / bo góc / bóng / cỡ chữ là `tailwind.config.ts`
> (mảng `hex`, `theme.extend`) và `app/globals.css` (khối `:root`). Tài liệu này
> chỉ diễn giải chúng. Khi hai bên lệch nhau, **hai file kia đúng, tài liệu này
> sai** — sửa tài liệu.

---

## 0. Mục lục

| § | Nội dung |
|---|---|
| [1](#1-quy-tắc-gốc) | Quy tắc gốc — một câu, kèm hệ quả bắt buộc |
| [2](#2-token-màu) | Token màu: bề mặt, chữ, viền, trạng thái, diff — kèm HEX |
| [3](#3-typography) | Typography: 6 bậc cỡ chữ, quy tắc hai họ font |
| [4](#4-bo-góc--khoảng-cách) | Bo góc và khoảng cách |
| [5](#5-chiều-sâu--bevel) | Chiều sâu: BEVEL, CSS chính xác, điểm thực thi duy nhất |
| [6](#6-chính-sách-màu-trạng-thái) | Chính sách màu trạng thái + danh sách alias tạm phải xoá |
| [7](#7-dark-only--không-có-nhánh-sáng) | Dark-only: vì sao tốt hơn light mode nửa vời |
| [8](#8-z-index) | Thang z-index (`lib/ui-z.ts`) |
| [9](#9-drift-đã-biết--chưa-migrate) | **Drift đã biết / chưa migrate** — mục quan trọng nhất |
| [10](#10-hợp-đồng-được-kiểm-chứng-bằng-gì) | Test kiểm chứng cái gì, và cái gì nó **không** kiểm |

---

## 1. Quy tắc gốc

> **Giao diện này là một bảng terminal: phẳng, vuông, không bóng đổ, một bảng
> màu duy nhất. Mọi chiều sâu đều phải đọc được bằng mắt trước khi đọc được bằng
> code — nếu một khối không khiến mắt biết nó nổi hay chìm, khối đó chưa xong.**

Ba hệ quả cụ thể, mỗi cái đều kiểm được:

1. **Chiều sâu = bevel, không phải bóng đổ.** Không `drop-shadow`, không blur
   mềm. Hai class `bevel-out` / `bevel-in` là toàn bộ cơ chế nổi/chìm. Xem §5.
2. **Viền mang đúng MỘT vai trò.** Ba bậc `subtle` / `default` / `strong`, mỗi
   bậc một việc. Xem §2.3. Nếu bạn không phân biệt được bạn đang cần bậc nào,
   bạn chưa cần viền.
3. **Góc vuông là quy tắc, không phải mặc định.** `rounded-none` trên mọi thứ
   chứa nội dung. Xem §4.

Ứng dụng **dark-only** — xem §7.

---

## 2. Token màu

Toàn bộ token khai trong `tailwind.config.ts:20-47` (mảng `hex`) và phản chiếu 1-1
trong `app/globals.css:27-101` (khối `:root`) dưới dạng channel RGB để CSS thuần
dùng `rgb(var(--token) / a)`.

### 2.1 Bề mặt — 5 tầng, sáng dần

Thứ tự khai báo **là** thứ tự dùng: nền sâu nhất ở ngoài, lớp nổi trên cùng ở trong.
(`app/globals.css:31-39`)

| Token | HEX | Class | Dùng cho |
|---|---|---|---|
| `bg-sunken` | `#07090d` | `bg-sunken` | Ngoài cùng: nền app, sidebar, vùng tĩnh |
| `bg-base` | `#0b0e13` | `bg-base` | Vùng làm việc: chat stream, composer, code block |
| `bg-surface` | `#12161d` | `bg-surface` | Khối nội dung: card, bubble, dải tiêu đề |
| `bg-raised` | `#1a1f27` | `bg-raised` | Control: ô nhập, nút, vùng hover |
| `bg-overlay` | `#20262f` | `bg-overlay` | Nổi trên cùng: popover, dropdown, menu |

Nguồn chân thực tương phản: `bg-sunken` là nền `<html>`/`<body>`
(`app/globals.css:120-135`). Thang này **không** có bậc cao hơn `overlay`; thêm
tầng mới là thêm token, phải sửa cả hai file.

### 2.2 Chữ — 4 tầng theo vai trò, không theo độ sáng

(`app/globals.css:41-48`)

| Token | HEX | Class | Dùng cho |
|---|---|---|---|
| `text-primary` | `#e8eaed` | `text-primary` | Nội dung chính |
| `text-secondary` | `#a7b0bb` | `text-secondary` | Mô tả, nhãn phụ, metadata |
| `text-tertiary` | `#7c8794` | `text-tertiary` | Nhãn nhóm, gợi ý, dấu thời gian |
| `text-disabled` | `#5c6673` | `text-disabled` | Control bị vô hiệu — **không dùng cho nội dung** |

`text-disabled` không phải "mờ hơn `tertiary`" — nó là "không dùng được". Đừng dùng
nó để làm mờ một thứ vẫn cần đọc được.

**Cấm modifier opacity trên token chữ.** `text-tertiary/60`,
`text-text-muted/40` … là cách lách kiểm tra tương phản: 60% của một màu đã được
chọn để đạt WCAG AA thì không còn đạt nữa. Dùng đúng bậc, hoặc bậc dưới.

### 2.3 Viền — 3 tầng, mỗi tầm đúng MỘT việc

Đây là phần dễ trôi nhất trong hệ thống, nên nó được ghi ra bằng **công việc**, không
phải bằng tên. (`app/globals.css:50-56`)

| Token | HEX | Class | VIỆC CỦA NÓ — dùng khi nào, không dùng khi nào |
|---|---|---|---|
| `border-subtle` | `#1c222a` | `border-subtle` | **Đường phân cách TRONG một khối.** Giữa các dòng bảng, dưới dải tiêu đề `.settings-card-head`, `<hr>` trong prose. Không bao giờ để làm ranh giới ngoài của control. |
| `border-default` | `#3a4552` | `border-default` | **Ranh giới control.** Ô nhập, nút, ô chọn — thứ tay chạm vào. Đây là bậc mặc định khi bạn viết `border` mà không nghĩ kỹ. |
| `border-strong` | `#5a6675` | `border-strong` | **Hover / focus / selected.** Chỉ dùng ở trạng thái tương tác, KHÔNG dùng ở trạng thái nghỉ. Dùng nó lúc nghỉ làm mọi control trông như đang được chạm tới. |

Vì sao tách: trước đây cả bốn vai trò dùng chung `#495059`, mắt không phân biệt
được đâu là khối, đâu là thứ bấm được, đâu là đang bấm.

**Quy tắc chống trôi:** không dùng `border-strong` ở trạng thái nghỉ; không dùng
`border-subtle` làm viền ngoài của control; không tự chế bậc thứ tư bằng
`border-white/10`.

### 2.4 Nhấn & trạng thái — MỘT bảng màu cho toàn ứng dụng

(`app/globals.css:58-65`)

| Token | HEX | Class | Dùng cho |
|---|---|---|---|
| `accent` | `#7cb7ea` | `text-accent` / `bg-accent` | Nhấn chủ đạo: link, con trỏ, viền focus, hành động chính |
| `accent-dim` | `#3f6a94` | `bg-accent-dim` | Nhấn bị tắt, nền nhấn nhạt |
| `success` | `#5bbd7f` | `text-success` | Thành công |
| `warning` | `#e0a04a` | `text-warning` | Cảnh báo, mode PLAN |
| `danger` | `#ef6f5c` | `text-danger` | Lỗi, xoá, phủ định |
| `info` | `#63b3d6` | `text-info` | Thông tin trung tính |
| `reasoning` | `#a78bd4` | `text-reasoning` | Khối suy luận — **màu riêng, không dùng cho trạng thái** |

Trước đây có **hai** bảng trạng thái cùng sống (`--success` và `--emerald-safe`,
`--warning` và `--amber-warn`, …). Xem §6.

### 2.5 Diff — ba trạng thái của một dòng thay đổi

(`app/globals.css:67-70`, áp dụng tại `app/globals.css:768-777`)

| Token | HEX | Class | Dùng cho |
|---|---|---|---|
| `diff-add` | `#6cc98d` | `text-diff-add` | Dòng thêm |
| `diff-del` | `#f08578` | `text-diff-del` | Dòng xoá |
| `diff-ctx` | `#8d97a3` | `text-diff-ctx` | Dòng giữ nguyên |

Màu CHỮ mang thông tin (thêm/bớt/giữ), nền chỉ nhấn ở mức `/0.08`
(`app/globals.css:770,774`). Ba màu phải phân biệt được khi đọc thuần văn bản —
nghĩa là không được thay bằng `success` / `danger` dù trông gần nhau, vì `success`
đã mang nghĩa "thành công" ở nơi khác.

---

## 3. Typography

### 3.1 Sáu bậc — mỗi bậc là MỘT VAI TRÒ

(`tailwind.config.ts:235-240`)

| Bậc | Size | Line-height | Class | Dùng cho |
|---|---|---|---|---|
| micro | 10px | 1.4 | `text-micro` | Siêu nhỏ: dấu phân biệt, số đếm |
| meta | 11px | 1.45 | `text-meta` | Timestamp, metadata, chú thích nhỏ |
| ui | 12px | 1.5 | `text-ui` | Nhãn, nút, chữ trong khối giao diện — **mặc định** |
| body | 13px | 1.6 | `text-body` | Nội dung ô nhập, dòng bảng |
| read | 15px | 1.7 | `text-read` | Văn bản đọc dài (markdown, đoạn văn) |
| head | 20px | 1.3 | `text-head` | Tiêu đề khối lớn |

Mỗi bậc dùng lại được ở **mọi** nơi. `text-micro` ở logo và `text-micro` ở số đếm
phải trông giống nhau — đó là toàn bộ mục đích của thang. Nếu bạn cần một cỡ
khác, bạn cần thêm một **bậc có tên**, không phải `text-[13.5px]`.

**Base = 16px** (`app/globals.css:121`). Trước đây là 18px, làm mọi kích thước
rem phình 12,5%. Thân bài đọc dài giữ 15px riêng ở `.claude-prose`
(`app/globals.css:527`).

### 3.2 Quy tắc hai họ font

| Font | Class | Dùng cho |
|---|---|---|
| **Inter** | `font-sans` | Toàn bộ UI và nội dung prose. Đây là mặc định của app. |
| **JetBrains Mono** | `font-mono` | **Mọi thứ do máy sinh ra**: code, token, id, đường dẫn, hash, timestamp, số đếm, nhãn trường. |
| Pixelify Sans | `.font-pixel` | **Chỉ wordmark** (`components/vyen-logo.tsx:71`) và nhãn nhóm ngắn. Xem bên dưới. |

`next/font` tạo `--font-sans` / `--font-mono` (`app/layout.tsx:9-20`); vì vậy
`fontFamily` trong config **phải** map qua `var(--font-sans)` — nếu không,
`font-sans` sẽ rơi về font hệ thống và Inter không bao giờ được dùng
(`tailwind.config.ts:252-259`).

**Vì sao font pixel bị thu hẹp lại còn wordmark.** Trước đây
`app/globals.css` ép `font-family: var(--font-pixel)` lên mọi `.claude-prose h1,
h2, h3` — tức là **mọi tiêu đề mà model sinh ra** hiển thị bằng font pixel. Đó là
chữ khó đọc nhất nằm trên thứ người dùng đọc lâu nhất, và `image-rendering:
pixelated` còn làm méo ảnh nội tuyến. Nay khối đó chỉ còn
`font-weight/line-height/color` (`app/globals.css:557-567`); `.font-pixel`
(`app/globals.css:308-312`) là nơi duy nhất còn nhắc tới nó. Nếu bạn thấy
`font-pixel` trên nội dung model, đó là hồi quy.

Nhãn trường (`.field-label`, `app/globals.css:317-323`) là **chữ thường, mono,
không giãn chữ** — không bao giờ in hoa. Mô tả phụ dưới nhãn là `.field-hint`
(`app/globals.css:326-331`): 12px, `text-tertiary`.

---

## 4. Bo góc & khoảng cách

### 4.1 Bo góc

| Class | Giá trị | Khi nào |
|---|---|---|
| `rounded-none` | `0px` | **Mặc định.** Mọi thứ chứa nội dung. |
| `rounded-sm` | `3px` | Chỉ dùng cho chip cỡ rất nhỏ khi cần, có chủ ý |
| `rounded` (DEFAULT) / `rounded-md` | `5px` | Chỉ dùng cho pill nhỏ khi cần, có chủ ý |
| `rounded-full` | `9999px` | **Chỉ khi hình dạng thật sự là hình tròn** — chấm trạng thái, avatar, nút tròn. |

**Cố ý KHÔNG định nghĩa `lg` / `xl` / `2xl` / `3xl`** (`tailwind.config.ts:181-187`).
Gọi `rounded-lg` **không sinh ra class nào cả** — không phải 8px, mà là không có
bo góc nào. Đây là hành vi có chủ ý: thà không bo còn hơn bo sai. Trước đây khối
override `[class*="rounded-lg"] { !important }` trong `globals.css` đè lên cấu
hình, khiến cấu hình 0px chưa bao giờ có tác dụng; khối đó đã bị xoá
(`app/globals.css:181-189`).

Không viết `border-radius` thô trong component. Cấu hình là nguồn duy nhất.

### 4.2 Khoảng cách

Các mốc dùng giữa các **nhóm**: **4 / 8 / 12 / 16 / 24 / 32px** (Tailwind
`1 / 2 / 3 / 4 / 6 / 8`). Khoảng lẻ kiểu `2.5` / `3.5` chỉ dùng trong nội bộ
một control, không dùng để tách hai nhóm.

Quy ước: trong một nhóm (label ↔ input) `8px`; giữa hai trường cùng khối
`12–16px`; giữa hai khối `16px`; padding trong khối `16px`.

Cột hội thoại dùng chung `max-w-thread` = `48rem` (`tailwind.config.ts:266-269`).

---

## 5. Chiều sâu: BEVEL

### 5.1 Bài toán

Ứng dụng cấm bóng đổ (§1) và bo góc (§4). Nếu mọi khối đều là hình chữ nhật viền
1px **cùng một màu**, thì container, control và đường phân cách có **cùng trọng
lượng thị giác** — mắt không có tầng bậc để bám vào, toàn bộ giao diện thành một
khối bùi nhùi. Đó chính là cảm giác "xấu" dù màu có đúng chuẩn.

### 5.2 Lời giải

Lấy từ chính GUI Minecraft / Windows 95: **chiều sâu tạo bằng viền hai tông** — cạnh
trên & trái sáng hơn, cạnh dưới & phải tối hơn.

| Class | CSS (`app/globals.css:243-257`) | Tailwind | Dùng cho |
|---|---|---|---|
| `.bevel-out` | `inset 0 1px 0 rgb(255 255 255 / 0.07)`, `inset 1px 0 0 rgb(255 255 255 / 0.04)`, `inset 0 -1px 0 rgb(0 0 0 / 0.45)`, `inset -1px 0 0 rgb(0 0 0 / 0.30)` | `shadow-bevel-out` | Khối **nổi**: panel, popover, dropdown, card |
| `.bevel-in` | `inset 0 1px 0 rgb(0 0 0 / 0.45)`, `inset 1px 0 0 rgb(0 0 0 / 0.30)`, `inset 0 -1px 0 rgb(255 255 255 / 0.06)`, `inset -1px 0 0 rgb(255 255 255 / 0.04)` | `shadow-bevel-in` | Khối **chìm**: ô nhập, rãnh, nút trên nền sáng |

**Vì sao `box-shadow` chứ không phải `border-color`:** một cạnh viền 1px chỉ mang
được **một** màu; bevel cần **hai** (sáng + tối) để đọc ra hướng ánh sáng. Bốn cạnh
đều `inset` nên không đổi kích thước bố cục, không cần chừa chỗ.

### 5.3 Quy tắc dùng

- Khối **nổi** (panel, popover, dropdown, settings card) → `bevel-out`.
- Khối **chìm** (ô nhập, rãnh, code) → `bevel-in`.
- Nút trên nền **sáng** (`.btn-primary` là nền accent) → `bevel-in`, vì bevel xuôi
  trên nền sáng thì không đọc được.
- **Nếu không phân biệt được khối nào nổi, khối đó đang thiếu bevel.**

Recipe đã áp dụng: `.surface-panel`, `.btn-secondary`, `.settings-card` dùng
`bevel-out`; `.field`, `.field-sm`, `.btn-primary` dùng `bevel-in`
(`app/globals.css:399-444,475-477`).

### 5.4 Điểm thực thi duy nhất

Giá trị bevel tồn tại ở **hai** nơi và phải khớp byte:

1. `app/globals.css:243-257` — sinh class `.bevel-out` / `.bevel-in`.
2. `tailwind.config.ts:217-220` — `boxShadow['bevel-out']` / `['bevel-in']`, sinh
   class `shadow-bevel-out` / `shadow-bevel-in` cho JSX.

Hai nơi tồn tại vì lớp recipe CSS dùng `@apply bevel-out` (đọc class trong
`@layer components`) còn JSX không thể `@apply` nên cần utility. Sửa một bên thì
phải sửa cả bên kia.

---

## 6. Chính sách màu trạng thái

**Một bảng màu. Không hai.**

Trước đây có hai bảng trạng thái cùng sống và cùng được `DESIGN.md` mô tả:
`--success` / `--emerald-safe`, `--warning` / `--amber-warn`, `--danger` /
`--rose-danger`, `--accent` / `--cyan-glow`, `--reasoning` / `--violet-reasoning`.
Hai bảng phủ cùng một miền nghĩa nên **không thể biết cái nào đúng**. Nay một bảng
sống (§2.4), bảng kia bị gỡ.

Cùng cơ chế đó, `--brand-hover` bị xoá: nó **giống hệt `--brand` byte-for-byte**,
tức là một no-op mang tên khác. Một alias không đổi màu chỉ tạo thêm một cách gọi
cho cùng một thứ.

### 6.1 Alias TẠM — phải xoá, đang tồn tại

`tailwind.config.ts:60-100` giữ các key cũ trỏ thẳng sang **giá trị** của token mới,
để component chưa migrate không vỡ. Đổi tên class không đổi màu. Số đếm là trên
`components/` + `app/`, tại thời điểm viết tài liệu này — **374 lượt dùng** trên
17 alias còn sống; 12 alias dưới đây đã rỗng và chỉ còn chờ xoá key:

| Alias cũ | → Token mới | Còn | Việc cần làm |
|---|---|---|---|
| `border-border-subtle` | `border-subtle` | 185 | Đổi tên class — **lớn nhất còn lại**, và là alias duy nhất trước đây thiếu khỏi bảng này |
| `text-text-muted` | `text-secondary` | 54 | Đổi tên class |
| `text-text-primary` | `text-primary` | 37 | Đổi tên class |
| `text-accent-steel` | `text-accent` | 25 | Đổi tên class |
| `text-status-error` | `text-danger` | 14 | Đổi tên class |
| `bg-panel-bg` | `bg-surface` | 13 | Đổi tên class |
| `text-status-warning` | `text-warning` | 13 | Đổi tên class |
| `text-status-success` | `text-success` | 8 | Đổi tên class |
| `border-border-hover` | `border-strong` | 7 | Đổi tên class |
| `bg-panel-soft` | `bg-raised` | 6 | Đổi tên class |
| `text-amber-warn` | `text-warning` | 3 | Đổi tên class |
| `text-cyan-glow` | `text-accent` | 2 | Đổi tên class |
| `text-brand` | `text-accent` | 2 | Đổi tên class |
| `shadow-reasoning-glow` | `shadow-bevel-in` | 2 | Đổi tên class |
| `bg-bg-deep` | `bg-sunken` | 1 | Đổi tên class |
| `text-rose-danger` | `text-danger` | 1 | Đổi tên class |
| `text-violet-reasoning` | `text-reasoning` | 1 | Đổi tên class |
| `border-border-hairline` | `border-subtle` | 0 | ✅ **Đã xoá** key + biến `--border-hairline` (§9.8) |
| `text-emerald-safe` | `text-success` | 0 | **Xoá key ngay** |
| `bg-surface-elevated` | `bg-overlay` | 0 | **Xoá key ngay** |
| `shadow-ambient-glow` | `shadow-bevel-out` | 0 | **Xoá key ngay** |
| `bg-canvas` | `bg-sunken` | 0 | **Xoá key ngay** |
| `border-zinc-200` | `border-subtle` | 0 | **Xoá key ngay** |
| `bg-surface-subtle` | `bg-surface` | 0 | **Xoá key ngay** |
| `bg-surface-glass` | `bg-overlay` | 0 | **Xoá key ngay** |
| `border-border-control` | `border-default` | 0 | **Xoá key ngay** |
| `bg-bg-canvas` | `bg-base` | 0 | **Xoá key ngay** |
| `text-zinc-500` | `text-tertiary` | 0 | **Xoá key ngay** — đã rỗng |
| `text-zinc-600` | `text-tertiary` | 0 | **Xoá key ngay** — đã rỗng |

**Quy tắc:** KHÔNG thêm alias mới. Thêm là đẻ thêm một cách gọi cho cùng một
màu, và đó chính là thứ làm bảng màu loãng (`tailwind.config.ts:56-58`).
Xoá alias khi `grep -rn "<tên>" components/ app/` rỗng.

### 6.2 Thang `zinc` lật bậc — một cái bẫy, đã gỡ

`zinc` từng là một thang màu **bị lật**: `zinc-50` tối nhất, `zinc-950` sáng nhất,
để `text-zinc-800` trông sáng trên nền tối. Cơ chế đó **giấu nhầm** cả những chỗ
dùng sai — chữ viết bằng `text-zinc-800` có nghĩa là "gần đen" trong Tailwind mặc
định, và một người đọc code sau này sẽ hiểu sai. Nay thang đã bị gỡ khỏi hệ màu;
chỉ còn 3 bậc alias, map **theo vai trò thật sự** chứ không theo tên
(`tailwind.config.ts:82-99`):

| Còn lại | → | Vì sao |
|---|---|---|
| `zinc-200` | `border-subtle` | Viền ảnh trong markdown-renderer → viền mảnh |
| `zinc-500` | `text-tertiary` | Chữ "đang tải" ở `app/page.tsx` → chữ phụ |
| `zinc-600` | `text-tertiary` | Chữ fallback khi KaTeX lỗi → chữ phụ |

Cả 3 call site đó đã được migrate: `grep` `zinc-` trên `components/` + `app/` +
`lib/` (đã bỏ comment) trả **0 lượt**. Khối `zinc` trong `legacyAlias` nay là key
chết — xoá được ngay, cùng đợt với 12 alias rỗng ở §6.1.

---

## 7. Dark-only, không có nhánh sáng

Ứng dụng **cố ý** chỉ có một theme.

- `app/globals.css:27-101` — một khối `:root` duy nhất.
- `app/globals.css:111-113` — `.dark { color-scheme: dark }` là **no-op**. Nó tồn
  tại chỉ để `className="dark"` trên `<html>` (`app/layout.tsx:57`) không vỡ, và để
  chỗ ghi chú cho khi nào có theme thật.
- `color-scheme: dark` khai ở `:root` (`:28`) và trong `viewport`
  (`app/layout.tsx:41`).
- `app/manifest.ts:10` — `background_color` / `theme_color` = `#0d1116`, khớp với
  `viewport.themeColor`, để splash khi cài PWA không nháy trắng.

Trước đây khối `.dark` là **bản sao byte-nhất của `:root`** (0 khác biệt giá trị) —
một nhánh sáng giả: nó đổi tên, đổi icon, đổi nhãn, nhưng **không đổi màu gì cả**.

**Vì sao dark-only tốt hơn light mode nửa vời:**

| | Light mode nửa vời | Dark-only |
|---|---|---|
| Số nguồn sự thật | 2 bảng màu phải khớp nhau | 1 |
| Lỗi "cài xong rồi hỏng" | Vẫn còn class `dark:` rải rác trong component | Không có class `dark:` để sót |
| Chiều sâu | Phải thiết kế bevel/viền hai lần | Một lần, kiểm được |
| Người dùng | Đổi được theme nhưng nhìn không khác gì — tệ hơn là không cho đổi | Không có kỳ vọng sai nào để vi phạm |

Chi phí của light mode **thật** là phải chọn lại 5 tầng bề mặt, 4 bậc chữ, 3 bậc viền,
và hai hướng bevel — mỗi cái đều phải đạt tương phản riêng. Chờ khi có ai đó thực
sự cần, và làm cả bảng một lượt.

**Đã gỡ xong:** sidebar từng có một nút cycler theme đổi qua `light → dark → system`
trong khi **không gì đọc giá trị** — đổi icon và nhãn, không đổi gì khác. Nút đó và
các state của nó đã bị xoá; `components/sidebar.tsx` nay có 0 lượt chữ `theme`.
Xem §9.7.

---

## 8. Z-index

Mọi overlay lấy số từ `lib/ui-z.ts`, **không tự đặt**. Số càng lớn càng gần người
dùng.

| Lớp | z | Dùng cho |
|---|---|---|
| `content` | 0 | Chat, sidebar, status line |
| `sidebarBackdrop` | 30 | Backdrop làm mờ khi mở sidebar drawer trên mobile |
| `sidebarDrawer` | 35 | Sidebar drawer trượt trên mobile / compact viewport |
| `dropdown` | 40 | ThinkingMenu, menu ngữ cảnh phiên |
| `popover` | 50 | ModelSelector, ChatExportMenu |
| `toast` | 60 | Toast — trên dropdown, dưới modal |
| `approval` | 80 | Modal phê duyệt: DiffConfirm, ShellConfirm, StagingPanel |
| `approvalCritical` | 85 | Phê duyệt MCP — agent đang **bị chặn** chờ trả lời |
| `navigation` | 90 | Panel điều hướng: ToolsPanel, RecipesPanel, WorkspaceCheckpoints |
| `system` | 100 | Hộp thoại hệ thống: Cài đặt, xác nhận xoá |

**Bất biến:** `approval < approvalCritical < navigation < system`
(`lib/ui-z.ts:14-39`). Vi phạm từng gây lỗi thật — Cài đặt ở `z-50` nằm **dưới**
modal phê duyệt, nên mở Cài đặt trong lúc có modal thì modal vẽ đè lên Cài đặt.

---

## 9. Drift đã biết / chưa migrate

**Mục này tồn tại để tài liệu không nói dối.** Mọi thứ dưới đây là **sự thật về
codebase lúc này**, không phải mục tiêu. Nếu bạn đọc §1–§8 rồi thấy điều gì mâu
thuẫn ở đây, hãy tin phần này — và sửa nó khi nó hết đúng.

### 9.1 Alias tạm vẫn còn (374 lượt dùng, 17 alias)

Toàn bộ bảng ở §6.1. Đợt migrate vừa rồi đã đưa con số này từ ~1.100 xuống còn
**374 lượt trên 17 alias**; 12 alias còn lại trong bảng đã rỗng hoàn toàn. Đây vẫn
là phần lớn khối lượng việc còn lại. Chúng **không gây sai màu** (mỗi alias trỏ
đúng giá trị token mới) — chúng gây **tên sai**, nên đọc code không phản ánh
hệ thống.

### 9.2 Hex thô còn sót — đã gần như gỡ sạch

Bảng màu mới **không** phải bảng màu cũ. Số liệu dưới đây đếm trong đúng danh sách
hợp đồng 53 file của `tests/design-system.test.ts` và **không tính comment** (một
tên màu nhắc trong comment là tài liệu, không phải màu được vẽ ra) — cùng cách mà
assertion `bề mặt hợp đồng chỉ dùng hex trong bảng màu §2` đếm.

Trong danh sách hợp đồng **không còn hex nào thuộc bảng cũ**: toàn bộ 13 dòng dưới
đây đã rỗng, assertion xanh.

| Hex cũ | Còn | Ở bao nhiêu file | Token tương ứng |
|---|---|---|---|
| `#6a9fcc` | 0 | 0 | `accent` |
| `#e8704f` | 0 | 0 | `danger` |
| `#0d1116` | 0 | 0 | `bg-sunken` |
| `#e8993a` | 0 | 0 | `warning` |
| `#5db87a` | 0 | 0 | `success` |
| `#495059` | 0 | 0 | `border-subtle` |
| `#4b607c` | 0 | 0 | `accent-dim` |
| `#1a2330` | 0 | 0 | `bg-surface` (xấp xỉ) |
| `#757d89` | 0 | 0 | `border-strong` |
| `#1c2128` | 0 | 0 | `bg-base` |
| `#5c6470` | 0 | 0 | `text-disabled` (xấp xỉ) |
| `#a1a1aa` | 0 | 0 | màu chữ lỗi KaTeX — chưa có token |
| `#12181f` | 0 | 0 | nền khối code — chưa có token |

**Đây KHÔNG phải đề nghị thêm chúng vào bảng §2.** §2 là bảng 22 token, và
`tailwind.config.ts` khai đúng 22 — test `bảng màu trong test khớp tailwind.config.ts
theo cả hai chiều` kiểm hai chiều, nên thêm một hex cũ vào §2 sẽ làm hỏng chính
hợp đồng đó. Bảng này ghi lại **drift đã được gỡ**: mỗi dòng là một class token
đáng lẽ phải thay cho hex thô ở đúng chỗ đó.

Cột "Ở bao nhiêu file" là số file trong danh sách hợp đồng, **không** phải toàn
bộ `components/` + `app/`. Các số này giảm mỗi khi có đợt migrate; muốn số mới
thì đếm lại, đừng đoán.

Một hex thô **ngoài** danh sách hợp đồng vẫn còn: `app/manifest.ts:10` khai
`#0d1116` cho `background_color` / `theme_color`. Nó không nằm trong danh sách nên
**không ai canh** — và không nên ai canh: đó là màu splash PWA, một hợp đồng riêng
với `viewport.themeColor` (`app/layout.tsx:37-40`), xem §7. Nó **không** phải
drift, dù lệch với `--bg-sunken` (`#07090d`) hiện tại — cố ý giữ nguyên để splash
không nháy trắng lúc cài app.

**Lỗ hổng của chính assertion trên đã được bịt:** nó chỉ soi component, nên token màu
khai trong chính `app/globals.css` không bao giờ đi qua — và dạng channel RGB thì
regex `#hex` cũng không thấy. Nay có assertion riêng quét thẳng file đó. Xem §9.8.

Hai hex `#07090d` / `#e8eaed` trong `app/global-error.tsx:36` và `#07090d` ở
`app/layout.tsx:38-39` là **cố ý hardcode inline** (chữ không trắng trước
first-paint) và **đều thuộc** bảng §2, nên không nằm trong bảng drift ở trên.

### 9.3 Cỡ chữ tuỳ ý — gần như hết, thang 6 bậc đã thắng

Số đếm trên `components/` + `app/` (`.tsx` / `.ts` / `.css`), **không tính comment**:

| Arbitrary | Còn | Bậc nào tương ứng |
|---|---|---|
| `text-[11px]` | 43 | `text-meta` |
| `text-[10px]` | 10 | `text-micro` |
| `text-[12px]` | 6 | `text-ui` |
| `text-[10.5px]` | 6 | **không có bậc nào** |
| `text-[11.5px]` | 4 | **không có bậc nào** |
| `text-[16px]` | 3 | **không có bậc nào** |
| `text-[13px]` | 2 | `text-body` |
| `text-[9.5px]`, `text-[12.5px]`, `text-[14px]`, `text-[15px]`, `text-[24px]`, `text-[32px]` | mỗi cái 1 | lẫn lộn |
| `text-[9px]`, `text-[13.5px]`, `text-[20px]` | 0 | đã gỡ sạch |

Tệ nhất là `10.5px` / `11.5px` / `12.5px` / `16px`: chúng không khớp bậc nào, tức
là **không thuộc hệ thống** chứ không chỉ là gõ tắt. Riêng `text-[16px]` xuất hiện
3 lần, đều là tiêu đề font-pixel (`staging-panel.tsx:75`, `vyen-logo.tsx:88`,
`workspace-checkpoints.tsx:196`) — gần `head` (20px) hơn là bậc nào.

Còn `text-xs` (Tailwind mặc định 12px, 39 chỗ) và `text-sm` (14px, 9 chỗ) cũng đang
dùng; config giữ nguyên giá trị mặc định của chúng (`tailwind.config.ts:255-257`)
vì đổi số ở đó là đổi diện mạo toàn ứng dụng trong một lần, còn mỗi lần đổi tên
class thì an toàn.

### 9.4 `rounded-lg` / `rounded-xl` còn 2 chỗ

| Class | Còn |
|---|---|
| `rounded-lg` | 1 |
| `rounded-xl` | 1 |
| `rounded-2xl` | 0 |
| `rounded-3xl` | 0 |

Hai chỗ còn lại là `components/chat/stream-bubble.tsx:102` (`rounded-lg`) và
`components/subagent-card.tsx:56` (`rounded-xl`). Theo §4.1 chúng **không sinh gì**,
nên giao diện hiện tại là vuông — tức là hành vi đúng, chỉ là class đó là rác. Nhưng
chúng sẽ **bật bo tròn ngay lập tức** nếu ai đó định nghĩa lại `lg`. Đổi 2 tên class
này là việc còn lại.

### 9.5 Modifier opacity trên token chữ — đã gỡ xong (0 chỗ)

Trước đây 13 chỗ (`text-text-muted/40`, `/50`, `/60`, `/70` ở `composer.tsx`,
`diff-confirm.tsx`, `shell-confirm.tsx`, `hud/agent-hud.tsx`, `chat/tool-trace.tsx`,
`settings-dialog.tsx`). Nay **0 chỗ** trong toàn bộ danh sách hợp đồng — assertion
`không dùng modifier opacity trên token CHỮ` xanh. Đừng thêm lại: cấm theo §2.2.

### 9.6 Thang z-index: tài liệu cũ thiếu một bậc

`lib/ui-z.ts:34` khai `approvalCritical: 85` trong `Z_INDEX` (`lib/ui-z.ts:14-39`),
và `Z_CLASS` ánh xạ nó thành `z-[85]` (`lib/ui-z.ts:44-55`). Bảng ở §8 đã đưa vào.
Nếu bạn đọc bản cũ của tài liệu này và thấy thiếu bậc này, đó là lỗi của bản cũ.

### 9.7 Vài thứ khác

- **Theme cycler chết: đã gỡ xong.** `components/sidebar.tsx` nay có **0 lượt** chữ
  `theme` — nút `light → dark → system` và các state nó đọc đã bị xoá hết. Xem §7.
- **`bevel-out` dùng thẳng ở 9 chỗ, không phải 2.** `app/error.tsx:18`,
  `app/global-error.tsx:38`, `components/audit-viewer-dialog.tsx:213`,
  `components/chat/tool-trace.tsx:224`, `components/composer.tsx:937`,
  `components/diff-confirm.tsx:301`, `components/mcp/tool-approval-dialog.tsx:115`,
  `components/settings-dialog.tsx:177`, `components/shell-confirm.tsx:63`.
  (`bevel-in` thì 5 chỗ, không có file màn hình lỗi nào.) Phần còn lại đi qua recipe
  trong `app/globals.css` (`.surface-panel`, `.settings-card`, `.btn-secondary` ở
  `:406,442,478`; `.field*`/`.btn-primary` dùng `bevel-in` ở `:422,427,437`). Nếu một
  component tự dựng khối nổi bằng `className` thuần mà không dùng recipe, nó phải tự
  thêm `shadow-bevel-out`.
- **Không có `dark:` variant nào** trong codebase (0 lượt) — đúng theo §7.

### 9.8 Màu cũ né được assertion hex — đã gỡ

**Đã xử lý.** Cả `--border-hairline` và `--line` (`73 80 89` = `#495059`, màu
viền của bảng màu cũ) đã bị xoá khỏi `app/globals.css`, kèm mapping
`token('--border-hairline')` trong `tailwind.config.ts`. Lý do gỡ chứ không phải
đổi màu: cả hai token đều **không component nào dùng** — `border-hairline` chỉ còn
ở đúng 2 chỗ là dòng định nghĩa và dòng mapping, và `--line` không được map trong
`tailwind.config.ts` lẫn không có lượt dùng nào. Nên sửa màu sẽ vô nghĩa, xoá mới
đúng; đổi `--line` sang `border-strong` như gợi ý cũ là việc làm cho code chết.

Lỗ hổng của assertion thì **vẫn còn và đã được bịt**. Nguyên nhân: assertion
`bề mặt hợp đồng chỉ dùng hex trong bảng màu §2` chỉ soi **component**, còn token lạ
nằm trong chính file định nghĩa nên không bao giờ đi qua nó — và dạng channel RGB
thì regex `#[0-9a-fA-F]{3,8}` không thấy nữa. Nay có assertion
`mọi giá trị màu khai báo trong globals.css đều thuộc bảng màu §2` quét thẳng
`app/globals.css`, đổi hex của §2 sang kênh RGB rồi so trực tiếp — bắt được mọi
token màu, kể cả token viết tay. Đã kiểm hai chiều: thêm lại `--border-hairline`
thì assertion đỏ với đúng thông điệp.


---

## 10. Hợp đồng được kiểm chứng bằng gì

`tests/design-system.test.ts` là cơ chế thực thi. Chạy:

```
npx vitest run tests/design-system.test.ts
```

### 10.1 Test kiểm gì

| Assertion | Bắt được loại trôi nào |
|---|---|
| `@keyframes blink` có bước `opacity: 1` → `0` | Con trỏ terminal bị đổi thành fade mềm |
| `.streaming-caret::after` / `.terminal-cursor` dùng `rgb(var(--accent))` + `var(--font-mono)` + `animation: blink 1s step-end infinite` | Con trỏ đổi màu hoặc đổi font khỏi hợp đồng |
| Mọi `boxShadow` **trừ** `bevel-out` / `bevel-in` phải là `'none'` | Bóng mềm lọt vào qua `theme.extend.boxShadow` |
| `borderRadius` **không** định nghĩa `lg` / `xl` / `2xl` / `3xl` | `rounded-lg` bật lại bo tròn |
| `borderRadius` định nghĩa đúng `none: '0px'`, `sm`, `md` / `DEFAULT`, `full` | Đổi lệch quy tắc bo góc |
| `bevel-out` / `bevel-in` là hai key không-`none` **duy nhất** | Thêm bóng thứ ba |
| Mỗi `.bevel-*` có **đúng bốn** cạnh, tất cả `inset`, và giống hệt giá trị trong `tailwind.config.ts` | Bevel bị nhân bản / viết tay / lệch giữa hai nguồn |
| Recipe `@apply` **bevel class**, không có khối `rgba()` viết tay | Quay lại tay dán bevel 7 lần |
| Hex thô chỉ được dùng hex trong bảng màu §2 (bỏ qua comment) | Hex mới chui vào không ai duyệt |
| Không Tailwind palette (`text-red-400`, `bg-zinc-800`, …) | Lọt họ màu mặc định |
| Không `text-white` / `color: #fff` | Chữ trắng tinh thay cho `text-primary` |
| Không modifier opacity trên token chữ | `text-text-muted/40` |
| File trong danh sách phải dùng ít nhất một class token | File bị bỏ sót ngoài hệ thống |
| Không `#55779b` (fail WCAG AA) | Màu chữ không đạt tương phản |
| Mọi `<button>` trong `sidebar.tsx` / `backup-reminder.tsx` có `rounded-none` | Bo góc lọt vào control chính |
| Composer full-bleed | Khung `max-w-thread` quay lại |
| Vùng chạm trigger 44px | Vùng chạm co lại dưới WCAG 2.5.5 |

### 10.2 Test KHÔNG kiểm gì — đừng hỏi nó

- **Nó không kiểm thứ tự 5 tầng bề mặt** có sáng dần đều hay không. Ai sửa
  `hex.surface` thành một màu tối hơn `hex.raised` sẽ không bị bắt.
- **Nó không kiểm 3 bậc viền có đúng vai trò** — không thể kiểm bằng regex, chỉ
  kiểm được bằng mắt. §2.3 là quy tắc để người đọc giữ.
- **Nó không kiểm bao nhiêu component đã migrate.** Danh sách file là hợp đồng:
  file có trong danh sách thì phải sạch, file không có trong danh sách thì **không ai
  canh**. Mở rộng danh sách là việc của từng đợt migrate.
- **Nó không kiểm nội dung.** Một component dùng đúng token sai vai trò vẫn xanh.
- **Nó không kiểm tương phản WCAG** ngoài một màu đã biết.
- **Nó không kiểm `z-index`** — thang đó có test riêng ở đâu đó khác.

- **Nó không kiểm comment.** Mọi assertion soi mã đều cắt `/* … */` trước khi
  so. Tên màu nhắc trong comment ("hairline #495059", "sửa `.bevel-out`…") là
  tài liệu, không phải màu được vẽ ra — và tài liệu gọi tên màu cũ là điều ĐÚNG.
  Nếu thấy một assertion đỏ vì comment, hãy sửa assertion theo mẫu này, đừng
  xoá comment.

Một tài liệu design system mà chỉ test được một nửa vẫn tốt hơn không tài liệu —
miễn là phần không test được được viết ra thành quy tắc rõ ràng, đúng như §10.2
này.
