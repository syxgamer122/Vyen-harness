# DESIGN.md — Vyen Harness Design System

> Tài liệu này **mô tả** hệ thống đang chạy, không mô tả hệ thống mong muốn. Mỗi
> khẳng định ở đây đều có một nơi kiểm chứng: `tests/design-system.test.ts`, hoặc
> dòng `file:line` được nêu kèm. Ai viết code mà làm tài liệu này sai sẽ khiến
> **test đỏ**, không phải tài liệu sai.
>
> **LƯU Ý VỀ NGUỒN SỰ THẬT:** mảng `hex` trong `tailwind.config.ts` là các giá
> trị **tĩnh**, KHÔNG phải `rgb(var(--token))`. Sửa `:root` trong `globals.css`
> một mình sẽ **không** đổi màu của `bg-sunken` / `text-primary` / `border-subtle`
> … — phải sửa **cả hai** file. (Chỉ 13 key alias cũ mới đọc qua `var()`.)

---

## Ràng buộc cứng

Đọc mục này **trước khi sửa bất cứ thứ gì trong `components/` hoặc `app/`**. Bảy
dòng dưới là **hợp đồng**, không phải sở thích: mỗi dòng có một assertion trong
`tests/design-system.test.ts` canh đúng tên nó. Vi phạm làm test đỏ, nên nó là
lỗi chứ không phải lựa chọn phong cách — kể cả khi bạn cho rằng hệ thống cũ sai
và muốn sửa nó. Muốn sửa thì sửa `tailwind.config.ts` + `app/globals.css` +
`tests/design-system.test.ts` **cùng một lần**; sửa một bên là tạo hai nguồn sự
thật.

| # | Ràng buộc | Assertion canh |
|---|---|---|
| 1 | Bóng đổi chỉ đến từ đúng 4 nguồn `.lift-sm` / `.lift-md` / `.lift-lg` / `.well`. Không khai `box-shadow` ở chỗ khác | `chiều sâu: đúng 4 nguồn sinh bóng, không có nguồn thứ năm` |
| 2 | Bo góc là thang px đơn điệu 9 bậc, mỗi bậc là **một** số px. Không `ink` / `wobble`, không bán kính bất đối xứng | `borderRadius là thang THẬT theo vai trò, không còn chốt vuông` |
| 3 | Chữ chỉ dùng 6 bậc `micro` / `meta` / `ui` / `body` / `read` / `head`. Cỡ px tự chế lệch bậc là cấm | `không còn cỡ chữ px tự chế nào lệch bậc trong thang 6 bậc` |
| 4 | Mọi màu phải là token trong bảng §2. Cấm palette Tailwind, cấm `text-white`, cấm modifier opacity trên token **chữ** | `bề mặt hợp đồng không dùng class màu Tailwind mặc định (red-500, zinc-400…)` · `không dùng modifier opacity trên token CHỮ (text-tertiary/60 — fail WCAG AA)` |
| 5 | Viền luôn 1px, và khai độ rộng viền thì phải khai kèm màu — recipe lẫn class | `recipe @apply đặt độ rộng viền thì phải @apply kèm màu` · `class đặt độ rộng viền phải có class màu CÙNG variant trong cùng className` |
| 6 | Light-only. Thêm bất kỳ biến thể `dark:` nào là dựng nhánh sáng nửa vời thứ hai | `app là dark-only: không có biến thể dark: nào trong component` |
| 7 | Ô nhập không được xoá dấu hiệu focus; phần tử bấm được phải đổi con trỏ tay | `ô nhập KHÔNG được xoá dấu hiệu focus (outline-none là anti-pattern hạng 1)` · `mọi phần tử bấm được đều đổi con trỏ tay` |

Ba cái bẫy ngôn ngữ, đều đã gặp và đã sửa — đừng "sửa ngược":

- **Class chết** (`class CHẾT đã bị gỡ khỏi hệ thống không được còn gọi trong
  components/ và app/`): còn nằm trong JSX nhưng không còn sinh CSS. Danh sách cấm
  là hằng số `DEAD_CLASSES` trong test — class mới chết mà không có tên trong danh
  sách thì lọt. Đừng tin một class chỉ vì nó còn trong code.
- **Khối `.dark` trong `globals.css:121` là no-op có chủ đích.** Nó khai
  `color-scheme: light`, không phải `dark`, để một class `dark` rơi sót chỉ làm
  form control của trình duyệt đổi bảng màu chứ không dựng lại cả theme. Đừng xoá
  khối đó và đừng biến nó thành theme tối.
- **`--panel-bg`, `--status-warning`, `--text-primary`** là alias của §2.6, đều trỏ
  đúng giá trị token thật. Chúng không phải màu mới; đổi tên không đổi màu.

---

## 0. Mục lục

| § | Nội dung |
|---|---|
| [Ràng buộc cứng](#ràng-buộc-cứng) | 7 điều có test canh — đọc trước khi sửa bất cứ thứ gì trong UI |
| [1](#1-quy-tắc-gốc) | Quy tắc gốc — một câu, kèm hệ quả bắt buộc |
| [2](#2-token-màu) | Token màu: bề mặt, chữ, viền, trạng thái, diff — kèm HEX |
| [3](#3-typography) | Typography: 2 họ chữ, 6 bậc cỡ chữ, quy tắc phân cấp |
| [4](#4-bo-góc--khoảng-cách) | Bo góc đều theo vai trò và khoảng cách |
| [5](#5-chiều-sâu--bóng-mềm) | Chiều sâu: bóng mềm, 4 nguồn sinh bóng |
| [6](#6-chính-sách-màu-trạng-thái) | Chính sách màu trạng thái + danh sách alias tạm |
| [7](#7-light-only--không-có-nhánh-tối) | Light-only: một hướng duy nhất |
| [8](#8-z-index) | Thang z-index (`lib/ui-z.ts`) + [8.1](#81-bề-mặt-overlay--menu-popover-dialog-toast) bề mặt overlay |
| [9](#9-drift-đã-biết--chưa-migrate) | **Drift đã biết / chưa migrate** — mục quan trọng nhất |
| [10](#10-hợp-đồng-được-kiểm-chứng-bằng-gì) | Test kiểm chứng cái gì, và cái nó **không** kiểm |
| [11](#11-nhật-ký-rà-soát-giao-diện-checklist-ui-ux-pro-max) | **Nhật ký rà soát** `ui-ux-pro-max` — lịch sử, không phải spec |
| [12](#12-nghiệm-thu-giao-diện) | Nghiệm thu giao diện — phần không test tự động |
| [13](#13-thiết-kế-đích-và-kế-hoạch-chuyển-tới) | **Thiết kế đích + migration** — không phải spec, chưa triển khai |

---

## 1. Quy tắc gốc

> **Giao diện này tối giản trên nền trắng: viền 1px, bo góc đều, bóng mềm, một
> bảng màu trung tính và đúng một màu nhấn. Mọi chiều sâu phải đọc được bằng
> mắt trước khi đọc được bằng code — nếu một khối không khiến mắt biết nó nổi
> hay chìm, khối đó chưa xong.**

Bốn hệ quả cụ thể, mỗi cái đều kiểm được:

1. **Chiều sâu = bóng mềm, đúng 4 nguồn.** `.lift-sm` / `.lift-md` / `.lift-lg` /
   `.well` là toàn bộ cơ chế nổi/chìm và là nguồn DUY NHẤT được phép khai báo
   `box-shadow`. Xem §5.
2. **Viền mang đúng MỘT vai trò, và luôn mảnh.** Ba bậc `subtle` / `default` /
   `strong`. Không có viền 2px trong hệ này. Xem §2.3.
3. **Bo góc đều là mặc định.** Thang px `4 → 6 → 8 → 10 → 12 → 16 → 20`, một
   bán kính cho cả bốn góc. Dạng bất đối xứng (`ink`/`wobble`) đã bị gỡ. Xem §4.1.
4. **Chiều sâu đến từ ánh sáng, không từ nét vẽ.** Không doodle, không đuôi bong
   bóng, không nhấn dịch bóng, không chữ vẽ tay. Xem §3, §5.

Ứng dụng **light-only** — xem §7.

---

## 2. Token màu

### 2.1 Bề mặt — 5 tầng, đều nhau trên nền trắng

| Token | HEX | Dùng cho |
|---|---|---|
| `bg-sunken` | `#f7f7f7` | ngoài cùng — nền app, sidebar |
| `bg-base` | `#fcfcfc` | vùng làm việc chính — chat stream, composer |
| `bg-surface` | `#ffffff` | khối nội dung — thẻ, bubble, dải tiêu đề |
| `bg-raised` | `#f5f5f5` | control — ô nhập, nút, khối hover, code |
| `bg-overlay` | `#ffffff` | nổi trên cùng — popover, dropdown, menu |

Trên giấy trắng, chiều sâu **không** đến từ độ sáng của nền nữa (nền sáng hơn =
nổi hơn), nên năm tầng này chỉ lệch nhau rất nhỏ. `surface` và `overlay` cùng
trắng; `sunken` và `base` lệch 2–4 điểm.

### 2.2 Chữ — 4 tầng theo VAI TRÒ, mỗi tầng đều đạt WCAG AA

| Token | HEX | Tương phản trên `#fff` | Dùng cho |
|---|---|---|---|
| `text-primary` | `#18181b` | **17.7:1** | nội dung chính |
| `text-secondary` | `#575757` | **7.2:1** | mô tả, nhãn phụ, metadata |
| `text-tertiary` | `#6f6f6f` | **5.0:1** | nhãn nhóm, gợi ý, dấu thời gian |
| `text-disabled` | `#a3a3a3` | 2.5:1 | control bị vô hiệu — WCAG miễn trừ |

Số trong bảng đo trên `#fff`. Chữ không phải lúc nào cũng nằm trên nền trắng, nên
đo lại trên nền nó thật sự nằm: `tertiary` 4.69:1 trên `#f7f7f7`, 4.61:1 trên
`#f5f5f5` — vẫn qua AA nhưng dưới 5:1. Chữ nào tiến sát ngưỡng thì đừng đặt lên
nền xám; `secondary` và `primary` thì dư sức ở mọi nền của hệ.

`text-disabled` không phải "mờ hơn tertiary" mà là **"không dùng được"** — đừng
dùng nó cho nội dung.

**Cấm modifier opacity trên token chữ.** 60% của một màu đã chọn để đạt AA thì
không còn đạt. `bg-surface/60` hay `border-danger/40` vẫn hợp lệ vì nền/viền
không mang thông tin chữ.

### 2.3 Viền — 3 tầng, mỗi tầng một việc

| Token | HEX | Tương phản | Dùng cho |
|---|---|---|---|
| `subtle` | `#e5e5e5` | 1.26:1 | đường phân cách **giữa các dòng trong một khối** |
| `default` | `#949494` | **3.03:1** trên nền trắng, **2.78:1** trên `#f5f5f5` | ranh giới **control** — input, nút, ô chọn |
| `strong` | `#525252` | 7.8:1 | hover / focus / selected |

`default` đạt 3:1 là yêu cầu của WCAG 1.4.11 cho ranh giới control. Đây là lý do
 nó không xuống `#d4d4d4` cho "nhẹ hơn": viền input nhạt hơn 3:1 là **không nhìn
thấy**, mà ô nhập không nhìn thấy thì không phải ô nhập.

**3:1 chỉ đúng trên nền trắng, và khác biệt nền KHÔNG thay thế được viền.**
`default` trên `#f5f5f5` là 2.78:1, trên `#f7f7f7` là 2.83:1 — dưới ngưỡng. Mà
nền trên nền thì gần như bằng nhau: `#f5f5f5` so với trắng là **1.09:1**, so với
`#f7f7f7` là **1.02:1**. Nên câu "control trên nền xám dùng `subtle` và khác biệt
nền bù cho viền" là **sai** — nó vi phạm chính WCAG 1.4.11 mà luật đó sinh ra.

Luật đúng, theo đúng câu chữ của 1.4.11 (tín hiệu **cần thiết** để nhận diện
control hoặc trạng thái phải đạt 3:1):

- **Control mà ranh giới là tín hiệu nhận diện duy nhất** — input, select, checkbox,
  radio, switch — phải nằm trên nền trắng (`surface` / `overlay`) với `default`,
  hoặc dùng `strong`. Recipe `.field` / `.field-sm` đã đúng cả hai vế.
- **Control được nhận diện bằng nhãn** — nút, chip, phân đoạn, trigger có chữ — được
  dùng `subtle` trên nền xám, vì ở đó tín hiệu nhận diện là chữ chứ không phải viền.
- `subtle` không bao giờ được dùng làm ranh giới của một input. Nó là đường phân
  cách **trong** một khối.

Đo lại khi thêm control mới, đừng copy 3.03:1 từ đây mà quên kiểm nó nằm trên nền
nào.

Viền luôn **1px**. Viền 2px là dấu hiệu của hệ cũ (nét mực) và đã bị gỡ khỏi toàn
bộ recipe trong `globals.css` cùng 7 call site trong component.

### 2.4 Nhấn & trạng thái

| Token | HEX | Dùng cho |
|---|---|---|
| `accent` | `#2a7360` | nhấn chủ đạo: link, con trỏ, viền focus — 5.6:1 |
| `accent-dim` | `#7fb8a6` | nhấn bị tắt, cột biểu đồ, chấm trạng thái — **2.26:1** trên trắng, 2.07:1 trên `#f5f5f5`: **dưới** ngưỡng 3:1 cho vật thể đồ hoạ. Xem §9.5 |
| `accent-soft` | `#f0f4f3` | **nền** nhấn nhạt — tag active, bubble người dùng |
| `on-fill` | `#ffffff` | chữ trên nền tô đậm |
| `success` / `warning` / `danger` / `info` | `#167a4a` / `#9a6206` / `#b3261e` / `#0369a1` | trạng thái |
| `reasoning` | `#6d4aa8` | khối suy luận — màu riêng, không dùng cho trạng thái |

`accent-soft` là token **nền**, không phải token chữ — nó tách riêng khỏi `accent`
vì nền nhạt trên giấy trắng chỉ đạt ~1.1:1, không đọc được.

`reasoning` là token **chữ**, không phải token nền. Dùng nó làm nền đặc sẽ hạ
`text-primary` trên nền đó xuống ~2.4:1 (fail AA). Nền suy luận phải là
`bg-reasoning/10` + chữ `text-primary`.

### 2.5 Diff

`diff-add` `#1f7a3d` · `diff-del` `#b3261e` · `diff-ctx` `#575757`.
Màu CHỮ mang thông tin (thêm / bớt / giữ nguyên); nền chỉ nâng 8%, đủ để mắt quét
dọc cột mà không tranh chấp với chữ.

### 2.6 Alias tạm

Các component chưa migrate sang tên mới vẫn dùng những tên cũ ở khối
`ALIAS LƯỚT` trong `globals.css` và `ALIAS TẠM` trong `tailwind.config.ts`. Mỗi
biến chỉ là **cách viết khác của một token ở trên**, nên migrate tên không đổi
màu. **KHÔNG thêm alias mới** — thêm là đẻ thêm một cách gọi cho cùng một màu,
và đó chính là thứ làm bảng màu loãng.

---

## 3. Typography

**Hai họ chữ, hai việc.**

| Họ | Font | Dùng cho |
|---|---|---|
| `mono` | JetBrains Mono | **mặc định cho control và nhãn** trong khối công cụ, và mọi thứ do máy sinh ra: code, token, id, đường dẫn, hash, timestamp |
| `sans` | Inter | prose đọc dài (`.claude-prose` kế thừa từ preflight) và chữ trang trí — wordmark, avatar |

Sai lệch này từng được ghi ngược trong tài liệu: bảng cũ nói sans cho "toàn bộ
nhãn, nút", nhưng code thì ngược lại — `font-mono` có mặt ở 48 file
`components/` + `app/`, `font-sans` chỉ 10 file, và các recipe `.menu-item`,
`.field-label`, `.btn-primary` đều khai `font-mono`. Sửa bảng cho đúng code, không
đổi code: mono là lựa chọn có chủ đích cho giao diện công cụ, sans dành cho chữ
đọc. Nếu đổi chiều này thì đổi cả hai bên cùng lúc, không sửa riêng bảng.

Chữ vẽ tay (Patrick Hand) **đã bị gỡ khỏi hệ**. Lý do đo được, không phải thẩm
mỹ: Patrick Hand chỉ có **một nét** (weight 400), nên phân cấp đậm/nhạt buộc
phải làm bằng **cỡ chữ** — dẫn tới nhãn 12px mỏng đến mức dưới ngưỡng đọc thoải
mái trên nền trắng. Sans có đủ các nét, nên cùng một cỡ chữ vẫn phân cấp được mà
không phải làm nhạt đi.

`.uic` trong `globals.css` giờ là lớp chữ UI: sans, weight 500, letter-spacing
`-0.01em`.

**Sáu bậc cỡ chữ, mỗi bậc là một VAI TRÒ:**

| Bậc | px | Dùng cho |
|---|---|---|
| `micro` | 10 | siêu nhỏ, dấu phân biệt, số đếm |
| `meta` | 11 | timestamp, metadata, chú thích nhỏ |
| `ui` | 12 | nhãn, nút, chữ trong khối giao diện (mặc định) |
| `body` | 13 | nội dung trong ô nhập, dòng bảng |
| `read` | 15 | văn bản đọc dài (markdown, đoạn văn) |
| `head` | 20 | tiêu đề khối lớn |

`fontSize` giữ nguyên `xs`/`sm`/`base` của Tailwind cho tới khi từng component
chuyển sang tên bậc mới — đổi số ở đó là đổi diện mạo toàn ứng dụng trong một lần,
còn mỗi lần đổi tên class thì an toàn.

---

## 4. Bo góc & khoảng cách

### 4.1 Thang bo góc — đều, nhỏ

| Bậc | px | Dùng cho |
|---|---|---|
| `none` | 0 | — |
| `sm` | 4 | chip nhỏ, badge, ô inline |
| `DEFAULT` | 6 | control nhỏ, chip |
| `md` | 8 | nút icon (`.icon-btn`) |
| `lg` | 10 | **control chính**: nút (`.btn-*`), ô nhập (`.field`), hàng menu (`.menu-item`) |
| `xl` | 12 | khối nội dung: thẻ settings, panel, vỏ overlay (`.surface-panel`) |
| `2xl` | 16 | khối lớn: bubble, khung modal, vỏ composer |
| `3xl` | 20 | dự phòng, lớn hơn mọi khối đang dùng |
| `full` | 9999 | hình tròn |

**Mặc định theo component** — đọc bảng trên khi phân vị, còn đây là câu trả lời
cho câu hỏi "control này bo bao nhiêu":

| Loại | Bo góc | Recipe |
|---|---|---|
| Chip, badge, ô inline | 4px (`sm`) | — |
| Nút icon | 8px (`md`) | `.icon-btn` |
| Nút, ô nhập, hàng menu, trigger | 10px (`lg`) | `.btn-primary`, `.field`, `.menu-item` |
| Khối nội dung, vỏ overlay | 12px (`xl`) | `.surface-panel` |
| Khung modal, vỏ composer | 16px (`2xl`) | `settings-dialog.tsx` |

Ba bậc `DEFAULT` / `md` / `lg` trước đây đều được ghi là "control", nên không ai
biết chọn bậc nào. Bảng trên chốt lại: **control chính là `lg` 10px**, và đó là
thứ code đang làm — đừng "sửa" recipe về 8px chỉ vì 8px tròn hơn.

**Dạng bất đối xứng (`ink`/`wobble`) đã bị gỡ khỏi hệ.** Hai lý do:

1. **Mép chữ dịch.** Bán kính lệch nhau giữa bốn góc làm vị trí ký tự đầu/cuối
   dòng đổi theo chiều cao khối — cùng một nội dung mà hai lần hiển thị lệch nhau.
2. **Viền đã đảm nhiệm ranh giới.** Một bán kính đều cho cả bốn góc là thứ mắt
   đọc nhanh nhất trên nền trắng; bo thêm một lớp tín hiệu ở góc là thừa.

Assertion `borderRadius là thang THẬT theo vai trò` **cấm** `ink`/`wobble` quay
lại dưới bất kỳ dạng nào (xem §10.1).

`rounded-full` được ghim `!important` trong `globals.css` vì các class ghép
(`sm:rounded-full`, `hover:rounded-full`) đều phải ra hình tròn.

### 4.2 Khoảng cách

Thang Tailwind mặc định (4px) là đủ. Hai nơi được ghim cứng vì chúng phải khớp
nhau chứ không vì đẹp:

- **Cột hội thoại** dùng chung token `maxWidth.thread` với composer. Không nơi
  nào được tự khai `max-w-4xl`.
- **Gutter ngang** là `px-5` ở cả `message-list` lẫn `composer`; hàng tin nhắn
  không tự thêm padding ngang.

---

## 5. Chiều sâu — bóng mềm

Bốn class này là **toàn bộ** cơ chế nổi/chìm và là nguồn DUY NHẤT được phép khai
báo `box-shadow`; chúng được expose thành `shadow-lift-sm|md|lg` trong
`tailwind.config.ts`.

| Class | Giá trị | Dùng cho |
|---|---|---|
| `.lift-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | control nhỏ: chip, nút icon |
| `.lift-md` | `0 1px 3px 0 rgb(0 0 0 / 0.06), 0 6px 16px -4px rgb(0 0 0 / 0.08)` | khối nội dung: thẻ settings, menu, hộp thoại |
| `.lift-lg` | `0 2px 6px 0 rgb(0 0 0 / 0.07), 0 16px 40px -8px rgb(0 0 0 / 0.12)` | lớp trên cùng: modal, popover, dropdown |
| `.well` | `inset 0 1px 2px 0 rgb(24 24 27 / 0.04)` | ô nhập chìm: composer, input trong sidebar/settings |

`.lift-*` là bóng **NGOÀI** vùng, không `inset`. Một bộ "nâng" luôn có một cạnh sáng
và một cạnh tối nên nó phải vẽ bóng; `.well` thì ngược lại — bóng nằm TRONG để
đọc ra "khoét vào".

**Giá trị phải khớp BYTE giữa `globals.css` và `tailwind.config.ts`** — sửa một bên
thì phải sửa cả bên kia, và test `giá trị lift-* trong config khớp BYTE với
globals.css` so từng LAYER để bắt lệch thứ tự.

**Nút không sinh bóng.** `.btn-primary` (nền mực đậm) và `.btn-secondary` (viền
1px) cố ý **không** `@apply` bóng nào: trên nền trắng, nền tô đậm hoặc viền đã đủ
tách, và thêm bóng chỉ làm mép nút nhoè đi. Bóng là chiều sâu **dành cho khối nội
dung**, không phải cho control.

### 5.1 Những thứ đã cắt, và vì sao

| Đã gỡ | Lý do |
|---|---|
| Nét mực 2px + bóng lệch cứng (`2px 2px 0 rgb(0 0 0/.9)`) | Trên nền trắng, mỗi khối mang một vệt đen đặc chạy song song viền — đọc ra như tem dán, không phải chiều sâu |
| Đuôi bong bóng `.bubble-*/::after` | Trang trí thuần: mép bo góc đã mang hết thông tin, mỗi đuôi là thêm một đường viền vẽ tay + một phần tử giả |
| Nhấn dịch bóng `active:translate-x/y-[2px]` | Nhấn đã có phản hồi rõ qua đổi nền; dịch bóng trên bóng mềm không đọc ra "ấn" mà chỉ làm mép nút rung |
| Bo góc bất đối xứng | Mép chữ dịch theo chiều cao khối — xem §4.1 |
| Chữ vẽ tay (Patrick Hand) | Một nét duy nhất → phân cấp đậm bằng cỡ chữ → nhãn 12px mỏng dưới ngưỡng đọc — xem §3 |
| Nền lưới giấy `body::before` | Không mang thông tin, chỉ thêm nhiễu và làm cạnh thẳng trông cứng |

---

## 6. Chính sách màu trạng thái

Một bảng màu trạng thái duy nhất cho toàn ứng dụng: `success` / `warning` /
`danger` / `info` / `reasoning` (§2.4).

**Quy tắc bắt buộc:** ý nghĩa **không được chỉ dựa vào màu**. Mọi trạng thái phải
có thêm một tín hiệu thứ hai — chữ, icon, hoặc viền. Đây là hạng 10 (Charts &
Data) và hạng 1 (Accessibility) của nguyên tắc thiết kế, và là lý do `diff-add`
/ `diff-del` / `diff-ctx` khác nhau ở **màu chữ** chứ không chỉ ở nền.

`reasoning` là màu riêng cho khối suy luận, không dùng lại cho trạng thái nào.

---

## 7. Light-only, không có nhánh tối

Ứng dụng có **một** hướng hình ảnh: nền trắng. `darkMode: 'class'` vẫn khai trong
config nhưng `<html>` **không** mang class `dark`, khối `.dark` trong `globals.css`
là no-op khai `color-scheme: light`.

Lý do khối no-op tồn tại thay vì xoá hẳn: chỉ cần một class `dark` rơi sót là toàn
bộ form control của trình duyệt đổi sang bảng màu tối — nên nó cố ý khai
`color-scheme: light` để một lỗi đó chỉ hậu quà nhẹ nhất.

Assertion `app là dark-only` chặn mọi biến thể `dark:` trong danh sách hợp
đồng — thêm `dark:` trở lại là dấu hiệu đang cố dựng nhánh sáng nửa vời thứ hai.

`theme_color` trong `app/layout.tsx` và `app/manifest.ts` phải trùng nhau và trùng
`bg-sunken` (`#f7f7f7`): đó là màu splash PWA, lệch một bậc là thấy vệt trắng nháy
trước khi shell kịp vẽ.

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
modal phê duyện, nên mở Cài đặt trong lúc có modal thì modal vẽ đè lên Cài đặt.

### 8.1 Bề mặt overlay — menu, popover, dialog, toast

**Không có test canh phần này** (§10.2) — nên nó là quy tắc cho người đọc, và mọi
dòng dưới đây là **cái code đang làm**, không phải điều mong muốn. Sửa bề mặt
overlay là sửa điện mạo của nhiều màn hình cùng lúc: đọc hết `§4` (bo góc), `§5`
(bóng), `§2` (màu) trước.

**Vỏ theo loại:**

| Loại | class thật trong code | Lớp z |
|---|---|---|
| Menu gắn trigger | `surface-panel animate-pop-in p-1.5` (`thinking-menu.tsx:303`) | `dropdown` |
| Menu rời: xuất khẩu, chọn model | `surface-panel` rồi ghi đè `lift-md rounded-xl border border-subtle bg-overlay p-1` (`chat-export-menu.tsx:103`, `model-selector.tsx:380`) | `popover` |
| Dialog | `lift-lg rounded-2xl border border-default bg-overlay shadow-lift-lg`, vỏ `max-w-4xl`, cao `max-h-[min(70vh,calc(100dvh-3rem))]` (`settings-dialog.tsx:191`) | `system` · `approval` · `approvalCritical` |
| Toast | `lift-lg rounded-xl border-warning/40 p-3.5` (`toast.tsx:30`) | `toast` |

**Luật của vỏ:**

- Bo góc theo vai trò §4.1: menu là khối nội dung nên `xl` 12px; khung modal là
  `2xl` 16px. Menu và dialog không cùng bán kính vì chúng không cùng vai trò.
- Bóng theo §5: menu/popover `lift-md`, dialog/toast `lift-lg`. Overlay không được
  thêm nguồn bóng thứ năm.
- Viền: menu/popover `border-subtle`, dialog `border-default`. Đây là ranh giới
  **trong hệ** chứ không phải ranh giới control, nên nó không cần đạt 3:1 như §2.3.
- Nền: `bg-surface` cho menu nằm trong luồng, `bg-overlay` cho popover rời và
  dialog. Không trộn hai tầng này trong cùng một vỏ.
- Đệm vỏ: `p-1` đến `p-1.5`. Menu nhiều dòng dùng `p-1.5`.
- Vỏ overlay không dùng `backdrop-blur`: chiều sâu của hệ đến từ nền + viền (§1.4).
  Chỗ duy nhất đang làm mờ là dải fade cuối cột hội thoại
  (`components/chat/stream-bubble.tsx:92`), không phải overlay.

**Hàng trong menu:**

- Recipe `.menu-item` là mặc định: `rounded-lg px-3 py-2 text-ui font-mono`,
  hover `bg-raised`, chuyển màu `duration-150`. Hàng nguy hiểm thêm `.menu-item-danger`.
  (`font-mono` ở đây là quy ước chung của hệ — xem §3, không phải ngoại lệ riêng
  của menu.)
- Hàng cần vùng chạm 44px thì viết tay và **ghi rõ vì sao**:
  `min-h-11 rounded-lg px-2.5 py-2` (`model-selector.tsx:275`).
- Chọn / hover dùng `bg-raised` — hệ này không có token `menu-hover` riêng. Đừng tô
  cả hàng bằng màu nhấn để đánh dấu mục đang chọn; dùng dấu tick hoặc đổi màu chữ.
- Tiêu đề nhóm trong menu: `text-micro uppercase tracking-wide text-accent`, dán nền
  khi cuộn bằng `sticky top-0 bg-raised/95` (`model-selector.tsx:440`). `/95` là
  modifier trên **nền** nên hợp lệ — cấm của §2.2 là trên **chữ**.

**Dialog.** Backdrop `bg-sunken/70` phủ lên lớp `content`; đầu vỏ
`bg-raised px-4 py-2.5` + `border-b border-subtle`; thân cuộn được. Modal phê duyệt
dùng `approval` / `approvalCritical` — không dùng `system`, vì `system` là hộp thoại
người dùng mở chủ động.

**Toast.** Nằm trên `dropdown` và dưới modal theo §8. Vỏ nhỏ, một dòng chữ; không
dùng `lift-lg` cho thứ khác.

**Chuyển động.** `animate-pop-in` / `animate-fade-in` / `animate-slide-up` khai ở
`tailwind.config.ts` (`theme.extend.animation` + `theme.extend.keyframes`), lần lượt
160ms / 160ms / 180ms — dưới 200ms nên không cảm nhận được là chờ. Không đổi sang
thư viện animation khác chỉ để làm một hiệu ứng overlay.

**Điều không được làm trong overlay**, vì mỗi điều sẽ đẻ thêm một bộ quy ước riêng:

- `z-[...]` hoặc `z-40` viết tay. Số lấy từ `Z_CLASS` trong `lib/ui-z.ts`. Trừ `z-0`
  cho nội dung và `sticky top-0 z-10` bên trong một overlay đang xếp chồng nội bộ.
- Shadow riêng cho overlay — chỉ `lift-md` / `lift-lg`.
- Nền overlay tự dựng bằng hex hay alpha trung tính (`bg-white/90`): phải là token
  §2, và alpha trung tính là thứ §2.6 cấm.

---

## 9. Drift đã biết / chưa migrate

**Mục này tồn tại để tài liệu không nói dối.** Mọi thứ dưới đây là **sự thật về
codebase lúc này**, không phải mục tiêu. Nếu bạn đọc §1–§8 rồi thấy điều gì mâu
thuẫn ở đây, hãy tin phần này — và sửa nó khi nó hết đúng.

### 9.1 Alias tạm vẫn còn

Toàn bảng ở §2.6. Chúng **không gây sai màu** (mỗi alias trỏ đúng giá trị token
mới) — chúng gây **tên sai**, nên đọc code không phản ánh hệ thống.

### 9.2 Số liệu của hệ mới

- **24 key, 20 giá trị hex phân biệt.** Bảng sáng cố ý dùng lại một màu cho nhiều
  vai trò — `#ffffff` cho `surface`/`overlay`/`on-fill`, `#575757` cho
  `secondary`/`diff-ctx`, `#b3261e` cho `danger`/`diff-del` — vì trên giấy trắng,
  "nền" và "chữ trên nền tô đậm" là hai câu hỏi khác nhau về CÙNG một màu. Test
  đếm **giá trị** sau khi khử trùng, nên con số 20 là đúng chứ không phải thiếu sót.
- **Chiều sâu đi qua 4 class.** `.lift-sm` / `.lift-md` / `.lift-lg` / `.well` được
  gọi thẳng ở nhiều file của `components/` + `app/`. Nhiều khối ghi **cả hai** dạng
  — class CSS cho lớp recipe và `shadow-lift-*` cho cùng một khối — ví dụ
  `components/composer.tsx`, `app/error.tsx`. Phần còn lại đi qua recipe trong
  `app/globals.css`. Nếu một component tự dựng khối nổi bằng `className` thuần mà
  không dùng recipe, nó phải tự thêm `shadow-lift-*`.
- **Hex thô còn hợp lệ đúng ba chỗ**, tất cả đều thuộc bảng §2: `app/manifest.ts`
  (`#f7f7f7`), và `app/global-error.tsx` (`#f7f7f7` + `#18181b` trong style inline —
  cố ý hardcode vì phải có màu trước first-paint, lúc stylesheet chưa kịp về).
- **Không có `dark:` variant nào** trong codebase (0 lượt) — đúng theo §7.
- **Icon vẫn là lucide**, `strokeWidth` 2px mặc định. Nét mảnh hơn sẽ nhẹ hơn,
  nhưng đổi nó là sửa ~220 call site và làm icon mất nét ở 11–13px.

### 9.3 Cỡ chữ tuỳ ý vẫn còn

Đếm trên `components/` + `app/` (`.tsx` / `.ts` / `.css`), không tính comment:
`text-[11px]` ~43 lượt, `text-[10px]` ~10, `text-[12px]` ~6, `text-[16px]` ~3 (đều
là tiêu đề khối, gần `head` hơn bất kỳ bậc nào), cộng một số `text-[10.5px]` /
`text-[11.5px]` / `text-[12.5px]` **không khớp bậc nào** — tức không thuộc hệ
thống chứ không chỉ là gõ tắt. `text-xs` / `text-sm` của Tailwind vẫn đang dùng;
xem §3.

> **Đợt rà `ui-ux-pro-max` (10/2025) đã dọn phần còn lại.** Toàn bộ cỡ px tự chế
> trong bề mặt hợp đồng nay đã về tên bậc: `text-[11px]` → `text-meta`,
> `text-[10px]` → `text-micro`, `text-[12px]` → `text-ui`, `text-[13px]` →
> `text-body`, `text-[15px]` → `text-read` (cùng số px, nên **không đổi một pixel
> diện mạo nào** — chỉ đổi tên để đổi cỡ ở đây cũng kéo được cả app). Các cỡ
> lệch nửa px (`10.5` / `11.5` / `12.5` / `9.5`) — vốn **không thuộc bậc nào** —
> đã bấm về bậc gần nhất, nên lệch tối đa 0.5px và một chiều.
>
> Còn lại đúng 4 cỡ px tự chế, và đều là **cỡ trưng bày**, không phải cỡ chữ
> nội dung: chữ wordmark `vyen-logo.tsx` (32 / 16 / 9.5px), `h1` màn hình trống
> `message-list.tsx` (28px), và hai tiêu đề khối 16px (`staging-panel.tsx`,
> `workspace-checkpoints.tsx`). Thang 6 bậc không có bậc nào cho chúng.
> Test `không còn cỡ chữ px tự chế nào lệch bậc` miễn trừ đúng **cặp (file, cỡ
> px)** này — miễn trừ nguyên file thì thêm `text-[19px]` vào logo cũng lọt, tức
> im lặng đúng lúc cần đỏ. Nâng 16px lên `head` (20px) sẽ đổi diện mạo hai tiêu
> đề khối nên **cố ý chưa làm** ở đợt này.

### 9.4 Vài thứ khác

- **Theme cycler chết: đã gỡ xong.** `components/sidebar.tsx` có 0 lượt chữ
  `theme` — nút `light → dark → system` và các state nó đọc đã bị xoá hết.
- **Khung góc còn sót: đã xoá xong.** Cả 8 `<span className="pi-corner-*">` rỗng ở
  `components/workspace-checkpoints.tsx` và `components/mcp/tool-approval-dialog.tsx`
  đã bị gỡ. Chuỗi `.vyen-frame` / `.pi-frame` + 8 ngoặc góc đã bị xoá khỏi
  `app/globals.css` từ trước nên chúng vốn đã không sinh CSS nào.
- **Khối suy luận trong `stream-bubble.tsx` — đã sửa.** Nó từng dùng `bg-reasoning`
  **đặc** làm nền, khiến `text-primary` trên đó chỉ còn 2.39:1 (fail AA) và icon
  `text-reasoning` là 1.00:1 — vô hình. Nay dùng `bg-reasoning/10` + chữ
  `text-primary`/`text-secondary`. Xem §2.4.
- **`thinking-menu.tsx:303` tự ghi `z-40` thay vì `Z_CLASS.dropdown`.** Giá trị thì
  đúng (40 = `dropdown`), nên màn hình không sai — nhưng nó vi phạm §8 và là hàng
  thứ 12 trong số overlay nên lấy số từ `lib/ui-z.ts` (11 component còn lại đều gọi
  `Z_CLASS`). Sửa là đổi một chữ, không đổi diện mạo.

### 9.5 Vòng đo lại tương phản — phát hiện được, đợt này KHÔNG sửa code

Các tỉ lệ trong §2 được đo tay và **không test canh** (§10.2). Một vòng đo lại bằng
công thức WCAG trên bảng màu thật bắt được bốn điều. Đợt này chỉ sửa **tài liệu**,
nên ba điều đầu vẫn nằm nguyên trong code và được ghi lại ở đây làm việc còn treo:

| Phát hiện | Trạng thái |
|---|---|
| `accent-dim` `#7fb8a6` chỉ **2.26:1** trên trắng, 2.07:1 trên `#f5f5f5`. Comment trong `globals.css:59` vẫn ghi "4.0:1, đạt 3:1 cho vật thể đồ hoạ" — sai. Token đang tô cột biểu đồ (`usage-stats.tsx:109`, `telemetry-tab.tsx:209`) và chấm trạng thái (`status-line.tsx:80`), tức đúng loại vật thể mà 1.4.11 đòi 3:1 | **Chưa sửa.** Hướng đã đo thử: hạ xuống `#519a85` → 3.05:1 trên `#f5f5f5`, 3.33:1 trên trắng, giữ nguyên tông. Khi nào sửa thì phải sửa đồng bộ `tailwind.config.ts`, `:root`, bảng màu của test và §2.4 |
| Chấm trí đầu vỏ Settings vẽ `bg-accent-dim` với `text-accent` → **2.50:1**, fail AA ở chữ cỡ `micro` (`settings-dialog.tsx:196`) | **Chưa sửa.** Hướng đã đo thử: nền `bg-accent-soft` → `accent` trên đó là 5.09:1 |
| Số trong bảng §2 đo trên nền khác với nhãn cột: `primary` ghi 16.4:1 "trên `#fff`" nhưng trên `#fff` thật là 17.72:1 (con số 16.4 khớp `#f7f7f7`); `strong` ghi 6.4:1, thật là 7.81:1 | **Đã sửa trong §2** — nhưng comment cũ ở `globals.css:44,55` vẫn ghi số cũ, vì đợt này không đụng code |
| `border-default` trên nền `bg-raised` là 2.78:1 (`shell-confirm.tsx:159`, `branch-switcher.tsx:39`) | **Cố ý để nguyên.** Ở đó viền không phải tín hiệu nhận diện duy nhất — control có nền `raised` khác nền trang và có chữ bên trong — nên vẫn thoát 1.4.11 theo nghĩa "có tín hiệu nhận diện". Đổi sang `strong` sẽ thắt chặt hơn thiết kế hiện tại |

Cùng đợt đó, comment trong `tests/design-system.test.ts` cũng còn ghi `#18181b` dùng
cho cả `primary` lẫn `strong` — `hex.strong` thật là `#525252`. §9.2 đã sửa; test thì
để nguyên.

---

## 10. Hợp đồng được kiểm chứng bằng gì

`tests/design-system.test.ts` là cơ chế thực thi. Chạy:

```
npx vitest run tests/design-system.test.ts
```

### 10.1 Test kiểm gì

| Assertion | Bắt được loại trôi nào |
|---|---|
| Đúng **4** khai báo `box-shadow` trong `app/globals.css`, và chúng là `.lift-sm` / `.lift-md` / `.lift-lg` / `.well` | Dán tay `box-shadow` ở một class riêng — bám ngoài bốn nguồn |
| `.lift-*` không được dùng `inset`; `.well` phải là `inset` | Biến khối nổi thành khối chìm |
| Recipe `.surface-panel` / `.settings-card` → `lift-md`; `.field` / `.field-sm` → `well`. **Nút không nằm trong bảng này** — bóng không được quay lại nút | Quay lại tay dán bóng, hoặc làm mép nút nhoè đi trên nền sáng |
| Giá trị `.lift-*` trong `globals.css` khớp **byte** với `boxShadow` trong `tailwind.config.ts` (kể cả thứ tự layer, số lớp 1/2/2) | Bóng bị nhân bản / viết tay / lệch giữa hai nguồn |
| `boxShadow` chỉ có `lift-sm`/`lift-md`/`lift-lg` là key **không-`'none'`**; `sm`/`md`/`lg`/`xl`/`2xl` **không được định nghĩa** | Bóng mềm lọt vào app qua `theme.extend.boxShadow` |
| `borderRadius` định nghĩa đúng 9 bậc, thang px tăng dần, và **mọi** giá trị phải là MỘT số px | Bo bất đối xứng quay lại dưới bất kỳ dạng nào; hoặc gọi `rounded-lg` mà **không sinh ra class nào** |
| `ink` / `wobble` không được tồn tại trong `borderRadius` | Bo bất đối xứng quay lại |
| Hex thô chỉ được dùng hex trong bảng màu §2 (bỏ qua comment) | Hex mới chui vào không ai duyệt |
| Bảng màu trong test khớp `tailwind.config.ts` **theo cả hai chiều** | Thêm token mà test không biết, hoặc sửa một bên của nguồn sự thật |
| Mọi token màu khai trong `globals.css` đều thuộc bảng §2 (đổi hex sang kênh RGB rồi so) | Token màu viết tay nằm trong chính file định nghĩa — lỗ hổng cũ của assertion hex |
| Không Tailwind palette (`text-red-400`, `bg-zinc-800`, …) | Lọt họ màu mặc định |
| Không `text-white` / `color: #fff` | Chữ trắng tinh thay cho `text-primary` |
| Không modifier opacity trên token **chữ** | `text-tertiary/60` — 60% của một màu đã chọn để đạt AA thì không còn đạt |
| Không HAI modifier opacity trên một class | `border-success/40/60` không sinh CSS nào → viền biến mất mà code vẫn còn `border-` |
| Recipe `@apply` đặt độ rộng viền thì phải `@apply` kèm màu; class đặt độ rộng viền phải có class màu **cùng variant** | Kế thừa `#e5e7eb` từ Tailwind preflight — viền sáng hơn cả chữ nó bao quanh |
| Không class chết: `rounded-ink`, `rounded-wobble`, `accent-mint`, `font-hand`, `pi-corner-*`, `glass-panel`, … | Class còn trong JSX nhưng không còn sinh CSS — mọi thứ trông đúng trừ đúng khối không vẽ gì |
| Mọi recipe sinh bo góc đều khai báo bo góc thật; mọi `<button>` trong `sidebar.tsx` / `backup-reminder.tsx` khai báo bán kính tường minh | Nút rơi về 0px từ preflight |
| File trong danh sách hợp đồng phải dùng ít nhất một class token | File bị bỏ sót ngoài hệ thống |
| Composer dùng chung token `thread`, không tự khai `max-w-4xl`; gutter `px-5` khớp giữa list và composer | Ô nhập lấn 64px ra ngoài cột hội thoại (lỗi đo được @1360px) |
| Mốc `rail:` khai đủ `screens.rail` + `maxWidth.rail`, ngưỡng đủ cho cả ba cột | Bật breakpoint mà token chưa có |
| Vùng chạm trigger 44px (`after:-inset-[6px]`) | Vùng chạm co lại dưới WCAG 2.5.5 |
| Không emoji trong `components/` + `app/` (ngoài comment) | Emoji làm icon quay lại — hình dáng/màu do font hệ điều hành, không theo hệ accent |
| Không `dark:` variant | Dựng nhánh sáng nửa vời thứ hai |

### 10.2 Test KHÔNG kiểm gì — đừng hỏi nó

- **Nó không kiểm tương phản WCAG.** Các tỉ lệ ghi ở §2.2/§2.3 là **đo tay** một
  lần khi thiết kế bảng màu, không phải thứ được test canh. Đổi `hex.tertiary`
  thành một màu nhạt hơn sẽ KHÔNG làm test đỏ — hãy tự tính lại trước khi đổi.
- **Nó không kiểm thứ tự 5 tầng bề mặt** có sáng dần đều hay không.
- **Nó không kiểm 3 bậc viền có đúng vai trò** — không thể kiểm bằng regex, chỉ
  kiểm được bằng mắt. §2.3 là quy tắc để người đọc giữ.
- **Nó không kiểm bao nhiêu component đã migrate.** Danh sách file là hợp đồng:
  file có trong danh sách thì phải sạch, file không có thì **không ai canh**.
- **Nó không kiểm nội dung.** Một component dùng đúng token sai vai trò vẫn xanh.
- **Nó không kiểm `z-index`** — thang đó có test riêng ở đâu đó khác.
- **Nó không kiểm comment.** Mọi assertion soi mã đều cắt `/* … */` trước khi so.
  Tên màu nhắc trong comment là tài liệu, không phải màu được vẽ ra — và tài liệu
  gọi tên màu cũ là điều ĐÚNG. Nếu thấy assertion đỏ vì comment, hãy sửa
  assertion theo mẫu này, đừng xoá comment.
- **Nó không kiểm bề mặt overlay** (§8.1): vỏ menu/popover/dialog/toast, đệm, bo
  góc vỏ, hàng menu, `Z_CLASS` có được dùng hay không. Cùng cơ chế lỗ hổng mà
  §11.1c đã gọi tên: rule chỉ soi một phần bề mặt thì phần còn lại không được canh.
  Ví dụ còn sống: `thinking-menu.tsx` tự ghi `z-40` và test vẫn xanh (§9.4).

Một tài liệu design system mà chỉ test được một nửa vẫn tốt hơn không tài liệu —
miễn là phần không test được được viết ra thành quy tắc rõ ràng, đúng như §10.2
này.

---

## 11. Nhật ký rà soát giao diện (checklist `ui-ux-pro-max`)

> Đây là **lịch sử rà soát**, không phải spec. Spec nằm ở §1–§10 và §12; giữ mục
> này nguyên trạng vì nó là bằng chứng cho các quyết định đã gỡ (bóng lệch cứng,
> bo bất đối xứng, chữ vẽ tay, theme tô màu sai nền). Tách nó sang một file nhật ký
> riêng là một commit dịch chuyển thuần, không có gì thay đổi nội dung.

Sau khi hệ tối giản vào chỗ, UI được soi lại theo checklist 10 hạng của skill
`ui-ux-pro-max`. Ba thứ phải sửa, phần còn lại đã đạt hoặc cố ý giữ:

### 11.1 Đã sửa

| Hạng | Phát hiện | Cách sửa |
|---|---|---|
| 1 — Accessibility | Hai chỗ `outline-none` tắt mất ring `:focus-visible` toàn cục: nút chọn chat trong `components/sidebar.tsx` và ô sửa tin nhắn trong `components/chat/message-item.tsx` | Bỏ `outline-none` (nút chọn chat dùng thêm `outline-offset-[-2px]` vì nằm trong danh sách `overflow-y-auto`, ring mặc định bị cắt mép) |
| 2 — Touch | 9 nút icon 28px đứng một mình không có vùng chạm mở rộng (đóng hộp thoại, thu gọn/đóng sidebar, tuỳ chọn cuộc trò chuyện, cài đặt, copy diff, xoá ký ức) | Thêm `after:absolute after:-inset-[8px]` (28→44px); nút 32px dùng `-inset-[6px]` (→44px); nút xoá từ khoá trong ô search lên 28px + `-inset-[8px]`; nút xoá ký ức dùng `-inset-[6px]` (40px — đúng bằng khe `space-y-1.5`, không chồm sang hàng kế) |
| 4 — Style | Emoji làm icon: `📏🔧⚠️💡📖📌` ở settings Ghi nhớ, `📁` ở Tự động sao lưu; thông điệp lỗi còn hướng dẫn "bấm 📁" | Thay bằng Lucide (`Ruler` / `Wrench` / `TriangleAlert` / `Lightbulb` / `BookOpen` / `FileText` / `Folder`); chữ trong `<option>` bỏ emoji (option không render được SVG); lỗi đổi thành "Bấm nút thư mục trên composer" |

### 11.1b Đợt 3 — soi lại lần hai sau khi hệ đã ổn định

Ba lỗ hổng còn sót, đều là thứ **không ai nhìn thấy bằng mắt** nên đợt 2 bỏ sót:

| Hạng | Phát hiện | Cách sửa |
|---|---|---|
| 2 — Touch | **Con trỏ.** Tailwind preflight KHÔNG khai `cursor` cho `<button>` — UA stylesheet mặc định là mũi tên. Đo được: 180 call site `<button>`, chỉ **21** tự ghi `cursor-pointer`; phần còn lại đi qua recipe (`.icon-btn`, `.menu-item`, `.btn-*`) vốn không có cursor. Giao diện TRÔNG như bấm được còn chuột thì báo không bấm được | Một rule ở `@layer base` của `globals.css`: `button:not(:disabled)`, `[role='button']:not([aria-disabled='true'])`, `summary` → `cursor: pointer`. Sửa 1 chỗ thay vì 180. Đặt ở `base` nên `cursor-not-allowed` ở layer `utilities` vẫn thắng |
| 1 — Accessibility | **Focus ring bị xoá ở mọi ô nhập.** `:focus-visible` toàn cục khai outline 2px accent ở `@layer base`, nhưng `outline-none` là utility ở layer `utilities`: cùng specificity, layer sau thắng → vòng focus biến mất, chỉ còn lại đổi màu viền. Recipe `.field` / `.field-sm` dính (Settings, sidebar), cùng 3 ô viết tay ở `sidebar.tsx` và `model-selector.tsx` | Bỏ `outline-none` khỏi `.field` / `.field-sm` và 3 ô viết tay; `focus:border-accent` giữ nguyên làm lớp nhấn thứ hai. Bỏ luôn `focus:ring-0`: không class `ring-*` nào tồn tại nên nó vô nghĩa, còn `box-shadow: none` lại xoá mất bóng `.well` đúng lúc người dùng đang gõ |
| 7 — Animation | 2 chip đổi màu chạy `duration-100` (`status-line.tsx`, `orchestrator-badge.tsx`) — nhanh hơn dải 150–300ms mà hạng 7 chốt | Lên `duration-150`. Giữ nguyên 100ms cho mũi tên xoay và thanh fade — xem §11.2 |

Ba test mới trong `tests/design-system.test.ts` khoá lại cả ba, và đã thử phá để
bảo đảm chúng đỏ đúng lý do chứ không rỗng.

### 11.1c Đợt 4 — lỗ nặng nhất nằm ở chỗ không ai nhìn thấy

Đợt 3 dọn xong thì bề mặt đã đạt, nên đợt 4 đi tìm loại lỗi mà **test cũ không
có khả năng bắt**: màu đến từ thư viện ngoài, và một rule CSS viết bằng cú pháp
thuần thay vì class Tailwind.

| Hạng | Phát hiện | Cách sửa |
|---|---|---|
| 1 — Accessibility | **Khối code gần như vô hình.** `components/syntax-highlight.tsx` dùng theme `vscDarkPlus` — theme **TỐI** của Visual Studio — trong khi nền ứng dụng là giấy trắng. Đo cả 14 màu trong theme đó trên nền code sáng: **không màu nào đạt AA**. Chữ gốc `#d4d4d4` chỉ 1.36:1, `string` `#ce9178` 2.42:1, `comment` 3.06:1. Tức phần được tô màu *rõ* nhất lại là phần *mờ* nhất. Nguyên nhân: đổi nền sang sáng ở đợt redesign mà quên đổi theme tô màu — nền đổi, bảng màu của nó không | Theme tự dựng từ bảng màu §2, mỗi vai trò trong code một token. Mọi token đạt AA trên **cả ba** nền code có thể xảy ra: `--bg-base` #fcfcfc, `--bg-sunken` #f7f7f7, `--surface-code` #f5f5f5 (nền nhạt nhất là nghiêm nhất) |
| 1 — Accessibility | **`PlainCode` 1.38:1.** Nhánh chờ nạp chunk ghi `text-[rgb(212,212,216)]` — màu chữ theme tối còn sót, đúng cái lúc `loading: () => null` đang chờ, người dùng thấy khối code trắng trơn | Về `text-primary` (16.25:1) |
| 7 — Animation | `.claude-prose a` ghi `transition: color 100ms ease` — đúng cái mà §11.1b cấm, nhưng test chỉ quét `.tsx` nên **CSS thuần nằm ngoài tầm**. Đây là lỗ hổng của chính bộ test: rule chỉ soi nửa bề mặt thì nửa kia không được canh | Lên `150ms`; thêm một test riêng quét `transition:` trong `globals.css` |
| 6 — Typography | Cỡ chữ px tự chế còn sót, gồm cả loại **không thuộc bậc nào** (`10.5` / `11.5` / `12.5px`) | Về tên bậc — chi tiết ở §9.3 |

**Vì sao không dùng theme sáng có sẵn của thư viện** (`one-light`, `a11y-one-light`,
`vs`, `solarizedlight`…): đo hết, không theme nào sạch trên nền này — `one-light`
tốt nhất vẫn còn 7 màu dưới 4.5:1 (chúng được thiết kế cho nền `#fafafa` với bảng
màu riêng). Dùng theme có sẵn còn là để giao diện tự mang một bảng màu **thứ hai**
song song với §2, đúng thứ §9 cấm. Ở đây màu nguồn vẫn là §2.

**Đổi theme có làm mất tô màu không?** Không — đo lại bằng cách render thật 8 ngôn
ngữ (ts / py / sql / bash / css / json / html / jsx, 308 token span) ra HTML rồi
so **cùng một markup** dưới hai theme:

| | span có màu | màu phân biệt được | màu dưới AA |
|---|---|---|---|
| `vscDarkPlus` (cũ) | 192/308 (62%) | 12 | **12/12** |
| theme tự dựng (mới) | **193/308 (63%)** | 8 (đều là token §2) | **0/8** |

Ngoài ra, **không token class nào mà theme cũ tô được mà theme mới bỏ sót** — rà
tên class của mọi span trong cả hai lượt, phần chồng khác là rỗng. Phần span không
được tô (khoảng 37%) là khoảng trắng và văn bản thuần, chúng thừa kế màu của
`code[class*="language-"]` tức `text-primary` 16.25:1 — đọc tốt, và giống hệt
hành vi của theme cũ.

**Ba test mới** trong `tests/design-system.test.ts`:
`mọi màu tô màu cú pháp đều đạt WCAG AA trên nền code sáng` (đo từ chính source
qua `:root`, trên cả ba nền, và chặn luôn việc quay về nạp theme có sẵn),
`hover đổi màu trong globals.css cũng chạy 150ms trở lên`, và
`không còn cỡ chữ px tự chế nào lệch bậc trong thang 6 bậc`. Cả ba đã thử phá để
chắc chúng đỏ **đúng lý do**:

- Cắt bỏ `BACKGROUND_TOKENS` khỏi test tương phản → đỏ (nó bắt đúng cái nhầm
  lẫn mình vừa gây: đem token *nền* đi đo như token *chữ*).
- Để lọc import bằng regex khớp luôn `import type` → đỏ (guard tự bắt chính dòng
  khai báo kiểu của nó — lỗ hổng thật, vì `one-dark` cũng lọt nếu chỉ soi tên file).
- Nạp lại `vscDarkPlus` → đỏ. Trả `text-[rgb(212,212,216)]` cho `PlainCode` → đỏ.
  Đặt lại `transition: color 100ms` → đỏ. Đặt lại `text-[10.5px]` → đỏ.

### 11.2 Cố ý giữ

- **`micro` 10px / `meta` 11px** (§3, hạng 6). Hai bậc nhỏ nhất chỉ dùng cho số
  đếm, nhãn trạng thái và metadata trong khối — không dùng cho câu đọc. Nâng
  chúng lên 12px sẽ xoá mất phân cấp 6 bậc mà §3 đã chốt, và không sửa được vấn
  đề nào của người đọc.
- **Timing 100ms cho micro-interaction** (mũi tên xoay trong `thinking-menu`,
  fade của thanh dưới bubble khi cuộn — hạng 7). Đây là "timing theo ngữ cảnh"
  mà hạng 7 yêu cầu, không phải một duration cho mọi transition: hover đổi màu
  dùng 150ms, panel 200ms, chuyển động cơ học 100ms. Test chỉ bắt
  `transition-colors` dưới 150ms và CỐ Ý bỏ qua `transform`/`opacity` ở 100ms.
- **`outline-none` ở `textarea` của composer** (hạng 1). Ô này CỐ Ý không dùng
  vòng focus: focus của nó hiện ở VỎ form — `isFocused` dựng viền accent +
  `PulseGlow` (`composer.tsx:1081`). Vòng quanh `textarea` sẽ là dư. Test khoá
  danh sách ô nhập buộc phải có ring, và composer là ngoại lệ được ghi rõ.
- **`border-default` cho viền control** (§2.3): 3.03:1 — đạt WCAG 1.4.11 cho ranh
  giới control, dù dưới 4.5:1 của chữ.

### 11.3 Chưa kiểm được ở đây

- **Chưa nhìn bằng mắt trên trình duyệt.** Mọi kết luận ở mục này là đọc mã +
  phép tính khoảng cách/tương phản, không phải ảnh chụp.
- **Chưa đo ở 375 / 768 / 1024 / 1440px thật.** Các lớp chống vỡ (`min-w-0`,
  `truncate`, `max-w-[85vw]`, `flex-wrap`) đã có mặt trong mã, nhưng chưa có
  phép đo layout thực tế.
- **Hạng 3 (Performance) không đổi gì**: không có ảnh raster để lazy-load, logo
  và avatar đều là SVG inline.
- **Chưa chạy `freebuff-preview` để nhìn app thật.** Riêng đợt 4 (theme tô màu
  cú pháp) thì con số tương phản là phép tính trên `:root`, nhưng **diện mạo thực
  tế của bảng màu cú pháp mới** — màu nào đứng cạnh màu nào, có đọc được không khi
  quét mắt nhanh — thì chỉ nhìn trong trình duyệt mới kết luận được. Đổi theme xong
  mà không nhìn thì mới phải chỉnh tay, và mức chỉnh tay có thể là đổi token.

## 12. Nghiệm thu giao diện

Phần này là phần test tự động **không** soi: nó cần mắt người và phép đo layout thật.
§11.3 ghi rõ chưa làm được những gì dưới đây, nên đây là danh sách việc còn treo,
không phải bằng chứng đã đạt.

| # | Kiểm | Chuẩn | Ở đâu |
|---|---|---|---|
| 1 | Bề rộng cột hội thoại | `maxWidth.thread = 48rem` (768px), composer dùng **cùng** token nên không thể lệch | `tailwind.config.ts` + assertion gutter khớp (§4.2) |
| 2 | Ngưỡng bật cột phụ | `screens.rail = 1432px`; dưới ngưỡng thì cột phụ rơi vào giữa cột hội thoại | `chat-interface.tsx` |
| 3 | Vùng chạm | ≥ 44px. Vùng mở rộng bằng pseudo-element (`after:-inset-[Npx]`) **không được bị cắt** bởi khối cha có `overflow`, và không được chồm sang nút kế | §11 (đợt 2) |
| 4 | Chuyển động tôn trọng hệ điều hành | `prefers-reduced-motion: reduce` tắt hiệu ứng; setting `html[data-animations='off']` làm tương tự | `globals.css:182`, `components/effects/index.tsx:67` |

Việc phải làm bằng mắt, mỗi lần đổi layout:

- Mở app ở **375 / 768 / 1024 / 1440px** và ở zoom **200%**: không tràn ngang, không
  chữ đè nhau, không thanh cuộn kép.
- Xem hết các trạng thái: chat dài, code dài (ngang phải cuộn được), đang stream,
  empty state, lỗi, modal phê duyệt, Settings.
- Tab qua một dialog rồi đóng bằng Esc: focus phải quay về đúng chỗ.
- `freebuff-preview start` rồi nhìn app thật. Mọi tỉ lệ trong §2 là phép tính trên
  mã, không phải ảnh chụp — không kết luận được "đẹp" bằng phép tính.

## 13. Thiết kế đích và kế hoạch chuyển tới

> **Mục này KHÔNG phải spec.** §1–§12 mô tả cái đang chạy; mục này mô tả cái
> **chưa** có trong code. Không dùng mục này để biện minh cho một sự thật đang
> chạy, và khi một mục được triển khai thì nó phải được ghi ngược lại §2/§3 rồi
> xoá khỏi đây — nếu không, tài liệu lại bắt đầu nói dối như §9.3 đã cảnh báo.

### 13.1 Hướng: "Quiet precision"

Không gian làm việc kỹ thuật, nhưng bình tĩnh và tinh tế. Cụ thể:

| Vùng | Hướng |
|---|---|
| App shell | Trung tính, ít đường bao; không biến mọi vùng thành card |
| Hội thoại | Nội dung là trọng tâm; assistant ít khung, người dùng có nền nhấn nhẹ |
| Composer | Điểm tương tác chính; model và context phụ không được cạnh tranh với ô nhập |
| Tool execution | Hàng trạng thái ngắn; log chi tiết mở khi cần |
| Reasoning | Thu gọn mặc định khi không cần đọc; không để thành mảng tím lớn |
| Diff / phê duyệt | Đường dẫn → thay đổi → rủi ro → hành động; nút phê duyệt không bị giấu |
| Chiều sâu | Mặc định phẳng; bóng dành cho menu, popover, dialog |
| Bản sắc | Giữ xanh trầm của Vyen, dùng có chủ đích, không tô nhấn khắp màn hình |

Ba câu hỏi mọi màn hình phải trả lời được: **agent đang làm gì · có gì cần mình
quyết · kết quả thay đổi ở đâu.**

### 13.2 Ba việc đang treo, theo thứ tự nên làm

**1. Sửa hai lỗi tương phản đã đo (§9.5).** Không có phong cách nào cứu được 2.26:1.

- `accent-dim` `#7fb8a6` → `#519a85`: 3.05:1 trên `#f5f5f5`, 3.33:1 trên trắng.
- Chấm trí đầu vỏ Settings: `bg-accent-dim` + `text-accent` (2.50:1) → nền
  `bg-accent-soft` (5.09:1).
- Đụng 4 file: `tailwind.config.ts`, `app/globals.css`, `tests/design-system.test.ts`,
  `components/settings-dialog.tsx`. Sửa một bên là test đỏ — đó là ý muốn.

**2. Quyết định typography.** Đây là câu hỏi mở, chưa có đáp án, và nó **đảo ngược**
thứ §3 đang mô tả: trong 67 file `.tsx` ở `components/` + `app/`, có 48 file gọi
`font-mono` và chỉ 10 file gọi `font-sans`; `.menu-item` / `.field-label` /
`.btn-*` đều mono. Có hai hướng:

- **Giữ nguyên.** Mono phủ nhãn tạo bản sắc kỹ thuật, chiều ngang chật, phù hợp
  công cụ dày thông tin. Không tốn công.
- **Đảo về sans cho control.** Inter cho nhãn, nút, menu; mono chỉ cho code, lệnh,
  đường dẫn, ID, số liệu. Trông "cao cấp" hơn nhưng phải trả giá: chạm gần như mọi
  control trong repo.

Nếu chọn hướng 2, kèm bảng cỡ chữ đề xuất: nhãn/control 14px, hội thoại 16px,
metadata 12px, và phải đo lại vì `tertiary` mới chỉ còn 4.69:1 trên `#f7f7f7` —
nâng cỡ chữ làm dày thêm chữ, càng sát ngưỡng AA. Cần cả hai: phép đo **và** nhìn
thật ở §12.

**3. Chiều sâu.** Đang là "mặc định phẳng" rồi, chỉ là chưa chủ đích: `lift-md` ở độ
mờ 6% trên nền gần trắng gần như vô hình, nên bóng không phải thứ tạo chiều sâu.
Nếu muốn bóng làm việc thật thì phải nâng độ mờ và giới hạn nó cho overlay — đó là
thay đổi diện mạo, đo bằng mắt, không sửa bằng số.

### 13.3 Thứ tự triển khai và bằng chứng từng bước

| Bước | Việc | Bằng chứng kết thúc |
|---|---|---|
| 1 | Sửa `accent-dim` + chấm trí Settings | `vitest tests/design-system.test.ts` xanh; đo lại tỉ lệ bằng công thức WCAG ghi vào §2.4 |
| 2 | Chốt hướng typography, rồi mới sửa | Trước khi sửa: ảnh 375/768/1024/1440px của chat, composer, menu. Sau khi sửa: chụp lại cùng bộ, đối chiếu |
| 3 | Nếu chọn sửa, migrate từng khối theo thứ tự đọc: composer → sidebar → menu/dialog → phần còn lại | Không lướt 48 file một lượt; mỗi khối một lượt, `npm run lint` sạch, không lỗi typecheck |
| 4 | Chiều sâu | Cùng bộ ảnh, đánh giá có đọc ra lớp không bằng mắt hay không |

Điều kiện để bước 2 được coi là xong: có **ảnh**, không chỉ có con số. Không có ảnh
thì mọi kết luận "đẹp hơn" chỉ là phỏng đoán — và tài liệu này không ghi phỏng đoán
thành luật.