# PLAN — 2 bug runtime + đòn tấn công fix run-lifecycle
## Rà soát lỗ hổng + lỗi logic toàn bộ UI (6 file, +86/−16)

Đọc ~70 file UI (`components/`, `app/*.tsx`) + 10 route handler. Sửa 6 lỗi đã
kiểm chứng bằng đọc code, không đoán.

| # | Mức | File | Lỗi |
|---|-----|------|-----|
| 1 | Cao | `app/api/compact/route.ts` | Thiếu `verifySameOrigin` — route LLM DUY NHẤT tiêu BYOK key mà không có lớp CSRF (chat/vision/web/pdf đều có) |
| 2 | Cao | `components/sidebar.tsx:134` | `window.open(..., '_blank')` không `noopener` → tabnabbing, tab mới chiếm app và đọc IndexedDB (lịch sử chat + provider key) |
| 3 | TB | `components/chat-export-menu.tsx` | Dòng lỗi export dùng `pos` — hook chỉ tính `pos` khi `open`, nên khi menu đóng dòng lỗi **không bao giờ hiện**; `lastPos` + nút đóng |
| 4 | TB | `components/chat-error-boundary.tsx` | Thiếu `resetKey` — bubble lỗi kẹt vĩnh viễn dù content đã về đúng (đúng lỗi `error-boundary.tsx` đã ghi chú). Thêm `resetKey` + `getDerivedStateFromProps`, truyền ở cả 2 call-site `message-list.tsx` |
| 5 | Thấp | `components/storage-quota-meter.tsx` | `formatBytes` tràn chỉ số mảng khi ≥ 1TB → hiện `"1234.5 undefined"` |

**Verify:** `npx tsc --noEmit` sạch 0 lỗi; `npx eslint` trên 6 file sạch 0 lỗi;
`npx vitest run` → **2650 pass / 1 fail**. Test đỏ (`tests/secret-registry.test.ts`,
ngân sách 500ms cho regex ReDoS) là **nhiễu theo máy, có sẵn từ trước**:
stash 6 file của mình rồi chạy lại → vẫn đỏ, thậm chí **3 case** (tệ hơn sau
khi sửa). Không liên quan thay đổi này.

**Ghi chú:** AGENTS.md khuyên dùng `vitest --related <files>` cho vòng lặp
nhanh — repo đã nâng vitest 4.1.11, cờ đó **không còn tồn tại** (`CACError:
Unknown option --related`). Vòng nhanh phải là `npx vitest run <file>...`.

---

## Việc đã xong trước đó

Fix run-lifecycle (hướng 1) đã sửa 6 cổng bắt đầu lượt người dùng:
`lib/hooks/use-run-lifecycle.ts` (+23), `react/use-chat-orchestration.ts` (+59/-21),
`tests/run-lifecycle.test.ts` (+106). Verify: `tsc` sạch, 38/38 test, eslint đúng
bằng baseline, `docs:check` không đổi.

**Đòn tấn công (mục 1 + 2 dưới) đã đóng:** dời `succeedRun()` sau ba drain trong
`onFinish`, thêm `tests/run-wiring.test.ts` khoá wiring, xoá `startFreshRun()`
khỏi `tests/run-lifecycle.test.ts` (chuyển sang file riêng — nó chỉ đọc
`lib/run-lifecycle.ts` không nằm trong diff, nên không bảo vệ được fix).
Verify: `tsc` sạch, 50/50 test 2 file run-lifecycle, 136/136 6 file liên quan,
full suite 2650/2651 (1 đỏ là perf test nhiễu, xanh khi chạy riêng), eslint 0
lỗi / 5 cảnh báo **giống hệt baseline** khi stash thay đổi đi so.

---

## Bug A — `evaluateUsageTrigger` nhận token cộng dồn, kích hoạt `silent_overflow` oan

### Nguyên nhân (đã kiểm chứng từ nguồn SDK)

`node_modules/ai/dist/index.mjs:5960` phát `step-finish` với `usage: stepUsage`
(per-step của provider), rồi `:5976-5978` phát `finish` với
`combinedUsage = addLanguageModelUsage(usage, stepUsage)` — **đã là tổng**.

`app/api/chat/route.ts:2371-2380` dùng `case 'finish': case 'step-finish':` chung một
thân và **cộng dồn cả hai**. Kết quả: `Σ(step₁..stepₙ₋₁) + Σ(step₁..stepₙ)` — mọi
step trừ step cuối bị đếm **hai lần**. Lượt một step vẫn ra đúng `2P`.

Con số quan sát: `↑54,288` với window 32k. Giá trị thật của step cuối ≈ 27,144.

### Vì sao KHÔNG sửa biến cộng dồn

Ba consumer cần **tổng tiền bị tính**, không phải kích thước context:

| Consumer | Cần |
|---|---|
| `lib/message-usage.ts:63` → `estimateCallCostUsd` | tổng đã tính |
| `lib/usage-stats.ts:59,81,84` → rollup ngày/model | tổng đã tính |
| `use-chat-orchestration.ts:2898` → `hud-store` | tổng đã tính |

Sửa accumulator sẽ **giảm tiền ~2×**. Phải tách biến.

### Các bước

1. **`app/api/chat/route.ts`** — thêm biến theo dõi step cuối (vd `lastStepUsage`),
   gán ở nhánh `step-finish`, giữ nguyên phép cộng dồn cho tổng. Đường emulated
   (`:2081-2088`) có cùng lỗi và **không có chunk `finish`** → cần bộ theo dõi
   riêng cho vòng cuối.
2. **`react/use-chat-orchestration.ts:2978`** — `lastUsageRef` phải nhận giá trị
   **step cuối**, không phải tổng. Đây là nơi duy nhất trong repo so usage với
   window (đã xác minh: `evaluateUsageTrigger` chỉ được gọi ở `:3579`).
3. **Viết lại `tests/chat-route-fixes.test.ts:79-91`** — file này đang **khóa**
   hành vi cộng dồn bằng regex, comment ghi rõ "đổi `+` → gán thẳng thì ĐỎ".
   Đây là chi phí phối hợp lớn nhất, phải sửa cùng lúc.
4. **Test hồi quy** — `tests/context-budget.test.ts` thêm case: tổng 40k nhưng
   step cuối 20k, window 32k → phải `skip`.
- **Verify:** `npx vitest run tests/context-budget.test.ts tests/chat-route-fixes.test.ts`
  xanh; `tsc` sạch.

### Câu hỏi chưa giải quyết (chưa sửa, chỉ ghi)

`use-chat-orchestration.ts:2971` đổi `completionTokens === 0` thành ước lượng
`Math.ceil(clean.length / 4)`, nên nhánh `length_stop_zero_output` ở
`context-budget.ts:261` có thể là **dead code**. Ngoài phạm vi lần này.

---

## Bug B — `anchor.log` mất dữ liệu

### Hai cơ chế, đều đã kiểm chứng

**B1 — cắt 24k rồi ghi đè (nghiêm trọng hơn).**
`lib/audit-log.ts:193` đọc qua `desktopFsRead`, nhưng `lib/desktop-fs.ts:129` cắt
`content` ở `MAX_READ_CHARS = 24_000` (`:12`) và trả kèm `truncated` (`:130`).
`audit-log.ts:194` **chỉ lấy `r.content`, bỏ qua `r.truncated`**, rồi `:198` ghi
lại `existing + newLine`. Hệ quả: **xoá vĩnh viễn toàn bộ phần đuôi file** khi nó
vượt 24.000 byte. Mỗi dòng anchor ~105 byte → vỡ ở khoảng **dòng thứ 228**.
HEAD hiện 10.774 byte (104 dòng) nên sắp tới.

**B2 — EPERM trên Windows (phụ).**
`lib/ipc.cjs:361-370` ghi tmp rồi `fsp.rename`. Trên Windows, `rename` ném
`EPERM` khi đích bị mở không có `FILE_SHARE_DELETE`, và khi nhiều rename cùng
đích (đo được: 20 lần → 19 EPERM). Lỗi bị nuốt: `void appendDiskAnchor(...)`
(`audit-log.ts:287`) + catch chỉ `console.warn` (`:202`).

B1 là nguyên nhân chính — B2 chỉ khuếch đại.

### Phạm vi

`db.auditLogs` (IndexedDB) **còn nguyên** — ghi DB ở `:277` trước, có try/catch
riêng. Chỉ mất lớp dự phòng trên đĩa. `verifyChain` (`:317-442`) đọc DB, không đọc
anchor → **verify không đỏ**; mất âm thầm. `DOCS_TSX_ARCHITECTURE.md:344` mô tả
so head-hash với anchor — mã đó không tồn tại.

### Các bước

1. **`lib/ipc.cjs`** — thêm `FsAppendPayload` + `fsAppend` (`mkdir` rồi
   `fsp.appendFile`, dùng cờ `O_APPEND` sẵn của Node nên append nhỏ là atomic),
   đăng ký `on('vyen:fs-append', ...)` cạnh `vyen:fs-write` (`:1145`). Không có
   allow-list ở server-bridge (`invokeBridgeChannel` = `handlers.get`), và desktop
   chạy app-mode nên **không có Electron main/preload** — thêm channel rẻ hơn hẳn
   dự đoán ban đầu.
   - KHÔNG thêm cờ `append` vào `fsWrite`: `hasDiff`/`expectedBaseHash` (`:229-235`,
     `:341-359`) vô nghĩa với append và dễ bị lách.
2. **`lib/desktop-bridge.ts`** — thêm `vyen:fs-append` vào type `VyenBridge.fs`
   và mapping trong `createWebBridge` (`:529`).
3. **`lib/desktop-fs.ts`** — wrapper `desktopFsAppend`.
4. **`lib/audit-log.ts:187-198`** — thay read+write bằng một lệnh append.
   Đây là chỗ **chặn B1 triệt để**.
5. **Fallback EPERM trong `fsWrite`** — retry có backoff giới hạn (3-5 lần,
   10/25/60/150/400 ms + jitter) giữ tmp file. EPERM đo được là sharing-violation
   **tạm thời**, retry biến nó thành thắng đơn-writer.
   - **KHÔNG** fallback `copyFile`+`unlink`: không atomic, crash giữa chừng mất file.
   - **KHÔNG** fallback `writeFile` thẳng: có thể cắt file khỏe về 0 byte.
   - Tách commit riêng: `fsWrite` dùng chung cho mọi fs_edit/fs_write nên bán
     kính ảnh hưởng rộng hơn nhiều.
6. **Test hồi quy** — `tests/ipc-register.test.ts` theo mẫu sẵn có: đăng ký
   fake `ipcMain`, `Promise.all` 20 lần `vyen:fs-append` vào một đường dẫn,
   assert file có **20 dòng** với `seq` tăng dần. Chỉ khi handler là một
   `fsp.appendFile` mới xanh → xác định, không flaky.
   Thêm test khoá B1: mock `desktop-fs`, gọi `appendDiskAnchor` hai lần, assert
   **không** phát `desktopFsRead` và **không** gọi `desktopFsWrite`.
- **Verify:** test mới xanh; `tests/ipc-register.test.ts`, `tests/web-bridge.test.ts`,
  `tests/p2-p3-architectural.test.ts` không đỏ; `tsc` sạch.

### Việc phụ

`.vyen/audit/anchor.log` đang được git theo dõi và còn rác runtime
(`test`, `seq:116` đứt chuỗi). Cân nhắc `.gitignore` + `git rm --cached`, nhưng
`DOCS_TSX_ARCHITECTURE.md` có mô tả anchor nên cần bạn quyết.

---

## Việc chưa chốt — đòn tấn công đã về

Đòn tấn công độc lập đã xác nhận lỗ hổng tôi tự phát hiện, và phát hiện thêm
lỗi trong chính code tôi viết. Mục 1 và 2 đã sửa xong; mục 3, 4 còn lại.

### 1. Lỗ hổng completeness — ĐÃ SỬA

`succeedRun()` chạy **trước** ba đường tự tiếp tục: steering, goal-loop,
follow-up. `reconcile()` trả `{kind:'none'}` khi terminal (`run-lifecycle.ts:318`)
và effect reconcile return sớm (`use-run-lifecycle.ts:149`), nên không timer nào
được vũ trang. `touchRun()` đi qua `touchProgress` cũng no-op khi terminal.

Hệ quả: goal loop vòng 2-5 (tối đa 5 vòng) và mọi drain đều chạy **không giám
sát** — cùng lớp bug, ở các cổng không gọi `beginRun`.

- **Đã sửa:** chọn hướng **bố cục** — dời `succeedRun()` xuống CUỐI khối
  `finishReason !== 'tool-calls'`, sau cả ba drain. Không thêm `startFreshRun()`
  vào drain, vì `startFreshRun()` gọi `resetRun()` **vô điều kiện** → xoá mất
  `startedAt` của chính câu trả lời đang stream, tức mất giám sát theo hướng
  ngược lại. Ba drain nối tiếp đúng run này là **đúng ý đồ**.
  - Nhánh recipe không drain (pass/stop xong thật, retry gọi `submitTurn` tự
    reset) nên chốt succeeded tại chỗ rồi `return` — thêm một `succeedRun()`
    riêng, không phải sửa dùng chung.
  - `onFinish` giờ có **2** lần gọi `succeedRun()`: recipe + lượt cuối.
- **Comment đã viết lại:** `startFreshRun` (`:2746`), `use-run-lifecycle.ts`
  `reset()`, và comment khối drain — cả ba trước đây mô tả đây là "lỗi còn bỏ".

### 2. Test của tôi không bảo vệ fix của tôi — ĐÃ SỬA

10 test trong `tests/run-lifecycle.test.ts` đều import `@/lib/run-lifecycle`,
nhưng **`lib/run-lifecycle.ts` không nằm trong diff** — revert toàn bộ thay đổi
production vẫn khiến chúng xanh. Helper `userTurn` tự viết lại `startFreshRun`
thay vì gọi hàm thật.

- **Đã sửa:** thêm `tests/run-wiring.test.ts` — regex-assert trên source
  `react/use-chat-orchestration.ts`, đúng convention `tests/chat-route-fixes.test.ts`.
  Khoá 6 cổng mở lượt mới (mỗi cổng 1 test, cộng 1 test đếm tổng để bắt cổng
  thứ bảy) và 4 test cho vị trí `succeedRun()`.
- **Hai bẫy đã gặp và xử lý** (đều làm test ĐỎ XANH sai, không phải do code):
  1. File trên đĩa là **CRLF** (`core.autocrlf`) → regex cứng `\n` đỏ ở máy
     này, xanh ở CI. Đã `.replace(/\r\n/g, '\n')` một lần lúc đọc.
  2. Comment tiếng Việt trong file chứa đúng chuỗi `startFreshRun()` /
     `succeedRun()` → đếm bằng `split()` đếm nhầm comment. Đã đổi sang mẫu
     **call statement** `^\s*fn\(\);$`.
- **Verify (đã chạy, xem log):** 3 đột biến, mỗi đột khôi phục file về byte
  giống backup:
  | đột biến | ĐỎ đúng kỳ vọng |
  |---|---|
  | xoá `startFreshRun()` khỏi `continueGenerating` | test của chính cổng đó + test đếm tổng |
  | dời `succeedRun()` lên trên ba drain | test vị trí `succeedRun` thứ hai |
  | thêm `startFreshRun()` lạc vào steering drain | test "drain KHÔNG reset" + test đếm tổng |

  Đột biến đầu **lần đầu KHÔNG làm đỏ** (chỉ test đếm tổng đỏ) — vì comment
  ngay trong `continueGenerating` chứa chữ `startFreshRun()`. Đã đổi sang
  `CALL()` rồi chạy lại, lần này test đúng tên cổng đỏ.

### 3. `submittingRef` chết (ghi nhận, không sửa)

`components/composer.tsx:467` khai báo `submittingRef` nhưng không nơi nào đọc/ghi.
Giữa guard `submitTurn` và `startFreshRun()` có 6 `await` → nhấn Enter hai lần
là cửa sổ TOCTOU. Có sẵn từ trước, không do thay đổi này.

---

## Chưa verify

- **Chưa chạy app UI.** Toàn bộ fix run-lifecycle mới chỉ được chứng minh bằng
  test tầng state + regex wiring; chưa quan sát spinner treo thật.
- `tests/redteam-picker.test.ts` perf test đỏ khi chạy full suite (690ms > 500ms
  budget), **xanh khi chạy riêng** → nhiễu do tải song song, file này không nằm
  trong diff. Đã đo lại: 2650/2651 pass.
- Chưa biết 2 dòng rác còn lại trong `anchor.log` do ai ghi — không tìm ra
  writer thứ hai.
- Chưa biết 104 dòng trong HEAD là anchor thật hay fixture (có nhiều dòng
  `seq:1`/`ts:1700000001000` giống hệt nhau — nghiêng về fixture).
- `vyen:fs-append` mới chỉ test qua `ipc.cjs`; chưa chạy thật qua bridge web
  (`POST /api/bridge`) nên nhánh fallback của `desktopFsAppend` chưa được chạm.


---

# PLAN — Học từ Vane / rrsi (2026-10-03) — CHƯA BẮT ĐẦU, chờ duyệt

Backup PLAN.md trước khi nối: `~/.gemini/antigravity/brain/7999d443-.../scratch/PLAN.backup-2026-10-03.md`
(SHA-256 khớp bản gốc `A4F33028…B230`).

## Kết quả kiểm chứng (đọc code thật, không suy đoán)

| Kết luận cũ | Kết quả | Bằng chứng |
|---|---|---|
| Toggle web lấy nguyên tin nhắn làm query | ĐÚNG | `lib/use-web-search.ts:120` |
| Bật toggle là luôn tìm | ĐÚNG | `react/use-chat-orchestration.ts:5326` |
| …nên port `skipSearch` của Vane | BỎ | người dùng đã bấm bật web = ý định rõ ràng; tự bỏ qua là trái UX |
| Hướng dẫn trích dẫn `[n]` vs `[tên](url)` lệch nhau | ĐÚNG về text, CHƯA chứng minh gây lỗi | `lib/web-context.ts:50,59`; chưa thấy model trả `[1]` trơn |
| `aux-llm-chain.ts` là chỗ gọi LLM phụ | SAI một phần | file chỉ là policy chọn chuỗi model (thuần). Mẫu gọi LLM thật nằm ở `app/api/compact/route.ts:199-250`; `/api/title` đã bị gỡ |
| Viết lại query = rủi ro thấp, công sức thấp | SỬA → công sức TRUNG BÌNH | `gatherWebContext` chạy ở TRÌNH DUYỆT → cần route server mới mang header BYOK |
| Chế độ Speed/Balanced/Quality ≈ maxHits/maxPages | SAI | Vane: mode = số vòng researcher 2/6/25 (`src/lib/agents/search/researcher/index.ts`). Vyen prefetch là 1 phát; agent đã có `web_search` lặp được |
| (bỏ sót) | MỚI | agent mode đã có tool `web_search` do model tự viết query (`lib/agent-tools.ts:409-448`) → vấn đề follow-up CHỈ ở đường toggle prefetch |
| zod server phải khớp `WEB_LIMITS` | ĐÚNG | `app/api/chat/route.ts:703-720` hardcode 300/200/2048/500/5/9000 |
| rrsi: Python, Apache-2.0, cần benchmark | ĐÚNG | README + `selection.py` |
| Vyen chưa có bộ eval | ĐÚNG | `git ls-files` chỉ có `tests/fixtures/mcp-demo-server.mjs` |
| `completion-gate.ts` ≈ critic của rrsi | YẾU | gate chỉ regex stub/skip; critic rrsi = regex + LLM soi logic riêng cho benchmark |
| Vane MIT | ĐÚNG | badge README |

Chưa đọc hết: source Vane bị raw-fetch cắt đoạn; paper rrsi chưa đọc.

## Quyết định

- LÀM: **P1** — viết lại câu hỏi follow-up thành câu độc lập cho đường toggle web.
- CÓ ĐIỀU KIỆN: **P2** — chỉ sửa trích dẫn nếu tái hiện được model trả `[1]` trơn.
- BỎ: skipSearch, Speed/Quality mode, widget, Discover, ảnh/video, Docker.
- HOÃN: mọi thứ từ rrsi (cần bộ eval trước — dự án riêng).

---

## P1 — Viết lại query follow-up (đường toggle web)

**Hành vi đích:** lượt đầu hội thoại → y như cũ (0 lượt gọi thêm). Lượt follow-up có toggle
web → gọi LLM phụ ≤ 4s để ra câu độc lập; lỗi/timeout/rỗng → dùng query gốc (hành vi cũ).

**Đánh đổi:** +1 lượt gọi LLM nhỏ (~200 token, 1-3s) mỗi lượt follow-up có bật web; lịch sử
gửi tới CÙNG provider đang chat (không thêm bên thứ ba).

### Bước 0 — Đọc doc Next 16 cho route handler
- Việc: đọc `node_modules/next/dist/docs/` phần Route Handlers (theo AGENTS.md).
- Chứng minh: ghi 1 dòng vào PLAN.md xác nhận không có breaking change ảnh hưởng `POST` route.

### Bước 1 — Module thuần `lib/web-query-rewrite.ts` (file mới)
- `shouldRewrite(history)` → true khi có ≥1 tin assistant trước đó.
- `buildRewritePrompt(history, text)` → lấy tối đa 6 tin gần nhất, mỗi tin cắt 500 ký tự.
- `sanitizeRewrite(raw, fallback)` → 1 dòng, bỏ ngoặc kép/tiền tố "Query:", ≤ `WEB_LIMITS.queryChars`,
  rỗng → fallback.
- Chứng minh: `tests/web-query-rewrite.test.ts` — lượt đầu không rewrite; output nhiều dòng/có
  ngoặc/quá dài/rỗng đều ra đúng; chạy `npx vitest run --related lib/web-query-rewrite.ts`.

### Bước 2 — Route `app/api/web/rewrite/route.ts` (file mới)
- Sao mẫu `app/api/compact/route.ts`: same-origin, giới hạn body 16KB, validate `x-api-base`/`x-api-key`,
  `buildActiveModelChain`, `generateText` với `temperature: 0`, `maxTokens: 80`, timeout 4s.
- Trả `{ query }` hoặc `{ query: null, reason }` — KHÔNG bao giờ 5xx khiến client chặn gửi.
- Không đụng `/api/web` (không trộn key LLM vào route proxy search).
- Chứng minh: test route với `generateText` mock — thiếu provider → `no_provider`; body sai → 400;
  model trả rác → `sanitizeRewrite` áp dụng; abort → `aborted`.

### Bước 3 — Nối vào client
- `gatherWebContext(messageText, opts?: { history, headers })` — tham số MỚI, tuỳ chọn → caller cũ
  và test cũ không đổi.
- Rewrite chỉ áp cho query search; URL dán tay vẫn trích từ tin nhắn GỐC.
- `react/use-chat-orchestration.ts:5330` truyền history (tin text gần nhất) + header provider
  (theo mẫu `lib/use-pdf-context.ts:22`).
- Chứng minh: `npx vitest run --related lib/use-web-search.ts react/use-chat-orchestration.ts`;
  `npx tsc --noEmit`; `npm run lint` không tăng so với baseline (stash để so).

### Bước 4 — Kiểm tra tay (UI)
- Bật web → "giá vàng SJC hôm nay" → follow-up "còn tuần trước thì sao?" → DevTools: body
  `/api/web` op search phải là câu độc lập.
- Sai API key → tin nhắn vẫn gửi, query = nguyên văn, không có thông báo lỗi mới.
- Lượt đầu: không có request `/api/web/rewrite`.
- Input rỗng, double submit, refresh giữa chừng → không treo `webBusy`.
- Chứng minh: ghi kết quả từng case vào PLAN.md.

### Bước 5 — Tài liệu
- Cập nhật dòng "Tìm kiếm web" trong README.md; chạy `npm run docs:check`.

---

## P2 — Trích dẫn (có điều kiện)

- Bước 1: bật web, hỏi 5 câu với 2-3 model đang dùng; đếm số lần model trả `[1]` trơn
  (không link). Ghi số liệu vào đây.
- Nếu 0 lần → ĐÓNG P2, không sửa.
- Nếu có → sửa 1 câu hướng dẫn trong `formatWebContextBlock` ("ghi rõ link markdown, không dùng
  số trơn"), cập nhật `tests/web-context.test.ts`, đo lại. KHÔNG làm chip UI (cần lưu hits vào
  message — thay đổi lớn).

---

## Hoãn (ghi lại để không quên)

- **Bộ eval cố định** (20-30 task + chấm điểm) — điều kiện tiên quyết cho cổng chấp nhận kiểu rrsi
  `selection.py` và việc prune `lib/prompt/protocol.ts` / `lib/agent-tools.ts`.
- **Quy ước ghi "giả thuyết → kết quả → kết luận"** cho mỗi lần thử — cần sửa AGENTS.md phía trên
  mục Lessons → phải hỏi chủ dự án trước.
- **Mở rộng completion-gate** phát hiện fix hard-code theo fixture — regex dễ báo nhầm; chỉ cân
  nhắc khi có ví dụ thật.
