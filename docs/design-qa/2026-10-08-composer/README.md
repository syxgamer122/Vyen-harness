# Ảnh nghiệm thu — đợt P1-E, hàng chân composer (2026-10-08)

Phạm vi: hàng phụ ở chân composer (§14.4), phép trao padding khi focus (§14.4 +
§15.4 điểm 15), chip phạm vi dự án (§15.4 điểm 15). Đây là bằng chứng UI cho phần
đã làm, không phải bằng chứng cho toàn bộ §15.

## Ảnh

| Tệp | Bề rộng | Trạng thái |
| --- | --- | --- |
| `375-composer-rest.png` | 375 | nghỉ (chưa focus) |
| `768-composer-rest.png` | 768 | nghỉ |
| `1024-composer-rest.png` | 1024 | nghỉ |
| `1440-composer-rest.png` | 1440 | nghỉ |
| `1440-composer-focus.png` | 1440 | đang focus ô nhập (vùng nhập lớn lên) |
| `1440-composer-scope-connected.png` | 1440 | đã nối thư mục giả `vyen-qa` — chip đổi nhãn |
| `1440-composer-zoom200.png` | 1440 @ zoom 200% | kiểm tràn ngang khi phóng to (§14.9) |
| `measurements.json` | — | dữ liệu thô đọc từ DOM của cả bốn bề rộng + zoom |

## Phương pháp

Playwright (chromium headless) trỏ `http://localhost:3000`, KHÔNG seed dữ liệu:
vùng cần đo là vỏ composer, không phải nội dung hội thoại. Mỗi bề rộng đo hai lần
(nghỉ → focus vào `textarea`), rồi đo thêm lần ba sau khi bấm mở panel model.

Trạng thái "đã nối thư mục" được tạo bằng cách chặn `window.showDirectoryPicker`
trả về một handle giả `{kind:'directory', name:'vyen-qa'}` rồi **bấm thật** vào
chip phạm vi — tức đường web thật của `pickWorkspaceRoot()` (`lib/fs-access.ts`),
không phải gán state bằng tay.

## Số đo (đọc từ DOM, 0 lỗi console ở mọi lần đo)

| Bề rộng | Chiều cao vỏ (nghỉ → focus) | Hàng nhập (nghỉ → focus) | Hàng chân (nghỉ → focus) | Padding hàng nhập | Padding hàng chân | Tràn ngang |
| --- | --- | --- | --- | --- | --- | --- |
| 375 | 170 → **170** | 64 → 72 | 52 → 44 | 12/0 → 14/6 | 6/14 → 6/6 | 0px |
| 768 | 170 → **170** | 64 → 72 | 52 → 44 | 12/0 → 14/6 | 6/14 → 6/6 | 0px |
| 1024 | 144 → **144** | 38 → 46 | 52 → 44 | 12/0 → 14/6 | 6/14 → 6/6 | 0px |
| 1440 | 144 → **144** | 38 → 46 | 52 → 44 | 12/0 → 14/6 | 6/14 → 6/6 | 0px |
| 1440 @ zoom 200% | 340 | — | — | — | — | 0px |

Đọc bảng này: **vỏ không đổi một pixel** khi focus (170/170, 144/144) — đó là điều
§15.4 điểm 15 đòi ("focus không làm cả hội thoại dịch chuyển") — trong khi vùng
nhập lớn lên đúng 8px và hàng chân trả lại đúng 8px ở **đáy**. Hai hàng chạy cùng
`transition-[padding] duration-150`, nên tổng bằng nhau ở mọi khoảnh khắc của
chuyển động chứ không chỉ lúc kết thúc.

## Cỡ chữ ở hàng chân (đo computed style)

| Phần tử | Cỡ | Ghi chú |
| --- | --- | --- |
| `textarea` (ô nhập) | 16px | mốc so sánh — `text-read` |
| Ô chọn model | 14px | `text-ui`, nằm trong hàng chân ở cả bốn bề rộng |
| Chip phạm vi | 14px | `text-ui`, hộp 130 / 146 / 146 / 146px × 32px |
| Nhãn chế độ phê duyệt (pill, từ `lg`) | 14px | `text-ui` (trước là `meta` 12px) |

## Vùng chạm và bấm được (không chỉ đọc source)

`document.elementFromPoint` tại tâm từng control, ở 320 / 375 / 768 / 1024 / 1432 /
1440px — cả bốn control hàng chân (`model`, `phạm vi`, `đính kèm`, `gửi`) đều
`hitSelf = true` ở **mọi** bề rộng, tức không control nào bị control khác chồng lên.

Vùng chạm dọc của chip phạm vi: đo tại điểm cách tâm 20px → trúng chính nó, cách
26px → trượt (ngoài vùng), nên vùng chạm là 44px như ba control còn lại
(`min-h-8` = 32px + `after:-inset-y-[6px]`), và KHÔNG nới ngang nên không đè lên ô
chọn model hay nút đính kèm.

Panel model mở từ hàng chân (đáy màn hình) vẫn nằm trọn trong khung nhìn ở cả bốn
bề rộng: `top` 190 / 217 / 217 / 235, `bottom` 765 / 806 / 806 / 824 — `placement:
auto` lật panel lên trên.

## Chip phạm vi: hai trạng thái phải khác nhau

| Lúc | Nhãn đọc được | `title` |
| --- | --- | --- |
| Chưa nối | `chưa có thư mục` | `Chưa chọn phạm vi dự án: agent chỉ thấy nội dung bạn gõ. Bấm để chọn thư mục làm việc` |
| Sau khi bấm (đã nối) | `vyen-qa` | `Phạm vi dự án đang chọn: vyen-qa. Bấm để đổi thư mục làm việc` |

Trước đợt này chỗ đó là một nút ICON thư mục, nên hai trạng thái trên trông giống
hệt nhau cho tới khi người dùng mở menu ra đọc — đúng lỗi §15.4 điểm 15 nêu.

## Lỗi thật tìm được trong lúc đo (đã sửa trong cùng đợt)

Ở 768px, pill chế độ phê duyệt (nhãn dài 266px, lúc đó hiện từ `md`) ép cụm trái
còn 76px; ô chọn model co xuống **26px** rồi tràn sang chip phạm vi (chồng 14px),
và `elementFromPoint` tại tâm nó trúng chip — control mất khả năng bấm. Sửa:
pill hiện từ `lg` (trên `md` sidebar đã chiếm 288px nên cột chỉ còn 414px), và ô
chọn model không tham gia co (`flex-none`, nhãn đã tự cắt theo `max-w-[30vw]`).
Sau khi sửa: 99px ở mọi bề rộng, không chồng.

## Chưa chụp / chưa kiểm

- **Người soi ảnh bằng mắt** (§12): ảnh do máy đo; phần đánh giá thẩm mỹ vẫn cần mắt người.
- **Hộp thoại duyệt diff / approval** (§14.9) vẫn chưa có ảnh — trạng thái đó đến
  từ runtime, không seed được, và không có khoá LLM thì không sinh được lượt thật.
- **Ảnh diff giữa hai lần chụp** (pixel) không có: đợt này so bằng số đo DOM, không so ảnh.
- **`@đường/dẫn` và "đường dẫn không hợp lệ"** (§15.4 điểm 15) chưa có gì để chụp:
  composer chưa có cơ chế gắn đường dẫn dạng `@…`; việc đó vẫn nằm trong nhóm P2.
