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
>
> **LƯU Ý VỀ NGUỒN SỰ THẬT:** mảng `hex` trong `tailwind.config.ts` là các giá
> trị **tĩnh**, KHÔNG phải `rgb(var(--token))`. Sửa `:root` trong `globals.css`
> một mình sẽ **không** đổi màu của `bg-sunken` / `text-primary` / `border-subtle`
> … — phải sửa **cả hai** file. (Chỉ 13 key alias cũ mới đọc qua `var()`.)

---

## 0. Mục lục

| § | Nội dung |
|---|---|
| [1](#1-quy-tắc-gốc) | Quy tắc gốc — một câu, kèm hệ quả bắt buộc |
| [2](#2-token-màu) | Token màu: bề mặt, chữ, viền, trạng thái, diff — kèm HEX |
| [3](#3-typography) | Typography: 3 họ chữ, 6 bậc cỡ chữ, quy tắc phân cấp |
| [4](#4-bo-góc--khoảng-cách) | Bo góc bất đối xứng và khoảng cách |
| [5](#5-chiều-sâu-nét-vẽ-tay) | Chiều sâu: nét mực + bóng lệch cứng, điểm thực thi duy nhất |
| [6](#6-chính-sách-màu-trạng-thái) | Chính sách màu trạng thái + danh sách alias tạm phải xoá |
| [7](#7-light-only--không-có-nhánh-tối) | Light-only: vì sao đổi từ dark sang light |
| [8](#8-z-index) | Thang z-index (`lib/ui-z.ts`) |
| [9](#9-drift-đã-biết--chưa-migrate) | **Drift đã biết / chưa migrate** — mục quan trọng nhất |
| [10](#10-hợp-đồng-được-kiểm-chứng-bằng-gì) | Test kiểm chứng cái gì, và cái gì nó **không** kiểm |

---

## 1. Quy tắc gốc

> **Giao diện này vẽ tay: nét mực đen 2px, bo góc bất đối xứng, bóng đổ lệch
> cứng không blur, một bảng màu duy nhất trên nền giấy trắng. Mọi chiều sâu đều
> phải đọc được bằng mắt trước khi đọc được bằng code — nếu một khối không khiến
> mắt biết nó nổi hay chìm, khối đó chưa xong.**

Bốn hệ quả cụ thể, mỗi cái đều kiểm được:

1. **Chiều sâu = nét viền mực 2px + bóng lệch cứng ba bậc, cộng `.well` cho ô
   nhập.** Không blur, không bóng mềm mờ dần. Bốn class `.lift-sm` /
   `.lift-md` / `.lift-lg` / `.well` là toàn bộ cơ chế nổi/chìm, và chúng là
   nguồn DUY NHẤT được phép khai báo `box-shadow`. Xem §5.
2. **Viền mang đúng MỘT vai trò.** Ba bậc `subtle` / `default` / `strong`, mỗi
   bậc một việc. Xem §2.3. Nếu bạn không phân biệt được bạn đang cần bậc nào,
   bạn chưa cần viền.
3. **Bo góc bất đối xứng là mặc định.** `rounded-ink` / `rounded-wobble` là hai
   bậc hữu hình của phong cách vẽ tay; thang bo đều (`sm`…`3xl`) chỉ dành cho
   control nhỏ. Xem §4.1.
4. **Doodle tập trung, không rải đều.** Chi tiết trang trí đậm chỉ ở bong bóng
   tin nhắn, màn hình trống và trạng thái đang trả lời. Sidebar / settings /
   bảng / diff / code **phẳng**. Xem §4.5.

Ứng dụng **light-only** — xem §7.

---

## 2. Token màu

Toàn bộ token khai trong `tailwind.config.ts:20-47` (mảng `hex`) và phản chiếu 1-1
trong `app/globals.css:27-101` (khối `:root`) dưới dạng channel RGB để CSS thuần
dùng `rgb(var(--token) / a)`.

### 2.1 Bề mặt — 5 tầng trên nền giấy trắng

**Trên nền sáng, thứ tự "càng sáng hơn càng nổi hơn" không còn đúng.** Nền app
gần như toàn trắng; chiều sâu đến từ **nét viền mực** và **bóng lệch cứng**
(§5), không phải từ độ sáng của nền. Vì vậy thang này chỉ là những chênh lệch
rất nhỏ, và `surface` cùng `overlay` là **cùng một màu trắng**.

| Token | HEX | Class | Dùng cho |
|---|---|---|---|
| `bg-sunken` | `#f2f2ef` | `bg-sunken` | Ngoài cùng: nền app, sidebar, vùng tĩnh |
| `bg-base` | `#fafaf8` | `bg-base` | Vùng làm việc: ô nhập, mã |
| `bg-surface` | `#ffffff` | `bg-surface` | Khối nội dung: card, bubble, dải tiêu đề |
| `bg-raised` | `#eeeeeb` | `bg-raised` | Control: nút, vùng hover, code |
| `bg-overlay` | `#ffffff` | `bg-overlay` | Nổi trên cùng: popover, dropdown, menu |

Nguồn chân thực tương phản: `bg-sunken` là nền `<html>`/`<body>`. Thang này
**không** có bậc cao hơn `overlay`; thêm tầng mới là thêm token, phải sửa cả
hai file.

**Vì sao `surface` và `overlay` cùng là `#ffffff`.** Chúng trả lời hai câu hỏi
khác nhau nhưng trên giấy trắng cùng một màu trả lời được cả hai: "khối nội
dung nằm trên nền giấy" và "popover nổi trên nền giấy". Chúng PHẢI là hai
token riêng — nếu gộp làm một, mỗi token mất hết nghĩa, và khi cần một miền
tách khỏi miền kia (ví dụ sau này làm nền riêng cho rail) thì không còn chỗ để
ghi vào.

### 2.2 Chữ — 4 tầng theo vai trò, không theo độ sáng

(`app/globals.css:41-48`)

| Token | HEX | Class | Dùng cho |
|---|---|---|---|
| `text-primary` | `#18181b` | `text-primary` | Nội dung chính — mực đậm |
| `text-secondary` | `#52525b` | `text-secondary` | Mô tả, nhãn phụ, metadata |
| `text-tertiary` | `#6b6b73` | `text-tertiary` | Nhãn nhóm, gợi ý, dấu thời gian |
| `text-disabled` | `#a1a1aa` | `text-disabled` | Control bị vô hiệu — **không dùng cho nội dung** |

`text-disabled` không phải "mờ hơn `tertiary`" — nó là "không dùng được". Đừng dùng
nó để làm mờ một thứ vẫn cần đọc được.

**Có thêm một token chữ, không phải một bậc trong thang:** `on-fill` (`#ffffff`).
Nó trả lời "chữ màu gì để đọc được **trên nút tô đậm**", và câu trả lời là trắng
chứ không phải mực. Trước đây vai trò này do `text-sunken` đảm nhiệm — hợp lý
khi nền là tối; nay `sunken` là giấy trắng nên tên đó không còn đúng nghĩa và
mực đen trên nền bão hòa chỉ đạt 2.7–3.5:1 (FAIL AA). Đừng dùng
`text-primary` cho nút tô đậm, và đừng dùng `on-fill` cho nền thường.

**Cấm modifier opacity trên token chữ.** `text-tertiary/60`,
`text-text-muted/40` … là cách lách kiểm tra tương phản: 60% của một màu đã được
chọn để đạt WCAG AA thì không còn đạt nữa. Dùng đúng bậc, hoặc bậc dưới.

### 2.3 Viền — 3 tầng, mỗi tầm đúng MỘT việc

Đây là phần dễ trôi nhất trong hệ thống, nên nó được ghi ra bằng **công việc**, không
phải bằng tên. (`app/globals.css:50-56`)

| Token | HEX | Class | VIỆC CỦA NÓ — dùng khi nào, không dùng khi nào |
|---|---|---|---|
| `border-subtle` | `#dcdcd8` | `border-subtle` | **Đường phân cách TRONG một khối.** Giữa các dòng bảng, dưới dải tiêu đề `.settings-card-head`, `<hr>` trong prose. Không bao giờ để làm ranh giới ngoài của control. |
| `border-default` | `#2a2a2e` | `border-default` | **Ranh giới control.** Ô nhập, nút, ô chọn — thứ tay chạm vào. Đây là bậc mặc định khi bạn viết `border` mà không nghĩ kỹ. |
| `border-strong` | `#18181b` | `border-strong` | **Hover / focus / selected.** Chỉ dùng ở trạng thái tương tác, KHÔNG dùng ở trạng thái nghỉ. Dùng nó lúc nghỉ làm mọi control trông như đang được chạm tới. |

Vì sao tách: trước đây cả bốn vai trò dùng chung `#495059`, mắt không phân biệt
được đâu là khối, đâu là thứ bấm được, đâu là đang bấm.

**Trên nền giấy trắng, cả ba bậc viền đều là MÀU MỰC ở ba bậc đậm nhạt** — khác
nhau ở độ đậm, không ở sắc độ. Đó là đúng cách người vẽ tay làm: nét mực không
đổi màu, chỉ đổi bút nặng hay nhẹ. `subtle` là nét mảnh, `default` là nét
thường, `strong` là nét đậm.

**Vì sao `subtle` vẫn phải nhìn thấy được trên giấy trắng.** Trên nền tối, bậc dưới
cùng từng là `#1c222a` — chênh lệch **2–3/255 mỗi kênh** so với nền, tương phản
**1.03:1**, tức vô hình; có 61 chỗ `border border-subtle bg-raised` mà chẳng vẽ
được đường kẽ nào. Bài toán đó **không tự biến mất khi đổi sang nền sáng**: trên
giấy trắng, một viền quá nhạt lại chìm theo kiểu khác, vì nó hòa vào nền chứ
không phải vì thiếu độ tương phản. Nên `subtle` nay là `#dcdcd8`: nhạt, nhưng vẫn
là một nét mảnh nhìn thấy được trên `#f2f2ef`.

**Vì sao `default` lại là mực đậm (`#2a2a2e`) chứ không phải xám trung bình.**
Đây là khác biệt lớn nhất so với bảng cũ: trên nền tối, viền control cần **nổi
hơn nền**, nên nó là một bậc xám sáng. Trên giấy trắng, viền control cần **đậm
hơn nền** để đọc ra là nét vẽ — nên nó là mực. Một nét xám trung bình trên giấy
trắng trông như mép in, không phải như nét tay.

**Cạm bẫy `border` trần — bậc viền thứ tư ẩn.** Tailwind preflight đặt
`border-color: #e5e7eb` cho mọi phần tử, và class `border` **chỉ sinh
`border-width`** chứ không sinh `border-color`. Nên `border` mà không kèm
`border-<màu>` sẽ kế thừa viền gần-trắng đó — trên nền tối là 13.4:1, sáng
hơn cả `text-primary`. Lỗi này từng làm **~67 viền trắng** trong app (31/32
call site của `.settings-card`, 32/39 của `.btn-secondary`, 4/6 của
`.surface-panel`) mà **không assertion nào bắt được**, vì `#e5e7eb` do
Tailwind chèn lúc build nên không bao giờ xuất hiện trong source. Nay có hai
assertion chặn: một cho recipe trong `globals.css`, một cho JSX.

**Quy tắc chống trôi:** không dùng `border-strong` ở trạng thái nghỉ; không dùng
`border-subtle` làm viền ngoài của control; không tự chế bậc thứ tư bằng
`border-white/10`.

### 2.4 Nhấn & trạng thái — MỘT bảng màu cho toàn ứng dụng

(`app/globals.css:58-65`)

| Token | HEX | Class | Dùng cho |
|---|---|---|---|
| `accent` | `#2a7360` | `text-accent` / `bg-accent` | Nhấn chủ đạo: link, con trỏ, viền focus, hành động chính — **mint ĐẬM** |
| `accent-mint` | `#98d8c8` | `bg-accent-mint` | **MINT NHẠT** — nền nút chính, tag active, bubble người dùng |
| `accent-dim` | `#8fc7b8` | `bg-accent-dim` | Nhấn bị tắt, sọc trạng thái active |
| `on-fill` | `#ffffff` | `text-on-fill` | Chữ **trên** nền tô đậm (`accent`/`success`/`warning`/`danger`) |
| `success` | `#2a7347` | `text-success` | Thành công |
| `warning` | `#9a6206` | `text-warning` | Cảnh báo, mode PLAN |
| `danger` | `#b3261e` | `text-danger` | Lỗi, xoá, phủ định |
| `info` | `#0369a1` | `text-info` | Thông tin trung tính |
| `reasoning` | `#6d4aa8` | `text-reasoning` | Khối suy luận — **màu riêng, không dùng cho trạng thái** |

**Vì sao mint bị tách làm HAI token.** Đây là điểm dễ sai nhất của bảng màu
khi đổi sang nền sáng, nên nó được ghi ra bằng công việc chứ không phải bằng tên:

| | `accent` (mint đậm) | `accent-mint` (mint nhạt) |
|---|---|---|
| Dùng làm **chữ**? | ✅ link, con trỏ, viền focus | ❌ **không bao giờ** |
| Tương phản trên giấy `#f2f2ef` | **5.6:1** ✅ AA | **1.6:1** ❌ không đọc được |
| Dùng làm **nền**? | ✅ (nút bão hòa) | ✅ nút chính, tag, bubble |

Một màu không thể vừa là chữ vừa là nền trên cùng một nền giấy. Nếu chỉ có
`accent` mint nhạt thì mọi link và con trỏ trong app là vô hình; nếu chỉ có
`accent` mint đậm thì bubble và nút chính thành một khối xanh nặng nề, hết
chất nét vẽ tay.

Trước đây có **hai** bảng trạng thái cùng sống (`--success` và `--emerald-safe`,
`--warning` và `--amber-warn`, …). Xem §6.

### 2.5 Diff — ba trạng thái của một dòng thay đổi

(`app/globals.css:67-70`, áp dụng tại `app/globals.css:768-777`)

| Token | HEX | Class | Dùng cho |
|---|---|---|---|
| `diff-add` | `#1f7a3d` | `text-diff-add` | Dòng thêm |
| `diff-del` | `#b3261e` | `text-diff-del` | Dòng xoá |
| `diff-ctx` | `#6b6b73` | `text-diff-ctx` | Dòng giữ nguyên |

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

### 3.2 Quy tắc ba họ chữ

| Font | Class | Dùng cho |
|---|---|---|
| **Patrick Hand** | `.uic` | **Nét kẻ**: nhãn, nút, tiêu đề khối, wordmark, dải nhóm ngày ("HÔM NAY"), mọi chữ trong bong bóng truyện tranh. |
| **Inter** | `font-sans` | **Nội dung đọc dài**: prose của assistant (`.claude-prose`), mô tả. Đây là mặc định của app. |
| **JetBrains Mono** | `font-mono` | **Mọi thứ do máy sinh ra**: code, token, id, đường dẫn, hash, timestamp, số đếm, nhãn trường. |

`next/font` tạo `--font-hand` / `--font-sans` / `--font-mono`; vì vậy
`fontFamily` trong config **phải** map qua `var(--…)` — nếu không, class sẽ rơi
về font hệ thống và font đã tải kèm subset tiếng Việt không bao giờ được dùng.

**Vì sao Patrick Hand KHÔNG dùng cho prose.** Đây là quyết định quan trọng nhất
của mục này, nên nó được ghi bằng lý do chứ không phải bằng quy ước: chữ vẽ tay
đẹp ở **câu ngắn**, và mệt ở **đoạn dài**. Nội dung của assistant là thứ người
dùng đọc lâu nhất trong ứng dụng — đặt chữ khó đọc nhất lên đúng chỗ đó là đổi
ngược. Nên: nhãn/nút/tiêu đề đi `.uic`, prose đi Inter.

**Patrick Hand CHỈ có weight 400.** Xác minh trong `font-data.json` của
`next/font` (`weights: ["400"]`). Hệ quả trực tiếp: **phân cấp đậm/nhạt trong
UI không đến từ `font-bold`** — không có nét nào đậm hơn để dùng — mà đến từ
**CỠ CHỮ** và **độ đậm của nét mực**. `.uic` đặt `font-synthesis-weight: none`
để `font-semibold` rơi về 400 thay vì bị trình duyệt giả lập nét đậm. Đừng thêm
`font-bold` lên `.uic` và mong nó đậm hơn: nó sẽ không đậm hơn.

Nhãn trường (`.field-label`) là **chữ thường, mono, không giãn chữ** — không
bao giờ in hoa. Mô tả phụ dưới nhãn là `.field-hint`: 12px, `text-tertiary`.

---

## 4. Bo góc & khoảng cách

### 4.1 Bo góc — thang THẬT, chia theo vai trò

`tailwind.config.ts:196-204` là một thang bo góc thật, từ 6px lên 36px. Trước đây
thang bị **khoá**: `lg` / `xl` / `2xl` / `3xl` bị gỡ hẳn khỏi cấu hình nên gọi
`rounded-lg` **không sinh ra class nào** (thà không bo còn hơn bo sai), còn `sm` /
`md` chỉ 3–5px — mọi khối là hình chữ nhật viền 1px, giao diện đọc như bản vẽ kỹ
thuật chứ không phải sản phẩm dùng hằng ngày. Nay mỗi bậc là một **vai trò**, nên
gọi đúng tên là đúng hình dạng:

| Class | Giá trị | Vai trò — dùng cho |
|---|---|---|
| `rounded-none` | `0px` | **NGOẠI LỆ.** Chỉ khi thật sự cần một cạnh sắc. Không phải mặc định. |
| `rounded-sm` | `6px` | Chip nhỏ, badge, ô inline |
| `rounded` (DEFAULT) / `rounded-md` | `10px` | **Control**: menu item, chip |
| `rounded-lg` | `14px` | Nút icon (trên nền 28–32px nên gần như viên thuốc), ô tìm kiếm |
| `rounded-xl` | `20px` | Khối nội dung: panel, hộp thoại |
| `rounded-2xl` | `28px` | Khối lớn: khung modal, vỏ composer |
| `rounded-3xl` | `36px` | Dự phòng |
| **`rounded-ink`** | `255px 15px 225px 15px / 15px 225px 15px 255px` | **BẤT ĐỐI XỨNG đậm** — bong bóng truyện tranh, thẻ settings, panel. Đây là hình dạng mặc định của giao diện. |
| **`rounded-wobble`** | `18px 6px 16px 6px / 6px 16px 6px 18px` | **BẤT ĐỐI XỨNG nhẹ** — ô nhập, nút bấm, `.icon-btn` |
| `rounded-full` | `9999px` | **Hình tròn / viên thuốc**: chấm trạng thái, avatar, nút gửi, thanh tiến trình |

**Vì sao có hai bậc bất đối xứng.** Người vẽ tay không bao giờ kéo cung tròn đều
tứ phương — mỗi góc lệch một chút. Dạng `A B C D / E F G H` là tám bán kính theo
thứ tự góc của CSS, ở đây hai góc bo to xen kẽ hai góc bo nhỏ nên mép không bao
giờ đều. `ink` (mạnh) dành cho khối lớn đọc nét ngay từ xa; `wobble` (nhẹ) dành
cho control nhỏ, nơi bán kính to sẽ nuốt hết hình dạng. Thang bo đều
(`sm`…`3xl`) vẫn cần cho chip nhỏ và hình tròn.

**Luật của `rounded-full`:** đó là hình **tròn**, không phải "bo nhiều hơn". Đặt
nó lên một hình chữ nhật là sai *hình dạng*, không phải sai *độ bo*. Vì vậy
`.rounded-full` được ghim riêng trong `app/globals.css` — kể cả các class ghép
(`sm:rounded-full`, `hover:rounded-full`) — để chúng đều phải ra hình tròn.

**Vì sao `rounded-none` là ngoại lệ chứ không phải mặc định.** Cạnh sắc là thứ mắt
đọc là "cứng", và nó chỉ đúng ở đúng một loại ranh giới — ô khe, lưới kỹ thuật.
Trái lại, khi mọi khối cùng có một bán kính, tay vẽ hiện ra ngay: khối nhỏ bo
nhiều, khối lớn bo ít. Đó là lý do thang chia theo vai trò chứ không phải theo một
con số duy nhất.

Không viết `border-radius` thô trong component — cấu hình là nguồn duy nhất. Trong
chính `globals.css` có **8** chỗ khai thẳng, và cả 8 đều là ngoại lệ có lý do: ghim
`rounded-full` cho hình tròn (`:181`), hai thumb thanh cuộn (`:207,282`), sườn trái
của trích dẫn (`:562`), bảng trong prose (`:585`), inline code (`:626`), code block
cần góc vuông bên trong (`:639`) và vỏ code block (`:649`). Đổi số ở bất kỳ chỗ nào
trong số đó thì sửa luôn bảng ở trên, vì hai bên là cùng một quyết định.

### 4.2 Khoảng cách

Các mốc dùng giữa các **nhóm**: **4 / 8 / 12 / 16 / 24 / 32px** (Tailwind
`1 / 2 / 3 / 4 / 6 / 8`). Khoảng lẻ kiểu `2.5` / `3.5` chỉ dùng trong nội bộ
một control, không dùng để tách hai nhóm.

Quy ước: trong một nhóm (label ↔ input) `8px`; giữa hai trường cùng khối
`12–16px`; giữa hai khối `16px`; padding trong khối `16px`.

### 4.3 Bề rộng cột — một token cho mọi thứ bám cột hội thoại

`max-w-thread` = `48rem` là bề rộng **duy nhất** của cột hội thoại, và mọi
thứ bám cột đó — message list, composer, các dải thông báo, Agent HUD — đều
phải gọi **chính token này**.

**Composer từng vi phạm, và test từng bảo vệ cái vi phạm đó.** Ô nhập dùng
`max-w-4xl` (56rem) viết thẳng trong JSX trong khi cột hội thoại là 48rem, đo
được ở 1360px là **composer 896px vs thread 768px** — ô nhập lấn 64px ra ngoài
nội dung đang đọc mỗi bên. `tests/design-system.test.ts` lúc đó assert
`not.toMatch(/max-w-thread/)`, tức là **bảo vệ chính cái lệch đó**. Nay cả hai
gọi chung `thread`, và test kiểm bất biến thay vì kiểm một con số: composer
không được tự khai báo bề rộng riêng.

Đổi bề rộng cột = đổi **một số** trong `tailwind.config.ts` (`maxWidth.thread`).

### 4.4 Cột phụ (≥1400px)

Ở màn rộng, phần trống hai bên của cột hội thoại là 448px mỗi bên — đất để
trống. Từ 1400px, `PlanPanel` và `WorkspaceCheckpointBar` chuyển sang **cột
phụ bên phải** (`components/chat/session-rail.tsx`, rộng 320px).

- **Dưới ngưỡng: hành vi y hệt trước đây.** Hai khối nằm giữa cột hội thoại,
  ẩn đi bằng `rail:hidden` ở màn rộng chứ không bị thay đổi ở màn hẹp.
- **Rail không bao giờ bật trống** — nó hỏi chính `useUndoTarget` mà thanh undo
  đang dùng, nên "có gì để hiện" chỉ được quyết định ở một chỗ.
- **Mốc 1400px khai ở hai nơi phải khớp:** `screens.rail` trong
  `tailwind.config.ts` và `RAIL_QUERY` trong `lib/hooks/use-media-query.ts`
  (Tailwind không sinh class từ media query viết tay trong JSX). Con số này là
  phép trừ của 256 (sidebar) + 768 (thread) + 320 (rail) + gutter.

### 4.5 Doodle: đậm ở một chỗ, im lặng ở mọi nơi khác

Đây là quy tắc dễ phá nhất của phong cách nét vẽ, nên nó được ghi bằng **phân bổ**
chứ không phải bằng danh sách. Một ứng dụng công cụ dùng hằng ngày mà rải đều
sticker thì đọc như đồ chơi, và người dùng ngừng đọc nó.

| Mức | Ở đâu | Cụ thể |
|---|---|---|
| **ĐẬM** | Bong bóng tin nhắn, màn hình trống, trạng thái đang trả lời | Đuôi bong bóng, avatar chibi, nét mực, bóng lệch |
| **KÍN** | Mọi container và control | Viền mực 2px, bo bất đối xứng, bóng lệch 2px |
| **IM LẶNG** | Sidebar, settings, bảng, diff, code, form field | Không sticker, không đuôi, không avatar |

**Vì sao phân bổ này.** Ba chỗ "ĐẬM" đều là chỗ người dùng **dừng lại nhìn** —
tin nhắn vừa tới, màn hình trống lúc mới mở app, và lúc đang chờ model trả lời.
Chi tiết trang trí đặt ở đó không cạnh tranh với nhau, vì không có hai chỗ nào
cùng lúc đòi mắt. Đặt thêm sticker ở sidebar và settings thì chúng **có** mặt
cùng lúc, và mắt phải chọn — mà không có gì để chọn, vì chúng đều chỉ trang trí.

**Vì sao avatar chibi là SVG vẽ tay chứ không phải emoji.** Emoji render theo font
của hệ điều hành nên mỗi máy một sắc, còn ứng dụng này mọi đường viền đều là nét
mực — một emoji đầy màu phá vỡ đúng thứ đang giữ. Xem
`components/chat/chibi-avatar.tsx`.

**Đừng thêm mặt thứ ba.** Hệ thống là **một-nguồn** như bảng màu: mỗi vai trò một
token. Thêm mặt thứ ba là thêm một cách vẽ cho cùng một việc.

---

## 5. Chiều sâu — nét vẽ tay

### 5.1 Bài toán

Ứng dụng dùng bóng đổ và bo góc (§1, §4.1). Nhưng nếu mọi khối đều là hình chữ
nhật viền mỏng **cùng một màu**, thì container, control và đường phân cách có
**cùng trọng lượng thị giác** — mắt không có tầng bậc để bám vào, toàn bộ giao
diện thành một khối bùi nhùi.

Trên **nền tối**, bài toán này được giải bằng bóng mềm mờ dần theo khoảng cách.
Trên **giấy trắng** cách đó không dùng được: nền đã sáng hết, bóng mềm chỉ còn
là một vệt xám nhạt trên nền trắng — đọc ra là bẩn, không phải là nổi. Đó là lý do
cơ chế đã đổi hoàn toàn sang **nét lệch cứng**.

### 5.2 Lời giải: bóng lệch cứng — nét mực, không phải nét bóng

Bốn class dưới đây là **toàn bộ** hệ chiều sâu, và là nguồn DUY NHẤT được phép
khai báo `box-shadow` trong toàn bộ codebase:

| Class | CSS | Tailwind | Dùng cho |
|---|---|---|---|
| `.lift-sm` | `2px 2px 0 rgb(0 0 0 / 0.9)` | `shadow-lift-sm` | Control nhỏ: chip, nút icon, nút bấm |
| `.lift-md` | `3px 3px 0 rgb(0 0 0 / 0.9), 7px 7px 0 rgb(0 0 0 / 0.10)` | `shadow-lift-md` | Khối nội dung: thẻ settings, menu, bong bóng |
| `.lift-lg` | `4px 4px 0 rgb(0 0 0 / 0.9), 10px 10px 0 rgb(0 0 0 / 0.14)` | `shadow-lift-lg` | Lớp trên cùng: modal, popover, dropdown |
| `.well` | `inset 0 2px 5px rgb(24 24 27 / 0.10)` | *(không có key)* | Ô nhập **CHÌM**: composer, input trong sidebar/settings |

**Vì sao KHÔNG blur.** Bóng mềm đọc chiều sâu theo kiểu vật lý — cùng một cách
đúng về mặt quang học, nhưng không phải cách vẽ tay. Người vẽ tạo cảm giác nổi
bằng cách để vệt mực **lệch cứng** ra một bên, và nét đó tự nó đã đọc ra ngay
mà không cần blur. Trên nền tối trước đây buộc phải dùng bóng mềm vì cùng một
alpha trên `#0b0e13` gần như biến mất; trên giấy trắng nét lệch cứng tự nó đủ.

**Vì sao lớp thứ hai rất nhạt (`/0.10`, `/0.14`).** Khối lớn ở góc dễ bị cắt
khúc khi chỉ có một nét lệch; lớp thứ hai đẩy bóng ra xa thêm một chút, màu nhạt
đủ để nối mà không thành vệt bẩn. Lớp `0 … 0` được bỏ hẳn: nó không vẽ ra gì mà
chỉ làm con số "số lớp bóng" khó so trong test.

**Vì sao `.well` dùng `inset` còn ba bậc kia thì không.** Ô nhập phải đọc ra là
"chỗ khoét vào để gõ" — tức là **chìm** — nên bóng nằm bên trong viền. Trên giấy
trắng, "chìm" không còn là bóng đen nhạt (cách của nền tối) mà là một lớp phủ
giấy nhạt hơn nền, đủ để ô nhập thấp hơn mặt giấy mà vẫn là giấy.

`.well` **không** có key trong `theme.extend.boxShadow` — nó là class CSS thuần,
dùng qua `@apply` trong recipe (`.field`, `.field-sm`) và không cần utility.
`shadow-inner` của Tailwind vẫn là `'none'`: ô nhập chìm không đi qua đường đó.

### 5.3 Quy tắc dùng

- Khối **nổi nhẹ** (chip, nút icon, ô nhập viền mảnh) → `lift-sm`.
- Khối **nổi vừa** (panel, menu, thẻ settings, hộp thoại) → `lift-md`.
- **Lớp trên cùng** (modal, popover, dropdown) → `lift-lg`. Bậc này dành riêng
  cho thứ che nội dung; dùng nó cho một panel thường làm phẳng hệ phân tầng.
- Ô nhập → `.well`, không phải `lift-*`.
- **Nếu không phân biệt được khối nào nổi, khối đó đang thiếu bóng.**

Recipe đã áp dụng trong `app/globals.css`: `.surface-panel` (`:367`) và
`.settings-card` (`:439`) dùng `lift-md`; `.btn-primary` / `.btn-secondary`
(`:398,403`) dùng `lift-sm`; `.field` / `.field-sm` (`:383,388`) dùng `.well`.
Một component tự dựng khối bằng `className` thuần thì **tự thêm** `shadow-lift-*`.

### 5.4 Điểm thực thi duy nhất

Giá trị bóng tồn tại ở **hai** nơi và phải khớp byte:

1. `app/globals.css` — sinh class `.lift-sm` / `.lift-md` / `.lift-lg` /
   `.well`.
2. `tailwind.config.ts` — `boxShadow['lift-sm'|'lift-md'|'lift-lg']`, sinh
   class `shadow-lift-sm|md|lg` cho JSX.

Hai nơi tồn tại vì lớp recipe CSS dùng `@apply lift-md` (đọc class trong
`@layer components`) còn JSX không thể `@apply` nên cần utility. Sửa một bên thì
phải sửa cả bên kia. Và vì chúng phải khớp **byte** chứ không "gần giống", thứ tự
layer cũng là thông tin: `3px 3px 0 …` phải đứng trước `7px 7px 0 …`.
`.well` chỉ tồn tại ở nơi thứ nhất, nên nó không có bản sao nào để lệch.

**Cùng cơ chế, hướng ngược lại:** nút bấm được (`.btn-primary`, `.btn-secondary`)
ấn vệt mực xuống bằng `active:translate-x-[2px] active:translate-y-[2px]
active:shadow-none` — dịch đúng bằng bóng. Đó là cùng một hệ, chỉ ở chiều ngược
lại, nên nó không cần thêm một class chiều sâu nào.

### 5.5 Đã gỡ khỏi `app/globals.css` — và vì sao

Bảng này tồn tại để người sau không thấy một mảnh trong `git log` rồi tưởng mình
đang viết lại thứ đáng giữ. **Tất cả những thứ dưới đây đã bị xoá**, và mỗi cái
đều có lý do: chúng là chiều sâu **trang trí** chồng lên chiều sâu **thật**, hoặc
là dấu vết của một hợp đồng bo góc cũ.

| Đã gỡ | Nó là gì | Vì sao gỡ |
|---|---|---|
| `body::before` | Hai lớp `repeating-linear-gradient` 24px (alpha 2.5%) gợi giấy kẻ ô, chạy dưới **mọi** màn hình | Không mang thông tin, chỉ thêm nhiễu thị giác — và làm các cạnh trông cứng hơn. Nền giờ chỉ cần một màu phẳng; chiều sâu do `.lift-*` đảm nhiệm. Dấu vết còn lại: `app/globals.css:135-141`. |
| `.bevel-out` / `.bevel-in` | Viền hai tông, 4 lớp `inset` kiểu Minecraft / Windows 95 — cơ chế nổi/chìm cũ | Đọc "cứng" và tương phản cục bộ: mọi khối thành ô khoét vào màn hình. Bóng ngoài vùng mờ dần đọc ra chiều sâu ở mọi kích thước mà vẫn mềm. Thay bằng `.lift-sm/md/lg` + `.well`. |
| `.vyen-frame` / `.pi-frame` + 8 ngoặc góc `.vyen-corner-*` | Khung góc kiểu HUD vẽ thêm 1–3 đường quanh khối **đã có viền** | Mắt phải đọc hai lớp đường cho cùng một ranh giới. Sau khi `.lift-*` đảm nhiệm chiều sâu, chúng thành nhiễu thuần. Dấu vết còn lại: `app/globals.css:289-301`. Còn **1 chỗ gọi sót** — xem §9.7. |
| `.pi-active-indicator` / `.vyen-active-indicator` | Vạch 3px gradient báo trạng thái chọn | Trạng thái chọn giờ do nền + bo tròn + chữ đậm báo, không cần vạch bên. Dùng 2 nguồn cho cùng một trạng thái là chính cái loại trôi §6 nói về. |
| Các key `boxShadow` `sm` / `md` / `lg` / `xl` / `2xl` bị khoá `'none'` | Người giữ chỗ cho bóng mềm, từng là cách lách để thêm bóng ngoài ý muốn | Nay **không còn key này trong config**. Thay bằng ba key có tên theo vai trò: `lift-sm` / `lift-md` / `lift-lg`. `none`, `DEFAULT` và `inner` vẫn là `'none'`. |

Cùng đợt đó, thang bo góc cũng đổi từ "khoá về vuông" sang thang thật 6→36px —
xem §4.1 — và khối override `[class*="rounded-lg"] { !important }` đã bị xoá.

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
`components/` + `app/`, tại thời điểm viết tài liệu này — **188 lượt dùng** trên
16 alias còn sống; 13 alias dưới đây đã rỗng và chỉ còn chờ xoá key:

| Alias cũ | → Token mới | Còn | Việc cần làm |
|---|---|---|---|
| `text-text-muted` | `text-secondary` | 54 | Đổi tên class — **lớn nhất còn lại** |
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
| `shadow-reasoning-glow` | `shadow-lift-sm` | 0 | ✅ **Đã rỗng** — lượt gọi cuối ở `stream-bubble.tsx` đã đổi. **Xoá key ngay** (`tailwind.config.ts:80`, key đang là `'none'`) |
| `bg-bg-deep` | `bg-sunken` | 1 | Đổi tên class |
| `text-rose-danger` | `text-danger` | 1 | Đổi tên class |
| `text-violet-reasoning` | `text-reasoning` | 0 | ✅ **Đã rỗng** — lượt gọi cuối ở `stream-bubble.tsx:35` đã đổi. **Xoá key ngay** (`tailwind.config.ts:65`) |
| `border-border-subtle` | `border-subtle` | 0 | **Xoá key ngay** — 185 → 0, alias viền lớn nhất đã rỗng hoàn toàn |
| `border-border-hairline` | `border-subtle` | 0 | ✅ **Đã xoá** key + biến `--border-hairline` (§9.8) |
| `text-emerald-safe` | `text-success` | 0 | **Xoá key ngay** |
| `bg-surface-elevated` | `bg-overlay` | 0 | **Xoá key ngay** |
| `shadow-ambient-glow` | `shadow-lift-md` | 0 | **Xoá key ngay** — key đang là `'none'` |
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

## 7. Light-only, không có nhánh tối

Ứng dụng **cố ý** chỉ có một theme: giấy trắng.

- `app/globals.css` — một khối `:root` duy nhất, `color-scheme: light`.
- Khối `.dark` còn lại là **no-op**, và nó khai `color-scheme: light` chứ không
  phải `dark`: chỉ cần một class `dark` rơi sót là toàn bộ form control của
  trình duyệt đổi sang bảng màu tối — lỗi chỉ xuất hiện đúng lúc đã hỏng.
- `className="dark"` đã bị gỡ khỏi `<html>` ở cả ba nơi từng gắn nó:
  `app/layout.tsx`, `app/page.tsx` (effect ghim cứng), `app/global-error.tsx`.
- `viewport.colorScheme` = `'light'`, `themeColor` = `#f2f2ef`.
- `app/manifest.ts` — `background_color` / `theme_color` = `#f2f2ef`, khớp với
  `viewport.themeColor`, để splash khi cài PWA không nháy lệch màu.
- Script chống FOUC đã bị gỡ: theme không đổi theo hệ điều hành nên **không có
  gì để nhấp nháy** — trước first-paint nền đã là giấy trắng, tức cùng màu với màn
  trắng của trình duyệt. Cổng chặn FOUC chỉ có ý nghĩa với theme động.

**Vì sao vẫn là "một theme" chứ không phải "thêm nhánh sáng".** Trước đây ứng dụng
cũng một theme, nhưng là theme **tối**. Đổi hướng không phải thêm nhánh — nhánh
sáng giả là thứ tệ nhất: nó đổi tên, đổi icon, đổi nhãn nhưng không đổi màu gì cả,
và người dùng có một kỳ vọng sai để vi phạm. Nay vẫn đúng một bảng màu, nhưng nó
là bảng của hướng đã chọn.

**Đổi từ tối sang sáng không phải đảo ngược bảng màu — phải chọn lại.** Ba thứ phải
làm lại từ đầu, và cả ba đều đã làm:

1. **Chiều sâu.** Không đảo được. Bóng mềm trên nền tối phải dùng alpha tăng dần
   mới đọc ra; nét lệch cứng trên giấy trắng tự nó đã đọc. Xem §5.
2. **Mint bị tách làm hai token.** Cùng một màu không thể vừa là chữ (5.6:1) vừa
   là nền (1.6:1) trên cùng một nền giấy. Xem §2.4.
3. **Nền tô đậm cần chữ trắng**, không phải mực. Vai trò này trước đây do
   `text-sunken` đảm nhiệm; nay là token riêng `on-fill`. Xem §2.2.

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

### 9.1 Alias tạm vẫn còn (188 lượt dùng, 16 alias)

Toàn bộ bảng ở §6.1. Đợt migrate vừa rồi đã đưa con số này từ ~1.100 xuống còn
**188 lượt trên 16 alias**; 13 alias còn lại trong bảng đã rỗng hoàn toàn — trong
đó `border-border-subtle` từng là alias lớn nhất (185 lượt) và giờ là 0. Đây vẫn
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

**Đây KHÔNG phải đề nghị thêm chúng vào bảng §2.** §2 là bảng token, và
`tailwind.config.ts` khai đúng những giá trị đó — test `bảng màu trong test khớp
tailwind.config.ts theo cả hai chiều` kiểm hai chiều, nên thêm một hex cũ vào §2
sẽ làm hỏng chính hợp đồng đó. Bảng này ghi lại **drift đã được gỡ**: mỗi dòng là
một class token đáng lẽ phải thay cho hex thô ở đúng chỗ đó.

Cột "Ở bao nhiêu file" là số file trong danh sách hợp đồng, **không** phải toàn
bộ `components/` + `app/`. Các số này giảm mỗi khi có đợt migrate; muốn số mới
thì đếm lại, đừng đoán.

**Số lượng token: 24 key, 19 giá trị phân biệt.** Bảng sáng cố ý dùng lại một
màu cho nhiều vai trò — `#ffffff` cho `surface`/`overlay`/`on-fill`, `#18181b` cho
`primary`/`strong`. Test đếm **giá trị** sau khi khử trùng, nên con số 19 ấy là
đúng chứ không phải thiếu sót.

Một hex thô **ngoài** danh sách hợp đồng: `app/manifest.ts` khai `#f2f2ef` cho
`background_color` / `theme_color`. Nó thuộc bảng §2 (`bg-sunken`) và phải trùng
`viewport.themeColor` — đây là màu splash PWA, lệch một bậc là thấy vệt nháy lúc
cài app. Xem §7.

**Lỗ hổng của chính assertion trên đã được bịt:** nó chỉ soi component, nên token màu
khai trong chính `app/globals.css` không bao giờ đi qua — và dạng channel RGB thì
regex `#hex` cũng không thấy. Nay có assertion riêng quét thẳng file đó. Xem §9.8.

Hai hex `#f2f2ef` / `#18181b` trong `app/global-error.tsx` (style inline) là **cố ý
hardcode** — chúng phải có màu trước first-paint, lúc stylesheet chưa kịp về, và
cùng bộ đó **thuộc** bảng §2 nên không nằm trong bảng drift ở trên.

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
3 lần, đều là tiêu đề chữ-vẽ-tay (`staging-panel.tsx`, `vyen-logo.tsx`,
`workspace-checkpoints.tsx`) — gần `head` (20px) hơn là bậc nào.

Còn `text-xs` (Tailwind mặc định 12px, 39 chỗ) và `text-sm` (14px, 9 chỗ) cũng đang
dùng; config giữ nguyên giá trị mặc định của chúng (`tailwind.config.ts:255-257`)
vì đổi số ở đó là đổi diện mạo toàn ứng dụng trong một lần, còn mỗi lần đổi tên
class thì an toàn.

### 9.4 Thang bo góc đã sống — số đếm giờ đo bán kính đang dùng thật

Trước đây `lg` / `xl` / `2xl` bị gỡ khỏi cấu hình, nên mọi `rounded-lg` trong code là
class **không sinh ra gì**; bảng này từng chỉ để truy ra 2 class rác sót lại. Nay
chúng là bậc thật (§4.1), nên số đếm dưới đây là số chỗ **đang bo** — đếm trên
`components/` + `app/` (`.tsx` / `.ts`), không tính comment:

| Class | Lượt | Bậc |
|---|---|---|
| `rounded-lg` | 116 | 14px — nút icon, ô nhập nhỏ, menu item |
| `rounded-md` | 16 | 10px — control |
| `rounded-xl` | 17 | 20px — panel, hộp thoại |
| `rounded-2xl` | 10 | 28px — bubble, khung modal, vỏ composer |
| `rounded-3xl` | 0 | 36px — dự phòng, chưa dùng |
| `rounded-sm` | 0 | 6px — chip nhỏ: chưa dùng, `lg` đang gánh thay |
| `rounded-none` | 0 | 0px — ngoại lệ, chưa dùng lần nào |

Hai dòng 0 ở cuối là kết quả cần nhìn: `rounded-none` đã rời khỏi vai trò mặc định
**thật sự**, không chỉ trên giấy. Còn `rounded-sm` (6px) thì đang bị `rounded-lg` (14px)
cạnh tranh — 116 lượt `lg` với 0 lượt `sm` nghĩa là chip nhỏ cũng đang bo 14px. Đó
là chỗ lệch vai trò duy nhất còn lại trong thang bo góc.

Khối override `[class*="rounded-lg"] { !important }` từng đè lên cấu hình, khiến cấu
hình 0px chưa bao giờ có tác dụng; khối đó đã bị xoá (`app/globals.css:168-182`
nay chỉ ghim `rounded-full`).

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
- **Chiều sâu nay đi qua 4 class, không phải 2.** `.lift-sm` / `.lift-md` /
  `.lift-lg` / `.well` được gọi thẳng ở **19 file** của `components/` + `app/`
  (đếm `.tsx` / `.ts`, không tính comment): 21 lượt `lift-sm` (9 file), 8 lượt
  `lift-md` (8 file), 8 lượt `lift-lg` (8 file), 2 lượt `well` (2 file). Nhiều
  khối ghi **cả hai** dạng — class CSS cho lớp recipe và `shadow-lift-*` cho cùng
  một khối — ví dụ `components/composer.tsx:903`, `app/error.tsx:18`. Phần còn lại
  đi qua recipe trong `app/globals.css` (`.surface-panel:367`, `.settings-card:439`,
  `.btn-primary:398`, `.btn-secondary:403`; `.field:383` / `.field-sm:388` dùng
  `.well`). Nếu một component tự dựng khối nổi bằng `className` thuần mà không
  dùng recipe, nó phải tự thêm `shadow-lift-*`.
- **Khung góc còn sót: đã xoá xong.** Cả 8 `<span className="pi-corner-*">` rỗng ở
  `components/workspace-checkpoints.tsx` và `components/mcp/tool-approval-dialog.tsx`
  đã bị gỡ, cùng `pi-frame` trên khung panel. Chuỗi `.vyen-frame` / `.pi-frame` +
  8 ngoặc góc đã bị xoá khỏi `app/globals.css` từ trước nên chúng vốn đã không
  sinh CSS nào — chỉ là markup rỗng. Giờ có assertion chặn tái phát.
- **`shadow-reasoning-glow` là no-op: đã xoá xong.** `tailwind.config.ts:80` đặt
  `'reasoning-glow': 'none'`; lượt gọi duy nhất ở `components/chat/stream-bubble.tsx`
  đã đổi thành `shadow-lift-sm`.
- **Khối suy luận trong `stream-bubble.tsx` — đã sửa.** Nó dùng `bg-reasoning`
  **đặc** (`#a78bd4`) làm nền, rồi bên trong vẫn đặt token chữ của app:
  `text-primary` chỉ còn 2.39:1 (fail WCAG AA) và icon `text-reasoning` trên
  chính nền đó là 1.00:1 — vô hình. Nay dùng `bg-reasoning/10` + chữ
  `text-primary`/`text-secondary`, khớp với `chat/message-item.tsx:28`. Sửa
  được 14.15:1 và 5.92:1. `reasoning` là token **chữ**, không phải token nền —
  xem §2.4.
- **Hợp đồng đã được viết lại theo hướng nét vẽ tay.** Assertion cũ kiểm viền
  hai tông, bo góc vuông và `rounded-none` bắt buộc đều đã bị thay bằng assertion
  của hợp đồng mới: bảng màu sáng, ba bậc bóng lệch cứng, hai bậc bo bất đối
  xứng phải **thật** bất đối xứng (không phải bo đều). Xem §10.1.
- **Không có `dark:` variant nào** trong codebase (0 lượt) — đúng theo §7.
- **Icon vẫn là lucide, `strokeWidth` vẫn 2px mặc định.** Ở phong cách nét vẽ,
  nét mảnh hơn sẽ đọc ra "vẽ tay" hơn, nhưng đổi nó là sửa ~220 call site và
  làm icon mất nét ở kích thước 11–13px. Chưa làm; xem §9.7.

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
| `boxShadow` chỉ có `lift-sm` / `lift-md` / `lift-lg` là key **không-`'none'`**; `none` / `DEFAULT` / `inner` phải là `'none'` | Bóng thứ tư lọt vào qua `theme.extend.boxShadow` |
| Đúng **4** khai báo `box-shadow` trong `app/globals.css`, và chúng là `.lift-sm` / `.lift-md` / `.lift-lg` / `.well` | Dán tay `box-shadow` ở một class riêng — bám ngoài bốn nguồn |
| `borderRadius` định nghĩa đúng 11 bậc, thang px tăng dần, và `ink`/`wobble` phải **thật** bất đối xứng (có ít nhất một góc bo lớn xen kẽ góc bo nhỏ) | Đổi lệch quy tắc bo góc, gọi `rounded-lg` mà **không sinh ra class nào**, hoặc dán lại bo đều làm mất nét vẽ tay |
| Giá trị `.lift-*` trong `globals.css` khớp **byte** với `boxShadow` trong `tailwind.config.ts` (kể cả thứ tự layer) | Bóng bị nhân bản / viết tay / lệch giữa hai nguồn |
| Recipe `@apply` **một class `lift-*` hoặc `well`**, không có khối `rgba()` viết tay; `.lift-*` không được dùng `inset` | Quay lại tay dán bóng, hoặc biến khối nổi thành khối chìm |
| Hex thô chỉ được dùng hex trong bảng màu §2 (bỏ qua comment) | Hex mới chui vào không ai duyệt |
| Không Tailwind palette (`text-red-400`, `bg-zinc-800`, …) | Lọt họ màu mặc định |
| Không `text-white` / `color: #fff` | Chữ trắng tinh thay cho `text-primary` |
| Không modifier opacity trên token chữ | `text-text-muted/40` |
| File trong danh sách phải dùng ít nhất một class token | File bị bỏ sót ngoài hệ thống |
| Không `#55779b` (fail WCAG AA) | Màu chữ không đạt tương phản |
| Không còn khối override `[class*="rounded-lg"]`; `.rounded-full` vẫn được ghim | Bo góc bị một khối CSS khác đè, hoặc hình tròn bị bo nhiều hơn |
| Mọi `<button>` trong `sidebar.tsx` / `backup-reminder.tsx` dùng bán kính theo vai trò, **không** phải `rounded-none` | Bo góc lọt vào control chính, hoặc quay lại cạnh sắc |
| Composer dùng chung token `thread`, không tự khai `max-w-4xl` | Ô nhập lấn 64px ra ngoài cột hội thoại (lỗi đo được @1360px) |
| Mốc `rail:` khai đủ `screens.rail` + `maxWidth.rail` | Bật breakpoint mà token chưa có, hoặc lệch số với `RAIL_QUERY` |
| Vùng chạm trigger 44px | Vùng chạm co lại dưới WCAG 2.5.5 |

Bảng này liệt kê **bất biến**, không liệt kê tên hàm test — và đợt migrate đổi hợp
đồng bo góc / bóng vừa để lại vài assertion cũ trong `tests/design-system.test.ts`.
Xem §9.7.

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
  so. Tên màu nhắc trong comment ("hairline #495059", "sửa `.lift-sm`…") là
  tài liệu, không phải màu được vẽ ra — và tài liệu gọi tên màu cũ là điều ĐÚNG.
  Nếu thấy một assertion đỏ vì comment, hãy sửa assertion theo mẫu này, đừng
  xoá comment.

Một tài liệu design system mà chỉ test được một nửa vẫn tốt hơn không tài liệu —
miễn là phần không test được được viết ra thành quy tắc rõ ràng, đúng như §10.2
này.
