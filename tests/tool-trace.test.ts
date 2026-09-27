import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { collectToolEvents } from '@/components/chat/tool-trace';

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
});

/* Repo chạy vitest environment 'node' (không jsdom/testing-library) nên phần
 * markup của ToolChip được khoanh theo pattern của tests/design-system.test.ts:
 * đọc nguồn component và assert các thuộc tính accessibility bắt buộc. */
describe('ToolTrace — header chip là button (R-32 keyboard)', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../components/chat/tool-trace.tsx'),
    'utf8',
  );

  it('header chip dùng <button type="button"> chứ không phải div onClick', () => {
    expect(source).toMatch(/<button\s+type="button"\s+onClick=\{\(\) => hasOutput && setExpanded\(!expanded\)\}/);
    expect(source).not.toMatch(/<div\s+onClick=\{\(\) => hasOutput/);
  });

  it('button disabled khi không có output, aria-expanded khi có output', () => {
    expect(source).toContain('disabled={!hasOutput}');
    expect(source).toMatch(/aria-expanded=\{hasOutput \? expanded : undefined\}/);
  });

  it('default collapsed: useState(false) cho expanded', () => {
    const chip = source.match(/function ToolChip[\s\S]*?const \[expanded, setExpanded\] = useState\(([^)]*)\)/);
    expect(chip?.[1]).toBe('false');
  });
});
