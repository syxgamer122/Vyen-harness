/**
 * Ba lỗi ở cửa vào palette "/" — nơi người dùng CHỌN một lệnh, nên chỗ sai
 * nhất cũng là chỗ đắt nhất: chạy nhầm một lệnh thì người dùng chỉ biết sau
 * khi agent đã làm việc theo lệnh đó.
 *
 *   1. Enter chạy thẳng mục đang sáng. Palette luôn sáng mục đầu khi mở, nên
 *      gõ `/pl` xong bấm Enter là chạy `/plan`: người dùng xin một việc, nhận
 *      việc khác, không có dấu hiệu gì cả. Claude Code v2.1.236 đã gỡ hành vi
 *      này (Enter gửi đúng chữ đã gõ).
 *   2. `syntax` của lệnh (`/plan <mục tiêu>`) chỉ nằm trong danh mục, không
 *      ai in ra màn hình: người dùng phải đoán lệnh cần tham số gì.
 *   3. Form đặt lệnh tùy biến nhận mọi chuỗi, và tên trùng lệnh built-in tạo
 *      ra hai hàng palette trông y hệt mà hàng custom không bao giờ chạy tới.
 *
 * Suite chạy `environment: 'node'` (không jsdom / @testing-library) và chỉ nhận
 * file `.test.ts` trong `tests/`, nên không dựng được component. Vì vậy mỗi lỗi
 * bị chặn bằng HAI lớp:
 *
 *   1. Test hàm thuần — import helper export ra và gọi thật. Đổi logic là đỏ.
 *   2. Test soi SOURCE — bắt đúng DÒNG JSX gọi helper đó. Helper đúng mà
 *      không ai gọi thì lỗi vẫn sống.
 *
 * CRLF: file trên đĩa là CRLF (`core.autocrlf`) nên mọi regex có `\n` cứng sẽ
 * PASS ở máy dev và FAIL ở CI. `source` dưới đây đã chuẩn hoá một lần.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { partitionSlashMatches, type SlashPrompt } from '@/components/composer';
import {
  BUILTIN_SLASH_COMMANDS,
  argumentHintFromSyntax,
  filterPrompts,
  parseSlashCommand,
  slashCommitTarget,
  validateSlashCommandName,
  SLASH_COMMAND_NAME_PATTERN,
  SLASH_COMMAND_NAME_MAX,
} from '@/lib/slash-commands';
import { DISK_SKILL_LIMITS } from '@/lib/skills/disk';

/** Source composer đã chuẩn hoá CRLF → LF. */
const composerSource = fs
  .readFileSync(path.resolve(__dirname, '../components/composer.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
/** Bỏ comment để assert chỉ soi CODE, không soi chữ trong giải thích. */
const composerCode = composerSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const settingsSource = fs
  .readFileSync(
    path.resolve(__dirname, '../components/settings/slash-commands-section.tsx'),
    'utf8',
  )
  .replace(/\r\n/g, '\n');
const settingsCode = settingsSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const skillDiskSource = fs
  .readFileSync(path.resolve(__dirname, '../lib/skills/disk.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

/* ------------------------------------------------------------------ fixtures */

/** Palette dựng y hệt `use-chat-orchestration.ts`: built-in + tùy biến. */
function palette(custom: Record<string, string> = {}): SlashPrompt[] {
  return [
    ...BUILTIN_SLASH_COMMANDS.map((c) => ({
      id: `cmd:${c.name}`,
      title: c.name,
      content: `/${c.name} `,
      kind: 'command' as const,
      description: c.description,
    })),
    ...Object.entries(custom).map(([name]) => ({
      id: `cmd:custom:${name}`,
      title: name,
      content: `/${name} `,
      kind: 'command' as const,
    })),
  ];
}

/** Đúng đường của composer: lọc → cắt trần → hỏi "Enter chạy cái gì". */
function enterRuns(query: string, index = 0, navigated = false, items = palette()) {
  const { shown } = partitionSlashMatches(filterPrompts(items, query, 10_000));
  return slashCommitTarget(shown, index, query, navigated);
}

/* ------------------------------------------------ 1. Enter chạy đúng lệnh đã gõ */

describe('Enter trong palette chỉ chạy lệnh người dùng ĐÃ GÕ TÊN', () => {
  it('palette ĐANG MỞ mà chưa gõ trọn tên thì Enter không chạy mục đang sáng', () => {
    /*
     * Hồi quy gốc. Trước khi sửa, nhánh Enter gọi thẳng
     * `applyPrompt(slashMatches[slashIndex])`, nên `/pl` chạy `/plan`.
     * Đổi `slashCommitTarget` thành `return matches[index]` là đỏ ngay.
     */
    const matches = filterPrompts(palette(), 'pl', 10_000);
    expect(matches.map((m) => m.title), 'tiền đề của test hỏng: /pl phải khớp').toContain('plan');
    expect(enterRuns('pl')).toBeNull();
    // Người dùng đã chỉ tay vào bằng phím mũi tên thì chạy, xem kỳ vọng ở dưới.
    expect(enterRuns('pl', 0, true)).toEqual(expect.objectContaining({ title: 'plan' }));
  });

  it('gõ sai chính tả thì Enter KHÔNG chạy lệnh nào', () => {
    for (const typo of ['plna', 'hepl', 'paln', 'mod', 'cst', 'plan ']) {
      // `plan ` là khoảng trắng thừa, vẫn phải khớp plan chứ không phải báo lỗi.
      const expected = typo === 'plan ' ? 'plan' : null;
      expect(enterRuns(typo), `Enter khi gõ "${typo}" đang chạy lệnh khác`).toEqual(
        expected === null ? null : expect.objectContaining({ title: expected }),
      );
    }
  });

  it('gõ ĐÚNG tên thì Enter vẫn chạy lệnh đó (đường vui phải còn nguyên)', () => {
    // Nếu sửa kiểu "Enter không bao giờ áp dụng", test này đỏ.
    for (const name of BUILTIN_SLASH_COMMANDS.map((c) => c.name)) {
      expect(enterRuns(name), `Enter gõ đúng "/${name}" mà không chạy`).toEqual(
        expect.objectContaining({ title: name }),
      );
    }
  });

  it('khác cỡ chữ hay thừa khoảng trắng vẫn khớp, và vẫn phải là tên đó', () => {
    // `foldText` + `trim`: `/Plan` là `/plan`. Đây là tiện, không phải nới lỏng.
    expect(enterRuns('Plan')).toEqual(expect.objectContaining({ title: 'plan' }));
    expect(enterRuns('PLAN')).toEqual(expect.objectContaining({ title: 'plan' }));
    // Dấu tiếng Việt cũng gộp: gõ `bóost` ra `/boost`, không phải lệnh lạ.
    expect(enterRuns('bóost')).toEqual(expect.objectContaining({ title: 'boost' }));
  });

  it('gõ tên lệnh kèm khoảng trắng thì palette tự đóng, Enter không có gì để chiếm', () => {
    /*
     * `filterPrompts` so khớp cả cụm, nên `/plan làm gì` không khớp mục nào và
     * palette đóng. Nhánh Enter trong composer phải để chữ đó đi thẳng, không
     * cắt còn `/plan` rồi chạy lệnh không có mục tiêu.
     */
    expect(filterPrompts(palette(), 'plan làm gì', 10_000).map((m) => m.title)).toEqual([]);
    expect(enterRuns('plan làm gì')).toBeNull();
    // Gõ `/plan` xong một dấu cách: vẫn khớp, và Enter chạy đúng lệnh đó.
    expect(enterRuns('plan ')).toEqual(expect.objectContaining({ title: 'plan' }));
  });

  it('truy vấn rỗng hoặc index vượt danh sách thì không có gì để chạy', () => {
    expect(enterRuns('')).toBeNull();
    expect(enterRuns('plan', 99)).toBeNull();
    expect(enterRuns('không-có-mục-nào')).toBeNull();
    expect(slashCommitTarget([], 0, 'plan')).toBeNull();
    expect(slashCommitTarget([], 0, 'plan', true)).toBeNull();
  });

  it('người dùng đã bấm phím mũi tên thì Enter chạy đúng mục họ chỉ vào', () => {
    /*
     * Điều hướng bằng phím mũi tên là phải giữ: không có nó thì người dùng lướt
     * palette rồi Enter lại bị gửi đi thành chữ thô, tức hành vi ngược.
     * Xoá `if (navigated) return target` là đỏ.
     *
     * Truy vấn rỗng = palette mở trọn danh mục, tức đúng cái người dùng lướt
     * bằng mũi tên khi mới bắt đầu.
     */
    const names = BUILTIN_SLASH_COMMANDS.map((c) => c.name);
    for (let i = 0; i < names.length; i++) {
      expect(enterRuns('', i, true), `mũi tên chọn mục ${i} mà không chạy`).toEqual(
        expect.objectContaining({ title: names[i] }),
      );
    }
  });

  it('ràng buộc "đã điều hướng" phải là CỜ, không phải suy ra từ index', () => {
    /*
     * `ArrowUp` từ mục đầu quay về 0, nên suy ra "người dùng đã chọn" từ
     * `index !== 0` là sai: lướt tới mục đầu bằng phím mũi tên rồi Enter sẽ bị
     * gửi đi thành chữ thô.
     */
    expect(enterRuns('', 0, true)).toEqual(expect.objectContaining({ title: 'boost' }));
    expect(enterRuns('', 0, false)).toBeNull();
  });
});

describe('composer thực sự hỏi slashCommitTarget, và Tab giữ nguyên', () => {
  it('nhánh Enter gọi helper với đúng CHỮ ĐÃ GÕ', () => {
    /*
     * Lớp 2: helper đúng mà JSX không gọi thì lỗi vẫn sống. `slashQuery` là
     * `draft.slice(1)`; truyền tham số khác (vd `''`) là đỏ.
     */
    expect(composerCode).toMatch(
      /e\.key === 'Enter'\s*\?\s*slashCommitTarget\(\s*slashMatches,\s*slashIndex,\s*slashQuery/,
    );
    expect(composerCode).toMatch(/setSlashNavigated/);
  });

  it('Tab vẫn áp dụng mục đang sáng, không đi qua bộ lọc của Enter', () => {
    /*
     * Tab là phím "chấp nhận phần đã điền". Gửi Tab qua `slashCommitTarget` là
     * gỡ tính năng hoàn tất, mất luôn đường ngắn còn lại.
     */
    expect(composerCode).toMatch(
      /e\.key === 'Enter'\s*\?\s*slashCommitTarget\([\s\S]{0,200}?\)\s*:\s*slashMatches\[slashIndex\]/,
    );
  });

  it('không còn chỗ nào áp dụng thẳng mục đang sáng mà không qua bộ lọc', () => {
    expect(composerCode).not.toMatch(/applyPrompt\(\s*slashMatches\[\s*slashIndex\s*\]\s*\)/);
  });

  it('Enter hụt thì KHÔNG bị nuốt: phải rơi xuống đường gửi thường', () => {
    /*
     * `preventDefault()` nằm trong nhánh `if (target)`. Nuốt Enter khi không
     * có target biến "gõ sai tên" thành "bấm Enter không gì xảy ra", tệ hơn
     * hẳn câu lỗi tên lệnh.
     */
    const branch = composerCode.match(
      /if \(e\.key === 'Enter' \|\| e\.key === 'Tab'\) \{[\s\S]{0,600}?\n {8}\}/,
    );
    expect(branch, 'không tìm được nhánh Enter/Tab — regex chắc hỏng').toBeTruthy();
    expect(branch![0]).toMatch(/if \(target\) \{/);
    const calls = [...branch![0].matchAll(/(preventDefault|applyPrompt)\(/g)].map((m) => m[1]);
    expect(calls, 'mỗi lần chỉ được gọi preventDefault và applyPrompt MỘT lần').toEqual([
      'preventDefault',
      'applyPrompt',
    ]);
  });

  it('điều hướng bàn phím của palette vẫn nguyên', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Escape', 'Home', 'End']) {
      expect(composerSource, `mất chuỗi phím ${key}`).toContain(key);
    }
    // Cả hai phím mũi tên phải đặt cờ điều hướng, nếu không thì cờ chết.
    expect(composerCode.match(/setSlashNavigated\(true\)/g)).toHaveLength(2);
  });
});

/* ------------------------------------------------------------ 2. gợi ý tham số */

describe('palette tự nói lệnh cần tham số gì (argumentHint)', () => {
  it('gợi ý bám đúng phần tham số của `syntax`, không tự chế', () => {
    /*
     * `syntax` là nguồn duy nhất. Đổi `/plan <mục tiêu>` thành `/plan <việc>`
     * mà quên sửa `argumentHint` là đỏ — đúng lúc hai bản bắt đầu lệch nhau.
     */
    for (const cmd of BUILTIN_SLASH_COMMANDS) {
      expect(cmd.argumentHint, `/${cmd.name} lệch với syntax`).toBe(
        argumentHintFromSyntax(cmd.syntax),
      );
    }
  });

  it('lệnh có tham số thì có gợi ý, lệnh không tham số thì không', () => {
    const withArgs = BUILTIN_SLASH_COMMANDS.filter((c) => c.argumentHint !== undefined).map(
      (c) => c.name,
    );
    expect(withArgs).toEqual(
      expect.arrayContaining(['plan', 'boost', 'mode', 'recipe', 'tools']),
    );
    for (const name of ['summarize', 'skills', 'memory', 'cost']) {
      expect(BUILTIN_SLASH_COMMANDS.find((c) => c.name === name)!.argumentHint).toBeUndefined();
    }
  });

  it('gợi ý ngắn, không em dash, và là tham số chứ không phải cả dòng syntax', () => {
    for (const cmd of BUILTIN_SLASH_COMMANDS) {
      if (cmd.argumentHint === undefined) continue; // lệnh không nhận tham số
      const hint = cmd.argumentHint;
      expect(hint.length, `gợi ý của /${cmd.name} dài quá để đọt lướt`).toBeLessThanOrEqual(30);
      expect(hint, `gợi ý của /${cmd.name} có em dash`).not.toMatch(/—/);
      expect(hint, `gợi ý của /${cmd.name} lặp lại tên lệnh`).not.toContain('/');
      expect(hint.startsWith('<') || hint.startsWith('[')).toBe(true);
    }
  });

  it('argumentHint là TUỲ CHỌN: thiếu nó thì không có gì vỡ', () => {
    /*
     * Producer hiện CHƯA gán trường này (`react/use-chat-orchestration.ts` do
     * người khác sửa), recipe/prompt cũng không có. Bài này là probe: bỏ dấu
     * `?` khỏi `SlashPrompt` là `tsc` đỏ.
     */
    const without: SlashPrompt = {
      id: 'cmd:custom:my-recipe',
      title: 'my-recipe',
      content: '/my-recipe ',
      kind: 'command',
    };
    expect(without.argumentHint).toBeUndefined();

    const plan = BUILTIN_SLASH_COMMANDS.find((c) => c.name === 'plan')!;
    const withHint: SlashPrompt = {
      id: 'cmd:plan',
      title: 'plan',
      content: '/plan ',
      kind: 'command',
      description: plan.description,
      argumentHint: plan.argumentHint,
    };
    expect(withHint.argumentHint).toBe('<mục tiêu>');
  });

  it('palette vẫn lọc và chạy được khi không mục nào có gợi ý', () => {
    // Palette dựng y nhệt producer hiện tại: không mục nào mang argumentHint.
    for (const p of palette()) expect(p.argumentHint).toBeUndefined();
    expect(enterRuns('plan')).toEqual(expect.objectContaining({ title: 'plan' }));
  });

  it('JSX chỉ vẽ gợi ý KHI CÓ, và vẽ mờ hơn tên', () => {
    /*
     * Lớp 2: trường có thật mà JSX không in thì tính năng chỉ tồn tại trên
     * giấy. Thiếu nhánh null là vẽ khoảng trống cho mọi recipe.
     */
    const hint = composerCode.match(/<span className="[^"]*">\s*\{\s*p\.argumentHint\s*\}/);
    expect(hint, 'không tìm được thẻ chứa gợi ý — regex chắc hỏng').toBeTruthy();
    expect(hint![0]).toMatch(/text-tertiary/);
    expect(hint![0]).not.toMatch(/text-\w+\/\d/);
    // Gợi ý không được cưỡng ép chiếm chỗ: tên phải tự cắt được trước.
    expect(composerCode).toMatch(/<span className="truncate">\/\{p\.title\}<\/span>/);
  });
});

/* ------------------------------------------------------ 3. tên lệnh tùy biến */

describe('tên lệnh tùy biến dùng CHUNG quy tắc với tên skill', () => {
  /** Regex tên skill đọc thẳng từ `lib/skills/disk.ts`, không chép ở đây. */
  const skillRule = (() => {
    const m = skillDiskSource.match(/!\/(\^\[a-zA-Z0-9\][^/]*)\/\.test\(name\)/);
    if (!m) throw new Error('không tìm được regex tên skill trong lib/skills/disk.ts');
    return new RegExp(m[1]!);
  })();

  const VALID = [
    'lint',
    'a',
    'a1',
    'A9',
    'my.lint',
    'my-lint',
    'my_lint',
    'x.y-z_1',
    'a'.repeat(60),
  ];
  const INVALID = [
    '',
    'a b',
    '.hidden',
    '-lead',
    '_lead',
    'a/b',
    'kiểm',
    'a!',
    'a@b',
    'a:b',
    'a\tb',
  ];

  it('biểu thức của lệnh là ĐÚNG biểu thức của skill, không phải bản chép', () => {
    // Đổi `NAME_BODY` trong lib/slash-commands.ts là đỏ ngay.
    expect(SLASH_COMMAND_NAME_PATTERN.source).toBe(skillRule.source);
    expect(SLASH_COMMAND_NAME_MAX).toBe(DISK_SKILL_LIMITS.nameChars);
  });

  it('chặn đúng những gì skill chặn, và cho qua đúng những gì skill cho qua', () => {
    for (const rule of [skillRule, SLASH_COMMAND_NAME_PATTERN]) {
      const at = rule.source;
      for (const name of VALID) expect(rule.test(name), `${at} chặn oan "${name}"`).toBe(true);
      for (const name of INVALID) expect(rule.test(name), `${at} cho lọt "${name}"`).toBe(false);
    }
    // Luật cũ của form cho `_lead` và `a!` đi qua. Đó là lý lệch quy tắc sống.
    expect(/^[a-zA-Z0-9_-]+$/.test('_lead')).toBe(true);
  });

  it('biên độ dài lấy từ trần chứ không chép số', () => {
    // Biểu thức chỉ lo ký tự, độ dài là luật riêng — cũng là luật của skill.
    expect(SLASH_COMMAND_NAME_PATTERN.test('a'.repeat(61))).toBe(true);
    expect(SLASH_COMMAND_NAME_MAX).toBe(60);
    expect(validateSlashCommandName('a'.repeat(60)).ok).toBe(true);
    expect(validateSlashCommandName('a'.repeat(61)).ok).toBe(false);
  });

  it('tên hợp lệ thì parser PHẢI đọc được, không đặt được mà không chạy được', () => {
    /*
     * Đổi `SLASH_INPUT_RE` về `[a-zA-Z0-9_-]+` là đỏ: `/my.lint` khi đó không
     * khớp, tức lệnh đặt được bằng form lại chạy không ra gì.
     *
     * Khoá map bằng tên ĐÃ hạ chữ thường: form lưu khoá không dấu, và parser
     * cũng hạ chữ thường trước khi tra map.
     */
    for (const name of VALID) {
      const key = name.toLowerCase();
      expect(validateSlashCommandName(name), `"${name}" phải qua được form`).toEqual({
        ok: true,
        name: key,
      });
      expect(
        parseSlashCommand(`/${name}`, { [key]: 'recipe-x' }),
        `"${name}" đặt được mà parser không nhận`,
      ).toEqual({ kind: 'custom_recipe', recipeId: 'recipe-x', args: undefined });
    }
  });

  it('form gọi hàm kiểm tra dùng chung, không còn regex tự chế', () => {
    expect(settingsCode).toMatch(
      /validateSlashCommandName\(cmdName,\s*Object\.keys\(customSlashCommands\)\)/,
    );
    expect(settingsCode).not.toMatch(/\^\[a-zA-Z0-9_-\]\+\$/);
  });

  it('thông báo lỗi tiếng Việt, không em dash, không chữ ngợi bơ', () => {
    const shown = [...VALID, ...INVALID, 'plan', 'tokens', 'lint']
      .map((raw) => validateSlashCommandName(raw))
      .filter((r) => !r.ok)
      .map((r) => (r.ok ? '' : r.error));
    expect(shown.length).toBeGreaterThan(5);
    for (const msg of shown) {
      expect(msg, `thông báo lỗi có em dash: ${msg}`).not.toMatch(/—/);
      expect(msg).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
      expect(msg.trim()).not.toBe('');
    }
  });
});

describe('trùng tên lệnh được BÁO lúc đặt, không bị giấu sau lệnh built-in', () => {
  it('trùng tên built-in thì báo, và nói ra lệnh nào đang giữ chỗ', () => {
    const r = validateSlashCommandName('plan');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('/plan');
    // Cùng tên với một ALIAS cũng bị chặn: `/tokens` route về `/cost`.
    const alias = validateSlashCommandName('tokens');
    expect(alias.ok).toBe(false);
    expect(alias.ok === false && alias.error).toContain('/cost');
    // Không phân biệt hoa thường, không phân biệt có dấu `/` ở đầu.
    expect(validateSlashCommandName('PLAN').ok).toBe(false);
    expect(validateSlashCommandName('/plan').ok).toBe(false);
  });

  it('trùng một lệnh tùy biến đang lưu cũng báo, vì `setCustomSlashCommand` ghi đè im lặng', () => {
    expect(validateSlashCommandName('lint', ['lint']).ok).toBe(false);
    expect(validateSlashCommandName('lint', ['test']).ok).toBe(true);
    expect(validateSlashCommandName('Lint', ['lint']).ok).toBe(false);
  });

  it('lý do phải báo lúc đặt: tên trùng built-in thì lệnh tùy biến KHÔNG bao giờ chạy', () => {
    /*
     * Bằng chứng cho việc chặn: `parseSlashCommand` kiểm tra built-in TRƯỚC
     * `customMappings`, nên `/plan` có mapping `plan -> recipe-c` vẫn ra
     * `{ kind: 'plan' }`, trong khi palette vẽ hai hàng cùng hình `/plan`.
     */
    const custom = { plan: 'recipe-c' };
    expect(parseSlashCommand('/plan', custom)).toEqual({ kind: 'plan', target: '' });
    expect(validateSlashCommandName('plan', Object.keys(custom)).ok).toBe(false);
    expect(enterRuns('plan', 0, false, palette(custom))).toEqual(
      expect.objectContaining({ title: 'plan' }),
    );
    // Cùng lý do với alias: `/policy` cũng về `/mode`.
    expect(parseSlashCommand('/policy auto', { policy: 'recipe-c' })).toEqual({
      kind: 'mode',
      mode: 'never',
    });
  });

  it('tên sạch thì qua cả hai đầu: form nhận, parser chạy', () => {
    expect(validateSlashCommandName('/My-Lint')).toEqual({ ok: true, name: 'my-lint' });
    expect(parseSlashCommand('/my-lint abc', { 'my-lint': 'recipe-x' })).toEqual({
      kind: 'custom_recipe',
      recipeId: 'recipe-x',
      args: 'abc',
    });
  });

  it('không danh sách nào trong danh mục trùng nhau', () => {
    const seen = new Set<string>();
    for (const c of BUILTIN_SLASH_COMMANDS) {
      for (const n of [c.name, ...(c.aliases ?? [])]) {
        expect(seen.has(n), `trùng tên "${n}" trong danh mục built-in`).toBe(false);
        seen.add(n);
      }
    }
  });
});