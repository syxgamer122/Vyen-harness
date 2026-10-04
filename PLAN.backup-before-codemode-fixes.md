# PLAN.md — Đánh giá UX + kế hoạch sửa Vyen (đợt 2026-10-04)

Bối cảnh: cần đóng vai "người dùng khó tính", chạy preview với provider self-host
`http://localhost:20128/v1`, đánh giá toàn bộ tính năng, rồi lên kế hoạch sửa.

Bản PLAN trước: `PLAN.prev-session.md`.

Hạ tầng: dev server Next 16 (Turbopack) ở :3100; Chrome CDP port 9223, driver thô
trong `tmp-ux/` (`ux.mjs` + `s01`–`s33`).

---

## 0. BASELINE (chạy trước khi sửa gì)

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | **exit 0**, sạch |
| `npx vitest run` | **2648 pass / 3 fail / 1 skip**, 183/185 file, 396s |
| `npx eslint .` | **9 errors / 10 warnings** — xem mục 0.1 |

3 test đỏ CÓ SẴN, không liên quan đợt này:
- `tests/secret-registry.test.ts` — "DSN dài không có dấu @ (thử lookahead rule mật khẩu DSN)": hết giờ regex ReDoS, nhiễu theo máy.
- `tests/web-bridge.test.ts` — "grep tìm kiếm nội dung trong mã nguồn": timeout 15s.
- 1 test thứ 3 trong 2 file trên.

**Lưu ý hạ tầng**: `AGENTS.md:57` bảo dùng `vitest --related <files>` cho vòng lặp nhanh —
**sai**. vitest 4.1.11 đã gỡ cờ đó (`CACError: Unknown option --related`). Cách chạy nhanh
thật sự: `npx vitest run tests/<file>.test.ts` (đo thật: 1 file trong 2.37s).

**Đính chính thêm (trinh sát đo được)**: `--related` không tồn tại, nhưng **subcommand**
`vitest related` thì CÓ và chạy thật: `npx vitest related components/chat/tool-trace.tsx --run`
→ 2 file, 26 test, 3.10s. `AGENTS.md:57` cần sửa thành dạng này.

**`vitest.config.mts`**: `environment: 'node'` (`:11`), `include: ['tests/**/*.test.ts']` (`:12`)
⇒ file test `.tsx` bị **bỏ qua im lặng**. `setupFiles: ['./tests/setup-env.ts']` (`:15`) chỉ
xoá 4 biến môi trường. `testTimeout: 30000` (`:16`). Alias `@/` → repo root (`:7`).

**Không có CI nào chạy test.** `.github/workflows/` chỉ có `discord-changelog.yml`,
`docs-sync.yml` (chạy `npm run docs:check`), `supply-chain-audit.yml`. Không workflow nào
chạy `vitest` / `tsc` / `eslint` / `next build` ⇒ suite chỉ được chạy tay ở máy.

**Hạn chế test**: repo chạy `environment: 'node'`, **không có jsdom / happy-dom /
@testing-library**. Không test render component được. Ba cách repo dùng: (1) tách logic ra
hàm thuần export rồi import vào test; (2) `fs.readFileSync` source + assert regex; (3) bàn
giao kiểm thử UI thủ công. Cấm tự thêm thư viện — `AGENTS.md:31`.

### 0.1 Lint baseline là nhiễu

Cả 9 lỗi `react/display-name` đến từ `temp-test-profile/ux/Default/Extensions/**` — JavaScript
bundle của **extension Chrome**, không phải code dự án. Thư mục này đã nằm trong `.gitignore:30`
nhưng `eslint.config.mjs` **không** ignore nó (danh sách ignore chỉ có `node_modules/**`,
`.next/**`, `out/**`, `gui-test-screenshots/**`). 1 warning còn lại ở
`tests/git-indirect-escalation.test.ts:6` (eslint-disable thừa).
→ Khi so baseline sau khi sửa, **9 lỗi này vẫn còn** và không phải do ta. Sửa luôn được
bằng cách thêm `temp-test-profile/**` vào ignore của `eslint.config.mjs` (1 dòng).

---

## 1. CÁI GÌ CHẠY THẬT TỐT

Cấu hình provider self-host `http://localhost` (validator cho phép đúng case này, chặn
SSRF đúng). Streaming chat mượt. Agent tool loop thật — `fs_list` trả về danh sách thật,
`fs_write` trả `{"written":true,"staged":true,"size":9}`. Tìm session trong sidebar hoạt
động. Refresh không mất dữ liệu. Gõ rỗng → nút gửi `disabled`, Enter không tạo tin rác.
Cả 7 tab Settings có nội dung thật. **Export Markdown + JSON hoạt động** — bấm là tải file
thật (`chat-<tên>-<ngày>.md`). Staging Sandbox ghi đệm đúng, persist vào `kv` key
`staging:current`, khôi phục lại sau reload.

---

## 2. ĐÍNH CHÍNH SO VỚI BÁO CÁO ĐỢT TRƯỚC

Hai kết luận cũ **sai**, phải gỡ:

- **"Reasoning dính liền vào câu trả lời" — SAI.** `reasoning` là kênh riêng: server ghi
  part `reasoning` (`app/api/chat/route.ts:2099,2333`), SDK giữ nó ngoài `content`, và
  `message-item.tsx:382-388` render `ThinkingBlock` thành khối riêng. Thứ tôi thấy là
  **model tự viết `**Mục tiêu:** … **Tiêu chí:** …` vào câu trả lời**, không phải app ghép.
  Lỗi thật là khác: **reasoning không được persist** — `toChatMessage`
  (`lib/chat-tree-persistence.ts:151-164`) không trả field `reasoning`, nên mở lại chat cũ
  là mất hẳn khối suy luận.
- **"`flushSync was called from inside a lifecycle method` — không phải lỗi repo.**
  `grep -rn flushSync` toàn repo **không có kết quả**. Cảnh báo console đó đến từ thư viện
  (React 19 / react-markdown), không phải code của dự án. Xem mục 3 như 🟢 nếu tái hiện.

---

## 3. LỖI ĐÃ XÁC MINH (mỗi cái kèm cách chứng minh)

Xếp theo mức nghiêm trọng. 🔴 = rủi ro mất dữ liệu / nói dối người dùng.

### 🔴 L1 — `/boost` nói dối: không hề có worktree
`react/use-chat-orchestration.ts:5808-5816`. Handler chỉ `showNotice("Đã kích hoạt chế độ
Boost trong Git Worktree cô lập")` rồi `submitTurn("[Chế độ Boost Worktree] Hãy thực thi tác
vụ sau trong Git Worktree cô lập: …")` — một chuỗi text.
Bằng chứng: `grep -c worktree react/use-chat-orchestration.ts` → **0**;
`grep -c worktree lib/tool-catalog.ts` → **0** (không có tool `git_worktree`).
**Chạy thật trên trình duyệt**: gõ `/boost thêm một file test.txt vào workspace` → app báo
đã kích hoạt worktree, model liền đáp *"Tạo file test.txt ở thư mục gốc workspace"* và
`fs_list` chạy trên workspace chính. Người dùng tin là đang ở worktree cô lập, thực tế agent
đang sửa thẳng thư mục làm việc chính.
Có code worktree thật trong repo (`lib/teamwork/worktree.ts`) nhưng **không file `.tsx` nào
import** (`grep -rl "@/lib/teamwork" components app` → 0 hit).

### 🔴 L2 — Token arrows đảo chiều ở thanh trạng thái
Dưới tin nhắn: `↑16891 · ↓153 · 9.6s`. Thanh dưới composer: `17053↓ 2↑`. Cùng một
con số, hai nơi, hai chiều mũi tên. Người dùng đọc là "17053 token ra" khi thực tế là
token vào.
DOM: `<span class="shrink-0 tabular-nums">` trong `div.flex.items-center.gap-1.5`.

### 🔴 L3 — `tools_search` là nhãn dán marketing: 36 tool gửi mỗi request
`app/api/chat/route.ts:2244-2253` spread **toàn bộ** `CLIENT_TOOL_DEFS` vào `tools:`, cộng
thêm `routerMetaTools` (`tools_search`/`tools_load`) **sau** catalog đầy đủ. `activeToolNames`
tính đúng bằng BM25 (chọn 27/36) nhưng chỉ dùng để in danh sách *tên* vào system prompt
(`route.ts:2029`), không bao giờ chạm vào trường `tools:`.
Đo thật (import module thật bằng `tsx`, serialize qua đúng đường của `ai@4`): 36 schema tool
= **24.867 chars ≈ 6.147–7.105 token**; system tĩnh ~2.706 chars; messages ≤ 8.042 byte.
Một request ≈ 6.824–10.470 token.
Ngoài ra `tools_search`/`tools_load` **không có trong `TOOL_CATALOG`** → `formatToolProtocolManual`
bỏ qua (`agent-tools.ts:704`, `if (!def) continue`). Ở đường emulated, model được báo "có 2
meta-tool" nhưng không có schema nào để gọi — manual cho 2 meta-tool đo được **0 ký tự**.

### 🔴 L4 — Kết quả tool không bao giờ hiện ra
Hai nguyên nhân độc lập:
1. `summarizeToolResult` (`lib/agent-tools.ts:172-224`) cố tình chỉ trả metadata một dòng
   (`"12 phần tử"`, `"1.234 ký tự"`), **không bao giờ mang nội dung thật**.
2. Nội dung thật nằm ở `message.toolInvocations[i].result` (chỉ tool client-side như `fs_*`),
   nhưng `tool-trace.tsx:263` render sau disclosure thu gọn, và `tool-trace.tsx:226`
   `disabled={!hasOutput}` khi không có summary → **không có tín hiệu thị giác nào** rằng
   có thể mở.
Dữ liệu **có** trong IndexedDB: `toolInvocations[0].result` = full dir listing, `state: "result"`.

### 🔴 L5 — `formatToolDetail` trả JSON thô khi path rỗng
`tool-trace.tsx:168-191`: `if (parsed.path || …)` — `path === ''` là falsy nên cả 4 nhánh
đều trượt, rơi xuống `return text`. Người dùng thấy `liệt kê thư mục · {"path":""}`.
Thêm nữa `summarizeToolArgs` (`agent-tools.ts:130`) dùng `a.path ?? '.'` — `??` không bắt
chuỗi rỗng → cũng rỗng.

### 🔴 L6 — Telemetry tab chết
`globalTracer.startSpan()` (`core/telemetry/tracer.ts:40`) **không có call site nào** ngoài
`tests/telemetry-tracer.test.ts`. Sau một lượt agent đầy đủ, tab "Đo đạc & Quan sát" hiện
`0 / 500 spans — Chưa có dữ liệu đo đạc.` Header counter nằm ngoài nhánh empty nên vẫn in
`0 / 500` ngay cạnh empty state.

### 🟡 L7 — `Code · reported done` lặp 3 lần
2 bản giống hệt dưới mỗi tin nhắn (`message-item.tsx:447`) + 1 bản ở thanh trạng thái
(`inline-flex items-center gap-1 font-mono text-tertiary text-meta shrink-0`). Badge nói
"reported done" cho một lượt mà người dùng không hề thấy bằng chứng nào.

### 🟡 L8 — Mũi tên token đảo + `≈` không nhất quán
`message-usage.tsx` in `≈↓` khi ước lượng nhưng `↑` không bao giờ mang cờ ước lượng
(`usage.est` chỉ set khi `completionTokens` thiếu — `use-chat-orchestration.ts:3027`).

### 🟡 L9 — Hướng dẫn phím Ctrl+K dẫn tới phím không tồn tại
`composer.tsx:937` in `(Ctrl+K / / for Commands)`. `grep ctrlKey` toàn repo chỉ có
`lib/use-branch-keyboard-shortcuts.ts:46` và `app/page.tsx:63` — **không nơi nào bắt Ctrl+K**.
Bấm ra không có gì.

### 🟡 L10 — Pill "Autonomous Tools Active" hiện khi policy = smart
`composer.tsx:1090-1093` điều kiện `approvalPolicy === 'smart'` — smart là chế độ **có hỏi
duyệt khi ghi**. Tên nói ngược hành vi.

### 🟡 L11 — Staging entry bị chôn trong menu icon 32×32
File đang staged chỉ hiện dưới menu "Tác vụ" (`composer.tsx:799-810`, điều kiện
`stagedFileCount > 0`). Nút cha là icon 32×32 không chữ. Người dùng không biết có file đang
chờ Apply. **CHƯA XÁC MINH**: có mở được panel không — xem mục 5.

### 🟡 L12 — Tiêu đề session sinh từ prompt chèn vào
Gõ `/boost …` → session tên **"Chế độ Boost Worktree Hãy"**. Tên lấy từ chuỗi hệ thống
chèn vào user message, không phải từ câu hỏi. Cùng lỗi với "Xin chào Trả lời đúng" (B9 cũ).

### 🟡 L13 — Scheduler panel báo `success` giả trên web
`components/scheduler/scheduler-panel.tsx:74-91` — web không có scheduler, panel rơi vào
nhánh mô phỏng, tự bịa `sched-…` sessionId và đánh dấu `lastStatus: 'success'` dù không chạy.

### 🟡 L14 — Tool chips trùng cấp thị giác
`tool-trace.tsx:231-237`: trạng thái `done` dùng `text-tertiary` trên nền trong suốt — **cùng
cấp với chữ meta**. Chỉ khi `running` mới có `lift-sm bg-raised`. Một lượt có 10-20 chip đều
là dòng xám 11px liền nhau, không divider, không phân biệt tool nào xong / thất bại.

### 🟢 L15 — Reasoning block đặt trước bubble
`message-item.tsx:382-388` render `ThinkingBlock` trước, `:399` mới render bubble. Phần
chrome (suy luận + tool trace + orchestrator badge) chiếm 3 khối viền liền nhau đẩy câu trả
lời thật xuống dưới fold. Có comment nói đây là chủ ý.

### 🟢 L16 — Token/cost hiện 3 nơi
`message-usage.tsx:16` (dưới tin nhắn), `hud/agent-hud.tsx:69,78` (thanh dưới composer),
`usage-stats.tsx:70-90` (tab Data). Cùng nguồn `usage` annotation.

### 🟢 L17 — Hai hàng hướng dẫn phím trong composer
`composer.tsx:936-938` và `:1107-1109`, hai vị trí khác nhau, cái dưới dài 5 mục ở
`text-[10.5px] text-disabled` (token thấp nhất) và chứa mục Ctrl+K không tồn tại.

### 🟢 L18 — Trộn ngôn ngữ (đã đếm đủ)
`AI INNOVATIONS`, `$ new session`, `ACT`, `idle`/`running`/`web` (`status-line.tsx:132,221`),
`Code · reported done` (`lib/evidence.ts:184-205` — cả thang 6 mức tiếng Anh),
`Năng lực chuẩn (Capable)` + 6 mục khác (`lib/routing/categories.ts:90`),
`hints loaded` (`chat-interface.tsx:248`),
`TabRuntimeMode: ${tabMode}` — **lộ tên enum nội bộ ra UI** (`chat-interface.tsx:110`),
`Subagent`/`scout`/`turns`/`tools`/`Task:`/`Result:`/`Error:` (`subagent-card.tsx`),
`planner`/`lead`/`worker` (`message-usage.tsx:29,32,33`),
`OpenTelemetry Waterfall` (`telemetry-tab.tsx:102`),
`thinking...` fallback (`message-item.tsx:20`),
`Last run receipt` (`agent-hud.tsx:37`), `Evidence status:` (`evidence-badge.tsx:52`),
`Kết quả Orchestrator` (1 từ Anh trong nhãn Việt).

### 🟢 L19 — `supportsThinkingLevel` / `supportsMediaGeneration` hardcode `return false`
`lib/provider-url.ts:86-89, 95-98`, cả hai `void baseUrl; return false;` — nhưng UI vẫn vẽ
nút điều khiển ứng với chúng.

### 🟢 L20 — Nhắc sao lưu không nhớ đã "Để sau"
Bấm "Để sau" rồi reload → nhắc lại. "Lần sao lưu cuối: chưa bao giờ". Storage meter nhảy
"2.4 MB / 10.0 GB" rồi "0%".

### 🟢 L21 — Badge "0" trên mọi session sidebar, không đổi theo nội dung.

### 🟡 L22 — Palette `/`: mô tả trùng nhau + `/cost` bị cắt khỏi danh sách
Hai lỗi chồng nhau, cùng một màn hình:
- **Mọi lệnh hiện cùng một mô tả.** `components/composer.tsx:974` hardcode
  `'lệnh · lập kế hoạch bằng planner model (PLAN mode)'` cho mọi item `kind === 'command'`.
  Nguyên nhân gốc: `lib/slash-commands.ts:37-42` — `FilterablePrompt` **không có field
  `description`**; `react/use-chat-orchestration.ts:475-480` map `BUILTIN_SLASH_COMMANDS` chỉ
  chép `name`/`syntax` → `title`/`content`/`kind`, **không chép `cmd.description`**. Mô tả đúng
  đã có sẵn ở `lib/slash-commands.ts:72-133`.
- **`/cost` không bao giờ hiện.** 9 lệnh built-in, `filterPrompts` mặc định `limit = 8`
  (`:51`), `composer.tsx:566` gọi không truyền limit → `slice(0, 8)`. `/cost` là lệnh thứ 9.
  Không có dòng báo "còn N lệnh nữa". Chạy thật: gõ `/co` thì `/cost` mới hiện — tức **phải
  biết trước tên mới tìm được**.

### 🔴 L23 — Multi-tab: refresh xong rơi vào Observer, mất khả năng gõ
Sau F5 hiện "Tab chính (Leader) bị đóng băng ở nền" / "Tab đang ở chế độ Chỉ đọc
(Observer — TabRuntimeMode: LEADER)" và phải bấm "Chiếm quyền điều khiển" mới gõ được.
Cơ chế: `react/use-agent-runtime.ts:79-103` — `acquireRuntimeLock` trả về `OBSERVER` khi
resolve trễ (`:92-94`) hoặc bị reject (`:95-97`), và `forceStealLock` cũng có nhánh set
`OBSERVER` (`:114`). State khởi tạo `'LEADER'` ở `:64` nên **UI nhảy từ LEADER sang OBSERVER
ngay trước mắt người dùng** — đúng thứ `use-agent-runtime.ts:57` đã cảnh báo là ổn định lâu.
**Cách chứng minh**: `tmp-ux/s26-close.mjs` (sau reload), `s10-more.mjs`.
Ngoài ra chuỗi thông báo lộ tên enum nội bộ ra UI (`chat-interface.tsx:110`) — xem L18.

### 🟢 L24 — Model tự nhận là Claude/Anthropic trong khi chạy `openrouter-combo`
Không có mắt thức định danh model trong system prompt, nên khi provider trả nội dung có
tự nhận, app không có gì chặn hay sửa. **Tạm đứng** — cần xác minh đây là hành vi của
provider hay rò qua prompt trước khi sửa. Có thể chèn một dòng định danh vào `composedSystem`
(`route.ts:1828-2040`).

### Ánh xạ từ số của báo cáo đợt trước

| Cũ | Mới | Trạng thái |
|---|---|---|
| B1 palette mô tả trùng | **L22** | giữ |
| B2 `/cost` bị cắt | **L22** | gộp chung |
| B3 tốn 17k token | mục 4 + **L3** | đã chốt lại: con số thật, nguyên nhân là cộng dồn nhiều step + 36 tool |
| B4 kết quả tool không hiện | **L4** | giữ |
| B5 reasoning dính đáp án | mục 2 | **RÚT — sai** |
| B6 `flushSync` | mục 2 | **RÚT — không có trong repo** |
| B7 rơi Observer | **L23** | giữ (trước đây chỉ có 1 dòng trong bảng mục 6, chưa vào danh sách lỗi) |
| B8 telemetry rỗng | **L6** | giữ |
| B9 tên session cắt cụt | **L12** | giữ |
| B10 badge "0" | **L21** | giữ |
| B11 trộn ngôn ngữ | **L18** | giữ, đếm đủ 20+ chuỗi |
| B12 model tự nhận là Claude | **L24** | giữ (trước đây không có mục) |
| B13 nhắc sao lưu | **L20** | giữ |
| B14 công tắc chết | **L19** | giữ |

---

## 4. PHÂN TÍCH CHI PHÍ TOKEN (B3 cũ — kết luận đã chốt)

Con số `↑16.077 / 16.891 / 17.053` là **thật từ provider**, không phải đếm sai:
- Fallback ước lượng của route (`route.ts:1516-1528`) chỉ là
  `JSON.stringify(messages).length / 4` với payload 8.042 byte → **≤ ~2.011 token**, không
  thể ra 16k.
- `finish` được `ai@4` phát **đúng một lần** với `combinedUsage`; route cộng dồn chỉ `finish`,
  cố ý loại `step-finish` (comment "Sửa A10"). **Không nhân 2×** — lỗi double-counting đã
  được sửa đúng.
- Nhưng `combinedUsage` **cộng `promptTokens` của mọi step** → một lượt agent N bước báo
  **N ×** kích thước request thật. 2 step × ~8.000 ≈ 16.000. Khớp.
Chênh `+814` rồi `+162` giữa các lượt = lịch sử hội thoại phình dần, nhất quán với mô hình
cộng dồn.
Nếu **L3** được sửa (chỉ gửi tool đã chọn), chi phí mỗi request giảm ~40-50%.

---

## 5. CHƯA XÁC MINH — cần người bấm tay

1. **Staging panel có mở được không.** Chip "File đã staged / 1" **đã thấy thật** trong menu
   "Tác vụ" (click chuột thật qua CDP). Nhưng panel không mở dưới input tổng hợp, và menu
   toggle không ổn định giữa các lần chạy — có thể do outside-click handler của tôi kích
   hoạt, không chắc do app. `staging-panel.tsx:58-66` có `role="dialog"` qua portal, guard
   `if (!files.length) return null`. Cần người dùng bấm tay xác nhận.
2. **Diff apply/reject** — phụ thuộc (1).
3. **Branch switcher** — cần Regenerate/Edit để tạo nhánh trước; phiên test chưa tạo được.
4. **Workspace checkpoint bar** — chưa xuất hiện (`grep` DOM: không có).
5. **MCP / tool-grants** — chỉ chạy được trong Electron; trên web UI chỉ hiện dòng báo
   không khả dụng (`mcp-settings-panel.tsx:297-307`), bảng grant luôn rỗng.
6. **`/plan` → `plan_create`** — chỉ hiện PlanPanel khi model chịu gọi tool đó.
7. **Đường emulated có đang chạy không** — cần log gateway. Cả native lẫn emulated đều ra
   ~16k khi cộng dồn 2-3 step.

---

## 6. HẠNG MỤC ĐÃ KIỂM CHỨNG (bảng)

| # | Hạng mục | Kết quả | Cách chứng minh |
|---|----------|---------|----------------|
| 1 | BYOK provider self-host | Đạt | `validateProviderBaseUrl`, UI khớp `/v1/models` |
| 2 | Streaming chat | Đạt | `s08-fresh.mjs` |
| 3 | Agent tool loop | Đạt | `s11-tools.mjs`, `s33-boost.mjs` |
| 4 | Staging Sandbox ghi đệm | Đạt | `fs_write` → `{"written":true,"staged":true}`; `kv:staging:current` |
| 5 | Export Markdown/JSON | Đạt | `s33-boost.mjs` — download thật, đúng tên file |
| 6 | Tìm kiếm sidebar | Đạt | `s10-more.mjs` |
| 7 | Giữ dữ liệu sau refresh | Đạt | `s10-more.mjs` |
| 8 | Chặn gửi tin rỗng | Đạt | `s09-edge.mjs` |
| 9 | Settings 7 tab | Đạt | `s13-settings.mjs` |
| 10 | Palette `/` | Lỗi (B1/B2 cũ) | `s14-features.mjs` |
| 11 | Multi-tab Observer | Lỗi | `react/use-agent-runtime.ts:89,96,114` |
| 12 | Kết quả tool hiển thị | **Lỗi nặng** | `s15-dom.mjs`, `s17-msgs.mjs` |
| 13 | Staging panel mở | Chưa xác minh | `s29`–`s32` |
| 14 | Branch / checkpoint | Chưa xác minh | `s33-boost.mjs` |

---

## 7. NỢ KỸ THUẬT

`react/use-chat-orchestration.ts` 6.183 dòng · `app/api/chat/route.ts` 2.683 dòng ·
`lib/agent-tools.ts` 58 KB · `lib/tool-catalog.ts` 18,7 KB / 36 tool · `lib/` 130+ file ·
`tests/` 185 file, 44.583 dòng.

---

## 8. KẾ HOẠCH SỬA — kết quả đấu thiết kế

### 8.1 Kết quả đấu thiết kế (2 agent độc lập)

Hai thiết kế **đều thoát ra cùng một kết luận về lỗi**, dù hướng khác nhau:
- Cả hai đều yêu cầu **bỏ `disabled={!hasOutput}`** (`tool-trace.tsx:226-229`). Đây là nguyên
  nhân khiến người dùng bàn phím **không đọc được nhãn tool nào đã chạy** — `disabled` khiến
  Tab bỏ qua.
- Cả hai đều yêu cầu **sửa `formatToolDetail`** chứ không chỉ dấu bệnh triệu chứng.
- Cả hai đều loại việc ẩn tool hoàn toàn: tool trace là **bằng chứng** của lượt, giấu nó là
  mất khả năng kiểm chứng.

**Chỗ hai thiết kế chệch nhau — và Design A bắt được điều Design B bỏ sót:**

> `message.parts` của `@ai-sdk/ui-utils` **CÓ** giữ thứ tự thời gian thật (`[text, tool,
> text, tool, …]`), nhưng `StoredMessage` (`lib/db.ts:76-101`) không có trường này và
> `toChatMessage` không hydrate lại. Khi `parts === undefined`, `getMessageParts` tổng hợp
> mới thành `[text, reasoning?, ...toolInvocations]` — thứ tự bị xẻe.
> ⇒ Render xen kẽ theo `parts` sẽ khiến **cùng một tin nhắn đổi hình dạng sau F5**.

Hệ quả quyết định: phương án "trục thời gian" (Design B) **không chạy được trên dữ liệu cũ**
và cần sửa server thêm mới giữ được thứ tự. Phương án "câu trả lời trên, bảng kê tool dưới"
(Design A) chạy được với mọi tin nhắn.

**QUYẾT ĐỊNH: chọn bố cục của Design A.** Ba lý do:
1. **Khớp đúng yêu cầu của bạn**: "tool sẽ hiển thị bên dưới để xem đã chạy đến phần nào".
2. Không phải sửa protocol, không phải persist gì thêm → không có đường nâng cấp nào vỡ.
3. Khi model đang chạy tool mà `m.content` rỗng, bảng kê tự nhiên nằm trên cùng; khi text đổ
   xuống, bubble chèn lên trên và bảng kê bị đẩy xuống — chuyển động chỉ là *thêm chiều cao*,
   không phải *đổi chỗ*, nên không nhấp nháy.

Bố cục chốt:
```
[ file đính kèm ]
[ OrchestratorBadge ]
[ bubble-bot — CÂU TRẢ LỜI ]        ← điểm neo, đưa lên trên
[ BẢNG KÊ: "3/7 bước" + N dòng tool ]
[ Suy luận (1 dòng, thu gọn) ]
[ usage + evidence ]
```

Mượn từ Design B: cách tính `hiddenLines` tất định không đo DOM, và nhận định phải thêm
`state: 'pending'` để phân biệt "đang chạy" với "chưa trả kết quả" (tool client-executed không
có `phase:'done'` trong request hiện tại — `route.ts:2346-2355` chỉ forward `tool_call`).

### 8.2 Các gói sửa, theo thứ tự nên làm

Mỗi gói độc lập, không gói nào sửa cùng file với gói khác trong cùng một đợt.
Mọi gói đều phải kèm test; repo không có DOM nên test theo 3 kiểu đã nêu ở mục 0.

---

**GÓI 1 — Rẻ nhất, giá trị cao nhất: `/boost` + palette + token arrows**
Sửa 4 file, độc lập, làm được ngay.

| File | Việc |
|---|---|
| `react/use-chat-orchestration.ts` | **L1** `/boost` (`:5808-5816`) — **hoặc** nối `lib/teamwork/worktree.ts` thật, **hoặc** đổi thông điệp thành đúng sự thật. Không được giữ cả hai: UI nói "cô lập" mà agent ghi thẳng workspace chính là lỗi nặng nhất trong danh sách. |
| `lib/slash-commands.ts` + `react/use-chat-orchestration.ts` + `components/composer.tsx` | **L22** — thêm `description?` vào `FilterablePrompt` (`:37-42`), chép `cmd.description` trong map (`:475-480`), render thay chuỗi hardcode (`composer.tsx:974`). Truyền limit lớn hơn 8 ở `composer.tsx:566` + báo "còn N lệnh". |
| `lib/agent-tools.ts` | **L5** — `summarizeToolArgs` `fs_list` (`:130`) đổi `??` → `||` (`path:''` nghĩa là gốc workspace). |
| `components/hud/agent-hud.tsx` | **L2** — đảo chiều mũi tên cho khớp `message-usage.tsx`. |
| `components/chat/message-usage.tsx` | **L8** — cờ `est` hiện chỉ áp cho `↓` (`use-chat-orchestration.ts:3027` set khi thiếu `completionTokens`), nên `↑` không bao giờ mang dấu `≈`. Hoặc áp cờ cho cả hai, hoặc bỏ hẳn — nhưng phải nhất quán. |

Chứng minh: gõ `/boost` → thông điệp không còn nói "cô lập" khi không có; gõ `/` thấy đủ 9
lệnh với mô tả khác nhau; so hai chỗ hiện token phải cùng chiều.

---

**GÓI 2 — Bảng kê công cụ (điểm rủi ro cao nhất, thiết kế đã chốt ở 8.1)**

| File | Việc |
|---|---|
| `components/chat/tool-trace.tsx` | File chính. Thêm tiêu đề "N/M bước". Mỗi hàng: icon trạng thái (`Loader2` / `Check` / `XCircle`) + nhãn + tham số. Bỏ `disabled={!hasOutput}` (`:226`). Thêm `aria-label` ghép `"<nhãn>, <tham số>, đang chạy\|xong\|lỗi"`. `hiddenLines` tính tất định = `body.split('\n').length - 240/16`. Nút "Xem đủ" chỉ hiện khi thật sự bị cắt. |
| `components/chat/tool-trace.tsx` | Sửa `formatToolDetail` (`:168-191`): duyệt mảng khoá theo thứ tự ưu tiên, giá trị rỗng thì **thử khoá kế tiếp**, không có gì đáng hiện thì trả `null` — tuyệt đối không in JSON thô. |
| `lib/agent-tools.ts` | Thêm `toolResultBody(name, result): string` cạnh `summarizeToolResult` (`:173`). **Không đổi chữ ký hàm cũ** — 4 call site + 4 assertion đang khoá nó. |
| `lib/tool-limits.ts` | Thêm `TOOL_PREVIEW_MAX_CHARS = 4_000`. Phải qua `redactSecretText` (`tool-limits.ts:52-67`) như `serializeToolResult`, không thì kết quả tool có bí mật lọt ra UI. |
| `components/chat/message-item.tsx` | Chuyển `<ToolTrace>` (`:374-380`) xuống **sau** bubble (`:399-415`); `ThinkingBlock` (`:382-388`) xuống dưới bảng kê. |
| `tests/tool-trace.test.ts` | **Bắt buộc sửa**: dòng 142/147/151 khoá đúng chuỗi `disabled={!hasOutput}`, `aria-expanded={hasOutput ? …}`, `useState(false)`. Sửa để khoá lại **ý nghĩa mới**, không xoá assertion. |

**Rủi ro đã biết trước**: `tests/design-system.test.ts:637` bắt mọi `border-l-2` phải có
`border-l-<màu>` **cùng variant** trong cùng chuỗi class. Viết `border-l-accent` thay vì
`border-accent` là FAIL.
**Điểm phải chốt**: "Xem đủ" có giữ `max-h-[70vh]` không. Nghiêng về **có** — một khối cao hơn
viewport làm trang hội thoại nhảy layout.

---

**GÓI 3 — Token: cắt 36 tool xuống ~10**
Sửa `app/api/chat/route.ts` **một chỗ**: `:2244-2253` đang spread toàn bộ `CLIENT_TOOL_DEFS`
vào `tools:`. `activeToolNames` đã tính đúng bằng BM25 (chọn 27/36) nhưng chỉ dùng để in
*tên* vào system prompt (`:2029`).
Ràng buộc: phải giữ `tools_search` + `tools_load` trong `tools:`, và giữ `activeSet` cho
`mcpToolList` (`:1746`) — cắt nhầm sẽ phá cả hai.
Tiếp theo: thêm `tools_search`/`tools_load` vào `TOOL_CATALOG` (đang thiếu, nên
`formatToolProtocolManual` bỏ qua chúng — `agent-tools.ts:704`; đo được manual cho 2 meta-tool
= **0 ký tự**).
Chứng minh: so `↑` của một lượt trước/sau. Kỳ vọng giảm ~40-50%.

---

**GÓI 4 — Chết và nói dối**

| File | Việc |
|---|---|
| `core/telemetry/tracer.ts` + `app/api/chat/route.ts` | L6: hoặc nối `globalTracer.startSpan()` vào vòng đời turn/tool, hoặc **xoá tab telemetry**. Để trống là lỗi. |
| `components/scheduler/scheduler-panel.tsx:74-91` | L13: web không có scheduler thì phải nói "chỉ chạy trong desktop", **không** bịa `lastStatus: 'success'`. |
| `components/composer.tsx:937` | L9: bỏ dòng `(Ctrl+K / / for Commands)` hoặc **nối** handler Ctrl+K. Không giữ hướng dẫn tới phím chết. |
| `components/composer.tsx:1090-1093` | L10: pill "Autonomous Tools Active" hiện khi policy = smart (chế độ *có* hỏi) — đổi nhãn hoặc đổi điều kiện. |
| `components/chat/message-item.tsx:447` | L7: `Code · reported done` lặp 3 bản — bỏ 1–2 bản. |

---

**GÓI 5 — Chữ và chi tiết thừa**
Dọn 20+ chuỗi tiếng Anh ở **L18**, gộp 2 hàng hướng dẫn phím (**L17**), gộp 3 nơi hiện
token (**L16**).
Chạy `tests/design-system.test.ts` sau mỗi nhóm — nó kiểm tra token.

---

**GÓI 5b — Nhỏ, độc lập, làm được trong một lượt**

| File | Việc |
|---|---|
| `lib/use-title-generator.ts` (hoặc nơi sinh tiêu đề) | **L12** — tiêu đề lấy từ chuỗi hệ thống mà `/boost` chèn vào user message nên ra *"Chế độ Boost Worktree Hãy"*. Phải cắt ở ranh giới câu và bỏ tiền tố dấu ngoặc/ngoặc vuông. Đồng thời xử lý *"Xin chào. Trả lời đúng 3 dòng." → "Xin chào Trả lời đúng"*. |
| `components/sidebar.tsx` | **L21** — badge "0" trên mọi session, không đổi theo nội dung. Hoặc bỏ hẳn, hoặc đếm thật (số tin nhắn / số tool call). |
| `components/backup-reminder.tsx` | **L20** — bấm "Để sau" rồi reload là hiện lại. Lưu mốc đã dismiss vào `kv`, tôn trọng nó. |
| `lib/provider-url.ts:86-89, 95-98` | **L19** — `supportsThinkingLevel` / `supportsMediaGeneration` cùng `void baseUrl; return false`. Hoặc xoá UI điều khiển tương ứng, hoặc triển khai thật. Đang render nút cho một hàm luôn false. |
| `components/hud/agent-hud.tsx` | **L16 (một phần)** — `turn`, `elapsedSec`, `parallelShots` luôn bằng 0 vì không có call site nào ghi (chính comment `:20` thừa nhận), in ra thành số 0 giả. Sửa: ẩn field nào chưa có nguồn. |

---

**GÓI 6 — Reasoning không mất sau reload**
`lib/chat-tree-persistence.ts:151-164` không trả `reasoning`; `StoredMessage` không có trường
này. Thêm + persist. (`StoredMessage` là bản ghi không index → không cần bump Dexie, comment
`lib/db.ts:98-99` nói rõ.)

---

**GÓI 6b — Multi-tab Observer (L23)**
`react/use-agent-runtime.ts`. Ba nhánh set `OBSERVER`: `:92-94` (resolve trễ), `:95-97`
(reject), `:114` (forceSteal). Cần một cách để người dùng **không mất khả năng gõ** khi rơi
vào Observer: hoặc tự động giành lại lock khi tab được focus, hoặc hiện nút ngay trong thanh
trạng thái thay vì banner ở giữa khung, hoặc ít nhất bỏ `TabRuntimeMode: ${tabMode}` ra khỏi
chuỗi thông báo.
Cần kiểm chứng thêm bằng 2 tab thật trước khi sửa — mục 5 nói chưa xác minh đủ.

---

**GÓI 7 — Staging entry nổi lên**
L11: chip "N file đang staged" hiện trong menu icon 32×32. Đưa ra thanh công cụ của composer
khi `stagedFileCount > 0`. **Phụ thuộc mục 5.1 (xác minh panel mở được)** — nếu panel không mở
được thì đây là lỗi nặng hơn và phải sửa trước.

---

### 8.3 Nghiên cứu tham khảo: điều bạn cần biết trước khi chốt

Nguồn: đọc **source code thật** của OpenCode TUI, Codex CLI, Cline, Claude Code (tải binary
2.1.289 grep chuỗi), tài liệu chính thức. Không đọc screenshot.

**Phát hiện quan trọng: yêu cầu "theo thứ tự thời gian" và "tool hiển thị bên dưới" XUNG ĐỘT.**

Bạn nói *"tool sẽ hiển thị bên dưới để xem đã chạy đến phần nào"*. Nhưng nếu model sinh text xen
kẽ tool, gom tool xuống đáy **phá vỡ quan hệ nhân quả** — người dùng không biết câu "tôi sẽ đọc
file X" dẫn tới lần đọc nào.

Cả **OpenCode** và **Claude Code** đều chọn **thứ tự thời gian thuần túy**:
- OpenCode: `AssistantMessage` map qua `props.parts` bằng `PART_MAPPING` — thứ tự mảng quyết
  định thứ tự hiển thị (`packages/tui/src/routes/session/index.tsx`).
- Claude Code: transcript mode (`Ctrl+O`) thêm timestamp vào **từng** assistant message —
  nếu tool gom cuối thì timestamp vô nghĩa.
- **Codex CLI** là bản tinh vi nhất: `ActivityGroup { calls, details }`, `ActivityDetails` lưu
  `(position, cell)` — position là số call đứng trước. **Compact mode** gom call thành dòng
  1 dòng liên tiếp, **expanded mode** trải detail về đúng vị trí thời gian gốc.
- Cline gom theo **loại tool**, không phải theo trên/dưới (`ToolGroupRenderer`).
- Claude Code `/focus` **có** gom — nhưng gom thành *một dòng tóm tắt kèm diffstat*, không
  phải gom các tool row.

⇒ **Đề xuất đúng nhất: làm cả hai.** Bảng kê tóm tắt có số đếm nằm dưới câu trả lời (đúng
ý bạn), nhưng **chi tiết vẫn nằm đúng chỗ thời gian của nó**. Đó chính là mô hình Codex, và
là cách hai agent lớn đã thử. Người dùng chọn được cả hai.

**5 nguyên tắc lặp lại xuyên suốt, áp dụng thẳng vào GÓI 2:**

1. **Cột icon cố định chiều rộng, trạng thái đổi bên trong — layout không được nhảy.** OpenCode
   `INLINE_TOOL_ICON_WIDTH = 2`, icon bị thay bằng spinner tại chỗ, chữ đổi màu. Comment
   `ReasoningPart`: *"Collapsed by default: a single line throughout, so the layout never
   shifts."* Layout nhảy khi trạng thái đổi là lỗi nghiêm trọng nhất về khả năng đọc.
2. **Mặc định là thu gọn.** Không agent nào show full output mặc định. Claude Code có
   `viewMode: default = truncated`; OpenCode cắt bash 10 dòng / execute 4 / generic 3;
   Codex cắt theo chiều rộng terminal; Cursor cắt từ trên.
3. **Số bị ẩn phải là con số cụ thể, không phải "…".** `1 earlier lines hidden`,
   `+N more pending`, `Called slack 3 times`, `12 tokens`. Con số biến "có gì bị bỏ" thành
   quyết định có thể đảo ngược.
4. **Trạng thái toàn cục đặt một chỗ cố định.** Cursor: *"Working status pinned above the
   prompt... stay in one stable place"* — đồng hồ không nhảy theo từng dòng tool.
5. **Phân quyền hiển thị theo mức bất định.** OpenCode chỉ ẩn tool **đã hoàn tất thành công**;
   tool đang chạy và tool lỗi luôn hiện bất kể setting. Càng bất định càng phải hiện.

**Ngưỡng "cần chú ý" — con số cụ thể từ nguồn thật:**
- Claude Code kêu chuông (screen reader) khi tool chạy **>5 giây** (`accessibility`).
- VS Code extension hiện nút "Run in background" sau **~2 giây** (`vs-code`).
Hai ngưỡng, hai mục đích khác nhau — đều hữu ích. Nên chọn một và ghi rõ.

**Hai cảnh báo cụ thể cho GÓI 2:**
- **Đừng chèn ký tự zero-width vào output.** Cursor đã phải sửa lỗi này: *"Long shell output
  no longer has zero-width spaces injected into it, so copied paths and tokens stay intact"*.
  Kỹ thuật căn chỉnh/wrap có thể phá vỡ sao chép một cách âm thầm.
- **Đừng viết 2 string literal cho cùng một sự kiện.** Codex có `… 1 earlier lines` (terminal
  hẹp) và `… 1 earlier lines hidden` (rộng) — ở terminal hẹp, đúng lúc người dùng cần biết
  nhất, label bị mất số. Claude Code sinh nhãn từ keybinding registry nên không bao giờ lệch;
  OpenCode tách logic khỏi chuỗi (`collapseToolOutput` trả cả `output` lẫn cờ `overflow`).

**Chi tiết thừa — taxonomy của OpenCode là taxonomy tốt nhất:**
| Tầng | Cách hiện | Ví dụ |
|---|---|---|
| 1 | ẩn hoàn toàn khi tắt chi tiết | OpenCode `/details` — **chỉ ẩn tool hoàn tất**, không ẩn tool đang chạy/lỗi |
| 2 | gom 1 dòng tóm tắt | Cline: `"Read 3 files, 1 folder, performed 2 searches:"`; Claude Code: `"Called slack 3 times"` |
| 3 | block đầy đủ khi có output | OpenCode `BlockTool` — **viền trái chỉ dùng cho block**, không dùng cho dòng inline |
| 4 | đẩy sau hàng gập (không xoá) | Claude Code `/focus` — giữ nguyên khả năng truy cập |

**Chưa xác minh** (nói thẳng, không đoán): glyph đầu dòng tool của Claude Code (grep binary
2.1.289 không thấy `⏺`/`⎿`/`●`/`✻` — 0 lần); màu sắc từng trạng thái tool trong TUI;
Windsurf (docs đã chuyển sang Devin); Cursor IDE (chỉ có bằng chứng về CLI, đừng suy rộng);
Continue (repo đã read-only). OpenCode chỉ đọc **TUI**, chưa xác minh bản web.

### 8.4 Ngoài phạm vi đợt này

**L24** (model tự nhận là Claude) để ngoài: cần xác minh đây là hành vi của provider hay rò qua
prompt, chưa đủ bằng chứng để sửa mù.

---

## 10. GÓI 8 — DÒNG THỜI GIAN THẬT (chuẩn Claude Code / OpenCode / Codex)

> **Đây là gói được user chỉ định làm theo chuẩn Claude Code / OpenCode.** Thay cho bố cục
> "đáp án trên / bảng kê dưới" của GÓI 2 mục 8.1. Mục 8.2 (GÓI 2) chỉ còn giữ phần
> `formatToolDetail` + kết quả tool; phần bố cục bị GÓI 8 thay.

### 10.1 Mục tiêu quan sát được

Nhìn một lượt agent là thấy **đúng thứ tự thời gian thật**: text model nói → tool chạy → kết
quả tool → text model nói tiếp. Tool nằm **ở giữa**, không phải ở đáy. Mở lại chat sau F5 thì
bố cục **không được đổi**.

### 10.2 Ràng buộc đã xác minh (đọc code thật, không đoán)

| Ràng buộc | Bằng chứng |
|---|---|
| `message.parts` của `@ai-sdk/ui-utils` **có** giữ thứ tự thật, nhưng **không được persist** | `lib/db.ts:76-101` (`StoredMessage` không có `parts`), `lib/chat-tree-persistence.ts:147-175` không hydrate. Khi `parts === undefined`, `getMessageParts` tổng hợp mới thành `[text, reasoning?, ...toolInvocations]` |
| Server **đã có** bộ đếm offset sẵn | `route.ts:1420` `let emittedChars = 0`, tăng ở `:1484` và `:1495` — cả hai đều trong `writeText`, tức đây là offset trong `message.content` |
| Chỗ ghi annotation tool | `route.ts:2360-2367` (`phase:'start'`), `route.ts:2371-2378` (`phase:'done'`) |
| Annotation đã được persist, không cần bump Dexie | `lib/db.ts:92` khai `annotations?: Array<Record<string, unknown>>` — `Record` tự do |
| Tool client-side (`fs_*`) **không có** `phase:'done'` trong cùng stream | `route.ts:2346-2355` chỉ forward `tool_call`; kết quả về ở request kế. Trạng thái "xong" đến từ `toolInvocations[i].state === 'result'`, vốn đã persist (`db.ts:300-301` chỉ loại bỏ invocation chưa có result) |
| Test đang khoá markup của `ToolChip` | `tests/tool-trace.test.ts:145,150,153` khoá đúng `onClick={() => hasOutput && setExpanded(!expanded)}`, `disabled={!hasOutput}`, `aria-expanded={hasOutput ? expanded : undefined}`, và `useState(false)` |
| `summarizeToolArgs` `fs_list` dùng `??` | `lib/agent-tools.ts:130-131` → `path: ''` lọt, không phải `'.'` |

### 10.3 HỢP ĐỒNG — phần server

**File duy nhất được chạm: `app/api/chat/route.ts`.**

Thêm **2 field** vào annotation, không đổi cấu trúc, không đổi protocol, không đụng
`writeAnnotation` (`:1441`):

```ts
// route.ts:2360 — phase 'start'
writeAnnotation({
  tool: {
    id: String((part as any).toolCallId ?? ''),
    name: part.toolName,
    phase: 'start',
    at: emittedChars,                       // MỚI: offset ký tự trong message.content
    args: summarizeToolArgs(part.toolName, (part as any).args),
  },
});

// route.ts:2371 — phase 'done'
writeAnnotation({
  tool: {
    id: String((part as any).toolCallId ?? ''),
    name: part.toolName,
    phase: 'done',
    preview: toolResultBody(part.toolName, (part as any).result),  // MỚI: body thật đã cắt trần
    summary: summarizeToolResult(part.toolName, (part as any).result),
  },
});
```

**Biên giới chốt cứng — không được lệch:**
- `at` chỉ có ở `phase:'start'`. **Không** thêm `at` vào `phase:'done'` (sẽ sai offset).
- `at` là **offset ký tự**, không phải số dòng, không phải timestamp.
- `at` phải là **số nguyên ≥ 0**. `emittedChars` có thể bằng 0 khi model gọi tool trước khi
  nói gì — đó là hợp lệ, phải giữ số 0 chứ không bỏ field.
- `preview` **bắt buộc** đi qua `redactSecretText` trước khi ghi. Xem `lib/tool-limits.ts:52-67`
  (`serializeToolResult` làm vậy) — không thì kết quả tool có bí mật lọt thẳng ra UI.
- **Không** đổi chữ ký `summarizeToolResult` (4 call site + 4 assertion ở
  `tests/agent-tools.test.ts:193-210` đang khoá).

**Rủi ro phải nêu trong báo cáo:** `at` chỉ dùng được cho tool do **server** nhìn thấy
`tool-call`. Route có nhiều nhánh `fullStream` (native + emulated) — kiểm tra cả hai đều ghi
qua cùng `writeAnnotation`. Nếu nhánh nào ghi annotation riêng thì phải thêm `at` ở đó nữa,
nếu không nhánh đó sẽ không có timeline.

### 10.4 HỢP ĐỒNG — phần dữ liệu thuần

**File duy nhất được chạm: `lib/agent-tools.ts`.**

Thêm hàm mới, **không sửa hàm cũ**:

```ts
/** Nội dung thật của tool đã bóc vỏ JSON, để người dùng mở đọc.
 *  Tách khỏi `summarizeToolResult` vì hai việc khác nhau: hàm kia là DÒNG MỘT
 *  dán trên chip (đi trong annotation, rẻ), hàm này là THÂN để mở (đắt, phải cắt trần).
 *  '' = tool không có body đáng hiện. */
export function toolResultBody(name: string, result: unknown, maxChars?: number): string
```

Bản đồ field lấy body (đọc từ shape thật `lib/fs-access.ts:289-297, 638-642` và
`lib/desktop-bridge.ts:40-62`):

| Tool | Body lấy từ |
|---|---|
| `fs_read` | `r.content` (fallback `r.description` cho ảnh) |
| `fs_list` | `r` là `FsEntry[]` → `name` + (`/` nếu `type==='dir'`) mỗi dòng |
| `fs_search` | `r` là `SearchMatch[]` → `${path}:${line}: ${text}` |
| `shell_run`, `bg_status` | `r.stdout` (kèm `r.stderr` khi có) |
| `git_diff`, `git_log` | `r` là string thô |
| `web_fetch` | `r.content` |
| `web_search` | `r.results[]` → `title — url` |
| `mcp__*` | `r.content` nếu chuỗi, không thì `JSON.stringify` |
| còn lại | `''` |

Ràng buộc bắt buộc:
- `maxChars` mặc định lấy từ hằng mới `TOOL_PREVIEW_MAX_CHARS` trong `lib/tool-limits.ts`.
  **File đó là của gói này** — thêm hằng cạnh `TOOL_RESULT_MAX_CHARS`, không sửa hằng cũ.
- Bọc `try/catch` khi `JSON.stringify` (result từ MCP có thể là object vòng — `tool-trace.tsx:95-97`
  đã có cùng một lý do cho `args`).
- Sửa `case 'fs_list'` (`:130-131`) từ `?? '.'` sang `|| '.'`.

### 10.5 HỢP ĐỒNG — phần render

**File duy nhất được chạm: `components/chat/tool-trace.tsx`.**

**B1. Mở rộng `ToolEvent` (`:30-38`)** — thêm 2 field, giữ nguyên 6 field cũ:
```ts
interface ToolEvent {
  id: string;
  name: string;
  done: boolean;
  args: string;
  summary: string;
  isError?: boolean;
  at?: number;        // MỚI — offset trong message.content
  body?: string;      // MỚI — body thật để mở đọc
}
```

**B2. `collectToolEvents` (`:50-115`)** — đọc thêm 2 field:
- Trong nhánh `phase === 'start'` (`:72`): `if (typeof tool.at === 'number') ev.at = tool.at;`
- Trong nhánh `phase === 'done'` (`:75`): `if (typeof tool.preview === 'string') ev.body = tool.preview;`
- Trong nhánh `inv.state === 'result'` (`:106`): giữ `ev.summary = inv.result` như cũ, **thêm**
  `ev.body` từ `inv.result` nếu chưa có (tool client-side không đi qua annotation `done`).
  **Quan trọng:** đây là đường duy nhất lấy được body cho `fs_*`.

**B3. Hàm thuần mới — trái tim của gói này.** Export để test được không cần DOM:
```ts
export type TimelineSegment =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; event: ToolEvent };

/** Cắt content của assistant theo offset `at` để dựng dòng thời gian.
 *  TRẢ VỀ null khi KHÔNG event nào có `at` — tức tin nhắn cũ, hoặc nhánh stream
 *  không ghi offset. Caller PHẢI rơi về bố cục cũ (bảng kê dưới). */
export function buildTimeline(
  content: string,
  events: ToolEvent[],
): TimelineSegment[] | null
```
Thuật toán, bắt buộc theo đúng thứ tự này:
1. `const positioned = events.filter(e => typeof e.at === 'number').sort((a,b) => a.at - b.at)`
2. Nếu `positioned.length === 0` → `return null`
3. Duyệt `positioned`, cắt `content` theo offset. **Ghép chuỗi text rỗng, không thêm
   segment `text` rỗng** — nếu không sẽ có khoảng trắng thừa giữa hai tool liền nhau.
4. Giữ nguyên phần text **đuôi** sau tool cuối (phần kết luận của model — thứ quan trọng nhất).
5. Các event **không** có `at` phải được đưa vào `null` hoặc gộp vào cuối danh sách —
   **không được âm thầm bỏ** (người dùng mất bằng chứng). Đề xuất: đưa vào cuối timeline.

**B4. `formatToolDetail` (`:168-191`)** — thay toàn bộ. Thuật toán mới: duyệt mảng khoá theo
thứ tự ưu tiên, giá trị rỗng thì **thử khoá kế tiếp**, hết khoá mà không có gì đáng hiện thì trả
`null`. Tuyệt đối **không trả JSON thô** — chip ghi `{"path":""}` là bug hiển thị.
Mảng khoá: `['path','filePath','file_path','targetFile','command','cmd','query','url','name','title','instructions','message','text']`.
Cắt ở 120 ký tự bằng `…`.

**B5. `ToolChip` (`:194-282`)** — 4 thay đổi bắt buộc:
1. **Bỏ `disabled={!hasOutput}` (`:228`).** Đây là nguyên nhân người dùng bàn phím **không
   đọc được** nhãn tool nào đã chạy — `disabled` khiến Tab bỏ qua. Hàng không có body vẫn là
   thông tin, phải focus được.
2. Icon trạng thái: `running` → `Loader2 animate-spin`, `failed` → `XCircle text-danger`,
   `done` → **icon của tool** nhưng chữ chuyển `text-tertiary`. Không dùng `text-disabled`
   cho icon mang thông tin (token đó chỉ **2.45:1**, fail WCAG 1.4.11).
3. Cột icon giữ **chiều rộng cố định** (`w-5`) để trạng thái đổi không làm layout nhảy —
   đây là nguyên tắc cứng của OpenCode (`INLINE_TOOL_ICON_WIDTH = 2`).
4. `aria-label` ghép: `"<nhãn>, <tham số>, đang chạy|xong|lỗi"` — không dựa vào màu, không
   dựa vào icon `aria-hidden`.

**B6. Khối kết quả (`:263-279`)** — dùng `ev.body ?? ev.summary`. Thêm dòng
`còn N dòng nữa` với `N` là **con số cụ thể** (`body.split('\n').length - 240/16`), không
phải `…`. Nút "Xem đủ" **chỉ hiện khi thật sự bị cắt**. Giữ `max-h-60` **kể cả khi mở đủ**
(`max-h-[70vh]`) — một khối cao hơn viewport làm trang hội thoại nhảy layout.

**B7. Export `ToolTrace`** — nhận thêm `content: string`. Trả về dạng timeline khi
`buildTimeline` không null; nếu null thì **render đúng bố cục cũ** (bảng kê dưới) để tin
nhắn cũ không vỡ.

### 10.6 HỢP ĐỒNG — phần ghép

**File duy nhất được chạm: `components/chat/message-item.tsx`.**

- Chuyển `ToolTrace` (`:374-380`) xuống **sau** khối bubble (`:399-415`), truyền thêm
  `content={m.content}`.
- Chuyển `ThinkingBlock` (`:382-388`) xuống **dưới cùng** (sau usage/evidence).
  Reasoning là một chuỗi phẳng không chia đoạn được, không đưa được vào timeline.
- **Khi timeline bật**: `bubble-bot` chỉ bọc phần text **đầu tiên** của timeline, các đoạn
  text sau tool nằm ngoài bubble (giữ nguyên quan niệm đã ghi ở comment `:390-398`: chỉ lời
  nói nằm trong bubble, bảng kê công việc thì không).
- **Khi timeline không bật** (tin nhắn cũ): giữ nguyên bố cục hiện tại.

**Không** đụng `components/chat/message-list.tsx` ở gói này. **Cảnh báo**: `estimateMessageHeight`
(`message-list.tsx:73-85`) ước lượng chiều cao từ `content.length` và **không biết gì về
tool**. Timeline làm chiều cao thật lệch dự đoán → virtualizer đo lại → giật layout. Phải đo
thực tế trên một lượt agent thật rồi mới quyết có sửa hay không. **Ghi vào báo cáo nếu chưa
sửa.**

### 10.7 Test bắt buộc

Không có jsdom nên test theo 3 kiểu repo đang dùng. `tests/tool-trace.test.ts` **bắt buộc sửa
dòng 145/150/153** — chúng khoá markup cũ. Sửa để khoá lại **ý nghĩa mới**, không xoá assertion.

| Test | Kiểu | Chặn cái gì |
|---|---|---|
| `buildTimeline` trả `null` khi không event nào có `at` | thuần | tin nhắn cũ vỡ layout |
| `buildTimeline` cắt đúng offset, **giữ nguyên phần text đuôi** | thuần | mất kết luận của model |
| `buildTimeline` **không** sinh segment text rỗng khi hai tool liền nhau | thuần | khoảng trắng thừa |
| `buildTimeline` **không bỏ** event không có `at` | thuần | mất bằng chứng tool |
| `buildTimeline` với `at = 0` vẫn dựng được | thuần | tool gọi trước khi model nói gì |
| `buildTimeline` sắp theo `at` tăng dần dù annotation đến lộn xộn | thuần | sai thứ tự thời gian |
| `formatToolDetail({path:''})` → `null`, **không** phải JSON thô | thuần | tái phát L5 |
| `collectToolEvents` đọc `at` và `preview` | thuần | server gửi mà client bỏ |
| `collectToolEvents` lấy `body` từ `inv.result` khi thiếu annotation `done` | thuần | tool client-side mất kết quả |
| `toolResultBody` với object vòng không throw | thuần | chết dòng tin nhắn (ErrorBoundary không bọc ToolTrace) |
| `toolResultBody` cắt trần đúng `maxChars` | thuần | phình IndexedDB |
| `summarizeToolArgs('fs_list', {path:''})` → `'.'` | thuần | tái phát chip `{"path":""}` |
| Nguồn `tool-trace.tsx` **không còn** `disabled={!hasOutput}` | regex source | tái phát L4 |
| Nguồn `tool-trace.tsx` **còn** `aria-label` ghép trạng thái | regex source | chỉ dựa vào màu |
| `route.ts` có `at: emittedChars` trong annotation `phase:'start'` | regex source | server không gửi offset |

Mỗi test phải trả lời được: **"đảo/sửa dòng nào thì test này đỏ?"** Test nào không trả lời
được thì viết lại.

### 10.8 Thứ tự làm — bỏ bước này thì các bước sau vô nghĩa

1. `lib/tool-limits.ts` (hằng) → `lib/agent-tools.ts` (`toolResultBody` + sửa `fs_list`) + test
2. `app/api/chat/route.ts` (`at` + `preview`) + test
3. `components/chat/tool-trace.tsx`: `buildTimeline` + mở rộng `ToolEvent` + `formatToolDetail` + test
4. `components/chat/tool-trace.tsx`: `ToolChip` + `ToolTrace` + sửa `tests/tool-trace.test.ts`
5. `components/chat/message-item.tsx`: ghép timeline + bố cục fallback
6. Đo `estimateMessageHeight` trên lượt agent thật, rồi mới quyết sửa `message-list.tsx`
7. `npx tsc --noEmit` + `npx vitest run` toàn bộ + so với baseline (2648 pass / 3 fail sẵn có)

### 10.9 Điều CHƯA xác minh — nêu trong báo cáo, đừng đoán

- **Nhánh emulated** có ghi annotation qua cùng `writeAnnotation` không. Nếu không, `at` sẽ
  thiếu ở nhánh đó và timeline tự rơi về bố cục cũ (fallback an toàn) — nhưng phải nói rõ.
- **Tool client-side không có `phase:'done'`**: dòng `fs_*` sẽ ở trạng thái "chưa trả kết quả"
  sau khi stream kết thúc. Cần thêm trạng thái `pending` phân biệt với `running`, nếu không
  spinner sẽ quay vô tận và nói dối người dùng. Đề xuất: khi stream đóng mà còn invocation
  `state !== 'result'` → hiện chữ "chưa trả kết quả", không spinner.
- **Số `at` có khớp `m.content` sau khi qua `stripEmulatedToolMarkup`** không — hàm đó ở
  `message-item.tsx:408` có thể đã cắt bớt text. Nếu lệch, timeline cắt sai chỗ. Phải kiểm.
- **`message.reasoning` không được persist** (L6 phụ) — reasoning sẽ biến mất sau reload
  nhưng timeline vẫn đúng. Không phải lỗi của gói này, nhưng phải nói khi bàn giao.

---

## 9. COVERAGE — mỗi lỗi đã có gói, không còn mục nào trôi

| Lỗi | Mức | Gói sửa |
|---|---|---|
| L1 `/boost` nói dối | 🔴 | GÓI 1 |
| L2 token arrows đảo chiều | 🔴 | GÓI 1 |
| L3 36 tool mỗi request | 🔴 | GÓI 3 |
| L4 kết quả tool không hiện | 🔴 | GÓI 8 (`preview` + `toolResultBody` + `ToolChip` mở được) |
| L5 `formatToolDetail` JSON thô | 🔴 | GÓI 8 (`??`→`||` ở `agent-tools.ts:130` + thuật toán mới) |
| L6 telemetry chết | 🔴 | GÓI 4 |
| L7 `reported done` lặp 3 bản | 🟡 | GÓI 4 |
| L8 cờ `≈` không nhất quán | 🟡 | GÓI 1 |
| L9 Ctrl+K trỏ tới phím chết | 🟡 | GÓI 4 |
| L10 pill "Autonomous" sai nghĩa | 🟡 | GÓI 4 |
| L11 staging entry bị chôn | 🟡 | GÓI 7 |
| L12 tiêu đề sinh từ prompt chèn | 🟡 | GÓI 5b |
| L13 scheduler báo `success` giả | 🟡 | GÓI 4 |
| L14 tool chips trùng cấp thị giác | 🟡 | GÓI 8 |
| L15 reasoning block đặt trước bubble | 🟢 | GÓI 8 (chuyển xuống dưới cùng) |
| L16 token hiện 3 nơi | 🟢 | GÓI 5 (+ GÓI 5b cho số 0 giả) |
| L17 2 hàng hướng dẫn phím | 🟢 | GÓI 5 |
| L18 trộn ngôn ngữ (20+ chuỗi) | 🟢 | GÓI 5 |
| L19 công tắc chết vẫn render | 🟢 | GÓI 5b |
| L20 nhắc sao lưu không nhớ "Để sau" | 🟢 | GÓI 5b |
| L21 badge "0" mọi session | 🟢 | GÓI 5b |
| L22 palette mô tả trùng + `/cost` bị cắt | 🟡 | GÓI 1 |
| L23 rơi Observer sau refresh | 🔴 | GÓI 6b |
| L24 model tự nhận là Claude | 🟢 | **để ngoài** — chưa đủ bằng chứng |

**Thứ tự đề xuất:** **GÓI 8** → GÓI 1 → GÓI 3 → GÓI 4 → GÓI 6b → GÓI 7 → GÓI 5b → GÓI 5 → GÓI 6.
Lý do: GÓI 8 là phần người dùng đã chỉ định làm theo chuẩn Claude Code / OpenCode; GÓI 1 rẻ và
sửa ngay ba lỗi người dùng thấy; GÓI 3 tiết kiệm tiền thật; GÓI 4 dọn nội dung nói dối;
GÓI 7 phải sau GÓI 6b vì cả hai đều về "người dùng bị chặn không làm được việc".

**GÓI 2 mục 8.2 bị GÓI 8 hủy phần bố cục.** Giữ lại đúng hai việc độc lập, không trùng với
GÓI 8: nhóm tool lặp thành 1 dòng (Design A mục 5) và sửa `estimateMessageHeight`
(`message-list.tsx:73-85`) **nếu** đo ra hiện tượng giật layout.

---

# 11. KẾ HOẠCH THI CÔNG — chạy /omni (2026-10-04)

Backup trước khi ghi: `PLAN.backup-before-omni.md` (839 dòng, giống bản gốc).

## 11.0 Baseline đo lại trên máy này (trước khi sửa gì)

| Lệnh | Kết quả đo được |
|---|---|
| `npx tsc --noEmit` | **exit 0**, sạch |
| `npx vitest run` | **2648 pass / 3 fail / 1 skip**, 182/185 file, **394.62s** |
| `npx eslint .` | **9 errors / 10 warnings** |

3 test đỏ CÓ SẴN (không liên quan, không được đụng):
- `tests/emulated-agent.test.ts:259` — `maxInFlight` kỳ vọng ≥2, đo được 1 (nhiễu tải song song).
- `tests/secret-registry.test.ts:315` — ReDoS budget 500ms, đo được 544ms.
- `tests/web-bridge.test.ts:222` — timeout 15000ms.

Xác nhận độc lập: `npx vitest run --related <file>` → `CACError: Unknown option --related`.
vitest 4.1.11 đã gỡ cờ đó ⇒ `AGENTS.md:57` sai. Vòng nhanh: `npx vitest run tests/<file>.test.ts`.

**Đường dẫn sai trong mục L18 của mục 3** (đã kiểm lại tồn tại):
`subagent-card.tsx` → `components/subagent-card.tsx` · `chat-interface.tsx` →
`components/chat-interface.tsx` · `evidence-badge.tsx` → `components/evidence-badge.tsx`.
(`status-line.tsx` thì đúng là `components/chat/status-line.tsx`.)

## 11.1 Ba phát hiện từ trinh sát làm ĐỔI cách sửa (đã tự kiểm lại bằng đọc source)

1. **`hasStoredMessageChanged` (`lib/chat-tree-persistence.ts:299-320`) là cổng thứ hai.**
   Nó so từng field tay. Thêm `reasoning` vào `StoredMessage` mà quên sửa hàm này ⇒ reasoning
   **không bao giờ được ghi**, đúng bằng chứng bug `toolInvocations` đã ghi ở `:314-318`.
   GÓI 6 phải sửa **cả hai chỗ**, không phải một.
2. **`globalTracer` là state phía TRÌNH DUYỆT** (`core/telemetry/tracer.ts:31`, mảng trong RAM).
   Span tạo trong `app/api/chat/route.ts` (server) **không bao giờ tới được tab**. Nên "nối
   `startSpan` vào route" — cách mục 8.2 gợi ý — **không chạy được**. Phải nối ở
   `react/use-chat-orchestration.ts` (client) hoặc bỏ tab. → GÓI 4 chọn **bỏ tab**, ghi lý do.
3. **`vyenDesktop()` trả về cả Web bridge** khi chạy local web (`lib/desktop-bridge.ts:642-652`).
   Nên `null` **không** có nghĩa là "trên web". `scheduler-panel.tsx:292-296` đang bật nút rồi
   mới báo lỗi. Mẫu đúng đã có sẵn trong repo: `components/tools-panel.tsx:218-225`.

## 11.2 Ba ổ khóa test đang khoá source (mọi worker phải biết)

| File:line | Khoá đúng chuỗi này |
|---|---|
| `tests/tool-trace.test.ts:142` | `onClick={() => hasOutput && setExpanded(!expanded)}` |
| `tests/tool-trace.test.ts:147` | `disabled={!hasOutput}` |
| `tests/tool-trace.test.ts:148` | `aria-expanded={hasOutput ? expanded : undefined}` |
| `tests/tool-trace.test.ts:152` | `useState(false)` cho `expanded` |
| `tests/agent-tools.test.ts:186-210` | chuỗi trả về đúng của `summarizeToolArgs`/`summarizeToolResult` |
| `tests/design-system.test.ts:637` | class đặt độ rộng viền phải có class màu **CÙNG variant** trong cùng chuỗi |

GÓI 8 cố ý đổi 4 assertion đầu ⇒ **phải sửa `tests/tool-trace.test.ts` thành khoá ý nghĩa
MỚI, không được xoá assertion.**

## 11.3 Ba sóng thi công — mỗi gói MỘT chủ file, không gói nào trùng file trong một sóng

**SÓNG 1 — GÓI 8 (dòng thời gian thật). 4 worker chạy song song.**
Hợp đồng đã viết sẵn ở mục 10.3–10.5, chữ ký chốt cứng nên 4 việc độc lập được.

| # | File duy nhất | Việc |
|---|---|---|
| 1a | `lib/tool-limits.ts`, `lib/agent-tools.ts` | `TOOL_PREVIEW_MAX_CHARS`; `toolResultBody()`; sửa `fs_list` `??`→`||` |
| 1b | `app/api/chat/route.ts` | `at: emittedChars` + `preview` trong annotation |
| 1c | `components/chat/tool-trace.tsx` | `ToolEvent` +2 field; `buildTimeline`; `formatToolDetail`; `ToolChip`; `ToolTrace` |
| 1d | `components/chat/message-item.tsx` | ghép timeline; dời `ThinkingBlock` xuống dưới cùng |

Ràng buộc sóng 1: **không ai chạm `app/api/chat/route.ts` ngoài 1b** (GÓI 3 đợi sóng 2).

**SÓNG 2 — 6 worker.**
| # | File duy nhất | Việc |
|---|---|---|
| 2a | `react/use-chat-orchestration.ts`, `lib/slash-commands.ts` | L1 `/boost` nói thật; L22 thêm `description`; L12 tiêu đề session |
| 2b | `components/composer.tsx` | L22 render mô tả + "còn N lệnh"; L9 Ctrl+K; L10 pill; L11 staging chip; L17 gộp hàng |
| 2c | `components/hud/agent-hud.tsx`, `components/chat/message-usage.tsx` | L2 đảo mũi tên; L8 cờ `≈`; L16 ẩn số 0 giả |
| 2d | `app/api/chat/route.ts`, `lib/tool-catalog.ts` | GÓI 3: lọc `tools:` theo `activeToolNames`; thêm meta-tool vào catalog |
| 2e | `lib/db.ts`, `lib/chat-tree-persistence.ts` | GÓI 6: persist `reasoning` (cả `toChatMessage` **và** `hasStoredMessageChanged`) |
| 2f | `react/use-agent-runtime.ts` | GÓI 6b: rơi Observer sau refresh |

**SÓNG 3 — 3 worker.**
| # | File duy nhất | Việc |
|---|---|---|
| 3a | `core/telemetry/tracer.ts`, `components/settings/telemetry-tab.tsx`, `components/scheduler/scheduler-panel.tsx`, `eslint.config.mjs`, `components/chat/message-item.tsx` | GÓI 4: L6, L13, L7 |
| 3b | `lib/use-title-generator.ts`, `components/sidebar.tsx`, `components/backup-reminder.tsx`, `lib/provider-url.ts` | GÓI 5b: L12, L21, L20, L19 |
| 3c | `lib/evidence.ts`, `lib/routing/categories.ts`, `components/chat/status-line.tsx`, `components/subagent-card.tsx`, `components/chat-interface.tsx`, `components/evidence-badge.tsx` | GÓI 5: L18 |

**Cố ý gộp theo FILE, không theo số gói trong PLAN**, vì luật omni là "không hai gói sửa
cùng một file". Mỗi lỗi L vẫn được xử lý đúng một lần; bảng coverage mục 9 không đổi.

## 11.4 Ngoài phạm vi có chủ đích

L24 (model tự nhận Claude) · `estimateMessageHeight` (`message-list.tsx:73-85`, đo sau sóng 1
rồi mới quyết) · mục 5 (7 hạng mục chưa xác minh, cần bấm tay) · GÓI 3 phần "đo `↑` thật"
(cần provider thật).
