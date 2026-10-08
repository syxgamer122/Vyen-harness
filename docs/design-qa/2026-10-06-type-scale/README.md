# Ảnh đối chiếu thang cỡ chữ 14 / 16 / 12 — 2026-10-06

Bằng chứng cho §13.2 bước 2 (DESIGN.md): đổi cỡ px của thang 6 bậc.

## Hai lần chụp

| | Thang cũ | Thang mới |
|---|---|---|
| Thư mục | `before/` | `after/` |
| `text-ui` (nhãn, nút, menu) | 12px | **14px** |
| `text-read` / `.claude-prose` (hội thoại dài) | 15px | **16px** |
| `text-meta` (metadata, timestamp) | 11px | **12px** |
| `.field-label` (nhãn trường) | 13px | **14px** |
| `text-micro` / `text-body` | 10 / 13px | giữ nguyên 10 / 13px |

Ảnh `after/` chụp **sau** khi `freebuff-preview restart`, tức là CSS mới đã phục vụ thật.

## Cách chụp

Headless Chromium qua Playwright, cài ở thư mục tạm (không đụng `package.json`
và lockfile của dự án):

```sh
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright --ignore-scripts
npx playwright install chromium --only-shell
npx playwright install-deps chromium          # cần quyền root: libglib, libnss, libx11…
node <script chụp>                           # viewport 375/768/1024/1440, goto '/', fullPage: false
```

Trong phiên làm việc đã dùng helper tạm `.tmp-shots.cjs` (đã xoá): mở trang, chụp
`{w}-chat.png`, bấm nút **Cài đặt** rồi chụp `{w}-settings.png`, và đọc
`document.documentElement.scrollWidth === clientWidth` ở mỗi bề rộng.

## Số đo lấy cùng lúc với ảnh

- **0px tràn ngang** ở cả 375 / 768 / 1024 / 1440 (`scrollWidth == clientWidth`).
- CSS đọc trực tiếp từ stylesheet trình duyệt đang tải: `text-micro` 10px ·
  `text-meta` 12px · `text-body` 13px · `text-ui` 14px · `text-read` 16px ·
  `.field-label` 0.875rem · `.field-hint` 0.75rem · `.claude-prose` 16px.
  (`text-head` không có trong CSS sinh ra vì chưa component nào dùng — Tailwind JIT.)
- Test hợp đồng `tests/design-system.test.ts` khóa cả 6 bậc và 3 recipe; toàn bộ
  suite 3670 test xanh sau đợt đổi.

## Ảnh CHƯA chụp (điều kiện nghiệm thu §14.9 còn thiếu)

- Lượt hội thoại **có tool đang chạy**, diff/approval, trạng thái **lỗi** — cần
  dữ liệu thật (model backend), không tạo nổi bằng giao diện rỗng.
- Zoom **200%** và trạng thái đang stream.
- Ảnh **375px-Settings** — ở bề rộng này nút *Cài đặt* không có trong DOM khi
  sidebar đang đóng, nên không bấm được; cần chụp thêm sau khi làm drawer mobile (P3).

Ảnh ở đây là **bằng chứng đối chiếu**, không phải nghiệm thu bằng mắt: §12 yêu cầu
người xem và chốt, chưa ai làm việc đó.
