import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('DESIGN.md — Vyen design-system contract', () => {
  const root = path.resolve(__dirname, '..');
  const globalsCssPath = path.join(root, 'app/globals.css');
  const sidebarPath = path.join(root, 'components/sidebar.tsx');
  const backupReminderPath = path.join(root, 'components/backup-reminder.tsx');
  const tailwindConfigPath = path.join(root, 'tailwind.config.ts');

  const read = (p: string) => fs.readFileSync(p, 'utf8');
  const readRel = (rel: string) => read(path.resolve(__dirname, rel));

  /**
   * Bảng màu chuẩn — DESIGN.md §2. Mọi giá trị ở đây PHẢI khớp `hex` trong
   * tailwind.config.ts; test 'bảng màu trong test khớp tailwind.config.ts'
   * kiểm tra điều đó theo cả hai chiều.
   */
  const PALETTE_TOKENS = new Set([
    /* Bề mặt — 5 tầng */
    '#07090d', '#0b0e13', '#12161d', '#1a1f27', '#20262f',
    /* Chữ — 4 tầng */
    '#e8eaed', '#a7b0bb', '#7c8794', '#5c6673',
    /* Viền — 3 tầng */
    '#1c222a', '#3a4552', '#5a6675',
    /* Nhấn & trạng thái */
    '#7cb7ea', '#3f6a94', '#5bbd7f', '#e0a04a', '#ef6f5c', '#63b3d6', '#a78bd4',
    /* Diff */
    '#6cc98d', '#f08578', '#8d97a3',
  ]);

  /**
   * Danh sách file chịu hợp đồng. Đây là một HỢP ĐỒNG, không phải danh sách
   * "những file tình cờ sạch": file có trong đây thì phải sạch, file không có
   * trong đây thì KHÔNG AI canh. Mở rộng danh sách là việc của từng đợt
   * migrate (DESIGN.md §10.2).
   */
  const TOKENIZED_COMPONENTS = [
    '../components/composer.tsx',
    '../components/thinking-menu.tsx',
    '../components/model-selector.tsx',
    '../components/chat-export-menu.tsx',
    '../components/sidebar.tsx',
    '../components/branch-switcher.tsx',
    '../components/staging-panel.tsx',
    '../components/plan-panel.tsx',
    '../components/tools-panel.tsx',
    '../components/subagent-card.tsx',
    '../components/diff-confirm.tsx',
    '../components/shell-confirm.tsx',
    '../components/workspace-checkpoints.tsx',
    '../components/context-meter.tsx',
    '../components/backup-reminder.tsx',
    '../components/chat/message-list.tsx',
    '../components/chat/message-item.tsx',
    '../components/chat/message-usage.tsx',
    '../components/message-status-badge.tsx',
    '../components/chat/status-line.tsx',
    '../components/chat/tool-trace.tsx',
    '../components/chat/orchestrator-badge.tsx',
    '../components/settings-dialog.tsx',
    /* Các section + tab tách ra từ settings-dialog.tsx — cùng thuộc bề mặt
       Settings nên phải chịu chung hợp đồng, nếu không chúng sẽ lệch chuẩn dần. */
    '../components/settings/memories-section.tsx',
    '../components/settings/vision-model-section.tsx',
    '../components/settings/slash-commands-section.tsx',
    '../components/settings/auto-backup-section.tsx',
    '../components/settings/appearance-tab.tsx',
    '../components/settings/providers-tab.tsx',
    '../components/settings/safety-tab.tsx',
    '../components/settings/extensions-tab.tsx',
    '../components/settings/memory-tab.tsx',
    '../components/settings/data-tab.tsx',
    '../components/settings/section-loading.tsx',
    '../components/tool-permissions-table.tsx',
    '../components/provider-manager.tsx',
    '../components/mcp/mcp-settings-panel.tsx',
    '../components/scheduler/scheduler-panel.tsx',
    '../components/routing-settings-panel.tsx',
    '../components/settings-skills.tsx',
    '../components/settings-agent-memory.tsx',
    '../components/usage-stats.tsx',
    '../components/hud/agent-hud.tsx',
    '../components/chat-error-boundary.tsx',
    '../components/vyen-logo.tsx',
    '../components/chat/stream-bubble.tsx',
    '../components/chat-interface.tsx',
    '../components/markdown-renderer.tsx',
    /* Màn hình lỗi — mới được đưa về token, trước đó không ai canh. */
    '../app/error.tsx',
    '../app/global-error.tsx',
    '../app/page.tsx',
    '../app/globals.css',
    '../app/layout.tsx',
  ];

  /** Họ màu Tailwind mặc định — dùng là ra ngoài bảng token. */
  const TAILWIND_PALETTE =
    /\b(?:text|bg|border|ring|from|to|via|decoration|outline|fill|stroke|shadow|accent|caret|divide|placeholder)-(?:red|blue|green|yellow|amber|orange|rose|purple|violet|indigo|sky|cyan|teal|emerald|lime|pink|fuchsia|zinc|slate|gray|grey|neutral|stone)-[0-9]{2,3}\b/g;

  /**
   * Token chữ bị cấm dùng kèm modifier opacity (`text-tertiary/60`).
   * DESIGN.md §2.2: 60% của một màu đã chọn để đạt WCAG AA thì không còn đạt.
   * Chỉ bắt token CHỮ — `bg-surface/60`, `border-danger/40` vẫn hợp lệ vì
   * nền/viền không mang thông tin chữ.
   */
  const TEXT_OPACITY =
    /\btext-(?:text-muted|text-primary|primary|secondary|tertiary|disabled|accent|success|warning|danger|info|reasoning)\/\d{1,3}\b/g;

  function collectStyleFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collectStyleFiles(full, out);
      else if (/\.(tsx?|css)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* globals.css — con trỏ, prose, bevel                                */
  /* ------------------------------------------------------------------ */

  it('globals.css định nghĩa @keyframes blink với bước chuyển opacity 1 và 0', () => {
    const css = read(globalsCssPath);
    expect(css).toMatch(/@keyframes\s+blink\s*\{/);
    expect(css).toMatch(/0%,\s*100%\s*\{\s*opacity:\s*1;\s*\}/);
    expect(css).toMatch(/50%\s*\{\s*opacity:\s*0;\s*\}/);
  });

  it('.streaming-caret::after dùng token accent, font mono, blink — DESIGN.md §3.2', () => {
    const css = read(globalsCssPath);
    const match = css.match(/\.streaming-caret::after\s*\{([^}]+)\}/);
    expect(match).toBeTruthy();
    const body = match![1];
    expect(body).toContain("content: ' █'");
    /* Token, không phải hex thô: cùng hợp đồng, cách viết mới. */
    expect(body).toContain('color: rgb(var(--accent))');
    expect(body).toContain('var(--font-mono)');
    expect(body).toContain('animation: blink 1s step-end infinite');
  });

  it('.terminal-cursor dùng token accent, font mono, blink', () => {
    const css = read(globalsCssPath);
    const match = css.match(/\.terminal-cursor\s*\{([^}]+)\}/);
    expect(match).toBeTruthy();
    const body = match![1];
    expect(body).toContain('color: rgb(var(--accent))');
    expect(body).toContain('var(--font-mono)');
    expect(body).toContain('animation: blink 1s step-end infinite');
  });

  it('con trỏ streaming bám inline ở cuối dòng prose mà không rớt dòng', () => {
    const css = read(globalsCssPath);
    expect(css).toContain('.claude-prose.streaming-caret .claude-md-root');
    expect(css).toContain('.claude-prose.streaming-caret .claude-md-root > :last-child:is(p, h1, h2, h3, li)');
  });

  /**
   * Khối này là lý do test này tồn tại. Trước đây `.vyen-bevel*` có ĐÚNG 0
   * lượt dùng trong khi DESIGN.md gọi nó là "nguyên tắc quan trọng nhất", và
   * hiệu ứng được dán tay ở 7 chỗ bằng khối rgba viết tay. Không có assertion
   * nào nhìn thấy điều đó.
   */
  it('bevel tồn tại: đúng MỘT định nghĩa inset 0 1px 0 trong .bevel-out và .bevel-in', () => {
    const css = read(globalsCssPath);
    const out = css.match(/\.bevel-out\s*\{([^}]*)\}/);
    const inn = css.match(/\.bevel-in\s*\{([^}]*)\}/);
    expect(out, 'globals.css thiếu .bevel-out').toBeTruthy();
    expect(inn, 'globals.css thiếu .bevel-in').toBeTruthy();
    /* Mỗi rule có đúng 1 cạnh trên `inset 0 1px 0`. */
    expect(out![1].match(/inset 0 1px 0/g) ?? []).toHaveLength(1);
    expect(inn![1].match(/inset 0 1px 0/g) ?? []).toHaveLength(1);
    /* Bốn cạnh, tất cả inset — không cạnh nào đổi kích thước bố cục. */
    expect(out![1].match(/inset/g) ?? []).toHaveLength(4);
    expect(inn![1].match(/inset/g) ?? []).toHaveLength(4);
    /* Không được dán tay thêm bản sao ở nơi khác. */
    expect(css.match(/inset 0 1px 0/g) ?? []).toHaveLength(2);
  });

  it('recipe trong globals.css @apply class bevel, không viết tay khối rgba', () => {
    const css = read(globalsCssPath);
    /* .surface-panel/.btn-secondary/.settings-card nổi; .field & .btn-primary chìm. */
    for (const selector of ['.surface-panel', '.btn-secondary', '.settings-card', '.field', '.field-sm', '.btn-primary']) {
      const block = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
      expect(block, `globals.css thiếu recipe ${selector}`).toBeTruthy();
      expect(block![1], `${selector} phải @apply một class bevel`).toMatch(/@apply\s+bevel-(?:in|out)\b/);
    }
    /*
     * Nguyên nhân gốc của lỗi "7 khối rgba dán tay": cấu hình chỉ có 2 class
     * này được phép sinh bóng. Bất kỳ `box-shadow` nào khác — kể cả khai báo
     * bằng class riêng — đều là bypass. Xem `rounded-lg` bên dưới: cùng một
     * kiểu lách, cùng hậu quả là tài liệu nói 0px trong khi code là 8px.
     *
     * KHÔNG assert toàn cục `box-shadow` ở đây: `inset` của chính `.bevel-out`
     * / `.bevel-in` hợp lệ, và assertion trên đã kiểm đúng chúng.
     */
    const declared = [...css.matchAll(/^\s*box-shadow\s*:/gm)].length;
    expect(declared, 'chỉ .bevel-out và .bevel-in được khai báo box-shadow').toBe(2);
  });

  /* ------------------------------------------------------------------ */
  /* tailwind.config.ts — bo góc, bóng, bảng màu                        */
  /* ------------------------------------------------------------------ */

  /**
   * Đọc khối cấu hình con. Không import config (nó gọi `require` cho plugin
   * nên tốn side-effect hơn giá trị), và regex giữ được tên biến ở dạng nguồn —
   * thứ mà test thật sự muốn khẳng định.
   */
  function configBlock(start: string, end: string): string {
    const code = read(tailwindConfigPath);
    const from = code.indexOf(start);
    const to = code.indexOf(end, from + 1);
    expect(from, `tailwind.config.ts thiếu ${start}`).toBeGreaterThan(-1);
    expect(to, `tailwind.config.ts thiếu ${end}`).toBeGreaterThan(from);
    return code.slice(from, to);
  }

  it('borderRadius giữ quy tắc vuông: có none/sm/md/full, KHÔNG có lg/xl/2xl/3xl', () => {
    const block = configBlock('borderRadius: {', 'boxShadow: {');
    const keys = [...block.matchAll(/^\s*'?([\w-]+)'?:\s*/gm)].map((m) => m[1]);

    expect(keys).toContain('none');
    expect(keys).toContain('sm');
    expect(keys).toContain('md');
    expect(keys).toContain('full');

    /*
     * PHẦN QUAN TRỌNG: `lg`/`xl`/`2xl`/`3xl` phải KHÔNG tồn tại.
     * Gọi `rounded-lg` khi đó sinh ra KHÔNG CÓ class nào — thà không bo góc
     * còn hơn bo sai. Nếu ai đó định nghĩa lại chúng, 47 chỗ đang gọi
     * `rounded-lg`/`xl`/`2xl` sẽ bật bo tròn ngay lập tức.
     */
    for (const banned of ['lg', 'xl', '2xl', '3xl']) {
      expect(keys, `borderRadius.${banned} không được định nghĩa — sẽ làm rounded-${banned} có tác dụng`).not.toContain(banned);
    }

    expect(block).toMatch(/none:\s*'0px'/);
    expect(block).toMatch(/sm:\s*'3px'/);
    expect(block).toMatch(/md:\s*'5px'/);
    expect(block).toMatch(/DEFAULT:\s*'5px'/);
    expect(block).toMatch(/full:\s*'9999px'/);
  });

  it('boxShadow: bevel-out và bevel-in là hai key DUY NHẤT không phải none', () => {
    const block = configBlock('boxShadow: {', 'fontSize: {');
    const keys = [...block.matchAll(/^\s*'?([\w-]+)'?:\s*/gm)].map((m) => m[1]).filter((k) => k !== 'boxShadow');

    const nonNone = keys.filter((k) => {
      const value = block.match(new RegExp(`^\\s*'?${k}'?:\\s*(.*)$`, 'm'))?.[1] ?? '';
      return !value.startsWith("'none'") && value !== '';
    });
    expect(nonNone.sort()).toEqual(['bevel-in', 'bevel-out']);

    /*
     * Ý định gốc của assertion cũ (`shadow-sm/md/lg/xl/2xl/inner` = 'none')
     * vẫn phải được giữ — ứng dụng cấm bóng mềm. Khẳng định tường minh để một
     * lần đổi tên key không làm rơi mất ý nghĩa.
     */
    for (const soft of ['none', 'DEFAULT', 'sm', 'md', 'lg', 'xl', '2xl', 'inner']) {
      const value = block.match(new RegExp(`^\\s*'?${soft}'?:\\s*(.*)$`, 'm'))?.[1] ?? '';
      expect(value.trim().startsWith("'none'"), `boxShadow.${soft} phải là 'none'`).toBe(true);
    }
  });

  it('giá trị bevel trong config khớp với .bevel-out/.bevel-in trong globals.css', () => {
    const config = read(tailwindConfigPath);
    /*
     * Cắt comment trước khi soi: `.glass-panel` có một đoạn comment nhắc tên
     * `.bevel-out` để giải thích vì sao nó cố tình KHÔNG khai báo box-shadow.
     * Comment là tài liệu, không phải khai báo — cùng lý do mà assertion
     * `rounded-lg` phía dưới cũng cắt comment trước khi kiểm.
     */
    const css = read(globalsCssPath).replace(/\/\*[\s\S]*?\*\//g, '');

    /*
     * So từng LAYER một, không so chuỗi thô: hai bên viết xuống dòng khác nhau,
     * một bên có dấu phẩy một bên không. Nhưng phải cắt tên thuộc tính
     * `box-shadow:` ra trước — nếu không, ở vế CSS segment đầu tiên là
     * `"box-shadow: inset 0 1px 0 …"`, không bắt đầu bằng `inset` nên bị lọc
     * mất, và hợp đồng "đủ 4 cạnh" bị kiểm bằng 3.
     *
     * THỨ TỰ là thông tin: `inset 0 1px 0` (cạnh trên) phải là layer đầu.
     */
    const layers = (value: string) =>
      value
        .split(',')
        .map((x) => x.replace(/\s+/g, ' ').trim().replace(/;$/, '').trim())
        .filter(Boolean);

    for (const name of ['bevel-out', 'bevel-in']) {
      const cfgRaw = config.match(new RegExp(`'${name}':\\s*'([^']*)'`))?.[1];
      expect(cfgRaw, `tailwind.config.ts thiếu boxShadow['${name}']`).toBeTruthy();

      const body = css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      const cssRaw = body.match(/box-shadow\s*:\s*([\s\S]*)/)?.[1] ?? '';
      expect(cssRaw.trim(), `globals.css thiếu khai báo box-shadow cho .${name}`).not.toBe('');

      const a = layers(cfgRaw!);
      const b = layers(cssRaw);
      expect(a, `${name} lệch giữa config và globals.css`).toEqual(b);
      expect(a, `${name} phải có đúng BỐN cạnh`).toHaveLength(4);
      /* Cả bốn đều inset — không cạnh nào đổi kích thước bố cục. */
      expect(
        a.filter((x) => x.startsWith('inset')),
        `${name} có cạnh không inset`,
      ).toHaveLength(4);
    }
  });

  it('bảng màu trong test khớp tailwind.config.ts theo cả hai chiều', () => {
    const config = read(tailwindConfigPath);
    const block = config.slice(config.indexOf('const hex = {'), config.indexOf('} as const'));
    /* Key trong `hex` hoặc bằng quote ('accent-dim') hoặc không (sunken). */
    const configHexes = new Set(
      [...block.matchAll(/^\s*'?([\w-]+)'?:\s*'(#[0-9a-fA-F]{6})'/gm)].map((m) => m[2].toLowerCase()),
    );
    expect(configHexes.size, 'không đọc được mảng `hex` trong tailwind.config.ts').toBe(22);

    /* Mỗi hex trong PALETTE_TOKENS phải tồn tại thật trong config. */
    for (const h of PALETTE_TOKENS) {
      expect([...configHexes], `test biết ${h} nhưng tailwind.config.ts không có`).toContain(h);
    }
    /* Và mỗi hex trong config phải được test biết — nếu không, thêm token mới
       sẽ không bị bắt. */
    for (const h of configHexes) {
      expect([...PALETTE_TOKENS], `tailwind.config.ts có ${h} mà test chưa biết`).toContain(h);
    }
  });

  it('không còn biến --brand-hover (no-op trùng --brand) trong globals.css', () => {
    const css = read(globalsCssPath);
    expect(css).not.toMatch(/--brand-hover\s*:/);
  });

  it('thang zinc lật bậc đã bị gỡ: chỉ còn đúng 3 bậc alias', () => {
    const config = read(tailwindConfigPath);
    const block = config.slice(config.indexOf('zinc: {'), config.indexOf('} as const', config.indexOf('zinc: {')));
    const steps = [...block.matchAll(/^\s*(\d+):/gm)].map((m) => m[1]);
    expect(steps).toEqual(['200', '500', '600']);
    /* Còn sót bậc nào khác là thang lật bậc sống lại. */
    expect(steps).not.toContain('50');
    expect(steps).not.toContain('950');
  });

  /* ------------------------------------------------------------------ */
  /* Component — hex, Tailwind palette, opacity, bo góc                 */
  /* ------------------------------------------------------------------ */

  it('bề mặt hợp đồng chỉ dùng hex trong bảng màu DESIGN.md §2', () => {
    for (const rel of TOKENIZED_COMPONENTS) {
      /*
       * Cắt comment trước khi soi, vì lý do giống hệt assertion bevel ở trên:
       * một tên màu nhắc trong comment ("hairline #495059") là tài liệu, không
       * phải màu được vẽ ra. Comment gọi tên màu cũ là điều ĐÚNG — nó giải thích
       * vì sao class đó dùng token nào.
       */
      const code = readRel(rel).replace(/\/\*[\s\S]*?\*\//g, '');
      const hexes = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      /*
       * KHÔNG bắt buộc phải còn hex: dùng class token ngữ nghĩa là trạng thái
       * TỐT HƠN hex thô. Hợp đồng đúng là: hex nào còn lại cũng phải thuộc bảng.
       */
      const offPalette = [...new Set(hexes.map((h) => h.toLowerCase()))].filter((h) => !PALETTE_TOKENS.has(h));
      expect(offPalette, `${rel} dùng màu ngoài bảng: ${offPalette.join(', ')}`).toEqual([]);
    }
  });

  it('bề mặt hợp đồng không dùng class màu Tailwind mặc định (red-500, zinc-400…)', () => {
    for (const rel of TOKENIZED_COMPONENTS) {
      const hits = [...new Set(readRel(rel).match(TAILWIND_PALETTE) ?? [])];
      expect(hits, `${rel} dùng màu Tailwind ngoài bảng: ${hits.join(', ')}`).toEqual([]);
    }
  });

  it('không dùng modifier opacity trên token CHỮ (text-tertiary/60 — fail WCAG AA)', () => {
    for (const rel of TOKENIZED_COMPONENTS) {
      const hits = [...new Set(readRel(rel).match(TEXT_OPACITY) ?? [])];
      expect(hits, `${rel} dùng token chữ kèm opacity: ${hits.join(', ')}`).toEqual([]);
    }
  });

  it('không dùng trắng tinh cho chữ — token chữ tối nhất là #e8eaed', () => {
    for (const rel of TOKENIZED_COMPONENTS) {
      const code = readRel(rel);
      // `bg-white/[0.04]` là lớp phủ trung tính, không phải màu chữ — vẫn cho phép.
      expect(code, `${rel} còn text-white`).not.toMatch(/\btext-white\b/);
      expect(code, `${rel} còn color: #fff`).not.toMatch(/color:\s*#f{3,6}\b/i);
    }
  });

  it('mọi file trong hợp đồng đều dùng ít nhất một class token ngữ nghĩa', () => {
    /*
     * Danh sách token theo CẢ HAI thế hệ: bảng mới và alias tạm còn sót
     * (DESIGN.md §6.1). File đã migrate sang tên mới và file chưa migrate đều
     * phải thoả — nếu chỉ nhận tên mới thì các file đang migrate sẽ đỏ giả.
     */
    const tokenUse =
      /\b(?:bg|text|border|ring|from|to|via|decoration|outline|fill|stroke|divide|placeholder|shadow)-(?:sunken|base|surface|raised|overlay|primary|secondary|tertiary|disabled|subtle|default|strong|accent|accent-dim|success|warning|danger|info|reasoning|diff-add|diff-del|diff-ctx|diff-(?:added|removed|context)|bg-deep|bg-canvas|panel-bg|panel-soft|surface-elevated|surface-subtle|surface-code|text-primary|text-muted|border-hairline|border-subtle|border-control|border-hover|accent-steel|status-success|status-warning|status-error)\b/g;

    const missing: string[] = [];
    for (const rel of TOKENIZED_COMPONENTS) {
      if (rel === '../app/globals.css' || rel === '../app/layout.tsx') continue;
      const uses = (readRel(rel).match(tokenUse) ?? []).length;
      if (uses === 0) missing.push(rel);
    }
    expect(missing, `chưa dùng token ngữ nghĩa: ${missing.join(', ')}`).toEqual([]);
  });

  it('không còn khối override [class*="rounded-lg"] trong globals.css', () => {
    /*
     * Khối này từng đè lên theme.borderRadius, khiến cấu hình 0px chưa bao giờ
     * có tác dụng với các class đó. Đã xoá; nếu nó quay lại thì cấu hình
     * borderRadius trở lại thành vô hiệu.
     *
     * Chỉ soi phần KHAI BÁO, không soi toàn file: globals.css có một đoạn
     * comment giải thích chính khối này (app/globals.css:184) và nhắc lại
     * tên class — đó là tài liệu, không phải CSS. Cắt comment trước khi kiểm.
     */
    const css = read(globalsCssPath).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/\[class\*=["']rounded-lg["']\]/);
    /* Tương tự: `.rounded-full` được phép (hình tròn), nhưng không được override
       cả nhóm bằng !important ngoài quy tắc đã nêu ở DESIGN.md §4.1. */
    expect(css).toMatch(/\.rounded-full/);
  });

  it('components/sidebar.tsx: mọi nút đều vuông góc, không bo tròn lửng lơ', () => {
    const sidebarCode = read(sidebarPath);
    const buttonBlocks = sidebarCode.split('<button').slice(1);
    expect(buttonBlocks.length).toBeGreaterThan(5);

    for (const block of buttonBlocks) {
      const tagContent = block.split('</button>')[0];
      expect(tagContent).toMatch(/className=[\s\S]*?rounded-none/);
      expect(tagContent).not.toMatch(/className=[\s\S]*?rounded-(?:sm|md|lg|xl|2xl|3xl|full)\b/);
    }
  });

  it('components/sidebar.tsx: tooltip phím tắt chuẩn hóa Ctrl+\\ trong JSX', () => {
    const sidebarCode = read(sidebarPath);
    expect(sidebarCode).not.toContain('title="Thu gọn (Ctrl+\\\\)"');
    expect(sidebarCode).toContain('title="Thu gọn (Ctrl+\\)"');
  });

  it('components/backup-reminder.tsx: mọi button đều vuông góc', () => {
    const code = read(backupReminderPath);
    const buttonBlocks = code.split('<button').slice(1);
    expect(buttonBlocks.length).toBeGreaterThanOrEqual(3);

    for (const block of buttonBlocks) {
      expect(block.split('</button>')[0]).toMatch(/className=[\s\S]*?rounded-none/);
    }
  });

  it('composer chạy full-bleed: không còn khung max-w-thread căn giữa', () => {
    const code = readRel('../components/composer.tsx');
    expect(code).not.toMatch(/max-w-thread/);
    expect(code).toContain('w-full pb-[env(safe-area-inset-bottom)]');
  });

  it('nút có nhãn trong composer nới vùng chạm lên mốc 44px của mobile', () => {
    // Base 16px: nút cao 32px (h-8) nên `after:-inset-[6px]` cho đúng 44px —
    // mốc vùng chạm tối thiểu của WCAG 2.5.5 trên mobile.
    for (const rel of ['../components/thinking-menu.tsx', '../components/model-selector.tsx']) {
      const code = readRel(rel);
      const trigger = code.split('aria-haspopup')[1]?.split('>')[0] ?? '';
      expect(trigger, `${rel}: trigger thiếu vùng chạm mở rộng`).toMatch(/after:-inset-\[6px\]/);
    }
  });

  it('#55779b (4.06:1 trên #0d1116 — FAIL WCAG AA) đã bị loại khỏi components/ và app/', () => {
    const roots = ['../components', '../app'].map((r) => path.resolve(__dirname, r));
    const offenders = roots
      .flatMap((root) => collectStyleFiles(root))
      .filter((file) => /#55779b/i.test(read(file)))
      .map((file) => path.relative(root, file));

    expect(offenders, `còn dùng #55779b: ${offenders.join(', ')}`).toEqual([]);
  });

  it('app là dark-only: không có biến thể dark: nào trong component', () => {
    /*
     * §7 — ứng dụng cố ý chỉ có một theme. Nếu ai đó thêm `dark:` trở lại thì
     * đó là dấu hiệu đang cố dựng nhánh sáng nửa vời thứ hai.
     */
    for (const rel of TOKENIZED_COMPONENTS) {
      expect(readRel(rel), `${rel} dùng biến thể dark:`).not.toMatch(/(?:^|[\s"'`:])dark:/m);
    }
  });
});
