import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripEmulatedToolMarkup } from '@/lib/text-tool-guard';
import {
  buildTimeline,
  collectToolEvents,
  displayText,
  formatToolDetail,
  hiddenLineCount,
  toolKindOf,
  toolScaleOf,
  traceSegments,
  type ToolEvent,
  type TimelineSegment,
} from '@/components/chat/tool-trace';

describe('ToolTrace — collectToolEvents (gộp annotation + invocation)', () => {
  it('annotation start rồi done cùng id được gộp thành 1 sự kiện hoàn chỉnh', () => {
    const events = collectToolEvents(
      [
        { tool: { id: 't1', name: 'bash', phase: 'start', args: '{"command":"ls"}' } },
        { tool: { id: 't1', name: 'bash', phase: 'done', summary: 'file-a\nfile-b' } },
      ],
      undefined,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 't1',
      name: 'bash',
      done: true,
      args: '{"command":"ls"}',
      summary: 'file-a\nfile-b',
    });
  });

  it('toolInvocations state=result đánh dấu done cho đúng id, event chưa result vẫn running', () => {
    const events = collectToolEvents(
      [
        { tool: { id: 't1', name: 'read', phase: 'start' } },
        { tool: { id: 't2', name: 'bash', phase: 'start', args: '{"command":"ls"}' } },
      ],
      [{ toolCallId: 't2', state: 'result', result: 'ok' }],
    );
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.id === 't1')?.done).toBe(false);
    expect(events.find((e) => e.id === 't2')).toMatchObject({ done: true, summary: 'ok' });
  });

  it('phase done kèm error/isError gắn cờ isError cho chip đỏ', () => {
    const events = collectToolEvents(
      [{ tool: { id: 't1', name: 'bash', phase: 'done', error: 'exit 1' } }],
      undefined,
    );
    expect(events[0].isError).toBe(true);
  });

  it('sự kiện không có tên (chỉ invocation rỗng) bị lọc, mảng rỗng khi không có gì', () => {
    expect(collectToolEvents(undefined, undefined)).toEqual([]);
    expect(collectToolEvents([{ notTool: 1 }], [{ state: 'result' }])).toEqual([]);
  });

  it('toolInvocations không có annotations vẫn giữ lại name và args khi có toolName', () => {
    const events = collectToolEvents(
      undefined,
      [
        {
          toolCallId: 'inv-1',
          toolName: 'read_file',
          args: { path: 'src/index.ts' },
          state: 'call',
        } as any,
        {
          toolCallId: 'inv-2',
          toolName: 'shell',
          args: '{"command":"ls -la"}',
          state: 'result',
          result: 'total 0',
        } as any,
      ],
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: 'inv-1',
      name: 'read_file',
      args: '{"path":"src/index.ts"}',
      done: false,
    });
    expect(events[1]).toMatchObject({
      id: 'inv-2',
      name: 'shell',
      args: '{"command":"ls -la"}',
      done: true,
      summary: 'total 0',
    });
  });

  it('annotations đã có sẵn name/args thì không bị toolInvocations ghi đè', () => {
    const events = collectToolEvents(
      [
        { tool: { id: 't1', name: 'custom_tool', phase: 'start', args: 'initial' } },
      ],
      [
        {
          toolCallId: 't1',
          toolName: 'ignored_name',
          args: 'ignored_args',
          state: 'result',
          result: 'done',
        } as any,
      ],
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 't1',
      name: 'custom_tool',
      args: 'initial',
      done: true,
      summary: 'done',
    });
  });

  /*
   * Regression: dòng back-fill args gọi `JSON.stringify` trần. Args đến từ
   * model/MCP nên có thể là object vòng — stringify ném TypeError và chết cả
   * dòng tin nhắn, vì ErrorBoundary ở message-item.tsx chỉ bọc quanh
   * MarkdownRenderer chứ không bọc ToolTrace. `db.ts` đã có cùng cách xử lý
   * cho `result` từ trước; args thì quên.
   */
  it('args vòng (circular) không làm sập render — hiện chú thích thay vì ném lỗi', () => {
    const circular: Record<string, unknown> = { path: 'a.ts' };
    circular.self = circular;

    const events = collectToolEvents(undefined, [
      { toolCallId: 'inv-c', toolName: 'read_file', args: circular, state: 'call' } as any,
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('read_file');
    expect(events[0].args).toBe('[tham số không serialize được]');
  });

  /*
   * `at` là điều kiện để dựng timeline thật. Server đã gửi nó từ trước; client
   * nuốt mất thì mọi tin nhắn rơi về danh sách phẳng và không bao giờ biết
   * được thứ tự thời gian.
   */
  it('đọc `at` từ annotation phase start — offset là chỉ số ký tự, giữ nguyên cả 0', () => {
    const events = collectToolEvents(
      [
        { tool: { id: 't1', name: 'bash', phase: 'start', at: 0, args: '{}' } },
        { tool: { id: 't2', name: 'read', phase: 'start', at: 42 } },
        { tool: { id: 't3', name: 'read', phase: 'start', at: 'không phải số' } },
      ],
      undefined,
    );
    expect(events[0].at).toBe(0);
    expect(events[1].at).toBe(42);
    /* Không phải số thì không có offset — không được bịa ra số 0. */
    expect(events[2].at).toBeUndefined();
  });

  it('đọc `preview` từ annotation phase done làm body; preview rỗng không che summary', () => {
    const events = collectToolEvents(
      [
        { tool: { id: 't1', name: 'read', phase: 'done', summary: '12 phần tử', preview: 'a\nb\nc' } },
        { tool: { id: 't2', name: 'read', phase: 'done', summary: 'thật', preview: '  ' } },
      ],
      undefined,
    );
    expect(events[0].body).toBe('a\nb\nc');
    expect(events[1].body).toBeUndefined();
  });

  /*
   * Đường DUY NHẤT cho tool client-side (`fs_*`, `code_*`): chúng không phát
   * annotation `phase:'done'` trong cùng stream, nên không có `preview`.
   * Không có nhánh này thì kết quả của chúng vĩnh viễn là `''` — đúng cái
   * lỗi "tool result không bao giờ hiện" mà bản này sửa.
   *
   * Hình dạng `result` là JSON.stringify của ToolRunner, và `body` phải là
   * phần thân ĐỌC ĐƯỢC do `toolResultBody` rút — không phải JSON thô.
   */
  it('toolInvocations state=result điền body từ result kể cả khi không có annotation done', () => {
    const events = collectToolEvents(
      [{ tool: { id: 'fs1', name: 'fs_read', phase: 'start' } }],
      [
        {
          toolCallId: 'fs1',
          toolName: 'fs_read',
          state: 'result',
          result: JSON.stringify({ path: 'a.ts', content: 'export const a = 1;' }),
        } as any,
      ],
    );
    expect(events).toHaveLength(1);
    expect(events[0].body).toBe('export const a = 1;');
    expect(events[0].done).toBe(true);
  });

  it('result dạng object vẫn thành body; preview của annotation được ưu tiên', () => {
    const fromAnnotation = collectToolEvents(
      [
        { tool: { id: 't1', name: 'bash', phase: 'done', preview: 'từ server' } },
      ],
      [{ toolCallId: 't1', state: 'result', result: { stdout: 'từ client' } } as any],
    );
    expect(fromAnnotation[0].body).toBe('từ server');

    const fromClient = collectToolEvents(undefined, [
      { toolCallId: 't2', toolName: 'shell_run', state: 'result', result: { stdout: 'ok' } } as any,
    ]);
    expect(fromClient[0].body).toBe('ok');
  });

  /*
   * `body` mà không có `summary`: đây là hình dạng phổ biến nhất sau khi
   * server gửi `preview`. Chip phải mở ra được, nếu không lỗi "tool result
   * không bao giờ hiện" quay lại.
   */
  it('preview có body mà summary rỗng thì vẫn giữ body (không để summary xoá nó)', () => {
    const events = collectToolEvents(
      [{ tool: { id: 't1', name: 'read', phase: 'done', preview: 'nội dung thật' } }],
      undefined,
    );
    expect(events[0].summary).toBe('');
    expect(events[0].body).toBe('nội dung thật');
    expect(events[0].body ?? events[0].summary).toBe('nội dung thật');
  });
});

/*
 * R-27 — tool BẮT ĐẦU mà không BAO GIỜ XONG.
 *
 * Stream bị dừng giữa `phase:'start'` và `phase:'done'`, và không có phase
 * `'cancelled'` ở bất kỳ đâu nên không có gì để đối chiếu: `running = !done`
 * giữ chip ở "đang chạy" MÃI, kể cả sau khi mở lại hội thoại đã lưu. Đó là
 * trạng thái tải không có lối ra, và nó nói với người đọc rằng việc đang đi
 * trong khi nó đã chết.
 */
describe('collectToolEvents — tool bị bỏ dở giữa chừng', () => {
  const started = [{ tool: { id: 't1', name: 'bash', phase: 'start', args: '{"command":"ls"}' } }];

  it('lượt đã hết stream + invocation CÒN treo → gắn cỡ abandoned', () => {
    /* Bằng chứng duy nhất cho "bị bỏ dở": có invocation và nó chưa trả kết quả. */
    const events = collectToolEvents(started, [{ toolCallId: 't1', state: 'call' }], false);
    expect(events[0].abandoned).toBe(true);
  });

  it('KHÔNG có invocation thì KHÔNG đoán "bị bỏ dở"', () => {
    /*
     * Đo được trên lượt agent thật (openrouter-combo, workspace Neurobics):
     * 68 annotation `phase:'start'`, 11 `phase:'done'`, nhưng chỉ 12
     * `toolInvocations` được persist (STORED_TOOL_INVOCATIONS_MAX giữ 12 cái
     * gần nhất). ~56 tool đã chạy xong mà không còn dấu vết nào trong DB.
     * Nếu coi "không thấy kết quả" là "bị bỏ dở", cả lượt thành 56 chip cảnh
     * báo sai sau khi F5. Không có bằng chứng thì không khẳng định.
     */
    expect(collectToolEvents(started, undefined, false)[0].abandoned).toBeUndefined();
    expect(collectToolEvents(started, [], false)[0].abandoned).toBeUndefined();
  });

  it('invocation đã trả kết quả thì KHÔNG abandoned dù lượt đã hết stream', () => {
    const events = collectToolEvents(started, [{ toolCallId: 't1', state: 'result', result: 'ok' }], false);
    expect(events[0].abandoned).toBeUndefined();
    expect(events[0].done).toBe(true);
  });

  it('đang stream thì KHÔNG gắn cờ — "bị bỏ dở" khi tool còn chạy là nói dối', () => {
    expect(collectToolEvents(started, undefined, true)[0].abandoned).toBeUndefined();
    /* Không truyền tín hiệu = chưa biết, và chưa biết thì không bịa. */
    expect(collectToolEvents(started, undefined)[0].abandoned).toBeUndefined();
  });

  it('tool đã xong thì không abandoned, kể cả khi lượt đã hết stream', () => {
    const events = collectToolEvents(
      [
        { tool: { id: 't1', name: 'bash', phase: 'start' } },
        { tool: { id: 't1', name: 'bash', phase: 'done', summary: 'ok' } },
      ],
      undefined,
      false,
    );
    expect(events[0].abandoned).toBeUndefined();
  });
});

/*
 * RỦI RÒ BẢO MẬT — chip là chỗ duy nhất kết quả tool client hiện ra.
 *
 * Client tool trả `JSON.stringify(data)`, và trước đây `ev.body` nhận thẳng
 * chuỗi đó. Bấm chip `fs_read('.env')` là thấy
 * `{"path":".env","content":"OPENAI_API_KEY=sk-proj-…"}` trong `<pre>`, và
 * "Sao chép kết quả" chép nguyên văn nó. Không đường nào trong nhánh đó đi qua
 * `redactSecretText` — đường server (`preview`) thì có.
 */
describe('thân chip tool client — không rò bí mật', () => {
  it('fs_read đọc file cấu hình: khoá trong nội dung phải được che', () => {
    const events = collectToolEvents(undefined, [
      {
        toolCallId: 't1',
        toolName: 'fs_read',
        state: 'result',
        result: JSON.stringify({
          path: '.env',
          content: 'OPENAI_API_KEY=sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          truncated: false,
        }),
      } as any,
    ]);
    expect(events[0].body).not.toContain('sk-proj-');
    expect(events[0].body).toContain('OPENAI_API_KEY=');
  });

  it('token git trong stdout của shell_run cũng phải được che', () => {
    const events = collectToolEvents(undefined, [
      {
        toolCallId: 't2',
        toolName: 'shell_run',
        state: 'result',
        result: JSON.stringify({ code: 0, stdout: 'token ghp_0123456789abcdefghijABCDEFGHIJ012345\n' }),
      } as any,
    ]);
    expect(events[0].body ?? '').not.toContain('ghp_0123456789');
  });

  it('body không bao giờ bắt đầu bằng dấu { hoặc [ — không phải JSON thô', () => {
    const events = collectToolEvents(undefined, [
      { toolCallId: 't3', toolName: 'fs_list', state: 'result', result: JSON.stringify([{ name: 'a', type: 'file' }]) } as any,
      { toolCallId: 't4', toolName: 'fs_search', state: 'result', result: JSON.stringify([{ path: 'a.ts', line: 1, text: 'x' }]) } as any,
    ]);
    for (const e of events) {
      expect((e.body ?? '').trimStart().slice(0, 1)).not.toMatch(/[[{]/);
    }
  });
});

/** Rút gọn: tạo ToolEvent chỉ cần những trường mà test quan tâm. */
function ev(over: Partial<ToolEvent> & { id: string; at?: number }): ToolEvent {
  return { name: 'bash', done: true, args: '', summary: '', ...over };
}

describe('buildTimeline — xen kẽ lời của model với chip tool', () => {
  it('không event nào có `at` thì trả null — tin cũ giữ nguyên layout cũ', () => {
    expect(buildTimeline('một đoạn văn', [ev({ id: 'a' }), ev({ id: 'b' })])).toBeNull();
    expect(buildTimeline('một đoạn văn', [])).toBeNull();
  });

  it('cắt đúng offset và GIỮ phần văn sau tool cuối (kết luận của model)', () => {
    const content = 'Đọc file này.EDIT-END\n\nKết luận.';
    const segments = buildTimeline(content, [ev({ id: 'a', at: 13 })]);
    expect(segments).toEqual<TimelineSegment[]>([
      { kind: 'text', text: 'Đọc file này.' },
      { kind: 'tool', event: ev({ id: 'a', at: 13 }) },
      { kind: 'text', text: 'EDIT-END\n\nKết luận.' },
    ]);
    /* Ghép lại phải ra đúng content — không mất và không thêm ký tự nào. */
    expect(
      (segments ?? []).map((s) => (s.kind === 'text' ? s.text : '')).join(''),
    ).toBe(content);
  });

  it('hai tool liền nhau không để lại đoạn text rỗng', () => {
    const segments = buildTimeline('AB', [ev({ id: 'a', at: 0 }), ev({ id: 'b', at: 0 })]);
    expect(segments?.filter((s) => s.kind === 'text' && s.text === '')).toEqual([]);
    expect(segments?.map((s) => s.kind)).toEqual(['tool', 'tool', 'text']);
    expect(segments?.[2]).toEqual({ kind: 'text', text: 'AB' });
  });

  it('tool không có `at` không bị bỏ — xếp cuối, giữ thứ tự gốc', () => {
    const a = ev({ id: 'a' });
    const b = ev({ id: 'b' });
    const segments = buildTimeline('văn', [a, ev({ id: 'z', at: 0 }), b]);
    const tail = segments?.filter((s) => s.kind === 'tool').map((s) => (s as any).event.id);
    expect(tail).toEqual(['z', 'a', 'b']);
  });

  it('`at = 0` vẫn dựng được timeline — tool chạy trước khi model kịp nói gì', () => {
    const segments = buildTimeline('kết luận', [ev({ id: 'a', at: 0 })]);
    expect(segments?.[0]).toMatchObject({ kind: 'tool' });
    expect(segments?.some((s) => s.kind === 'text' && s.text === '')).toBe(false);
    expect(segments?.[segments.length - 1]).toEqual({ kind: 'text', text: 'kết luận' });
  });

  it('sắp theo `at` tăng dần kể cả khi annotation đến lộn xộn', () => {
    const segments = buildTimeline('0123456789', [
      ev({ id: 'c', at: 8 }),
      ev({ id: 'a', at: 2 }),
      ev({ id: 'b', at: 5 }),
    ]);
    expect(segments?.filter((s) => s.kind === 'tool').map((s) => (s as any).event.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('`at` âm / vượt đuôi / NaN / trùng nhau — không ném lỗi, không sinh rác', () => {
    const segments = buildTimeline('abc', [
      ev({ id: 'neg', at: -99 }),
      ev({ id: 'far', at: 9999 }),
      ev({ id: 'nan', at: Number.NaN }),
      ev({ id: 'dup', at: 2 }),
      ev({ id: 'dup2', at: 2 }),
    ]);
    expect(segments?.filter((s) => s.kind === 'tool')).toHaveLength(5);
    expect(
      segments?.filter((s) => s.kind === 'text').map((s) => (s as any).text),
    ).toEqual(['abc']);
  });

  it('content rỗng vẫn trả timeline (toàn chip), không ném lỗi', () => {
    const segments = buildTimeline('', [ev({ id: 'a', at: 0 })]);
    expect(segments).toEqual<TimelineSegment[]>([{ kind: 'tool', event: ev({ id: 'a', at: 0 }) }]);
  });
});

/*
 * Regression của lỗi người đọc thấy ngay: ToolTrace vẽ timeline từ chỉ số 0
 * trong khi bubble ở message-item.tsx đã vẽ mảnh lời đầu tiên — câu mở đầu
 * bị in HAI LẦN, cách nhau vài dòng.
 *
 * Không test được bằng render (repo không có jsdom), nhưng `traceSegments` là
 * hàm thuần nên khoá được đúng cái quy tắc: bubble giữ mảnh 0, ToolTrace giữ
 * phần còn lại, và HAI bên ghép lại phải ra đúng timeline — không mất, không
 * lặp. Đổi `traceSegments` thành `timeline.slice(1)` mù, hoặc thành `timeline`,
 * là ĐỎ ở đây.
 */
describe('traceSegments — ai vẽ phần nào của lượt trả lời', () => {
  it('bubble đã vẽ mảnh lời đầu thì ToolTrace KHÔNG vẽ lại mảnh đó', () => {
    const timeline = buildTimeline('Mở đầu.\n\nGiữa.\n\nKết luận.', [
      ev({ id: 'a', at: 9 }),
      ev({ id: 'b', at: 16 }),
    ])!;

    /* Mảnh 0 là lời → bubble đã vẽ, ToolTrace phải bỏ. */
    expect(timeline[0]).toMatchObject({ kind: 'text', text: 'Mở đầu.\n\n' });
    expect(traceSegments(timeline).map((s) => s.kind)).toEqual(['tool', 'text', 'tool', 'text']);

    /* Lỗi gốc: nếu ToolTrace vẽ cả timeline, "Mở đầu." xuất hiện 2 lần. */
    const rendered = [timeline[0], ...traceSegments(timeline)]
      .filter((s) => s.kind === 'text')
      .map((s) => (s as { text: string }).text)
      .join('');
    expect(rendered.match(/Mở đầu\./g)).toHaveLength(1);
    expect(rendered).toBe('Mở đầu.\n\nGiữa.\n\nKết luận.');
  });

  /*
   * Ngoại lệ làm `slice(1)` mù SAI: model gọi tool trước khi kịp nói gì thì
   * mảnh đầu là TOOL. Cắt cứng là nuốt mất chip đầu tiên, và người đọc không
   * còn bằng chứng tool nào đã chạy.
   */
  it('`at: 0` — mảnh đầu là TOOL thì ToolTrace vẽ từ 0, không bỏ chip đầu', () => {
    const timeline = buildTimeline('Kết luận.', [ev({ id: 'a', at: 0 })])!;
    expect(timeline[0]).toMatchObject({ kind: 'tool' });

    const owned = traceSegments(timeline);
    expect(owned).toEqual(timeline);
    expect(owned[0]).toMatchObject({ kind: 'tool' });
    expect(owned.map((s) => s.kind)).toEqual(['tool', 'text']);
  });

  it('`at: 0` mà content rỗng — chỉ có chip, không rơi vào nhánh rỗng', () => {
    const timeline = buildTimeline('', [ev({ id: 'a', at: 0 })])!;
    expect(traceSegments(timeline)).toHaveLength(1);
    expect(traceSegments(timeline)[0]).toMatchObject({ kind: 'tool' });
  });

  it('timeline rỗng trả về rỗng, không ném lỗi', () => {
    expect(traceSegments([])).toEqual([]);
  });

  it('tool KHÔNG có `at` vẫn còn nguyên — bằng chứng tool đã chạy không được mất', () => {
    const orphan = ev({ id: 'no-at' });
    const timeline = buildTimeline('Mở đầu.', [ev({ id: 'a', at: 5 }), orphan])!;
    expect(
      traceSegments(timeline).filter((s) => s.kind === 'tool'),
    ).toHaveLength(2);
  });
});

/*
 * BUG 2 — đoạn lời xen kẽ phải được dọn LÚC VẼ, không dọn trước lúc cắt.
 *
 * Fixture này dựng đúng tình huống đã đo: markup tool-call nằm giữa lượt, nên
 * mọi offset `at` phía sau nó đều lệch nếu cắt trên chuỗi đã strip. Chạy hàm
 * thật của lib + của tool-trace nên đỏ nếu một trong hai hàm đổi hành vi, không
 * chỉ khoá hình dạng source.
 */
describe('đoạn lời xen kẽ — cắt trên content THÔ, dọn lúc vẽ', () => {
  const BLOCK_A = '<tool_call>{"name":"read","path":"a.ts"}</tool_call>';
  const BLOCK_B = '<tool_call>{"name":"bash"}</tool_call>';
  const raw = ['Mở đầu.', BLOCK_A, '', 'Xem rồi:', BLOCK_B, '', 'Kết luận.'].join('\n');
  const atFirst = raw.indexOf('Xem rồi:');
  const atSecond = raw.indexOf('Kết luận.');

  it('fixture có markup thật và offset tính trên bản gốc', () => {
    expect(stripEmulatedToolMarkup(raw).stripped, 'fixture phải thực sự bị strip').toBe(2);
    /* Strip làm ngắn chuỗi 90 ký tự, nên offset phía sau lệch hẳn — đó mới là
       lý do "cắt thô, dọn lúc vẽ" là bắt buộc chứ không phải sở thích. */
    expect(raw.length - stripEmulatedToolMarkup(raw).text.length).toBe(90);
    expect(atSecond - atFirst).toBe(49);
  });

  it('đoạn vẽ ra không còn `<tool_call`, và thứ tự nói–tool–nói được giữ', () => {    const events = collectToolEvents(
      [
        { tool: { id: 't1', name: 'read', phase: 'start', at: atFirst } },
        { tool: { id: 't2', name: 'bash', phase: 'start', at: atSecond } },
      ],
      undefined,
    );
    const owned = traceSegments(buildTimeline(raw, events)!);

    /* Thứ tự phải là: tool, lời, tool, kết luận — không lặp mảnh đầu. */
    expect(owned.map((s) => s.kind)).toEqual(['tool', 'text', 'tool', 'text']);
    expect((owned[0] as any).event.id).toBe('t1');
    expect((owned[2] as any).event.id).toBe('t2');

    const shown = owned.map((s) => (s.kind === 'text' ? displayText(s.text) : '')).join('');
    expect(shown).not.toContain('<');
    expect(shown).not.toContain('tool_call');
    expect(shown).toContain('Xem rồi:');
    expect(shown).toContain('Kết luận.');
  });

  it('kết luận vẫn nằm SAU tool thứ hai — lệch 90 ký tự nếu cắt trên chuỗi đã strip', () => {
    const events = collectToolEvents(
      [
        { tool: { id: 't1', name: 'read', phase: 'start', at: atFirst } },
        { tool: { id: 't2', name: 'bash', phase: 'start', at: atSecond } },
      ],
      undefined,
    );

    /* Đúng: cắt trên content THÔ. */
    const owned = traceSegments(buildTimeline(raw, events)!);
    expect(owned[3]).toMatchObject({ kind: 'text' });
    expect(displayText((owned[3] as any).text)).toBe('Kết luận.');

    /*
     * Sai: cắt trên chuỗi đã strip thì cả hai offset vượt đuôi chuỗi (30 ký
     * tự), `buildTimeline` clamp về cuối và BỎ HẾT phần lời — mảnh đầu thành
     * toàn bộ lời của model, hai tool dồn xuống dưới. Vẫn ra chữ, nên bằng mắt
     * trông như hợp lệ; đây là lý do luật "cắt thô, dọn lúc vẽ" phải có test.
     */
    const stripped = stripEmulatedToolMarkup(raw).text;
    expect(stripped.length, 'fixture này chỉ đáng làm bằng chứng nếu lệch thật').toBe(30);
    const wrong = buildTimeline(stripped, events)!;
    expect(
      wrong[0],
      'lời của model phải bị dồn lên đầu, mất hết vị trí sau tool',
    ).toMatchObject({ kind: 'text', text: stripped });
    expect(wrong.map((s) => s.kind)).toEqual(['text', 'tool', 'tool']);
  });

  it('displayText dọn markup tool-call và đuôi rác, giữ nguyên markdown', () => {
    const dirty = `Kết luận:\n${BLOCK_A}\n\n\`\`\`ts\nconst a = 1;\n\`\`\``;
    const clean = displayText(dirty);
    expect(clean).not.toContain('tool_call');
    /* Markdown phải sống: đây là lý do đoạn xen kẽ đi qua MarkdownRenderer. */
    expect(clean).toContain('```ts');
    expect(clean).toContain('const a = 1;');
    /* Markup nằm trong code fence là ví dụ của người viết — không được đụng. */
    expect(displayText('```\n<tool_call>\n```')).toContain('tool_call');
  });

  it('mảnh toàn markup thành chuỗi rỗng sau khi dọn — không để lại khoảng trắng', () => {
    /*
     * Markup nằm GIỮA hai lần gọi tool: server báo `at` trỏ vào đầu khối markup,
     * nên lát cắt giữa hai tool là markup thuần. `buildTimeline` không bỏ được
     * (trên bản gốc nó còn chữ) — chỉ dọn lúc vẽ mới thành rỗng, nên ToolTrace
     * phải tự bỏ, đừng để lại một div rỗng 8px giữa hai chip.
     */
    const markupOnly = ['Mở đầu.', BLOCK_A, BLOCK_B, 'Kết luận.'].join('\n');
    const events = collectToolEvents(
      [
        { tool: { id: 't1', name: 'read', phase: 'start', at: markupOnly.indexOf(BLOCK_B) } },
        { tool: { id: 't2', name: 'bash', phase: 'start', at: markupOnly.indexOf('Kết luận.') } },
      ],
      undefined,
    );
    const owned = traceSegments(buildTimeline(markupOnly, events)!);

    expect(owned.map((s) => s.kind)).toEqual(['tool', 'text', 'tool', 'text']);
    expect((owned[1] as any).text).toBe(`${BLOCK_B}\n`);
    expect(displayText((owned[1] as any).text).trim()).toBe('');
    /* Còn kết luận thì vẫn phải còn. */
    expect(displayText((owned[3] as any).text)).toBe('Kết luận.');
  });
});

describe('formatToolDetail — không bao giờ in JSON thô', () => {
  it('field rỗng trả null chứ KHÔNG rơi về `{"path":""}` (lỗi gốc)', () => {
    expect(formatToolDetail('{"path":""}')).toBeNull();
    expect(formatToolDetail('{"path":"   "}')).toBeNull();
    expect(formatToolDetail('{"other":"x"}')).toBeNull();
    expect(formatToolDetail('')).toBeNull();
  });

  it('lấy field theo đúng thứ tự ưu tiên: path thắng query', () => {
    expect(formatToolDetail('{"path":"src","query":"x"}')).toBe('src');
    expect(formatToolDetail('{"query":"x","command":"ls"}')).toBe('ls');
    expect(formatToolDetail('{"filePath":"a/b.ts"}')).toBe('a/b.ts');
    expect(formatToolDetail('{"line":42}')).toBeNull();
  });

  it('args không phải JSON thì hiện nguyên văn, không bịa thêm dấu', () => {
    expect(formatToolDetail('ls -la')).toBe('ls -la');
    expect(formatToolDetail('{không phải json')).toBe('{không phải json');
  });

  it('JSON không phải object cũng không bị in thô', () => {
    expect(formatToolDetail('["a","b"]')).toBeNull();
    expect(formatToolDetail('["src/index.ts"]')).toBeNull();
  });

  it('path dạng số vẫn đọc được; giá trị không phải chuỗi/số thì bỏ qua', () => {
    expect(formatToolDetail('{"path":7,"query":"x"}')).toBe('7');
    expect(formatToolDetail('{"path":null,"name":"tên"}')).toBe('tên');
    expect(formatToolDetail('{"path":{"deep":1}}')).toBeNull();
  });

  it('cắt ở 120 ký tự và kết thúc bằng MỘT dấu …', () => {
    const detail = formatToolDetail(`{"path":"${'a'.repeat(400)}"}`);
    expect(detail).toHaveLength(120);
    expect(detail?.endsWith('…')).toBe(true);
    expect(detail?.match(/…/g)).toHaveLength(1);
  });

  it('dò JSON trên chuỗi ĐÃ trim: client tool gửi kèm khoảng trắng thì không rơi xuống nhánh in thô', () => {
    expect(formatToolDetail('  {"path":"src/a.ts"}')).toBe('src/a.ts');
    expect(formatToolDetail('\n{"path":"src/a.ts"}\n')).toBe('src/a.ts');
  });

  it('chip là MỘT dòng: newline trong args không được làm chip cao thêm dòng', () => {
    expect(formatToolDetail('echo a\necho b')?.split('\n')).toHaveLength(1);
    expect(formatToolDetail('{"command":"npm test\\necho xong"}')?.split('\n')).toHaveLength(1);
  });

  it('cắt trần không chém rụng emoji hay tách dấu tiếng Việt', () => {
    const emoji = formatToolDetail(`{"path":"${'a'.repeat(118)}😀😀😀😀"}`)!;
    expect(emoji.length).toBeLessThanOrEqual(120);
    expect([...emoji].every((ch) => ch !== '\ufffd')).toBe(true);
    const nfd = ('Hòa bạn nhé. ' + 'Việt Nam rất đẹp. ').repeat(6).normalize('NFD');
    expect(/^\p{M}/u.test(formatToolDetail(`{"path":"${nfd}"}`)!)).toBe(false);
  });
});

describe('hiddenLineCount — số dòng bị giấu phải là con số cụ thể', () => {
  it('văn ngắn hơn khung không bị giấu gì', () => {
    expect(hiddenLineCount('một dòng')).toBe(0);
    expect(hiddenLineCount('')).toBe(0);
    expect(hiddenLineCount(Array.from({ length: 15 }, () => 'x').join('\n'))).toBe(0);
  });

  it('văn dài hơn khung trả về đúng số dòng còn lại', () => {
    expect(hiddenLineCount(Array.from({ length: 40 }, () => 'x').join('\n'))).toBe(25);
  });
});

/* Repo chạy vitest environment 'node' (không jsdom/testing-library) nên phần
 * markup của ToolChip được khoanh theo pattern của tests/design-system.test.ts:
 * đọc nguồn component và assert các thuộc tính accessibility bắt buộc.
 *
 * File trên đĩa là CRLF (core.autocrlf): regex cứng `\n` sẽ xanh ở máy này
 * và đỏ trên CI — nên chuẩn hoá một lần ngay khi đọc. */
describe('ToolTrace — chip là button bấm được bằng bàn phím', () => {
  const source = fs
    .readFileSync(path.resolve(__dirname, '../components/chat/tool-trace.tsx'), 'utf8')
    .replace(/\r\n/g, '\n');

  it('header chip dùng <button type="button"> chứ không phải div onClick', () => {
    expect(source).toMatch(/<button\s+type="button"\s+onClick=\{\(\) => setExpanded\(!expanded\)\}/);
    expect(source).not.toMatch(/<div\s+onClick=\{\(\) => hasOutput/);
  });

  it('chip KHÔNG bị disabled khi không có kết quả — bàn phím phải tới được mọi tool', () => {
    /* Trước đây `disabled={!hasOutput}` làm Tab nhảy qua các chip không có
       summary, tức người đọc bằng bàn phím không biết tool nào đã chạy. */
    expect(source).not.toContain('disabled={!hasOutput}');
    expect(source).not.toMatch(/<button[^>]*\sdisabled=/);
  });

  it('aria-expanded chỉ nằm trên NHÁNH CÓ THỂ MỞ, chip không mở được thì không có nút', () => {
    /* R-26: chip luôn là `<button>` nhưng khung chỉ vẽ khi `hasBody` — bấm thì
       đổi trạng thái rồi không vẽ gì, trong khi hàng vẫn đổi nền khi rê chuột.
       `disabled` không phải câu trả lời (bàn phím bỏ qua phần tử disabled). */
    expect(source).toMatch(/aria-expanded=\{expanded\}/);
    expect(source).toMatch(/\{hasBody \? \(\s*<button/);
    expect(source).toMatch(/\) : \(\s*<div aria-label=\{ariaLabel\}/);
    expect(source, 'cấm disabled trên chip: bàn phím không tới được phần tử này').not.toMatch(
      /<button[^>]*\sdisabled=/,
    );
    /* Trạng thái viết ra ở nhánh không nút: `aria-label` trên `div` trần không
       được bảo đảm đọc, nên màu + icon là thông tin dành cho mắt. */
    expect(source).toMatch(/\{statusLabel !== 'xong' && \(\s*<span className="ml-auto shrink-0 pl-2">\{statusLabel\}<\/span>/);
  });

  it('tên phần tử tự đủ trạng thái — không truyền trạng thái chỉ bằng màu hay icon aria-hidden', () => {
    for (const label of ['lỗi', 'bị bỏ dở', 'đang chạy', 'xong']) {
      expect(source, `thiếu nhãn trạng thái "${label}" trong tên phần tử`).toContain(`'${label}'`);
    }
    expect(source).toMatch(
      /const statusLabel = failed[\s\S]*?abandoned[\s\S]*?'bị bỏ dở'[\s\S]*?running[\s\S]*?'đang chạy'[\s\S]*?'xong'/,
    );
    expect(source).toMatch(/const ariaLabel = \[label, displayParam, statusLabel\]/);
    expect(source).toMatch(/aria-label=\{ariaLabel\}/);
  });

  it('icon trạng thái không dùng text-disabled (2.45:1 — fail WCAG 1.4.11)', () => {
    expect(source).toContain('<Icon size={11} className="text-tertiary" />');
    expect(source).not.toMatch(/<Icon size=\{11\} className="text-disabled"/);
  });

  it('cột icon giữ nguyên bề rộng w-5 ở cả ba trạng thái', () => {
    expect(source).toMatch(/<span className="flex w-5 shrink-0 items-center justify-center">/);
  });

  it('default collapsed: useState(false) cho expanded', () => {
    const chip = source.match(/function ToolChip[\s\S]*?const \[expanded, setExpanded\] = useState\(([^)]*)\)/);
    expect(chip?.[1]).toBe('false');
  });

  it('khối kết quả hiện body thật và đếm dòng bị giấu bằng CON SỐ', () => {
    expect(source).toMatch(/const output = ev\.body \?\? ev\.summary;/);
    expect(source).toMatch(/\{hidden > 0 \? `còn \$\{hidden\} dòng nữa` : null\}/);
    /* "Xem đủ" chỉ xuất hiện khi thật sự bị cắt, không phải lúc nào cũng. */
    expect(source).toMatch(/\{hidden > 0 && \(\s*<button/);
  });

  it('khối mở đủ vẫn có trần chiều cao, không cao hơn viewport', () => {
    expect(source).toContain('max-h-[70vh]');
    expect(source).toContain('max-h-60');
  });

  it('không có biến thể dark: — app chỉ có một theme sáng', () => {
    expect(source).not.toMatch(/(?:^|[\s"'`:])dark:/m);
  });
});

/*
 * Phần markup của TIMELINE (đoạn lời xen kẽ + nhánh danh sách phẳng).
 *
 * Repo không có jsdom nên không render được React; `traceSegments` và
 * `displayText` đã được khoá bằng hàm thật ở trên. Ở đây khoá nốt wiring: hàm
 * thuần đúng mà gọi sai chỗ thì vẫn hỏng, nên phải có test trỏ vào dòng gọi.
 * Chuẩn hoá CRLF một lần (xem comment ở describe trên) — repo đã bị cắn 3 lần.
 */
describe('ToolTrace — timeline xen kẽ: render và fallback', () => {
  const source = fs
    .readFileSync(path.resolve(__dirname, '../components/chat/tool-trace.tsx'), 'utf8')
    .replace(/\r\n/g, '\n');
  /** Chỉ phần thân component ToolTrace, bỏ mấy helper phía trên. */
  const body = source.slice(source.indexOf('export const ToolTrace'));

  /*
   * Regression lỗi người đọc thấy ngay: `timeline.map(...)` vẽ cả mảnh lời đầu
   * mà bubble đã vẽ. Đổi lại thành `timeline.map` là ĐỎ ở đây.
   */
  it('render từ `traceSegments(timeline)`, không phải từ `timeline` thô', () => {
    expect(body).toMatch(/const owned = timeline \? traceSegments\(timeline\) : null;/);
    expect(body).toMatch(/\{owned\s*\n\s*\? owned\.map\(/);
    expect(
      body,
      'cấm render trực tiếp từ `timeline` — sẽ lặp lại đoạn lời đầu của bubble',
    ).not.toMatch(/\btimeline\.map\(/);
  });

  /*
   * BUG 2: `seg.text` là lát cắt THÔ. In thẳng nó ra là rác XML và markdown
   * thô lên màn hình; đưa nó vào `buildTimeline` thì offset lệch.
   */
it('đoạn lời đi qua displayText, không in thẳng `seg.text`', () => {
    expect(source).toMatch(/export function displayText\(raw: string\): string \{/);
    /* `dropCutHead` dọn phần đầu mảnh khi `at` cắt đôi khối markup; nếu bỏ
       nó, JSON thô in thẳng lên UI. `balanceFences` vá fence hở. */
    expect(source).toMatch(/stripEmulatedToolMarkup\(dropCutHead\(raw\)\)/);
    expect(source).toMatch(/return balanceFences\(stripped\)\.normalize\('NFC'\);/);
    expect(body).toMatch(/const shown = displayText\(seg\.text\);/);
    expect(body).toMatch(/<MarkdownRenderer content=\{shown\} \/>/);
    /* In thẳng `{seg.text}` cạnh MarkdownRenderer là mất tác dụng của displayText. */
    expect(body).not.toMatch(/^\s*\{seg\.text\}\s*$/m);
  });

  /*
   * Mảnh toàn markup rác thành chuỗi rỗng SAU khi dọn. Vẽ nó ra là một khoảng
   * trắng 8px nằm giữa hai chip — đúng lỗi "khoảng trắng vô nghĩa" mà
   * `buildTimeline` đã loại ở phía cắt. Bỏ dòng này là ĐỎ.
   */
  it('mảnh rỗng sau khi dọn thì không vẽ — không để lại khoảng trắng', () => {
    expect(body).toMatch(/if \(!shown\.trim\(\)\) return null;/);
  });

  /*
   * BUG 3: đoạn xen kẽ phải có markdown như bubble. `whitespace-pre-wrap` +
   * `{seg.text}` thô là regression so với phần còn lại của app.
   */
  it('đoạn xen kẽ dùng MarkdownRenderer (có `claude-prose`), không phải văn bản thô', () => {
    expect(source).toMatch(
      /import \{ MarkdownRenderer \} from '@\/components\/markdown-renderer';/,
    );
    expect(body).toMatch(/className="claude-prose py-1 text-primary"/);
    expect(
      body,
      'đoạn xen kẽ không được quay về pre-wrap thô',
    ).not.toMatch(/<div key=\{`text-\$\{i\}`\} className="whitespace-pre-wrap/);
  });

  /*
   * Một markdown hỏng không được xóa trắng cả dòng tin nhắn — cùng lý do
   * ErrorBoundary bọc bubble ở message-item.tsx. Bỏ `ErrorBoundary` là ĐỎ.
   */
  it('bọc ErrorBoundary với fallback hiện lại chính đoạn lời', () => {
    expect(source).toMatch(
      /import \{ ErrorBoundary \} from '@\/components\/error-boundary';/,
    );
    const segment = body.match(/<ErrorBoundary[\s\S]*?<\/ErrorBoundary>/);
    expect(segment, 'không tìm thấy ErrorBoundary quanh đoạn lời').not.toBeNull();
    expect(segment![0]).toMatch(/resetKey=\{seg\.text\}/);
    expect(segment![0], 'fallback phải hiện lại chữ, không phải ô lỗi trống').toMatch(
      /fallback=\{[\s\S]*\{shown\}/,
    );
  });

  /*
   * Tin nhắn cũ (không event nào có `at`) phải vẽ y hệt bố cục cũ: một danh
   * sách chip phẳng chia vạch, KHÔNG có markdown xen kẽ. Xoá nhánh này là tin
   * nhắn cũ mất bảng kê công việc.
   */
  it('tin nhắn cũ vẫn rơi về danh sách chip phẳng có vạch ngăn', () => {
    const fallback = body.match(
      /: events\.length > 0 && \(([\s\S]*?)\n {12}\)\}/,
    );
    expect(fallback, 'không tìm thấy nhánh fallback danh sách phẳng').not.toBeNull();
    expect(fallback![1]).toContain('divide-y divide-subtle');
    expect(fallback![1]).toContain('{events.map((ev) => (');
    /* Từ đợt P1-D mỗi mục là một vỏ mang KHOÁ (để vạch ngăn cắt giữa hai lần
       gọi, không cắt giữa tiêu đề đoạn phase và chip đầu của nó) — khoá chuyển
       từ chip lên vỏ, chip vẫn vẽ từ chính event đó. */
    expect(fallback![1]).toMatch(/<div key=\{ev\.id\}>/);
    expect(fallback![1]).toContain('<ToolChip ev={ev} />');
    expect(fallback![1], 'đoạn phase phải hiện trong cả danh sách phẳng').toContain(
      '<ToolPhaseBand group={bandByEventId.get(ev.id)!} />',
    );
    /* `role="list"` với con là `<button>` trần thì screen reader đọc "danh sách,
       0 mục"; nhãn `aria-label` tiếng Anh trong khi UI là tiếng Việt. */
    expect(fallback![1]).not.toContain('role="list"');
    expect(body).not.toContain('Tool executions');
  });

  /*
   * Timeline là mảnh rời không vỏ, nên mọi đoạn xen kẽ bắt đầu ở 0 còn chữ trả
   * lời nằm ở đệm đầu cột: một lượt có câu mở đầu lệch, câu sau thẳng cột — đọc
   * như lỗi căn chỉnh.
   *
   * Đệm KHÔNG phải một số cố định đúng vĩnh viễn: nó là PHÉP CỘNG của bố cục
   * câu trả lời (`avatar 26px + gap-2 8px`), nên đợt P1 gỡ hộp 16px của trợ lý
   * (DESIGN.md §15.1 điểm 2) là số này phải từ 50 xuống 34. Assertion đọc chính
   * message-item thay vì chép số, để đổi bên nào mà quên bên kia là ĐỎ.
   */
  it('timeline nằm trong cột thẳng với chữ trả lời', () => {
    const item = fs.readFileSync(
      path.resolve(__dirname, '../components/chat/message-item.tsx'),
      'utf8',
    );
    expect(item, 'khối trả lời phải là flex items-start gap-2').toMatch(
      /className="flex items-start gap-2"/,
    );
    expect(item, 'avatar/ô đệm phải rộng 26px để cột chữ không dịch').toMatch(
      /h-\[26px\] w-\[26px\]/,
    );
    /* 26 (avatar) + 8 (gap-2) = 34. Chữ trả lời KHÔNG còn đệm ngang riêng. */
    expect(body).toMatch(/<div className="pl-\[34px\]">/);
  });
});

/*
 * §15.2 điểm 6+7 — dòng gọn phải nói được "đã làm gì, bao nhiêu" và mỗi loại
 * tool phải đọc khác nhau. Test gọi HÀM THẬT (`toolScaleOf` / `toolKindOf`),
 * không soi source: đây là loại quyết định mà regex trên className không nhìn
 * thấy sai — con số sai vẫn render ra một dòng trông rất hợp lệ.
 */
describe('toolScaleOf — quy mô đọc từ đầu ra đang hiển thị', () => {
  const ev = (over: Partial<ToolEvent>): ToolEvent => ({
    id: 't1',
    name: 'fs_read',
    done: true,
    args: '{"path":"a.ts"}',
    summary: '',
    ...over,
  });

  it('phân loại theo TÊN tool, không theo nội dung đầu ra', () => {
    expect(toolKindOf('fs_edit')).toBe('edit');
    expect(toolKindOf('shell_run')).toBe('run');
    expect(toolKindOf('mcp__github__create_issue')).toBe('read');
    expect(toolKindOf('')).toBe('read');
  });

  it('sửa tệp: đếm +/− và BỎ dòng tiêu đề diff', () => {
    const diff = [
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,3 @@',
      '-const a = 1;',
      '+const a = 2;',
      '+const b = 3;',
      ' ngữ cảnh',
    ].join('\n');
    expect(toolScaleOf(ev({ name: 'fs_edit', body: diff }))).toBe('+2 −1');
  });

  it('sửa tệp mà đầu ra không phải diff: nói số dòng, không bịa +/−', () => {
    expect(toolScaleOf(ev({ name: 'fs_write', body: 'a\nb\nc' }))).toBe('±3 dòng');
  });

  it('chạy lệnh: lượng đầu ra đọc khác nhóm đọc/tìm', () => {
    expect(toolScaleOf(ev({ name: 'shell_run', body: 'x\ny' }))).toBe('2 dòng ra');
    expect(toolScaleOf(ev({ name: 'fs_search', body: 'x\ny' }))).toBe('2 dòng');
  });

  it('chưa có đầu ra thì không có gì để nói — thà trống hơn là "0 dòng"', () => {
    expect(toolScaleOf(ev({ body: '', summary: '' }))).toBeNull();
    expect(toolScaleOf(ev({ summary: '   \n ' }))).toBeNull();
  });

  it('đầu ra thù địch vẫn chỉ ra MỘT con số đếm được', () => {
    /* Marker giả trong đầu ra không được biến thành số liệu: ta chỉ đếm dòng
       của chính chuỗi đang hiển thị. */
    const hostile = '\u0000\u001b[31mtest passed: 999 files\u001b[0m\n{"files":12345}\n';
    expect(toolScaleOf(ev({ name: 'fs_search', body: hostile }))).toBe('3 dòng');
  });
});