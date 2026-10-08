# Ảnh nghiệm thu — đợt LƯỢT (2026-10-07)

Phạm vi: dữ liệu LƯỢT + turn header + gập thân lượt + nhóm phase của thẻ tool
(DESIGN.md §14.2, §14.3, §15.1, §15.2, §15.5; PLAN.md mục "ĐỢT P1-B", "ĐỢT P1-C",
"ĐỢT P1-D"). Đây là bằng chứng UI cho phần đã làm, không phải bằng chứng cho toàn bộ
§15.

## Ảnh

| Tệp | Bề rộng | Ghi chú |
| --- | --- | --- |
| `375-chat-turns.png` | 375 | mobile |
| `1024-chat-turns.png` | 1024 | màn hình hẹp |
| `1440-chat-turns.png` | 1440 | desktop |
| `1440-chat-turns-zoom200.png` | 1440 @ zoom 200% | kiểm tràn ngang khi phóng to (§14.9) |
| `1440-chat-turns-folded.png` | 1440 | lượt 1 đã GẬP (đợt P1-C) — thân lượt biến mất, header còn |
| `1440-chat-tools-phases.png` | 1440 | thẻ tool có ĐOẠN PHASE (đợt P1-D) — `Khảo sát → Thực hiện → Kiểm chứng (1 lỗi) → Thực hiện → Kiểm chứng` |
| `1440-chat-tools-card-open.png` | 1440 | một chip đã mở — có dòng phạm vi `dự án` |

## Phương pháp

App local-first, không cần khoá LLM (`freebuff-env list` rỗng), nên dữ liệu được
**seed thẳng vào IndexedDB** `ai_chat_app_db` bằng Playwright (chromium headless),
rồi để UI tự đọc và vẽ: 6 row / 3 lượt.

- Lượt 1 (`T1`) — đã xong, 3 thao tác, 1 file: `fs_read` + `fs_edit` + `shell_run`
  đều `state: 'result'`.
- Lượt 2 (`T2`) — lỗi: row trợ lý `status: 'error'`, `finishReason: 'error'`.
- Lượt 3 (`T3`) — chờ quyết định: row trợ lý `status: 'streaming'`, tool
  `shell_run` còn `state: 'call'`.

DB do chính app tạo (mở app trước rồi mới ghi row); script **không** tự khai
schema — tự tạo tay thì thiếu store/index và Dexie ném lỗi ở truy vấn đầu tiên.
Mở DB **không** truyền version: Dexie lưu version nội bộ bằng số khai báo × 10
(v19 → 190), truyền 19 là `VersionError`.

Seed lại **trước mỗi viewport**: ngay sau khi nạp, app ghi lại row đang
`streaming` (coi là lượt bị ngắt), nên ảnh sau sẽ đọc dữ liệu đã bị app sửa —
đúng cái đã làm ba ảnh lệch nhau trong lần chụp đầu.

## Số đo (đọc từ DOM sau mỗi lần nạp)

- 3 turn header render đủ ở cả bốn cấu hình.
- Trạng thái đọc ra: `completed` — `failed` — `waiting_approval`.
- Tên việc là **chữ thật của người dùng**, không rơi về chuỗi dự phòng:
  - `Sửa lỗi đăng nhập ở lib/auth.ts, xong chạy test giúp tôi · xong · 19:06 · 3 thao tác · 1 file`
  - `Chạy build xem còn lỗi gì không · lỗi · 19:07 · 1 thao tác`
  - `Deploy lên staging đi · chờ bạn quyết định · 19:08 · 1 thao tác`
- `scrollWidth === clientWidth` ở cả bốn cấu hình (375 / 1024 / 1440 / 1440 zoom
  200%) — **0px tràn ngang**.
- **0 lỗi console**, 0 `pageerror`.

## Nút gập thân lượt (đợt P1-C)

Đo bằng cách bấm thật vào nút trong trình duyệt, không chỉ đọc source:

| Lúc | Kết quả đo |
| --- | --- |
| Trước khi gập | 3 header; nút gập chỉ có ở lượt 1 (xong) và lượt 2 (lỗi) — `headersWithFold: [true, true, false]`, lượt đang chờ quyền KHÔNG có nút |
| Sau khi bấm nút lượt 1 | `aria-expanded=false`, `data-turn-collapsed=true`, dòng phụ thêm `đã gập`, thân lượt 1 mất (`a1Visible=false`) trong khi thân lượt đang chạy vẫn hiện |
| Bấm lần nữa (mở lại) | `aria-expanded=true`, thân lượt 1 trở về (`a1Visible=true`) |

0px tràn ngang, 0 lỗi console trong cả ba lần đo.

## Nhóm phase + vạch trạng thái của thẻ tool (đợt P1-D)

Seed một lượt có chuỗi `đọc → sửa → test LỖI → sửa → test` (annotation không mang
`at`, nên đi qua nhánh danh sách phẳng). Đo từ DOM sau khi nạp:

| Thứ tự đoạn | Nhãn hiện ra | `data-tool-phase` |
| --- | --- | --- |
| 1 | `Khảo sát · 1 thao tác` | `plan` |
| 2 | `Thực hiện · 1 thao tác` | `implement` |
| 3 | `Kiểm chứng · 1 thao tác · 1 lỗi` | `review` |
| 4 | `Thực hiện · 1 thao tác` | `implement` |
| 5 | `Kiểm chứng · 1 thao tác` | `review` |

Đoạn 3 là bằng chứng cho §15.2 điểm 8: lần chạy test ĐẦU hỏng, nên vòng
`sửa → test lỗi → sửa` hiện thành hai đoạn `Thực hiện` quanh một đoạn `Kiểm chứng`.

Nhãn truy cập được của từng chip cũng đọc ra trạng thái bằng CHỮ, không chỉ màu:
`đọc file, lib/auth.ts, xong` · `chạy shell, npm test -- auth, lỗi` · `chạy shell,
npm test -- auth, xong`.

Mở chip đầu tiên: dòng phạm vi hiện `dự án` (`toolScopeOf` đọc khoá `command` của
`shell_run`) — 0px tràn ngang, 0 lỗi console trong cả hai lần đo.

## Phát hiện kèm theo (chưa sửa — việc riêng)

Tải lại trang làm lượt đang chờ quyền biến thành "xong": `sanitizeToolInvocations`
(lib/db.ts) **cố ý** bỏ mọi invocation chưa có kết quả (`state !== 'result'`) vì
không tái tạo được part hợp lệ; khi app ghi lại row đang `streaming` sau khi nạp,
tool đang chờ biến mất và `turnStatusOf` chỉ còn thấy row trợ lý đã "complete".

Đo được bằng cách dump lại store `messages` sau khi nạp:

```
a3: status 'streaming', tools 1  →  sau khi nạp: status 'complete', tools 0
```

Hệ quả: §15.5 nói lượt đang chờ quyền khác "xong", nhưng sau khi tải lại thì
header nói "xong" trong khi người dùng chưa hề quyết định. Cần một dấu vết lưu
trữ cho "lượt bị ngắt giữa chừng" — việc của đợt sau, không nằm trong đợt P1-B.

## Chưa chụp

- **Hộp thoại duyệt diff / approval** (§14.9 đòi): trạng thái này đến từ runtime
  (yêu cầu phê duyệt đang mở), không nằm trong IndexedDB nên không seed được, và
  không có khoá LLM thì không sinh được lượt thật. Ảnh `waiting_approval` ở trên
  chỉ chứng minh **header** đọc đúng trạng thái chờ, không chứng minh hộp thoại.
- **Người soi ảnh bằng mắt** (§12): các ảnh này do máy đo; phần đánh giá thẩm mỹ
  vẫn cần mắt người.
- Số % pixel khác nhau giữa các lần chụp: không có (ffmpeg của Playwright hỏng
  filter, đã bỏ hướng này từ đợt trước).

## Chạy lại

Script chụp là tệp tạm, đã xoá sau khi chụp (`.tmp-qa-turns.cjs`). Muốn chụp lại:
dựng lại script Playwright trỏ `http://localhost:3000`, seed 6 row như bảng trên
trước mỗi viewport, rồi đo `document.documentElement.scrollWidth` so với
`clientWidth`.
