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
| [14](#14-trải-nghiệm-sản-phẩm--cái-phải-xây) | Trải nghiệm sản phẩm: bố cục, hội thoại, tool, composer, ưu tiên P0–P3 |
| [15](#15-yêu-cầu-thiết-kế--18-điểm-để-chấm) | **18 yêu cầu thiết kế** chi tiết hoá §13–§14, kèm [định nghĩa lượt](#151-bố-trí-tin-nhắn--điểm-15) và [bảng trạng thái](#155-trạng-thái--chốt-tên-và-nghĩa) — yêu cầu, không phải kế hoạch |

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
| `bg-surface` | `#ffffff` | khối nội dung — thẻ, dải tiêu đề (lời trợ lý KHÔNG còn nền riêng, xem §15.1 điểm 2) |
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
| `accent-dim` | `#519a85` | nhấn bị tắt, cột biểu đồ, chấm trạng thái — **3.33:1** trên trắng, **3.05:1** trên `#f5f5f5`: đạt ngưỡng 3:1 của WCAG 1.4.11 cho vật thể đồ hoạ. Giá trị cũ `#7fb8a6` (2.26:1 / 2.07:1) đã bị thay |
| `accent-soft` | `#f0f4f3` | **nền** nhấn nhạt — tag active, bubble người dùng |
| `on-fill` | `#ffffff` | chữ trên nền tô đậm |
| `success` / `warning` / `danger` / `info` | `#167a4a` / `#9a6206` / `#b3261e` / `#0369a1` | trạng thái |
| `reasoning` | `#6d4aa8` | khối suy luận — màu riêng, không dùng cho trạng thái |

`accent-soft` là token **nền**, không phải token chữ — nó tách riêng khỏi `accent`
vì nền nhạt trên giấy trắng chỉ đạt ~1.1:1, không đọc được.

`accent-dim` là token **vật thể đồ hoạ**, không phải token nền mang chữ: nó vừa
đủ 3:1 để mắt nhận ra một cột biểu đồ hay một chấm trạng thái, nhưng `text-accent`
trên nó chỉ được 2.50:1 — fail AA. Chỗ nào cần nền cho chữ nhấn thì dùng
`accent-soft` (`accent` trên đó là **5.09:1**).

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

**Hai họ chữ, hai việc — và mặc định là Inter.**

| Họ | Font | Dùng cho |
|---|---|---|
| `sans` | Inter | **mặc định cho giao diện**: nhãn, nút, hàng menu, điều hướng, nhãn trường, mô tả, metadata, thông báo — và prose đọc dài (`.claude-prose`, `.uic`) |
| `mono` | JetBrains Mono | **chữ MÁY**: code, lệnh, đường dẫn, tên tệp, tên tool, ID, hash, payload JSON, dòng diff, đầu ra stdout/stderr, và số liệu trong bảng |

Đợt typography (2026-10-06) đã **đảo chiều mặc định** so với bảng cũ. Trước đây
mono là mặc định cho control và nhãn: `font-mono` có mặt ở 48 file
`components/` + `app/`, và các recipe `.menu-item` / `.field-label` / `.field`
đều khai mono — nên toàn giao diện đọc như một cửa sổ terminal. Bảng trên là
chiều **đang chạy**, không phải chiều mong muốn: `.field-label` / `.field-hint` /
`.field` / `.field-sm` / `.menu-item` / `.notice` trong `globals.css` đã chuyển
sang `var(--font-sans)`, và 55 chỗ `font-mono` trong component đã đổi sang
`font-sans` ở đúng những khối là chrome (vỏ dialog/panel, nhãn, chip, nút, hàng
trạng thái, metadata).

Còn lại **37 chỗ `font-mono`**, và mỗi chỗ đều là chữ máy theo đúng vai ở bảng
trên: code block (`.claude-code-block`, `markdown-renderer.tsx`), tham số tool +
đầu ra thô (`tool-trace.tsx`), khối lệnh (`shell-confirm.tsx`), dòng diff
(`diff-confirm.tsx`, `staging-panel.tsx`), đường dẫn/tên tệp (`staging-panel.tsx`,
`diff-confirm.tsx`, chip đính kèm trong `composer.tsx`/`message-item.tsx`), ID và
payload (`telemetry-tab.tsx`, `workspace-checkpoints.tsx`), tên tool
(`tool-grants-panel.tsx`, `tool-permissions-table.tsx`), lệnh slash
(`/‹tên›`), khoá recipe, biểu thức cron, model id (`usage-stats.tsx`), số đếm
(`branch-switcher.tsx`, `appearance-tab.tsx`, badge số trong `composer.tsx`), và
chi tiết lỗi `break-all` ở `app/error.tsx` + `app/global-error.tsx`.

**Cỡ px của thang 6 bậc — ĐÃ ĐỔI (2026-10-06, đợt riêng có ảnh đối chiếu).**
Đợt họ chữ trước đó chỉ đổi HỌ chữ (Inter ↔ mono) và để nguyên 12/13/15px cho
`ui`/`body`/`read`. Đợt cỡ chữ lấy con số đúng theo bảng vai trò §13.2: nhãn/nút/
menu 14px, hội thoại dài 16px, metadata 12px; `body` giữ 13px vì §13.2 không gán
cỡ nào cho vai trò này. Bằng chứng: ảnh trước/sau ở 375/768/1024/1440px (chat rỗng
+ Settings, xem §13.3 bước 2) và CSS sinh ra thật đọc từ trình duyệt — xem §13.2.

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
| `meta` | 12 | timestamp, metadata, chú thích nhỏ |
| `body` | 13 | nội dung trong ô nhập, dòng bảng |
| `ui` | 14 | nhãn, nút, chữ trong khối giao diện (mặc định) |
| `read` | 16 | văn bản đọc dài (markdown, đoạn văn) |
| `head` | 20 | tiêu đề khối lớn |

> Hàng xếp theo bậc px tăng dần, nên thứ tự vai trò trong bảng đổi chỗ so với bản
> trước (`ui` vượt `body`): nhãn/nút là chữ để ĐỌC để quyết định nên lấy 14px theo
> §13.2, còn `body` là chữ dày trong ô nhập và dòng bảng, không có cỡ trong bảng
> §13.2 nên giữ 13px. Sáu bậc vẫn cách nhau đều — không bậc nào trùng bậc nào.

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
| `xl` | 12 | khối nội dung: thẻ settings, panel, vỏ overlay (`.surface-panel`), ghi chú người dùng (`.user-note`) |
| `2xl` | 16 | khối lớn: khung modal, vỏ composer |
| `3xl` | 20 | dự phòng, lớn hơn mọi khối đang dùng |
| `full` | 9999 | hình tròn |

**Mặc định theo component** — đọc bảng trên khi phân vị, còn đây là câu trả lời
cho câu hỏi "control này bo bao nhiêu":

| Loại | Bo góc | Recipe |
|---|---|---|
| Chip, badge, ô inline | 4px (`sm`) | — |
| Nút icon | 8px (`md`) | `.icon-btn` |
| Nút, ô nhập, hàng menu, trigger | 10px (`lg`) | `.btn-primary`, `.field`, `.menu-item` |
| Khối nội dung, vỏ overlay, ghi chú người dùng | 12px (`xl`) | `.surface-panel`, `.user-note` |
| Khung modal, vỏ composer | 16px (`2xl`) | `settings-dialog.tsx` |

> **Đổi vai trò 2026-10-06 (P1).** Bong bóng người dùng từ `2xl` 16px xuống `xl`
> 12px và bong bóng trợ lý **biến mất** cùng lượt: §15.1 điểm 2 đổi khối nào
> *được* có khung — lời nói không còn khung nào, chỉ code/diff/bằng chứng/yêu cầu
> quyết định mới có. `16px` vì vậy chỉ còn thuộc khung modal và vỏ composer.

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
> `text-body`, `text-[15px]` → `text-read` (lúc đó cùng số px nên **không đổi một
> pixel diện mạo nào** — chỉ đổi tên; từ 2026-10-06 các bậc là 12/13/14/16px theo
> §13.2, nên tên bậc nay kéo cỡ theo thang). Các cỡ
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
- **`thinking-menu.tsx` tự ghi `z-40` — ĐÃ SỬA (2026-10-06).** Chỗ đó nay dùng
  `${Z_CLASS.dropdown}`; cả 12 overlay đều lấy số từ `lib/ui-z.ts`. Giá trị không
  đổi (40 = `dropdown`) nên diện mạo không đổi.

### 9.5 Vòng đo lại tương phản — hai lỗi đã sửa ở đợt P0

Các tỉ lệ trong §2 được đo tay và **không test canh** (§10.2). Một vòng đo lại bằng
công thức WCAG trên bảng màu thật bắt được bốn điều; đợt typography + tương phản
(2026-10-06) đã sửa hai điều đầu, hai điều còn lại vẫn là việc đang treo:

| Phát hiện | Trạng thái |
|---|---|
| `accent-dim` `#7fb8a6` chỉ **2.26:1** trên trắng, 2.07:1 trên `#f5f5f5`. Comment trong `globals.css:59` vẫn ghi "4.0:1, đạt 3:1 cho vật thể đồ hoạ" — sai. Token đang tô cột biểu đồ (`usage-stats.tsx:109`, `telemetry-tab.tsx:209`) và chấm trạng thái (`status-line.tsx:80`), tức đúng loại vật thể mà 1.4.11 đòi 3:1 | **ĐÃ SỬA.** Hạ xuống `#519a85` → 3.05:1 trên `#f5f5f5`, 3.33:1 trên trắng, giữ nguyên tông. Sửa đồng bộ `tailwind.config.ts`, `:root` trong `globals.css`, bảng màu của `tests/design-system.test.ts` và §2.4 — test canh cả hai chiều nên lệch một bên là đỏ |
| Chấm trí đầu vỏ Settings vẽ `bg-accent-dim` với `text-accent` → **2.50:1**, fail AA ở chữ cỡ `micro` (`settings-dialog.tsx:196`) | **ĐÃ SỬA.** Nền chuyển sang `bg-accent-soft` → `accent` trên đó là 5.09:1 |
| Số trong bảng §2 đo trên nền khác với nhãn cột: `primary` ghi 16.4:1 "trên `#fff`" nhưng trên `#fff` thật là 17.72:1 (con số 16.4 khớp `#f7f7f7`); `strong` ghi 6.4:1, thật là 7.81:1 | **Đã sửa trong §2** — nhưng comment cũ ở `globals.css:44,55` vẫn ghi số cũ, vì đợt này không đụng code |
| `border-default` trên nền `bg-raised` là 2.78:1 (`shell-confirm.tsx:159`, `branch-switcher.tsx:39`) | **Cố ý để nguyên.** Ở đó viền không phải tín hiệu nhận diện duy nhất — control có nền `raised` khác nền trang và có chữ bên trong — nên vẫn thoát 1.4.11 theo nghĩa "có tín hiệu nhận diện". Đổi sang `strong` sẽ thắt chặt hơn thiết kế hiện tại |

Cùng đợt đó, comment trong `tests/design-system.test.ts` cũng còn ghi `#18181b` dùng
cho cả `primary` lẫn `strong` — `hex.strong` thật là `#525252`. §9.2 đã sửa; test thì
để nguyên.

### 9.6 Tham chiếu tới tài liệu này trong code — và vì sao đừng tách file vội

Có **21** chỗ trong `.ts` / `.tsx` / `.cjs` (9 file: `lib/ui-z.ts`,
`scripts/codemod-tokens.cjs`, `tailwind.config.ts`, `components/composer.tsx`,
`components/chat/tool-trace.tsx`, `tests/composer-affordances.test.ts`,
`tests/composer-contrast.test.ts`, `tests/design-system.test.ts`), cộng 1 chỗ trong
`PLAN.md` — trỏ tới số mục của tài liệu này
(`grep -rn "DESIGN\.md §" --include=*.ts --include=*.tsx --include=*.cjs`). Ba trong
số đó đã lệch sẵn:

| Chỗ ghi | Thực tế |
|---|---|
| `lib/ui-z.ts:2` — "DESIGN.md mục 4" | Thang z-index là §8 |
| `scripts/codemod-tokens.cjs:3` — "mục 6.3" | §6 không có mục con nào |
| `components/chat/tool-trace.tsx:797` — "§5.3" | §5 chỉ có 5.1 |

Đây là lý do cụ thể để **không** tách tài liệu thành nhiều file ngay: mỗi lần đổi số
mục là 22 tham chiếu có nguy cơ lệch, và ba chỗ trên cho thấy chúng lệch trong im
lặng. Tách file không làm việc đó dễ hơn — chỉ đổi tham chiếu từ "sai số mục" thành
"sai tên file". Nếu muốn tách, làm theo hai bước: (1) sửa ba tham chiếu lệch ở
trên, (2) thay số mục bằng tên file ở cả 22 chỗ trong cùng một commit. Trước đó,
dùng §11 làm "nhật ký" đã đủ để spec không lẫn với lịch sử.

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

- **`micro` 10px / `meta` 12px** (§3, hạng 6; `meta` 11 → 12 theo cột px §13.2,
  `micro` vẫn giữ 10 nên hai bậc vẫn cách nhau). Hai bậc nhỏ nhất chỉ dùng cho số
  đếm, nhãn trạng thái và metadata trong khối — không dùng cho câu đọc. Đưa cả hai
  cùng một cỡ mới xoá mất phân cấp 6 bậc mà §3 đã chốt, và không sửa được vấn
  đề nào của người đọc.
- **Timing 100ms cho micro-interaction** (mũi tên xoay trong `thinking-menu`,
  fade của thanh dưới bubble khi cuộn — hạng 7). Đây là "timing theo ngữ cảnh"
  mà hạng 7 yêu cầu, không phải một duration cho mọi transition: hover đổi màu
  dùng 150ms, panel 200ms, chuyển động cơ học 100ms. Test chỉ bắt
  `transition-colors` dưới 150ms và CỐ Ý bỏ qua `transform`/`opacity` ở 100ms.
- **`outline-none` ở `textarea` của composer** (hạng 1). Ô này CỐ Ý không dùng
  vòng focus: focus của nó hiện ở VỎ form — `isFocused` dựng viền accent và vùng
  nhập lớn lên nhẹ theo chiều dọc (§14.4, đợt P1-E 2026-10-08). Vòng quanh
  `textarea` sẽ là dư. Test khoá danh sách ô nhập buộc phải có ring, và composer
  là ngoại lệ được ghi rõ.
- ~~**Hiệu ứng `PulseGlow` khi focus composer**~~ — **đã gỡ ở đợt P1-E
  (2026-10-08).** Vòng `animate-pulse ring-accent/30` bao quanh vỏ vừa phát sáng
  vừa làm mất một chuyển động, mà §15.4 điểm 15 cấm "phát sáng gây phân tâm";
  dấu hiệu focus nay là viền accent + vùng nhập lớn lên. `PulseGlow` vẫn nằm
  trong `components/effects/index.tsx` nhưng không còn nơi gọi — gỡ hẳn hay dùng
  lại ở chỗ khác là việc riêng, không thuộc đợt này.
- **`border-default` cho viền control** (§2.3): 3.03:1 — đạt WCAG 1.4.11 cho ranh
  giới control, dù dưới 4.5:1 của chữ.

### 11.3 Chưa kiểm được ở đây

- **Chưa có người xem ảnh bằng mắt.** Ảnh chụp thật ở 4 bề rộng đã có
  (`docs/design-qa/2026-10-06-type-scale/`), nhưng các kết luận dưới đây vẫn là
  đọc mã + phép tính khoảng cách/tương phản — chưa ai ngồi soi ảnh để chốt.
- **Đã đo bề rộng ở 4 khổ, CHƯA đo từng trạng thái (2026-10-06).** Ở 375 / 768 /
  1024 / 1440px: `scrollWidth === clientWidth` — 0px tràn ngang — và có ảnh chụp
  ở cả bốn bề rộng. Các lớp chống vỡ (`min-w-0`, `truncate`, `max-w-[85vw]`,
  `flex-wrap`) vẫn chưa được soi tiếp ở chat dài, code dài, đang stream và lỗi.
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

> **Đã làm bớt phần máy được (2026-10-06):** chụp 4 bề rộng trước/sau đợt cỡ chữ
> và đo `scrollWidth === clientWidth` (0px tràn ngang) — còn lại (zoom 200%, chat
> dài, stream, lỗi, vòng focus) vẫn phải làm bằng mắt.
- `freebuff-preview start` rồi nhìn app thật. Mọi tỉ lệ trong §2 là phép tính trên
  mã, không phải ảnh chụp — không kết luận được "đẹp" bằng phép tính.

## 13. Thiết kế đích và kế hoạch chuyển tới

> **Mục này KHÔNG phải spec.** §1–§12 mô tả cái đang chạy; mục này mô tả cái
> **chưa** có trong code. Không dùng mục này để biện minh cho một sự thật đang
> chạy, và khi một mục được triển khai thì nó phải được ghi ngược lại §2/§3 rồi
> xoá khỏi đây — nếu không, tài liệu lại bắt đầu nói dối như §9.3 đã cảnh báo.

### 13.1 Hướng: "Quiet precision"

> **Vyen là trung tâm điều khiển bình tĩnh cho công việc phần mềm: mỗi tin nhắn phải
> giải thích, mỗi tool phải đưa ra bằng chứng, và mỗi lần phê duyệt phải làm rõ
> rủi ro trước khi hành động.**

Ba câu hỏi này là tiêu chí, không phải mô tả: một màn hình trả lời được cả ba thì
được coi là đạt, dù bố cục nó đẹp hay không. Cơ chế "thông minh" của Vyen phải nằm
ở **cách thông tin được tổ chức**, không ở màu hay hiệu ứng.

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

**1. Sửa hai lỗi tương phản đã đo (§9.5). — ĐÃ XONG (2026-10-06).**

- `accent-dim` `#7fb8a6` → `#519a85`: 3.05:1 trên `#f5f5f5`, 3.33:1 trên trắng.
- Chấm trí đầu vỏ Settings: `bg-accent-dim` + `text-accent` (2.50:1) → nền
  `bg-accent-soft` (5.09:1).
- Đụng 4 file: `tailwind.config.ts`, `app/globals.css`, `tests/design-system.test.ts`,
  `components/settings-dialog.tsx`. Sửa một bên là test đỏ — đó là ý muốn.

**2. Typography — ĐÃ TRIỂN KHAI phần HỌ CHỮ, còn phần CỠ chữ.** Hướng: **Inter cho
lớp điều hướng, `JetBrains Mono` chỉ cho nội dung kỹ thuật.** Cụ thể:

| Vai trò | Font | px |
|---|---|---|
| Nhãn, nút, menu, điều hướng | Inter | 14 |
| Hội thoại dài | Inter | 16 |
| Metadata, timestamp | Inter | 12 |
| Code, lệnh, đường dẫn, ID, số liệu | JetBrains Mono | theo bối cảnh |

Mono **vẫn giữ vai trò**, nhưng chỉ ở đúng chỗ — không phải mọi nút đều trông như
terminal.

Việc này **đảo ngược** chiều cũ: trong 67 file `.tsx` ở `components/` + `app/`, có
48 file gọi `font-mono` và chỉ 10 file gọi `font-sans`; `.menu-item` /
`.field-label` / `.field-*` đều mono. Đợt này đi theo thứ tự đọc — composer →
sidebar → menu/dialog → phần còn lại — và kết quả là 55 chỗ đổi sang Inter, còn
37 chỗ mono đúng vai chữ máy (§3 ghi danh sách).

**Cột px trong bảng trên (14 / 16 / 12) — ĐÃ LÀM (2026-10-06).** `ui` 12 → 14,
`read` 15 → 16, `meta` 11 → 12 trong `tailwind.config.ts`; hai recipe tự khai cỡ
riêng cũng theo cùng con số: `.field-label` 13 → 14px, `.claude-prose` 15 → 16px
(`.field-hint` vốn đã 12px). `body` giữ 13px — bảng trên không gán cỡ cho vai trò
này, và thang vẫn tăng dần 10/12/13/14/16/20. Bằng chứng: cặp ảnh trước/sau ở
375/768/1024/1440px (`docs/design-qa/2026-10-06-type-scale/`), CSS đọc trực tiếp
từ trình duyệt (`text-ui` 14px, `text-read` 16px, `text-meta` 12px,
`.field-label` 0.875rem, `.claude-prose` 16px), 0px tràn ngang ở cả bốn bề rộng,
`tests/design-system.test.ts` khóa sẵn 6 bậc + 3 recipe, toàn bộ suite xanh.
**Còn thiếu điều kiện §14.9**: ảnh lượt có tool chạy / diff / lỗi, zoom 200%,
ảnh 375px-Settings (nút *Cài đặt* không trong DOM khi sidebar đóng ở mobile).

**Về tương phản thì cỡ chữ không vào cuộc.** Tỉ lệ tương phản phụ thuộc màu, không
phụ thuộc cỡ chữ; WCAG chỉ *hạ* ngưỡng cho "large text" (≥24px, hoặc ≥18.66px đậm)
chứ không hạ theo cảm nhận. Nên câu "nâng cỡ chữ thì tỉ lệ sát ngưỡng hơn" là sai.
Điều cần đo lại là mảng chữ, không phải ngưỡng: `tertiary` hiện 4.69:1 trên
`#f7f7f7` — qua AA cho chữ thường nhưng biên chỉ còn 0.19, nên phải giữ nó trên
nền sáng, không đặt lên nền xám. Chữ 14–16px vẫn kiểm theo ngưỡng 4.5:1 như mọi
chữ thường.

**3. Chiều sâu.** Đang là "mặc định phẳng" rồi, chỉ là chưa chủ đích. **Đánh giá, chưa
đo:** `lift-md` là `0 1px 3px rgb(0 0 0 / 0.06)` + `0 6px 16px -4px rgb(0 0 0 / 0.08)`
trên nền gần trắng — theo cảm nhận thì bóng không làm việc tạo chiều sâu, nhưng tôi
chưa đo và chưa nhìn, nên đây **không** phải số liệu (khác với mọi tỉ lệ tương phản
ở §2). Muốn biết thật thì chụp một card nội dung ở 100% và nhìn xem có đọc ra lớp
hay không. Nếu kết luận là không, nâng độ mờ và giới hạn bóng cho overlay — đo bằng
mắt, không sửa bằng số.

### 13.3 Thứ tự triển khai và bằng chứng từng bước

> Trước khi tách tài liệu này thành nhiều file — xem §9.6.

| Bước | Việc | Bằng chứng kết thúc |

> **Trạng thái 2026-10-06 (cập nhật cuối ngày):** bước 1 xong (`accent-dim` +
> chấm trí Settings); bước 3 xong phần HỌ CHỮ; **bước 2 xong vế cỡ chữ** — đã có
> ảnh trước/sau ở 4 bề rộng tại `docs/design-qa/2026-10-06-type-scale/`,
> `tsc --noEmit` 0 lỗi, toàn bộ suite xanh với test hợp đồng khóa 6 bậc.
> **Bước 4 (chiều sâu) chưa làm** — nó đòi nhìn bằng mắt. Ảnh đã chụp nhưng
> chưa ai soi; đừng đọc bảng dưới thành "đã nghiệm thu".
>
> **Trạng thái 2026-10-07 (đợt LƯỢT):** bốn bước trên không đổi. Thêm: dữ liệu
> LƯỢT theo sự kiện + turn header (§15.1 điểm 1/3/4) — bằng chứng là
> `tests/turns.test.ts` (30 test gọi hàm thật), hợp đồng trong
> `tests/design-system.test.ts`, và `tests/reasoning-persistence.test.ts` khóa
> đường ghi/nâng cấp. Đợt P1-D thêm nhóm phase + vạch trạng thái cho thẻ tool
> (`tests/tool-phases.test.ts`, hợp đồng trong `tests/design-system.test.ts`) và hai
> ảnh `1440-chat-tools-phases.png` / `1440-chat-tools-card-open.png`. Ảnh: `docs/design-qa/2026-10-07-turns/` — 4 bề rộng
> (375/1024/1440/1440-zoom200%) cho lượt có tool chạy và lượt lỗi, đo 0px tràn
> ngang, 0 lỗi console; thêm ảnh lượt đã GẬP (`1440-chat-turns-folded.png`, đợt
> P1-C) cùng số đo hai chiều gập/mở. **Vẫn chưa có ảnh diff/approval thật**, nên
> điều kiện §14.9 vẫn **chưa đạt** và "đẹp hơn" vẫn chưa được chứng minh bằng mắt.
>
> **Trạng thái 2026-10-08 (đợt P1-E):** bước 1–3 không đổi. Thêm: composer mới
> (§14.4) — hàng chân `model · phạm vi · gửi`, chip phạm vi hai trạng thái, focus
> mở rộng dọc mà chiều cao vỏ không đổi; bằng chứng là 19 test mới trong
> `tests/composer-affordances.test.ts` (hàm thật + soi source, tổng 68 test),
> hợp đồng số `COMPOSER_FOCUS_PAD`, và bộ ảnh/số đo ở
> `docs/design-qa/2026-10-08-composer/` (0px tràn ngang ở 375/768/1024/1440 +
> zoom 200%, 0 lỗi console, `elementFromPoint` xác nhận cả bốn control bấm được ở
> 320/375/768/1024/1432/1440px). Lỗi thật tìm được khi đo và đã sửa trong đợt: ô
> chọn model bị ép còn 26px và chồng lên chip phạm vi ở 768px.
| 1 | Sửa `accent-dim` + chấm trí Settings | `vitest tests/design-system.test.ts` xanh; đo lại tỉ lệ bằng công thức WCAG ghi vào §2.4 |
| 2 | Chốt hướng typography, rồi mới sửa | Trước khi sửa: ảnh 375/768/1024/1440px của chat, composer, menu. Sau khi sửa: chụp lại cùng bộ, đối chiếu |
| 3 | Nếu chọn sửa, migrate từng khối theo thứ tự đọc: composer → sidebar → menu/dialog → phần còn lại | Không lướt 48 file một lượt; mỗi khối một lượt, `npm run lint` sạch, không lỗi typecheck |
| 4 | Chiều sâu | Cùng bộ ảnh, đánh giá có đọc ra lớp không bằng mắt hay không |

Điều kiện để bước 2 được coi là xong: có **ảnh**, không chỉ có con số. Không có ảnh
thì mọi kết luận "đẹp hơn" chỉ là phỏng đoán — và tài liệu này không ghi phỏng đoán
thành luật.

## 14. Trải nghiệm sản phẩm — cái phải xây

> Cùng điều kiện với §13: mục này **không** mô tả code đang chạy. Mỗi mục ghi rõ
> **đang có** hay **đích**, để không ai đọc nhầm thành hợp đồng.
>
> §15 chi tiết hoá mục này thành 18 yêu cầu chấm được. Chỗ nào §15 nói cụ thể hơn
> thì §15 là bản chốt.

### 14.1 Bố cục

Ba cột, và cả ba đã tồn tại — vấn đề là vai trò, không phải số cột:

| Cột | Đang có | Đích |
|---|---|---|
| Trái | Danh sách phiên, tìm kiếm, thu gọn được | Thêm switcher workspace/project, **New task** nổi bật, trạng thái workspace — xem ghi chú dưới bảng |
| Giữa | Cột hội thoại `maxWidth.thread = 48rem` (768px), composer cùng token | Giữ 768px — đã nằm trong dải 760–820px. Đổi thứ khác, không đổi số này |
| Phải | `SessionRail` 20rem từ `screens.rail` 1432px, chứa Plan + undo checkpoint; dưới ngưỡng thì Plan rơi vào giữa | **Task control rail**: thêm files touched, tests, phê duyệt đang chờ, hành động gợi ý |

Dưới ngưỡng rail, hành vi thật đã kiểm trong `chat-interface.tsx`: `MessageList`
(150) → `<aside>` (183, chứa checkpoint bar + PlanPanel) → `Composer` (292), tức Plan
nằm **dưới** danh sách tin nhắn và **trên** composer. Nó không đẩy tin nhắn xuống,
nhưng **chiếm chiều cao của cột giữa** — mỗi lượt đang mở Plan thì vùng chat bị co
lại. Đây là câu hỏi mở, không phải đã chốt: phương án "cột phải thành drawer ở màn
hẹp" giải quyết được việc đó nhưng cần một ngưỡng mới và một nút mở, tức thêm một
breakpoint nữa phải khai cùng lúc ở Tailwind và ở JS. Mobile vẫn là một cột với
sidebar dạng drawer — chưa có drawer cho cột phải.

### 14.2 Hội thoại

**Đang có:** `.bubble` bo `2xl` 16px; người dùng `bg-accent-soft`, trợ lý `bg-surface`;
hướng đọc bằng nền + căn lề, không có đuôi (§5.1).

**Đích** — chuyển từ "chat bubble" sang "khối trả lời biên tập":

- Trợ lý **không** bọc toàn bộ trong card. Nội dung trả lời là nội dung trực tiếp;
  chỉ hàng bằng chứng (đã đổi N file, test N/N) nằm trong khối có nền.
- Người dùng: compact hơn, bo 12px (`xl`) thay vì 16px, bề rộng tối đa ~72%.
- Các tin liên tiếp của cùng một lượt gom thành một khối; avatar không lặp ở mọi
  dòng.
- Mỗi lượt có **turn header** ngắn — để đọc lại không phải quét toàn bộ lịch sử.
  **Đã làm (2026-10-07):** `components/chat/turn-header.tsx`, gắn vào tin ĐẦU của
  lượt trong `components/chat/message-list.tsx`. Nội dung theo bản CHỐT ở §15.1
  điểm 4 (tên việc + trạng thái nổi; giờ, số tool, số file là thông tin phụ), chứ
  không theo năm thứ ngang nhau mà mục này liệt kê — §15 thắng khi cụ thể hơn.

Lưu ý bo góc: `xl` 12px cho bubble người dùng là **đổi vai trò** của `2xl` đang
được §4.1 gán cho "bubble, khung modal, vỏ composer". Sửa thì sửa §4.1 cùng lượt.

### 14.3 Tool execution — chỗ đáng đầu tư nhất

Dữ liệu đã có phase (`tool-trace.tsx:123` đọc `phase: 'start' | 'done'`), hiển thị thì
chưa thành năm lớp. Đích là thẻ tool năm lớp:

1. **Đầu thẻ**: icon, tên hành động bằng ngôn ngữ người dùng hiểu, trạng thái
   (`Queued` · `Running` · `Waiting` · `Completed` · `Failed`), thời gian chạy,
   phạm vi (project / file / workspace).
2. **Thân mặc định**: làm gì, đầu vào chính, kết quả ngắn, file bị đụng.
3. **Thân mở rộng** (mới hiện raw command, stdout/stderr, payload, trace).
4. **Đường trạng thái bên trái** — tín hiệu thứ hai ngoài màu, theo §6.
5. **Nhóm theo phase**: PLAN → IMPLEMENT → REVIEW. Đây là thứ tạo cảm giác agent
   có phương pháp thay vì spam tool.

Trạng thái phải có cả icon **và** chữ: màu đơn độc là vi phạm §6. Năm tên liệt kê
ở trên là bản cũ; tên hiển thị và nghĩa của mọi trạng thái chốt ở §15.5.

**Đã làm một phần (2026-10-07, đợt P1-D).** Ba lớp đầu tiên có thêm thứ mà bản cũ
thiếu, và cả ba đều đọc từ DỮ LIỆU (`lib/tool-phases.ts`), không đoán từ đầu ra:

- **lớp 4 (đường trạng thái bên trái) — xong.** Trước đây chỉ `lỗi` và `bị bỏ dở` có
  vạch; nay CẢ BỐN trạng thái đều có (`accent` đang chạy · `danger` lỗi · `warning`
  bỏ dở · `subtle` xong), nên trong một danh sách dài mắt đọc được trạng thái mà
  không phải dò chữ ở cuối dòng. Chữ trạng thái vẫn luôn đi kèm — vạch là lớp thứ hai.
- **lớp 5 (nhóm theo phase) — xong.** `groupByPhase()` cắt mảng sự kiện thành các đoạn
  `Khảo sát / Thực hiện / Kiểm chứng / Khác`: **đổi phase thì mở đoạn mới**, nên vòng
  `sửa → test lỗi → sửa` hiện ra thành `Thực hiện` → `Kiểm chứng · 1 lỗi` → `Thực hiện`
  chứ không bị gộp thành một rổ. Tool lạ (đặc biệt là `mcp__*`, tên chỉ nói nguồn chứ
  không nói đọc hay ghi) rơi vào đoạn `Khác` — không gán bừa vào một phase trông rất
  chắc chắn. Nhãn đoạn là chữ trên nền, không viền/nền (điểm 13).
- **lớp 1 (đầu thẻ) — một phần.** Thêm PHẠM VI (`một tệp` / `dự án` / `phiên làm việc`)
  trong **thẻ mở**, không chen vào dòng gọn: dòng gọn đã có tham số chỉ thẳng tệp/lệnh
  ngay cạnh nhãn (§15.2 điểm 6).

**Chưa làm ở §14.3:** nhãn `chờ bạn cho phép` ở cấp tool (chưa có dữ liệu trạng thái
phê duyệt theo từng tool — §15.2 điểm 6 ghi rõ), lớp 3 chưa tách raw payload/trace khỏi
stdout, và "8 file" kiểu đếm theo ĐỐI TƯỢNG vẫn ngoài tầm (cần biết kết quả tool).

### 14.4 Composer

Đang có: model selector, nút Send đổi thành Stop khi stream, phạm vi ngữ cảnh.
Đích: hàng phụ ở chân (model · scope · gửi) với chữ nhỏ hơn chữ trong ô nhập, để
không cạnh tranh với nội dung người dùng đang gõ; vùng focus mở rộng nhẹ theo chiều
dọc; **context pill** dạng `@đường/dẫn`, `@diff-hiện-tại`, `@lỗi-gần-nhất` — giới hạn
số pill hiển thị, quá 3 thì gom lại.

> **ĐÃ LÀM 2026-10-08 (đợt P1-E)** — ba vế đầu:
> · **Hàng chân** = `model · phạm vi · gửi` (ô chọn model rời dải công cụ, xuống
> cùng hàng với nút gửi); mọi chữ ở hàng đó ≤ 14px, dưới `text-read` 16px của ô
> nhập. Dải công cụ trên chỉ còn việc của tác vụ (menu Tác vụ, chế độ phê duyệt,
> chip file chờ duyệt).
> · **Phạm vi** là chip có CHỮ (`workspaceScopeChip`), phân biệt `chưa có thư mục`
> với tên thư mục đang nối — trước đây là nút icon nên hai trạng thái trông giống
> nhau.
> · **Focus mở rộng nhẹ theo chiều dọc** đúng nghĩa đen: vùng nhập +8px (12/0 →
> 14/6), hàng chân trả lại đúng 8px ở ĐÁY (6/14 → 6/6), nên vỏ composer và cột tin
> nhắn KHÔNG dịch chuyển một pixel (§15.4 điểm 15). Hợp đồng số:
> `COMPOSER_FOCUS_PAD`; đo trong trình duyệt: `docs/design-qa/2026-10-08-composer/`.
> · **Còn lại của mục này: context pill** `@đường/dẫn` (nhóm P2) — chưa có cơ chế
> gắn đường dẫn, nên chưa có gì để hiển thị hay giới hạn "quá 3 thì gom".

### 14.5 Bốn cơ chế tạo cảm giác "thông minh"

Không cần màu mới hay gradient. Bốn thứ này đủ:

1. **Trạng thái agent rõ nghĩa.** Danh sách đích: `Planning` · `Inspecting` ·
   `Editing` · `Running` · `Waiting for approval` · `Verifying` · `Completed` ·
   `Blocked`. Hiện `status-line.tsx` chỉ có một lớp trạng thái mảnh. Đây là **việc
   đang làm** — một cụm động từ, không phải trạng thái; tên và nghĩa của trạng thái
   chốt ở §15.5.
2. **Bằng chứng trước lời nói.** Mỗi kết quả quan trọng kèm: số file đổi, test
   chạy, mức rủi ro, và mở được ra diff / log test / danh sách file. Nền tảng đã có
   (`evidence-badge.tsx` dùng ở `plan-panel.tsx` và `hud/agent-hud.tsx`).
3. **Phê duyệt có ngữ cảnh.** Đúng thứ tự: muốn làm gì → vì sao cần quyền → file
   nào bị đụng → rủi ro → `Allow once` / `Allow for project` / `Deny`.
4. **Hành động kế tiếp.** Xong việc không chỉ hiện "Done": gợi ý
   `[Chạy preview] [Xem diff] [Tạo commit]`.

### 14.6 Signature — bản sắc không bằng trang trí

Nhận diện của Vyen nằm ở: cách gom hội thoại, cách tool thành timeline, cách
approval trình bày rủi ro, cách composer phản hồi ngữ cảnh, và **một màu "signal"
xuất hiện đúng lúc**. Không cạnh tranh bằng việc thêm màu.

### 14.7 Cái không nên làm

- Không thêm glassmorphism, gradient, hiệu ứng nặng để gây ấn tượng.
- Không tăng shadow toàn app để tạo chiều sâu — chỉ tăng khả năng phân biệt ở
  đúng vùng quan trọng.
- Không đổi `maxWidth.thread` chỉ vì một con số tròn hơn.
- Không đổi bo góc bubble mà không sửa §4.1 cùng lượt.

### 14.8 Thứ tự ưu tiên

| Mức | Việc |
|---|---|
| P0 | Sửa `accent-dim` và chấm trí Settings (§13.2) — **xong** · typography Inter — **xong** · cột px 14/16/12 (§13.2) — **xong, có ảnh trước/sau** · visual QA ở 375 / 768 / 1024 / 1440px — **đã chụp chat rỗng + Settings và đo 0px tràn ngang; còn lượt tool chạy / diff / lỗi / zoom 200%** |
| P1 | Khối trả lời biên tập (trợ lý không bọc card) — **xong** · **turn header + dữ liệu lượt — ĐÃ LÀM (2026-10-07)** · **gom lượt thành khối gập được — ĐÃ LÀM (2026-10-07)** · **nhóm tool theo phase — ĐÃ LÀM (2026-10-07)** · thẻ tool năm lớp — **một phần (lớp 1/4/5, đợt P1-D)** · **composer mới (hàng chân + focus) — ĐÃ LÀM (2026-10-08, đợt P1-E)** · context pill — **chưa (P2)** |
| P2 | Task control rail · bằng chứng mở được · approval theo rủi ro · hành động kế tiếp · context pill |
| P3 | Chuyển động 150–200ms · chỉ báo streaming · hover/focus · drawer ở mobile · bàn phím · nhánh reduced-motion |

P0 phải xong trước P1: sửa chữ và tương phản trước khi đổi bố cục, vì bố cục mới
làm số chỗ hiển thị chữ tăng lên.

### 14.9 Điều kiện nghiệm thu

Cùng bộ ảnh như §12 — 375 / 768 / 1024 / 1440px, cộng mobile — cho **bốn** vùng:
composer, một lượt hội thoại có tool chạy, một diff/approval, và Settings. Ảnh phải
chụp cả trạng thái đang chạy và trạng thái lỗi. Không có ảnh thì không đánh giá được
bố cục, khoảng trắng và mật độ. Đây vẫn là điều kiện cần cho mọi thứ khác trong tài
liệu, kể cả §15: §15 là đặc tả chấm được, không phải bằng chứng giao diện đã tốt lên.

> **Trạng thái 2026-10-06:** đã có ảnh cho **2/4 vùng** — composer/chat rỗng và
> Settings, cả 4 bề rộng, trước và sau đợt đổi cỡ chữ, lưu ở
> `docs/design-qa/2026-10-06-type-scale/`. **Còn 2 vùng chưa chụp** (lượt hội thoại
> có tool chạy, diff/approval) vì cần dữ liệu thật, và chưa chụp trạng thái lỗi,
> chưa đo zoom 200%. Điều kiện nghiệm thu này **chưa đạt**.
>
> **Trạng thái 2026-10-07 (đợt LƯỢT):** đã chụp thêm vùng **lượt hội thoại có tool
> chạy** (ba lượt: xong có 3 thao tác · lỗi · chờ quyết định) ở 375/1024/1440 +
> 1440 zoom 200%, đo `scrollWidth === clientWidth` (0px tràn ngang) và 0 lỗi
> console — `docs/design-qa/2026-10-07-turns/` ghi cách seed và số đo.
> **Còn 1/4 vùng chưa có ảnh: diff/approval** — trạng thái đó đến từ runtime, không
> seed được từ IndexedDB, và không có khoá LLM thì không sinh được lượt thật.
> Ảnh vẫn chưa ai soi bằng mắt, nên điều kiện này **vẫn chưa đạt**.
>
> **Trạng thái 2026-10-08 (đợt P1-E):** vùng **composer** đã chụp LẠI sau khi đổi
> bố cục (hàng chân + focus) — 375/768/1024/1440 ở trạng thái nghỉ, thêm 1440
> đang focus, 1440 đã nối thư mục (chip phạm vi đổi nhãn) và 1440 zoom 200%:
> `docs/design-qa/2026-10-08-composer/`, 0px tràn ngang ở cả năm cấu hình, 0 lỗi
> console, và chiều cao vỏ đo được không đổi khi focus (170/170 · 144/144).
> **Vẫn còn 1/4 vùng chưa có ảnh (diff/approval)** và **vẫn chưa ai soi ảnh bằng
> mắt**, nên điều kiện nghiệm thu này **vẫn chưa đạt** — phần đã làm chỉ thu hẹp
> khoảng trống, không đóng được điều kiện.

## 15. Yêu cầu thiết kế — 18 điểm để chấm

> Cùng điều kiện với §13 và §14: đây là **yêu cầu**, không phải mô tả code đang
> chạy — và cũng **không** phải kế hoạch triển khai. Thứ tự làm nằm ở §14.8, bằng
> chứng phải nộp nằm ở §12 và §14.9. Mục này không nói sửa file nào, theo thứ tự nào.

§13.1 hỏi ba câu: agent đang làm gì · có gì cần mình quyết · kết quả thay đổi ở đâu.
18 điểm dưới đây chia ba câu đó thành thứ chấm được. §15.1–§15.2 và §15.4 nói về
**cách thông tin được trình bày**; điểm 12–14 nói thẳng về diện mạo (typography,
phân cấp, vùng xem), nên chúng vẫn phải tuân §2–§8. §15 không thay thế §2–§8, và chỗ
nào §15 cụ thể hơn §13–§14 thì §15 là bản chốt — điều kiện đó §14 đã ghi sẵn.

Bốn chỗ §15 sửa lại §14 cho khỏi hai bản song song: điểm 4 thu lại turn header mà
§14.2 đang liệt kê quá nhiều thứ ngang nhau; điểm 6 định nghĩa lại "năm lớp" của
§14.3 thành **năm tầng thông tin**, không phải năm vùng luôn hiện; điểm 14 bổ sung
vế còn thiếu của §14.1 (cột phải là tóm tắt trạng thái, không phải kho chứa); và
§15.5 chốt tên hiển thị của trạng thái, thay cho năm tên ở §14.3 và cách gọi ở §14.5.

### 15.1 Bố trí tin nhắn — điểm 1–5

**Chốt trước — "một lượt" là gì.** Lượt là đơn vị công việc người dùng giao và agent
theo đuổi tới lúc dừng, không phải "một khoảng thời gian" hay "một tin nhắn". Ranh
giới lượt phải là **dữ liệu gắn theo sự kiện**, không suy đoán lúc vẽ: nếu mỗi chỗ
render tự gom lại thì hai màn hình sẽ gom khác nhau. Và ranh giới do **điều khiển người
dùng quyết định**, không do máy phân loại nội dung tin nhắn:

**Đã triển khai (2026-10-07):** ranh giới lượt là dữ liệu lưu trữ — `lib/turns.ts`
(`nextTurnId` / `assignTurnIds`) là LUẬT DUY NHẤT, `StoredMessage.turnId` giữ kết
quả, `reconcileActiveMessages` cấp lúc GHI. Đường "việc khác khi đang chạy" chạy
qua sự kiện **follow-up** (Alt+Enter) — xem §14.1.

- Gửi từ composer khi có lượt đang chạy = **điều chỉnh việc hiện tại** (bổ sung, sửa
  yêu cầu) → thuộc lượt cũ, hiện thành đoạn điều chỉnh.
- Giao một **việc khác** phải đi qua **New task** (§14.1) → lượt mới ở trạng thái
  `chờ bắt đầu`, không được gộp âm thầm vào lượt cũ.
- Khi lượt cũ **đang chờ quyền**: tin nhắn **trả lời đúng câu đang chờ** (cho phép /
  từ chối / thông tin bị hỏi) thuộc lượt cũ; mọi tin khác là lượt mới `chờ bắt đầu`.

| Tình huống | Thuộc lượt nào | Vì sao |
|---|---|---|
| Gửi bổ sung / sửa yêu cầu khi agent đang chạy | Lượt đang mở, thành đoạn điều chỉnh | Cùng mục tiêu, chưa có điểm dừng nào |
| Giao việc khác khi agent đang chạy | Lượt mới, `chờ bắt đầu`, xếp hàng sau lượt cũ | Việc khác không phải là phần của việc đang làm |
| Người dùng **Stop** rồi gửi tiếp | Lượt mới; lượt cũ chỉ đóng khi các tool đã thực sự dừng (xem điều kiện dừng ở dưới) | Stop là điểm kết thúc do người dùng đặt, không phải tạm dừng |
| Bấm **Retry** sau lỗi | **Không** tạo lượt mới — thêm một lần thử trong cùng lượt | Lỗi cũ phải còn nhìn thấy được; lượt mang trạng thái của lần thử cuối |
| Tin nhắn trả lời câu đang chờ quyền | Lượt đang mở | Đó chính là câu hỏi của lượt |
| Tin khác khi lượt đang chờ quyền | Lượt mới, `chờ bắt đầu` | Chưa tới lượt nó |

**Stop không kết thúc lượt ngay.** Bấm Stop đưa lượt sang **`đang dừng`**; lượt chỉ
trở thành **`đã hủy`** khi mọi tool đã thực sự ngừng chạy — tool nào còn dang dở thì
được đánh dấu `bị bỏ dở` (§15.5). Lý do: nếu UI báo "đã hủy" mà tiến trình vẫn đang
ghi file thì người dùng sẽ tin một trạng thái không có thật. `đang dừng` là trạng
thái có thật trong bảng §15.5, không phải nhãn loading tạm.

Lượt **kết thúc** khi agent đã dừng và không còn tool nào đang chạy hay chờ quyền —
tức ở một trong các trạng thái cuối của bảng §15.5. Lượt chỉ có trả lời mà không có
tool, và lượt bị hủy giữa chừng, vẫn là lượt hợp lệ: không được hiển thị khung rỗng
hay mục trống cho đủ khuôn.

**1. Một lượt có cấu trúc đọc nhận ra được.** Phần tổng kết của một lượt đọc theo
thứ tự **yêu cầu → cập nhật ngắn → nhóm thao tác → kết quả → bằng chứng**. Đây là
**thứ tự đọc của bản tổng kết**, không phải trình tự bắt buộc của mọi sự kiện: agent
được quyền lặp kiểm tra → sửa → test lỗi → sửa tiếp (điểm 8), và lượt không có tool
hay lượt bị hủy vẫn phải trình bày tự nhiên. Điều bắt buộc chỉ là: lời giải thích,
tool và kết luận không được cùng một độ nổi, vì như thế người đọc phải tự đi tìm
thông tin quan trọng.
**Đã làm phần DỮ LIỆU (2026-10-07).** Khái niệm lượt nay tồn tại trong dữ liệu:
`lib/turns.ts` là nguồn duy nhất quyết định ranh giới, `StoredMessage.turnId` giữ
kết quả (trường không index, không bump version Dexie), và việc gán xảy ra ở
`reconcileActiveMessages` — tức lúc GHI, không phải lúc vẽ. Row cũ chưa có lượt
được cấp đúng một lần rồi giữ nguyên; `hasStoredMessageChanged` so sánh `turnId`
nên việc nâng cấp thật sự được ghi.
Đang có: thứ tự **yêu cầu → nhóm thao tác → kết quả** vẫn do model viết ra quyết
định; mới có mốc mở lượt (turn header) chứ chưa có bản tổng kết đọc theo thứ tự
đó.

**2. Trợ lý là nội dung biên tập, không phải bong bóng chat.** Văn bản trả lời đặt
trực tiếp trên nền hội thoại; **chỉ** code, diff, bằng chứng và yêu cầu quyết định
mới có khung riêng. Tin người dùng compact, nền nhấn nhẹ.
**Đã làm (P1, 2026-10-06).** `.bubble` / `.bubble-user` / `.bubble-bot` đã bị gỡ
khỏi `app/globals.css`; trợ lý là `data-testid="reply-text"` nằm trực tiếp trên nền
hội thoại, người dùng là `.user-note` (bo 12px). Không còn avatar lặp ở mọi dòng
(§15.1 điểm 3), và cột chip tool đổi đệm từ 50px xuống 34px cho khớp cột chữ mới
(`components/chat/tool-trace.tsx`). Yêu cầu này không chỉ đổi bo góc — nó đổi việc
khối nào **được** có khung, nên khung của code/diff/bằng chứng vẫn nguyên.

**3. Gom cập nhật liên tiếp.** Một agent đang làm một việc thì không tạo "tin nhắn
mới" cho từng thao tác nhỏ. Các cập nhật thuộc cùng một khối tiến trình; chỉ kết quả
cuối có điểm ngắt rõ. Avatar và tiêu đề không lặp ở mỗi dòng.
**Đã làm một phần (P1, 2026-10-06):** avatar chỉ hiện ở tin MỞ khối
(`runPosition === 'start'`), tin sau giữ cột bằng ô đệm 26px; vị trí trong khối do
`runPositionById` trong `components/chat/message-list.tsx` tính MỘT chỗ.
**Cập nhật 2026-10-07:** dữ liệu LƯỢT đã có (`turnId` trên row + `groupTurns()`
trong `lib/turns.ts`), turn header đánh dấu chỗ MỞ lượt, và vế "gộp cập nhật thành
một khối tiến trình" **đã xong**: mỗi lượt ĐÃ ĐÓNG gập được thân lại, chỉ còn lại
`tên việc · trạng thái` — nút chevron trên header, `aria-expanded`, và dòng phụ nói
thật là `đã gập`. Luật gập là dữ liệu (`isFoldableTurn` + `foldedRowIds`), nên lượt
đang chạy hoặc đang chờ quyền **không** gập được: gập nó là giấu đúng thứ người
dùng đang cần nhìn. Trạng thái gập là trợ giúp ĐỌC nên ở lại trong phiên, không ghi
xuống DB — ghi vào thì một cú bấm hôm nay sẽ ẩn nội dung ở mọi phiên sau.

**4. Turn header gọn, và giúp đọc lại lịch sử.** Nổi bật **tên việc + trạng thái**;
thời gian, số tool, số file là **thông tin phụ**. Header không được biến thành một
hàng đầy badge. Nhìn lướt lịch sử phải phân biệt được lượt nào sửa tính năng, lượt
nào điều tra lỗi, lượt nào bị chặn.
**Đã làm (2026-10-07).** `components/chat/turn-header.tsx` render ở đầu mỗi lượt:
tên việc (từ yêu cầu NGƯỜI DÙNG mở lượt, `turnTitleOf`) + nhãn trạng thái lấy
nguyên văn bảng §15.5 kèm icon và `title` giải nghĩa; dòng phụ `text-meta` chỉ hiện
khi có gì thật để nói (giờ, số tool, số file), và hai con số đó đếm trên DỮ LIỆU
(số lần gọi tool, số đường dẫn khác nhau trong tham số tool) — không parse chuỗi
hiển thị. Không badge, không viền, không bóng; trạng thái `xong` **không** kèm dấu
tick (§15.5). Hợp đồng: `tests/design-system.test.ts` + `tests/turns.test.ts`.
Đang có: header phủ đủ 8 trạng thái vòng đời của lượt; **chưa có** số thứ tự lượt —
§14.2 xếp nó vào thông tin phụ, và khi chưa có nơi nào dùng thì thêm nó chỉ làm dày
header, đúng thứ điểm này cấm.

**5. Nhịp khoảng trắng phải biểu đạt quan hệ thông tin.** Khoảng cách **trong** một
nhóm nhỏ hơn khoảng cách **giữa** các lượt; phần kết luận thở rộng hơn cập nhật tiến
trình. Khoảng trắng không được chia đều cho "đẹp".
**Đã làm (P1, 2026-10-06).** Nhịp nay là MỘT hàm — `rowSpacing(position)` trong
`components/chat/message-item.tsx`: giữa khối `py-0.5`, mở khối `pt-1 pb-0.5`, đóng
khối `pb-5 pt-1.5`; hàng người dùng `py-5` (nó MỞ một lượt, nên là mốc ngắt lớn
nhất). Assertion trong `tests/design-system.test.ts` đọc chính hàm này và so các con
số với nhau (trong khối < mốc ngắt), nên đổi một nhánh về "đều cho đẹp" là đỏ. Còn
thiếu: "phần kết luận thở rộng hơn cập nhật tiến trình" — nó cần biết đâu là kết
luận, tức cần thêm một trường trên dữ liệu LƯỢT (dữ liệu lượt nay đã có, nhưng
chưa có chỗ nào đánh dấu "tin nào là kết luận").

### 15.2 Hiển thị tool — điểm 6–11

**6. Mặc định là dòng gọn; mở ra mới thành thẻ chi tiết.** Dạng gọn phải đọc được
một mạch kiểu `Đọc cấu hình build · 8 file · Đang chạy · 2,4s`: tên hành động bằng
ngôn ngữ người dùng hiểu đứng trước, raw command / payload / log nằm sau thao tác mở.
Năm lớp của §14.3 là **năm tầng thông tin**, không phải năm vùng luôn chiếm màn hình.
**Đã làm (P1, 2026-10-06).** Dòng gọn nay đọc một mạch
`nhãn · tham số · quy mô · thời gian · trạng thái`:

- **quy mô** — `toolScaleOf()` đếm trên ĐẦU RA ĐANG HIỂN THỊ (`+a −b` cho nhóm sửa
tệp, `N dòng ra` cho nhóm chạy lệnh, `N dòng` cho nhóm đọc/tìm). Cố ý không parse
"N file"/"N test pass" từ chuỗi: parse sai một lần là UI nói dối bằng một con số
trông rất chắc chắn.
- **thời gian** — đo bằng đồng hồ của chính chip, CHỈ khi nó tự thấy tool chuyển từ
đang chạy sang xong (`useElapsed`). Annotation không mang mốc thời gian, nên mở lại
lịch sử thì không có số nào để hiện — và không bịa.
- **trạng thái** — nay là CHỮ ở đuôi dòng (`xong` / `đang chạy` / `lỗi` / `bị bỏ dở`),
không còn chỉ nằm trong `aria-label` và màu icon (§6: ý nghĩa không được chỉ dựa
vào màu).

Còn thiếu so với §14.3: "8 file" kiểu đếm theo ĐỐI TƯỢNG (cần biết kết quả tool,
không chỉ chuỗi hiển thị) và nhãn `chờ bạn cho phép` (chưa có dữ liệu trạng thái
theo tool).
**Bổ sung 2026-10-07 (đợt P1-D):** dòng tiêu đề ĐOẠN PHASE không chen vào dòng gọn —
nó là một hàng riêng phía trên cụm chip, nên thứ tự đọc `nhãn · tham số · quy mô ·
thời gian · trạng thái` của một lần gọi vẫn nguyên. Đoạn được cắt trên cả mảng sự
kiện, không cắt theo từng đoạn lời, nên vài câu model viết xen giữa hai lần gọi tool
không làm đứt một đoạn `Thực hiện`.

**7. Mỗi loại tool một cách trình bày.** Không dùng một khuôn chung cho tất cả:

| Loại | Phải cho thấy |
|---|---|
| Đọc / tìm kiếm | Đối tượng đã tìm, kết quả liên quan |
| Sửa file | Đường dẫn, phạm vi thay đổi, diff |
| Chạy lệnh | Lệnh chính, trạng thái kết thúc, kết quả đáng chú ý |
| Chạy test | Pass / fail / skip, lỗi quan trọng |
| Phê duyệt | Hành động, phạm vi quyền, rủi ro |

Đang có: một khuôn chung, và cả dòng gọn bọc trong `font-mono text-meta`
(`tool-trace.tsx:758`) nên mọi loại tool đọc giống hệt nhau. Đây là điểm quyết định
UI trông như **hiểu công việc** hay chỉ như đang đổ dữ liệu.

**8. Gom tool theo mục đích, và thể hiện được vòng lặp.** Nhóm phải gọi được tên
công việc ("Điều tra lỗi đăng nhập"), không phải một dãy `search`, `read_file`,
shell. Khung PLAN → IMPLEMENT → REVIEW là tốt, nhưng phải chứa được
**kiểm tra → sửa → test lỗi → sửa tiếp**, và cả thao tác chạy song song.
Đang có: `tool-trace.tsx:123` chỉ đọc `phase: 'start' | 'done'` — hai giá trị này
không đủ để vẽ vòng lặp, càng không đủ để vẽ hai nhánh chạy song song.
**Bổ sung 2026-10-07 (đợt P1-D):** nhóm nay cắt từ **danh tính của tool** (`tên` +
`tham số`), không từ annotation `phase` — nên không cần thêm giá trị phase nào vào
dữ liệu, và vòng lặp hiện ra vì **đổi phase thì mở đoạn mới** (`groupByPhase`).
Thao tác chạy song song nằm chung một đoạn theo đúng thứ tự chúng xảy ra; gọi tên
công việc ở mức người dùng ("Điều tra lỗi đăng nhập") **vẫn chưa làm** — tên đoạn
hiện là tên phase, và muốn có tên việc thì phải có dữ liệu mục tiêu của lượt gắn xuống.

**9. Trạng thái tool khác trạng thái nhiệm vụ.** Tool hoàn tất **không** có nghĩa
việc thành công. Phải phân biệt đang chạy / chờ quyền / bị chặn / thất bại / bị hủy,
và tách "lệnh test đã kết thúc" khỏi "test đã pass".
Đang có: khác biệt này **đã có trong dữ liệu, chưa được dùng đủ ở UI**. `lib/evidence.ts`
phân biệt sáu bậc, trong đó `reported_done` nghĩa là "model báo xong, chưa ai kiểm
chứng" còn `verified` đòi biên nhận kiểm thử thật; ở cấp tool, `tool-trace.tsx:682`
chỉ có `running` / `failed` / `abandoned`, thiếu "chờ quyền" và "bị chặn có lý do".
Yêu cầu: hai cấp trạng thái này phải nhìn ra khác nhau, không gộp thành một màu.

**10. Bằng chứng phải mở được đúng nguồn.** Badge "5 file đổi" hay "12 test pass"
phải dẫn tới **đúng diff/log và đúng phiên bản** thay đổi. Ba trạng thái phải khác
nhau rõ: **đã kiểm chứng · chưa kiểm chứng · kiểm chứng thất bại**. Không dùng dấu
tick xanh chung chung để tạo cảm giác đáng tin.
Đang có: thang bằng chứng sáu bậc ở `lib/evidence.ts`, badge ở
`components/evidence-badge.tsx` (dùng ở năm chỗ, kể cả `message-item.tsx:583`), và
biên nhận kiểm thử ở `lib/verification.ts`. Thiếu: đường đi từ badge tới nguồn —
bấm vào badge hiện chưa mở ra diff hay log tương ứng.

**11. Lỗi và yêu cầu can thiệp phải nổi lên khỏi luồng bình thường.** Tool thành
công thì được gấp lại; **lỗi thì không được chìm trong nhóm đã đóng**. Phần lỗi phải
trả lời bốn câu, theo thứ tự: **lỗi ở đâu → ảnh hưởng gì → agent có tiếp tục được
không → người dùng cần quyết định gì**.
Đang có: chip lỗi đã có tông riêng và hover riêng (`tool-trace.tsx:719`) nên trạng
thái lỗi không bị nuốt khi rê chuột; nhưng một lỗi nằm trong nhóm đã gấp vẫn chìm,
và bốn câu trên chưa được viết ở đâu cả.

### 15.3 Diện mạo — điểm 12–14

**12. Hoàn thiện phân vai typography.** Inter cho hội thoại, điều hướng, nút và nhãn;
JetBrains Mono **chỉ** cho code, lệnh, đường dẫn và ID. Toàn UI không được trông như
terminal. Và: metadata nhỏ không được chứa thông tin quyết định.
Đang có: **đã đổi cả họ chữ lẫn cỡ (2026-10-06).** 48 trong 67 file `.tsx` từng gọi
`font-mono`; nay chrome (nhãn, nút, menu, nhãn trường, chip, hàng trạng thái,
metadata) là Inter và mono chỉ còn 37 chỗ đúng vai chữ máy — §3 ghi chiều đang chạy.
Vế cỡ cũng đã xong theo §13.2: `ui` 14px, hội thoại dài 16px, `meta` 12px (trước là
12/15/11), kèm ảnh trước/sau ở 4 bề rộng. Điểm này là **yêu cầu**, không phải gợi ý:
thứ người dùng phải đọc để quyết định không được nằm ở `micro` (10px) hay `meta` (12px).

**13. Giảm "hộp trong hộp", tăng phân cấp bằng bố cục.** Các tầng nền gần trắng
không tự tạo ra chiều sâu, và **không được khắc phục bằng cách thêm viền và shadow
khắp nơi**. Phân nhóm bằng vị trí, khoảng trắng, độ đậm chữ và nền nhẹ; bóng dành cho
overlay. Xanh trầm là **tín hiệu đúng lúc**, không phải màu phủ mọi control.
Đang có: `raised` `#f5f5f5` so với nền trắng chỉ **1.09:1**, `raised` so với `sunken`
**1.018:1** (§2.3). Đọc đúng con số này: đây là **nguy cơ phân lớp quá nhẹ, cần nhìn
UI thật để xác nhận**, không phải một kết luận thị giác đã đo. Tỉ lệ tương phản WCAG
không chứng minh hai nền không phân biệt được bằng mắt — diện tích, khoảng cách và
các yếu tố quanh nó đều ảnh hưởng. Vì vậy phần "nền không đủ để một mình tạo lớp"
vẫn chỉ là **giả thuyết cần kiểm bằng mắt**, không phải điều đã chứng minh: chưa ai
đo được bằng mắt trong môi trường này. Yêu cầu của điểm 13 thì vẫn giữ nguyên —
phân cấp bằng vị trí, khoảng trắng, độ đậm chữ và nền nhẹ, chứ không phải bằng cách
thêm viền và shadow khắp nơi. Việc xác nhận bằng mắt thuộc §12/§14.9 (cần ảnh), không
thuộc phép tính trên mã.

**14. Tách nhu cầu đọc prose khỏi nhu cầu xem code/diff.** Cột hội thoại giữ ổn định
(`maxWidth.thread`), nhưng nội dung kỹ thuật dài cần **vùng xem mở rộng**. Cột phải
phải là **tóm tắt trạng thái công việc**, không đồng thời chứa toàn bộ plan, file,
test, approval và diff.
Đang có: thứ tự thật ở `components/chat-interface.tsx:150/183/292`: MessageList →
`<aside>` (checkpoint bar + PlanPanel) → Composer, và cột phải chỉ có từ `screens.rail`
trong `tailwind.config.ts`.

Hai điểm dưới đây trước đây để mở; chốt luôn, vì chúng quyết định vùng chat có bị co,
có cuộn lồng, và người dùng có mất vị trí đọc hay không.

**Chốt A — vùng xem mở rộng.** Một vùng duy nhất, nhiều ngăn (Plan · File · Test log ·
Diff), mỗi lần mở một ngăn. Nó **phủ lên** chứ không đẩy: cột hội thoại giữ nguyên
`maxWidth.thread` — tức giữ `max-width: 768px` **và** chiều rộng responsive hiện tại,
không ép cột luôn rộng đúng 768px (trên mobile nó vẫn co về 100%) — nên danh sách tin
nhắn không bị đo lại và không co. Khi mở, trang nền khoá cuộn
và **chỉ vùng xem cuộn** — một ngữ cảnh cuộn duy nhất, không cuộn lồng. Đóng bằng
`Esc` hoặc nút đóng, và khi đóng thì **trả nguyên vị trí đọc** của hội thoại (nối tiếp
điểm 16). Vùng xem thuộc tầng dialog của §8.1 — không thêm tầng z mới, không thêm
breakpoint mới. Bề rộng: từ `screens.rail` (1432px) trở lên chiếm cột giữa + cột phải
(đủ rộng hơn 768px để xem diff); dưới ngưỡng đó chiếm phần còn lại của cửa sổ; dưới
768px chiếm toàn màn hình.

**Chốt B — Plan dưới `screens.rail`.** Plan **không** còn hiển thị thường trực trong
cột giữa. Chỗ của nó là một **dải tóm tắt một dòng, cao cố định** — tên việc · trạng
thái · số bước xong/tổng — đặt trong turn header của lượt đang chạy; bấm vào dải thì
mở ngăn Plan trong vùng xem của Chốt A. Vì dải cao cố định, chiều cao cột hội thoại
**không** phụ thuộc việc Plan đóng hay mở, nên không cần drawer riêng và không cần
ngưỡng mới. Ngoại lệ duy nhất được phép chiếm chỗ: khi lượt đang chờ quyết định
(§15.5), dải tóm tắt phải hiện dấu hiệu "cần bạn quyết định".

### 15.4 Cảm giác thông minh và chất lượng tương tác — điểm 15–18

**15. Composer phải nói ngữ cảnh thật đang được dùng.** Context pill phải phân biệt
**file đã gắn** / **đường dẫn không hợp lệ** / **phạm vi project đang chọn**. Model
selector và tùy chọn phụ lùi sau nội dung nhập. Focus rõ, nhưng không làm cả hội
thoại dịch chuyển hay phát sáng gây phân tâm.
> **New task — đã có SỰ KIỆN, chưa có NÚT (2026-10-07).** Bảng ranh giới lượt ở
> §15.1 đòi một đường "giao việc khác khi agent đang chạy → lượt mới". Đường đó
> đã tồn tại trong sản phẩm dưới tên **follow-up**: khi agent đang chạy,
> **Enter** = điều chỉnh việc đang làm (steering, cùng lượt), **Alt+Enter** =
> việc khác (lượt mới xếp sau) — `queueWhileBusy()` trong
> `react/use-chat-orchestration.ts`. Gợi ý phím dưới ô nhập nay nói rõ khác biệt
> đó (trước đây gọi cả hai là "xếp hàng"). **Còn thiếu:** một nút *New task* nổi
> bật ở cột trái; nó là việc trình bày, không phải việc dữ liệu.

Đang có (cập nhật 2026-10-08, đợt P1-E): **model và tùy chọn phụ đã lùi sau nội
nhập** — hàng phụ ở chân giờ là `model · phạm vi · gửi`, mọi chữ ở đó nhỏ hơn
`text-read` (16px) của ô nhập; **phạm vi project đang chọn đã phân biệt được**
bằng chip có chữ (`chưa có thư mục` ↔ tên thư mục, xem `workspaceScopeChip`);
**focus rõ mà không dịch chuyển hội thoại** — vùng nhập lớn lên 8px, hàng chân
trả lại đúng 8px ở đáy, nên chiều cao vỏ không đổi (đo được 170/170 và 144/144 ở
375/768/1024/1440px, `docs/design-qa/2026-10-08-composer/`), và hiệu ứng phát
sáng `PulseGlow` đã gỡ.

**Còn thiếu của điểm 15:** cơ chế gắn đường dẫn dạng `@đường/dẫn` — kéo theo hai
vế "file đã gắn" (nay chỉ có chip tệp đính kèm, hiện tên tệp chứ không phải đường
dẫn) và "đường dẫn không hợp lệ" (chưa có gì để sai). Đây là việc **P2**, không
phải chỉnh CSS.

**16. Streaming ổn định và tôn trọng vị trí đọc.** Đang đọc tin cũ thì không tự kéo
xuống cuối; có cập nhật mới thì **báo nhẹ** và cho quay lại tiến trình đang chạy. Tool
mở rộng, log dài ra và markdown xuất hiện không được làm bố cục nhảy liên tục.
Đang có: phần lớn. `components/chat/message-list.tsx` chỉ ghim đáy khi người dùng
đang ở đáy (`:346`), có nút "Xuống tin nhắn mới nhất" khi đã cuộn lên (`:594`), và
`HEIGHT_CACHE` cộng `rowVirtualizer.measure()` để bù các lần đo lại (`:364`, `:377`).
Hai chỗ cố ý vẫn kéo: đổi chat ghim tức thì (`:337`) và người dùng vừa gửi thì luôn về
đáy (`:345`). Yêu cầu còn thiếu: **nhảy bố cục khi một dòng gọn mở ra** — hiện chưa
đo, và đây là chỗ dễ nhảy nhất vì danh sách có ảo hoá.

**17. Diff và approval phải giúp ra quyết định nhanh.** Thay đổi đáng chú ý phải
đứng **trước** phần context dài; phải nói rõ file bị ảnh hưởng, tác động và khả năng
hoàn tác. `Allow once` và `Allow for project` phải khác nhau về **nghĩa**, không chỉ
khác nhãn — quyền rộng không được dễ bấm nhầm.
Đang có: hai bề mặt phê duyệt (`components/diff-confirm.tsx` với "Duyệt & Ghi Đĩa" /
"Từ chối", và `components/shell-confirm.tsx`), có phím tắt và có chốt `Esc` để từ
chối.

**Nhãn phím tắt — ĐÃ SỬA (2026-10-06).** Khối phím tắt ở cả hai hộp thoại nay đọc
`Esc từ chối · Tab rồi ↵ ở nút đang chọn`. Trộn ngôn ngữ ở đúng chỗ người dùng đang
phải quyết định là lỗi chứ không phải chi tiết, nên đây là sửa bắt buộc, không phải
việc thẩm mỹ.

**Hai mức quyền — CHƯA LÀM.** `Allow once` / `Allow for project` khác nhau về NGHĨA
đòi ghi vào chính sách quyền theo workspace (`toolPermissions` + `approvalPolicy`),
tức là đụng vào hành vi an toàn chứ không chỉ nhãn nút. Việc này cần một đợt riêng
có test cho cả hai chiều (cho phép rộng phải khó bấm nhầm hơn, và phải thu hồi được)
— không nên làm kèm một đợt bố cục.

**18. Bản sắc đến từ một trải nghiệm đặc trưng.** Vyen phải được nhận ra qua **cách
gom một lượt công việc, cách tool thành tiến trình dễ hiểu, và cách kết quả được
chứng minh** — không phải qua nền trắng + Inter + icon Lucide + xanh trầm, vì bốn thứ
đó ai cũng có. Đây là sự khác biệt bền hơn mọi hiệu ứng trang trí.
Đang có: từ đợt P1 đã có ba mảnh — nhịp khoảng cách trong-khối/giữa-lượt
(`rowSpacing`), dòng gọn tool nói được "bao nhiêu · mất bao lâu · trạng thái nào",
 và trạng thái tool là CHỮ chứ không chỉ màu. **Đợt 2026-10-07 thêm hai mảnh:**
dữ liệu LƯỢT theo sự kiện (`lib/turns.ts` + `StoredMessage.turnId`), turn header
đọc được `tên việc · trạng thái` khi nhìn lướt lịch sử, và **thân lượt gập được**
(đợt P1-C): mảnh "cách gom một lượt công việc" nay đã đủ ba vế — gom, đánh dấu chỗ
mở, và thu lại khi cần đọc lướt. Và §15.6 vẫn đòi bộ ảnh ở §12/§14.9 trước khi nói
"đã tốt hơn": ảnh lượt có tool chạy đã có, ảnh diff/approval thì chưa.

### 15.5 Trạng thái — chốt tên và nghĩa

Ba trục trạng thái khác nhau và **không được gộp**: **tool** (một lần gọi công cụ),
**lượt** (việc người dùng giao) và **bằng chứng** (mức đã kiểm chứng). Một lượt có
thể "xong" trong khi bằng chứng mới ở mức "đã báo xong"; một tool "xong" hoàn toàn có
thể nằm trong một lượt "lỗi". Năm tên ở §14.3 và danh sách ở §14.5 là bản cũ — bảng
dưới là bản chốt.

**Tool** — nhãn hiển thị trùng copy đang có ở `components/chat/tool-trace.tsx:693`:

| Khoá | Hiển thị | Nghĩa chính xác |
|---|---|---|
| `queued` | trong hàng | đã nhận, chưa bắt đầu chạy |
| `running` | đang chạy | đang thực thi; chờ hệ thống bên ngoài (mạng, tiến trình con) **vẫn là đang chạy** |
| `waiting_approval` | chờ bạn cho phép | đã dừng, không tự tiếp tục cho tới khi người dùng cấp quyền |
| `done` | xong | lệnh đã kết thúc, **không** nói kết quả đúng hay sai |
| `failed` | lỗi | kết thúc bằng lỗi thực thi |
| `abandoned` | bị bỏ dở | đã bắt đầu mà lượt dừng giữa chừng — không phải lỗi, không phải xong |

**Lượt** — trạng thái của cả nhiệm vụ:

| Khoá | Hiển thị | Nghĩa chính xác | Không dùng khi |
|---|---|---|---|
| `queued` | chờ bắt đầu | đã nhận yêu cầu, chưa bắt đầu xử lý | — |
| `running` | đang làm | còn tiến triển | đang chờ người dùng |
| `waiting_approval` | chờ bạn quyết định | agent đã dừng, không có tiến triển cho tới khi người dùng trả lời: cấp quyền, chọn phương án, hoặc bổ sung thông tin | còn tool đang chạy |
| `completed` | xong | agent đã dừng và báo hoàn tất | muốn nói kết quả đã được kiểm chứng |
| `blocked` | bị chặn | không tiếp tục được và agent nói được **thiếu gì**; người dùng phải đổi điều kiện rồi chạy lại | lỗi đã xảy ra mà không cần ai làm gì |
| `failed` | lỗi | đã thử và hỏng | chỉ thiếu quyền hoặc thiếu thông tin |
| `stopping` | đang dừng | người dùng đã bấm Stop, vài tool còn đang thực thi | đã chắc chắn mọi tool đã ngừng |
| `cancelled` | đã hủy | mọi tool đã ngừng chạy; lượt đóng ở đây | còn tool đang thực thi — khi đó phải hiện `đang dừng` |

`stopping` chỉ có ở lượt; tool trong lúc đó giữ `đang chạy` cho tới khi thoát, rồi
chuyển `bị bỏ dở` (hoặc `lỗi` nếu chính nó hỏng).

> **Lỗ đã biết (đo được 2026-10-07, chưa sửa):** tải lại trang làm lượt đang
> `chờ bạn quyết định` biến thành `xong`. `sanitizeToolInvocations` (`lib/db.ts`)
> **cố ý** bỏ mọi invocation chưa có `result` (pending không tái tạo được part hợp
> lệ), nên khi app ghi lại row đang `streaming` sau khi nạp, dấu vết "đang chờ
> quyền" biến mất và `turnStatusOf` chỉ còn thấy một row trợ lý đã xong. Đo trong
> `docs/design-qa/2026-10-07-turns/`: row `a3` đi từ `tools 1 / streaming` sang
> `tools 0 / complete`. Muốn đúng §15.5 thì lượt bị ngắt giữa chừng phải để lại
> **một dấu vết lưu trữ** (trạng thái `blocked`/`cancelled` hoặc cờ "chờ quyền") —
> đừng suy từ việc "row còn `streaming` hay không", vì chính việc ghi lại đã xoá
> dấu hiệu đó.

**Bằng chứng** — sáu bậc đã có ở `lib/evidence.ts`, nhãn badge là copy của
`describeEvidence`; chốt dùng đúng nhãn đó, không tự đặt tên khác: `Kế hoạch · chưa
chạy` · `Code · đang chạy` · `Code · đã báo xong` · `Kiểm thử · đã xác minh` · `Bị
chặn` · `Thất bại`.

**Ba cặp dễ lẫn — quy tắc phân biệt:**

- **Chờ cái gì.** Mọi nhãn bắt đầu bằng "chờ" phải nói rõ chờ ai: **chờ bắt đầu**
  (chưa tới lượt xử lý), **chờ bạn quyết định** (đang chờ người dùng trả lời). Chờ
  hệ thống — mạng, tiến trình con, model — hiển thị là *đang chạy*. Không có nhãn
  "chờ" trơ một mình.
- **Bị chặn vs Lỗi.** *Bị chặn* là biết vì sao và còn lối ra: câu hỏi kèm theo là
  "cần gì để mở". *Lỗi* là đã thử và hỏng: câu hỏi kèm theo là "hỏng ở đâu". Chặn
  không tự biến thành lỗi sau vài lần thử, và lỗi không được hiển thị như chặn.
- **Xong vs Đã xác minh.** *Xong* chỉ nói agent đã dừng và báo hoàn tất (tương ứng
  `reported_done`). *Đã xác minh* đòi biên nhận kiểm thử thật (`verified`). Vì vậy
  nhãn "xong" **không bao giờ** đi kèm dấu tick xanh.

**Hoạt động vs trạng thái vòng đời.** Danh sách ở §14.5 (`Planning`, `Inspecting`,
`Editing`, `Running`, `Verifying`…) là **hoạt động đang diễn ra**; bảng ở trên là
**trạng thái vòng đời**. Hai thứ phân biệt bằng **loại trường**, không bằng loại
từ — riêng tiếng Việt cả hai đều ở dạng "đang …", nên phân biệt bằng cách nói sẽ
sai. Hai trường độc lập và hiện cùng lúc được (`đang làm · đang sửa file`,
`chờ bạn quyết định · 2 file chưa đọc`); hoạt động không được thay cho trạng thái —
không hiện "đang sửa file" khi lượt thật sự đang `chờ bạn quyết định` — và trạng thái
không được giấu sau một cụm hoạt động.

### 15.6 Chốt: thế nào là đủ tốt

Yêu cầu để chấm cả 18 điểm: UI đẹp theo kiểu **ít nhiễu nhưng nhiều thông tin hữu
ích**. Nhìn nhanh phải trả lời được bốn câu: **agent đang làm gì · thay đổi ở đâu ·
kết quả có được kiểm chứng không · có cần mình quyết định không.**

"Bắt mắt hơn Codex" không phải mục tiêu, và cũng không phải thứ đánh giá được bằng
phép tính trên mã: khi chưa có UI render thật để nhìn thì **không được khẳng định đã
vượt đối thủ**. Điều kiện để câu đó trở thành sự thật vẫn là bộ ảnh ở §12 và §14.9.

**Cập nhật 2026-10-07:** điểm 4 (turn header) và phần DỮ LIỆU của điểm 1/3 đã xong —
nhìn lướt lịch sử nay thấy `tên việc · trạng thái` cho từng lượt. Bốn câu ở đầu mục
này vẫn chưa trả lời được đầy đủ: "thay đổi ở đâu" còn tuỳ vào thẻ tool năm lớp
(điểm 7/8) và "kết quả có được kiểm chứng không" vẫn chỉ có badge chứ chưa mở ra
nguồn (điểm 10).

Ảnh lượt (`docs/design-qa/2026-10-07-turns/`) đo được: 3 header đủ ở cả 4 cấu hình,
0px tràn ngang, 0 lỗi console, tên việc là chữ thật của người dùng kèm `3 thao tác ·
1 file`. Con số đó **không** nói UI đã đẹp hơn — nó chỉ nói phần dữ liệu lượt chạy
đúng như đặc tả.

**Đợt P1-C (2026-10-07):** thân lượt gập được — 2 header đầu có nút, header của
lượt đang chờ quyền KHÔNG có (đo trong ảnh chụp: `headersWithFold: [true, true,
false]`), gập rồi `aria-expanded=false` + dòng phụ `đã gập`, thân lượt 1 biến mất
còn lượt đang chạy vẫn hiện nguyên; mở lại thì nội dung trở về. Không lỗi console,
không tràn ngang ở 1440.

**§15 là cải thiện đặc tả, không phải cải thiện UI.** Thêm được 18 điểm chấm không
làm giao diện tốt hơn. Ba việc ở §13.2 sau đợt 2026-10-06: hai lỗi tương phản **đã
sửa** (`accent-dim` nay `#519a85`, chấm trí Settings nay `bg-accent-soft`), và
typography **đã đổi phần họ chữ** (Inter cho chrome, mono chỉ cho chữ máy) nhưng
**chưa đổi cỡ** 14/16/12. Đợt này vẫn chưa có bộ ảnh ở §12/§14.9, nên "UI đã tốt
hơn" vẫn là điều chưa được chứng minh bằng mắt — chỉ có thay đổi kiểm được bằng
mã và bằng test.
