# PLAN.md — Sửa 6 lỗi đã kiểm chứng + 1 cải tiến từ ZCode

Bối cảnh: hai đợt khảo sát (`pandas-ai`, `ZCode`) không tìm ra tính năng nên đem
port. Chúng chỉ phát hiện ra **lỗi có sẵn trong vyen**. Đợt này sửa các lỗi đó.

Plan cũ (đánh giá UX 2026-10-04) đã lưu ở `PLAN.backup-before-codemode-fixes.md`.

Nguyên tắc: **không sửa gì chưa tái hiện được.** Mỗi lỗi dưới đây đã có probe
chạy thật; output được dán kèm.

---

## 0. BASELINE (đã chạy, chưa sửa gì)

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npx vitest run` | **5 failed / 3542 passed / 1 skipped**, 219 file, 886s |

5 test đỏ **có sẵn**, không liên quan đợt này:
`tests/secret-registry.test.ts` (ReDoS lookahead), `tests/web-bridge.test.ts`.
Plan cũ ghi "3 test đỏ" — con số đó đã cũ.

**Đừng chạy `--reporter=basic`** — vitest 4 không resolve được, rơi về
`ERR_LOAD_URL`. Dùng reporter mặc định.

Vòng lặp nhanh: `npx vitest run tests/<file>.test.ts`. `AGENTS.md:57` bảo dùng
`--related`, nhưng vitest 4 đã gỡ cờ đó — dùng `npx vitest related <file> --run`.

---

## 1. Vấn đề gốc: `node:vm` KHÔNG phải sandbox

`lib/mcp/code-mode.ts:84-106` nạp **intrinsic thuộc realm host** (`Object`,
`Array`, `Math`, `Promise`, `setTimeout`…) vào context. Bất kỳ intrinsic nào
cũng mở đường tới host qua `.constructor`.

**Probe đã chạy** (Node v24.18.0), dựng đúng shape sandbox của `code-mode.ts`:

```
A: Object.constructor escape        => ESCAPED, typeof: object
B: mcp.call.constructor escape      => ESCAPED, typeof: object
C: setTimeout.constructor escape    => ESCAPED, typeof: object
D: reach child_process              => ESCAPED, typeof: function
E: reach fs                         => ESCAPED, typeof: function
F: control: bare empty context      => BLOCKED: SyntaxError
```

Case F là bằng chứng nguyên nhân: context trống **không** thoát được. Chỉ có
vì ta nạp intrinsic host vào mới hỏng.

**Đã thử và THẤT BẠI — đừng làm lại:** `vm.createContext(s, {codeGeneration:
{strings:false}})` **không** chặn được. Probe:

```
=== codeGeneration.strings=false ===
  mcp.call.constructor    => object   (vẫn ESCAPE)
  direct Function         => THREW:EvalError
```

Nó chặn `Function()`/`eval` gọi trực tiếp trong context, nhưng **không** chặn
`.constructor` của hàm host — vì `Function` đó thuộc realm host, ngoài tầm với
của context. Còn `mcp.call` và `setTimeout` là **hàm của host** nên `.constructor`
của chúng vẫn là `Function` host.

Hệ quả: code model viết trong code-mode đọc/ghi file và spawn tiến trình được
với **đầy đủ quyền main process** (bridge token, secure store, credential MCP),
bỏ qua cả approval của MCP lẫn allowlist trong `lib/shell-policy.cjs`.

---

## GÓI A — `lib/mcp/code-mode.ts` (file hub, Leader tự làm)

### A1. Vá escape — dựng bridge BÊN TRONG sandbox, hàm host chỉ là tham số

Nguyên tắc: **không được đưa object/function thuộc realm host vào context.**
Hàm host chỉ được tồn tại dưới dạng **tham số** (biến cục bộ) của một hàm
sandbox — closure không phải own property nên `.constructor` soi không ra.

**⚠️ CÁCH SAI ĐÃ THỬ VÀ BỊ BẮC — đừng dùng:** gọi factory từ host rồi gán kết
quả vào context (`const bridge = factory(...)` → `globalThis.mcp = bridge`).
Probe cho thấy `mcp.call.constructor` **vẫn ESCAPE**: object đi từ host vào
sandbox qua đường đó không qua được boundary, `.constructor` lại là
`Function` của host.

**Cách đúng — tạo VÀ gán global đều bên trong sandbox:**

```
const ctx = vm.createContext({});                 // KHÔNG nạp intrinsic host
const install = vm.runInContext(
  `(function (hostCall, hostLog, hostSetTimeout, hostClearTimeout) {
     const bridge = {
       call: async function (s, t, a) { return await hostCall(s, t, a); },
       log:  function () { hostLog.apply(null, arguments); },
     };
     globalThis.mcp     = bridge;
     globalThis.console = { log: bridge.log, info: bridge.log, warn: bridge.log, error: bridge.log };
     globalThis.setTimeout    = function (fn, ms) { return hostSetTimeout(() => fn(), ms); };
     globalThis.clearTimeout  = function (t) { return hostClearTimeout(t); };
   })`,
  ctx,
);
install(mcpCaller, captureLog, setTimeout, clearTimeout);  // 4 hàm host chỉ là tham số
```

**Probe đã chạy trên đúng cách này** — 12/12 chặn, đo bằng cách thử lấy
`process.pid` của host chứ không đo `typeof`:

```
HOST process.pid = 9660   <-- nếu probe in ra số này là ESCAPED

  Object.constructor              => BLOCKED:ReferenceError
  mcp.call.constructor (async)    => BLOCKED:ReferenceError
  console.log.constructor         => BLOCKED:ReferenceError
  setTimeout.constructor          => BLOCKED:ReferenceError
  clearTimeout.constructor        => BLOCKED:ReferenceError
  Function trực tiếp             => BLOCKED:ReferenceError
  arrow.constructor               => BLOCKED:ReferenceError
  mcp.log.constructor             => BLOCKED:ReferenceError
  process.pid trực tiếp           => BLOCKED:ReferenceError
  globalThis.process              => undefined   (không tồn tại trong sandbox)
  require                         => undefined   (không tồn tại trong sandbox)
  process.getBuiltinModule("fs")  => BLOCKED:ReferenceError

  chức năng sau khi vá:  mcp.call ✓   setTimeout ✓
```

**Bẫy khi tự viết probe:** `mcp.call.constructor` là `AsyncFunction`, gọi nó trả
**Promise** nên `typeof` ra `"object"` — dễ bị kết luận nhầm là ESCAPED. Phải
`await` rồi mới so với `process.pid`.

Tiêu chí "xong": `npx vitest run tests/code-mode-escape.test.ts` với 12 case
trên. Nếu bất kỳ case nào lấy được `process.pid` → **dừng**, chuyển A1b.

### A1b. Dự phòng — worker thread (chỉ khi A1 thất bại)

`node:worker_threads`. Worker là isolate riêng, không chạm được realm host.
Phải chuyển `mcpCaller` qua message port, nên **thay đổi lớn hơn nhiều** và
đụng `lib/bridge/server-bridge.ts`. Chỉ làm khi A1 không giữ được, và phải báo
user trước vì nó đụng file ngoài gói A.

### A2. Timeout phải thực sự dừng sandbox

Lỗi: `Promise.race` (`:126-137`) trả lỗi cho caller nhưng **không huỷ context**.
**Probe đã chạy:**

```
caller saw "TIMEOUT" at ~1011ms and returned
t+0ms    firedAt = 710
t+1.2s   firedAt = 710   <-- SANDBOX STILL RUNNING AFTER CALLER RETURNED
```

Cách sửa (giữ trong `node:vm`): theo dõi mọi timer đã đăng ký qua wrapper ở
A1; khi hết thời gian thì `clearTimeout` hết + set cờ `cancelled` để mọi lời
gọi `mcp.call` sau đó bị từ chối.

**Phải nói thẳng trong báo cáo:** đây là **giảm thiểu**, không phải dừng cứng.
Script vẫn có thể chạy nền nếu nó tự dựng vòng lặp promise không dùng timer.
Dừng cứng thật sự chỉ có ở A1b.

### A3. `returnValue` không bị cắt trần

`code-mode.ts:164` trả `rawResult` **nguyên vẹn**, chỉ `combinedOutput` mới đi
qua `truncateCodeOutput` (`:159`).

**Đã đọc xác nhận đường nối:** `react/use-chat-orchestration.ts:1564`
`return JSON.stringify(res)` — stringify **cả object kết quả**, nên
`returnValue` nằm trong chuỗi đó và **bypass trần 24.000 char**.

Sửa: cắt trần `returnValue` qua cùng `truncateCodeOutput`. Cân nhắc bỏ luôn
`returnValue` khỏi object trả về (model chủ yếu đọc `output`) — nhưng đó là
thay đổi API, cần hỏi trước.

### A4. `run_code` chưa nằm trong `isEgressTool`

`lib/taint-tracker.ts:160-180` — đã đọc toàn bộ hàm, nó chỉ kiểm
`web_*`, `mcp__*`, `git_push`, `shell_run` (và nội dung lệnh của `shell_run`).
**Không có `run_code`.**

Hệ quả: Egress Guard (`lib/auto-pilot.ts:283`) không bắt buộc hỏi khi lượt đã
bị taint mà chạy code — mà code-mode có thể gọi MCP server bất kỳ qua
`mcp.call`.

Sửa: thêm `run_code` vào danh sách. Kiểm tra không phá: `tests/taint-tracker.test.ts`.

**Lưu ý khi sửa:** `isEgressTool` nhận cả `args`. Với `run_code` phải xét args
là `{code: string}` — một tool khác với `shell_run` vì không có `command` để
so khớp chuỗi. Không copy nguyên logic `cmd.includes('push')`.

### A5. Test bắt buộc

`tests/code-mode-escape.test.ts` — **file mới, chỉ gói A được chạm**:

| Test | Chứng minh |
|---|---|
| escape qua `Object.constructor` | BLOCKED |
| escape qua `mcp.call.constructor` | BLOCKED |
| escape qua `setTimeout.constructor` | BLOCKED |
| đọc được `process.getBuiltinModule('fs')` | BLOCKED |
| `mcp.call` **vẫn gọi được** bridge thật | **không hỏng chức năng** |
| `console.log` vẫn ra output | không hỏng |
| timer sau timeout **không** được chạy | A2 có tác dụng |
| `returnValue` > 24k bị cắt | A3 |

Test hiện có ở `tests/code-mode.test.ts` (6 test) phải **giữ xanh** — nếu
A1 làm rỏng API thì đó là hồi quy, phải sửa cách chứ không sửa test.

Lệnh: `npx vitest run tests/code-mode.test.ts tests/code-mode-escape.test.ts`

---

## GÓI B — `lib/emulated-agent.ts` (không đụng gói A)

**Lỗi:** `lib/emulated-agent.ts:379` và `:496` gọi
`toolDef.execute(call.args as never, {} as never)` — **không validate args**.

**Phạm vi hẹp hơn nhiều so với tưởng — đã kiểm chứng bằng chạy thật:**
`opts.tools` là `AgentToolSet = ReturnType<typeof buildAgentTools>`, và
`buildAgentTools([])` chỉ trả về **3 key**: `web_search`, `web_fetch`,
`memory_save`. `fs_*` / `shell_*` / `git_*` là **client tool**, đi đường
`clientTools` / `resolveClientTool` (`lib/emulated-agent.ts:224-241`), không
chạy qua chỗ `as never` này. Nên lỗi chỉ ảnh hưởng 3 server tool + MCP tool
qua `extraToolDocs` — vẫn đáng sửa, nhưng đừng hình dung là toàn bộ toolset.

**Đã xác nhận `parameters` là zod thật lúc runtime** (không phải suy luận):
AI SDK `tool()` là hàm nhận dạng (`node_modules/ai/dist/index.mjs:7224`
→ `function tool(tool2) { return tool2; }`), nên `.parameters` được giữ nguyên.
Chạy thật: `buildAgentTools([]).web_fetch.parameters.safeParse({totally:'wrong'})`
→ `{"success":false, ... "path":["url"] ... "name":"ZodError"}`. `CLIENT_TOOL_DEFS`
là **record** (33 key), không phải array, và `fs_read.parameters.safeParse` cũng là
hàm.

Sửa: parse `call.args` qua `toolDef.parameters.safeParse()` trước khi execute
(guard `typeof toolDef.parameters?.safeParse === 'function'` cho MCP tool mô tả
dạng `extraToolDocs` không có schema zod), sai thì trả lỗi có nội dung thay vì
im lặng.

**Tiêu chí "xong":** thêm test — `web_fetch` với args thiếu `url` → không gọi
`execute`, trả lỗi nêu rõ field sai.

---

## GÓI C — `lib/cli/recipe-runner.ts` (độc lập B)

**Lỗi 1:** `recipe-runner.ts:245` `processStructuredOutput(finalText, undefined)` —
hardcode `undefined` nên **CLI không bao giờ validate theo schema**. Chỉ đường
browser làm (`react/use-chat-orchestration.ts:5691`).

**Lỗi 2:** `:249-251` khi validate fail vẫn phát `ok: true` với text thô →
CI đọc `--output json` sẽ coi rác là pass.

Sửa:
- `emitResult` (`:233`) **không nhận** recipe. Thêm tham số `schema`.
- Hai call site `:213` và `:217` truyền `recipe.response?.json_schema`
  (đường đúng: `lib/recipes/schema.ts:110-115`).
- Khi `structured.ok === false` mà có schema → phát `ok: false` kèm `errors`.

**Tiêu chí "xong":** recipe có `response.json_schema`, chạy CLI với output sai
kiểu → phải ra `ok:false`. Chạy thật:
`npx tsx bin/vyen.ts <recipe.yaml> --output json`.

---

## GÓI D — cải tiến lấy từ ZCode (làm SAU A/B/C, chỉ khi user đồng ý)

**Vấn đề:** `lib/context-compaction.ts:157` chỉ nhớ *đường dẫn* file đã đọc.
Nội dung file mất khi compact. Tệ hơn: block đó chỉ đưa tới **summarizer**
(`react/use-chat-orchestration.ts:3515-3541`), **không bao giờ** tới context
của agent — `/api/chat` chỉ nhận `contextSummary` + `compactBoundaryId`.

**Ý tưởng ZCode** (`compact-post-reminders.ts:22-24`): inject lại *nội dung*
file đã đọc, xếp hạng theo độ mới, có ngân sách token; file quá to thì hạ
thành *reference* thay vì bỏ.

Ước lượng ~50 dòng + read-cache có giới hạn. **Cần `messageId` trong
`WorkspaceSnapshot`** (`lib/db.ts:161-174` hiện không có) thì mới gắn được
"file nào đọc ở lượt nào".

Việc này **chưa nằm trong phạm vi sửa bug**. Chỉ làm khi user yêu cầu.

---

## GÓI E — vệ sinh repo (chọn, làm cuối)

1. `tests/*.cjs` — **1.214 dòng** assertion bảo mật
   (`phase1-security-verification.cjs` 654, `sprint-s1` 283, `sprint-s2` 277).
   Không file `.test.ts` nào match, không npm script nào chạy.
   → Rẻ nhất: thêm 1 script `"verify:security"`, không đổi tên file.
2. **35/219 file test chưa git track.** CI từ clone sạch chỉ thấy 184.
   → Commit hoặc xác nhận là bỏ.
3. 5 test đỏ ở mục 0 — **có sẵn, không sửa trong đợt này** trừ khi user yêu cầu.

---

## THỨ CỐ TÌNH KHÔNG LÀM

Các ý từ ZCode đã bị bác — không đưa vào plan:
- Architecture gate (649 dòng, 2 rule chết vì `policy.mjs:152` chỉ resolve
  import tương đối, không enforce ở đâu vì không có CI/hook).
- Bash AST parser — `lib/shell-policy.cjs` đã chặt hơn, AST là hồi quy.
- `zcode-cua` — package stub, mọi hàm throw `unavailable`.

---

## THỨ TỰ VÀ ĐIỀU KIỆN DỪNG

1. A1 (escape) → dừng ngay nếu probe vẫn ESCAPE, hỏi user trước khi làm A1b.
2. A2, A3, A4 → độc lập, làm song song được.
3. B, C → độc lập nhau.
4. D, E → chờ user.

Sau mỗi gói: `npx tsc --noEmit` + `npx vitest run <file liên quan>`.
Trước khi trả: full `npx vitest run`, đối chiếu mục 0 — **không được có test nào
xanh → đỏ**.

---

# PHẦN BÀN GIAO — 2026-10-04 (đợt UX trước, đã dừng giữa chừng)

> Mục trên là plan đang chạy. Phần này là **bàn giao việc còn dang dở** của đợt
> sửa UX trước đó, ghi lại để phiên sau không phải dò lại. Không ghi đè phần trên.

## B1. Trạng thái lúc dừng (đã kiểm chứng lại)

| Mốc | Kết quả |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npx eslint .` | **0 errors / 10 warnings** (baseline: 9 errors / 10 warnings — 9 lỗi `react/display-name` trong `temp-test-profile/**` đã được ignore) |
| Test các file vừa sửa dở | 173/173 xanh |
| Full suite | 3542 pass / 3 fail (đo TRƯỚC các sửa cuối cùng). 3 fail đỏ là **nhiễu tải có sẵn**: `tests/secret-registry.test.ts` (ngân sách ReDoS 500ms, chạy riêng xanh 47/47 ba lần), `tests/web-bridge.test.ts` (timeout 15s, xanh khi chạy riêng). Cả 4 file này **không bị đụng tới** — `git status --porcelain` rỗng |

Cây đang **sạch, có thể để nguyên**. Hai agent bị dừng giữa chừng nhưng code của
chúng compile và test xanh.

## B2. 🔴 ĐÍNH CHÍNH: tôi đã nói SAI về shell/git — đừng làm theo hướng đó

Tôi từng báo *"shell/git trả `shellRun adapter chưa được cấu hình`, thiếu adapter
trong `new ToolRunner`"*. **Sai.** Agent đã từ chối xây trên tiền đề đó và chứng minh:

- **`ToolRunner` là code CHẾT.** `components/chat-interface.tsx:87` dựng ra rồi
  không ai dùng; `executeClientToolGate` (`:34`) có 0 importer; `orch.toolRunner`
  (trả về ở `use-chat-orchestration.ts:6144`) không nơi nào đọc. `executeTool`
  chỉ được gọi từ chính hàm mồ côi đó (`chat-interface.tsx:64`).
- Chuỗi `"shellRun adapter chưa được cấu hình."` (`tool-runner.ts:712`) **không bao
  giờ xuất hiện khi app chạy**, và không có trong `.vyen/audit/`.

**Đường thực thi thật** là `rawHandleClientToolCall`, đã có arm chạy được cho cả 9
tool: `use-chat-orchestration.ts:2020` (`shell_run`), `:2100` (`bg_run`), `:2148`
(`git_status`), `:2179` (`git_commit`).

### Nguyên nhân thật khiến model đốt token

Trên **web**, model vẫn được gửi `shell_run`/`git_*` trong `tools:`
(`app/api/chat/route.ts:2386` — `CLIENT_TOOL_DEFS` chỉ bị lọc theo plan-mode /
recipe / router, **không** theo môi trường), nhưng mọi lời gọi đều trả:

> `use-chat-orchestration.ts:1614` — *"Tool này chỉ khả dụng trong Vyen desktop (Electron)."*

Vòng lặp vô hạn vì `lib/client-doom-loop.ts:78-84` **chỉ chặn chuỗi giống hệt liên tiếp**
(`recent[i] !== signature → break`). Model thử `git status` → `./vite.config.ts` →
`git log --oneline` … mỗi biến thể là một chữ ký khác, không bao giờ chạm ngưỡng.
Đúng triệu chứng: một lượt đốt `↑65646` token.

**Hướng sửa đúng (chưa làm):** không khai báo tool mà môi trường không chạy được —
khớp luật antislop R-26 "control phải có hành vi thật, nếu không thì đừng có".
Cần sở hữu `app/api/chat/route.ts` + `lib/agent-tools.ts`. Client đã biết mình là
web hay desktop (`vyenDesktop()` / `isVyenDesktop()`), nên cần một cờ môi trường
gửi kèm request để route lọc `tools:`.

## B3. ToolRunner chết — nên xoá hay nối?

Hai lựa chọn, chưa quyết:
- **Xoá** `core/agent-runtime/tool-runner.ts` + 2 chỗ dựng: gỡ bẫy, bỏ một
  triển khai thứ hai chỉ có thể lệch với `rawHandleClientToolCall`.
- **Nối**: giữ nhưng dựng thêm đường thực thi thứ hai — tệ hơn.

Docstring của `bg_run` (`tool-runner.ts:741-762`) đã tự thừa nhận enforcement của
 nó không nằm trên đường chạy thật.

## B4. Việc còn dở (2 agent bị dừng giữa chừng — code đã vào, chưa verify đầy đủ)

### B4.1 Dập nháy tool + chữ (`components/chat/message-item.tsx`, `components/chat/tool-trace.tsx`)
Nguyên nhân đã xác định: `buildTimeline` chạy **hai lần mỗi render** (một ở
`message-item.tsx`, một ở `tool-trace.tsx`), mỗi lần filter + sort + slice toàn bộ
nội dung — và `MessageItem` render lại **mỗi token**. Lượt quan sát được: 68 tool.

Đã vào một phần (chưa verify xong): `ToolTrace` nhận prop `timeline?` (`tool-trace.tsx:876`),
có `React.memo`. **Còn phải làm:** bảo đảm bubble và ToolTrace dùng **cùng một**
lệnh `collectToolEvents(annotations, invocations, streaming)` — lệch 2-vs-3 tham số
làm hai bên lệch cờ `abandoned`. Test mới `tests/tool-trace-render-cost.test.ts` (22 test) xanh.

### B4.2 Slash command (`lib/slash-commands.ts`, `components/composer.tsx`, `components/settings/slash-commands-section.tsx`)
Đã vào một phần: `argumentHint?: string` trên `SlashCommandDef` (`slash-commands.ts:31`),
kèm `argumentHintFromSyntax` tự suy ra từ `syntax`.
**Còn phải làm — so với Claude Code v2.1.288 (đã đọc binary + docs thật):**

| Việc | Claude Code | Vyen hiện tại |
|---|---|---|
| 🔴 Enter gõ sai vẫn chạy lệnh khác | Từ v2.1.236 bỏ hẳn: Enter gửi nguyên chữ, lỗi hiện ra | `composer.tsx:~821-826` luôn áp dụng `slashMatches[slashIndex]` → gõ `/plna` chạy `/plan` |
| 🔴 Draft bị nuốt khi lệnh sai | Trả lời *"Unknown command: /hepl. Did you mean /help?"*, **không bao giờ xoá input** | `use-chat-orchestration.ts:5868-5871` và `:5981-5984` `return false` sau toast → mất sạch |
| 🟡 Gợi ý "did you mean" | Có | Chưa có; `filterPrompts` đã có danh sách có điểm → gần như miễn phí |
| 🟡 Mất tham số lệnh tuỳ biến | Nội suy `$ARGUMENTS` | `custom_recipe` parse `args` rồi **vứt** (`lib/slash-commands.ts:227`) |
| 🟡 Đụng tên lệnh | Có bảng ưu tiên, cảnh báo | Custom `/plan` → hai hàng giống hệt, parser vẫn route về builtin |
| 🟡 Chặn tên reserved | Regex `^[A-Za-z_][A-Za-z0-9_-]{0,31}$` | Đã có luật cho skill tại `lib/skills/disk.ts:72` — **dùng lại**, đừng chế luật thứ hai |

Còn dở trong B4.2: validate tên trong `components/settings/slash-commands-section.tsx`
(chưa thấy dấu hiệu đã làm), cờ `argumentHint` ở phía **producer**
(`use-chat-orchestration.ts:~475-481`, map `BUILTIN_SLASH_COMMANDS` → palette item).

**Hai chỗ Vyen đang TỐT HƠN Claude Code — đừng sửa ngược:**
- Palette giới hạn 20 + dòng *"còn N mục nữa"*; Claude Code **không tài liệu hoá**
  chuyện cắt bảng. Giữ nguyên.
- `filterPrompts` cố ý **không** khớp theo `description` (`lib/slash-commands.ts:35-38`).

## B5. Việc chưa làm, cần user quyết

1. **Tab "Đo đạc"** — user chọn **giữ lại** để theo dõi token. Hiện vẫn rỗng vĩnh viễn
   vì không dòng nào gọi `globalTracer.startSpan()`. Tracer là state **phía trình
   duyệt** (`core/telemetry/tracer.ts:31`), nên phải nối ở `react/use-chat-orchestration.ts`,
   **không** được ở route (server). Cần span theo turn + theo tool call.
2. **Gói wiring shell/git + approval** — đã dừng, **không nên làm** (B2). Đường thật
   đã có approval sẵn qua `rawHandleClientToolCall`.
3. **`lib/emulated-agent.ts` chưa có `at`/`isError`** — `phase:'start'` ở `:387,420,461,490`,
   `phase:'done'` ở `:393,447,470,503`. Đường emulated rơi về bố cục cũ (fallback an toàn,
   đã có test canh). Nối thì cần đưa offset qua `opts.onAnnotation`.
4. **`estimateMessageHeight`** (`message-list.tsx:73-85`) — chưa đo được trên lượt thật
   nên chưa sửa. **Cần mở app và đo một lượt agent dài**, không suy đoán bằng lý thuyết.
5. **`next-env.d.ts` và `.vyen/audit/anchor.log`** đang bị sửa bởi `next dev` / test run,
   không phải sửa tay. `next-env.d.ts` tự sinh lại; `anchor.log` là dữ liệu audit thật —
   **đừng revert `anchor.log`**.
6. **`tmp-ux/` đã xoá** (72 file, 1.8 MB) theo yêu cầu.

## B6. Bẫy cần nhớ cho phiên sau

- **File trên đĩa là CRLF** (`core.autocrlf = true`, không có `.gitattributes`). Test đọc
  source bằng regex phải `.replace(/\r\n/g, '\n')` trước, nếu không xanh ở máy này,
  đỏ ở CI. Chỉ `tests/run-wiring.test.ts:34` làm đúng từ đầu.
- **Comment tiếng Việt trong source chứa đúng các từ khoá cần grep.** Đếm CALL STATEMENT
  hoặc dùng anchor nhiều dòng, đừng `split()` một từ rời.
- **`vitest --related` không tồn tại** ở vitest 4.1.11 (`CACError: Unknown option`).
  Subcommand `npx vitest related <files> --run` thì có và chạy thật.
- **Repo không có DOM test env** (`vitest.config.mts:11` `environment: 'node'`),
  `include: ['tests/**/*.test.ts']` nên file test `.tsx` bị **bỏ qua im lặng**.
- **`PLANS_TUTORIAL`/`DESIGN.md` là hợp đồng thiết kế có test canh** —
  `tests/design-system.test.ts` (1043 dòng, 53 file) chặn sai lệch token.
  `components/composer.tsx` mỗi chạm vào phải giữ `max-w-thread`, `px-5`.
- **Sáu git worktree cũ** từ một lần chạy test teamwork đã làm hỏng lint + test. Đã prune.
  Nếu test đỏ bất thường kiểm `git worktree list` trước khi đi tìm lỗi code.
- **`tests/secret-registry.test.ts` và `tests/web-bridge.test.ts` đỏ theo tải máy** —
  không sửa chúng, chạy riêng để xác nhận.