/**
 * Khoá copy tiếng Việt cho thang bằng chứng + quét tên enum lọt ra UI.
 *
 * Repo chạy vitest environment 'node' (không jsdom / testing-library) nên phần
 * logic dạng thuần được test thẳng (`describeEvidence`), phần JSX được khoanh
 * bằng cách đọc SOURCE (cùng cách `tab-runtime-state.test.ts` và
 * `design-system.test.ts` làm) — vì chỉ test hàm thuần thì sửa JSX lại là bug
 * quay về mà test vẫn xanh.
 *
 * Mỗi `it` ghi rõ DÒNG nào đổi làm nó ĐỎ.
 *
 * `core.autocrlf` làm file trên đĩa là CRLF còn checkout sạch ở CI là LF, nên
 * regex viết cứng `\n` sẽ xanh ở máy này và đỏ ở máy kia. Chuẩn hoá một lần
 * ở `read()` cho mọi regex bên dưới.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeEvidence,
  type EvidenceLevel,
} from '@/lib/evidence';
import { ALL_CATEGORIES, CATEGORY_DESCRIPTIONS, type CategoryId } from '@/lib/routing/categories';

const ROOT = path.resolve(__dirname, '..');

/** Đọc + chuẩn hoá EOL. Mọi assert source bên dưới đều đi qua đây. */
function read(rel: string): string {
  return fs.readFileSync(path.resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Cắt comment trước khi soi, vì lý do giống `design-system.test.ts`: comment
 * giải thích lịch sử và NHẮC TÊN THẬT của thứ đã bị gỡ ("trước đây in thẳng
 * `TabRuntimeMode` ra") — đó là tài liệu, không phải code gọi tên đó.
 * Thay bằng newline rỗng để số dòng trong thông điệp đỏ vẫn khớp thật.
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (c) => c.replace(/[^\n]/g, ' '));
}

/**
 * Chỉ những CHỮI STRING trong source (không phải identifier).
 *
 * `EvidenceLevel`, `CategoryId` là TÊN KIỂU: chúng xuất hiện trong `import`
 * và trong khai báo kiểu, đó là mã, không phải chữ người dùng đọc. Chỉ khi tên
 * đó nằm trong một string literal thì nó mới thật sự in ra màn hình.
 */
function stringLiterals(code: string): string[] {
  const out: string[] = [];
  const re = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  return out;
}

/** Chữ người dùng đọc trong 1 file: đã cắt comment, chỉ lấy string literal. */
function copyLiterals(rel: string): string[] {
  return stringLiterals(stripComments(read(rel)));
}

/** Đoạn source giữa hai mốc, có assert mốc tồn tại (regex hỏng phải ĐỎ). */
function slice(rel: string, start: string, end: string): string {
  const src = read(rel);
  const i = src.indexOf(start);
  expect(i, `${rel}: không tìm thấy mốc mở "${start}" — regex/mốc hỏng`).toBeGreaterThan(-1);
  const j = src.indexOf(end, i);
  expect(j, `${rel}: không tìm thấy mốc đóng "${end}"`).toBeGreaterThan(-1);
  return src.slice(i, j);
}

/** Sáu file copy tiếng Việt nằm trong hợp đồng lần này. */
const OWNED = [
  'lib/evidence.ts',
  'lib/routing/categories.ts',
  'components/chat/status-line.tsx',
  'components/subagent-card.tsx',
  'components/chat-interface.tsx',
  'components/evidence-badge.tsx',
] as const;

/** Ký tự gạch dài em dash — copy tiếng Việt không dùng. */
const EM_DASH = '—';
const EMOJI_RE = /\p{Extended_Pictographic}/u;
/** Có dấu tiếng Việt thì không còn là tiếng Anh. */
const VIET_RE =
  /[ăâđêôơưáàảãạấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

const LEVELS: readonly EvidenceLevel[] = [
  'prepared',
  'running',
  'reported_done',
  'verified',
  'blocked',
  'failed',
];

/**
 * Bảng nhãn hạng mục đúng. Khoá bảng thay vì đoán "có dấu là tiếng Việt":
 * `Nhanh` là tiếng Việt mà KHÔNG có dấu, nên phép đo theo regex sẽ báo nhầm
 * và ép ta sửa một nhãn đang đúng.
 *
 * `ultrabrain` giữ tên gốc có chủ ý: đó là tên bậc, dịch thành "Suy luận tối
 * đa" sẽ đụng nghĩa với bậc `deep` ("Suy luận sâu") ngay cạnh bên.
 */
const EXPECTED_LABELS: Record<CategoryId, string> = {
  ultrabrain: 'Ultrabrain',
  architect: 'Kiến trúc',
  deep: 'Suy luận sâu',
  capable: 'Năng lực chuẩn',
  quick: 'Nhanh',
  writing: 'Viết tài liệu',
  'visual-engineering': 'Giao diện & Mỹ thuật',
  'simple-work': 'Tác vụ đơn giản',
};

/**
 * Bảng nhãn đúng. ĐỎ khi đổi BẤT KỲ chuỗi nào ở `describeEvidence` — kể cả
 * khi người đổi tưởng nó vẫn tiếng Việt.
 */
const EXPECTED: Record<EvidenceLevel, { badgeText: string; variant: string }> = {
  prepared: { badgeText: 'Kế hoạch · chưa chạy', variant: 'default' },
  running: { badgeText: 'Code · đang chạy', variant: 'running' },
  reported_done: { badgeText: 'Code · đã báo xong', variant: 'warning' },
  verified: { badgeText: 'Kiểm thử · đã xác minh', variant: 'success' },
  blocked: { badgeText: 'Bị chặn', variant: 'danger' },
  failed: { badgeText: 'Thất bại', variant: 'danger' },
};

/**
 * Mọi từ tiếng Anh của thang cũ đã bị gỡ. `Code` KHÔNG nằm trong danh sách:
 * đó là từ mượn quen thuộc trong tiếng Việt ("đọc code", "sửa code") và là
 * tên của bậc thứ hai trên thang Plan -> Code -> Test.
 */
const ENGLISH_LADDER_WORDS =
  /\b(?:Plan|Test|running|verified|blocked|failed|not|done|reported)\b/i;

describe('describeEvidence — 6 bậc thang bằng chứng, nhãn tiếng Việt', () => {
  /**
   * ĐỎ khi: đổi một chuỗi bất kỳ trong bảng `EXPECTED` khỏi nhãn tiếng Việt,
   * hoặc đổi `variant` (variant là thứ mang ngữ nghĩa cho màu + icon).
   */
  it('mỗi bậc trả đúng nhãn tiếng Việt và đúng variant', () => {
    for (const level of LEVELS) {
      const info = describeEvidence(level);
      expect(info.badgeText, `${level}: badgeText lệch`).toBe(EXPECTED[level].badgeText);
      expect(info.variant, `${level}: variant lệch`).toBe(EXPECTED[level].variant);
    }
  });

  /**
   * ĐỎ khi: thêm một bậc vào `EvidenceLevel` mà quên thêm nhánh trong
   * `switch` (hàm trả undefined, `.badgeText` ném lỗi), hoặc xoá bật kỳ bậc nào.
   */
  it('switch phủ đúng 6 bậc, không bậc nào rơi ra undefined', () => {
    expect(LEVELS).toHaveLength(6);
    for (const level of LEVELS) {
      const info = describeEvidence(level);
      expect(info, `${level}: switch không phủ bậc này`).toBeDefined();
      expect(info.stage.length, `${level}: stage rỗng`).toBeGreaterThan(0);
      expect(info.cert.length, `${level}: cert rỗng`).toBeGreaterThan(0);
    }
  });

  /**
   * ĐỎ khi: trả lại bất kỳ từ tiếng Anh nào của thang cũ
   * ('Plan · not run', 'Test · verified', 'Blocked', 'Failed'…).
   */
  it('không còn từ tiếng Anh nào của thang cũ trong stage/cert/badgeText', () => {
    for (const level of LEVELS) {
      const { stage, cert, badgeText } = describeEvidence(level);
      for (const text of [stage, cert, badgeText]) {
        expect(text, `${level}: "${text}" còn từ tiếng Anh`).not.toMatch(ENGLISH_LADDER_WORDS);
      }
    }
  });

  /**
   * NGỮ NGHĨA, không chỉ chữ: một lỗi phải ĐỌC RA là lỗi, và chỉ bậc đã
   * kiểm chứng mới được mang variant `success`. ĐỎ khi ai đó sửa bảng màu
   * theo cảm tính, hoặc gộp `blocked` với `verified`.
   */
  it('ngữ nghĩa từng bậc giữ nguyên: lỗi đọc ra là lỗi, chỉ verified mới xanh', () => {
    expect(describeEvidence('failed').badgeText).toContain('Thất bại');
    expect(describeEvidence('blocked').badgeText).toContain('Bị chặn');
    expect(describeEvidence('verified').badgeText).toContain('đã xác minh');
    /* Không bậc nào ngoài `verified` được mang màu thành công. */
    for (const level of LEVELS) {
      if (level === 'verified') continue;
      expect(describeEvidence(level).variant, `${level} không được mang variant success`).not.toBe('success');
    }
    /* `blocked` và `failed` là hai trạng thái khác nhau, không được dính chữ. */
    expect(describeEvidence('blocked').badgeText).not.toBe(describeEvidence('failed').badgeText);
  });

  /**
   * Hình dạng badge giữ nguyên: bốn bậc trên thang viết `bậc · mức độ`,
   * hai bậc lỗi viết một mảnh. ĐỎ khi ai đó thêm/bớt dấu `·`.
   */
  it('bốn bậc thang có "bậc · mức độ", hai bậc lỗi là nhãn một mảnh', () => {
    for (const level of ['prepared', 'running', 'reported_done', 'verified'] as const) {
      expect(describeEvidence(level).badgeText, `${level} mất dấu " · "`).toContain(' · ');
    }
    for (const level of ['blocked', 'failed'] as const) {
      expect(describeEvidence(level).badgeText, `${level} không được có " · "`).not.toContain('·');
    }
  });

  /**
   * ĐỎ khi: thêm dấu gạch dài vào bất kỳ nhãn nào — đúng thứ copy tiếng Việt
   * ở app này cấm (xem `tests/design-system.test.ts` cho quy ước chung).
   */
  it('không nhãn nào chứa dấu gạch dài', () => {
    for (const level of LEVELS) {
      const { stage, cert, badgeText } = describeEvidence(level);
      for (const text of [stage, cert, badgeText]) {
        expect(text, `${level}: "${text}" chứa dấu gạch dài`).not.toContain(EM_DASH);
      }
    }
  });

  /**
   * ĐỎ khi: trả về một nhãn không dấu tiếng Việt nào (ASCII thuần), tức là đã
   * lùi về tiếng Anh mà không ai thấy.
   */
  it('mọi bậc đều có dấu tiếng Việt trong nhãn hiển thị', () => {
    for (const level of LEVELS) {
      const { badgeText } = describeEvidence(level);
      expect(VIET_RE.test(badgeText), `${level}: "${badgeText}" không có dấu tiếng Việt`).toBe(true);
    }
  });
});

describe('EvidenceBadge — tooltip tiếng Việt', () => {
  const SRC = 'components/evidence-badge.tsx';

  /**
   * ĐỎ khi: đổi lại `title={`Evidence status: ...`}` ở dòng tooltip.
   */
  it('tooltip nói tiếng Việt, không còn tiền tố "Evidence status"', () => {
    const code = stripComments(read(SRC));
    expect(code, 'tooltip tiếng Việt phải còn đó').toContain('Mức bằng chứng:');
    expect(code, 'còn tiền tố tiếng Anh "Evidence status"').not.toContain('Evidence status');
  });

  /**
   * ĐỎ khi: xoá `info.badgeText` khỏi `title` — tooltip thành câu rỗng, hoặc
   * in thẳng `safeLevel` (tên union tiếng Anh) ra thay vì bản dịch.
   */
  it('tooltip lấy từ badgeText đã dịch, không in tên union ra', () => {
    const code = stripComments(read(SRC));
    expect(code).toMatch(/title=\{`Mức bằng chứng: \$\{info\.badgeText\}`\}/);
    expect(code).not.toMatch(/title=\{`[^`]*\$\{safeLevel\}/);
  });
});

describe('scan — không tên enum/union nào lọt ra chữ người đọc', () => {
  /**
   * Tên loại được phép nằm trong CHÚ THÍCH (giải thích lịch sử) và trong
   * `import`/khai báo kiểu (mã nguồn), nhưng không được nằm trong một string
   * literal — đó mới là thứ được render.
   */
  const INTERNAL_NAMES = [
    'TabRuntimeMode',
    'TabRuntimeState',
    'EvidenceLevel',
    'CategoryId',
    'SubagentMode',
    'TabLockCoordinator',
  ];

  /**
   * ĐỎ khi: ai đó viết `title={`TabRuntimeMode: ${tabMode}`}` hoặc tương tự
   * ở bất kỳ file nào trong sáu — tức là in tên kiểu nội bộ ra màn hình.
   */
  it('không string literal nào chứa tên kiểu nội bộ', () => {
    const offenders: string[] = [];
    for (const rel of OWNED) {
      for (const lit of copyLiterals(rel)) {
        for (const name of INTERNAL_NAMES) {
          if (lit.includes(name)) offenders.push(`${rel}: "${lit}" chứa ${name}`);
        }
      }
    }
    expect(offenders, `tên enum/union lọt ra copy:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  /**
   * ĐỎ khi: `chat-interface.tsx` lấy lại `tabMode` từ hook và nối nó vào
   * chuỗi hiển thị (đúng dòng đang hỏng trước đợt sửa này).
   */
  it('chat-interface không tham chiếu tabMode ở nữa, chỉ qua isAcquiring', () => {
    const code = stripComments(read('components/chat-interface.tsx'));
    expect(code, 'tabMode không được nối vào chữ người đọc').not.toMatch(/\btabMode\b/);
    expect(code, 'băng phải đọc trạng thái qua isAcquiring').toMatch(/\bisAcquiring\b/);
  });
});

describe('băng quan sát — ACQUIRING phải trung thực VÀ còn đường thoát', () => {
  const REL = 'components/chat-interface.tsx';
  /** Khối băng, lấy từ điều kiện render tới chỗ `<StatusLine`. */
  const BANNER = slice(REL, '{!isLeader && (', '<StatusLine');

  /**
   * ĐỎ khi: đổi cổng ngoài `{!isLeader && (` thành thứ loại thêm
   * ACQUIRING (ví dụ `&& tabMode !== 'ACQUIRING'`) — lúc đó lúc đang giành
   * quyền sẽ KHÔNG có băng nào và người dùng thấy app như thể mình đang ở
   * tab chính trong khi thực ra chưa có quyền.
   */
  it('ACQUIRING vẫn nằm trong băng (cổng ngoài chỉ hỏi !isLeader)', () => {
    expect(BANNER).toMatch(/^\{!isLeader\s*&&\s*\(/);
    expect(BANNER, 'cổng ngoài không được loại ACQUIRING').not.toMatch(/ACQUIRING/);
  });

  /**
   * ĐỎ khi: cổng của nút thu hẹp lại còn một hay hai trạng thái — đúng cái
   * ngõi cụt đang hỏng: ACQUIRING có `isLeaderFrozen === false` nên băng hiện
   * mà KHÔNG có nút, và nếu lock treo thì người dùng kẹt luôn. Nay bắt chặt
   * hơn trước: nút KHÔNG được nằm sau điều kiện trạng thái nào, kể cả
   * `isAcquiring || isLeaderFrozen`, vì Observer thuần (tab thứ hai mở lên,
   * effect lúc mount không chạy lại) cũng phải có đường ra.
   */
  it('nút chiếm quyền không bị ghim vào bất kỳ trạng thái nào', () => {
    expect(BANNER).not.toMatch(/\{\s*isLeaderFrozen\s*&&\s*\(/);
    expect(BANNER, 'nút không được chỉ hiện khi isAcquiring || isLeaderFrozen').not.toMatch(
      /\(\s*isAcquiring\s*\|\|\s*isLeaderFrozen\s*\)\s*&&\s*\(\s*<button/,
    );
  });

  /**
   * ĐỎ khi: xoá `onClick={forceStealLock}` khỏi nút — nút còn hiện nhưng bấm
   * không được, tức là trang trí chứ không phải hành động.
   */
  it('nút chiếm quyền vẫn nối vào forceStealLock', () => {
    expect(BANNER).toMatch(/onClick=\{forceStealLock\}/);
    expect(BANNER).toContain('Chiếm quyền điều khiển');
  });

  /**
   * ĐỎ khi: gộp ACQUIRING vào nhánh của OBSERVER, tức lúc đang giành quyền
   * người dùng lại đọc "đang ở chế độ Chỉ đọc" — nói dối khi chưa hỏi xong.
   */
  it('ACQUIRING có câu riêng, không mượn câu của OBSERVER', () => {
    expect(BANNER).toMatch(/isAcquiring\s*\?/);
    expect(BANNER).toMatch(/'Đang giành quyền điều khiển[^']*'/);
  });

  /**
   * ĐỎ khi: đưa dấu gạch dài trở lại vào câu của băng (bản cũ có
   * "Chỉ dọc (Observer — TabRuntimeMode: …)").
   */
  it('câu trong băng không có dấu gạch dài', () => {
    expect(BANNER).not.toContain(EM_DASH);
  });
});

describe('copy lẻ trong chat-interface', () => {
  const REL = 'components/chat-interface.tsx';

  /**
   * ĐỎ khi: đổi lại `hints loaded` ở chip gợi ý (dòng span text-accent).
   */
  it('chip gợi ý không còn "hints loaded"', () => {
    const code = stripComments(read(REL));
    expect(code, 'còn "hints loaded"').not.toContain('hints loaded');
    expect(code, 'chip gợi ý phải còn nhãn tiếng Việt').toContain('gợi ý đã nạp');
  });
});

describe('thẻ subagent — nhãn tiếng Việt', () => {
  const REL = 'components/subagent-card.tsx';
  const CODE = stripComments(read(REL));

  /**
   * ĐỎ khi: đổi lại ba nhãn `Task:` / `Result:` / `Error:` ở khối mở rộng.
   * Regex soi cả thẻ `<span>` nên đổi câu chữ ở nơi khác không làm đỏ.
   */
  it('không còn nhãn Task:/Result:/Error: tiếng Anh', () => {
    for (const label of ['Task', 'Result', 'Error']) {
      expect(CODE, `còn nhãn "${label}:"`).not.toMatch(new RegExp(`>\\s*${label}:`));
    }
  });

  /**
   * ĐỎ khi: xoá một trong ba nhãn tiếng Việt tương ứng.
   */
  it('có đủ ba nhãn Nhiệm vụ / Kết quả / Lỗi', () => {
    for (const label of ['Nhiệm vụ:', 'Kết quả:', 'Lỗi:']) {
      expect(CODE, `thiếu nhãn "${label}"`).toMatch(new RegExp(`>\\s*${label}\\s*<`));
    }
  });

  /**
   * ĐỎ khen: đơn vị `turns` / `tools` ở góc phải thẻ bị đổi lại tiếng Anh.
   * So bằng string literal để không trúng `toolCalls` (tên biến).
   */
  it('đơn vị lượt/công cụ đã dịch, không còn "turns"/"tools"', () => {
    const literals = copyLiterals(REL);
    expect(literals.some((l) => l.includes('lượt')), 'thiếu đơn vị "lượt"').toBe(true);
    expect(literals.some((l) => l.includes('công cụ')), 'thiếu đơn vị "công cụ"').toBe(true);
    for (const lit of literals) {
      expect(lit, `"${lit}" còn đơn vị tiếng Anh`).not.toMatch(/\b(?:turns|tools)\b/);
    }
  });

  /**
   * ĐỎ khi: đổi lại nhãn chế độ scout. "khảo sát" là từ repo đã dùng cho
   * scout (xem `lib/subagent.ts` và `tests/subagent.test.ts`).
   */
  it('nhãn chế độ scout là "khảo sát"', () => {
    expect(CODE).toContain('· khảo sát');
    expect(CODE, 'còn nhãn chế độ "· scout"').not.toContain('· scout');
  });
});

describe('status line — từ trạng thái tiếng Việt', () => {
  const REL = 'components/chat/status-line.tsx';
  const CODE = stripComments(read(REL));

  /**
   * ĐỎ khi: đổi lại `runLabel` về 'web' / 'running' / 'idle' — `aria-label`
   * `Trạng thái: …` đọc thành "Trạng thái: idle" cho người khiếm thị.
   */
  it('runLabel đã dịch sang tiếng Việt', () => {
    const literals = copyLiterals(REL);
    for (const word of ['tra cứu web', 'đang chạy', 'rảnh']) {
      expect(literals, `runLabel thiếu "${word}"`).toContain(word);
    }
    for (const word of ['idle', 'running', 'no workspace']) {
      expect(literals, `còn từ trạng thái tiếng Anh "${word}"`).not.toContain(word);
    }
  });

  /**
   * ĐỎ khi: xoá `runLabel` khỏi `aria-label` — màn hình đọc mất trạng thái
   * chạy, chỉ còn chữ "Trạng thái:".
   */
  it('aria-label vẫn đọc được nhãn trạng thái', () => {
    expect(CODE).toMatch(/aria-label=\{`Trạng thái: \$\{runLabel\}`\}/);
  });
});

describe('hạng mục định tuyến — key là hợp đồng, label là copy', () => {
  /**
   * Key hạng mục được `validateModelChains` và settings store tra theo đúng
   * tên này; đổi key là âm thầm xoá cấu hình đã lưu của người dùng.
   * ĐỎ khi: đổi tên / bớt một key.
   *
   * Chỉ khoá TẬP KEY, không khoá thứ tự: `ALL_CATEGORIES` (thứ tự chip ở
   * Settings) và thứ tự key của record vốn dĩ đã lệch nhau từ trước, và thứ
   * tự trong record không có ý nghĩa gì vì mọi nơi đều tra theo key.
   */
  it('key hạng mục giữ nguyên đủ 8 tên, không đổi tên key', () => {
    expect([...Object.keys(CATEGORY_DESCRIPTIONS)].sort()).toEqual([...ALL_CATEGORIES].sort());
  });

  /**
   * Khoá bảng nhãn. ĐỎ khi: đổi bất kỳ chuỗi nào ở `EXPECTED_LABELS`, kể cả
   * khi người đổi tưởng vẫn tiếng Việt (vd đưa gloss tiếng Anh vào ngoặc).
   */
  it('label đúng bảng tiếng Việt, không gloss tiếng Anh trong ngoặc', () => {
    for (const cat of ALL_CATEGORIES) {
      const label = CATEGORY_DESCRIPTIONS[cat].label;
      expect(label, `${cat}: label lệch bảng`).toBe(EXPECTED_LABELS[cat]);
      expect(label, `${cat}: label còn ngoặc (gloss tiếng Anh)`).not.toContain('(');
    }
  });

  /**
   * ĐỎ khen: chứng minh bảng khóa thật sự có tác dụng — dán lại nhãn cũ có
   * gloss ("Kiến trúc (Architect)") thì phải đỏ.
   */
  it('không nhãn nào chứa từ gloss tiếng Anh của bản cũ', () => {
    const OLD_ENGLISH_GLOSS = /\b(?:Architect|Deep|Capable|Quick|Writing|Simple|Visual)\b/;
    for (const cat of ALL_CATEGORIES) {
      const label = CATEGORY_DESCRIPTIONS[cat].label;
      expect(label, `${cat}: label "${label}" còn gloss tiếng Anh`).not.toMatch(OLD_ENGLISH_GLOSS);
    }
  });

  /**
   * ĐỎ khen: mô tả hạng mục hiện ra ở Settings -> Routing nên cũng là copy.
   * ĐỎ khi trả về mô tả rỗng hoặc không dấu tiếng Việt (tức tiếng Anh).
   */
  it('mô tả hạng mục là tiếng Việt', () => {
    for (const cat of ALL_CATEGORIES) {
      const desc = CATEGORY_DESCRIPTIONS[cat].description;
      expect(desc.length, `${cat}: mô tả rỗng`).toBeGreaterThan(0);
      expect(VIET_RE.test(desc), `${cat}: mô tả "${desc}" không có dấu tiếng Việt`).toBe(true);
      expect(desc, `${cat}: mô tả chứa dấu gạch dài`).not.toContain(EM_DASH);
    }
  });
});

describe('quét 6 file — không dấu gạch dài, không emoji trong chữ người đọc', () => {
  /**
   * ĐỖ khi: còn dấu gạch dài trong BẤT KỲ chỗ nào ngoài comment. Comment đã
   * bị cắt nên chỗ nào đỏ là chỗ thật sự hiện ra màn hình (text node, string
   * literal, aria-label, title).
   */
  it('không dấu gạch dài sau khi cắt comment', () => {
    const offenders: string[] = [];
    for (const rel of OWNED) {
      const code = stripComments(read(rel));
      if (code.includes(EM_DASH)) {
        offenders.push(`${rel}:${code.slice(0, code.indexOf(EM_DASH)).split('\n').length}`);
      }
    }
    expect(offenders, `copy còn dấu gạch dài:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  /**
   * ĐỖ khi: thêm emoji vào chữ ở bất kỳ file nào trong sáu — app đã gỡ
   * emoji khỏi nhãn nhóm công cụ (xem `tests/tools-panel.test.ts`) nên một
   * emoji lọt lại là lệch chuẩn.
   */
  it('không emoji sau khi cắt comment', () => {
    const offenders: string[] = [];
    for (const rel of OWNED) {
      const code = stripComments(read(rel));
      if (EMOJI_RE.test(code)) offenders.push(rel);
    }
    expect(offenders, `copy còn emoji:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  /**
   * ĐỖ khen: chứng minh hai assertion trên KHÔNG im lặng — nếu regex cắt
   * comment hỏng và ăn mất cả chữ, chúng sẽ luôn xanh. Chèn một em dash vào
   * một string literal rồi đòi scanner bắt được.
   */
  it('scanner thật sự nhìn thấy em dash trong string literal', () => {
    const probe = 'const x = "a' + EM_DASH + 'b"; // ' + EM_DASH + ' trong comment';
    expect(stripComments(probe).includes(EM_DASH)).toBe(true);
    expect(EMOJI_RE.test(stripComments(probe))).toBe(false);
  });
});