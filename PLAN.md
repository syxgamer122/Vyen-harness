# PLAN — Đổi hệ thống thiết kế Vyen sang tối giản hiện đại (trắng, kiểu Codex)

> Trạng thái: **đang thực hiện**. PLAN này thay PLAN cũ của các phiên trước.
> Kế hoạch này là nguồn sự thật cho đợt đổi design system.

## Yêu cầu người dùng

> "thiết kế UI cho dự án sao cho thật tối giản hiện đại tông màu trắng tương tự
> như của codex nhưng nhẹ hơn cắt hiệu ứng không cần thiết nhưng những cái cần có
> phải có"

Đọc lại đúng ba vế:
1. **Tối giản + hiện đại** — không nét mực 2px, không bo bất đối xứng, không doodle.
2. **Nền trắng, tông giống Codex nhưng nhẹ hơn** — bảng màu trung tính, KHÔNG mint
   đậm, KHÔNG chữ vẽ tay.
3. **Cắt hiệu ứng thừa, giữ cái cần** — bỏ nhấn dịch-bóng, bỏ đuôi bong bóng;
   giữ bóng nổi mềm, focus ring, phản hồi hover/focus.

## Quy tắc bất di bất dịch của đợt này

- **Không hạ assertion để làm test xanh.** Assertion nào không còn đúng với hệ
  mới thì viết lại nó theo hệ mới, kèm comment giải thích vì sao bất biến cũ
  không còn đúng.
- **Sửa `:root` phải sửa cả `hex` trong tailwind.config.ts.** Test kiểm cả hai
  chiều; sửa một bên sẽ đỏ ngay.
- **Class đổi tên = class chết.** Không xoá `rounded-ink`/`rounded-wobble` khỏi
  config trước khi đã grep hết chỗ gọi, nếu không mọi chỗ đó rơi về `0px` mà
  không có gì đỏ.

## Quy mô đo được (không phải ước lượng)

| Mẫu | Số lượt trong `components/ app/ lib/` |
|---|---|
| `rounded-ink` | 2 (`composer.tsx`, `app/global-error.tsx`) |
| `rounded-wobble` | 4 (`composer.tsx`, `sidebar.tsx` ×2, `message-list.tsx`) |
| `border-2` | 7 |
| `.uic` | ~10 chỗ (heading/nhãn) |
| `lift-sm/md/lg` | 70 — **giữ nguyên tên class**, chỉ đổi giá trị |
| `accent-mint` | 13 |

Kết luận chiến lược: giữ nguyên TÊN class `lift-*` và `.well` (đã có 70 chỗ gọi
+ test ghim), chỉ đổi ĐỊNH NGHĨA giá trị. Chỉ class thật sự ít dùng
(`ink`/`wobble`) mới gỡ và migrate.

## Các bước + cách chứng minh

### B1 — Bảng màu mới (trung tính + 1 accent)
Sửa `hex` trong `tailwind.config.ts` + khối `:root` trong `app/globals.css`.

**Quyết định đo được, không phải cảm tính:** mọi token CHỮ phải ≥ 4.5:1 trên nền
`#fff` (WCAG AA, và là hạng 1 của skill UI/UX Pro Max).
- `#575757` → 7.23:1 (secondary)
- `#6f6f6f` → 5.02:1 (tertiary)
- `#a3a3a3` → 2.6:1 — chỉ dùng cho disabled, WCAG miễn trừ control bị vô hiệu
- `#949494` → **3.03:1** (border-default) — đạt WCAG 1.4.11 cho ranh giới control.

**Chứng minh:** test `mọi giá trị màu trong globals.css thuộc bảng §2` + test
`bảng màu trong test khớp tailwind.config.ts theo cả hai chiều`.

### B2 — Chiều sâu: bóng lệch cứng → bóng mềm
`.lift-sm/md/lg` đổi từ `2px 2px 0 rgb(0 0 0 / 0.9)` (vệt mực) sang bóng mềm
mờ dần theo khoảng cách. `.well` giữ nguyên vai "ô nhập chìm" nhưng nhạt hơn.

**Chứng minh:** test `giá trị lift-* trong config khớp BYTE với globals.css` (so
từng LAYER, số lớp 1/2/2 giữ nguyên) + test `đúng 4 nguồn sinh bóng`.

### B3 — Bo góc: bất đối xứng → đều, nhỏ
`borderRadius`: `sm 4 → DEFAULT 6 → md 8 → lg 10 → xl 12 → 2xl 16 → 3xl 20`.
Gỡ `ink`/`wobble`, migrate 6 chỗ gọi sang bậc px tương ứng.

**Chứng minh:** test `borderRadius là thang THẬT theo vai trò` — viết lại để
kiểm thang PX tăng dần và CẤM class bất đối xứng (đây là phần "không hạ
assertion": bất biến cũ "phải bất đối xứng" được đảo thành "phải TUYỆT ĐỐI đều").

### B4 — Viền 2px → 1px
`border-2` trong recipe globals.css + 7 chỗ trong component.

**Chứng minh:** test `recipe @apply đặt độ rộng viền thì phải @apply kèm màu`.

### B5 — Cắt trang trí
- Xoá đuôi `.bubble-*/::after` (doodle truyện tranh).
- Xoá `active:translate-x/y` (nhấn dịch bóng) khỏi recipe.
- `accent-mint` → `accent-soft` (nền trung tính), nút chính → mực đậm trắng
  (đúng cách Codex làm nút primary).

**Chứng minh:** grep không còn `bubble-.*::after`, `active:translate` trong
recipe, `accent-mint` trong `components/ app/`.

### B6 — Chữ: bỏ Patrick Hand
`.uic` chuyển từ `--font-hand` sang `--font-sans`, cho phép weight thật.
Bỏ `Patrick_Hand` khỏi `app/layout.tsx`.

**Chứng minh:** `npm run typecheck` (không còn ref `--font-hand`) + grep
`font-hand` rỗng.

### B7 — Viết lại test + DESIGN.md
Sửa các assertion mâu thuẫn với hệ mới, giữ nguyên các assertion còn đúng
(bảng màu hai chiều, viền-không-màu, class chết, text-opacity, rail, gutter…).

**Chứng minh:** `npx vitest --related tests/design-system.test.ts` xanh, và đọc
từng assertion đỏ nếu có.

### C — Kiểm chứng lại theo checklist `ui-ux-pro-max` (đợt 2)

Soi UI đã tối giản / hiện đại / đẹp CHƯA, theo đúng 10 hạng của skill.

| Phát hiện | Hạng | Bằng chứng | Cách sửa |
|---|---|---|---|
| Emoji làm icon: `📏🔧⚠️💡📖📌` (settings Ghi nhớ), `📁` (Tự động sao lưu) | 4 HIGH | `grep` emoji trong `components/` | Thay bằng icon Lucide `Ruler/Wrench/TriangleAlert/Lightbulb/BookOpen/FileText/Folder` |
| Lỗi hướng dẫn "Bấm 📁 trên composer" nhưng UI dùng icon SVG | 4 | `lib/desktop-fs.ts:91`, `lib/fs-access.ts:159` | Đổi chữ thành "nút thư mục" |
| `outline-none` xoá focus ring toàn cục (`app/globals.css` `:focus-visible`) | 1 CRITICAL | nút chọn chat `sidebar.tsx`, textarea sửa tin nhắn `message-item.tsx` | Gỡ `outline-none`, để rule `:focus-visible` lo phần ring |
| 8 nút icon 28px đứng một mình thiếu vùng chạm mở rộng | 2 CRITICAL | `grep "h-7 w-7"` không kèm `after:-inset` | Thêm `after:-inset-[8px]` (28→44px); h-8 dùng `-inset-[6px]`; nút xoá từ khoá trong ô search 20px lên 28px |
| Chữ 10px (`text-micro`) | 6 MEDIUM | `tailwind.config.ts` `fontSize` | **Cố ý không sửa** — là bậc thứ 6 chỉ dùng cho số đếm/metadata, đã ghi trong DESIGN.md §3 |

**Kiểm chứng:** `npx vitest related --run tests/design-system.test.ts tests/composer-contrast.test.ts …`
xanh, `npx tsc --noEmit` 0 lỗi, `npm run docs:check` 0 lệch; phần KHÔNG sửa
(chữ 10px) ghi rõ lý do thay vì im lặng.

### D — Soi lần hai theo `ui-ux-pro-max` (đợt 3)

Đợt 2 soi khi hệ còn đang chuyển. Đợt 3 soi lại sau khi ổn định, tập trung vào
những thứ **không ai nhìn thấy bằng mắt** nên đợt 2 bỏ sót.

| Phát hiện | Hạng | Bằng chứng | Cách sửa |
|---|---|---|---|
| Con trỏ: preflight không khai `cursor` cho `<button>`, chỉ 21/180 call site tự ghi `cursor-pointer` | 2 CRITICAL | `grep -c "cursor-pointer" components app` = 21 vs `grep -c "<button"` = 180 | Một rule ở `@layer base`: `button:not(:disabled)`, `[role='button']:not([aria-disabled='true'])`, `summary` → `cursor: pointer` |
| Focus ring mất ở MỌI ô nhập: `outline-none` (layer `utilities`) đè `:focus-visible` (layer `base`) | 1 CRITICAL | `.field` / `.field-sm` trong `app/globals.css` + `sidebar.tsx:222,499` + `model-selector.tsx:395` | Gỡ `outline-none`; gỡ `focus:ring-0` (xoá mất bóng `.well`); giữ `focus:border-accent` |
| 2 chip đổi màu ở `duration-100` | 7 MEDIUM | `status-line.tsx`, `orchestrator-badge.tsx` | Lên `duration-150`; giữ 100ms cho transform/opacity (micro-interaction cơ học) |

**Cố ý KHÔNG sửa:** `outline-none` ở `textarea` composer (focus hiện ở vỏ form
qua `isFocused` + `PulseGlow` — vòng quanh textarea là dư).

**Kiểm chứng:** 3 test mới trong `tests/design-system.test.ts`, đã thử phá cả 3
để bảo đảm chúng đỏ đúng lý do chứ không rỗng.

## Thứ CỐ Ý không đổi (không thuộc đợt này)

- `lib/ui-z.ts`, recipe `settings-card`, layout `thread`/`rail`, gutter `px-5`.
- Các assertion nghiệp vụ: sidebar bo góc, tooltip Ctrl+\, nút 44px, diff, prose.

## Trạng thái

- [x] Đọc nguồn sự thật, đo quy mô
- [x] B1 bảng màu
- [x] B2 chiều sâu
- [x] B3 bo góc
- [x] B4 viền 1px
- [x] B5 cắt trang trí
- [x] B6 chữ
- [x] B7 test + tài liệu
- [x] Chạy test + typecheck (4 file 103/103, 11 file 335/335, tsc 0, docs:check 0)
- [x] C kiểm chứng theo `ui-ux-pro-max` + sửa vi phạm
  - [x] C1 emoji → Lucide (settings Ghi nhớ, Tự động sao lưu, 2 thông điệp lỗi)
  - [x] C2 focus ring: gỡ `outline-none` (sidebar, message-item)
  - [x] C3 vùng chạm 44px cho 9 nút icon nhỏ + 1 nút xoá từ khoá
  - [x] C4 test chặn emoji hồi quy trong `tests/design-system.test.ts`
- [x] D soi lần hai + sửa 3 lỗ hổng (con trỏ, focus ring ô nhập, timing hover)
  - [x] D1 rule `cursor: pointer` toàn cục ở `@layer base`
  - [x] D2 gỡ `outline-none` khỏi `.field` / `.field-sm` + 3 ô nhập viết tay
  - [x] D3 2 chip đổi màu `duration-100` → `duration-150`
  - [x] D4 3 test khoá hợp đồng, đã thử phá để chắc không rỗng
  - [ ] D5 `vitest related` + `tsc --noEmit` + `docs:check` xanh sau D1–D4
  - [x] Verify: vitest related 623 + rest 346 + chốt 212, `tsc` 0, `docs:check` 0