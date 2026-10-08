/**
 * Năm lỗi trong `components/composer.tsx` mà người dùng trực tiếp điều tra được.
 *
 * Suite chạy `environment: 'node'` (không có jsdom / @testing-library) nên không
 * render được React. Vì vậy mỗi lỗi được chặn bằng HAI lớp:
 *
 *   1. Test hàm thuần — import helper export ra từ composer và gọi thật. Đổi
 *      logic là đỏ ngay, không cần dựng cây component.
 *   2. Test soi SOURCE — bắt đúng DÒNG JSX gọi helper đó. Đổi tên biến, gỡ
 *      phần gọi, hoặc ghi đè bằng chuỗi cứng là đỏ, kể cả khi helper vẫn còn.
 *
 * Lớp 2 là lớp quan trọng: một helper đúng mà không ai gọi thì lỗi vẫn sống.
 *
 * CRLF: file trên đĩa là CRLF (`core.autocrlf`), nên mọi regex có `\n` cứng sẽ
 * PASS ở máy dev và FAIL ở CI. `source` ở dưới đã chuẩn hoá một lần cho mọi test.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  partitionSlashMatches,
  hiddenSlashLine,
  approvalPillLabel,
  approvalShortLabel,
  approvalHint,
  resolveApprovalPolicy,
  stagedFilesChip,
  workspaceScopeChip,
  COMPOSER_FOCUS_PAD,
  SLASH_PALETTE_LIMIT,
  type SlashPrompt,
} from '@/components/composer';
import { BUILTIN_SLASH_COMMANDS, filterPrompts } from '@/lib/slash-commands';

/** Source đã chuẩn hoá CRLF → LF. Mọi assert soi source dùng biến này. */
const source = fs
  .readFileSync(path.resolve(__dirname, '../components/composer.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

/** Bỏ comment để assert chỉ soi CODE, không soi chữ trong giải thích. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('L22 — palette "/" in đúng mô tả từng lệnh, và /cost không bị cắt', () => {
  describe('mô tả lệnh', () => {
    it('mọi lệnh built-in đều mang mô tả riêng, không lệnh nào trùng lệnh khác', () => {
      // Nguồn: composer KHÔNG được tự chế mô tả. Nếu 9 lệnh này còn mô tả trùng
      // nhau thì lỗi "mọi lệnh hiện cùng một câu" chỉ đổi hình thức, chưa hết.
      const descriptions = BUILTIN_SLASH_COMMANDS.map((c) => c.description);
      expect(descriptions.every((d) => d.trim().length > 0)).toBe(true);
      expect(new Set(descriptions).size).toBe(BUILTIN_SLASH_COMMANDS.length);
    });

    it('composer render `p.description` khi có, và chỉ khi có', () => {
      // `p.description ?? <fallback>` — có mô tả thì dùng mô tả, không thì mới
      // rơi về câu trung tính. Đổi thành chuỗi cứng là mất lại toàn bộ lỗi này.
      expect(code).toMatch(/p\.description\s*\?\?/);
    });

    it('chuỗi mô tả sai không còn sót trong JSX', () => {
      // Cụm này là biểu hiện của lỗi: gán cho MỌI lệnh, kể cả /cost và /memory.
      // Còn xuất hiện ở đâu trong code (kể cả trong nhánh fallback) là lỗi sống.
      expect(code).not.toContain('lập kế hoạch bằng planner model');
    });

    it('nhánh fallback của lệnh không hứa hẹn điều nó không làm', () => {
      // Lệnh tùy biến (settings) chưa có mô tả. Câu fallback phải nói đúng điều
      // chắc chắn (gõ tên rồi Enter), không mượn mô tả của /plan.
      const fallback = code.match(/p\.description\s*\?\?\s*'([^']*)'/)?.[1];
      expect(fallback, 'không tìm được nhánh fallback của p.description — regex chắc hỏng').toBeTruthy();
      expect(fallback).not.toMatch(/planner|PLAN mode/i);
      expect(fallback).not.toMatch(/—/);
    });

    it('hàng palette đủ hai dòng để câu dài nhất không bị cắt', () => {
      /*
       * Mô tả dài nhất là 60 ký tự (`/mode`). Ở `line-clamp-1` trên điện thoại
       * (~47 ký tự mỗi dòng ở 11px mono) câu bị cắt, mà phần bị cắt lại là
       * phần quan trọng: `/boost` mất đúng vế "sửa file thật". Hai dòng là mức
       * tối thiểu để câu dài vừa khít, và trên desktop vẫn chỉ chiếm một dòng.
       */
      const longest = Math.max(...BUILTIN_SLASH_COMMANDS.map((c) => c.description.length));
      expect(longest).toBeGreaterThan(50);
      expect(code, 'hàng palette vẫn cắt còn một dòng').not.toMatch(/line-clamp-1/);
      expect(code).toMatch(/line-clamp-2/);
    });

    it('không hàng nào của composer còn dùng `line-clamp-1`', () => {
      // Một hàng nào đó quay lại `line-clamp-1` là lỗi cắt chữ quay lại.
      expect(code).not.toContain('line-clamp-1');
    });

    it('composer không hứa tìm được theo mô tả', () => {
      /*
       * `filterPrompts` cố tình xếp hạng chỉ theo `title` rồi `content`, KHÔNG
       * so khớp `description`. Nếu composer gợi ý "tìm theo mô tả" thì người
       * dùng gõ một từ chỉ có trong mô tả và không thấy gì cả.
       */
      expect(code).not.toMatch(/tìm.{0,12}mô tả|mô tả.{0,12}tìm/i);
      expect(code).not.toMatch(/theo mô tả/i);
    });
  });

  describe('/cost không bị cắt khỏi palette', () => {
    it('trần palette đủ chứa trọn số lệnh built-in', () => {
      // Đây là hình thức trực tiếp của lỗi: 9 lệnh, trần cũ 8. Hạ trần xuống
      // dưới số lệnh là /cost mất lần nữa, lần này không có lý do gì để bào.
      expect(BUILTIN_SLASH_COMMANDS.length).toBe(9);
      expect(SLASH_PALETTE_LIMIT).toBeGreaterThanOrEqual(BUILTIN_SLASH_COMMANDS.length);
    });

    it('gõ "/" ra đủ 9 lệnh, trong đó có /cost', () => {
      // Chạy đúng đường của UI: map lệnh → item palette, lọc rồi cắt.
      const items = BUILTIN_SLASH_COMMANDS.map((c) => ({
        id: `cmd:${c.name}`,
        title: c.name,
        content: `/${c.name} `,
        kind: 'command' as const,
        description: c.description,
      }));
      const all = filterPrompts(items, '', 10_000);
      const { shown, hidden } = partitionSlashMatches(all);

      expect(shown.map((p) => p.title)).toContain('cost');
      expect(shown).toHaveLength(9);
      expect(hidden).toBe(0);
    });

    it('trần cũ 8 của filterPrompts không còn được dùng ở composer', () => {
      // Gọi `filterPrompts(prompts, query)` không truyền limit dính 8. Source phải
      // truyền limit rõ ràng, nếu không lỗi quay lại ngay lập tức.
      expect(code).toMatch(/filterPrompts\(\s*slashPrompts \?\? \[\],\s*slashQuery,\s*\w+\s*,?\s*\)/);
      expect(code).not.toMatch(/filterPrompts\([^,()]+,\s*slashQuery\s*\)/);
    });
  });

  describe('dòng báo "còn N mục nữa"', () => {
    it('số bị ẩn là số THẬT, không phải ước lượng theo loại', () => {
      // Palette trộn lẽnh built-in + recipe + prompt đã lưu. Nếu đếm riêng từng
      // loại rồi cộng lại (hoặc chỉ đếm lệnh) thì con số hiện ra không khớp
      // với những gì người dùng thực sự không thấy.
      const mixed = [
        ...Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, title: `c${i}`, content: '' })),
        ...Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, title: `r${i}`, content: '' })),
        ...Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, title: `p${i}`, content: '' })),
      ];
      const { shown, hidden } = partitionSlashMatches(mixed);
      expect(shown).toHaveLength(SLASH_PALETTE_LIMIT);
      expect(hidden).toBe(mixed.length - SLASH_PALETTE_LIMIT);
      // 34 mục, trần 20 → 14 mục bị giấu. Nếu chỉ đếm "lệnh" thì ra 0 vì 9 lệnh
      // đều nằm trong 20 mục đầu.
      expect(hidden).toBe(14);
      expect(hidden).not.toBe(9);
    });

    it('biên: 9 mục (đúng bằng số lệnh built-in) thì không báo gì cả', () => {
      const items = Array.from({ length: 9 }, (_, i) => ({ id: `i${i}` }));
      const { shown, hidden } = partitionSlashMatches(items);
      expect(shown).toHaveLength(9);
      expect(hiddenSlashLine(hidden)).toBeNull();
    });

    it('biên: ngay dưới và ngay trên trần thì báo đúng lệch', () => {
      // Trần đang dùng là 20; các biên ở đây neo theo TRẦN đó, không chép số cứng.
      const at = (n: number) =>
        hiddenSlashLine(
          partitionSlashMatches(Array.from({ length: n }, (_, i) => ({ id: `i${i}` }))).hidden,
        );
      expect(at(SLASH_PALETTE_LIMIT + 1)).toContain('1');
      expect(at(SLASH_PALETTE_LIMIT)).toBeNull();
      expect(at(SLASH_PALETTE_LIMIT + 5)).toContain('5');
    });

    it('biên: trần nhỏ hơn thì số bị ẩn vẫn đúng (chặn hồi quy về 8 cứng)', () => {
      const run = (limit: number, total: number) =>
        partitionSlashMatches(
          Array.from({ length: total }, (_, i) => ({ id: `i${i}` })),
          limit,
        );
      expect(run(8, 9).hidden).toBe(1); // đúng cái lỗi /cost gốc
      expect(run(8, 9).shown).toHaveLength(8);
      expect(run(20, 9).hidden).toBe(0);
    });

    it('biên: danh sách rỗng hoặc ngắn hơn trần thì không báo', () => {
      expect(partitionSlashMatches([]).hidden).toBe(0);
      expect(partitionSlashMatches([], 8).shown).toEqual([]);
      expect(hiddenSlashLine(partitionSlashMatches([{ id: 'a' }]).hidden)).toBeNull();
    });

    it('biên: trần rác không làm hỏng phép tính', () => {
      // limit âm / NaN / Infinity đều có thể lọt vào từ chỗ khác; phải không bao
      // giờ sinh ra số âm trong câu "còn -3 mục" hay slice âm lấy từ cuối.
      for (const bad of [0, -5, NaN, Infinity]) {
        const { shown, hidden } = partitionSlashMatches(
          Array.from({ length: 9 }, (_, i) => ({ id: `i${i}` })),
          bad,
        );
        expect(hidden).toBeGreaterThanOrEqual(0);
        expect(shown.length).toBeGreaterThanOrEqual(0);
        expect(shown.length).toBeLessThanOrEqual(9);
      }
    });

    it('câu báo mang CON SỐ, không mang dấu "…"', () => {
      // "…" chỉ nói có gì đó bị bỏ, không nói bao nhiêu — người đọc không tự lấy
      // lại được. Con số + gợi ý gõ thêm là đường đảo ngược.
      const line = hiddenSlashLine(3);
      expect(line).toContain('3');
      expect(line).not.toMatch(/…|\.\.\./);
      expect(line).toMatch(/gõ thêm chữ/);
    });

    it('không câu báo nào chứa em dash hay tiếng Anh vay mượn', () => {
      for (const n of [1, 3, 12]) {
        const line = hiddenSlashLine(n)!;
        expect(line).not.toMatch(/—/);
        expect(line).not.toMatch(/\bmore\b|\bhidden\b|\bitems?\b/i);
      }
    });

    it('composer thực sự render dòng báo, và nó là ANH EM của listbox chứ không phải con', () => {
      // `role="listbox"` chỉ được chứa `option`. Nhét `<p>` vào trong là sai
      // ngữ nghĩa ARIA, và dòng đó cũng cuộn mất theo danh sách dài.
      expect(code).toMatch(/\{slashHiddenLine && \(/);
      const listboxBlock = code.match(/role="listbox"[\s\S]{0,4000}?\)\}/);
      expect(listboxBlock, 'không tìm được khối listbox — regex chắc hỏng').toBeTruthy();
      expect(listboxBlock![0]).not.toContain('slashHiddenLine');
    });
  });
});

describe('L9 — không còn hướng dẫn phím trỏ tới phím không tồn tại', () => {
  it('chuỗi "(Ctrl+K / / for Commands)" đã bị gỡ khỏi composer', () => {
    // Không nơi nào trong repo bắt Ctrl+K. Gỡ claim, không thêm handler mới —
    // người dùng không hỏi muốn có phím tắt mới.
    //
    // Soi `code` (đã bỏ comment), không soi `source`: comment giải thích lý do
    // gỡ vẫn phải nhắc tên phím, và comment không hiện ra màn hình.
    expect(code).not.toContain('Ctrl+K');
    expect(code).not.toMatch(/for Commands/);
    expect(source).not.toMatch(/<[^>]*>\s*\(Ctrl\+K/);
  });

  it('gợi ý "/" vẫn còn, ở dòng hướng dẫn phím dưới ô nhập', () => {
    // Gỡ dòng trên không được gỡ luôn gợi ý `/`: đó là phím thật, và nó là cách
    // duy nhất người dùng biết palette tồn tại.
    expect(code).toMatch(/\/\s*lệnh nhanh/);
  });

  it('composer không tự nhận là có hỗ trợ phím tắt mà mình không bắt', () => {
    // Chặn tái phát: thêm `Ctrl+K` vào chuỗi hướng dẫn mà không gắn handler.
    const mentionsShortcut = code.match(/\(\s*(?:Ctrl|Cmd|⌘)[^)]*\)/g) ?? [];
    for (const claim of mentionsShortcut) {
      expect(claim, `composer in phím tắt ${claim} mà không có handler`).toMatch(/Alt\+/);
    }
  });
});

describe('L10 — pill phê duyệt không nói ngược hành vi', () => {
  it('"Autonomous Tools Active" không còn trong composer', () => {
    // smart là chế độ HỎI trước khi ghi. In "Autonomous" cho nó là nói dối.
    expect(code).not.toContain('Autonomous Tools Active');
  });

  it('nhãn của từng policy nói đúng việc chế độ đó làm', () => {
    expect(approvalPillLabel('never', undefined)).toBe('Tự chạy tool, không hỏi');
    expect(approvalPillLabel('smart', undefined)).toBe('Tự chạy lệnh đọc, hỏi trước khi ghi');
    expect(approvalPillLabel('always', undefined)).toBe('Hỏi trước mọi tool');
    expect(approvalPillLabel('chat_only', undefined)).toBe('Không dùng tool');
  });

  it('chế độ smart (mặc định) không bao giờ bị gọi là tự chạy', () => {
    // Đây là lỗi cốt lõi: nhãn của `smart` khác nhãn của `never`. Nếu chúng bị
    // gộp lại, người dùng tưởng agent ghi đĩa tự do rồi mới thấy nó dừng hỏi.
    expect(approvalPillLabel('smart', undefined)).not.toBe(approvalPillLabel('never', undefined));
    expect(approvalPillLabel('smart', undefined)).not.toMatch(/không hỏi$/);
    expect(approvalPillLabel('smart', undefined)).toMatch(/hỏi/i);
  });

  it('bốn policy cho bốn nhãn khác nhau, không nhãn nào rỗng', () => {
    const labels = (['always', 'smart', 'never', 'chat_only'] as const).map((p) =>
      approvalPillLabel(p, undefined),
    );
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(4);
  });

  it('policy undefined + autoPilot rơi về cùng nhãn với policy tương ứng', () => {
    // Đường cũ `autoPilot` phải suy ra đúng như menu "Tác vụ", nếu không
    // composer nói một đằng, menu nói một nẻo.
    expect(approvalPillLabel(undefined, true)).toBe(approvalPillLabel('smart', undefined));
    expect(approvalPillLabel(undefined, false)).toBe(approvalPillLabel('always', undefined));
    expect(approvalPillLabel(undefined, undefined)).toBe(approvalPillLabel('always', undefined));
  });

  it('không nhãn nào chứa em dash, tiếng Anh vay mượn, hay chữ ngợi bơ', () => {
    for (const p of ['always', 'smart', 'never', 'chat_only'] as const) {
      const label = approvalPillLabel(p, undefined);
      expect(label, `nhãn ${p} chứa em dash`).not.toMatch(/—/);
      expect(label, `nhãn ${p} để lộ tiếng Anh`).not.toMatch(/\b(active|autonomous|smart|manual)\b/i);
      expect(label, `nhãn ${p} chứa chữ ngợi bơ`).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });

  it('composer gọi `approvalPillLabel` thay vì in chuỗi', () => {
    // Nhãn nằm ở helper để test được; JSX chỉ được gọi, không được chép lại.
    expect(code).toMatch(/approvalPillLabel\(/);
  });
});

/*
 * MỘT trạng thái, MỘT nhãn — cả ba chỗ hiển thị.
 *
 * Lỗi: cùng một chế độ được in ba lần trên cùng một màn hình bằng ba câu
 * khác nhau và HAI ngôn ngữ — pill tiếng Việt ("Tự chạy tool, không hỏi"),
 * menu "Tác vụ" tiếng Anh ("Autonomous"), nút đổi chế độ lại một bản sao tiếng
 * Anh. Người dùng phải tự dò xem ba nhãn đó có nói cùng một điều không.
 */
describe('L10b — ba chỗ hiển thị phải lấy nhãn từ MỘT nguồn', () => {
  const POLICIES = ['always', 'smart', 'never', 'chat_only'] as const;

  it('bốn chế độ có bốn nhãn ngắn khác nhau, không rỗng', () => {
    const labels = POLICIES.map((p) => approvalShortLabel(p, undefined));
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(4);
  });

  it('nhãn ngắn vừa ô chật: dải công cụ và hàng menu không bị tràn', () => {
    /*
     * Nhãn dài ("Tự chạy lệnh đọc, hỏi trước khi ghi") để ở pill, nơi có chỗ.
     * Bản ngắn đi vào dải công cụ — nơi mọi thứ nằm trong một hàng cuộn ngang
     * chung với ô chọn model — và vào hàng menu 288px. Dài hơn ~14 ký tự là
     * chen vào dải công cụ và đẩy nút khỏi tầm nhìn trên màn hẹp.
     */
    for (const p of POLICIES) {
      expect(approvalShortLabel(p, undefined).length, `nhãn ngắn của ${p} quá dài`).toBeLessThanOrEqual(14);
    }
  });

  it('cả ba bản — ngắn, dài, giải thích — đều tiếng Việt và không có em dash', () => {
    for (const p of POLICIES) {
      for (const [field, label] of [
        ['short', approvalShortLabel(p, undefined)],
        ['long', approvalPillLabel(p, undefined)],
        ['hint', approvalHint(p, undefined)],
      ] as const) {
        expect(label, `${field} của ${p} chứa em dash`).not.toMatch(/—/);
        expect(label, `${field} của ${p} để lộ tiếng Anh`).not.toMatch(
          /\b(active|autonomous|smart|manual|chat only)\b/i,
        );
      }
    }
  });

  it('nhãn ngắn nói đúng việc chế độ đó làm, không mơ hồ', () => {
    // `smart` khác `never` ở đúng một chỗ: hỏi trước khi ghi. Gộp hai nhãn là
    // lỗi L10 quay lại dưới dạng khác: người dùng tưởng agent tự do ghi đĩa.
    expect(approvalShortLabel('smart', undefined)).not.toBe(approvalShortLabel('never', undefined));
    expect(approvalShortLabel('smart', undefined)).toMatch(/hỏi/i);
    expect(approvalShortLabel('never', undefined)).not.toMatch(/hỏi/i);
    // `always` và `chat_only` là hai cực: hỏi tất cả vs không dùng gì.
    expect(approvalShortLabel('always', undefined)).not.toBe(
      approvalShortLabel('chat_only', undefined),
    );
  });

  it('đường cũ `autoPilot` map về đúng nhãn ở cả ba bản', () => {
    // Nếu chỉ `approvalPillLabel` map đúng còn `approvalShortLabel` thì không,
    // thì menu và dải công cụ lệch với pill — đúng lỗi ba nhãn quay lại.
    expect(approvalShortLabel(undefined, true)).toBe(approvalShortLabel('smart', undefined));
    expect(approvalHint(undefined, true)).toBe(approvalHint('smart', undefined));
    expect(approvalShortLabel(undefined, false)).toBe(approvalShortLabel('always', undefined));
    expect(approvalShortLabel(undefined, undefined)).toBe(approvalShortLabel('always', undefined));
    expect(resolveApprovalPolicy(undefined, true)).toBe('smart');
    expect(resolveApprovalPolicy(undefined, false)).toBe('always');
  });

  it('không chỗ nào trong JSX tự in tên chế độ bằng chuỗi rời', () => {
    /*
     * Chốt chặn tái phát: viết thẳng `'Autonomous'` trong JSX là đúng cái lỗi
     * này quay lại. Soi `code` (đã bỏ comment) vì comment giải thích lý do gỡ
     * vẫn phải nhắc lại các tên tiếng Anh đó.
     */
    for (const english of ['Autonomous', 'Chat Only', "'Manual'", "'Smart'"]) {
      expect(code, `JSX còn in "${english}" — nhãn phải đến từ một nguồn chung`).not.toContain(english);
    }
    /* Cả ba chỗ đều gọi helper, không chỗ nào tự dựng. */
    expect(code).toMatch(/approvalPillLabel\(/);
    expect(code).toMatch(/approvalShortLabel\(/);
    expect(code).toMatch(/approvalHint\(/);
  });
});

describe('L11 — file đang staged phải thấy được, không chôn sau menu icon', () => {
  it('chip mang số đếm và nhãn nói rõ đang chờ duyệt', () => {
    expect(stagedFilesChip(1)!.label).toBe('1 tệp chờ duyệt');
    expect(stagedFilesChip(2)!.label).toBe('2 tệp chờ duyệt');
    expect(stagedFilesChip(7)!.label).toContain('7');
    expect(stagedFilesChip(1)!.title).toContain('chưa ghi vào đĩa');
  });

  it('biên 1 → 2 → 0: 0 thì KHÔNG render chip', () => {
    // Không có chip khi rỗng: vùng trống luôn nghĩa là "không có việc chờ",
    // không phải "chưa render xong".
    expect(stagedFilesChip(1)).not.toBeNull();
    expect(stagedFilesChip(2)).not.toBeNull();
    expect(stagedFilesChip(0)).toBeNull();
    expect(stagedFilesChip(-1)).toBeNull();
    expect(stagedFilesChip(NaN)).toBeNull();
  });

  it('chip là NÚT có chữ, không phải badge icon trong menu', () => {
    // Trước đây chỉ có `extensionTasks.push({ key: 'staging' … })` — tức chỉ
    // xuất hiện sau khi mở nút icon 32×32. Không còn mục menu nào cho staging.
    expect(code).not.toMatch(/key:\s*'staging'/);
    expect(code).toMatch(/<button[\s\S]{0,300}?onClick=\{onOpenStaging\}/);
    // Nhãn phải là TEXT trong nút, không phải chỉ `aria-label` trên icon.
    expect(code).toMatch(/\{stagedChip\.label\}/);
  });

  it('chip nằm NGOÀI cụm `overflow-x-auto` để không bị cuộn khuất', () => {
    // Nằm trong cụm cuộn ngang thì trên màn hình hẹp nó trôi ra ngoài tầm mắt,
    // tức lỗi "người dùng không biết có file đang chờ" quay lại nguyên trạng.
    const scrollCluster = code.match(
      /<div className="[^"]*overflow-x-auto[^"]*">[\s\S]*?\n\s*<\/div>\n\s*\{/,
    );
    expect(scrollCluster, 'không tìm được cụm toolbar cuộn ngang — regex chắc hỏng').toBeTruthy();
    expect(scrollCluster![0]).not.toContain('stagedChip');
  });

  it('chỉ có MỘT lối vào panel staging: gọi đúng `onOpenStaging`', () => {
    // Ràng buộc chống "hai nút làm việc khác nhau": mọi nút mở staging đều phải
    // trỏ cùng một callback, không tự quản lý state riêng.
    const openers = [...code.matchAll(/onClick=\{([^}]*)\}/g)]
      .map((m) => m[1])
      .filter((h) => /Staging/i.test(h));
    expect(openers.length).toBeGreaterThan(0);
    for (const handler of openers) expect(handler).toBe('onOpenStaging');
  });

  it('chip bấm được chỉ khi cha truyền `onOpenStaging`', () => {
    // Không có callback thì không vẽ nút bấm được-nhưng-không-làm-gì.
    expect(code).toMatch(/\{stagedChip && onOpenStaging && \(/);
  });

  it('composer gọi `stagedFilesChip` thay vì tự dựng chuỗi', () => {
    expect(code).toMatch(/stagedFilesChip\(stagedFileCount \?\? 0\)/);
  });

  it('chip khai bo góc theo vai trò: control nhỏ thì `rounded-md`, không bo pill', () => {
    /*
     * DESIGN.md §4.1: thang bo góc nay ĐỀU, `rounded-md` (8px) là bậc của
     * control nhỏ; `rounded-full` dành cho viên thuốc (chấm trạng thái,
     * avatar, nút gửi). Chip này là NÚT BẤM nên bo control, không phải viên
     * thuốc — bo kiểu pill sẽ dính vào hàng pill bên cạnh và mất vai trò
     * điều hướng.
     * Ghi rõ ở đây vì RADIUS_ANY của tests/design-system.test.ts chỉ quét
     * sidebar.tsx và backup-reminder.tsx, không canh composer.
     */
    const chip = code.match(/\{stagedChip && onOpenStaging && \(\s*<button[\s\S]*?<\/button>\s*\)\}/);
    expect(chip, 'không tìm được khối chip staged — regex chắc hỏng').toBeTruthy();
    expect(chip![0]).toMatch(/rounded-md/);
    expect(chip![0]).not.toMatch(/rounded-full/);
    // Control KHÔNG sinh bóng trong hệ này (DESIGN.md §5): bóng là chiều sâu
    // dành cho khối nội dung. Nếu `lift-sm` quay lại chip thì mép nút trên nền
    // trắng lại nhoè đi — đúng thứ §5 đã cắt.
    expect(chip![0]).not.toMatch(/lift-sm/);
    // Cỡ chữ lấy từ thang 6 bậc, không tự chế px lạ (DESIGN.md §3).
    expect(chip![0]).toMatch(/text-ui/);
    expect(chip![0]).not.toMatch(/text-\[/);
  });

  it('không chuỗi hiển thị nào của chip chứa em dash', () => {
    for (const n of [1, 3, 42]) {
      const chip = stagedFilesChip(n)!;
      expect(chip.label).not.toMatch(/—/);
      expect(chip.title).not.toMatch(/—/);
      expect(chip.label, 'tiếng Anh "staged" lọt vào nhãn hiển thị').not.toMatch(/\bstaged\b/i);
    }
  });
});

describe('hợp đồng kiểu: SlashPrompt mang `description?`', () => {
  /*
   * `SlashPrompt` ở composer và `FilterablePrompt` ở lib/slash-commands là hai
   * khai báo RIÊNG, cùng hình dạng. `use-chat-orchestration.ts:481` gán
   * `description: cmd.description` vào item palette; nếu `SlashPrompt` thiếu
   * trường thì `tsc` đỏ và lỗi L22 quay lại dạng hardcode. Bài test này đóng
   * vai trò "probe" để không ai gỡ nhầm trường.
   */
  it('mọi lệnh built-in gán được vào SlashPrompt mà không đổi kiểu', () => {
    // Gán qua đúng kiểu composer khai báo. Nếu `description` bị gỡ khỏi
    // `SlashPrompt`, biểu thức này không còn typecheck.
    const items: SlashPrompt[] = BUILTIN_SLASH_COMMANDS.map((c) => ({
      id: `cmd:${c.name}`,
      title: c.name,
      content: `/${c.name} `,
      kind: 'command',
      description: c.description,
    }));
    expect(items).toHaveLength(9);
    expect(items.every((p) => (p.description ?? '').length > 0)).toBe(true);
  });

  it('`description` là TUỲ CHỌN: lệnh tùy biến không có vẫn gán được', () => {
    // Không có dấu `?` thì `customSlashCommands` sẽ không gán được item nào.
    const custom: SlashPrompt = {
      id: 'cmd:custom:my-recipe',
      title: 'my-recipe',
      content: '/my-recipe ',
      kind: 'command',
    };
    expect(custom.description).toBeUndefined();
  });

  it('palette đọc mô tả qua trường của KIỂU đó, không qua ép kiểu', () => {
    // Ép kiểu ở đây là dấu hiệu ai đó lách kiểm tra kiểu thay vì khai báo
    // trường thật — đúng cách vá mà lỗi L22 từng được vá.
    expect(source).not.toMatch(/description\s+as\s+/);
    expect(source).not.toMatch(/p\s+as\s+SlashPrompt/);
  });
});

describe('vỏ composer giữ nguyên bất biản đã có test canh', () => {
  it('vẫn bám `max-w-thread` và full-bleed với gutter px-5', () => {
    // Ba điều kiện mà tests/design-system.test.ts:935-978 đang canh. Composer
    // đổi nhiều, nhưng nếu một trong ba đứt thì test kia đỏ — ở đây chỉ để bài
    // test này tự nói lý do khi nó đỏ.
    expect(source).toContain('max-w-thread');
    expect(source).not.toContain('max-w-4xl');
    expect(source).toMatch(/w-full[^"']*pb-\[env\(safe-area-inset-bottom\)\]/);
    expect(source).toMatch(/(?<![\w-])px-5(?![0-9a-z])/);
  });

  it('vẫn giữ đủ chuỗi phím điều hướng mà tests/a11y-contract.test.ts:202-209 canh', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Escape', 'Home', 'End']) {
      expect(source, `mất chuỗi phím ${key}`).toContain(key);
    }
  });
});

/*
 * Hàng phụ ở chân + phép trao padding khi focus — DESIGN.md §14.4, §15.4 điểm 15.
 *
 * Đây không phải một trong năm lỗi ở đầu tệp mà là HỢP ĐỒNG của thiết kế đích:
 *   §14.4 — hàng chân chở (model · phạm vi · gửi), chữ nhỏ hơn chữ trong ô nhập,
 *           và "vùng focus mở rộng nhẹ theo chiều dọc".
 *   §15.4 — điểm 15: model và tùy chọn phụ lùi sau nội dung nhập; focus rõ nhưng
 *           "không làm cả hội thoại dịch chuyển hay phát sáng gây phân tâm";
 *           điểm 12: thông tin quyết định không nằm ở `micro`/`meta`.
 *
 * Hai vế ấy chỉ cùng đúng nhờ MỘT phép trao: vùng nhập lớn lên 8px, hàng chân
 * trả lại 8px ở đáy. Các test dưới đây khoá phép trao đó bằng SỐ đọc từ chính
 * JSX, nên đổi một lớp Tailwind mà quên lớp kia là đỏ ngay.
 */
describe('hàng chân composer (§14.4) và phép trao padding khi focus (§15.4 điểm 15)', () => {
  /** Thang khoảng cách Tailwind (4px × n) — bản sao của thang, không của quyết định. */
  const SPACING_PX: Record<string, number> = {
    '0': 0,
    '0.5': 2,
    '1': 4,
    '1.5': 6,
    '2': 8,
    '2.5': 10,
    '3': 12,
    '3.5': 14,
    '4': 16,
    '5': 20,
    '6': 24,
  };

  /** Source của MỘT hàng trong vỏ composer, cắt ở hàng kế tiếp. */
  const row = (name: 'input' | 'foot') => {
    const start = code.indexOf(`data-composer-row="${name}"`);
    expect(start, `không tìm thấy hàng ${name} trong JSX`).toBeGreaterThan(-1);
    const next = code.indexOf('data-composer-row="', start + 1);
    return code.slice(start, next === -1 ? undefined : next);
  };

  /** Chuỗi class của hàng (hàng nào khai bằng template literal mới đọc được). */
  const tpl = (name: 'input' | 'foot') => {
    const found = row(name).match(/className=\{`([^`]*)`\}/)?.[1];
    expect(found, `hàng ${name} không khai className bằng template literal`).toBeTruthy();
    return found!;
  };

  /** Class của hàng ở một trạng thái: phần TĨNH + nhánh của `isFocused`. */
  const classesAt = (name: 'input' | 'foot', focused: boolean) => {
    const t = tpl(name);
    const branches = t.match(/\?\s*'([^']*)'\s*:\s*'([^']*)'/);
    expect(branches, `hàng ${name} không khai padding theo hai trạng thái focus`).toBeTruthy();
    return `${t.slice(0, t.indexOf('${'))} ${focused ? branches![1] : branches![2]}`;
  };

  /** px của một cạnh (`pt` / `pb`) trong chuỗi class; thiếu cạnh = 0px. */
  const padPx = (classes: string, edge: 'pt' | 'pb') => {
    const token = classes.split(/\s+/).find((c) => c.startsWith(`${edge}-`));
    if (!token) return 0;
    const step = token.slice(edge.length + 1);
    expect(SPACING_PX[step], `lớp ${token} không có trong thang khoảng cách`).toBeDefined();
    return SPACING_PX[step];
  };

  const four = (state: 'rest' | 'focused') => {
    const input = classesAt('input', state === 'focused');
    const foot = classesAt('foot', state === 'focused');
    return {
      inputTop: padPx(input, 'pt'),
      inputBottom: padPx(input, 'pb'),
      footTop: padPx(foot, 'pt'),
      footBottom: padPx(foot, 'pb'),
    };
  };

  describe('chip phạm vi dự án', () => {
    it('phiên không có tính năng thư mục thì KHÔNG vẽ chip', () => {
      expect(workspaceScopeChip(undefined)).toBeNull();
    });

    it('đã nối thư mục: nhãn là tên thư mục, không phải tên nút', () => {
      expect(workspaceScopeChip({ connected: true, name: 'vyen' })!.label).toBe('vyen');
    });

    it('tên rỗng hoặc toàn khoảng trắng vẫn ra nhãn đọc được', () => {
      for (const name of [null, '', '   ']) {
        const chip = workspaceScopeChip({ connected: true, name });
        expect(chip).not.toBeNull();
        expect(chip!.label.trim().length).toBeGreaterThan(0);
      }
    });

    it('"đang chọn" và "chưa chọn" không được trông giống nhau', () => {
      // Đây đúng là lỗi §15.4 điểm 15 nêu: nút icon thư mục cũ làm hai trạng
      // thái đó hiện ra y hệt nhau.
      const on = workspaceScopeChip({ connected: true, name: 'vyen' })!;
      const off = workspaceScopeChip({ connected: false, name: null })!;
      expect(off.label).not.toBe(on.label);
      expect(off.label).toMatch(/chưa/i);
      expect(on.label).not.toMatch(/chưa/i);
    });

    it('cả hai trạng thái nói rõ phạm vi dự án và bấm thì được gì', () => {
      const on = workspaceScopeChip({ connected: true, name: 'vyen' })!;
      const off = workspaceScopeChip({ connected: false, name: null })!;
      for (const chip of [on, off]) {
        expect(chip.title).toMatch(/phạm vi dự án/i);
        expect(chip.title).toMatch(/Bấm để/);
        expect(chip.title, 'nhãn chứa em dash').not.toMatch(/—/);
      }
      expect(on.title).toContain('vyen');
    });

    it('composer lấy nhãn từ helper, không tự in chuỗi', () => {
      expect(code).toMatch(/workspaceScopeChip\(workspace\)/);
      expect(code).not.toContain('Kết nối thư mục làm việc');
    });

    it('chip là NÚT có CHỮ: nhãn hiện ra, không chỉ nằm trong aria-label', () => {
      const chip = code.match(/\{scopeChip && onPickWorkspace && \([\s\S]*?<\/button>/)?.[0];
      expect(chip, 'không tìm được khối chip phạm vi — regex chắc hỏng').toBeTruthy();
      expect(chip!).toContain('{scopeChip.label}');
      expect(chip!).toContain('aria-label={scopeChip.label}');
    });

    it('chip theo bậc cỡ `ui`, bo control, không bóng, không cỡ tự chế', () => {
      const chip = code.match(/\{scopeChip && onPickWorkspace && \([\s\S]*?<\/button>/)?.[0] ?? '';
      expect(chip).toMatch(/text-ui/);
      expect(chip).not.toMatch(/text-\[/);
      expect(chip).toMatch(/rounded-md/);
      expect(chip).not.toMatch(/rounded-full/);
      expect(chip, 'control không sinh bóng (§5)').not.toMatch(/lift-/);
    });

    it('vùng chạm 44px nới theo CHIỀU DỌC, không chồm sang nút bên cạnh', () => {
      // `min-h-8` (32px) + `after:-inset-y-[6px]` = 44px. Nới ngang
      // (`after:-inset-[6px]`) sẽ đè lên ô chọn model và nút đính kèm.
      const chip = code.match(/\{scopeChip && onPickWorkspace && \([\s\S]*?<\/button>/)?.[0] ?? '';
      expect(chip).toMatch(/min-h-8/);
      expect(chip).toMatch(/after:-inset-y-\[6px\]/);
      expect(chip).not.toMatch(/after:-inset-\[6px\]/);
      expect(chip).toMatch(/after:inset-x-0/);
    });
  });

  describe('hàng chân: vị trí và cỡ chữ', () => {
    it('ô chọn model nằm trong hàng chân, không còn ở dải công cụ', () => {
      const strip = code.indexOf('rounded-t-[15px_15px_0_0]');
      const foot = code.indexOf('data-composer-row="foot"');
      const model = code.indexOf('<ModelSelector');
      const chip = code.indexOf('{scopeChip && onPickWorkspace');
      expect(strip).toBeGreaterThan(-1);
      expect(foot).toBeGreaterThan(strip);
      expect(model).toBeGreaterThan(foot);
      expect(chip).toBeGreaterThan(model);
    });

    it('mọi chữ ở hàng chân nhỏ hơn chữ trong ô nhập (16px), và không ở bậc micro/meta', () => {
      const foot = code.slice(code.indexOf('data-composer-row="foot"'), code.indexOf('</form>'));
      expect(foot.length, 'không cắt được khối hàng chân').toBeGreaterThan(500);
      // Ô nhập vẫn là bậc đọc dài — đây là mốc so sánh.
      expect(code).toMatch(/className="w-full resize-none border-none bg-transparent p-0 font-sans text-read/);
      expect(foot).not.toMatch(/text-read/);
      expect(foot).not.toMatch(/text-head/);
      // §15.4 điểm 12: phạm vi và chế độ phê duyệt là thông tin để QUYẾT ĐỊNH.
      expect(foot).not.toMatch(/text-micro/);
      expect(foot).not.toMatch(/text-meta/);
      expect(foot).toMatch(/text-ui/);
    });

    it('nhãn của ô chọn model cũng ở bậc `ui`, không tự chế cỡ', () => {
      const selector = fs
        .readFileSync(path.resolve(__dirname, '../components/model-selector.tsx'), 'utf8')
        .replace(/\r\n/g, '\n');
      const trigger = selector.split('aria-haspopup')[1]?.split('>')[0] ?? '';
      expect(trigger, 'trigger của ModelSelector thiếu bậc chữ `ui`').toMatch(/text-ui/);
      expect(trigger).not.toMatch(/text-\[/);
    });

    it('nhãn chế độ phê duyệt ở cả hai chỗ đều lên bậc `ui`', () => {
      // Cùng một thông tin quyết định, hai chỗ hiển thị (nút đổi ở dải công cụ
      // và pill ở hàng chân) — để một chỗ 12px là chỗ đó khó đọc hơn hẳn.
      expect(code).not.toMatch(/text-xs/);
      const strip = code.slice(
        code.indexOf('rounded-t-[15px_15px_0_0]'),
        code.indexOf('data-composer-row="input"'),
      );
      expect(strip, 'nút đổi chế độ ở dải công cụ chưa lên bậc ui').toMatch(/text-ui text-tertiary/);
    });
  });

  describe('focus: vùng nhập lớn lên, vỏ KHÔNG đổi chiều cao', () => {
    it('tổng padding dọc của hai hàng bằng nhau ở hai trạng thái', () => {
      const rest = four('rest');
      const focused = four('focused');
      const sum = (f: typeof rest) => f.inputTop + f.inputBottom + f.footTop + f.footBottom;
      expect(sum(focused)).toBe(sum(rest));
      expect(sum(rest)).toBeGreaterThan(0);
    });

    it('vùng nhập lớn lên, hàng chân trả lại đúng chừng ấy', () => {
      const rest = four('rest');
      const focused = four('focused');
      const input = (f: typeof rest) => f.inputTop + f.inputBottom;
      const foot = (f: typeof rest) => f.footTop + f.footBottom;
      expect(input(focused)).toBeGreaterThan(input(rest));
      expect(foot(rest)).toBeGreaterThan(foot(focused));
      expect(input(focused) - input(rest)).toBe(foot(rest) - foot(focused));
    });

    it('hàng chân trả ở ĐÁY, không trả ở đỉnh', () => {
      // Trả ở đỉnh là nút gửi nhảy lên khi vừa bấm vào ô nhập — mắt thấy ngay.
      const rest = four('rest');
      const focused = four('focused');
      expect(focused.footTop).toBe(rest.footTop);
      expect(focused.footBottom).toBeLessThan(rest.footBottom);
      expect(focused.inputTop).toBeGreaterThan(rest.inputTop);
      expect(focused.inputBottom).toBeGreaterThan(rest.inputBottom);
    });

    it('bốn con số trong JSX khớp COMPOSER_FOCUS_PAD', () => {
      expect(four('rest')).toEqual({ ...COMPOSER_FOCUS_PAD.rest });
      expect(four('focused')).toEqual({ ...COMPOSER_FOCUS_PAD.focused });
    });

    it('hai hàng chạy cùng nhịp: cùng transition và cùng duration', () => {
      for (const name of ['input', 'foot'] as const) {
        expect(tpl(name), `hàng ${name} không chuyển padding`).toContain('transition-[padding]');
        expect(tpl(name), `hàng ${name} thiếu duration`).toContain('duration-150');
      }
    });

    it('không còn hiệu ứng phát sáng khi focus (§15.4 điểm 15)', () => {
      // `PulseGlow` là vòng `animate-pulse ring-accent/30` từng bao quanh vỏ
      // composer khi focus. Điểm 15 cấm "phát sáng gây phân tâm": dấu hiệu focus
      // nay là viền accent cộng vùng nhập lớn lên, không phải một hiệu ứng.
      expect(code).not.toContain('PulseGlow');
    });
  });
});