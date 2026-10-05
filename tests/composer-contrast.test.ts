/**
 * HỢP ĐỒNG TƯƠNG PHẢN của composer — đo bằng công thức WCAG, không đo bằng mắt.
 *
 * Vì sao suite này tồn tại: `tests/design-system.test.ts` cấm token sai TÊN và
 * cấm opacity trên token CHỮ, nhưng cả hai đều im lặng với câu hỏi thật sự
 * của một màu trên một nền: `text-warning` (#9a6206) trên `bg-warning/10` là
 * MỘT CẶP hợp lệ theo mọi assertion tĩnh, và vẫn chỉ đạt 4.10:1. Chữ mờ đi
 * trên nền giấy trắng là thứ mắt dễ chấp nhận vì nó "trông quen thuộc", nên
 * không có gì đỏ.
 *
 * Ở đây mọi ngưỡng đều được TÍNH ra từ palette đang thật:
 *   - màu đọc từ khối `hex` trong `tailwind.config.ts` và khối `--bg-*` trong
 *     `app/globals.css` — không chép lại danh sách, nên đổi palette thì test
 *     đi theo và vẫn đỏ đúng chỗ;
 *   - nền được GHÉP theo đúng chuỗi cha của DOM (opacity trên nền trong suốt
 *     phải phép trộn alpha thật, không phải màu gốc);
 *   - ngưỡng dùng đúng của WCAG theo CỠ CHỮ, không dùng một con số chung.
 *
 * Mỗi test trả lời được "đổi dòng nào thì nó đỏ": test soi className thật của
 * phần tử, tự dò ra nền của nó, rồi tự tính tỷ lệ. Đổi `text-primary` thành
 * `text-warning` trên đúng dòng đó là đỏ kèm con số — không phải đỏ vì tên
 * class đổi.
 *
 * CRLF: file trên đĩa là CRLF (`core.autocrlf`) nên mọi regex có `\n` cứng sẽ
 * PASS ở máy dev và FAIL ở CI. `source` dưới đây đã chuẩn hoá một lần.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/* ───────────────────────── palette: đọc từ nguồn sự thật ───────────────────── */

const tailwindConfig = fs.readFileSync(
  path.resolve(__dirname, '../tailwind.config.ts'),
  'utf8',
).replace(/\r\n/g, '\n');
const globalsCss = fs
  .readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8')
  .replace(/\r\n/g, '\n');
/** Source composer đã chuẩn hoá CRLF → LF. */
const source = fs
  .readFileSync(path.resolve(__dirname, '../components/composer.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
/**
 * Source đã BỎ COMMENT.
 *
 * Bắt buộc khi assert dạng "không còn X trong file": giải thích tại sao X bị
 * gỡ hay phải nhắc lại chính X, nên test soi thẳng `source` sẽ đỏ vì comment
 * của người viết. Đây là cùng cách `composer-affordances.test.ts` tách
 * `source` (để soi chuỗi hiển thị) và `code` (để soi code).
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/**
 * `source` với comment bị THAY BẰNG KHOẢNG TRẮNG (giữ nguyên độ dài).
 *
 * Cần cho phần dò cây thẻ: các comment giải thích trong file này chứa cả dấu
 * `<` và cả `className="…"` mô phỏng. Nếu dò thẻ trên `source` thì `lastIndexOf
 * ('<')` sẽ dừng lại BÊN TRONG một comment và hàm dò nền tưởng chip nằm trong
 * thẻ không tồn tại, rồi âm thầm đo trên nền gốc.
 */
const codeMasked = source
  .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  .replace(/^([ \t]*)\/\/[^\n]*$/gm, (m) => ' '.repeat(m.length));

/**
 * Bảng màu lấy từ khối `const hex = {…} as const` của tailwind.config.ts.
 *
 * Chỉ đọc đúng khối đó (không quét cả file) để một giá trị trùng tên ở
 * `boxShadow` hay `maxWidth` không lọt vào bảng màu.
 */
const PALETTE: Record<string, string> = (() => {
  const block = tailwindConfig.match(/const hex = \{([\s\S]*?)\} as const/);
  if (!block) throw new Error('không đọc được khối `hex` trong tailwind.config.ts');
  const out: Record<string, string> = {};
  for (const m of block[1]!.matchAll(/'?([a-z][\w-]*)'?\s*:\s*'(#[0-9a-fA-F]{6})'/g)) {
    out[m[1]!] = m[2]!;
  }
  return out;
})();

/**
 * Alias tạm (DESIGN.md §6.1) dạng `'tên': hex.khác`.
 *
 * Cần để composer đã lỡ dùng `text-amber-warn` thì test vẫn TÍNH RA con số
 * 4.10:1 và báo đúng lý do, thay vì ném lỗi "token không biết" — một thông
 * điệp đỏ hữu ích hơn nhiều so với một crash.
 */
for (const m of tailwindConfig.matchAll(/'([a-z][\w-]*)':\s*hex\.([a-z][\w-]*),/g)) {
  PALETTE[m[1]!] ??= PALETTE[m[2]!];
}

/**
 * Nền gốc của tài liệu: `body { background-color: rgb(var(--bg-sunken)) }`.
 * Dùng làm đáy khi phép đi lên cha không gặp một nền đục nào.
 */
const ROOT_BG = (() => {
  const m = globalsCss.match(/--bg-sunken:\s*(\d+)\s+(\d+)\s+(\d+)/);
  if (!m) throw new Error('không đọc được --bg-sunken trong globals.css');
  return `#${[m[1], m[2], m[3]]
    .map((v) => Number(v).toString(16).padStart(2, '0'))
    .join('')}`;
})();

/* ───────────────────────────────── toán tương phản ───────────────────────────── */

type Rgb = readonly [number, number, number];

function toRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Alpha trộn kiểu nguồn-over (mà CSS thật sự dùng cho `rgb(var(--x) / a)`). */
function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [
    Math.round(alpha * fg[0] + (1 - alpha) * bg[0]),
    Math.round(alpha * fg[1] + (1 - alpha) * bg[1]),
    Math.round(alpha * fg[2] + (1 - alpha) * bg[2]),
  ] as const;
}

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(linearize) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Tỷ lệ WCAG 2.x, làm tròn 2 chữ số như mọi công cụ đo đều làm. */
function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(toRgb(a)), luminance(toRgb(b))];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/* ─────────────────────────── đọc token ra khỏi className ──────────────────────── */

/**
 * Utility KHÔNG phải màu, dùng chung tiền tố `text-`.
 *
 * `text-center` là canh chữ, `text-ui`/`text-meta`/`text-xs` là CỠ CHỮ —
 * đều không màu. Nếu không loại chúng ra, phần tử nào có `text-xs` đứng
 * trước `text-primary` sẽ bị đo bằng cỡ chữ và ném lỗi. Danh sách đóng, không
 * suy ra: nó phải là những tên đang thật sự có trong file.
 */
const NON_COLOR = new Set([
  'left', 'center', 'right', 'justify',
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
  'micro', 'meta', 'ui', 'body', 'read', 'head',
]);

/**
 * `text-primary` / `bg-warning/10` / `border-warning` → tên token + alpha.
 *
 * Alpha mặc định 1. Trả `null` khi className không có token màu nào ở prefix
 * đó — dùng để phân biệt "không có màu" với "màu không resolve được".
 */
function token(
  cls: string,
  prefix: 'text' | 'bg' | 'border',
): { name: string; alpha: number } | null {
  const re = new RegExp(`(?:^|\\s)${prefix}-([a-z][\\w-]*?)(?:/(\\d{1,3}))?(?=\\s|$)`, 'g');
  for (const m of cls.matchAll(re)) {
    const name = m[1]!;
    if (prefix === 'text' && NON_COLOR.has(name)) continue;
    return { name, alpha: m[2] === undefined ? 1 : Number(m[2]) / 100 };
  }
  return null;
}

function hexOf(name: string): string {
  const hex = PALETTE[name];
  if (!hex) {
    throw new Error(
      `token màu "${name}" không có trong tailwind.config.ts — ` +
        `test đo tương phản sẽ không biết màu nào để ghép.`,
    );
  }
  return hex;
}

/** Mọi `className` của composer, theo đúng thứ tự xuất hiện trong file. */
const CLASS_RE = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([\s\S]*?)`\})/g;
const CLASS_HITS = [...source.matchAll(CLASS_RE)].map((m) => ({
  text: m[1] ?? m[2] ?? m[3] ?? '',
  at: m.index!,
}));

/**
 * Đọc token CÓ variant, ví dụ `hover:bg-warning/20`.
 *
 * Tách riêng khỏi `token()` vì `token()` cố tình chỉ soi phần tử ở trạng thái
 * nghỉ — nếu nó nuốt luôn `hover:` thì phép so sánh "nghỉ vs hover" sẽ so
 * trạng thái nghỉ với chính nó và luôn xanh, tức test chết trong im lặng.
 */
function variantToken(cls: string, variant: string, prefix: 'text' | 'bg' | 'border') {
  const scoped = cls
    .split(/\s+/)
    .filter((c) => c.startsWith(`${variant}:`))
    /* Bỏ tiền tố variant: `token()` khớp theo ĐẦU chuỗi, mà `hover:bg-…`
     * bắt đầu bằng `hover:` chứ không phải `bg-`. */
    .map((c) => c.slice(variant.length + 1))
    .join(' ');
  return token(scoped, prefix);
}

/** Tên thẻ JSX mở ra ngay TRƯỚC một offset (lùi về dấu `<` gần nhất). */
function tagNameBefore(at: number): string | null {
  const before = codeMasked.slice(0, at);
  const lt = before.lastIndexOf('<');
  if (lt === -1) return null;
  const m = before.slice(lt + 1).match(/^([A-Za-z][\w.]*)/);
  return m ? m[1]! : null;
}

/**
 * Trong khoảng `from…to` có thẻ `name` nào bị ĐÓNG hẳn ra không?
 *
 * Phải ĐẾM độ sâu chứ không thể so thẻ mở với một thẻ đóng bất kỳ: dải công
 * cụ lồng nhau (`div` trong `div`), nên `</div>` của lớp trong xuất hiện trước
 * chip đã khiến lớp ngoài trông như đã đóng. So naively thì chip bị coi là
 * nằm NGOÀI dải công cụ, và nền đo được là nền của vỏ form thay vì của dải.
 */
function closesBefore(name: string, from: number, to: number): boolean {
  const re = new RegExp(`<\\/?${name}\\b`, 'g');
  let depth = 0;
  const window = codeMasked.slice(from, to);
  for (const m of window.matchAll(re)) {
    if (m[0].startsWith('</')) {
      depth--;
      /* Chạm 0 rồi đóng tiếp → thẻ cha đã kết thúc trước đối tượng. */
      if (depth < 0) return true;
    } else {
      /* `<div … />` không mở lồng nhau nên không tính. */
      const gt = window.indexOf('>', m.index);
      if (gt !== -1 && window[gt - 1] === '/') continue;
      depth++;
    }
  }
  return false;
}

/**
 * `cand` có phải THẺ BAO của `subject` trong cây JSX không?
 *
 * Vì sao phải hỏi câu này: file composer có NHIỀU className nằm cạnh nhau,
 * và "đi lùi tìm className trước đó" KHÔNG phải là "đi lên cha". Nút đổi chế
 * độ là ANH EM của chip và mang `bg-raised`; bản đầu của hàm này đo nền chip
 * trên nền của nút đó và ra một con số sai — im lặng, vì sai ở đây vẫn ra một
 * tỷ lệ hợp lệ.
 *
 * GIỚI HẠN ĐÃ BIẾT: dấu `>` dùng để tìm cuối thẻ mở là `>` ĐẦU TIÊN, nên một
 * thuộc tính chứa `>` (ví dụ `=>` trong handler inline) sẽ làm lệch. Trong
 * composer mọi `className` đều là thuộc tính CUỐI nên điều đó không xảy ra —
 * và nếu sau này có, hàm này sẽ báo sai nền chứ không báo sai là đúng.
 */
function isAncestor(candIdx: number, subjectIdx: number): boolean {
  const candAt = CLASS_HITS[candIdx]!.at;
  const subjAt = CLASS_HITS[subjectIdx]!.at;
  if (candAt >= subjAt) return false;
  const name = tagNameBefore(candAt);
  if (!name) return false;
  const openEnd = codeMasked.indexOf('>', candAt);
  /* Đối tượng nằm ngay trong chính thẻ mở này (ví dụ class của chính nó). */
  if (openEnd === -1 || openEnd > subjAt) return true;
  return !closesBefore(name, openEnd, subjAt);
}

/**
 * Nền THỰC SỰ nằm dưới className thứ `index`, ghép từ chuỗi CHA trong DOM.
 *
 * Đi từ `index` ngược lên, chỉ ghép className thuộc thẻ BAO (xem `isAncestor`),
 * và dừng khi gặp nền ĐỤC — dưới nó là thứ không vẽ gì thêm. Nhờ vậy
 * `bg-warning/10` của chip được ghép lên `bg-raised/60` của dải công cụ rồi
 * lên `bg-surface`, đúng thứ trình duyệt vẽ, chứ không phải trắng trơn.
 *
 * `skipSelf` bỏ chính lớp đang cần đo (dùng khi muốn nền BÊN NGOÀI nó).
 */
function backgroundAt(index: number, skipSelf = false): string {
  let base: Rgb = toRgb(ROOT_BG);
  const stack: { name: string; alpha: number }[] = [];

  for (let i = index - (skipSelf ? 1 : 0); i >= 0; i--) {
    if (!isAncestor(i, index)) continue;
    const t = token(CLASS_HITS[i]!.text, 'bg');
    if (!t || t.alpha === 0) continue;
    /*
     * `bg-transparent` / `bg-current` KHÔNG vẽ gì — nó không phải một màu nên
     * cũng không có trong bảng token. Coi như vô hình và đi lên tiếp, đúng như
     * trình duyệt: ô nhập có `bg-transparent` nên dò nền phải xuyên qua nó.
     */
    if (PAINTLESS.has(t.name)) continue;
    stack.push(t);
    /* Trong suốt thì phải đi lên tiếp; đục thì đã biết hết. */
    if (t.alpha === 1) break;
  }

  for (const t of stack.reverse()) base = over(toRgb(hexOf(t.name)), t.alpha, base);
  return `#${base.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Vị trí của className chứa một chữ `needle` (dùng để tìm đúng phần tử). */
function indexOfClassWith(needle: string): number {
  const i = CLASS_HITS.findIndex((c) => c.text.includes(needle));
  if (i === -1) throw new Error(`không tìm được className chứa "${needle}" — regex chắc hỏng`);
  return i;
}

/**
 * className ĐANG BAO một đoạn source — tức thẻ mở ngay trước đoạn đó.
 *
 * Cần cho dòng gợi ý phím: chuỗi của nó nằm ở dòng kế bên trong thẻ, chứ
 * không nằm trong `className` của nó. Định vị bằng chính chuỗi rồi lấy thẻ
 * bao quanh cũng bảo đảm thêm: ai đó tách dòng gợi ý ra khỏi thẻ mang class
 * thì test đỏ, chứ không âm thầm đo nhầm một thẻ khác.
 */
function enclosingClassOf(sourceNeedle: string): number {
  const at = source.indexOf(sourceNeedle);
  if (at === -1) throw new Error(`không còn "${sourceNeedle}" trong composer`);
  let found = -1;
  for (let i = 0; i < CLASS_HITS.length; i++) {
    if (CLASS_HITS[i]!.at < at) found = i;
    else break;
  }
  if (found === -1) throw new Error(`không tìm được thẻ bao "${sourceNeedle}" — regex chắc hỏng`);
  return found;
}

/** Nền "không vẽ gì" — không phải màu, nên không có trong bảng token. */
const PAINTLESS = new Set(['transparent', 'current', 'inherit']);

/* ─────────────────────────────── ngưỡng WCAG ─────────────────────────────────── */

/** 1.4.3: chữ thường (dưới 18.66px bold / 24px) cần 4.5:1. */
const AA_NORMAL_TEXT = 4.5;
/** 1.4.11: ranh giới component & icon mang nghĩa cần 3:1. */
const AA_NON_TEXT = 3;

/* ─────────────────────────────────── test ────────────────────────────────────── */

describe('composer — tương phản tính được, không soi bằng mắt', () => {
  describe('chip file chờ duyệt', () => {
    /**
 * Chip: `ml-2 inline-flex flex-none items-center gap-1.5 rounded-md border
 * border-warning bg-warning/10 … text-primary`.
 *
 * Neo bằng CHÚỒI class CHỨA CHUYỆN, không phải `rounded-md` trần: hệ bo góc
 * nay đều nên `rounded-md`, nên `rounded-md` khớp cả slash-command item ở trên
 * và phép đo sẽ trượt sang phần tử khác — đo đúng con số nhưng của vật thể sai.
 */
    const CHIP = 'gap-1.5 rounded-md border border-warning';
    const idx = indexOfClassWith(CHIP);
    const chipClass = CLASS_HITS[idx]!.text;
    /** Nền ngoài chip = dải công cụ ghép trên vỏ composer. */
    const outer = backgroundAt(idx, true);
    const bgRest = token(chipClass, 'bg')!;
    const restBg = over(
      toRgb(hexOf(bgRest.name)),
      bgRest.alpha,
      toRgb(outer),
    );
    const restBgHex = `#${restBg.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    const text = token(chipClass, 'text')!;

    it('nền đo được là nền THẬT của chip, không phải nền của phần tử anh em', () => {
      /*
       * Probe cho chính hàm dò nền. Nút đổi chế độ là ANH EM của chip và mang
       * `bg-raised`; nếu hàm dò nền chỉ "đi lùi tìm className trước đó" thì nó
       * đo chip trên nền của nút đó. Sai âm thầm, vì con số thu được vẫn là một
       * tỷ lệ hợp lệ — chỉ là của đối tượng khác.
       *
       * Chuỗi cha của chip: `bg-surface` (vỏ form) → `bg-raised/60` (dải công
       * cụ) = #f9f9f9. Không phải `bg-raised` đặc của nút anh em.
       *
       * Đây là con số GHÉP của hai tầng, không phải một token — nên nó đổi theo
       * bảng màu. Cập nhật ở đây khi §2 của DESIGN.md đổi, đừng đoán.
       */
      expect(outer, 'nền ngoài chip phải là dải công cụ ghép trên vỏ form').toBe('#f9f9f9');
    });

    it('nhãn ở trạng thái nghỉ đạt WCAG AA trên nền ĐÃ GHÉP, không phải trên trắng trơn', () => {
      /*
       * Nền thật của chip là `bg-warning/10` phủ lên `bg-raised/60` phủ lên
       * `bg-surface`, không phải `#ffffff`. Đo trên trắng trơn là đo sai đối
       * tượng và cho ra con số đẹp hơn thật — đó là lý do lỗi này sống dai.
       */
      const ratio = contrast(hexOf(text.name), restBgHex);
      expect(
        ratio,
        `nhãn chip (${text.name}) trên nền ghép ${restBgHex} chỉ đạt ${ratio}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(text.name, 'chữ phải là mực; màu cảnh báo để dành cho nền và viền').toBe('primary');
    });

    it('hover KHÔNG được làm chữ khó đọc hơn lúc nghỉ', () => {
      /*
       * Lỗi gốc: nền phủ đậm dần (`/10` → `/20`) trong khi chữ vẫn là màu cảnh
       * báo, nên hover ĐẸP HƠN chữ và tỷ lệ rơi 4.10 → 3.61. Ở đây nền vẫn
       * đậm dần (giữ nguyên cảm giác) nhưng chữ là mực nên vẫn đọc được.
       *
       * Đọc bằng `variantToken` chứ không phải `token` — nếu đọc nhầm sang
       * trạng thái nghỉ thì phép so sánh này so nghỉ với nghỉ và luôn xanh.
       */
      const hoverBg = variantToken(chipClass, 'hover', 'bg');
      expect(hoverBg, 'chip phải còn phản hồi hover').not.toBeNull();
      const hoverBgHex = (() => {
        const c = over(toRgb(hexOf(hoverBg!.name)), hoverBg!.alpha, toRgb(outer));
        return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      })();
      const ratio = contrast(hexOf(text.name), hoverBgHex);
      expect(
        ratio,
        `nhãn chip khi hover (${text.name} trên ${hoverBgHex}) chỉ đạt ${ratio}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      /* Chữ không được đổi bậc khi hover — đổi là mất đúng cái đã sửa. */
      expect(variantToken(chipClass, 'hover', 'text'), 'hover đổi màu chữ thì mất ý nghĩa').toBeNull();
    });

    it('viền chip là ranh giới nhìn thấy được: 3:1 theo WCAG 1.4.11', () => {
      /*
       * Ở mức `/40` viền ghép ra #d1ba94 — 1.72:1, tức control không có mép:
       * thứ duy nhất tách nó khỏi dải công cụ là một sợi tóc vô hình.
       *
       * So trên `outer` (nền NGOÀI chip) chứ không phải nền của chính nó: ranh
       * giới là ranh giới, tức nó phải nổi lên trên thứ nó tách ra khỏi.
       */
      const b = token(chipClass, 'border')!;
      expect(b.alpha, 'viền phải đặc; modifier opacity làm nó chìm vào nền').toBe(1);
      const ratio = contrast(hexOf(b.name), outer);
      expect(
        ratio,
        `viền chip (${b.name}) trên nền ngoài ${outer} chỉ đạt ${ratio}:1`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });
  });

describe('dòng gợi ý phím dưới ô nhập', () => {
    const idx = enclosingClassOf('Shift+Enter xuống dòng');
    const hintClass = CLASS_HITS[idx]!.text;

    it('năm gợi ý phím đọc được: text-tertiary trên nền app, không phải text-disabled', () => {
      const bg = backgroundAt(idx);
      const t = token(hintClass, 'text')!;
      const ratio = contrast(hexOf(t.name), bg);
      expect(
        ratio,
        `gợi ý phím (${t.name} trên ${bg}) chỉ đạt ${ratio}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      /*
       * `text-disabled` là 2.28:1 và mang nghĩa "không dùng được" — dùng nó
       * cho một dòng người dùng vẫn cần đọc là sai nghĩa, không chỉ sai số.
       */
      expect(t.name).not.toBe('disabled');
      expect(t.name).toBe('tertiary');
    });

    it('dùng một bậc cỡ chữ có tên trong thang 6 bậc, không phải px tự chế', () => {
      /* `text-[10.5px]` không thuộc bậc nào nên không ai nhớ được có đúng một cỡ. */
      expect(hintClass).not.toMatch(/text-\[/);
      expect(hintClass).toMatch(/(?:^|\s)text-meta(?=\s|$)/);
    });
  });

  describe('băng lỗi tệp', () => {
    const ERR = 'notice-warn';
    const idx = indexOfClassWith(ERR);
    const errClass = CLASS_HITS[idx]!.text;

    it('cũng đạt AA trên nền ngoài vỏ composer, cùng cách sửa với chip', () => {
      /*
       * Nằm NGOÀI `<form>` nên nền của nó là nền app, không phải trắng. Bản cũ
       * (`text-amber-warn` trên `bg-warning/10`) đạt 4.01:1 ở đây — cùng lỗi
       * với chip, chỉ khác chỗ đứng.
       */
      const bg = backgroundAt(idx);
      const t = token(errClass, 'text')!;
      const b = token(errClass, 'bg')!;
      const composited = (() => {
        const c = over(toRgb(hexOf(b.name)), b.alpha, toRgb(bg));
        return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      })();
      expect(contrast(hexOf(t.name), composited)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  });

  describe('bảng màu "/" đủ cao theo thiết bị', () => {
    /**
     * Cao khung palette, tính bằng px cho từng viewport. Đây là hàm thật của
     * CSS `min()`, viết lại ở đây để test dùng con số chứ không dùng tên class.
     *
     * Trả `null` thay vì ném lỗi khi khung không dùng `min(…, vh)`: hàm này chạy
     * BÊN TRONG `it`, nên ném ở đây sẽ làm cả suite đỏ trước khi các test còn
     * lại kịp chạy — tức một lỗi biết khuôn làm màn hình tối đen, và người đọc
     * không biết những test kia có xanh hay không.
     */
    function paletteHeightPx(viewportPx: number): number | null {
      const cls = CLASS_HITS.map((c) => c.text).find(
        (c) => c.includes('overflow-y-auto') && c.includes('max-h-'),
      );
      const m = cls?.match(/max-h-\[min\(([^)]+)\)\]/);
      if (!m) return null;
      const values = m[1]!.split(',').map((p) => {
        const q = p.trim();
        if (q.endsWith('rem')) return parseFloat(q) * 16;
        if (q.endsWith('vh')) return (parseFloat(q) / 100) * viewportPx;
        return Number.NaN;
      });
      return values.some(Number.isNaN) ? null : Math.min(...values);
    }

    it('không còn chiều cao cứng 256px: màn nào cũng cao hơn, và cao hơn THEO màn', () => {
      const OLD_FIXED_PX = 256; // `max-h-64`, giá trị trước đây
      const phone = paletteHeightPx(667); // iPhone SE: màn thấp nhất còn dùng
      const desktop = paletteHeightPx(900);
      expect(phone, 'khung palette phải cao theo viewport, không phải px cứng').not.toBeNull();
      expect(desktop).not.toBeNull();
      expect(phone!, `điện thoại chỉ còn ${phone}px`).toBeGreaterThan(OLD_FIXED_PX);
      expect(desktop!).toBeGreaterThan(OLD_FIXED_PX);
      expect(desktop!, 'màn rộng phải cao hơn màn thấp').toBeGreaterThan(phone!);
    });

    it('không nuốt quá nửa màn trên điện thoại, để vẫn thấy hội thoại', () => {
      const phone = 667;
      const height = paletteHeightPx(phone);
      expect(height).not.toBeNull();
      expect(height! / phone).toBeLessThanOrEqual(0.6);
    });

    it('vẫn cuộn được và vẫn giữ cả hai quyết định đã được biện minh', () => {
      /* Trần 20 mục + mô tả hai dòng là hai sửa đúng; test này chặn việc
       * "sửa cho khỏi cuộn" bằng cách giam lại một trong hai. */
      const palette = CLASS_HITS.map((c) => c.text).find((c) => c.includes('overflow-y-auto'))!;
      expect(palette).toMatch(/overflow-y-auto/);
      expect(code).toMatch(/line-clamp-2/);
      expect(code).not.toMatch(/line-clamp-1/);
    });
  });
});