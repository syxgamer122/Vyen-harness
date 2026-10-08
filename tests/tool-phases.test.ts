/*
 * Hợp đồng của NHÓM PHASE + PHẠM VI tool (DESIGN.md §14.3 lớp 1 và lớp 5,
 * §15.2 điểm 8).
 *
 * Đây là test chạy HÀM THẬT, không soi source: `lib/tool-phases.ts` là nguồn duy
 * nhất quyết định một lần gọi tool thuộc đoạn nào, nên sai ở đây là UI dán nhãn
 * "Khảo sát" lên một lệnh sửa tệp — nói dối bằng một nhãn trông rất chắc chắn.
 *
 * Mỗi test ghi rõ phá gì thì nó đỏ.
 */
import { describe, expect, it } from 'vitest';
import {
  TOOL_PHASE_LABEL,
  TOOL_SCOPE_LABEL,
  groupByPhase,
  phaseOfTool,
  toolScopeOf,
} from '@/lib/tool-phases';

describe('lib/tool-phases — phase của một lần gọi tool', () => {
  it('tool kiểm chứng: tên nói việc kiểm tra, hoặc lệnh chạy là lệnh test/lint', () => {
    /* Phá gì thì đỏ: xét `shell` trước `verify` trong `phaseOfTool` — mọi lần
       chạy test bị gọi là "Thực hiện", và vòng `sửa → test` biến mất khỏi UI. */
    expect(phaseOfTool('code_verify')).toBe('review');
    expect(phaseOfTool('shell_run', '{"command":"npm test -- auth"}')).toBe('review');
    expect(phaseOfTool('shell_run', '{"command":"npx vitest run tests/a.test.ts"}')).toBe('review');
    expect(phaseOfTool('shell_run', '{"command":"cargo test"}')).toBe('review');
    expect(phaseOfTool('shell_run', '{"command":"npm run typecheck"}')).toBe('review');
    expect(phaseOfTool('git_diff')).toBe('review');
  });

  it('chạy lệnh KHÔNG phải test thì là thực hiện, không phải kiểm chứng', () => {
    /* `npm run dev` / `npm run build` tạo ra thứ để kiểm, không phải kiểm. */
    expect(phaseOfTool('shell_run', '{"command":"npm run dev"}')).toBe('implement');
    expect(phaseOfTool('shell_run', '{"command":"npm run build"}')).toBe('implement');
    expect(phaseOfTool('fs_edit')).toBe('implement');
    expect(phaseOfTool('fs_write')).toBe('implement');
    expect(phaseOfTool('git_commit')).toBe('implement');
    expect(phaseOfTool('delegate')).toBe('implement');
    expect(phaseOfTool('update_plan')).toBe('implement');
  });

  it('đọc/tìm là khảo sát', () => {
    for (const name of [
      'fs_read',
      'fs_list',
      'fs_search',
      'web_search',
      'web_fetch',
      'git_log',
      'plan',
      'tools_search',
      'skill_load',
      'chat_recall',
    ]) {
      expect(phaseOfTool(name), `${name} là việc đọc, phải vào đoạn Khảo sát`).toBe('plan');
    }
  });

  it('tool lạ không bị gán bừa vào một phase trông chắc chắn', () => {
    /* Tool MCP: ta KHÔNG biết nó có sửa gì không, nên nhãn "Khác" là câu trả
       lời duy nhất đúng. Gán nó vào `implement` là bịa ra một thay đổi. */
    expect(phaseOfTool('mcp__github__create_issue')).toBe('other');
    expect(phaseOfTool('')).toBe('other');
    expect(phaseOfTool('unknown_tool_xyz')).toBe('other');
    expect(TOOL_PHASE_LABEL.other).toBe('Khác');
  });

  it('chữ trong tham số không biến một lần ĐỌC thành lần chạy test', () => {
    /* `fs_read` đọc một tệp tên `test-runner.ts` không phải là chạy test. */
    expect(phaseOfTool('fs_read', '{"file_path":"src/test-runner.ts"}')).toBe('plan');
  });
});

describe('lib/tool-phases — cắt đoạn theo vòng lặp', () => {
  const ev = (name: string, args?: string, isError?: boolean) => ({ name, args, isError });

  it('đổi phase thì mở đoạn mới: sửa → test → sửa cho RA BA đoạn', () => {
    /* §15.2 điểm 8: nhóm phải "chứa được kiểm tra → sửa → test lỗi → sửa tiếp".
       Phá gì thì đỏ: gộp mọi đoạn cùng phase thành một rổ cố định — vòng lặp
       biến mất, và UI nói agent làm một mạch từ đầu tới cuối. */
    const groups = groupByPhase([
      ev('fs_edit', '{"file_path":"lib/auth.ts"}'),
      ev('shell_run', '{"command":"npm test"}', true),
      ev('fs_edit', '{"file_path":"lib/auth.ts"}'),
      ev('shell_run', '{"command":"npm test"}'),
    ]);
    expect(groups.map((g) => g.phase)).toEqual(['implement', 'review', 'implement', 'review']);
    expect(groups.every((g) => g.count === 1)).toBe(true);
  });

  it('các lần gọi liền nhau cùng phase nằm chung MỘT đoạn, và đếm đúng', () => {
    const groups = groupByPhase([ev('fs_read'), ev('fs_search'), ev('fs_edit')]);
    expect(groups.map((g) => [g.phase, g.count])).toEqual([
      ['plan', 2],
      ['implement', 1],
    ]);
    expect(groups[0].events).toHaveLength(2);
  });

  it('đếm lỗi theo ĐOẠN, không theo cả lượt', () => {
    const groups = groupByPhase([
      ev('fs_edit'),
      ev('shell_run', '{"command":"npm test"}', true),
      ev('fs_edit'),
      ev('shell_run', '{"command":"npm test"}'),
    ]);
    expect(groups.map((g) => g.errorCount)).toEqual([0, 1, 0, 0]);
  });

  it('danh sách rỗng không sinh đoạn rỗng', () => {
    expect(groupByPhase([])).toEqual([]);
    expect(groupByPhase([ev('fs_read')])).toHaveLength(1);
  });

  it('nhãn đoạn là chữ người đọc, lấy từ bảng chốt', () => {
    const groups = groupByPhase([ev('fs_read'), ev('fs_edit'), ev('code_verify')]);
    expect(groups.map((g) => g.label)).toEqual([
      TOOL_PHASE_LABEL.plan,
      TOOL_PHASE_LABEL.implement,
      TOOL_PHASE_LABEL.review,
    ]);
  });
});

describe('lib/tool-phases — phạm vi (project / file / workspace)', () => {
  it('có đường dẫn tệp trong tham số thì là MỘT TỆP', () => {
    expect(toolScopeOf('fs_edit', '{"file_path":"lib/auth.ts"}')).toBe('file');
    expect(toolScopeOf('fs_read', '{"filePath":"a.ts"}')).toBe('file');
    expect(toolScopeOf('fs_write', '{"path":"src/b.ts"}')).toBe('file');
    /* Khoá đường dẫn rỗng không tính là một tệp. */
    expect(toolScopeOf('fs_read', '{"file_path":"   "}')).toBe('project');
  });

  it('tool chạm trạng thái PHIÊN thì là phiên làm việc, không phải mã nguồn', () => {
    expect(toolScopeOf('remember_memory')).toBe('workspace');
    expect(toolScopeOf('chat_recall')).toBe('workspace');
    expect(toolScopeOf('recipe_run')).toBe('workspace');
  });

  it('còn lại là dự án, kể cả khi tham số không phải JSON', () => {
    expect(toolScopeOf('shell_run', '{"command":"npm test"}')).toBe('project');
    expect(toolScopeOf('git_commit', 'message cũ gửi chuỗi thô')).toBe('project');
    expect(toolScopeOf('fs_search')).toBe('project');
    expect(TOOL_SCOPE_LABEL.file).toBe('một tệp');
  });
});
