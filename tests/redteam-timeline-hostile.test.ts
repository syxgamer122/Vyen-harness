/**
 * RED TEAM — buildTimeline / traceSegments / displayText.
 *
 * Mục tiêu: phá invariant "ghép lại mọi mảnh text thì phải ra đúng content
 * gốc" và "bubble (mảnh 0) + ToolTrace (mảnh 1..n) phủ kín, không trùng, không
 * hở". Không sửa file sản phẩm — chỉ đọc và khẳng định.
 *
 * Quy ước: mỗi `it` nêu rõ điều kiện đảo ngược làm nó ĐỎ. Test xanh = chứng
 * cứ; test đỏ = bug thật tìm được.
 */
import { describe, expect, it } from 'vitest';

import {
  buildTimeline,
  collectToolEvents,
  displayText,
  formatToolDetail,
  hiddenLineCount,
  traceSegments,
  type TimelineSegment,
  type ToolEvent,
} from '@/components/chat/tool-trace';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function ev(over: Partial<ToolEvent> & { id: string }): ToolEvent {
  return { name: 'read', done: true, args: '{}', summary: '', ...over };
}

/** Text của mọi mảnh, nối lại theo thứ tự. Đây là invariant trung tâm. */
function textOf(timeline: TimelineSegment[] | null): string {
  if (timeline === null) return '';
  return timeline
    .filter((s): s is Extract<TimelineSegment, { kind: 'text' }> => s.kind === 'text')
    .map((s) => s.text)
    .join('');
}

/** Có surrogate lẻ trong chuỗi không (emoji bị cắt đôi). */
function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (n >= 0xdc00 && n <= 0xdfff) {
        i += 1;
        continue;
      }
      return true;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

/** Mảnh bắt đầu bằng dấu thanh tổ hợp (dấu tiếng Việt bị cắt rời khỏi chữ). */
function startsWithCombiningMark(s: string): boolean {
  return s.length > 0 && /^\p{M}/u.test(s[0]);
}

/** Số lần mở/đóng ``` phải chẵn, nếu không mảnh đó markdown đứt đoạn. */
function fenceMarkers(s: string): number {
  return (s.match(/```/g) ?? []).length;
}

/** Đoạn offset lệch bao nhiêu so với vị trí thật của tool trong content. */
function chipIndexOf(timeline: TimelineSegment[], id: string): number {
  return timeline.findIndex((s) => s.kind === 'tool' && s.event.id === id);
}

/** Những offset `at` mà toàn bộ mảnh text phải bảo toàn được. */
const CASES: Array<{ name: string; content: string; ats: number[] }> = [
  { name: 'content rỗng', content: '', ats: [0] },
  { name: 'content 1 ký tự, at=0', content: 'x', ats: [0] },
  { name: 'content 1 ký tự, at=1', content: 'x', ats: [1] },
  { name: 'at = content.length', content: 'abcdef', ats: [6] },
  { name: 'at > content.length', content: 'abcdef', ats: [999] },
  { name: 'at âm', content: 'abcdef', ats: [-42] },
  { name: 'at = NaN', content: 'abcdef', ats: [Number.NaN] },
  { name: 'at = Infinity', content: 'abcdef', ats: [Number.POSITIVE_INFINITY] },
  { name: 'at = -Infinity', content: 'abcdef', ats: [Number.NEGATIVE_INFINITY] },
  { name: 'hai tool cùng at', content: 'abcdefghij', ats: [4, 4] },
  { name: 'ba tool cùng at', content: 'abcdefghij', ats: [5, 5, 5] },
  { name: 'at lộn xộn thứ tự', content: 'abcdefghij', ats: [8, 2, 5, 0] },
  { name: 'at giảm dần', content: 'abcdefghij', ats: [9, 7, 5, 3, 1] },
  { name: 'tool ở đúng cuối', content: 'kết luận.', ats: [9] },
  { name: 'tool ở đúng đầu', content: 'kết luận.', ats: [0] },
  { name: 'content toàn khoảng trắng', content: '   \n\t  ', ats: [0, 4] },
  { name: 'content CRLF', content: 'dòng 1\r\ndòng 2\r\n', ats: [0, 7, 8] },
  { name: 'content CR thuần', content: 'a\rb\rc', ats: [0, 2, 4] },
  { name: 'at phân số', content: 'abcdefghij', ats: [3.7, 6.2] },
  { name: 'at -0', content: 'abcdef', ats: [-0] },
  { name: 'content có markup dài', content: '<tool_call>\n{"a":1}\n</tool_call>\nkết luận', ats: [0, 30] },
];

/* ------------------------------------------------------------------ */

describe('buildTimeline — invariant tái dựng content', () => {
  for (const c of CASES) {
    it(`không mất và không nhân đôi bất kỳ ký tự nào — ${c.name}`, () => {
      const events = c.ats.map((at, i) => ev({ id: `t${i}`, at }));
      const tl = buildTimeline(c.content, events);
      expect(tl).not.toBeNull();
      expect(textOf(tl)).toBe(c.content);
    });
  }

  it('200 tool: vẫn tái dựng đúng content, không mất ký tự nào', () => {
    const content = Array.from({ length: 400 }, (_, i) => `câu ${i}. `).join('');
    const events = Array.from({ length: 200 }, (_, i) =>
      ev({ id: `t${i}`, at: Math.floor((content.length * i) / 200) }),
    );
    const tl = buildTimeline(content, events);
    expect(tl).not.toBeNull();
    expect(textOf(tl)).toBe(content);
    expect(tl!.filter((s) => s.kind === 'tool')).toHaveLength(200);
  });

  it('content 1.000.000 ký tự: tái dựng đúng, không O(n²)', () => {
    const content = 'x'.repeat(1_000_000);
    const events = [0, 1, 500_000, 999_999, 1_000_000].map((at, i) => ev({ id: `t${i}`, at }));
    const tl = buildTimeline(content, events);
    expect(textOf(tl)).toBe(content);
  });

  it('mọi tool đều tồn tại trong timeline (không tool nào biến mất)', () => {
    const events = [0, 3, 7].map((at, i) => ev({ id: `t${i}`, at }));
    const tl = buildTimeline('abcdefghij', events)!;
    expect(tl.filter((s) => s.kind === 'tool').map((s) => s.event.id)).toEqual(['t0', 't1', 't2']);
  });

  it('events rỗng → null (không timeline, rơi về danh sách phẳng)', () => {
    expect(buildTimeline('abc', [])).toBeNull();
  });

  it('không event nào có at → null, kể cả khi content rỗng', () => {
    expect(buildTimeline('', [ev({ id: 'a' }), ev({ id: 'b' })])).toBeNull();
  });

  it('tool không có at vẫn được giữ, xếp cuối, giữ thứ tự gốc', () => {
    const tl = buildTimeline('kết luận của model.', [ev({ id: 'p', at: 4 }), ev({ id: 'q' }), ev({ id: 'r' })])!;
    expect(tl.filter((s) => s.kind === 'tool').map((s) => s.event.id)).toEqual(['p', 'q', 'r']);
    expect(textOf(tl)).toBe('kết luận của model.');
  });

  it('`at` là chuỗi ("5") thì bị coi là không có at — không cắt sai chỗ', () => {
    const events = collectToolEvents(
      [{ tool: { id: 'x', name: 'read', phase: 'start', args: '{}', at: '5' } }],
      undefined,
    );
    expect(events[0].at).toBeUndefined();
    // Không có event nào có at → null, không đoán bừa.
    expect(buildTimeline('abcdefghij', events)).toBeNull();
  });

  it('NaN đứng xen giữa các at hợp lệ: text vẫn tái dựng đúng', () => {
    const tl = buildTimeline('abcdefghij', [
      ev({ id: 'a', at: 2 }),
      ev({ id: 'n', at: Number.NaN }),
      ev({ id: 'b', at: 8 }),
    ])!;
    expect(textOf(tl)).toBe('abcdefghij');
  });

  it('cắt tool đúng vị trí: phần chữ trước chip là tiền tố của content', () => {
    const content = 'Đọc file xong. Viết file mới. Kết luận.';
    const tl = buildTimeline(content, [ev({ id: 'a', at: 13 }), ev({ id: 'b', at: 27 })])!;
    const iA = chipIndexOf(tl, 'a');
    const iB = chipIndexOf(tl, 'b');
    const beforeA = textOf(tl.slice(0, iA));
    const beforeB = textOf(tl.slice(0, iB));
    expect(content.startsWith(beforeA)).toBe(true);
    expect(beforeB.startsWith(beforeA)).toBe(true);
    expect(content.endsWith(textOf(tl.slice(iB + 1)))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe('buildTimeline — ranh giới grapheme (tiếng Việt + emoji)', () => {
  it('KHÔNG được cắt đôi một surrogate pair (emoji)', () => {
    /* Chọn `at` rơi giữa một cặp surrogate. */
    const content = 'A😀B😀C';
    const at = content.indexOf('😀') + 1;
    const tl = buildTimeline(content, [ev({ id: 'x', at })])!;
    for (const seg of tl) {
      if (seg.kind !== 'text') continue;
      expect(hasLoneSurrogate(seg.text)).toBe(false);
    }
  });

  it('KHÔNG được tách dấu thanh tổ hợp khỏi chữ gốc (tiếng Việt NFD)', () => {
    /* macOS/iOS và nhiều editor lưu tiếng Việt ở dạng NFD: 'o' + U+0301.
       `at` đặt đúng giữa chữ và dấu. */
    const content = 'Hòa bạn nhé'.normalize('NFD');
    const oIdx = content.indexOf('o');
    const at = oIdx + 1; // ngay sau chữ 'o', TRƯỚC dấu
    expect(content[at]).toMatch(/\p{M}/u);
    const tl = buildTimeline(content, [ev({ id: 'x', at })])!;
    const rendered = tl
      .filter((s): s is Extract<TimelineSegment, { kind: 'text' }> => s.kind === 'text')
      .map((s) => displayText(s.text));
    for (const r of rendered) {
      expect(startsWithCombiningMark(r)).toBe(false);
    }
    /* Và ký tự gốc vẫn phải còn — đừng "sửa" bằng cách xoá. */
    expect(rendered.join('')).toBe(content.normalize('NFC'));
  });

  it('giữ nguyên ký tự gốc kể cả khi cắt giữa emoji (slicing là phải giữ)', () => {
    const content = '😀😀😀😀';
    const tl = buildTimeline(content, [ev({ id: 'x', at: 3 })])!;
    expect(textOf(tl)).toBe(content);
  });
});

/* ------------------------------------------------------------------ */

describe('buildTimeline — mảnh cắt làm vỡ markdown', () => {
  it('mảnh text KHÔNG được để lại code fence bất cân', () => {
    /* Model đang viết code block thì gọi tool — ranh giới nằm GIỮA fence. */
    const content = 'Chạy lệnh này:\n```bash\nnpm test -- --watch\n```\nXong.';
    const at = content.indexOf('npm test') + 2;
    const tl = buildTimeline(content, [ev({ id: 'x', at })])!;
    for (const seg of tl) {
      if (seg.kind !== 'text') continue;
      expect(fenceMarkers(displayText(seg.text)) % 2).toBe(0);
    }
  });

  it('mảnh cắt GIỮA khối markup tool-call không được rò JSON thô ra UI', () => {
    const content = 'Xin chào\n<tool_call>\n{"path":"a.ts"}\n</tool_call>\nKết thúc.';
    const at = content.indexOf('{"path"');
    const tl = buildTimeline(content, [ev({ id: 'x', at })])!;
    const shown = tl
      .filter((s): s is Extract<TimelineSegment, { kind: 'text' }> => s.kind === 'text')
      .map((s) => displayText(s.text))
      .join('');
    expect(shown).not.toContain('{"path"');
    expect(shown).not.toContain('<tool_call>');
    expect(shown).not.toContain('</tool_call>');
  });

  it('mảnh cắt GIỮA khối markup vendor DSML không được rò ra UI', () => {
    const content =
      'Xong\n<\uFF5C\uFF5CDSML\uFF5C\uFF5Cinvoke name="Read">\n{"p":1}\n<\/\uFF5C\uFF5CDSML\uFF5C\uFF5Cinvoke>\nhết.';
    const at = content.indexOf('{"p"');
    const tl = buildTimeline(content, [ev({ id: 'x', at })])!;
    const shown = tl
      .filter((s): s is Extract<TimelineSegment, { kind: 'text' }> => s.kind === 'text')
      .map((s) => displayText(s.text))
      .join('');
    expect(shown).not.toContain('{"p"');
    expect(shown).not.toContain('DSML');
  });
});

/* ------------------------------------------------------------------ */

describe('traceSegments — bubble và trace phải phủ kín, không trùng', () => {
  it('at=0: mảnh đầu là TOOL thì trace phải giữ cả chip đầu tiên', () => {
    const tl = buildTimeline('abc', [ev({ id: 'a', at: 0 })])!;
    expect(tl[0].kind).toBe('tool');
    const owned = traceSegments(tl);
    expect(owned.map((s) => s.kind)).toEqual(['tool', 'text']);
    expect(owned[0]).toEqual(tl[0]);
    /* Không mất chữ nào khi bubble bị bỏ (message-item không vẽ bubble rỗng). */
    expect(textOf(tl)).toBe('abc');
  });

  it('mảnh đầu là lời: trace bỏ đúng mảnh 0, giữ lại phần còn lại', () => {
    const tl = buildTimeline('abc def', [ev({ id: 'a', at: 3 })])!;
    expect(tl.map((s) => s.kind)).toEqual(['text', 'tool', 'text']);
    const owned = traceSegments(tl);
    expect(owned.map((s) => s.kind)).toEqual(['tool', 'text']);
    expect((owned[1] as Extract<TimelineSegment, { kind: 'text' }>).text).toBe(' def');
  });

  it('mảnh đầu là lời + chỉ một mảnh: trace rỗng, bubble lo hết (không mất chữ)', () => {
    const tl = buildTimeline('chỉ có lời', [ev({ id: 'a', at: 99 })])!;
    expect(textOf(tl)).toBe('chỉ có lời');
    expect(traceSegments(tl)).toHaveLength(1); // chỉ còn chip
  });

  it('timeline rỗng: trace không ném', () => {
    expect(traceSegments([])).toEqual([]);
  });

  it('bubble (mảnh 0) + trace (mảnh 1..n) dựng lại đúng timeline, không trùng không hở', () => {
    const content = 'Mở đầu. Giữa. Cuối.';
    const tl = buildTimeline(content, [ev({ id: 'a', at: 11 }), ev({ id: 'b', at: 17 })])!;
    const owned = traceSegments(tl);
    const bubbleSegment = tl[0];
    const recomposed = [bubbleSegment, ...owned];
    expect(recomposed).toEqual(tl);
    /* Không mảnh nào bị vẽ hai lần: id tool phải duy nhất. */
    const ids = recomposed.filter((s) => s.kind === 'tool').map((s) => s.event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('mảnh lời nằm giữa hai tool vẫn được trace vẽ (chỉ mảnh 0 mới bị bỏ)', () => {
    const content = 'A B C D';
    const tl = buildTimeline(content, [ev({ id: 'a', at: 2 }), ev({ id: 'b', at: 4 })])!;
    const owned = traceSegments(tl);
    expect(tl.map((s) => s.kind)).toEqual(['text', 'tool', 'text', 'tool', 'text']);
    expect(owned.map((s) => s.kind)).toEqual(['tool', 'text', 'tool', 'text']);
    expect((owned[1] as Extract<TimelineSegment, { kind: 'text' }>).text).toBe(content.slice(2, 4));
  });
});

/* ------------------------------------------------------------------ */

describe('displayText + hiddenLineCount — hợp đồng hiển thị', () => {
  it('hiddenLineCount(15 dòng) = 0 — không hở nút "Xem đủ" khi không có gì để mở', () => {
    expect(hiddenLineCount(Array.from({ length: 15 }, () => 'x').join('\n'))).toBe(0);
  });

  it('hiddenLineCount đếm đúng số dòng bị giấu', () => {
    expect(hiddenLineCount(Array.from({ length: 20 }, () => 'x').join('\n'))).toBe(5);
  });

  it('displayText không ném với chuỗi rỗng / toàn khoảng trắng', () => {
    expect(displayText('')).toBe('');
    expect(displayText('   \n  ')).toBe('');
  });

  it('formatToolDetail không bao giờ in raw JSON kể cả khi JSON có khoảng trắng bao', () => {
    /* JSON.parse chấp nhận khoảng trắng bao — nhưng hàm dò bằng text[0]. */
    expect(formatToolDetail('  {"path":"src/a.ts"}  ')).toBe('src/a.ts');
  });
});