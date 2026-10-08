# TÀI LIỆU THIẾT KẾ KIẾN TRÚC MÃ NGUỒN UI & FRONTEND (TSX) — DỰ ÁN VYEN
> **Phiên bản**: v6.0 (Đồng bộ tuyệt đối sau Phase 6: OS-Level Sandboxing, CapBAC Subagent Mesh, Hardware Keyring & Standby OPFS, 65 file TSX, 183 test files — xem §3, §4, §6)  
> **Cập nhật lúc**: 2026-09-26 (Phase 5: Direct Node bypass, Storage Fencing, Zombie cleanup, Dedicated Web Worker, SQLite WASM, OpenTelemetry Waterfall, 65 files TSX)  
> **Mục đích tài liệu**: Cung cấp bản đặc tả kỹ thuật toàn diện, tuyệt đối chính xác về thiết kế mã nguồn, cấu trúc Component, luồng dữ liệu (Data Flow), cơ chế quản lý trạng thái (State Management), cơ chế an toàn duyệt mã (Human-in-the-Loop & Guardrails) của toàn bộ **68 file `.tsx`** (tổng cộng **17,941 dòng code** loại trừ trailing newlines, tương đương **18,009 dòng** khi tính cả dòng rỗng cuối file) trong dự án Vyen. Tài liệu này được thiết kế chuyên biệt để các hệ thống AI (Claude, GPT, Gemini...) phân tích, phản biện kiến trúc và đánh giá chất lượng kỹ thuật mà không cần truy cập trực tiếp vào hệ thống file.

---

## MỤC LỤC
1. [Tổng Quan Kiến Trúc Hệ Thống (Architectural Overview)](#1-tổng-quan-kiến-trúc-hệ-thống)
2. [Sơ Đồ Phân Cấp Component & Luồng Dữ Liệu (Hierarchy & Data Flow)](#2-sơ-đồ-phân-cấp-component--luồng-dữ-liệu)
3. [Bảng Chỉ Mục Toàn Bộ 65 File TSX Theo Module](#3-bảng-chỉ-mục-toàn-bộ-65-file-tsx-theo-module)
4. [Đặc Tả Chi Tiết 65 File TSX Theo 8 Module & Nâng Cấp Trọng Yếu](#4-đặc-tả-chi-tiết-65-file-tsx-theo-8-module--nâng-cấp-trọng-yếu)
   - [Module 1: Next.js App Router Root Layer (4 files)](#module-1-nextjs-app-router-root-layer)
   - [Module 2: Core Orchestration & Chat Controller (5 files)](#module-2-core-orchestration--chat-controller)
   - [Module 3: Virtualized Message Tree & Presentation (10 files)](#module-3-virtualized-message-tree--presentation)
   - [Module 4: Rich Content, Markdown & Code Rendering (3 files)](#module-4-rich-content-markdown--code-rendering)
   - [Module 5: Human-in-the-Loop, Guardrails & Sandboxing (6 files)](#module-5-human-in-the-loop-guardrails--sandboxing)
   - [Module 6: Autonomous Agent Panels & Workflows (7 files)](#module-6-autonomous-agent-panels--workflows)
   - [Module 7: Unified Settings System — 7 Domains (21 files)](#module-7-unified-settings-system--7-domains)
   - [Module 8: System Infrastructure, Feedback & Utilities (9 files)](#module-8-system-infrastructure-feedback--utilities)
5. [Đối Soát Phản Biện Chuyên Sâu Của Principal Architect & Ma Trận Kiểm Chứng Thực Tế](#5-đối-soát-phản-biện-chuyên-sâu-của-principal-architect--ma-trận-kiểm-chứng-thực-tế)
6. [Hiện Trạng Thực Thi & Lộ Trình Tái Cấu Trúc (P0, P1, P2, P3 Hoàn Tất — Kiến Trúc 3 Tầng Core Runtime)](#6-hiện-trạng-thực-thi--lộ-trình-tái-cấu-trúc-p0-p1-p2-p3-hoàn-tất--kiến-trúc-3-tầng-core-runtime)

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG

### 1.1. Bản chất Dự án Vyen
Vyen là một **High-Assurance Coding Agent Harness** kiêm **Local-First AI Chat System** chạy song song ở hai môi trường:
1. **Web Browser (Chromium/Firefox/Safari)**: Sử dụng File System Access API để kết nối trực tiếp thư mục mã nguồn máy khách mà không qua server backend.
2. **Desktop Shell & CLI**: Chạy Next.js local kết hợp Chromium `--app` mode và bridge IPC cục bộ để gọi terminal shell, git và giao thức Model Context Protocol (MCP).

### 1.2. Các Nguyên Lý Kiến Trúc Cốt Lõi
1. **Local-First & Zero-Server Persistence**:
   - Dữ liệu lịch sử chat, các nhánh hội thoại, file đính kèm blob, cấu hình MCP, permissions, recipes đều được lưu trữ trực tiếp trên trình duyệt bằng **Dexie.js (IndexedDB)** trải qua 19 migration phiên bản (bổ sung bảng `auditLogs`).
   - Gọi `navigator.storage.persist()` khi ứng dụng khởi chạy ở client để bảo vệ dữ liệu chống browser eviction.
2. **Non-Linear Branching Message Tree & Tool-Call Invariance**:
   - Mỗi tin nhắn là một node độc lập trỏ về `parentId` (root mang `parentId = '__ROOT__'`).
   - Khái niệm "Cuộc trò chuyện" thực chất là đường đi từ gốc (root) đến một nút lá tích cực (`activeLeafId`).
   - **Tool-Call Pairing Normalizer**: Tự động phát hiện và vá các `tool_call` mồ côi (chưa có `tool_result` do rẽ nhánh) trước khi gửi lên API upstream, loại bỏ triệt để lỗi 400 của OpenAI/Anthropic.
3. **Strict Client-Side Tool Execution Loop**:
   - LLM phát sinh tool call (`fs_read`, `fs_edit`, `fs_write`, `code_patch`, `shell_run`, `git_*`, `mcp__*`).
   - Kiểm tra SHA-256 base hash chống TOCTOU trước khi ghi đè đĩa.
   - Chặn đứng metacharacters shell chaining (`&&`, `||`, `;`, `|`, `$()`, `>`, `<`) và jailing `cwd` trong workspace root.
   - Ghi lại nhật ký kiểm toán chống giả mạo (Tamper-Evident Audit Log — hash chain + disk anchor; KHÔNG "bất biến" tuyệt đối vì nằm trong Dexie cùng origin) vào bảng `auditLogs`.
   - **Chống prompt injection (A5)**: taint tracking toàn lượt — mọi nguồn ngoài (file đọc, output MCP, web_search/web_fetch, stdout shell/diff git, `run_code`) đánh dấu lượt nhiễm qua `lib/taint-tracker.ts`; khi lượt đã nhiễm, Egress Guard (`lib/auto-pilot.ts`) hạ cấp mọi tool exfil (web/MCP/git_push/shell có curl) sang chế độ hỏi người dùng, kèm trần ngân sách autonomous. CSP (`next.config.js`) là lớp phòng thủ thứ hai cho bề mặt render GFM/KaTeX.
4. **Virtualizer Layout Stability & Measurement Isolation**:
   - Tách tin nhắn đang stream ra ngoài TanStack Virtualizer vào sticky container độc lập, triệt tiêu measurement thrashing.
   - Bộ nhớ đệm chiều cao `HEIGHT_CACHE` tích hợp `widthBucket` và giới hạn LRU 2,000 mục, chống giật màn hình khi đóng/mở sidebar.
5. **Draft Persistence**:
   - Tự động lưu bản nháp soạn thảo theo `chatId` vào `localStorage` (debounce 300ms + flush on switch/unload), bảo toàn nội dung khi crash hoặc unmount.

---

## 2. SƠ ĐỒ PHÂN CẤP COMPONENT & LUỒNG DỮ LIỆU

```
RootLayout (app/layout.tsx)
 └── PWARegister (components/pwa-register.tsx)
 └── Home (app/page.tsx) [storage.persist() bootstrap]
      ├── Sidebar (components/sidebar.tsx)
      │    ├── VyenLogo (components/vyen-logo.tsx)
      │    ├── BackupReminder (components/backup-reminder.tsx)
      │    └── ChatItem (memoized)
      │         ├── Highlight (components/highlight.tsx)
      │         └── Context Menu (Export, Pin, Rename, Delete)
      │
      ├── ChatErrorBoundary (components/chat-error-boundary.tsx)
      │    └── ChatInterface (components/chat-interface.tsx) [MODULAR PRESENTATIONAL CONTAINER - 390 dòng]
      │         ├── AgentHud (components/hud/agent-hud.tsx)
      │         ├── StatusLine (components/chat/status-line.tsx)
      │         │    ├── ContextMeter (components/context-meter.tsx)
      │         │    ├── ThinkingMenu (components/thinking-menu.tsx)
      │         │    └── ChatExportMenu (components/chat-export-menu.tsx)
      │         │
      │         ├── WorkspaceCheckpointBar (components/workspace-checkpoints.tsx)
      │         ├── PlanPanel (components/plan-panel.tsx)
      │         │
      │         ├── MessageList (components/chat/message-list.tsx) [TanStack Virtual + Stream Sticky Footer + Width LRU]
      │         │    ├── ThinkingIndicator
      │         │    └── MessageItem (components/chat/message-item.tsx)
      │         │         ├── ThinkingBlock (collapsible)
      │         │         ├── BranchSwitcher (components/branch-switcher.tsx)
      │         │         ├── MarkdownRenderer (components/markdown-renderer.tsx)
      │         │         │    ├── SyntaxHighlightGate -> SyntaxHighlight (components/syntax-highlight.tsx)
      │         │         │    └── PlainCode
      │         │         ├── ToolTrace (components/chat/tool-trace.tsx)
      │         │         │    └── SubagentCard (components/subagent-card.tsx)
      │         │         ├── OrchestratorBadge (components/chat/orchestrator-badge.tsx)
      │         │         ├── EvidenceBadge (components/evidence-badge.tsx)
      │         │         ├── MessageStatusBadge (components/message-status-badge.tsx)
      │         │         └── MessageUsage (components/chat/message-usage.tsx)
      │         │
      │         ├── Composer (components/composer.tsx) [Draft Persist + 3-layer IME composition guard]
      │         │    ├── ModelSelector (components/model-selector.tsx)
      │         │    ├── TaskMenu (Tác vụ: Plan, Goal, Staging, Tools, Recipes...)
      │         │    └── Slash Commands Autocomplete Popup
      │         │
      │         ├── [MODALS & SLIDE-OVER PANELS]
      │         │    ├── DiffConfirm (components/diff-confirm.tsx) [SHA-256 verified]
      │         │    ├── ShellConfirm (components/shell-confirm.tsx) [CWD jailed]
      │         │    ├── StagingPanel (components/staging-panel.tsx) [TOCTOU base hash check]
      │         │    ├── ToolsPanel (components/tools-panel.tsx)
      │         │    ├── RecipesPanel (components/recipes/recipes-panel.tsx)
      │         │    └── McpToolApprovalDialog (components/mcp/tool-approval-dialog.tsx)
      │         │
      │         └── ToastHost (components/toast.tsx)
      │
      └── SettingsDialog (dynamic import) (components/settings-dialog.tsx)
           ├── AppearanceTab (components/settings/appearance-tab.tsx)
           ├── ProvidersTab (components/settings/providers-tab.tsx)
           │    ├── ProviderManager (components/provider-manager.tsx)
           │    ├── VisionModelSection (components/settings/vision-model-section.tsx)
           │    └── RoutingSettingsPanel (components/routing-settings-panel.tsx)
           ├── SafetyTab (components/settings/safety-tab.tsx)
           │    └── ToolPermissionsTable (components/tool-permissions-table.tsx)
           ├── ExtensionsTab (components/settings/extensions-tab.tsx)
           │    ├── McpSettingsPanel (components/mcp/mcp-settings-panel.tsx)
           │    ├── DiskSkillsSection (components/settings-skills.tsx)
           │    └── CustomSlashCommandsSection (components/settings/slash-commands-section.tsx)
           ├── MemoryTab (components/settings/memory-tab.tsx)
           │    ├── MemoriesSection (components/settings/memories-section.tsx)
           │    └── AgentMemorySection (components/settings-agent-memory.tsx)
           └── DataTab (components/settings/data-tab.tsx)
                ├── AutoBackupSection (components/settings/auto-backup-section.tsx)
                ├── SchedulerPanel (components/scheduler/scheduler-panel.tsx)
                └── UsageStats (components/usage-stats.tsx)
```

---

## 3. BẢNG CHỈ MỤC TOÀN BỘ 68 FILE TSX THEO MODULE

*(Toàn bộ 68 file TSX phân bố chuẩn xác, tổng cộng **17,941 dòng code** loại trừ trailing newlines, hoặc **18,009 dòng** khi tính cả dòng rỗng cuối file)*

| # | Module | Đường Dẫn File | Số Dòng | Vai Trò Chính |
|---|---|---|---|---|
| 1 | **M1: Root** | `app/layout.tsx` | 66 | Root HTML, fonts (Inter + JetBrains Mono), PWA registration |
| 2 | | `app/page.tsx` | 156 | Main page layout, phím tắt toàn cục, dynamic import Settings, `storage.persist()` |
| 3 | | `app/error.tsx` | 78 | Route-level error boundary của App Router: bắt lỗi dựng trang, in lỗi kèm digest, nút Thử lại / Tải lại trang |
| 4 | | `app/global-error.tsx` | 85 | Error boundary tầng gốc thay root layout: tự mang html/body và nạp global.css, hardcode màu nền inline để crash screen đọc được trước first-paint |
| 5 | **M2: Core Harness** | `components/chat-interface.tsx` | 390 | Container điều phối tầng 3 (Presentational Container): Layout Grid, HUD, MessageList (gồm StreamBubble), StatusLine, Composer, và các Modal duyệt; thực thi client tool ủy thác cho orchestration (2.29%) |
| 6 | | `components/sidebar.tsx` | 633 | Quản lý phiên chat, tìm kiếm fulltext tiếng Việt, workspace link |
| 7 | | `components/composer.tsx` | 1,571 | Ô nhập đa năng, voice STT, slash commands, Draft Persist vào localStorage, 3-layer IME guard, hàng chân (model · phạm vi · gửi) với phép trao padding khi focus |
| 8 | | `components/context-meter.tsx` | 50 | Thước đo ngữ cảnh token (presentational `memo`, nhận `used`/`max` từ chat-interface) |
| 9 | | `components/model-selector.tsx` | 462 | Dropdown chọn model phân nhóm theo nhà cung cấp & khả năng |
| 10 | **M3: Message Tree** | `components/chat/message-list.tsx` | 779 | Danh sách tin nhắn ảo hóa TanStack Virtual, tách stream message ra ngoài virtualizer, width-aware LRU cache, gom lượt và gập thân lượt |
| 11 | | `components/chat/message-item.tsx` | 701 | Hàng tin nhắn đơn lẻ, thinking block, inline edit, actions |
| 12 | | `components/branch-switcher.tsx` | 74 | Nút chuyển đổi qua lại giữa các nhánh anh em (`< 1/3 >`) |
| 13 | | `components/chat/tool-trace.tsx` | 1171 | Hiển thị chi tiết gọi tool: đầu thẻ (nhãn · tham số · quy mô · giờ · trạng thái), đoạn phase (Khảo sát / Thực hiện / Kiểm chứng), vạch trạng thái, thân mở rộng (output fold + phạm vi) |
| 14 | | `components/chat/status-line.tsx` | 332 | Thanh trạng thái hoạt động: model, hints, tokens, telemetry |
| 15 | | `components/chat/message-usage.tsx` | 47 | Huy hiệu hiển thị token tiêu thụ và độ trễ response |
| 16 | | `components/chat/orchestrator-badge.tsx` | 151 | Huy hiệu phân biệt tin nhắn sinh ra từ Orchestrator Sweep |
| 17 | | `components/message-status-badge.tsx` | 50 | Badge trạng thái tin nhắn (sending, delivered, error, aborted) |
| 18 | | `components/evidence-badge.tsx` | 63 | Huy hiệu minh chứng bậc thang (Zero-Mem Evidence Level) |
| 19 | | `components/chat/stream-bubble.tsx` | 140 | Khung hiển thị tin nhắn streaming độc lập nằm ngoài TanStack Virtualizer, loại bỏ layout measurement thrashing |
| 20 | **M4: Rich Content** | `components/markdown-renderer.tsx` | 451 | Bộ dựng Markdown chuẩn GFM, KaTeX math, dynamic syntax gate |
| 21 | | `components/syntax-highlight.tsx` | 158 | Tô màu code Prism 18 ngôn ngữ, nạp lười giảm bundle |
| 22 | | `components/highlight.tsx` | 28 | Highlight từ khóa tìm kiếm tiếng Việt không dấu |
| 23 | **M5: Human-In-The-Loop** | `components/diff-confirm.tsx` | 515 | Modal duyệt diff dòng (unified diff) trước khi ghi đĩa |
| 24 | | `components/shell-confirm.tsx` | 185 | Modal duyệt chạy lệnh terminal shell, cảnh báo lệnh phá hủy |
| 25 | | `components/staging-panel.tsx` | 184 | Vùng đệm sandbox xem trước batch sửa đổi trước khi Apply |
| 26 | | `components/workspace-checkpoints.tsx` | 303 | Quản lý snapshot workspace, rollback thay đổi của agent |
| 27 | | `components/mcp/tool-approval-dialog.tsx` | 189 | Hộp thoại phê duyệt 4 cấp cho MCP tool qua Desktop IPC |
| 28 | | `components/tool-permissions-table.tsx` | 338 | Bảng ma trận phân quyền per-tool độc lập 8 nhóm |
| 29 | **M6: Agent Workflows** | `components/hud/agent-hud.tsx` | 129 | Head-Up Display hiển thị telemetry realtime của các agent lane |
| 30 | | `components/plan-panel.tsx` | 216 | Checklist kế hoạch hành động phân rã task, nút "Duyệt & Thực thi" |
| 31 | | `components/recipes/recipes-panel.tsx` | 587 | Quản lý và thực thi Recipes YAML, form tham số, retry logic |
| 32 | | `components/scheduler/scheduler-panel.tsx` | 657 | Quản lý lịch chạy cron tự động, trigger headless session, nút kill-switch khẩn cấp (S3b) |
| 33 | | `components/subagent-card.tsx` | 132 | Card hiển thị tiến độ và kết quả subagent chạy song song |
| 34 | | `components/tools-panel.tsx` | 257 | Catalog công cụ, tìm kiếm BM25 và nạp tool MCP động |
| 35 | | `components/thinking-menu.tsx` | 377 | Menu điều khiển độ sâu suy luận (Thinking effort: low/med/high/max) |
| 36 | **M7: Settings (7 Domains)** | `components/settings-dialog.tsx` | 438 | Dialog trung tâm Cài đặt, chuẩn APG accessible tabs, quick search |
| 37 | | `components/settings/appearance-tab.tsx` | 195 | Cấu hình theme, system prompt, temperature, throttling |
| 38 | | `components/settings/providers-tab.tsx` | 76 | Cấu hình BYOK keys, safeStorage, endpoints nhà cung cấp |
| 39 | | `components/settings/safety-tab.tsx` | 219 | 4 Chế độ an toàn (Manual/Smart/Auto/ChatOnly), Staging toggle, Audit Log, MCP Grants |
| 40 | | `components/settings/extensions-tab.tsx` | 44 | Cấu hình mở rộng MCP, Skills thư mục, Slash Commands |
| 41 | | `components/mcp/mcp-settings-panel.tsx` | 576 | Quản lý máy chủ MCP trong Desktop: kết nối stdio/SSE/HTTP, expose mode |
| 42 | | `components/settings/memory-tab.tsx` | 62 | Quản lý ký ức 3 giai đoạn (Reviewer gate, Approved, Zero-Mem) |
| 43 | | `components/settings/data-tab.tsx` | 213 | Backup/Restore JSON & MD, định kỳ tự động, hạn ngạch storage, thống kê token |
| 44 | | `components/settings/auto-backup-section.tsx` | 151 | Cấu hình tự động sao lưu ngầm qua File System Access API |
| 45 | | `components/settings/memories-section.tsx` | 357 | Danh sách ký ức dài hạn theo category, tags và xóa/sửa |
| 46 | | `components/settings/slash-commands-section.tsx` | 190 | Quản lý danh sách lệnh gõ tắt `/` tùy biến |
| 47 | | `components/settings/vision-model-section.tsx` | 70 | Chọn model thị giác phân tích ảnh cho workspace và MCP |
| 48 | | `components/settings/section-loading.tsx` | 17 | Skeleton placeholder hiển thị khi tab đang nạp |
| 49 | | `components/settings-agent-memory.tsx` | 278 | Panel quản lý bộ nhớ agent cấu trúc chuyên sâu |
| 50 | | `components/settings-skills.tsx` | 178 | Trình quản lý kỹ năng dạng file `.vyen/skills/` |
| 51 | | `components/provider-manager.tsx` | 528 | Quản trị đa nhà cung cấp, kiểm tra API key health, endpoint mẫu |
| 52 | | `components/routing-settings-panel.tsx` | 505 | Cấu hình phân luồng mô hình Lead/Worker và chuỗi dự phòng |
| 53 | | `components/audit-viewer-dialog.tsx` | 394 | Dialog xem xét nhật ký kiểm toán, xác minh chuỗi băm chia lô microtasks, đối soát anchor đĩa |
| 54 | | `components/mcp/tool-grants-panel.tsx` | 186 | Bảng quản lý dynamic tool grants, TTL countdown, auto-revoke khi SCHEMA_MUTATED |
| 55 | | `components/storage-quota-meter.tsx` | 127 | Thước đo hạn ngạch IndexedDB qua storage.estimate(), cảnh báo phân tầng, trigger persist |
| 56 | | `components/settings/telemetry-tab.tsx` | 289 | Tab Đo đạc & Quan sát OpenTelemetry Waterfall, Ring buffer 500 spans, đo độ trễ turn và tools |
| 57 | **M8: Infrastructure & UI**| `components/error-boundary.tsx` | 61 | Generic React Error Boundary bắt crash component cây con |
| 58 | | `components/chat-error-boundary.tsx` | 104 | Error Boundary chuyên biệt cho khung chat, phục hồi draft input |
| 59 | | `components/toast.tsx` | 55 | Hệ thống thông báo nổi (Success, Error, Warning, Info) |
| 60 | | `components/chat-export-menu.tsx` | 184 | Menu xuất hội thoại sang JSON (cả cây) hoặc Markdown (nhánh) |
| 61 | | `components/backup-reminder.tsx` | 111 | Banner nhắc nhở sao lưu dữ liệu phòng ngừa mất dữ liệu browser |
| 62 | | `components/usage-stats.tsx` | 154 | Thống kê tổng số token đã dùng và ước tính chi phí USD |
| 63 | | `components/vyen-logo.tsx` | 102 | SVG branding logo Vyen và Pi Mark tương thích dark mode |
| 64 | | `components/pwa-register.tsx` | 30 | Đăng ký Service Worker và thông báo cập nhật ứng dụng PWA |
| 65 | | `components/effects/index.tsx` | 133 | Hiệu ứng rung phản hồi (Haptics), SiriWave, TextShimmer |
| 66 | | `components/chat/session-rail.tsx` | 66 |
| 67 | | `components/chat/chibi-avatar.tsx` | 62 | Cột phụ bên phải (≥1400px): chuyển Plan + thanh undo khỏi cột hội thoại sang chỗ riêng; tự ẩn khi không có gì để hiện |
| 68 | | `components/chat/turn-header.tsx` | 149 | Hàng đầu của một LƯỢT: tên việc + trạng thái (chữ + icon, nhãn lấy từ bảng §15.5); giờ, số tool, số file là thông tin phụ; nút gập thân lượt (`aria-expanded`, chevron) cho lượt đã đóng |

---

## 4. ĐẶC TẢ CHI TIẾT 65 FILE TSX THEO 8 MODULE & NÂNG CẤP TRỌNG YẾU

### Module 1: Next.js App Router Root Layer (4 files)
- **`app/layout.tsx` (66 dòng)**:
  - Khởi tạo khung HTML root, fonts hệ thống, inject inline theme script chống hiện tượng nhấp nháy giao diện (FOUC).
  - Mount component `PWARegister` (`components/pwa-register.tsx`) để đăng ký Service Worker và lắng nghe cập nhật phiên bản client.
- **`app/page.tsx` (156 dòng)**:
  - Entrypoint giao diện chính của ứng dụng. Gọi `navigator.storage.persist()` ngay khi client mount để yêu cầu trình duyệt bảo vệ bộ nhớ IndexedDB vĩnh viễn, chống việc bị OS/browser tự động dọn dẹp khi thiếu dung lượng đĩa.
  - Đăng ký bộ phím tắt toàn cục (`Ctrl/Cmd + K`, `Ctrl/Cmd + Shift + S`, `Escape`), điều phối hiển thị Sidebar và nạp lười (dynamic import) `SettingsDialog`.
- **`app/error.tsx` (78 dòng)**:
  - Route-level error boundary của Next.js App Router: bắt lỗi dựng trang, in lỗi kèm `digest` ra console, và hiện nút "Thử lại" (`reset`) hoặc "Tải lại trang".
- **`app/global-error.tsx` (85 dòng)**:
  - Error boundary tầng gốc, thay THẾ root layout: tự mang thẻ `<html>`/`<body>`, nạp `globals.css` và hardcode màu nền inline để màn hình sự cố vẫn đọc được trước khi stylesheet kịp về.

### Module 2: Core Orchestration & Chat Controller (5 files)
- **`components/chat/session-rail.tsx` (66 dòng)**:
  - **Cột phụ bên phải (≥1400px)**: chuyển `PlanPanel` + `WorkspaceCheckpointBar` ra khỏi cột hội thoại sang cột riêng, biến phần trống 448px mỗi bên ở màn rộng thành chỗ có ích.
  - **Tự ẩn khi rỗng**: dùng chung hook `useUndoTarget` với chính thanh undo, nên rail chỉ bật khi thật sự có gì để hiện — không bao giờ để lại một cột 320px trống trơn.
  - **Mốc bật cột khai ở `lib/hooks/use-media-query.ts` (`RAIL_QUERY`)**, khớp `screens.rail` trong `tailwind.config.ts`; dưới ngưỡng này hai khối quay về vị trí cũ giữa cột hội thoại (`rail:hidden` chỉ ẩn ở màn rộng).

- **`components/chat-interface.tsx` (390 dòng — 2.29% toàn bộ code TSX, hoặc 389 dòng không trailing newline — 2.29%)**:
  *Container điều phối tầng 3 (Presentational Orchestration Container) mỏng và tinh gọn*:
  - **Kiến trúc 3 Tầng**: Ủy thác TOÀN BỘ logic phiên cho `react/use-chat-orchestration.ts`, gồm cả thực thi client tool; chỉ render Layer 3 UI Component (`components/chat/stream-bubble.tsx`). Container KHÔNG còn import trực tiếp Layer 1 Core Engine.
  - **TOCTOU Guard & CWD Jail**: thực thi công cụ diễn ra trong `rawHandleClientToolCall` (`react/use-chat-orchestration.ts`) — thẩm tra SHA-256 baseHash trước khi áp dụng diff, giam giữ CWD trong workspace root.
  - **Funnel Deny & Shell Safety**: cổng deny policy `isToolDenied(toolCall.toolName, toolPermissions)` chặn trước desktop-only gate và switch thực thi, ngay trong `rawHandleClientToolCall` (canh bởi `tests/tool-deny.test.ts`).
  - **Approval Bridge**: Trọng tài duyệt tập trung `ApprovalQueue` (`useApprovalBridge`), một modal tại một thời điểm, tự động hủy bỏ khi chuyển nhánh (`activeLeafId`) hoặc dừng lượt.
  - **Audit Logging Tamper-Evident**: Ghi nhật ký kiểm toán hash chain cho mọi hành động duyệt/từ chối kèm payload, đối soát anchor đĩa ngoài workspace.
- **`components/sidebar.tsx` (633 dòng)**:
  - Quản lý cây danh sách phiên chat, tìm kiếm full-text tiếng Việt có fold dấu (`foldText`), nhóm lịch sử theo ngày (`date-groups.ts`).
  - Hỗ trợ đổi tên inline, ghim cuộc trò chuyện, xuất dữ liệu và banner tự động nhận diện kết nối lại thư mục workspace tương ứng.
- **`components/composer.tsx` (1,571 dòng)**:
  - **Draft Persistence Engine (P2)**: Tự động lưu bản nháp vào `localStorage['vyen:draft:${chatId}']` với debounce 300ms. Đồng bộ flush draft khi đổi `chatId`, khi đóng tab/refresh (`beforeunload`), và khi unmount. Khôi phục hoàn hảo bản nháp kể cả khi `ChatErrorBoundary` reset.
  - **3-Layer IME Composition Guard**: Kiểm soát chặt chẽ 3 tầng điều kiện (`composingRef`, `nativeEvent.isComposing`, `keyCode === 229`) loại bỏ triệt để lỗi vô tình gửi tin nhắn sớm khi gõ phím Enter để bỏ dấu tiếng Việt Telex/VNI (tại dòng 626-630).
  - Tích hợp voice STT Web Speech API, menu gõ tắt `/`, TaskMenu và bộ chọn model.
- **`components/context-meter.tsx` (50 dòng)**:
  - Component presentational `memo` chỉ nhận `used`/`max`. `contextUsage` được tính ở `components/chat-interface.tsx` trên active path qua `reconstructActiveThreadSafe` (3 call site) rồi truyền xuống.
- **`components/model-selector.tsx` (462 dòng)**:
  - Dropdown chọn model phân loại theo nhóm nhà cung cấp, hiển thị badge khả năng (vision, function calling, reasoning).

### Module 3: Virtualized Message Tree & Presentation (11 files)
- **`components/chat/turn-header.tsx` (149 dòng)**:
  - **Việc duy nhất của nó**: cho nhìn lướt lịch sử là phân biệt được lượt nào sửa tính năng, lượt nào điều tra lỗi, lượt nào bị chặn — nên nội dung header CHỈ gồm tên việc + trạng thái, còn giờ/số tool/số file là thông tin phụ (DESIGN.md §15.1 điểm 4).
  - **Không badge, không viền, không bóng**: theo idiom của `components/chat/status-line.tsx`; màu chỉ nhấn khi trạng thái đáng báo, và mọi trạng thái đều có icon lẫn chữ (§6).
  - **Không dấu tick cho trạng thái `xong`**: nhãn đó chỉ nghĩa agent đã dừng và báo hoàn tất; mức "đã xác minh" thuộc trục BẰNG CHỨNG (§15.5).
  - Dữ liệu lấy từ `lib/turns.ts` (`groupTurns`) — cùng một nguồn với `components/chat/message-list.tsx`, không tự gom lượt.
- **`components/chat/message-list.tsx` (779 dòng)**:
  - **Gập thân lượt (P1-C)**: `renderedMessages` là danh sách THẬT SỰ vẽ (đã bỏ tin của lượt đang gập và tin đang stream); vị trí trong khối, banner nén và virtualizer đều đọc từ nó. Luật gập nằm ở `lib/turns.ts` (`isFoldableTurn` + `foldedRowIds`) — màn hình không tự so trạng thái; lượt đang chạy/đang chờ quyền KHÔNG có nút gập.
  - **Turn header gắn vào tin ĐẦU của lượt (P1-B)**: gom nhóm bằng `groupTurns(turnRowsOf(messages, extrasOf))` — row dựng MỘT chỗ trong `lib/turns.ts`, để không call site nào tự ghép trường rồi bỏ sót `content` (đã xảy ra thật: mọi header mất tên việc vì rơi về chuỗi dự phòng). Header vẽ TRÊN banner nén ngữ cảnh và trên nội dung tin.
  - **Virtualizer Stream Separation (P2)**: Tách tin nhắn trợ lý đang stream (`isLoading && lastMsg.role === 'assistant'`) ra khỏi `rowVirtualizer`, cố định ở sticky container độc lập nhằm triệt tiêu hoàn toàn layout thrashing đo đạc chiều cao liên tục theo từng token ký tự.
  - **Width-Aware LRU `HEIGHT_CACHE` (P2)**: Bộ nhớ đệm chiều cao tin nhắn bổ sung bucket chiều rộng container (`${chatId}:${id}:${widthBucket}`) với dung lượng LRU 2,000 mục, loại bỏ rung giật cuộn trang khi co giãn sidebar.
  - **Smooth Stream Transition**: Sử dụng hook `prevLoadingRef` để bắt thời điểm kết thúc stream (`isLoading: true -> false`), tự động kích hoạt `rowVirtualizer.measure()` và `pin(400)` ghim mượt mà.
- **`components/chat/message-item.tsx` (701 dòng)**:
  - Hiển thị từng turn hội thoại (user/assistant), khối suy luận collapsible, các nút hành động (sao chép, sửa tin nhắn cũ, rẽ nhánh mới, retry).
- **`components/branch-switcher.tsx` (74 dòng)**:
  - Điều hướng giữa các nhánh hội thoại song song (`< 1/3 >`), hỗ trợ phím tắt và swipe.
- **`components/chat/tool-trace.tsx` (1171 dòng)**:
  - Khối biểu diễn chi tiết trạng thái gọi tool (đang chạy, hoàn tất, thất bại, output gấp gọn), bao gói và hiển thị các card subagent (`SubagentCard`).
  - **Đoạn phase (§14.3 lớp 5, đợt P1-D)**: `groupByPhase(events)` cắt mảng sự kiện thành các đoạn `Khảo sát / Thực hiện / Kiểm chứng / Khác`; đổi phase thì mở đoạn mới nên vòng `sửa → test lỗi → sửa` hiện ra. Nhãn đoạn là chữ trên nền, không viền/nền.
  - **Vạch trạng thái bên trái (§14.3 lớp 4)**: cả BỐN trạng thái đều có vạch (`border-l-accent` đang chạy · `border-l-danger` lỗi · `border-l-warning` bỏ dở · `border-l-subtle` xong), kèm chữ trạng thái ở đuôi dòng.
  - **Phạm vi (§14.3 lớp 1)**: `toolScopeOf()` trong `lib/tool-phases.ts` — `một tệp` / `dự án` / `phiên làm việc`; chỉ hiện trong THẺ MỞ, không chen vào dòng gọn (§15.2 điểm 6).
- **`components/chat/status-line.tsx` (332 dòng)**:
  - Thanh trạng thái cố định dưới khung chat, chứa `ContextMeter`, menu suy luận `ThinkingMenu`, và menu xuất dữ liệu `ChatExportMenu`.
- **`components/chat/message-usage.tsx` (47 dòng)**:
  - Hiển thị token vào/ra và thời gian phản hồi (latency) của từng lượt phản hồi.
- **`components/chat/orchestrator-badge.tsx` (151 dòng)**:
  - Badge trực quan gắn vào tin nhắn sinh ra từ chế độ Orchestrator Sweep song song.
- **`components/message-status-badge.tsx` (50 dòng)**:
  - Trạng thái tin nhắn: đang gửi, đã nhận, lỗi mạng, hoặc đã hủy (`aborted`).
- **`components/evidence-badge.tsx` (63 dòng)**:
  - Huy hiệu hiển thị cấp độ bằng chứng ngữ cảnh từ bộ nhớ Zero-Mem (`<zero-mem-evidence>`).
- **`components/chat/stream-bubble.tsx` (140 dòng)**:
  - Khung hiển thị tin nhắn streaming độc lập nằm ngoài TanStack Virtualizer, loại bỏ layout measurement thrashing khi nhận token liên tục từ model; tích hợp Handoff Grace Period triệt tiêu CLS giật khung nhìn khi hoàn tất stream; hỗ trợ khối suy luận collapsible và nút dừng trực tiếp.

### Module 4: Rich Content, Markdown & Code Rendering (3 files)
- **`components/markdown-renderer.tsx` (451 dòng)**:
  - Bộ dựng Markdown chuẩn GitHub Flavored Markdown (GFM), hỗ trợ công thức toán học KaTeX (`remark-math`, `rehype-katex`), bảng biểu, và nạp code block qua dynamic gate.
- **`components/syntax-highlight.tsx` (158 dòng)**:
  - Tô màu cú pháp Prism cho 18 ngôn ngữ lập trình phổ biến, nạp lười theo yêu cầu để tối ưu bundle size ban đầu.
- **`components/highlight.tsx` (28 dòng)**:
  - Tô màu từ khóa tìm kiếm tiếng Việt không phân biệt dấu trong danh sách chat và nội dung tin nhắn.

### Module 5: Human-in-the-Loop, Guardrails & Sandboxing (6 files)
- **`components/diff-confirm.tsx` (515 dòng)**:
  - Modal xem trước unified diff từng dòng (xanh/đỏ) trước khi ghi đĩa, bắt buộc xác nhận thủ công ở chế độ Manual/Smart.
- **`components/shell-confirm.tsx` (185 dòng)**:
  - Hộp thoại cảnh báo và yêu cầu phê duyệt khi agent chuẩn bị chạy lệnh terminal trong bản desktop, đánh dấu đỏ các lệnh destructive.
- **`components/staging-panel.tsx` (184 dòng)**:
  - Vùng đệm staging sandbox cho phép xem xét toàn bộ các file đã sửa trong phiên trước khi nhấn "Apply Tất Cả" xuống đĩa.
- **`components/workspace-checkpoints.tsx` (303 dòng)**:
  - Quản lý các điểm phục hồi (checkpoints) của thư mục workspace, hỗ trợ so sánh diff và khôi phục mã nguồn về trạng thái an toàn trước đó.
- **`components/mcp/tool-approval-dialog.tsx` (189 dòng)**:
  - Hộp thoại phê duyệt 4 cấp cho công cụ Model Context Protocol: Cho phép lần này / Luôn cho phép / Từ chối lần này / Luôn từ chối.
- **`components/tool-permissions-table.tsx` (338 dòng)**:
  - Bảng ma trận quản trị phân quyền độc lập cho từng công cụ thuộc 8 nhóm (`fs`, `shell`, `git`, `mcp`, `web`, `plan`, `delegate`, `memory`) với các mức `auto`, `ask`, `deny`, `default`.

### Module 6: Autonomous Agent Panels & Workflows (7 files)
- **`components/hud/agent-hud.tsx` (129 dòng)**:
  - Head-Up Display hiển thị trạng thái hoạt động theo thời gian thực của các lane agent và subagent đang thực thi.
- **`components/plan-panel.tsx` (216 dòng)**:
  - Bảng theo dõi tiến độ kế hoạch tự hành (Plan Mode), phân rã task thành checklist các bước và nút "Duyệt & Thực thi".
- **`components/recipes/recipes-panel.tsx` (587 dòng)**:
  - Trình quản trị và chạy quy trình tự động hóa YAML Recipes (`.vyen/recipes/*.yaml`), form tham số, retry state machine và chạy song song sub-recipes.
- **`components/scheduler/scheduler-panel.tsx` (657 dòng, hoặc 656 dòng không trailing newline)**:
  - Giao diện quản lý lịch chạy cron tự động, kích hoạt các phiên làm việc headless ngầm theo biểu thức cron tiêu chuẩn. Runner headless có **ngân sách cấp phiên** (`lib/scheduler/runner.ts`): hard timeout 10 phút, trần 3 phiên mỗi tick, kill-switch bằng sentinel `.vyen/scheduler-paused`, tự tắt lịch sau 3 lần lỗi liên tiếp. Trang bị nút UI "Dừng khẩn cấp / Tiếp tục" tích hợp điều khiển trực tiếp qua Desktop IPC bridge.
- **`components/subagent-card.tsx` (132 dòng)**:
  - Card hiển thị tiến độ, công cụ đang gọi và kết quả tóm tắt của subagent chạy song song (được render bên trong `ToolTrace`).
- **`components/tools-panel.tsx` (257 dòng)**:
  - Danh mục công cụ đầy đủ, tích hợp thuật toán tìm kiếm BM25 tiếng Việt và meta-tool `tools_load` nạp công cụ MCP theo nhu cầu.
- **`components/thinking-menu.tsx` (377 dòng)**:
  - Menu điều khiển mức độ suy luận (Thinking effort: `low`, `medium`, `high`, `max`), gắn kết trực tiếp trong `StatusLine`.

### Module 7: Unified Settings System — 7 Domains (21 files)
- **`components/settings-dialog.tsx` (438 dòng)**:
  - Hộp thoại Cài đặt trung tâm chuẩn APG, hỗ trợ tìm kiếm nhanh tức thì và điều phối 7 tab chính (Appearance, Providers, Safety, Extensions, Memory, Data, Telemetry).
- **`components/settings/appearance-tab.tsx` (195 dòng)**:
  - Cấu hình diện mạo giao diện, theme (Dark/Light/System), system prompt toàn cục, temperature (suy luận vs sáng tạo), và điều tiết tốc độ streaming (throttling).
- **`components/settings/providers-tab.tsx` (76 dòng)**:
  - Tab quản lý nhà cung cấp mô hình AI, nhúng `ProviderManager` (BYOK keys), `VisionModelSection` (model thị giác), và `RoutingSettingsPanel` (Lead/Worker).
- **`components/provider-manager.tsx` (528 dòng)**:
  - Quản trị đa nhà cung cấp mô hình (OpenAI, Anthropic, Google, DeepSeek, OpenRouter, Groq, Ollama...), kiểm tra API key health, endpoint mẫu và tùy biến headers.
- **`components/settings/vision-model-section.tsx` (70 dòng)**:
  - Chọn model thị giác chuyên trách phân tích ảnh đính kèm trong workspace, OCR và ảnh kết quả chụp màn hình từ MCP tools.
- **`components/routing-settings-panel.tsx` (505 dòng)**:
  - Cấu hình phân luồng mô hình thông minh Lead/Worker, chuỗi model dự phòng (fallback), và điều kiện tự động quay lại Lead model khi lỗi/phàn nàn.
- **`components/settings/safety-tab.tsx` (219 dòng)**:
  - 4 Chế độ an toàn phê duyệt (Manual, Smart, Autonomous, Chat Only), bật/tắt Staging Sandbox, nhúng ma trận phân quyền `ToolPermissionsTable`, nút kích hoạt `AuditViewerDialog` và bảng `McpToolGrantsPanel`.
- **`components/settings/extensions-tab.tsx` (44 dòng)**:
  - Quản lý tiện ích mở rộng hệ thống, nhúng `McpSettingsPanel` (máy chủ MCP), `DiskSkillsSection` (kỹ năng đĩa), và `CustomSlashCommandsSection` (lệnh slash).
- **`components/mcp/mcp-settings-panel.tsx` (576 dòng)**:
  - Quản lý máy chủ Model Context Protocol trong Desktop: kết nối stdio/SSE/HTTP, quản lý biến môi trường an toàn, kiểm tra tính năng và expose mode.
- **`components/settings-skills.tsx` (178 dòng)**:
  - Trình quản lý kỹ năng dạng file `.vyen/skills/*/SKILL.md` trong workspace và thư mục cá nhân, hỗ trợ quét, nạp lười và tạo mới kỹ năng.
- **`components/settings/slash-commands-section.tsx` (190 dòng)**:
  - Quản lý danh sách lệnh gõ tắt `/` tùy biến (custom macros/prompts), thêm/sửa/xóa mẫu lệnh gõ nhanh trong ô soạn thảo composer.
- **`components/settings/memory-tab.tsx` (62 dòng)**:
  - Tab trung tâm quản trị bộ nhớ, nhúng danh sách ký ức dài hạn `MemoriesSection` và panel ký ức cấu trúc `AgentMemorySection`.
- **`components/settings/memories-section.tsx` (357 dòng)**:
  - Quản lý danh sách ký ức dài hạn lưu trong IndexedDB: phân loại category, tìm kiếm, lọc tags, chỉnh sửa nội dung và xóa từng mục.
- **`components/settings-agent-memory.tsx` (278 dòng)**:
  - Panel quản lý bộ nhớ agent cấu trúc chuyên sâu: xem tóm tắt bộ nhớ, trần token cho injection memory, và xóa cache ký ức.
- **`components/settings/data-tab.tsx` (213 dòng)**:
  - Tab quản lý dữ liệu: Sao lưu/phục hồi JSON & MD toàn bộ chat/settings, cấu hình tự động sao lưu `AutoBackupSection`, nhúng `StorageQuotaMeter` và `UsageStats`.
- **`components/settings/auto-backup-section.tsx` (151 dòng)**:
  - Cấu hình tự động sao lưu dữ liệu ngầm ra file đĩa máy khách định kỳ qua File System Access API.
- **`components/settings/section-loading.tsx` (17 dòng)**:
  - Skeleton loading placeholder hiển thị chuyển tiếp mượt mà khi nạp lười các tab và section cài đặt.
- **`components/audit-viewer-dialog.tsx` (394 dòng)**:
  - Hộp thoại xem xét và kiểm toán nhật ký an toàn trong Cài đặt, chia lô microtasks gọi `verifyAuditLogChain` từ `lib/audit-log.ts` không làm đơ giao diện UI, so khớp head hash với anchor log đĩa ngoài workspace (`~/.vyen/audit/anchor.log`), hiển thị bảng ảo hoá TanStack Virtual với cryptographic link badges (prevHash ➔ hash).
- **`components/mcp/tool-grants-panel.tsx` (186 dòng)**:
  - Bảng quản lý dynamic tool grants: tên tool, serverId, trần cứng TTL 60 phút (Red Team Blind Spot 3), TTL countdown theo thời gian thực, và theo dõi `schemaHash` SHA-256; tự động phát hiện và cảnh báo đỏ "SCHEMA_MUTATED" khi server cập nhật schema, vô hiệu hóa grant cũ để chống Tool Poisoning.
- **`components/storage-quota-meter.tsx` (127 dòng)**:
  - Thước đo hạn ngạch lưu trữ IndexedDB thông qua `navigator.storage.estimate()` và kiểm tra trạng thái bảo vệ chống browser eviction với `navigator.storage.persisted()`, cảnh báo phân tầng (<70% xanh, 70-90% vàng, >90% đỏ) và nút kích hoạt `navigator.storage.persist()`.
- **`components/settings/telemetry-tab.tsx` (289 dòng)**:
  - Tab Đo đạc & Quan sát OpenTelemetry Waterfall trong Cài đặt, hiển thị biểu đồ Waterfall trực quan độ trễ từng Turn, LLM Stream, Tool execution và Audit commit từ bộ nhớ đệm xoay vòng (Ring Buffer 500 Spans) của `globalTracer`.

### Module 8: System Infrastructure, Feedback & Utilities (9 files)
- **`components/error-boundary.tsx` (61 dòng)**:
  - Generic React Error Boundary bắt lỗi crash giao diện ở các component con, ngăn chặn sập toàn bộ ứng dụng.
- **`components/chat-error-boundary.tsx` (104 dòng)**:
  - Error Boundary chuyên biệt cho khung hội thoại, tự động khôi phục nội dung draft đang soạn thảo dở dang khi xảy ra lỗi.
- **`components/toast.tsx` (55 dòng)**:
  - Hệ thống thông báo nổi (Toast notifications) phản hồi các hành động sao lưu, lưu key, lỗi mạng.
- **`components/chat-export-menu.tsx` (184 dòng)**:
  - Menu xuất lịch sử hội thoại sang định dạng JSON (toàn bộ cây phân nhánh) hoặc Markdown (nhánh tích cực đang xem), render trong `StatusLine`.
- **`components/backup-reminder.tsx` (111 dòng)**:
  - Banner định kỳ nhắc nhở người dùng sao lưu dữ liệu IndexedDB ra file đĩa.
- **`components/usage-stats.tsx` (154 dòng)**:
  - Thống kê chi tiết tổng số token vào/ra và ước tính chi phí theo USD của phiên làm việc.
- **`components/vyen-logo.tsx` (102 dòng)**:
  - Vector SVG logo thương hiệu Vyen và biểu tượng Pi Mark tương thích chế độ Dark/Light.
- **`components/pwa-register.tsx` (30 dòng)**:
  - Đăng ký Service Worker chuẩn Progressive Web App, quản lý kiểm tra cập nhật phiên bản offline.
- **`components/effects/index.tsx` (133 dòng)**:
  - Hiệu ứng rung haptics trên thiết bị di động, sóng âm thanh SiriWave cho Voice STT
- **`components/chat/chibi-avatar.tsx` (62 dòng)**:
  - Avatar "chibi" hiển thị trong chip/header của hội thoại; component presentational thuần, không state. và TextShimmer loading.

---

## 5. ĐỐI SOÁT PHẢN BIỆN CHUYÊN SÂU CỦA PRINCIPAL ARCHITECT & MA TRẬN KIỂM CHỨNG THỰC TẾ

### 5.0. Đối soát vòng 2 (2026-09-24, HEAD `3febca9`): 5 blocker B1–B5 & điểm lại

> Phản biện vòng 2 thẩm định trên nền tài liệu v3.1. Chi tiết đầy đủ kèm bằng chứng `file:dòng` nằm ở `CRITIQUE_RECONCILIATION.md` mục J (tài liệu đã gỡ 2026-10-04; nội dung còn trong lịch sử commit). Tóm lược trạng thái sau vòng sửa: docs-check:ignore

| # | Blocker | Trạng thái hiện tại | Residual thật |
|---|---|---|---|
| **B1** | Shell denylist / argument injection | Mô hình là tokenizer argv + allowlist + `shell: false` (`lib/shell-policy.cjs`); **S3: runner không bao giờ auto-approve**; **S3b: binary resolve TUYỆT ĐỐI trong thư mục hệ thống, `PATH` dựng lại (không kế thừa), và 3 executor nội bộ đã bỏ `shell: true`** (`lib/safe-spawn.ts`) | Chưa có ranh giới OS (uid/seccomp/Job Object); lệnh cần shell thật bị từ chối thay vì chạy |
| **B2** | Không có chống prompt injection | **Đã nối dây đầy đủ** tại commit `3febca9`: taint mọi nguồn ngoài (fs, MCP, web, shell, run_code) → Egress Guard hạ cấp exfil sang `ask` + trần ngân sách tự hành + CSP | `isEgressTool` dò keyword — bypass được; taint in-memory theo lượt |
| **B3** | Audit log "bất biến" | Tamper-evident có thật: hash chain + `verifyChain` + disk anchor; **S3: anchor chuyển ra NGOÀI workspace** (`~/.vyen/audit/anchor.log`, override `VYEN_AUDIT_ANCHOR_PATH`) và `verifyChain` phân biệt chuỗi đã prune | Anchor nhánh desktop vẫn ở `.vyen/audit/` (bridge bị jail); chưa ký OS keychain |
| **B4** | Phê duyệt không gắn payload | **S3/S3b: approval token ký đúng payload** cho shell, `run_code` **và diff** (`lib/approval-binding.ts`) — SHA-256 canonical, hạn 10 phút, một lần; lệch ⇒ audit `blocked` + không chạy. Ghi đĩa chặn bằng `expectedBaseHash`; MCP grant gắn `schemaHash` | Token sống trong RAM; chưa gắn `toolCallId` ở call site |
| **B5** | Autonomous/cron không ngân sách cứng | Trần mỗi lượt auto (12 tool calls / 5 file / 500 KB / 3 shell) + **S3/S3b: ngân sách cấp phiên headless** — hard timeout 10 phút, trần 3 phiên mỗi tick, kill-switch (`.vyen/scheduler-paused`, có **nút UI** trong `scheduler-panel.tsx`), tự tắt sau 3 lỗi liên tiếp | Lượt quá trần bị coi là thất bại chứ chưa huỷ tiến trình (runner không nhận `AbortSignal`) |

**Điểm lại sau vòng sửa**: #2 Shell → **~85%**; #9 Audit → **~90%**; #1 TOCTOU → **giữ 85%**; #10 Policy-as-data → **~90%**. Bảng đầy đủ ở mục J + K của `CRITIQUE_RECONCILIATION.md` (tài liệu đã gỡ 2026-10-04). docs-check:ignore

| # | Luận điểm của Architect | Đánh giá thực tế | Trạng thái xử lý trong Codebase |
|---|---|---|---|
| **1** | **TOCTOU trong File System**: Phê duyệt trên diff cũ, ghi đè không kiểm tra thay đổi trên đĩa. | **CHÍNH XÁC (P0)** | **[ĐÃ HOÀN THÀNH 100%]**: SHA-256 base hash verification trong `chat-interface.tsx` và `lib/staging.ts`. |
| **2** | **Shell Safety & Bypass**: Denylist regex bị bypass; thiếu jailing `cwd`. | **CHÍNH XÁC & NGUY HIỂM HƠN DỰ KIẾN** | **[ĐÃ HOÀN THÀNH 100%]**: Xóa bỏ `node -e`/`python -c`. Chặn metacharacters shell chaining. Khóa `cwd` trong workspace root. |
| **3** | **Auto-execute File Protection**: Không bảo vệ `.git/hooks/**`, `package.json`, `.vyen/**`. | **CHÍNH XÁC (P0)** | **[ĐÃ HOÀN THÀNH 100%]**: Ép buộc hỏi (`ask`) khi ghi vào `.git/**`, `package.json`, `.vscode/**`, `.env*`, `.vyen/**`. |
| **4** | **ApprovalQueue Abort on Stop**: Bấm Stop không hủy modal hoặc promise đang chờ. | **CHÍNH XÁC (Bug thật)** | **[ĐÃ HOÀN THÀNH 100%]**: `approvalQueue.abortAll()` trong `handleStop`, resolve `false` cho toàn bộ pending promises. |
| **5** | **Durability IndexedDB**: Trình duyệt có thể evict IndexedDB nếu thiếu bộ nhớ. | **CHÍNH XÁC** | **[ĐÃ HOÀN THÀNH 100%]**: Tự động gọi `navigator.storage.persist()` khi khởi chạy app trong `app/page.tsx`. |
| **6** | **`HEIGHT_CACHE` & Virtualizer**: Cache thiếu width; stream nằm trong virtualizer gây giật scroll. | **CHÍNH XÁC 100% (P2)** | **[ĐÃ HOÀN THÀNH 100%]**: Tách message đang stream ra ngoài virtualizer. Nâng cấp `HEIGHT_CACHE` width-aware + LRU 2,000 mục. |
| **7** | **Mất Draft khi ErrorBoundary**: Boundary unmount làm mất draft state. | **CHÍNH XÁC (P2)** | **[ĐÃ HOÀN THÀNH 100%]**: Tích hợp Draft Persistence vào `localStorage` kèm synchronous flush on switch/unload. |
| **8** | **Tool-call Pairing Invariant**: Đứt cặp tool_call / tool_result khi rẽ nhánh gây lỗi 400. | **CHÍNH XÁC (P2)** | **[ĐÃ HOÀN THÀNH 100%]**: Thêm `normalizeMessageToolInvocations` và `normalizeToolCallPairing` trong `lib/message-normalize.ts`. |
| **9** | **Audit Log Bất Biến**: Cần ghi nhận mọi thao tác duyệt/ghi/lệnh shell. | **CHÍNH XÁC (P3)** | **[ĐÃ HOÀN THÀNH 100%]**: Tạo bảng Dexie v19 `auditLogs` và module `lib/audit-log.ts`. |
| **10** | **Policy-as-data Scope**: Phân quyền path glob (`src/**`) và deny MCP mặc định. | **CHÍNH XÁC (P3)** | **[ĐÃ HOÀN THÀNH 100%]**: Xây dựng bộ so khớp glob chuẩn xác và áp dụng chính sách deny-by-default cho dynamic MCP tools. |
| **11** | **IME Composition tiếng Việt**: Gửi sớm khi gõ Enter tiếng Việt Telex/VNI. | **BÁO ĐỘNG GIẢ (FALSE ALARM)** | Đã có sẵn 3 lớp phòng thủ trong `components/composer.tsx:626-630` (`composingRef`, `native.isComposing`, `keyCode === 229`). |
| **12** | **ContextMeter tính trên toàn cây**: Phê bình ContextMeter tính sai nhánh. | **BÁO ĐỘNG GIẢ (FALSE ALARM)** — hiệu chỉnh vòng 2: bản thân `ContextMeter` là presentational `memo`; `contextUsage` do chat-interface tính trên active path rồi truyền `used`/`max` xuống. Điểm nóng hiệu năng thật là re-render mỗi token của chat-interface (mục C4). | `reconstructActiveThreadSafe` chỉ có 3 call site trong `components/chat-interface.tsx`. |
| **13** | **Lưu trữ Attachment Base64**: Phê bình tốn 33% và ép base64 vào Dexie. | **BÁO ĐỘNG GIẢ MỘT PHẦN** | `lib/db.ts:69` lưu trực tiếp structured-clone `Blob`, không dùng base64. |

---

## 6. HIỆN TRẠNG THỰC THI & LỘ TRÌNH TÁI CẤU TRÚC (P0, P1, P2, P3 HOÀN TẤT — KIẾN TRÚC 3 TẦNG CORE RUNTIME)

### Hiện Trạng Đã Hoàn Thành — [183/183 Test Files PASS · 2,629/2,629 Tests PASS]

> **Đồng bộ 2026-10-04**: mốc kiểm chứng trước đây đạt **222** suite trong `tests/` (nay là **223**, xem ghi chú bên dưới) và **2,629 tests PASS**.
>
> **Đồng bộ 2026-10-07 (đợt LƯỢT)**: thêm `tests/turns.test.ts` (mô hình lượt: ranh giới theo sự kiện + bảng trạng thái §15.5).
> **Đồng bộ 2026-10-07 (đợt P1-D)**: **224 file `tests/*.test.ts`** — thêm `tests/tool-phases.test.ts` (nhóm phase + phạm vi tool). Số file TSX: **68**, tổng dòng **17,805 / 17,873** như dòng đầu tài liệu ghi.
>
> **Đồng bộ 2026-10-08 (đợt P1-E)**: số file `tests/*.test.ts` **không đổi** (224) —
> hợp đồng mới của composer nằm trong `tests/composer-affordances.test.ts` (49 → 68
> test). Số file TSX: **68**, tổng dòng **17,941 / 18,009** — toàn bộ phần tăng
> (+136) nằm ở `components/composer.tsx` (1,435 → 1,571 dòng).
> Toàn bộ đặc tả kiến trúc — **65 file `.tsx`** (tổng cộng **15,746 dòng code** loại trừ trailing newline / **15,812 dòng** tính cả trailing newline),
> schema Dexie v19, danh sách API route — đã đối chiếu lại và khớp tuyệt đối 100% với codebase.
> Vòng 2 (2026-09-24, HEAD `3febca9`): Egress Guard đã nối dây thật (A5) + CSP (A8) — chi tiết §5.0.
> **Đợt S3 + S3b (2026-09-24)**: `tsc --noEmit` sạch; `vitest run` → **168 file / 2.526 test PASS**. Đóng toàn bộ residual P0/P0.5: approval binding cho shell/run_code/diff (`lib/approval-binding.ts`), runner gate (`lib/auto-pilot.ts`), ngân sách phiên headless + nút kill-switch (`lib/scheduler/runner.ts`, `components/scheduler/scheduler-panel.tsx`), audit anchor ngoài workspace (`lib/audit-log.ts`), executor không shell + binary tuyệt đối (`lib/safe-spawn.ts`).
- [x] **Gói P0 (Bảo Mật & Toàn Vẹn)**: TOCTOU hash guard, loại bỏ shell RCE, CWD jail, auto-execute file protection, ApprovalQueue abort, `storage.persist()`; **S3/S3b**: approval token ký payload (shell/run_code/diff), runner gate, binary resolve tuyệt đối, executor không shell.
- [x] **Gói P1 (Tái Cấu Trúc Core Runtime & Kiến Trúc 3 Tầng — HOÀN TẤT)**:
  - **Tầng 1 (Core Engine)**: `core/agent-runtime/` gồm State Machine (`state-machine.ts`), Runtime Actor (`runtime-actor.ts`), Multi-Tab Lock Coordinator qua Web Locks API (`tab-lock.ts`), và Safe Tool Runner (`tool-runner.ts`) với TOCTOU SHA-256 baseHash guard + CWD path jail.
  - **Tầng 2 (React Adapters)**: `react/use-agent-runtime.ts` kết nối qua `useSyncExternalStore` chống stale closure; `react/use-approval-bridge.ts` quản lý hàng đợi modal an toàn gắn chặt `activeLeafId` + `expectedBaseHash`; `react/use-streaming-text.ts` buffer 60fps RAF điều tiết stream token; `react/use-chat-orchestration.ts` quản lý toàn diện phiên chat và persistence.
  - **Tầng 3 (UI Presentation)**: `components/chat/stream-bubble.tsx` tách biệt khỏi TanStack Virtualizer triệt tiêu layout thrashing; rút gọn `components/chat-interface.tsx` từ 6,377 dòng xuống còn **390 dòng** container presentational tinh gọn.
- [x] **Gói P2 (Tối Ưu UX & Virtualization)**: Tách stream message khỏi virtualizer, width-aware LRU `HEIGHT_CACHE`, draft persistence chống mất chữ, tool-call pairing normalizer chống lỗi 400.
- [x] **Gói P3 (Chính Sách & Kiểm Toán)**: Bảng Dexie v19 `auditLogs`, ghi nhật ký kiểm toán chống giả mạo (tamper-evident: hash chain + `verifyChain` + anchor **ngoài workspace** tại `~/.vyen/audit/anchor.log`, override bằng `VYEN_AUDIT_ANCHOR_PATH`), bộ so khớp đường dẫn glob (`matchesGlobPattern`), deny-by-default cho dynamic MCP, UI Audit Viewer Dialog (`components/audit-viewer-dialog.tsx`), Dynamic MCP Grants Panel (`components/mcp/tool-grants-panel.tsx`), và Storage Quota Meter (`components/storage-quota-meter.tsx`).
- [x] **Kiểm chứng tại HEAD `6768422` (2026-09-22)**: `tsc --noEmit` sạch; `vitest run` **163/163 test file PASS · 2,456/2,456 test PASS**; `node tests/sprint-s1-verification.cjs` và `node tests/sprint-s2-verification.cjs` đều PASS (gồm toàn bộ kiểm tra bảo mật shell policy).
- [x] **Đợt S3 — đóng 4 residual P0/P0.5 của vòng 2 (2026-09-24)**: (1) **B4** approval token ký đúng payload đã xem, hạn 10 phút, một lần (`lib/approval-binding.ts`); (2) **B1(b)** runner `npm`/`npx`/`pnpm`/`yarn`/`bun`/`node script` không bao giờ auto-approve kể cả YOLO và override `auto`; (3) **B5** ngân sách cấp phiên headless: timeout 10 phút + trần 3 phiên/tick + kill-switch + auto-disable sau 3 lỗi; (4) **B3** anchor audit ra `~/.vyen/audit/anchor.log` (ngoài workspace) + `verifyChain` phân biệt chuỗi đã prune. Chi tiết + residual tồn tại: mục K của `CRITIQUE_RECONCILIATION.md` (tài liệu đã gỡ 2026-10-04). docs-check:ignore
- [x] **5 lỗi chặn đã sửa trong đợt kiểm chứng này**: (1) comment JSDoc chưa đóng trong `lib/fs-access.ts` nuốt cả hàm `isProtectedFsPath` → `TS2304` + `ReferenceError` lúc chạy; (2) `const crypto` khai báo trùng ở module scope trong `lib/ipc.cjs` → SyntaxError làm sập toàn bộ bridge IPC; (3) `fsWrite` tự so `err.name === 'NotFoundError'` thay vì dùng helper chung `isNotFoundError()` cùng module → tạo file mới luôn thất bại; (4) `lib/shell-policy.cjs` thiếu `grep`/`echo`/`printf` trong allowlist đọc-only → `shell_run` từ chối cả lệnh chỉ-đọc vô hại; (5) `npx vite build`/`npx next build` bị chặn vì `vite`/`next` không nằm trong `NPX_ALLOWED_BINS` (nay tách thành `NPX_REQUIRED_SUBCOMMANDS` — vẫn chặn `vite dev`/`next dev`).
- [x] **Ghi chú bảo mật (chủ ý)**: `find`/`fd` vẫn NGOÀI allowlist dù `SAFE_COMMAND_PATTERNS` của `lib/auto-pilot.ts` có liệt kê — `find ... -exec <cmd> +` và `-delete` chạy/ghi được mà tokenizer không chặn (không cần dấu `;`), nên hai binary này phải đòi phê duyệt thay vì auto-approve.
- **Flaky theo môi trường**: `tests/web-backend.test.ts` phụ thuộc mạng (DuckDuckGo/SearXNG) — khi pass khi fail tùy kết nối, không phải lỗi logic.
