/**
 * Khoá: /boost KHÔNG được hứa có workspace riêng.
 *
 * Lỗi gốc: handler /boost trong react/use-chat-orchestration.ts chỉ chèn hai
 * chuỗi vào tin nhắn người dùng, không tạo worktree nào (grep toàn repo: không
 * có chỗ nào gọi `git worktree` từ đường chat, chỉ CLI npm run teamwork gọi
 * được lib/teamwork/worktree.ts). Người dùng gõ `/boost thêm một file test.txt`
 * được báo là đang chạy trong "Git Worktree cô lập", tin vào đó, còn agent thì
 * ghi thẳng vào thư mục gốc. Ba bề mặt cùng nói dối nên phải khoá cả ba.
 *
 * File này đọc SOURCE thay vì gọi hook (hook cần React runtime, vitest ở đây
 * chạy environment 'node' — vitest.config.mts:11), theo đúng convention
 * tests/run-wiring.test.ts và tests/chat-route-fixes.test.ts.
 *
 * Mỗi `it` ghi rõ điều kiện đảo ngược nào làm test ĐỎ. Không có `it` nào ở
 * đây mà câu hỏi "đổi dòng nào thì nó đỏ" không có câu trả lời.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_SLASH_COMMANDS,
  filterPrompts,
  parseSlashCommand,
  type FilterablePrompt,
} from '@/lib/slash-commands';

const ORCHESTRATION_PATH = path.resolve(__dirname, '../react/use-chat-orchestration.ts');
/**
 * Chuẩn hoá CRLF → LF trước khi cắt/regex. Repo bật `core.autocrlf` nên file trên
 * đĩa là CRLF, còn checkout sạch (CI) là LF: neo viết cứng `\n` sẽ xanh ở máy
 * này và đỏ ở máy kia. (tests/chat-route-fixes.test.ts quên bước này, không
 * copy.) Ở đây dùng indexOf cắt block nên CRLF cũng không vỡ, nhưng normalize
 * vẫn để mọi assert về xuống dòng sau này đúng một tiêu chuẩn.
 */
const source = fs.readFileSync(ORCHESTRATION_PATH, 'utf8').replace(/\r\n/g, '\n');

/** Vị trí của một mốc trong source — assert mốc ĐÓ tồn tại, không âm thầm -1. */
function at(needle: string, from = 0): number {
  const i = source.indexOf(needle, from);
  expect(i, `không tìm thấy mốc: ${needle}`).toBeGreaterThan(-1);
  return i;
}

/** Thân một khai báo: từ `decl` tới `nextDecl` kế tiếp SAU đó. */
function body(decl: string, nextDecl: string): string {
  const start = at(decl);
  return source.slice(start, at(nextDecl, start + decl.length));
}

/** Nhánh `if (slash.kind === 'boost')` trong onSubmit. */
const boostHandler = body("if (slash.kind === 'boost') {", "if (slash.kind === 'plan') {");

/** Nhánh `if (slash.kind === 'plan')` ngay sau nó, dùng để so hai lệnh. */
const planHandler = body("if (slash.kind === 'plan') {", "if (slash.kind === 'mode') {");

/** Thân `handlePlanCommand`: nơi /plan thực sự bật PLAN mode và đổi model. */
const planCommandFn = body(
  'const handlePlanCommand = useCallback(',
  'isRoutableModel, agentMode, updateSettings, submitTurn],',
);

/** Khối map lệnh built-in sang item của menu "/". */
const paletteMap = body(
  'const builtinCommands: SlashPrompt[] = BUILTIN_SLASH_COMMANDS.map((cmd) => ({',
  '}));',
);

describe('/boost không hứa workspace riêng', () => {
  it('nhánh boost không chứa chữ "worktree" hay "cô lập"', () => {
    /* ĐỎ nếu ai đó đưa lại "Git Worktree cô lập" vào notice hoặc tiền tố. */
    expect(boostHandler.toLowerCase()).not.toContain('worktree');
    expect(boostHandler.toLowerCase()).not.toContain('cô lập');
  });

  it('tiền tố "[Chế độ ..." không còn trong nhánh boost', () => {
    /* ĐỎ nếu tiền tố mô tả chế độ chạy được gắn lại: nó vừa nói dối vừa là câu
       đầu mà trình sinh tiêu đề phiên đọc (tên phiên ra "Chế độ Boost ... Hãy").
       Chỉ soi trong nhánh boost: nhánh khác cấu hình chế độ riêng thì không
       liên quan, không cấm. */
    expect(boostHandler).not.toContain('[Chế độ');
  });

  it('gửi thẳng slash.target cho submitTurn, không bọc chuỗi nào quanh nó', () => {
    /* ĐỎ nếu submitTurn nhận template literal thay vì target trần. */
    expect(boostHandler).toMatch(/submitTurn\(slash\.target\);/);
  });

  it('notice nói rõ chạy ở workspace hiện tại và có thể sửa file thật', () => {
    /* ĐỎ nếu notice đổi lại thành câu không định vị nơi chạy (người dùng phải
       đoán /boost sẽ đụng thư mục nào). */
    expect(boostHandler).toContain('workspace hiện tại');
    expect(boostHandler).toContain('sửa file thật');
  });

  it('/boost vẫn chặn thiếu mục tiêu trước khi gửi', () => {
    /* ĐỎ nếu bỏ guard `!slash.target`: /boost trần sẽ gửi tin nhắn rỗng. */
    expect(boostHandler).toMatch(/showNotice\('Gõ theo mẫu: \/boost [^']*', \d+\);/);
    expect(boostHandler).toMatch(/if \(!slash\.target\) \{[\s\S]*?return false;/);
  });

  it('/boost không đi qua đường của /plan (không bật PLAN mode, không gọi planner)', () => {
    /* ĐỎ nếu boost bị dán vào handlePlanCommand hoặc ép agentMode='plan':
       khi đó nó thành bản sao của /plan chứ không phải lệnh riêng. Đối chiếu:
       /plan CÓ bật PLAN mode và đổi sang planner model (handlePlanCommand). */
    expect(boostHandler).not.toContain('handlePlanCommand');
    expect(boostHandler).not.toContain('agentMode');
    expect(planHandler).toContain('handlePlanCommand(slash.target)');
    expect(planCommandFn).toContain("updateSettings({ agentMode: 'plan' })");
  });
});

describe('description của /boost trong palette', () => {
  const boost = BUILTIN_SLASH_COMMANDS.find((c) => c.name === 'boost');

  it('catalog có mục boost (để test sau không pass vacuous)', () => {
    expect(boost).toBeDefined();
  });

  it('description của boost không nhắc worktree / cô lập', () => {
    /* ĐỎ nếu đổi lại mô tả cũ "Chạy tác vụ trong Git Worktree cô lập...". */
    expect(boost?.description.toLowerCase()).not.toContain('worktree');
    expect(boost?.description.toLowerCase()).not.toContain('cô lập');
  });

  it('description của boost nói rõ chạy ở workspace hiện tại', () => {
    /* ĐỎ nếu description rút ngắn thành "Chạy tác vụ ngay" — mất đúng thông tin
       người dùng từng bị lừa (làm việc diễn ra ở thư mục nào). */
    expect(boost?.description).toContain('workspace hiện tại');
  });

  it('mọi lệnh built-in có description riêng, không lệnh nào dùng lại của lệnh khác', () => {
    /* Composer trước đây hardcode MỘT chuỗi chung cho mọi kind==='command', nên
       /cost, /memory, /tools, /boost đều tự nhận là "lập kế hoạch bằng planner
       model". ĐỎ nếu thêm lệnh mà quên description, hoặc copy chuỗi của lệnh
       khác sang. */
    const descriptions = BUILTIN_SLASH_COMMANDS.map((c) => c.description.trim());
    for (const d of descriptions) expect(d.length).toBeGreaterThan(0);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});

describe('palette map chuyển tiếp description', () => {
  it('map BUILTIN_SLASH_COMMANDS chép cmd.description', () => {
    /* ĐỎ nếu bỏ dòng này khỏi map: composer rơi về chuỗi hardcode và /boost lại
       hiện "lập kế hoạch bằng planner model" dù handler không hề lập kế hoạch. */
    expect(paletteMap).toMatch(/^\s*description: cmd\.description,$/m);
  });

  it('map vẫn giữ nguyên id/title/content/kind đã có', () => {
    /* ĐỎ nếu refactor map làm hỏng menu: chọn sai item hoặc mất tiền tố lệnh. */
    expect(paletteMap).toMatch(/id: `cmd:\$\{cmd\.name\}`,/);
    expect(paletteMap).toMatch(/title: cmd\.name,/);
    expect(paletteMap).toMatch(/content: `\/\$\{cmd\.name\} `,/);
    expect(paletteMap).toMatch(/kind: 'command',/);
  });
});

describe('filterPrompts với description', () => {
  const boosted: FilterablePrompt = {
    id: 'cmd:boost',
    title: 'boost',
    content: '/boost ',
    kind: 'command',
    description: 'Chạy tác vụ ngay trong workspace hiện tại, sửa file thật',
  };

  it('item khớp trả về nguyên vẹn description', () => {
    /* ĐỎ nếu filterPrompts dựng lại object mà rơi field (vd map sang shape
       mới), palette sẽ không còn dòng mô tả dù catalog có. */
    expect(filterPrompts([boosted], 'boost')).toEqual([boosted]);
    expect(filterPrompts([boosted], 'boost')[0]?.description).toBe(boosted.description);
  });

  it('item không có description (recipe, prompt tự lưu) vẫn lọc bình thường', () => {
    const recipe: FilterablePrompt = {
      id: 'recipe:1',
      title: 'git-summary',
      content: 'workflow recipe',
      kind: 'recipe',
    };
    expect(filterPrompts([recipe], 'git')).toEqual([recipe]);
    expect(filterPrompts([recipe], '')[0]).not.toHaveProperty('description');
  });

  it('không so khớp trên description: chỉ title và content mới xếp hạng', () => {
    /* ĐỎ nếu ai đó thêm description vào vòng so khớp. Đây là chủ ý: description
       là câu nhãn dài, khớp vào nó sẽ đẩy item lên đầu bảng xếp hạng chỉ vì câu
       mô tả chứa từ khoá, đổi cả thứ tự menu. */
    expect(filterPrompts([boosted], 'token')).toEqual([]);
    expect(filterPrompts([boosted], 'boost')).toHaveLength(1);
  });

  it('giữ nguyên limit mặc định 8 và thứ tự ưu tiên title > content', () => {
    /* ĐỎ nếu đổi limit mặc định: composer đang dựa vào 8 hàng hiển thị. */
    const many: FilterablePrompt[] = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      title: `dịch ${i}`,
      content: 'x',
    }));
    expect(filterPrompts(many, '')).toHaveLength(8);
    expect(filterPrompts([boosted, { id: 'z', title: 'khác', content: 'boost' }], 'boost').map((p) => p.id)).toEqual([
      'cmd:boost',
      'z',
    ]);
  });
});

describe('parse /boost giữ nguyên shape sau khi bỏ tiền tố', () => {
  it('/boost <target> trả {kind, target} như trước', () => {
    expect(parseSlashCommand('/boost thêm một file test.txt vào workspace')).toEqual({
      kind: 'boost',
      target: 'thêm một file test.txt vào workspace',
    });
  });

  it('/boost trần trả target rỗng để handler bắt nhắc mẫu', () => {
    expect(parseSlashCommand('/boost')).toEqual({ kind: 'boost', target: '' });
  });

  it('target giữ nguyên dấu nháy và khoảng trắng trong, không bị cắt bớt', () => {
    /* ĐỎ nếu ai đó sanitize/escape target ở tầng parse: nội dung gửi cho agent
       sẽ lệch với cái người dùng gõ. */
    expect(parseSlashCommand('/boost viết vào file "test.txt" rồi chạy npm test')).toEqual({
      kind: 'boost',
      target: 'viết vào file "test.txt" rồi chạy npm test',
    });
  });
});