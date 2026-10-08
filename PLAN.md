# PLAN — Đổi hệ thống thiết kế Vyen sang tối giản hiện đại (trắng, kiểu Codex)

> Trạng thái: **đợt B/C/D xong; P0 của DESIGN.md §13–§15 xong; P1 xong trừ
> "thẻ tool năm lớp" (mới lớp 1/4/5) — đợt gần nhất là P1-E (composer, 2026-10-08)
> ở mục "ĐỢT P1-E" bên dưới**; nhóm P2/P3 và điều kiện ảnh §14.9 còn treo.
> PLAN này thay PLAN cũ của các phiên trước.
> Kế hoạch này là nguồn sự thật cho đợt đổi design system.

---

## ĐỢT P0 (2026-10-06) — bám DESIGN.md §14.8 (P0 trước P1)

Đọc yêu cầu "bám sát design md tiến hành làm UI" thành: làm đúng thứ tự mà
DESIGN.md §14.8 đã chốt — **P0 phải xong trước P1**, vì P1 (khối trả lời biên tập,
thẻ tool năm lớp, composer mới) làm số chỗ hiển thị chữ tăng lên, nên sửa họ chữ và
tương phản trước.

### E1 — Hai lỗi tương phản đã đo (§9.5)

- [x] `accent-dim` `#7fb8a6` (2.26:1 trên trắng, 2.07:1 trên `#f5f5f5`) → `#519a85`
      (3.33:1 / 3.05:1) — sửa đồng bộ `tailwind.config.ts` + `:root` trong
      `app/globals.css` + bảng màu `tests/design-system.test.ts` + §2.4.
- [x] Chấm trí đầu vỏ Settings: `bg-accent-dim` + `text-accent` (2.50:1) →
      `bg-accent-soft` + `text-accent` (5.09:1).
- [x] Bằng chứng: `npx vitest run tests/design-system.test.ts` → 42/42 xanh.

### E2 — Typography: đổi HỌ chữ (không đổi cỡ)

Quy tắc chốt: **mono chỉ cho CHỮ MÁY** — code, lệnh, đường dẫn, tên tệp, tên tool,
ID, payload JSON, dòng diff, stdout/stderr, số liệu. Mọi thứ còn lại (chrome: vỏ
dialog/panel, nhãn, chip, nút, hàng trạng thái, metadata) là Inter.

- [x] Recipe trong `globals.css`: `.field-label`, `.field-hint`, `.field`,
      `.field-sm`, `.menu-item`, `.notice` → `var(--font-sans)`.
- [x] Theo thứ tự đọc: composer → sidebar → menu (`thinking-menu`, `model-selector`)
      → dialog (`settings-dialog`, `diff-confirm`, `shell-confirm`,
      `tool-approval-dialog`, `audit-viewer-dialog`, `workspace-checkpoints`,
      `staging-panel`) → phần còn lại (`chat/*`, `settings/*`, `mcp/*`, badge…).
- [x] `tool-trace.tsx`: dòng gọn sang Inter, **tham số + đầu ra thô giữ mono** —
      mở đường cho §15.2 điểm 7 (mỗi loại tool một cách trình bày).
- [x] Kết quả đo: 55 chỗ `font-mono` → `font-sans`; còn **37 chỗ mono**, tất cả
      đúng vai chữ máy (danh sách ở DESIGN.md §3).
- [ ] **Chưa làm:** cột px 14 (nhãn/nút/menu) và 16 (hội thoại dài) của §13.2.
      Đổi cỡ là đổi diện mạo toàn app trong một lần → cần ảnh đối chiếu trước/sau.

### E3 — Bằng chứng đã chạy

- [x] `npx tsc --noEmit` → 0 lỗi.
- [x] 10 file test UI liên quan → 261/261 xanh (design-system, tool-trace,
      tool-trace-render-cost, message-item-timeline, message-item-evidence-badge,
      composer-contrast, composer-affordances, a11y-contract, thinking-menu,
      usage-stats).
- [x] `npm run docs:check` → 0 lệch (sau khi cập nhật số dòng
      `DOCS_TSX_ARCHITECTURE.md` cho `tool-trace.tsx` 957→971 và
      `settings-dialog.tsx` 431→438).
- [ ] **Chưa làm:** bộ ảnh 375 / 768 / 1024 / 1440px (§12, §14.9) — không có ảnh
      thì không được khẳng định UI đã đẹp hơn.

---

## ĐỢT P1 (2026-10-06) — bố trí tin nhắn + dòng gọn tool

### F1 — Khối trả lời biên tập (§15.1 điểm 2/3/5)

- [x] Gỡ `.bubble` / `.bubble-user` / `.bubble-bot` khỏi `app/globals.css` (recipe
      không còn ai gọi là class chết — vẫn sinh CSS, vẫn trông như có tác dụng).
- [x] Thêm `.user-note`: bo 12px (`xl`), nền nhấn nhạt, KHÔNG bóng; trần cụm 76%
      để phần chữ đứng quanh mức 72% cột hội thoại.
- [x] Trợ lý: chữ nằm TRỰC TIẾP trên nền hội thoại, đánh dấu bằng
      `data-testid="reply-text"` (không dùng class rỗng — đó là class chết mới).
- [x] Avatar chỉ hiện ở tin MỞ khối; tin sau giữ cột bằng ô đệm 26px (bỏ đệm là chữ
      thụt trái 34px, hai lề cho cùng một đoạn văn).
- [x] Vị trí trong khối tính MỘT chỗ: `runPositionById` trong `message-list.tsx`,
      tính cả tin ĐANG STREAM nằm ngoài virtualizer.
- [x] Nhịp khoảng cách là MỘT hàm `rowSpacing(position)`; hàng user `py-5` là mốc
      ngắt lớn nhất.
- [x] Cột chip tool đổi `pl-[50px]` → `pl-[34px]` cho khớp cột chữ mới (avatar 26 +
      gap 8; 16px padding của hộp đã bị gỡ). Test đọc chính `message-item.tsx` để
      đổi một bên mà quên bên kia là đỏ.

### F2 — Dòng gọn tool (§15.2 điểm 6/7)

- [x] `toolKindOf()` + `toolScaleOf()`: quy mô đếm trên ĐẦU RA ĐANG HIỂN THỊ —
      `+a −b` (sửa tệp, bỏ dòng tiêu đề diff), `N dòng ra` (chạy lệnh), `N dòng`
      (đọc/tìm). Không parse "N file"/"N test pass": con số sai trong một dòng trông
      rất chắc chắn.
- [x] `useElapsed()`: thời gian chạy đo bằng đồng hồ của chính chip, chỉ khi nó tự
      thấy tool chuyển đang chạy → xong. Mở lại lịch sử thì không hiện — không bịa.
- [x] Trạng thái tool thành CHỮ ở đuôi dòng (trước đây chỉ có trong `aria-label` +
      icon), đúng nhãn bảng §15.5; màu chỉ là lớp thứ hai.
- [x] 6 test mới gọi hàm thật (không soi source), gồm một ca đầu ra thù địch.

### F3 — Sửa lẻ có tên trong doc

- [x] §15.4 điểm 17: nhãn phím tắt trộn tiếng Anh (`reject`, `then ↵ on the chosen
      button`) → tiếng Việt, ở cả `diff-confirm.tsx` và `shell-confirm.tsx`.
- [x] §9.4: `thinking-menu.tsx` tự ghi `z-40` → `${Z_CLASS.dropdown}`.

### Bằng chứng

- [x] `npx tsc --noEmit` → 0 lỗi.
- [x] 7 file test liên quan → 215/215 xanh (design-system, tool-trace,
      tool-trace-render-cost, message-item-timeline, a11y-contract, thinking-menu,
      approval-binding, anchored-panel, redteam-tool-detail-hostile).
- [x] Thử phá assertion nhịp mới (đổi `pb-5` → `py-0.5`) → test đỏ đúng lý do, đã
      hoàn nguyên.
- [x] `npm run docs:check` → 0 lệch (cập nhật 6 dòng trong
      `DOCS_TSX_ARCHITECTURE.md` cho message-list / message-item / tool-trace /
      diff-confirm / shell-confirm / thinking-menu).
- [x] **Đã xong ở đợt sau (2026-10-07):** ảnh lượt có tool chạy + lượt lỗi và ảnh
      lượt đã gập — `docs/design-qa/2026-10-07-turns/`; turn header + dữ liệu LƯỢT
      (ĐỢT P1-B); gom lượt thành khối gập được (ĐỢT P1-C).
- [ ] **Chưa làm:** ảnh diff/approval thật (điều kiện §14.9, cần lượt chạy thật);
      gom tool theo phase; hai mức quyền trong hộp thoại duyệt; evidence badge mở ra
      đúng nguồn; context pill phân biệt đường dẫn hợp lệ; composer mới; task control
      rail.

## ĐỢT P1-B (2026-10-07) — dữ liệu LƯỢT + turn header

Mở nút thắt lớn nhất còn lại của §14.8 P1: "gom lượt + turn header". §15.1 chốt
rằng ranh giới lượt phải là **dữ liệu gắn theo sự kiện**, không suy đoán lúc vẽ —
nên việc đầu tiên là đưa khái niệm lượt vào dữ liệu, rồi mới vẽ.

### H1 — Mô hình lượt (`lib/turns.ts`, mới)

- [x] `nextTurnId()` — LUẬT DUY NHẤT quyết định một row thuộc lượt nào, dùng chung
      cho cả đường GHI (reconcile) lẫn đường ĐỌC (`groupTurns`). Hai đường hỏi cùng
      một hàm thì không thể trả lời khác nhau.
- [x] Ranh giới theo bảng §15.1: gửi khi agent đang chạy → lượt đang mở; việc khác
      (follow-up/New task) → lượt mới; Stop rồi gửi → lượt mới; Retry → cùng lượt;
      trả lời câu đang chờ quyền → lượt đang mở (nhận biết bằng tool invocation
      chưa có `result`, tức bằng DỮ LIỆU, không bằng nội dung tin nhắn).
- [x] `turnStatusOf()` — 8 trạng thái của bảng §15.5, nhãn hiển thị giữ nguyên văn;
      `stopping` tách khỏi `cancelled` khi còn tool đang chạy.
- [x] `turnTitleOf()` — tên việc lấy từ yêu cầu người dùng mở lượt, bỏ dấu markdown,
      cắt ở ranh giới TỪ, trần 72 ký tự. `countFiles()` đếm đường dẫn khác nhau
      trong THAM SỐ tool (không parse chuỗi hiển thị).

### H2 — Lưu lượt (đường ghi + đường đọc)

- [x] `StoredMessage.turnId` — trường không index (không bump version Dexie, đúng
      convention đã ghi ở `lib/db.ts` cho `reasoning`/`toolInvocations`).
- [x] `reconcileActiveMessages` nhận `turnIntent` và cấp lượt cho MỌI row chưa có,
      gồm cả row cũ → nâng cấp dữ liệu một lần, ghi rồi giữ nguyên.
- [x] `hasStoredMessageChanged` so sánh `turnId` — thiếu dòng này thì nâng cấp chết
      lặng y hệt bug reasoning/toolInvocations (test canh ở
      `tests/reasoning-persistence.test.ts`).
- [x] `toChatMessage` trả `turnId` + `createdAtMs`; row cũ không gắn khoá rỗng.

### H3 — Nối sự kiện ở runtime

- [x] steering drain → `'continue'`; goal-loop continue → `'continue'`; duyệt plan
      → `'continue'`; follow-up drain → `'new'`; goal kickoff → `'new'`; "viết tiếp"
      → `'new'`; `handleStop` → `'new'` cho lượt kế tiếp (Stop là điểm kết thúc do
      người dùng đặt, row còn mang `streaming` nên không thể suy từ trạng thái).
- [x] Cờ ý định là `useRef` và được TIÊU THỤ một lần mỗi lần reconcile.
- [x] Gợi ý phím dưới ô nhập nói rõ: khi AI chạy, Enter = điều chỉnh việc đang làm,
      Alt+Enter = việc mới (trước đây gọi cả hai là "xếp hàng").
- [ ] Chưa làm: nút *New task* nổi bật ở cột trái (§14.1) — hiện đường "việc khác"
      đi qua Alt+Enter/follow-up.

### H4 — Turn header

- [x] `components/chat/turn-header.tsx` (mới): tên việc (`text-ui`, medium) +
      trạng thái (icon + CHỮ, `title` giải nghĩa theo §15.5); dòng phụ `text-meta`
      chỉ hiện khi có giờ/số tool/số file. Không badge, không viền, không bóng.
- [x] Trạng thái `xong` KHÔNG kèm dấu tick (tick = tự cấp chứng nhận đã kiểm).
- [x] Gắn vào tin ĐẦU của lượt trong `message-list.tsx`; gom nhóm tính MỘT chỗ bằng
      `groupTurns` trên cả `messages` (gồm tin đang stream nằm ngoài virtualizer).
- [x] Không mở header thứ hai cho tin đang stream (nó là thân của lượt đang hiện).

### Bằng chứng

- [x] `tests/turns.test.ts` — 30 test gọi HÀM THẬT (không soi source), gồm ca thù
      địch: dữ liệu rỗng, `turnId` rỗng, row trợ lý mở đầu hội thoại, chuỗi chỉ có
      xuống dòng, `text-[10.5px]`-style sai lệch không áp dụng ở đây nhưng tiêu đề
      dài bị cắt giữa từ thì có.
- [x] **Bug tên việc (tự tìm thấy trong lúc chụp ảnh)**: bản đầu của
      `message-list.tsx` tự map row cho `groupTurns` và bỏ sót `content`, nên MỌI
      header rơi về "Lượt chưa có yêu cầu" mà không có lỗi biên dịch nào. Sửa
      NGUYÊN NHÂN: thêm `turnRowsOf()` trong `lib/turns.ts` làm chỗ dựng row duy
      nhất, khai `content?: string` thành trường thật của `TurnRow`, và thêm test
      gọi hàm thật. Đã THỬ PHÁ: bỏ dòng `content` trong `turnRowsOf` → 1 test đỏ
      đúng lý do, đã hoàn nguyên.
- [x] Đã THỬ PHÁ 2 chỗ trong `lib/turns.ts` (bỏ ý định `new`, bỏ xử lý `turnId`
      rỗng) → 3 test đỏ đúng lý do; đã hoàn nguyên và chạy lại xanh.
- [x] Hợp đồng mới trong `tests/design-system.test.ts`: icon đủ cho 8 trạng thái,
      `xong` không tick, không viền/bóng trong header, tên việc `text-ui`, phần phụ
      `text-meta`, header nằm TRÊN nội dung tin đầu tiên.
- [x] `tests/reasoning-persistence.test.ts` + `tests/redteam-reasoning-persist-hostile.test.ts`
      cập nhật: fixture mang `turnId` (đại diện dữ liệu đã nâng cấp) và thêm test
      riêng cho việc nâng cấp một-lần. **Hai test cũ tên "phải XOÁ reasoning" đã
      đổi nghĩa** — chúng xanh rỗng vì đường ghi cố ý GIỮ reasoning; ghi rõ trong
      file thay vì im lặng.
- [x] `npx tsc --noEmit` → 0 lỗi; ESLint các file đã sửa → 0 error.
- [x] **Ảnh nghiệm thu** `docs/design-qa/2026-10-07-turns/` (kèm README số đo): 4 ảnh
      375 / 1024 / 1440 / 1440-zoom200%. Đo từ DOM: 3 turn header mỗi ảnh, trạng
      thái `completed` — `failed` — `waiting_approval`, tên việc là chữ thật của
      lượt 1 (`3 thao tác · 1 file`), `scrollWidth === clientWidth` (0px tràn
      ngang) ở cả bốn cấu hình, 0 lỗi console.
- [x] `npm run docs:check` → 0 lệch (10 tài liệu, 631 file theo dõi).
- [ ] **Phát hiện ngoài phạm vi (cần đợt riêng):** tải lại trang làm lượt đang chờ
      quyền biến thành "xong" — `sanitizeToolInvocations` (lib/db.ts) cố ý bỏ
      invocation chưa `result`, và khi app ghi lại row đang `streaming` sau khi nạp
      thì dấu vết tool biến mất. Đo được: row `a3` `tools 1 → 0`, `streaming →
      complete`. §15.5 cần một dấu vết lưu trữ cho "lượt bị ngắt giữa chừng".
- [ ] **Chưa làm:** ảnh hộp thoại duyệt diff / approval thật (§14.9 — trạng thái
      runtime, không seed được, không có khoá LLM nên không sinh được lượt thật);
      người soi ảnh bằng mắt (§12); gom thân lượt thành khối gập; thẻ tool năm lớp;
      nhóm tool theo phase; hai mức quyền trong hộp thoại duyệt; evidence badge mở
      ra nguồn; context pill; composer mới; task control rail; chiều sâu (§13.2 mục
      3).

## ĐỢT P1-E (2026-10-08) — composer mới: hàng chân + focus mở rộng dọc

Mục P1 cuối cùng của §14.8, và là điểm 15 của §15.4. Hai việc tách bạch: (1) bố
cục hàng chân `model · phạm vi · gửi` với chữ nhỏ hơn ô nhập; (2) focus mở rộng
nhẹ theo chiều dọc **mà không làm hội thoại dịch chuyển**. Context pill
`@đường/dẫn` vẫn nằm ở P2 (chưa có cơ chế gắn đường dẫn thì chưa có gì để vẽ).

### C1 — Hàng chân là một hàng thật, không phải dải công cụ thứ hai

- [x] Ô chọn model rời dải công cụ trên, xuống hàng chân — cùng hàng với nút gửi
      (§14.4), dải trên chỉ còn việc của tác vụ (menu Tác vụ, chế độ phê duyệt,
      chip file chờ duyệt).
- [x] Nút icon thư mục → **chip phạm vi có CHỮ** (`workspaceScopeChip`), phân biệt
      `chưa có thư mục` với tên thư mục đang nối; `null` khi phiên không có tính
      năng thư mục (không vẽ chip nói về thứ không tồn tại).
- [x] Cỡ chữ hàng chân ≤ 14px (`text-ui`), dưới `text-read` 16px của ô nhập; pill
      chế độ phê duyệt và băng lỗi tệp từ `meta`/`xs` (12px) lên `ui` (14px) —
      §15.4 điểm 12 cấm thông tin quyết định nằm ở `micro`/`meta`.
- [x] Vùng chạm chip phạm vi nới lên 44px **chỉ theo chiều dọc**
      (`min-h-8` + `after:-inset-y-[6px]`); nới ngang sẽ chồng lên ô chọn model và
      nút đính kèm (§12 điểm 3).

### C2 — Focus mở rộng dọc, vỏ KHÔNG đổi chiều cao

- [x] `COMPOSER_FOCUS_PAD`: hàng nhập `12/0 → 14/6`, hàng chân `6/14 → 6/6`. Tổng
      bằng nhau ở hai trạng thái, nên chiều cao vỏ — và cột tin nhắn phía trên —
      không đổi một pixel; hàng chân trả ở **ĐÁY**, nên nút gửi không nhảy lên.
- [x] Hai hàng cùng `transition-[padding] duration-150 ease-out`: tổng bằng nhau ở
      **mọi khoảnh khắc** của chuyển động, không chỉ lúc kết thúc.
- [x] Gỡ `PulseGlow` khỏi vỏ composer (§15.4 điểm 15 cấm "phát sáng gây phân tâm").
- [x] `data-composer-row="input"|"foot"` + `data-composer-shell` để đo được bằng máy.

### C3 — Bằng chứng

- [x] 19 test MỚI trong `tests/composer-affordances.test.ts` (49 → 68): hàm thật
      `workspaceScopeChip` (5 test) và hợp đồng đọc từ JSX — vị trí model, cỡ chữ,
      bo góc/không bóng/vùng chạm, tổng padding khớp `COMPOSER_FOCUS_PAD` ở cả hai
      trạng thái, cùng `transition`, không còn `PulseGlow`.
- [x] **Đã THỬ PHÁ hai lần**: (1) đổi `pb-1.5` → `pb-2` ở hàng chân → **3 test đỏ**
      (tổng lệch, phép trao lệch, số không khớp hằng số); (2) cho nhãn "chưa nối"
      trùng nhãn "đã nối" → **1 test đỏ**. Cả hai đã hoàn nguyên và chạy lại xanh.
- [x] `npx tsc --noEmit` 0 lỗi; `npx eslint` 0 error; 6 suite liên quan 169 passed.
- [x] **Playwright đo thật** (không seed dữ liệu): vỏ 170/170 ở 375–768 và 144/144 ở
      1024–1440 khi focus, hàng nhập +8px, hàng chân −8px, 0px tràn ngang ở
      375/768/1024/1440 + zoom 200%, 0 lỗi console; `elementFromPoint` xác nhận cả
      bốn control bấm được ở 320/375/768/1024/1432/1440px; panel model mở từ hàng
      chân vẫn nằm trọn trong khung nhìn. Ảnh + README: `docs/design-qa/2026-10-08-composer/`.
- [x] Trạng thái "đã nối thư mục" được tạo bằng cách chặn `window.showDirectoryPicker`
      trả handle giả rồi **bấm thật** vào chip — nhãn đổi `chưa có thư mục` → `vyen-qa`.

### C4 — Lỗi thật tìm được trong lúc đo (đã sửa trong đợt)

- [x] Ở 768px, pill phê duyệt (nhãn dài 266px, lúc đó hiện từ `md`) ép cụm trái còn
      76px → ô chọn model co còn **26px** và tràn sang chip phạm vi (chồng 14px);
      `elementFromPoint` tại tâm nó trúng chip, tức **control mất khả năng bấm**.
      Sửa: pill hiện từ `lg` (trên `md` sidebar đã chiếm 288px nên cột chỉ còn 414px)
      và ô chọn model không tham gia co (`flex-none`; nhãn đã tự cắt theo
      `max-w-[30vw]`). Sau khi sửa: 99px ở mọi bề rộng, không chồng, `hitSelf = true`.

### Chưa làm của đợt này

- **Context pill** `@đường/dẫn` / `@diff-hiện-tại` / `@lỗi-gần-nhất` và vế "đường
  dẫn không hợp lệ" của §15.4 điểm 15 (nhóm P2).
- Nhóm P2 còn lại: task control rail, evidence badge mở ra nguồn, approval theo
  rủi ro, hành động kế tiếp, nút New task.
- Nhóm P3: chuyển động 150–200ms toàn cục, chỉ báo streaming, hover/focus, drawer
  mobile, bàn phím, nhánh reduced-motion.
- §15.3 Chốt A/B (vùng xem mở rộng + dải plan một dòng) — tính năng riêng.
- Ảnh diff/approval cho §14.9 và người soi ảnh bằng mắt (§12).

## ĐỢT P1-D (2026-10-07) — nhóm phase + vạch trạng thái + phạm vi cho thẻ tool

Mục P1 lớn còn lại của §14.8 và là "chỗ đáng đầu tư nhất" (§14.3): ba lớp 1/4/5 của
thẻ tool. Lớp 2 (thân mặc định) và lớp 3 (thân mở rộng) đã có từ trước.

### T1 — Luật nhóm phase là DỮ LIỆU, ở `lib/tool-phases.ts` (mới)

- [x] `phaseOfTool(name, args)` — `Khảo sát / Thực hiện / Kiểm chứng / Khác`, xét theo
      thứ tự ưu tiên (kiểm chứng trước `shell`, vì lệnh test cũng là lệnh shell).
- [x] Lệnh kiểm chứng đọc từ **khoá `command` trong tham số JSON**, không dò trên
      chuỗi thô; `npm run dev` / `npm run build` KHÔNG phải kiểm chứng.
- [x] Tool `mcp__*` rơi vào `Khác`: tên chỉ nói nguồn, không nói đọc hay ghi — thà
      nói không biết còn hơn gán bừa một phase trông rất chắc chắn.
- [x] `groupByPhase(events)` — đổi phase thì mở đoạn mới, nên `sửa → test lỗi → sửa`
      hiện thành ba đoạn; `errorCount` đếm theo đoạn.
- [x] `toolScopeOf(name, args)` — `một tệp` / `dự án` / `phiên làm việc` (§14.3 lớp 1).

### T2 — Vẽ đoạn + vạch trạng thái + phạm vi trong `tool-trace.tsx`

- [x] `ToolPhaseBand` — chữ trên nền (`Khảo sát · 1 thao tác`, thêm `N lỗi` khi đoạn
      có lỗi), không viền/nền/bóng (điểm 13).
- [x] Đoạn cắt trên CẢ mảng sự kiện, nên câu model viết xen giữa hai lần gọi không
      làm đứt một đoạn; dòng tiêu đề chỉ mở ở chip ĐẦU của đoạn.
- [x] Vạch trạng thái bên trái có ở **cả bốn** trạng thái (thêm `accent` cho đang chạy,
      `subtle` cho xong) — trước đây chỉ lỗi/bỏ dở có vạch.
- [x] Phạm vi nằm trong THẺ MỞ, không chen vào dòng gọn (§15.2 điểm 6).
- [x] Giữ nguyên các hợp đồng cũ của chip: `<button type="button">`, `aria-expanded`,
      nhãn trạng thái bằng chữ, khoá theo từng sự kiện (nay ở vỏ mục để vạch ngăn cắt
      giữa hai lần gọi, không cắt giữa tiêu đề đoạn và chip đầu của nó).

### T3 — Bằng chứng

- [x] `tests/tool-phases.test.ts` (**mới**, 13 test HÀM THẬT): bảng phân loại, vòng lặp
      ra 4 đoạn, gộp đoạn liền nhau, đếm lỗi theo đoạn, `mcp__*` → `Khác`, chữ trong
      tham số không biến lần ĐỌC thành lần chạy test, phạm vi ba mức.
- [x] **Test bắt được 2 lỗi thật của bản đầu**: (1) dò lệnh test trên chuỗi thô nên
      `{"command":"npm test"}` không khớp → mọi lần chạy test bị xếp vào `Thực hiện`;
      (2) `mcp__*` bị gán `implement` vì khớp `create_`. Sửa nguyên nhân (đọc khoá
      `command`; chặn `mcp__` sớm), không nới test.
- [x] **Đã THỬ PHÁ**: bỏ điều kiện `current.phase !== phase` trong `groupByPhase` →
      **4 test đỏ**; đã hoàn nguyên và chạy lại xanh.
- [x] Test hợp đồng mới trong `tests/design-system.test.ts` (45 → 46 test): tiêu đề
      đoạn lấy nhãn từ bảng chốt, không viền/bóng, vạch đủ bốn trạng thái, phạm vi đọc
      từ `lib/tool-phases`.
- [x] `npx tsc --noEmit` 0 lỗi; `npx eslint` 0 error; 4 suite liên quan
      (tool-trace / render-cost / redteam-tool-detail / message-item-timeline) 158 passed.
- [x] Ảnh + đo thật bằng Playwright (seed chuỗi `đọc → sửa → test LỖI → sửa → test`):
      **5 đoạn** đúng thứ tự `Khảo sát · Thực hiện · Kiểm chứng (1 lỗi) · Thực hiện ·
      Kiểm chứng`, 0px tràn ngang, 0 lỗi console; mở một chip → phạm vi hiện `dự án`.
      Ảnh: `1440-chat-tools-phases.png`, `1440-chat-tools-card-open.png`.

### Chưa làm của đợt này

- Nhãn `chờ bạn cho phép` ở cấp tool: chưa có dữ liệu trạng thái phê duyệt theo từng
  tool, nên chưa hiện được — ghi ở §15.2 điểm 6 thay vì đoán.
- Lớp 3 tách raw payload / trace khỏi stdout; "8 file" kiểu đếm theo đối tượng.
- Tên đoạn theo CÔNG VIỆC ("Điều tra lỗi đăng nhập") thay vì tên phase: cần dữ liệu mục
  tiêu của lượt gắn xuống thẻ tool.
- Composer mới; toàn bộ nhóm P2 và P3 của §14.8.

## ĐỢT P1-C (2026-10-07) — thân LƯỢT gập được

Vế còn thiếu của §15.1 điểm 3 và §14.2 điểm 3: "các cập nhật thuộc cùng một khối
tiến trình" đã gom được, nhưng **phần thân lượt chưa gập lại được**. Đích: mỗi lượt
ĐÃ XONG có một khối gập được, để đọc lướt lịch sử chỉ còn `tên việc · trạng thái`.

### F1 — Luật gập là DỮ LIỆU, ở `lib/turns.ts`

- [x] `isFoldableTurn(status)` — chỉ lượt đã ĐÓNG (xong / lỗi / bị chặn / đã hủy)
      mới gập được. Lượt đang chạy hoặc đang chờ quyền mà gập thì người dùng không
      thấy tiến trình sống — đúng thứ §15.1 điểm 3 dựng khối để tránh.
- [x] `foldedRowIds(turns, collapsedIds)` — row bị ẩn khi gập; row ĐẦU (chỗ gắn
      header) LUÔN hiện. Lượt đang mở không bao giờ bị ẩn kể cả khi id còn trong
      tập gập (trạng thái đổi thì khối tự mở lại, không cần ai dọn tập).
- [x] Chứng minh: 5 test HÀM THẬT mới trong `tests/turns.test.ts` (file 30 → 35
      test), phủ đúng 5 ca đã hứa. **Đã THỬ PHÁ**: bỏ guard `isFoldableTurn` và ẩn
      luôn row đầu → **3 test đỏ**, đã hoàn nguyên và chạy lại xanh.

### F2 — Nút gập trên turn header

- [x] `components/chat/turn-header.tsx` nhận `foldable` / `collapsed` / `onToggleFold`;
      chevron `ChevronRight` ↔ `ChevronDown`, `aria-expanded`, nhãn tiếng Việt
      "Gập lượt" / "Mở lượt", `data-testid="turn-fold"`.
- [x] Không badge, không viền, không bóng — cùng luật với phần còn lại của header
      (§15.3 điểm 13 cấm sửa phân cấp bằng viền/bóng).
- [x] Khi gập, dòng phụ nói thật là đang gập (`đã gập`) — không để lượt trông như
      rỗng, và không thêm hàng chip nào.

### F3 — Danh sách tin nhắn lọc row theo tập gập

- [x] `message-list.tsx`: một nguồn `turns` → `hiddenRowIds` → `renderedMessages`
      (danh sách THẬT SỰ vẽ). Mọi chỗ đang đọc `visibleMessages` để tính vị trí
      trong khối / TB nén / virtualizer đổi sang `renderedMessages`, nếu không thứ
      tự vẽ và dữ liệu gom lượt lệch nhau.
- [x] Gập/mở gọi `rowVirtualizer.measure()` để chiều cao còn lại tính lại ngay.

### F4 — Chứng minh

- [x] `npx tsc --noEmit` 0 lỗi, `npx eslint` 0 error (3 file đã sửa).
- [x] Test hợp đồng mới trong `tests/design-system.test.ts` (44 → 45 test): khóa
      `aria-expanded`, chevron, nhãn tiếng Việt, `đã gập`, không viền, và hai ràng
      buộc ở `message-list.tsx` (luật gập hỏi `lib/turns`, vẽ đọc `renderedMessages`).
- [x] Ảnh + đo thật bằng Playwright (`1440-chat-turns-folded.png`): trước khi gập
      `headersWithFold: [true, true, false]` — lượt đang chờ quyền KHÔNG có nút;
      sau khi gập `aria-expanded=false`, dòng phụ có `đã gập`, thân lượt 1 mất
      (`a1Visible: false`) trong khi lượt đang chạy vẫn hiện; bấm lại thì nội dung
      trở về (`a1Visible: true`). 0px tràn ngang, 0 lỗi console.

### Chưa làm của đợt này

- Thẻ tool năm lớp + nhóm tool theo phase (§14.3 — P1 kế tiếp), composer mới.
- Trạng thái gập không lưu vào DB: nó là trợ giúp ĐỌC, không phải dữ liệu lượt.

## ĐỢT P0-C (2026-10-06) — cột cỡ chữ 14/16/12 + ảnh 4 bề rộng

Hoàn nốt phần còn treo của §13.2 (P0) — đúng bảng vai trò, sau khi phần họ chữ
và phần bố trí tin nhắn đã xong.

### G1 — Thang px

- [x] `tailwind.config.ts`: `meta` 11 → 12, `ui` 12 → 14, `read` 15 → 16;
      `micro` 10, `body` 13, `head` 20 giữ nguyên (§13.2 không gán cỡ cho `body`).
      Thứ tự key đổi theo bậc px tăng dần: micro → meta → body → ui → read → head.
- [x] `app/globals.css`: `.field-label` 13 → 14px (0.875rem), `.claude-prose`
      15 → 16px; `.field-hint` 12px vốn đã đúng bậc `meta`.
- [x] Test hợp đồng mới trong `tests/design-system.test.ts`: khóa 6 bậc
      (10/12/13/14/16/20), bắt tăng dần theo thứ tự vai trò, và khóa 3 recipe
      (`.field-label` 0.875rem, `.field-hint` 0.75rem, `.claude-prose` 16px);
      `SCALE_PX` cũ (11/15) cập nhật thành 14/16.

### G2 — Ảnh trước/sau 375/768/1024/1440px

- [x] Dựng headless Chromium ở thư mục tạm `/tmp/pw` (không đụng `package.json`
      và lockfile), chụp `before/` TRƯỚC khi sửa và `after/` SAU
      `freebuff-preview restart`.
- [x] 7 cặp ảnh lưu vào `docs/design-qa/2026-10-06-type-scale/` kèm README số đo
      và hướng dẫn chụp lại.

### Bằng chứng

- [x] `npx tsc --noEmit` → 0 lỗi; ESLint 2 file đã sửa → 0 error.
- [x] Toàn bộ suite: 222 file / **3670 test xanh** + 2 skip (shard 1: 1902,
      shard 2: 1768 — +1 là test hợp đồng mới).
- [x] CSS đọc trực tiếp từ trình duyệt đang phục vụ: `text-ui` 14px ·
      `text-read` 16px · `text-meta` 12px · `.field-label` 0.875rem ·
      `.claude-prose` 16px (`text-head` không sinh CSS vì chưa ai dùng).
- [x] 0px tràn ngang ở cả 4 bề rộng (`scrollWidth === clientWidth`), trước và sau.
- [x] **Bổ sung 2026-10-07:** ảnh lượt tool chạy / lượt lỗi / lượt đã gập + zoom
      200% đã có ở `docs/design-qa/2026-10-07-turns/` (0px tràn ngang ở cả 4 cấu
      hình).
- [ ] **Chưa làm:** ảnh diff/approval (điều kiện §14.9); người soi ảnh bằng mắt.
      ffmpeg pixel-diff không chạy được (thử 2 lần đều lỗi filter), nên không có số
      %pixel đổi — so sánh dựa trên cặp ảnh + số đo CSS.

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