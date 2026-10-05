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
   *
   * Nền GIẤY TRẮNG (light-only). Bề mặt gần như toàn trắng — chiều sâu đến từ
   * VIỀN MỰC và bóng lệch cứng, không phải từ độ sáng của nền.
   */
  const PALETTE_TOKENS = new Set([
    /* Bề mặt — 5 tầng, đều nhau trên nền trắng */
    '#f7f7f7', '#fcfcfc', '#ffffff', '#f5f5f5', '#ffffff',
    /* Chữ — 4 tầng, đều đạt WCAG AA trên nền trắng */
    '#18181b', '#575757', '#6f6f6f', '#a3a3a3',
    /* Viền — 3 tầng; `default` đạt 3.03:1 cho ranh giới control */
    '#e5e5e5', '#949494', '#525252',
    /* Nhấn & trạng thái */
    '#2a7360', '#7fb8a6', '#f0f4f3', '#ffffff', '#167a4a', '#9a6206', '#b3261e', '#0369a1', '#6d4aa8',
    /* Diff */
    '#1f7a3d', '#b3261e', '#575757',
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

  /**
   * Class VIỀN mà preflight bơm màu hộ phụ mà không cần hỏi.
   *
   * Tailwind preflight đặt `border: 0 solid #e5e7eb` cho MỌI phần tử. Nên khi
   * ai đó viết `border` (chỉ đặt độ rộng) mà quên class màu, class đó sinh ra
   * **không có `border-color`** — và phần tử kế thừa luôn `#e5e7eb` từ preflight.
   * Trên nền tối đó là 13.4:1, sáng hơn cả `text-primary` (`#e8eaed`): một viền
   * trắng sáng ơ lên bố cục, nặng hơn nhiều so với chữ nó bao quanh.
   *
   * Vì sao lỗi này SỐNG SÓT qua mọi assertion phía trên: `#e5e7eb` do Tailwind
   * chèn lúc build, không bao giờ xuất hiện trong source. Test chỉ soi source thì
   * không có gì để đỏ. Đây là lý do phải soi CẶP class, chứ không soi màu.
   */
  const BORDER_SIDE = 'trblxy';
  /** Đặt ĐỘ RỘNG: `border`, `border-t`, `border-2`, `border-l-4`… */
  const BORDER_WIDTH = new RegExp(`^border(?:-[${BORDER_SIDE}])?(?:-\\d+)?$`);
  /** Đặt MÀU: `border-subtle`, `border-transparent`, `border-danger/40`… */
  const BORDER_COLOR = new RegExp(`^border-(?![${BORDER_SIDE}](?:-\\d+)?$)(?!\\d+$).+$`);
  /**
   * `border-0` / `border-b-0` đặt độ rộng **0** — không vẽ gì ra, nên không cần
   * màu. Thiếu màu ở đó là vô hại, và bắt nó sẽ dạy người đọc rằng assertion
   * này bắt cả những thứ vô hại (rồi họ sẽ tắt nó).
   */
  const isBorderWidth = (token: string) =>
    BORDER_WIDTH.test(token) && !new RegExp(`^border(?:-[${BORDER_SIDE}])?-0$`).test(token);
  /** Đặt MÀU cho `divide-*` — `divide-subtle`, `divide-subtle/70`. */
  const DIVIDE_COLOR = /^divide-(?![xy](?:-\d+)?$)(?!reverse$)[a-z][\w-]*(?:\/[\d.]+)?$/;

  /**
   * Hai modifier opacity trên MỘT class. Tailwind chỉ parse được một `/alpha`
   * nên `border-success/40/60` không sinh CSS nào — viền đơn giản BIẾN MẤT mà
   * không có dấu vết. Nhìn code thì thấy còn `border-`, nên tưởng đang có viền.
   */
  const DOUBLE_OPACITY =
    /\b(?:bg|text|border|ring|divide|fill|stroke|decoration|outline|placeholder)-[a-z][\w-]*\/\d{1,3}\/\d{1,3}\b/g;

  /**
   * Class CHẾT — còn được gọi trong JSX nhưng không còn sinh CSS. Nguy hiểm vì
   * người đọc tưởng còn tác dụng, và "sửa" nó bằng cách tinh chỉnh class đứng
   * cạnh sẽ trượt: mọi thứ trông đúng trừ đúng khối không vẽ gì.
   * Nguồn xác nhận: DESIGN.md §5.5 (khung góc) + `boxShadow` trong
   * tailwind.config.ts (hai key `'none'`).
   */
  const DEAD_CLASSES =
    /\b(?:pi-corner-[a-z-]+|pi-frame|vyen-frame|vyen-corner-[a-z-]+|shadow-reasoning-glow|shadow-ambient-glow|glass-panel|custom-scrollbar|rounded-ink|rounded-wobble|accent-mint|font-hand)\b/g;

  function collectStyleFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collectStyleFiles(full, out);
      else if (/\.(tsx?|css)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  /**
   * Cắt comment TRƯỚC khi soi. Comment giải thích lịch sử hay nhắc tên class đã
   * chết ("khối này từng dùng `.glass-panel`") — đó là TÀI LIỆU, không phải code
   * gọi class. Không cắt thì assertion báo đúng những dòng nên giữ lại.
   */
  const stripComments = (code: string) =>
    /* Thay bằng newline thay vì xoá hẳn: xoá hẳn làm số dòng trong thông điệp
     * đỏ lệch với số dòng thật, và người đọc phải tự dò lại mới thấy. */
    code.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));

  /** Mọi file component + app, không kể `node_modules`. */
  const componentFiles = () =>
    ['../components', '../app']
      .map((rel) => collectStyleFiles(path.resolve(__dirname, rel)))
      .flat()
      .filter((file) => /\.(tsx?|ts)$/.test(file))
      .map((file) => path.relative(root, file).replace(/\\/g, '/'));

  /** File + số dòng, để thông điệp đỏ chỉ đúng chỗ. */
  const lineOf = (code: string, index: number) => code.slice(0, index).split('\n').length;

  /** Đọc theo đường dẫn quy về GỐC REPO (khác `readRel`, quy về `tests/`). */
  const readFromRoot = (rel: string) => read(path.resolve(root, rel));

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

  /*
   * HỢP ĐỒNG CHIỀU SÂU (thay cho BEVEL).
   *
   * Lý do khối assertion này tồn tại không đổi so với bản BEVEL: trước đây
   * `.vyen-bevel*` có ĐÚNG 0 lượt dùng trong khi DESIGN.md gọi nó là "nguyên
   * tắc quan trọng nhất", và hiệu ứng được dán tay ở 7 chỗ bằng khối rgba viết
   * tay — không có assertion nào nhìn thấy điều đó. Nay app dùng BÓNG MỀM, và
   * bóng mềm dễ bị lạm dụng hơn nhiều (ai cũng `shadow-*-` một cái), nên bất
   * biến "chỉ 4 nguồn được sinh bóng" phải được canh.
   */
  const DEPTH_SOURCES = ['lift-sm', 'lift-md', 'lift-lg', 'well'] as const;

  it('chiều sâu: đúng 4 nguồn sinh bóng, không có nguồn thứ năm', () => {
    const css = read(globalsCssPath);
    for (const name of DEPTH_SOURCES) {
      const rule = css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`));
      expect(rule, `globals.css thiếu .${name}`).toBeTruthy();
      expect(rule![1], `.${name} phải khai báo box-shadow`).toMatch(/box-shadow\s*:/);
    }

    /*
     * KHÔNG dán tay thêm ở nơi khác. `box-shadow:` xuất hiện đúng 4 lần — mỗi
     * lần là một nguồn. Thêm lần thứ 5 nghĩa là đã có class bóng ngoài hợp
     * đồng, và tailwind.config.ts sẽ lệch với CSS mà không ai thấy.
     */
    const declared = [...css.matchAll(/^\s*box-shadow\s*:/gm)].length;
    expect(
      declared,
      `chỉ ${DEPTH_SOURCES.length} nguồn (${DEPTH_SOURCES.join(', ')}) được khai báo box-shadow`,
    ).toBe(DEPTH_SOURCES.length);
  });

  it('bóng mềm phải là NGOÀI vùng cho lift-*, và INSIDE cho .well', () => {
    const css = read(globalsCssPath);
    for (const name of ['lift-sm', 'lift-md', 'lift-lg']) {
      const body = css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`))![1];
      expect(body, `.${name} thiếu box-shadow`).toMatch(/box-shadow\s*:/);
      /*
       * Không `inset`: một bộ "nâng" luôn có một cạnh sáng và một cạnh tối, nên
       * nó vẽ cách mà không phải sáng/tối nửa ai ra tri tuyệt đối. Ngược lại,
       * một khối "nổi" mà không có viền sáng ngoài sẽ không tách được khỏi nền.
       */
      expect(body, `.${name} không được dùng inset — bóng sáng phải đổ bóng đổ`).not.toMatch(/inset/);
    }
    /* Ô nhập thì ngược lại: bóng nằm TRONG để đọc ra "khoét vào". */
    const well = css.match(/\.well\s*\{([^}]*)\}/)![1];
    expect(well, '.well phải là bóng inset').toMatch(/box-shadow\s*:[^;]*inset/);
  });

  it('recipe trong globals.css @apply một class chiều sâu hợp lệ', () => {
    const css = read(globalsCssPath);
    /*
     * `.surface-panel`/`.settings-card` nổi (lift-md); `.field` & `.field-sm`
     * chìm (well).
     *
     * `.btn-primary`/`.btn-secondary` KHÔNG còn nằm trong bảng này: chúng
     * không sinh bóng nữa. Nút trên nền trắng không cần đổ bóng để tách —
     * nền tô đậm (primary) hoặc viền 1px (secondary) đã đủ, và thêm bóng
     * chỉ làm mép nút nhoè đi trên nền sáng. Bỏ chúng khỏi bảng là CHỐNG
     * việc bóng quay lại nút, không phải nới lỏng kiểm tra.
     */
    const expected: Array<[string, string]> = [
      ['.surface-panel', 'lift-md'],
      ['.settings-card', 'lift-md'],
      ['.field', 'well'],
      ['.field-sm', 'well'],
    ];
    for (const [selector, depth] of expected) {
      const block = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
      expect(block, `globals.css thiếu recipe ${selector}`).toBeTruthy();
      expect(block![1], `${selector} phải @apply ${depth}`).toMatch(
        new RegExp(`@apply[^;]*\\b${depth}\\b`),
      );
    }
  });

  it('giá trị lift-* trong config khớp BYTE với globals.css', () => {
    const config = read(tailwindConfigPath);
    /*
     * Cắt comment trước khi soi: khối `.lift-*` trong globals.css có đoạn
     * comment giải thích vì sao alpha tăng dần trên nền tối. Comment là tài
     * liệu, không phải khai báo — cùng lý do mà assertion `rounded-lg` bên
     * dưới cũng cắt comment trước khi kiểm.
     */
    const css = read(globalsCssPath).replace(/\/\*[\s\S]*?\*\//g, '');

    /*
     * So từng LAYER, không so chuỗi thô: hai bên viết xuống dòng khác nhau,
     * một bên có dấu phẩy một bên không. Phải cắt tên thuộc tính `box-shadow:`
     * ra trước — nếu không, vế CSS segment đầu tiên là
     * `"box-shadow: 0 1px 2px …"` không bắt đầu bằng `inset` nên bị lọc mất.
     */
    const layers = (value: string) =>
      value
        .split(',')
        .map((x) => x.replace(/\s+/g, ' ').trim().replace(/;$/, '').trim())
        .filter(Boolean);

    /* Số lớp mong đợi: 1 ở lift-sm (nét lệch đơn), 2 ở lift-md/lift-lg (gần + xa). */
    const expectedLayers: Record<string, number> = { 'lift-sm': 1, 'lift-md': 2, 'lift-lg': 2 };

    for (const name of ['lift-sm', 'lift-md', 'lift-lg']) {
      const cfgRaw = config.match(new RegExp(`'${name}':\\s*'([^']*)'`))?.[1];
      expect(cfgRaw, `tailwind.config.ts thiếu boxShadow['${name}']`).toBeTruthy();

      const body = css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      const cssRaw = body.match(/box-shadow\s*:\s*([\s\S]*)/)?.[1] ?? '';
      expect(cssRaw.trim(), `globals.css thiếu khai báo box-shadow cho .${name}`).not.toBe('');

      const a = layers(cfgRaw!);
      const b = layers(cssRaw);
      expect(a, `${name} lệch giữa config và globals.css`).toEqual(b);
      expect(a, `${name} phải có ${expectedLayers[name]} lớp bóng`).toHaveLength(
        expectedLayers[name],
      );
    }
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

  it('borderRadius là thang THẬT theo vai trò, không còn chốt vuông', () => {
    const block = configBlock('borderRadius: {', 'boxShadow: {');
    const keys = [...block.matchAll(/^\s*'?([\w-]+)'?:\s*/gm)].map((m) => m[1]);

    /*
     * Đủ 9 bậc. Một bậc thiếu nghĩa là code gọi tên đó không sinh class nào.
     *
     * `ink`/`wobble` (bo BẤT ĐỐI XỨNG kiểu vẽ tay) đã bị GỠ khỏi hệ. Nếu
     * chúng quay lại thì mọi chỗ còn gọi `rounded-ink` sẽ vẽ ra bo lệch,
     * phá đúng thứ ta muốn: một bán kính cho cả bốn góc.
     */
    for (const key of ['none', 'sm', 'DEFAULT', 'md', 'lg', 'xl', '2xl', '3xl', 'full']) {
      expect(keys, `borderRadius.${key} phải tồn tại`).toContain(key);
    }
    for (const gone of ['ink', 'wobble']) {
      expect(keys, `borderRadius.${gone} đã bị gỡ — bo bất đối xứng không thuộc hệ này`).not.toContain(gone);
    }

    /*
     * THANG PX PHẢI TĂNG DẦN. Nếu ai đó sửa `xl` thành 4px thì giao diện co
     * lại mà không test nào đỏ.
     *
     * Mọi bậc phải là MỘT số px. Bất kỳ giá trị nào chứa dấu `/` (dạng 8 bán
     * kính `A B C D / E F G H` của hệ cũ) hoặc nhiều số là bo bất đối xứng
     * quay lại — và `px()` ở trên sẽ đọc ra `NaN` làm test đỏ.
     */
    const px = (key: string) => {
      const v = block.match(new RegExp(`^\\s*'?${key}'?:\\s*'([\\d.]+)px'`, 'm'))?.[1];
      expect(v, `borderRadius.${key} phải là số px`).toBeTruthy();
      return Number(v);
    };
    const order = ['none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'];
    for (let i = 1; i < order.length; i++) {
      expect(
        px(order[i]),
        `borderRadius.${order[i]} phải lớn hơn ${order[i - 1]}`,
      ).toBeGreaterThan(px(order[i - 1]));
    }
    expect(px('full'), 'rounded-full phải lớn hơn bậc lớn nhất').toBeGreaterThan(px('3xl'));
    expect(px('none'), 'rounded-none = 0px').toBe(0);

    /*
     * BO GÓC PHẢI ĐỀU — đây là bất biến MỚI, đảo ngược bất biến cũ.
     *
     * Hệ cũ bắt buộc bo bất đối xứng (`ink`/`wobble`, dạng 8 giá trị). Hệ này
     * bỏ hẳn chúng vì bán kính lệch nhau làm mép chữ dịch khi chiều cao khối
     * đổi — cùng một nội dung mà hai lần hiển thị lệch nhau. Assertion này
     * bắt BẤT ĐỐI XỨNG quay lại dưới dạng bất kỳ key nào trong thang.
     */
    for (const key of keys) {
      const v = block.match(new RegExp(`^\\s*'?${key}'?:\\s*'([^']*)'`, 'm'))?.[1];
      if (v === undefined) continue;
      expect(
        v,
        `borderRadius.${key} = "${v}" — phải là MỘT số px, không phải dạng 8 bán kính`,
      ).toMatch(/^\d+(\.\d+)?px$/);
    }
  });

  it('boxShadow: chỉ lift-sm/md/lg được sinh bóng, key mặc định KHÔNG bật lại', () => {
    const block = configBlock('boxShadow: {', 'fontSize: {');
    const keys = [...block.matchAll(/^\s*'?([\w-]+)'?:\s*/gm)].map((m) => m[1]).filter((k) => k !== 'boxShadow');

    /*
     * Chỉ ba key `lift-*` được phép sinh bóng. Tên `sm`/`md`/`lg`/`xl`/`2xl`
     * bị GỠ HẲN khỏi cấu hình (không còn key, nên `shadow-sm` không sinh CSS) —
     * nếu ai đó thêm lại, giao diện sẽ bị bóng mềm lạc lõng ở khắp nơi mà
     * không test nào bắt.
     */
    for (const banned of ['sm', 'md', 'lg', 'xl', '2xl']) {
      expect(keys, `boxShadow.${banned} không được định nghĩa — bóng mềm lọt vào app`).not.toContain(banned);
    }
    expect(keys.sort()).toEqual(['DEFAULT', 'inner', 'lift-lg', 'lift-md', 'lift-sm', 'none']);

    /*
     * Và các key còn lại phải là 'none' — ô nhập chìm dùng `.well`, không dùng
     * `shadow-inner` của Tailwind (nó là inset một chiều, không khớp `.well`).
     */
    for (const flat of ['none', 'DEFAULT', 'inner']) {
      const value = block.match(new RegExp(`^\\s*'?${flat}'?:\\s*(.*)$`, 'm'))?.[1] ?? '';
      expect(value.trim().startsWith("'none'"), `boxShadow.${flat} phải là 'none'`).toBe(true);
    }
  });

  it('bảng màu trong test khớp tailwind.config.ts theo cả hai chiều', () => {
    const config = read(tailwindConfigPath);
    const block = config.slice(config.indexOf('const hex = {'), config.indexOf('} as const'));
    /* Key trong `hex` hoặc bằng quote ('accent-dim') hoặc không (sunken). */
    const configHexes = new Set(
      [...block.matchAll(/^\s*'?([\w-]+)'?:\s*'(#[0-9a-fA-F]{6})'/gm)].map((m) => m[2].toLowerCase()),
    );
    /*
     * Đếm theo GIÁ TRỊ hex đã khử trùng, không theo số key.
     *
     * Bảng sáng cố ý dùng lại một vài màu cho nhiều vai trò — `#ffffff` cho
     * cả `surface`/`overlay`/`on-fill`, `#18181b` cho cả `primary`/`strong`,
     * `#575757` cho cả `secondary`/`diff-ctx` — vì trên giấy trắng, "nền" và
     * "chữ trên nền tô đậm" là hai câu hỏi khác nhau về CÙNG một màu.
     * 24 key → 20 giá trị phân biệt.
     */
    expect(configHexes.size, 'không đọc được mảng `hex` trong tailwind.config.ts').toBe(20);

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

  /*
   * Regression: `--border-hairline` và `--line` cùng giữ `73 80 89` (=
   * màu cũ `#495059`) suốt thời gian migrate, và không ai bắt được vì
   * assertion bề mặt bên dưới chỉ soi COMPONENT — token lạ nằm trong chính
   * file định nghĩa nên không bao giờ đi qua nó.
   *
   * Nên nay kiểm thẳng `app/globals.css`: MỌI giá trị màu khai báo ở đó
   * phải thuộc bảng ở trên. Token alias ghi "= --token-kia" thì hợp lệ vì
   * trỏ tới bảng; token giữ nguyên màu cũ thì không.
   */
  it('mọi giá trị màu khai báo trong globals.css đều thuộc bảng màu §2', () => {
    const css = read(globalsCssPath);

    /* Bảng §2 lưu dạng hex, globals.css khai báo dạng kênh RGB. Chuyển hex
     * sang "r g b" để so trực tiếp với những gì CSS thật sự ghi. */
    const ALLOWED = new Set(
      [...PALETTE_TOKENS].map((hex) => {
        const n = parseInt(hex.slice(1), 16);
        return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
      }),
    );

    const declared = [...css.matchAll(/^\s*(--[\w-]+):\s*(\d{1,3}\s+\d{1,3}\s+\d{1,3})\s*;/gm)];
    expect(
      declared.length,
      'không đọc được token màu nào trong globals.css — regex chắc hỏng',
    ).toBeGreaterThan(0);

    for (const m of declared) {
      expect(
        ALLOWED.has(m[2]!.replace(/\s+/g, ' ')),
        `${m[1]} = ${m[2]} không thuộc bảng màu §2 — màu sót từ palette cũ`,
      ).toBe(true);
    }
  });

  it('token alias chết đã được gỡ khỏi cả globals.css lẫn tailwind.config.ts', () => {
    /* Cặp này từng tồn tại ở CẢ HAI nơi mà không component nào dùng. Gỡ
     * đúng một nơi còn sót nơi kia sẽ để class trỏ vào token không tồn tại. */
    const css = read(globalsCssPath);
    const config = read(tailwindConfigPath);
    for (const token of ['--border-hairline', '--line']) {
      expect(css, `globals.css còn ${token}`).not.toMatch(
        new RegExp(`^\\s*${token}\\s*:`, 'm'),
      );
      expect(config, `tailwind.config.ts còn map ${token}`).not.toContain(
        `token('${token}')`,
      );
    }
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

  it('không dùng HAI modifier opacity trên một class — class đó không sinh CSS nào', () => {
    /*
     * `border-success/40/60` nghe có vẻ hợp lý nhưng Tailwind chỉ parse được MỘT
     * `/alpha`; class không khớp mẫu nên KHÔNG sinh dòng CSS nào. Hậu quả không
     * phải "màu sai" mà là viền biến mất — code vẫn còn `border-` nên người
     * đọc tưởng đang có viền. Đã có 5 chỗ mắc lỗi này (DESIGN.md §6.1).
     */
    for (const rel of TOKENIZED_COMPONENTS) {
      const hits = [...new Set(readRel(rel).match(DOUBLE_OPACITY) ?? [])];
      expect(
        hits,
        `${rel} có class hai modifier opacity (không sinh CSS): ${hits.join(', ')}`,
      ).toEqual([]);
    }
  });

  /*
   * VIỀN KHÔNG MÀU — lỗ hổng nghiêm trọng nhất của hợp đồng này.
   *
   * Bối cảnh: preflight của Tailwind đặt `border: 0 solid #e5e7eb` cho mọi phần
   * tử. `border` (độ rộng) và `border-<màu>` là hai utility ĐỘC LẬP; viết một
   * cái không kèm cái kia thì phần tử kế thừa `#e5e7eb` từ preflight. Trên nền
   * tối, `#e5e7eb` đạt 13.4:1 — SÁNG HƠN CẢ `text-primary` (`#e8eaed`). Một viền
   * trắng sáng ơ lên bố cục làm nổi khối mạnh hơn cả chữ nó bao quanh, và đó là
   * hệ quả của một class trông hoàn toàn bình thường khi đọc code.
   *
   * Vì sao mọi assertion phía trên bỏ lọt: chúng soi MÀU trong source, mà
   * `#e5e7eb` do Tailwind chèn lúc build — không bao giờ xuất hiện trong file nguồn.
   * Không có gì để đỏ. Đây là lý do phải kiểm CẶP class thay vì kiểm màu.
   */
  it('recipe @apply đặt độ rộng viền thì phải @apply kèm màu', () => {
    const css = stripComments(read(globalsCssPath));
    /* Cặp ngoặc phẳng: đủ cho mọi recipe trong `@layer components`. */
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    expect(blocks.length, 'không đọc được khối rule nào trong globals.css — regex chắc hỏng').toBeGreaterThan(0);

    const offenders: string[] = [];
    let checked = 0;
    for (const block of blocks) {
      const selector = block[1]!.trim().split('\n').pop()!.trim();
      for (const statement of block[2]!.split(';')) {
        if (!/@apply\b/.test(statement)) continue;
        const tokens = statement.replace(/@apply\s*/, '').split(/\s+/).filter(Boolean);
        const widths = tokens.filter(isBorderWidth);
        if (widths.length === 0) continue;
        checked++;
        if (!tokens.some((t) => BORDER_COLOR.test(t))) {
          offenders.push(`${selector}: @apply … ${widths.join(' ')} (thiếu border-<màu>)`);
        }
      }
    }
    expect(checked, 'không tìm được lệnh @apply nào đặt viền — regex chắc hỏng').toBeGreaterThan(0);
    expect(
      offenders,
      `recipe viền không màu (kế thừa #e5e7eb từ preflight):\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('class đặt độ rộng viền phải có class màu CÙNG variant trong cùng className', () => {
    /*
     * Nửa JSX của lỗi trên. Cùng luật: `border` ở trạng thái nghỉ cần
     * `border-subtle` ở trạng thái nghỉ; `hover:border` cần `hover:border-<màu>`.
     * So sánh THEO VARIANT chứ không theo "có màu nào đó trong chuỗi" — nếu
     * không, `hover:border` sẽ được tha bằng một `border-subtle` tĩnh ở đúng chỗ
     * mà nó cần đổi màu.
     */
    const files = componentFiles();
    expect(files.length, 'không quét được file nào trong components/ + app/').toBeGreaterThan(20);

    const offenders: string[] = [];
    let scanned = 0;
    for (const rel of files) {
      const code = stripComments(readFromRoot(rel));

      /*
       * `${helper(x)}` trả về class, nhưng scanner không thấy qua lời gọi hàm:
       * nếu không nội dung dung, `border … ${decisionTone(d)}` bị báo nhầm dù
       * hàm đó trả về `border-danger/40` ở cả ba nhánh. Nội dung dung TẤT CẢ
       * lệnh `return '…'` của hàm cục bộ vào đây, rồi lấy chuỗi của hàm được
       * gọi. Hàm định nghĩa ở file khác hoặc class ghép từ biến vẫn không
       * theo được — đó là giới hạn thật, đã ghi ở comment cuối assertion.
       */
      const helperBodies = new Map<string, string>();
      for (const fn of code.matchAll(
        /function\s+(\w+)\s*\([^)]*\)(?::[^{]+)?\s*\{([\s\S]*?)\n\}/g,
      )) {
        helperBodies.set(
          fn[1]!,
          [...fn[2]!.matchAll(/return\s+'([^']*)'/g)].map((r) => r[1]!).join(' '),
        );
      }
      /*
       * Nội suy hàm cục bộ: `${decisionTone(x)}` → chuỗi class mà hàm đó trả.
       *
       * CHỈ nội suy khi className thật sự GỌI hàm đó. Trước đây quét mọi `${fn(`
       * trong toàn bộ className, nên `decisionTone` ở `audit-viewer-dialog.tsx`
       * bị chèn vào một `className` hoàn toàn không liên quan
       * (`<tbody className="divide-y divide-subtle/70">`) — làm assertion báo
       * nhầm 2 file, và khiến thông điệu đỏ in ra class rỗng.
       */
      const expandHelpers = (text: string) =>
        text.replace(/\$\{\s*(\w+)\s*\(/g, (_, name: string) => {
          const body = helperBodies.get(name);
          /* Chỉ nội suy hàm mà className này thật sự gọi tới. */
          if (body === undefined || !text.includes(name)) return ' ';
          return ' ' + body + ' ';
        });

      /* className="…" | className='…' | className={`…`} */
      const re = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([\s\S]*?)`\})/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        scanned++;
        /*
         * Vế trong `${…}` KHÔNG phải class tĩnh, nhưng các NHÁNH CHUỖI bên trong
         * nó thì có (`${tone(x) ? 'border-danger' : 'border-subtle'}`). Bỏ hẳn
         * `${…}` sẽ báo nhầm hàng loạt; giữ hết thì đếm nhầm chữ trong câu.
         * Nên chỉ giữ lại literal, bỏ biểu thức.
         */
        const rawClass = m[1] ?? m[2] ?? m[3] ?? '';
        const staticText = expandHelpers(rawClass).replace(
          /\$\{([\s\S]*?)\}/g,
          (_, expr: string) =>
            ' ' +
            (expr.match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? [])
              .map((lit) => lit.slice(1, -1))
              .join(' ') +
            ' ',
        );
        const tokens = staticText.split(/\s+/).filter(Boolean);

        /* Gom theo variant: phần trước dấu `:` cuối cùng. */
        const byVariant = new Map<string, string[]>();
        for (const token of tokens) {
          const cut = token.lastIndexOf(':');
          const variant = cut === -1 ? '' : token.slice(0, cut);
          const rest = cut === -1 ? token : token.slice(cut + 1);
          byVariant.set(variant, [...(byVariant.get(variant) ?? []), rest]);
        }

        for (const [variant, group] of byVariant) {
          const widths = group.filter(isBorderWidth);
          /*
           * `divide-y` cũng dính lỗi này: nó đặt `border-top-width` trên con mà
           * MÀU lấy từ chính `border-color` mà preflight bơm — nên `divide-y`
           * trần cũng ra đường kẻ `#e5e7eb`. Phải có `divide-<màu>` cùng variant.
           *
           * Phải TÍNH `divides` TRƯỚC khi `continue`: `isBorderWidth` chỉ khớp
           * `^border`, không bao giờ khớp `divide*`. Nếu để `continue` chạy khi
           * không có `border*` nào thì một className chỉ có `divide-y` bị bỏ qua
           * trọn — và nhánh kiểm bên dưới thành mã chết, im lặng. Đã xác minh bằng
           * probe: `divide-y` trần không đỏ, `border` trần thì đỏ.
           */
          const divides = group.filter((t) => /^divide-[xy](?:-\d+)?$/.test(t));
          if (widths.length === 0 && divides.length === 0) continue;

          /*
           * Repo có dùng `divide-y`, nên không bỏ qua được nhánh này.
           */
          if (divides.length > 0 && !group.some((t) => DIVIDE_COLOR.test(t))) {
            const prefix = variant ? `${variant}:` : '';
            offenders.push(
              `${rel}:${lineOf(code, m.index)} — ${prefix}${divides.join(' ')} không có ${prefix}divide-<màu>`,
            );
          }

          if (group.some((t) => BORDER_COLOR.test(t))) continue;

          /*
           * Ngoại lệ hợp lệ: màu đặt bằng inline `style` thì không cần class màu.
           * Ô meter 5px trong thinking-menu là ví dụ — nó gán `borderColor` cho
           * TỪNG ô theo mức suy luận, động hơn bất kỳ class nào.
           */
          const tag = code.slice(code.lastIndexOf('<', m.index), m.index + 400);
          if (/\bborder-?[Cc]olor\b/.test(tag)) continue;

          /*
           * `widths` rỗng nghĩa là className này chỉ đặt độ rộng qua `divide-*`
           * — việc đó đã được kiểm ở nhánh trên. Không có `border` nào để báo.
           * Thiếu điều kiện này thì `divide-y divide-subtle` (đã có màu) rơi
           * xuống đây và bị báo nhầm với thông điệo rỗng.
           */
          if (widths.length === 0) continue;

          const prefix = variant ? `${variant}:` : '';
          offenders.push(
            `${rel}:${lineOf(code, m.index)} — ${prefix}${widths.join(' ')} không có ${prefix}border-<màu>`,
          );
        }
      }
    }
    expect(scanned, 'không tìm được className nào — regex chắc hỏng').toBeGreaterThan(100);
    expect(
      offenders,
      `viền không màu (kế thừa #e5e7eb từ preflight):\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);

    /*
     * GIỚI HẠN ĐÃ BIẾT, ghi lại để người sau không tưởng assertion phủ hết:
     *   - class dựng từ BIẾN (`const cls = 'border'; … ${cls}`) không theo được.
     *   - helper ở file KHÁC không nội dung dung được — chỉ hàm cục bộ.
     * Cả hai đều hiếm ở repo này (không có `cn()`, không có hằng chứa class), và
     * thiếu cả hai thì test vẫn đỏ — nên hướng lỗi đi, không bỏ sót âm thầm.
     */
  });

  it('class CHẾT đã bị gỡ khỏi hệ thống không được còn gọi trong components/ và app/', () => {
    /*
     * `pi-corner-*` / `pi-frame` / `vyen-frame` / `vyen-corner-*` mất tác dụng
     * khi khối khung góc bị xoá khỏi globals.css (DESIGN.md §5.5);
     * `shadow-reasoning-glow` / `shadow-ambient-glow` là key `'none'` trong
     * tailwind.config.ts nên `shadow-…` sinh ra là `box-shadow: none`;
     * `glass-panel` đã rời khỏi globals.css.
     *
     * Tất cả đều chết trong im lặng: class vẫn còn trong JSX, HTML render ra vẫn
     * có `class="pi-corner-tl"`, chỉ là không có dòng CSS nào khớp. Người đọc
     * thấy class thì tin là nó đang làm gì đó.
     *
     * Quét CẢ `components/` + `app/`, không chỉ hợp đồng — class chết hại
     * nhiều nhất ở đúng những file chưa được migrate.
     */
    const offenders: string[] = [];
    for (const rel of componentFiles()) {
      const code = stripComments(readFromRoot(rel));
      const hits = [...new Set(code.match(DEAD_CLASSES) ?? [])];
      for (const hit of hits) offenders.push(`${rel} — gọi ${hit} (không còn sinh CSS)`);
    }
    expect(offenders, `class chết còn được gọi:\n  ${offenders.join('\n  ')}`).toEqual([]);
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
      /\b(?:bg|text|border|ring|from|to|via|decoration|outline|fill|stroke|divide|placeholder|shadow)-(?:sunken|base|surface|raised|overlay|primary|secondary|tertiary|disabled|subtle|default|strong|accent|accent-dim|accent-soft|success|warning|danger|info|reasoning|diff-add|diff-del|diff-ctx|diff-(?:added|removed|context)|bg-deep|bg-canvas|panel-bg|panel-soft|surface-elevated|surface-subtle|surface-code|text-primary|text-muted|border-hairline|border-subtle|border-control|border-hover|accent-steel|status-success|status-warning|status-error)\b/g;

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

  /*
   * Bo góc theo vai trò. Trước đây hai test này bắt buộc MỌI nút sidebar và
   * backup-reminder phải là `rounded-none` — đúng với thời còn chốt vuông.
   * Nay thang bo góc là thật, nên bất biến mới là: KHÔNG được bỏ trống.
   *
   * Một nút không khai báo bo góc (và không dùng recipe nào mang bo góc) sẽ
   * thừa kế 0px từ preflight — tức rơi về đúng trạng thái vuông sắc mà đợt đổi
   * này đang gỡ.
   *
   * Bo góc có hai đường: viết thẳng `rounded-*` trong JSX, hoặc đi qua RECIPE
   * trong globals.css (`.icon-btn` → `rounded-lg`, `.btn-primary` → `rounded-lg`…).
   * Danh sách `RADIUS_RECIPES` dưới đây là đường thứ hai; nó không phải lỗ hổng
   * vì có assertion riêng bắt buộc mỗi recipe ấy thật sự khai bo góc.
   */
  const RADIUS_RECIPES = [
    'icon-btn',
    'menu-item',
    'btn-primary',
    'btn-secondary',
    'surface-panel',
    'settings-card',
    'field',
    'field-sm',
  ];
  const RADIUS_DIRECT = /className=[\s\S]*?rounded-(?:none|sm|md|lg|xl|2xl|3xl|full)\b/;
  /* Dấu nháy kép và backtick phải escape trong regex source. */
  const CLASSNAME_BOUNDARY = '[\\s"\'`]';
  const RADIUS_ANY = new RegExp(
    `className=[\\s\\S]*?(?:rounded-(?:none|sm|md|lg|xl|2xl|3xl|full)\\b|(?:^|${CLASSNAME_BOUNDARY})(?:${RADIUS_RECIPES.join('|')})\\b)`,
  );

  it('mọi recipe sinh bo góc trong globals.css đều khai báo bo góc thật', () => {
    const css = read(globalsCssPath);
    for (const recipe of RADIUS_RECIPES) {
      const block = css.match(new RegExp(`\\.${recipe}\\s*\\{([^}]*)\\}`));
      expect(block, `globals.css thiếu recipe .${recipe}`).toBeTruthy();
      expect(
        block![1],
        `.${recipe} phải @apply một bậc bo góc — nếu không, mọi nút dùng nó sẽ rơi về 0px`,
      ).toMatch(/@apply[^;]*rounded-(?:sm|md|lg|xl|2xl|3xl|full)\b/);
    }
  });

  it('components/sidebar.tsx: mọi nút khai báo bo góc tường minh', () => {
    const sidebarCode = read(sidebarPath);
    const buttonBlocks = sidebarCode.split('<button').slice(1);
    expect(buttonBlocks.length).toBeGreaterThan(5);

    for (const block of buttonBlocks) {
      const tagContent = block.split('</button>')[0];
      expect(tagContent, 'nút thiếu class bo góc — sẽ rơi về 0px').toMatch(RADIUS_ANY);
    }
  });

  it('components/sidebar.tsx: tooltip phím tắt chuẩn hóa Ctrl+\\ trong JSX', () => {
    const sidebarCode = read(sidebarPath);
    expect(sidebarCode).not.toContain('title="Thu gọn (Ctrl+\\\\)"');
    expect(sidebarCode).toContain('title="Thu gọn (Ctrl+\\)"');
  });

  it('components/backup-reminder.tsx: mọi button khai báo bo góc tường minh', () => {
    const code = read(backupReminderPath);
    const buttonBlocks = code.split('<button').slice(1);
    expect(buttonBlocks.length).toBeGreaterThanOrEqual(3);

    for (const block of buttonBlocks) {
      expect(block.split('</button>')[0], 'nút thiếu class bo góc').toMatch(RADIUS_ANY);
    }
  });

  /*
   * Composer phải dùNG CHUNG token `thread` với message list.
   *
   * Lịch sử: test này từng khẳng định NGƯỢC LẠI (`not.toMatch(/max-w-thread/)`)
   * và bắt buộc `max-w-4xl` — tức là nó đang BẢO VỆ chính cái lệch đo được
   * ở @1360px: composer 896px trong khi cột hội thoại 768px, tức ô nhập lấn
   * 64px ra ngoài nội dung đang đọc mỗi bên.
   *
   * Nay hai bên gọi cùng một token nên test kiểm cái BẤT BIẾN thay vì kiểm
   * một con số: composer không được tự khai báo bề rộng riêng (bất kỳ
   * `max-w-4xl` hay `max-w-thread` viết tay nào ở JSX đều là lệch trở lại).
   */
  it('composer dùng CHUNG token thread với cột hội thoại, không tự khai báo bề rộng', () => {
    const code = readRel('../components/composer.tsx');
    expect(code, 'composer phải bám cột hội thoại').toContain('max-w-thread');
    /* Không còn khung cứng 4xl — đó chính là nguồn gốc lệch 64px. */
    expect(code, 'composer không được tự đặt max-w-4xl').not.toMatch(/max-w-4xl/);
    /*
     * Vỏ ngoài vẫn full-bleed: ô nhập cuộn theo chiều ngang, không phải khung.
     * Assert theo REGEX chứ không theo chuỗi literal — vỏ nay có thêm gutter
     * `px-5 md:px-8` và `pt-3`, nên thứ tự class không còn cố định.
     */
    expect(code, 'vỏ composer phải full-bleed').toMatch(
      /w-full[^"']*pb-\[env\(safe-area-inset-bottom\)\]/,
    );
  });

  /*
   * GUTTER NGANG phải khớp giữa cột hội thoại và composer.
   *
   * Đây là lỗi bố cục thật đã tồn tại: message list cuộn ở `px-4 md:px-8` rồi
   * mỗi hàng lại tự thêm `px-4 sm:px-6` BÊN TRONG, nên mép chữ lệch 56px về trái
   * trong khi mép ô nhập chỉ lệch 16px — cùng một nội dung, hai mép không khớp.
   * Nay cả hai cùng khai báo gutter ở vỏ ngoài và hàng không padding.
   *
   * Test kiểm bất biến (hai bên cùng một lớp gutter, hàng không tự padding)
   * chứ không kiểm một con số, để đổi thiết kế không phải sửa test.
   */
  it('gutter ngang của cột hội thoại khớp gutter của ô nhập', () => {
    const listCode = readRel('../components/chat/message-list.tsx');
    const composerCode = readRel('../components/composer.tsx');

    const gutter = /(?<![\w-])px-5(?![0-9a-z])/;
    expect(listCode, 'message list phải khai gutter px-5').toMatch(gutter);
    expect(composerCode, 'composer phải khai gutter px-5').toMatch(gutter);

    /* Hàng tin nhắn KHÔNG được tự thêm padding ngang — nó sẽ cộng dồn lên
       gutter của container và làm lệch mép chữ so với ô nhập. */
    const itemCode = readRel('../components/chat/message-item.tsx');
    const rowWrappers = [...itemCode.matchAll(/<div className="(group relative w-full py-\d+[^"]*)"/g)]
      .map((m) => m[1]);
    expect(rowWrappers.length, 'phải tìm được 2 hàng tin nhắn (user + assistant)').toBe(2);
    for (const row of rowWrappers) {
      expect(row, `hàng tin nhắn không được tự padding ngang: ${row}`).not.toMatch(/(?<![\w-])px-/);
    }
  });

  /*
   * Cột phụ bên phải chỉ được bật ở `rail:` — và token phải được khai ở cả
   * `maxWidth` lẫn `screens`, vì bật `screen` mà quên token thì Tailwind sinh
   * class `rail:max-w-rail` không có giá trị.
   *
   * Ngưỡng là phép TRỪ của ba bề rộng đã biết: sidebar 288 (`md:w-72`) + cột
   * hội thoại 768 (`maxWidth.thread`) + rail 320 (`maxWidth.rail`), cộng gutter
   * hai bên. Test này TÍNH ra con số đó từ chính config thay vì chép một số cứng
   * — nếu ai đó đổi bề rộng sidebar mà quên nâng ngưỡng, assertion đỏ ngay
   * thay vì cột phụ bị bóp méo ở một dải rộng.
   */
  it('mốc rail: khai đủ cả screen lẫn maxWidth, và ngưỡng đủ cho cả ba cột', () => {
    const config = read(tailwindConfigPath);
    expect(config, 'thiếu token maxWidth.rail').toMatch(/rail:\s*'20rem'/);

    const threadRem = Number(config.match(/thread:\s*'(\d+(?:\.\d+)?)rem'/)?.[1]);
    const railRem = Number(config.match(/rail:\s*'(\d+(?:\.\d+)?)rem'/)?.[1]);
    expect(Number.isFinite(threadRem), 'không đọc được maxWidth.thread').toBe(true);
    expect(Number.isFinite(railRem), 'không đọc được maxWidth.rail').toBe(true);

    /* Bề rộng sidebar lấy từ class thật trong sidebar.tsx — không chép số. */
    const sidebarRem = Number(read(sidebarPath).match(/md:w-(\d+)/)?.[1]) * 0.25;
    expect(Number.isFinite(sidebarRem), 'không đọc được bề rộng sidebar (md:w-N)').toBe(true);

    const GUTTER_REM = 2; /* px-8 = 2rem mỗi bên ở md */
    const required = Math.ceil(sidebarRem + threadRem + railRem + GUTTER_REM * 2);
    const screensRail = Number(config.match(/rail:\s*'(\d+)px'/)?.[1]);
    expect(Number.isFinite(screensRail), 'thiếu mốc screens.rail').toBe(true);
    expect(
      screensRail,
      `screens.rail phải ≥ ${required}px (sidebar ${sidebarRem} + thread ${threadRem} + rail ${railRem} + gutter ${GUTTER_REM * 2})rem`,
    ).toBeGreaterThanOrEqual(required);
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

  it('không dùng emoji làm icon trong components/ và app/ (ngoài comment)', () => {
    /*
     * Checklist `ui-ux-pro-max` hạng 4: icon phải là SVG (Lucide), không emoji.
     * Hình dáng/màu của emoji do font hệ điều hành quyết định — khác nhau giữa
     * macOS / Windows / Linux — và không theo được hệ màu accent của ứng dụng.
     *
     * Cắt comment trước khi soi: comment nhắc emoji như tài liệu lịch sử ("nút
     * 📁 cũ", "khỏi bấm 🔄") là tài liệu, không phải icon hiển thị. Cắt cả hai
     * kiểu comment (dòng và khối) trước khi soi.
     */
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    const stripped = (code: string) =>
      stripComments(code).replace(/\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, ' '));

    const offenders: string[] = [];
    for (const file of componentFiles()) {
      const lines = stripped(readFromRoot(file)).split('\n');
      for (const [index, line] of lines.entries()) {
        if (EMOJI.test(line)) offenders.push(`${file}:${index + 1}`);
      }
    }

    expect(offenders, `emoji làm icon — thay bằng SVG Lucide: ${offenders.join(', ')}`).toEqual([]);
  });

  it('mọi phần tử bấm được đều đổi con trỏ tay (không trông như bấm được mà chuột báo không bấm)', () => {
    /*
     * Checklist `ui-ux-pro-max` hạng 2 (Touch & Interaction).
     *
     * Tailwind preflight KHÔNG khai `cursor` cho `<button>` — UA stylesheet mặc
     * định là mũi tên. Đo được trước khi sửa: 180 call site `<button>` trong
     * components+app, chỉ 21 tự ghi `cursor-pointer`; phần còn lại đi qua recipe
     * (`.icon-btn`, `.menu-item`, `.btn-*`) vốn không có cursor.
     *
     * Rule phải nằm ở `@layer base` (trước `@layer components`) để utility
     * `cursor-not-allowed` / `cursor-text` ở layer `utilities` vẫn thắng được.
     */
    const css = read(globalsCssPath);
    const baseEnd = css.indexOf('@layer components');
    expect(baseEnd, 'globals.css thiếu @layer components — regex chắc hỏng').toBeGreaterThan(-1);

    const base = css.slice(0, baseEnd);
    expect(
      base,
      'globals.css layer base phải đặt cursor: pointer cho button:not(:disabled)',
    ).toMatch(/button:not\(:disabled\)[\s\S]*?cursor:\s*pointer/);
    /* Nút tắt giữ con trỏ mũi tên: bấm vào thứ không dùng được không nên trông như bấm được. */
    expect(base, 'cursor phải loại :disabled khỏi <button>').toMatch(/button:not\(:disabled\)/);
  });

  it('ô nhập KHÔNG được xoá dấu hiệu focus (outline-none là anti-pattern hạng 1)', () => {
    /*
     * Checklist `ui-ux-pro-max` hạng 1 (Accessibility — CRITICAL): "xoá focus
     * ring" nằm trong cột CHỐNG.
     *
     * `:focus-visible` ở `@layer base` khai outline 2px accent cho cả app, nhưng
     * `outline-none` là utility ở layer `utilities`: cùng specificity, layer sau
     * thắng → vòng focus biến mất hoàn toàn, chỉ còn lại đổi màu viền. Người điều
     * hướng bàn phím mất dấu hiệu vị trí ở mọi ô nhập trong Settings.
     *
     * `composer.tsx` là ngoại lệ CỐ Ý: focus của nó hiện ở vỏ form
     * (`isFocused` → viền accent + `PulseGlow`) nên vòng quanh textarea là
     * dư. Danh sách dưới đây là các ô nhập KHÔNG có dấu hiệu focus nào khác.
     */
    const css = read(globalsCssPath);
    expect(css, 'globals.css phải giữ :focus-visible toàn cục').toMatch(
      /:focus-visible\s*\{\s*outline:\s*2px solid/,
    );
    expect(
      css,
      'recipe `.field` không được dùng outline-none (xoá focus ring của mọi ô nhập Settings)',
    ).not.toMatch(/\.field\b[^{]*\{[^}]*outline-none/);
    expect(
      css,
      'recipe `.field` không được dùng focus:ring-0 (xoá mất bóng .well lúc focus)',
    ).not.toMatch(/\.field\b[^{]*\{[^}]*focus:ring-0/);

    /*
     * Ô nhập viết tay trong component — cùng lý do, phải theo.
     *
     * Quét MỌI thẻ mở `<input` / `<textarea` trong hợp đồng, KHÔNG ghim số dòng
     * và KHÔNG soi từng dòng: đo được 52/53 thẻ mở nằm nhiều dòng (`className`
     * ở dòng kế), nên quét theo dòng sẽ im lặng bỏ sót gần hết.
     *
     * `openingTags` cắt tới dấu `>` KHÔNG nằm trong `{}` hay trong nháy — đó mới
     * là thẻ mở thật, kể cả khi thuộc tính là biểu thức template.
     *
     * Ngoại lệ liệt kê TƯỜNG MINH, mỗi cái một lý do:
     *   composer.tsx        — focus hiện ở vỏ form (`isFocused` → viền accent
     *                         + `PulseGlow`); vòng quanh textarea là dư.
     *   settings-dialog.tsx — container của modal, focus-trap đặt focus vào nó
     *                         lúc mở; vòng bao quanh cả modal là rác.
     * Ô nào khác mất focus ring thì đã là lỗi.
     */
    const EXEMPT = new Set(['composer.tsx', 'settings-dialog.tsx']);
    const openingTags = (code: string) =>
      [...code.matchAll(/<(?:input|textarea)\b/g)].map((m) => {
        let depth = 0;
        let quote = '';
        for (let i = m.index; i < code.length; i++) {
          const ch = code[i];
          if (quote) {
            if (ch === quote) quote = '';
            continue;
          }
          if (ch === '"' || ch === "'" || ch === '`') quote = ch;
          else if (ch === '{') depth++;
          else if (ch === '}') depth--;
          else if (ch === '>' && depth === 0) return code.slice(m.index, i);
        }
        return code.slice(m.index);
      });

    const offenders: string[] = [];
    let scanned = 0;
    for (const rel of TOKENIZED_COMPONENTS) {
      if (!rel.endsWith('.tsx')) continue;
      if (EXEMPT.has(rel.split('/').pop()!)) continue;
      const code = readRel(rel);
      for (const tag of openingTags(code)) {
        scanned++;
        if (!/outline-none/.test(tag)) continue;
        offenders.push(`${rel}:${code.slice(0, code.indexOf(tag)).split('\n').length}`);
      }
    }

    /* Bảo đảm quét thật sự thấy thứ — không phải regex hỏng lặng lẽ xanh. */
    expect(scanned, 'quét <input>/<textarea> không thấy thẻ nào — regex chắc hỏng').toBeGreaterThan(20);
    expect(
      offenders,
      `ô nhập mất focus ring — bỏ outline-none (xem danh sách ngoại lệ ở test này): ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('hover đổi màu chạy 150–300ms; 100ms chỉ dành cho chuyển động cơ học', () => {
    /*
     * Checklist `ui-ux-pro-max` hạng 7 (Animation): hover phải có transition
     * mượt trong khoảng 150–300ms, nhưng "một duration cho mọi transition" cũng
     * bị chê — timing phải theo ngữ cảnh.
     *
     * Nên test này bắt đúng `transition-colors` (phản hồi hover) và CỐ Ý bỏ qua
     * `transition-transform` / `transition-opacity` ở 100ms: đó là mũi tên xoay
     * và thanh fade, phải nhanh và cơ học thì mới không bị cảm giác dính.
     */
    const SLOW = /\btransition-colors\b[^\n]*?\bduration-(0|50|75|100)\b/g;
    const offenders: string[] = [];
    for (const rel of TOKENIZED_COMPONENTS) {
      if (!rel.endsWith('.tsx')) continue;
      const code = readRel(rel);
      for (const [index, line] of code.split('\n').entries()) {
        if (SLOW.test(line)) offenders.push(`${rel}:${index + 1}`);
        SLOW.lastIndex = 0;
      }
    }

    expect(offenders, `hover đổi màu dưới 150ms — lên duration-150: ${offenders.join(', ')}`).toEqual([]);
  });

  it('mọi màu tô màu cú pháp đều đạt WCAG AA trên nền code sáng', () => {
    /*
     * Checklist `ui-ux-pro-max` hạng 1 (Accessibility — CRITICAL), và đây là
     * chỗ vỡ nặng nhất tìm được trong lần rà này.
     *
     * `components/syntax-highlight.tsx` từng dùng `vscDarkPlus` — theme TỐI
     * của Visual Studio — trong khi nền ứng dụng là giấy trắng. Cả 14 màu
     * trong theme đó dưới ngưỡng AA trên nền code sáng: chữ gốc 1.36:1,
     * `string` 2.42:1, `comment` 3.06:1. Tức phần được tô màu RÕ nhất lại là
     * phần MỜ nhất. Nguyên nhân: đổi nền sang sáng mà quên đổi theme tô màu.
     *
     * Nay theme tự dựng từ bảng màu §2, nên mọi màu đều là token đã có. Test
     * này đo lại đúng con số đó từ CHÍNH source, nên đổi lại theme có sẵn
     * (hoặc thêm một màu lạ) là test đỏ chứ không phải im lặng.
     *
     * Đo trên CẢ BA nền code có thể xảy ra: `.claude-code-block` dùng
     * `--bg-base` (#fcfcfc), `PlainCode` dùng `bg-sunken` (#f7f7f7), còn theme
     * tự khai `--surface-code` (#f5f5f5) cho `customStyle`. Nền sáng hơn thì
     * tương phản thấp hơn, nên lấy đúng nền nhạt nhất là nghiêm nhất.
     */
    const AA = 4.5;
    const readToken = (name: string) => {
      const m = read(globalsCssPath).match(new RegExp(`^\\s*${name}:\\s*(\\d{1,3})\\s+(\\d{1,3})\\s+(\\d{1,3})`, 'm'));
      if (!m) throw new Error(`globals.css không khai ${name}`);
      return [Number(m[1]), Number(m[2]), Number(m[3])] as const;
    };
    const srgb = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([r, g, b]: readonly number[]) =>
      0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
    const ratio = (a: readonly number[], b: readonly number[]) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };

    /* Theme tô màu chỉ được dùng token ĐÃ KHAI trong `:root`. */
    const themeSrc = readRel('../components/syntax-highlight.tsx');
    const tokenUse = [...themeSrc.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]!);
    expect(
      tokenUse.length,
      'theme tô màu không dùng token nào — regex chắc hỏng, hoặc theme đã quay về hex thô',
    ).toBeGreaterThan(20);

    const BACKGROUNDS = [
      ['--bg-base', readToken('--bg-base')],
      ['--bg-sunken', readToken('--bg-sunken')],
      ['--surface-code', readToken('--surface-code')],
    ] as const;

    /* Mỗi token CHỮ trong theme phải đạt AA trên mọi nền code.
     *
     * Loại trừ theo vai trò, không theo tên: `accent-soft` và `surface-code` là
     * token NỀN (nền nhấn nhạt cho `.line-highlight`, nền khối code), đem
     * đi đo tương phản chữ thì vô nghĩa — nó tự đối chiếu với chính nó được
     * 1.00:1. `on-fill` là chữ trên nền bão hòa đậm, không liên quan khối code.
     * Test này đã bắt đúng cái nhầm lẫn đó ở lần chạy đầu. */
    const BACKGROUND_TOKENS = new Set(['accent-soft', 'surface-code', 'on-fill']);
    const textTokens = [...new Set(tokenUse.filter((t) => !BACKGROUND_TOKENS.has(t)))];
    expect(textTokens.length, 'không tìm được token chữ nào trong theme').toBeGreaterThan(5);

    const failures: string[] = [];
    for (const token of textTokens) {
      const fg = readToken(`--${token}`);
      for (const [bgName, bg] of BACKGROUNDS) {
        const r = ratio(fg, bg);
        if (r < AA) failures.push(`--${token} trên ${bgName}: ${r.toFixed(2)}:1 (< ${AA})`);
      }
    }
    expect(failures, `màu tô màu cú pháp dưới WCAG AA:\n  ${failures.join('\n  ')}`).toEqual([]);

    /* Chốt lại: theme KHÔNG được quay về theme có sẵn của thư viện.
     *
     * Chỉ soi import GIÁ TRỊ. `import type { PrismTheme }` là kiểu, không kéo
     * theme nào về — lọc theo `import type` để guard này không tự bắt chính
     * dòng khai báo kiểu của nó (đã xảy ra ở lần chạy đầu). Theme tối luôn được
     * nạp qua `.../styles/prism` (barrel) hoặc `.../styles/prism/<tên>`; còn
     * 18 import ngôn ngữ đi qua `.../languages/prism/...` nên không lẫn vào. */
    const valueImports = [
      ...themeSrc.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm),
    ].map((m) => m[1]!);
    const themeImports = valueImports.filter((u) => /\/styles\/prism(?:\/[\w-]+)?$/.test(u));
    expect(
      themeImports,
      'theme tô màu lại nạp theme có sẵn của thư viện (vd vscDarkPlus) — màu nguồn phải là §2',
    ).toEqual([]);

    /* `PlainCode` (lúc chờ nạp chunk) cũng phải đủ tương phản — nó từng ghi
     * màu chữ theme tối còn sót, chỉ 1.38:1 trên nền #f7f7f7. Cắt comment
     * trước khi soi: chính chú thích giải thích lỗi đó có ghi lại giá trị cũ,
     * và đó là tài liệu chứ không phải chỗ đang đặt màu. */
    const plain = readRel('../components/markdown-renderer.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(plain, 'PlainCode còn màu chữ hex/rgb thô thay vì token').not.toMatch(
      /text-\[(?:rgb|rgba|hsl|hsla|#)/,
    );
  });

  it('hover đổi màu trong globals.css cũng chạy 150ms trở lên', () => {
    /*
     * Test trên chỉ quét `.tsx`. Nó SỐNG SÓT qua `.claude-prose a` ghi
     * `transition: color 100ms ease` — đúng cái mà test kia cấm, chỉ là viết
     * bằng CSS thuần nên nằm ngoài tầm. Đây là lỗ hổng của chính bộ test:
     * một rule chỉ soi nửa bề mặt thì bề mặt kia không được canh.
     *
     * `globals.css` là nơi DUY NHẤT viết transition dạng thuần, nên quét file
     * đó là đủ phủ — không cần mở rộng sang file khác.
     */
    const css = read(globalsCssPath);
    const offenders: string[] = [];
    for (const m of css.matchAll(/transition:[^;}]*?(\d+)ms/g)) {
      const line = css.slice(0, m.index).split('\n').length;
      /* 100ms hợp lệ cho chuyển động cơ học — nhưng ở đây mọi `transition:`
       * trong globals.css đều là phản hồi hover, nên lấy ngưỡng 150ms. */
      if (Number(m[1]) < 150) offenders.push(`globals.css:${line} — ${m[0].trim()}`);
    }
    expect(offenders, `hover đổi màu trong CSS dưới 150ms: ${offenders.join(', ')}`).toEqual([]);
  });

  it('không còn cỡ chữ px tự chế nào lệch bậc trong thang 6 bậc', () => {
    /*
     * Checklist `ui-ux-pro-max` hạng 6: cỡ chữ phải theo thang có tên, không
     * gõ px rời. Cỡ tự chế nằm ngoài thang thì không ai nhớ được có đúng một
     * cỡ hay không — `text-[10.5px]` là ví dụ, lệch nửa px so với `meta`.
     *
     * Ngoại lệ HẸP — ghi theo CẶP (file, cỡ px), không theo cả file. Nếu miễn
     * trừ nguyên file thì thêm `text-[19px]` vào `vyen-logo.tsx` cũng lọt, tức
     * test im lặng đúng lúc cần nó đỏ. Danh sách này là CỠ TRƯNG BÀY (chữ
     * wordmark, h1 màn hình trống, tiêu đề khối 16px) — thang 6 bậc không có
     * bậc nào cho chúng, và nâng 16px lên `head` (20px) sẽ đổi diện mạo hai
     * tiêu đề khối nên không tự ý làm trong lần rà checklist này. Xem
     * DESIGN.md §9.3.
     */
    const DISPLAY_SIZES = new Map<string, Set<string>>([
      ['../components/vyen-logo.tsx', new Set(['32', '16', '9.5'])],
      ['../components/chat/message-list.tsx', new Set(['28'])],
      ['../components/staging-panel.tsx', new Set(['16'])],
      ['../components/workspace-checkpoints.tsx', new Set(['16'])],
    ]);
    const SCALE_PX = new Set(['10', '11', '12', '13', '15', '20']);
    const offenders: string[] = [];
    for (const rel of TOKENIZED_COMPONENTS) {
      const allowed = DISPLAY_SIZES.get(rel) ?? new Set<string>();
      /* Cắt comment: nhắc tên cỡ cũ trong chú thích là tài liệu, không phải
       * chỗ đang đặt cỡ chữ. */
      const code = readRel(rel)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      for (const m of code.matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)) {
        if (!SCALE_PX.has(m[1]!) && !allowed.has(m[1]!)) {
          const line = code.slice(0, m.index).split('\n').length;
          offenders.push(`${rel}:${line} — text-[${m[1]}px]`);
        }
      }
    }
    expect(offenders, `cỡ chữ lệch thang 6 bậc:\n  ${offenders.join('\n  ')}`).toEqual([]);
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
