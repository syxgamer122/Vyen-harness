/**
 * tools: phải khớp với phần router đã chọn (app/api/chat/route.ts).
 *
 * Bug gốc: `selectActiveTools` đã xếp hạng BM25 và chọn ra tập tool liên quan,
 * nhưng kết quả đó CHỈ được dùng để lọc tool MCP. Toàn bộ CLIENT_TOOL_DEFS vẫn
 * được spread vào trường `tools:` — 37 schema ≈ 26.169 ký tự mỗi lượt, bằng
 * 8 lần system prompt. Model bị bảo trong prompt rằng chỉ có top-N tool, rồi
 * được đưa cả 37 schema.
 *
 * Hợp đồng của file này — mỗi test ghi rõ ĐỔI DÒNG NÀO thì nó ĐỎ:
 *   - bỏ `!routerDroppedClientToolNames.has(name)` khỏi predicate của `tools:`
 *   - nhét routerMetaTools vào trong predicate (tắt luôn tools_search/load)
 *   - bỏ `routerMetaTools` khỏi `extraToolDocs` (manual emulated rỗng trở lại)
 *   - nới lỏng điều kiện plan mode / bỏ filter recipe / bỏ điều kiện skill index
 *   - đụng `TOOL_CATEGORY_MAP` hoặc `ALL_TOOL_CATEGORIES` (xoá cài quyền của user)
 *
 * Hai bẫy repo đã dính: file trên đĩa là CRLF (đã normalize một lần ở đầu
 * file), và comment tiếng Việt trong route chứa cả tên hàm mình đang grep (nên
 * đếm CALL STATEMENT / dùng mỏc nhiều dòng, không `split()` trên một từ khóa).
 */
import fs from 'node:fs';
import path from 'node:path';
import { zodSchema } from 'ai';
import { describe, expect, it } from 'vitest';
import { ALL_TOOL_CATEGORIES, TOOL_CATEGORY_LABELS } from '@/lib/tool-catalog';
import { CLIENT_TOOL_DEFS } from '@/lib/agent-tools';
import {
  buildToolIndex,
  selectActiveTools,
  ROUTER_DEFAULT_TOP_K,
  ROUTER_META_TOOL_DEFS,
} from '@/lib/mcp/tool-router';
import { formatToolProtocolManual } from '@/lib/agent-tools';
import { buildProtocolHeader } from '@/lib/emulated-agent';

const ROUTE_PATH = path.resolve(__dirname, '../app/api/chat/route.ts');
/** CRLF → LF một lần duy nhất: regex viết `\n` cứng sẽ đỏ trên CI. */
const routeSource = fs.readFileSync(ROUTE_PATH, 'utf8').replace(/\r\n/g, '\n');

/** Khối `tools:` của đường native — bản có nativeDelegateTool + routerMetaTools. */
function nativeToolsBlock(src: string): string {
  const anchor = src.indexOf('...nativeDelegateTool,');
  expect(anchor, 'không còn nativeDelegateTool trong khối tools:').toBeGreaterThan(-1);
  const start = src.lastIndexOf('tools: {', anchor);
  expect(start, 'không tìm thấy "tools: {" ngay trước nativeDelegateTool').toBeGreaterThan(-1);
  const endTag = '...mcpTools.defs,';
  return src.slice(start, src.indexOf(endTag, anchor) + endTag.length);
}

/** Toàn bộ predicate lọc CLIENT_TOOL_DEFS trong khối `tools:`. */
function clientToolPredicate(src: string): string {
  const at = src.indexOf('Object.entries(CLIENT_TOOL_DEFS).filter(');
  expect(at, 'không còn Object.entries(CLIENT_TOOL_DEFS).filter(').toBeGreaterThan(-1);
  const end = src.indexOf('),', at);
  expect(end, 'predicate không đóng bằng "),"').toBeGreaterThan(-1);
  return src.slice(at, end + 2);
}

/** Payload `tools:` đúng thứ provider nhận (ai@4 dùng zodSchema → JSON Schema). */
function serializedToolChars(tools: Record<string, unknown>): number {
  const payload = Object.entries(tools).map(([name, def]) => ({
    type: 'function',
    function: {
      name,
      description: (def as { description?: string })?.description ?? '',
      parameters: (def as { parameters?: unknown })?.parameters
        ? zodSchema((def as { parameters: never }).parameters).jsonSchema
        : { type: 'object', properties: {} },
    },
  }));
  return JSON.stringify(payload).length;
}

const NATIVE_TOOLS_BLOCK = nativeToolsBlock(routeSource);
const CLIENT_PREDICATE = clientToolPredicate(routeSource);

/* ------------------------------------------------------------------ */
/* 1. Meta-tools KHÔNG được đi qua bộ lọc                              */
/* ------------------------------------------------------------------ */

/**
 * ĐẢO ĐIỀU KIỆN ĐỂ TEST ĐỎ: dọn `...routerMetaTools,` khỏi khối `tools:`
 * (model mất đường nạp tool), hoặc chuyển nó vào trong predicate của
 * Object.fromEntries (bị `routerDroppedClientToolNames`/`recipeDeny` quét mất).
 */
describe('meta-tools router sống sót qua bộ lọc `tools:`', () => {
  it('...routerMetaTools được spread ở đường native', () => {
    expect(NATIVE_TOOLS_BLOCK).toContain('...routerMetaTools,');
  });

  it('meta-tools không nằm trong predicate của CLIENT_TOOL_DEFS', () => {
    // predicate chỉ duyệt key của CLIENT_TOOL_DEFS; meta-tools vốn không có ở
    // đó. Chỉ cần chắc là không ai kéo chúng vào đây để "tiện tay" lọc.
    expect(CLIENT_PREDICATE).not.toContain('routerMetaTools');
    expect(CLIENT_PREDICATE).not.toContain('tools_search');
    expect(CLIENT_PREDICATE).not.toContain('tools_load');
  });

  it('thứ tự spread: native delegate → meta → code mode → MCP', () => {
    const order = ['...nativeDelegateTool,', '...routerMetaTools,', '...codeModeTool,', '...mcpTools.defs,'];
    const positions = order.map((tag) => NATIVE_TOOLS_BLOCK.indexOf(tag));
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('routerMetaTools ngoài khối tools: là object rỗng khi router không bật', () => {
    // Router tắt (≤ 30 tool ứng viên) → không khai báo meta-tools, đúng như cũ.
    expect(routeSource).toMatch(
      /let routerMetaTools: Record<string, ToolSet\[string\]> = \{\};/,
    );
  });
});

/* ------------------------------------------------------------------ */
/* 2. Meta-tools có schema thật trong manual đường emulated             */
/* ------------------------------------------------------------------ */

/**
 * Bug thật (đo được): `formatToolProtocolManual` bỏ qua lặng lẽ mọi tên không
 * có trong registry tĩnh (`getDocRegistry` = buildAgentTools + CLIENT_TOOL_DEFS).
 * tools_search/tools_load không nằm ở đâu trong hai chỗ đó, nên manual sinh ra
 * cho chúng dài ĐÚNG 0 ký tự: model được bảo có 2 tool này mà không có mô tả,
 * không có chữ ký args. Registry đó là `getDocRegistry` trong lib/agent-tools.ts,
 * KHÔNG phải TOOL_CATALOG — thêm entry vào catalog không sửa được chỗ này.
 *
 * ĐẢO ĐIỀU KIỆN ĐỂ TEST ĐỎ: đổi `extraToolDocs: { ...mcpTools.defs, ...routerMetaTools }`
 * về `extraToolDocs: mcpTools.defs` (test nguồn bên dưới đỏ) hoặc bỏ
 * routerMetaTools khỏi payload truyền vào (test hành vi đỏ).
 */
describe('meta-tools có mô tả + chữ ký args trên đường emulated', () => {
  it('runEmulatedLoop nhận routerMetaTools qua extraToolDocs', () => {
    expect(routeSource).toMatch(
      /extraToolDocs: \{ \.\.\.mcpTools\.defs, \.\.\.routerMetaTools \},/,
    );
  });

  it('manual render đủ tools_search và tools_load (trước đây 0 ký tự)', () => {
    const manual = formatToolProtocolManual(
      ['tools_search', 'tools_load'],
      ROUTER_META_TOOL_DEFS,
    );
    expect(manual).toContain('- tools_search:');
    expect(manual).toContain('- tools_load:');
    expect(manual).toContain('"query": string');
    expect(manual).toContain('"limit"?: number');
    expect(manual).toContain('"names": string[]');
  });

  it('protocol header của emulated nhắc được cả hai tên lẫn tham số', () => {
    const header = buildProtocolHeader(['tools_search', 'tools_load'], ROUTER_META_TOOL_DEFS);
    expect(header).toContain('- tools_search:');
    expect(header).toContain('- tools_load:');
    expect(header).toContain('"names": string[]');
  });
});

/* ------------------------------------------------------------------ */
/* 3. Bộ lọc `tools:` thật sự theo phần router chọn                    */
/* ------------------------------------------------------------------ */

/**
 * ĐẢO ĐIỀU KIỆN ĐỂ TEST ĐỎ: xoá dòng `!routerDroppedClientToolNames.has(name),`
 * khỏi predicate → request lại ship trọn 37 schema, chi phí về đúng mức cũ mà
 * test vẫn xanh.
 */
describe('`tools:` chỉ khai báo phần router đã chọn', () => {
  it('predicate của CLIENT_TOOL_DEFS dùng bộ lọc router', () => {
    expect(CLIENT_PREDICATE).toContain('!droppedByRouter(name)');
  });

  it('tập bị loại dựng từ selection của router, chỉ trong CLIENT_TOOL_DEFS', () => {
    expect(routeSource).toMatch(
      /if \(selection\.isRouted\) \{\s*\n\s*routerDroppedClientToolNames = new Set\(\s*\n\s*Object\.keys\(CLIENT_TOOL_DEFS\)\.filter\(\(name\) => !activeSet\.has\(name\)\),\s*\n\s*\);\s*\n\s*\}/,
    );
  });

  it('router tắt thì không lọc (set rỗng dùng chung NO_DROPPED_TOOLS)', () => {
    expect(routeSource).toMatch(
      /let routerDroppedClientToolNames: ReadonlySet<string> = NO_DROPPED_TOOLS;/,
    );
    expect(routeSource).toMatch(
      /const NO_DROPPED_TOOLS: ReadonlySet<string> = new Set<string>\(\);/,
    );
  });

  it('tool recipe ghi tên tường minh KHÔNG bị router loại (ý tác giả > heuristic)', () => {
    // Không có ngoại lệ này thì một recipe khoá sẵn `shell_run` lại mất đúng
    // shell_run ở câu hỏi không nhắc tới nó — đúng cái regression bản cũ không có.
    expect(routeSource).toMatch(
      /const droppedByRouter = \(name: string\): boolean =>\s*\n\s*!recipeAllow\?\.has\(name\) && routerDroppedClientToolNames\.has\(name\);/,
    );
  });

  it('khối [Tools] trong prompt lọc bằng CÙNG bộ — không liệt kê tên không có schema', () => {
    expect(routeSource).toMatch(
      /\.\.\.\[\.\.\.nativeClientToolNames\]\.filter\(\(n\) => !droppedByRouter\(n\)\),/,
    );
  });
});

/* ------------------------------------------------------------------ */
/* 4. Hành vi thật của selection (module thật, không regex)            */
/* ------------------------------------------------------------------ */

describe('selection thật của router — đo được, không phải suông', () => {
  const clientNames = Object.keys(CLIENT_TOOL_DEFS);

  function droppedFor(query: string): Set<string> {
    const index = buildToolIndex(CLIENT_TOOL_DEFS, []);
    const selection = selectActiveTools(index, query, {
      topK: ROUTER_DEFAULT_TOP_K,
      loadedNames: [],
    });
    expect(selection.isRouted).toBe(true);
    const active = new Set(selection.activeToolNames);
    return new Set(clientNames.filter((n) => !active.has(n)));
  }

  it('index nhỏ hơn ngưỡng thì KHÔNG lọc gì (nếu không thì over-cut im lặng)', () => {
    const index = buildToolIndex({ fs_read: { description: 'đọc file' } }, []);
    const selection = selectActiveTools(index, 'đọc file');
    expect(selection.isRouted).toBe(false);
    expect(selection.activeToolNames).toEqual(['fs_read']);
  });

  it('tập bị loại là tập con của CLIENT_TOOL_DEFS và không đụng meta-tools', () => {
    const dropped = droppedFor('hãy sửa lỗi đọc file cho tôi');
    expect(dropped.size).toBeGreaterThan(0);
    for (const name of dropped) expect(clientNames).toContain(name);
    expect(dropped.has('tools_search')).toBe(false);
    expect(dropped.has('tools_load')).toBe(false);
  });

  it('tool đã nạp qua tools_load được giữ lại dù không liên quan', () => {
    const index = buildToolIndex(CLIENT_TOOL_DEFS, []);
    const selection = selectActiveTools(index, 'deploy lên vps', {
      topK: ROUTER_DEFAULT_TOP_K,
      loadedNames: ['bg_run'],
    });
    expect(selection.activeToolNames).toContain('bg_run');
  });

  it('payload `tools:` nhỏ hơn hẳn khi ship trọn catalog (đây là lợi ích đo được)', () => {
    const dropped = droppedFor('hãy sửa lỗi đọc file cho tôi');
    const defs = CLIENT_TOOL_DEFS as unknown as Record<string, unknown>;
    const full = Object.fromEntries(
      clientNames.filter((n) => n !== 'delegate').map((n) => [n, defs[n]]),
    );
    const kept = Object.fromEntries(
      clientNames
        .filter((n) => n !== 'delegate' && !dropped.has(n))
        .map((n) => [n, defs[n]]),
    );
    const fullChars = serializedToolChars(full);
    const keptChars = serializedToolChars(kept);
    expect(keptChars).toBeLessThan(fullChars);
    // Ngưỡng lỏng: chỉ cần chứng minh việc lọc có tác dụng đáng kể, không
    // chốt một con số phụ thuộc câu chữ câu hỏi (biến thiên theo BM25).
    expect(keptChars * 1.25).toBeLessThan(fullChars);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Các bộ lọc cũ vẫn phải chạy                                    */
/* ------------------------------------------------------------------ */

/**
 * ĐẢO ĐIỀU KIỆN ĐỂ TEST ĐỎ: bỏ nhánh `agentMode !== 'plan'`, bỏ `recipeDeny`,
 * bỏ `recipeAllow`, bỏ `(name !== 'skill_load' || hasSkillIndex)`, hoặc bỏ
 * `!NATIVE_EXCLUDED_CLIENT_TOOLS.has(name)` khỏi predicate.
 */
describe('bộ lọc cũ không bị bỏ rơi khi thêm bộ lọc router', () => {
  it('predicate giữ đủ 5 điều kiện gốc + điều kiện router', () => {
    expect(CLIENT_PREDICATE).toContain('!NATIVE_EXCLUDED_CLIENT_TOOLS.has(name)');
    expect(CLIENT_PREDICATE).toContain(
      "(agentMode !== 'plan' || !PLAN_MODE_WRITE_TOOLS.has(name))",
    );
    expect(CLIENT_PREDICATE).toContain('!recipeDeny.has(name)');
    expect(CLIENT_PREDICATE).toContain('(!recipeAllow || recipeAllow.has(name))');
    expect(CLIENT_PREDICATE).toContain("(name !== 'skill_load' || hasSkillIndex)");
    expect(CLIENT_PREDICATE).toContain('!droppedByRouter(name)');
  });

  it('PLAN_MODE_WRITE_TOOLS vẫn đúng 3 tool: plan mode chặn lệnh ghi', () => {
    const m = routeSource.match(/const PLAN_MODE_WRITE_TOOLS = new Set\(\[([^\]]*)\]\);/);
    expect(m).not.toBeNull();
    expect((m![1].match(/'[^']+'/g) ?? []).sort()).toEqual([
      "'delegate'",
      "'fs_edit'",
      "'fs_write'",
    ]);
  });

  it('nativeClientToolNames vẫn suy từ clientToolNames trừ NATIVE_EXCLUDED', () => {
    // Sửa dòng này là mcpToolList/mcpTools và activeToolNames lệch nhau.
    expect(routeSource).toMatch(
      /const nativeClientToolNames = new Set\(\s*\n\s*\[\.\.\.clientToolNames\]\.filter\(\(n\) => !NATIVE_EXCLUDED_CLIENT_TOOLS\.has\(n\)\),\s*\n\s*\);/,
    );
    // delegate do route tự chạy nên vẫn phải còn mặt ở cả hai đường.
    expect(routeSource).toMatch(
      /const delegateAvailable =\s*\n\s*allowAgentTools && agentMode !== 'plan' && !recipeDeny\.has\('delegate'\);/,
    );
  });
});

/* ------------------------------------------------------------------ */
/* 6. Tool MCP: đã lọc riêng, không đụng vào                           */
/* ------------------------------------------------------------------ */

/**
 * ĐẢO ĐIỀU KIỆN ĐỂ TEST ĐỎ: xoá khối lọc `mcpToolList` (mọi tool MCP tràn vào
 * `tools:` trở lại), hoặc gỡ `...mcpTools.keys` khỏi clientToolNames (tên MCP
 * biến khỏi khối [Tools] trong khi schema vẫn còn).
 */
describe('tool MCP giữ nguyên đường vào của nó', () => {
  it('mcpToolList vẫn bị router lọc theo activeSet', () => {
    expect(routeSource).toMatch(
      /mcpToolList = mcpToolList\.filter\(\(t\) => activeSet\.has\(`mcp__\$\{t\.serverId\}__\$\{t\.name\}`\) \|\| activeSet\.has\(t\.name\)\);/,
    );
  });

  it('mcpToolList phải lọc TRƯỚC clientToolNames lấy mcpTools.keys', () => {
    const filterAt = routeSource.indexOf('mcpToolList = mcpToolList.filter((t) =>');
    const keysAt = routeSource.indexOf('...mcpTools.keys,');
    expect(filterAt).toBeGreaterThan(-1);
    expect(keysAt).toBeGreaterThan(-1);
    expect(filterAt).toBeLessThan(keysAt);
  });

  it('mcpTools.defs vẫn được spread vào tools:', () => {
    expect(NATIVE_TOOLS_BLOCK).toContain('...mcpTools.defs,');
  });
});

/* ------------------------------------------------------------------ */
/* 7. Đường emulated KHÔNG bị thu hẹp                                  */
/* ------------------------------------------------------------------ */

/**
 * Đường emulated không có kênh schema native: toàn bộ mô tả nằm trong prompt
 * sinh MỘT LẦN cho cả lượt, không có tools_search nạp được giữa chừng. Thu hẹp
 * `clientToolNames` ở đây là mất tool thật, không phải tiết kiệm token.
 *
 * ĐẢO ĐIỀU KIỆN ĐỂ TEST ĐỎ: đổi `clientTools: clientToolNames` sang
 * `clientTools: activeToolNames` (hoặc một bản đã lọc router).
 */
describe('đường emulated giữ nguyên bộ client tool', () => {
  it('runEmulatedLoop vẫn nhận clientToolNames (chưa lọc router)', () => {
    expect(routeSource).toMatch(/clientTools: clientToolNames,/);
    expect(routeSource).not.toMatch(/clientTools: activeToolNames,/);
  });

  it('clientToolNames vẫn gộp mọi CLIENT_TOOL_NAMES + MCP + meta + run_code', () => {
    const at = routeSource.indexOf('const clientToolNames = new Set<string>([');
    expect(at).toBeGreaterThan(-1);
    const block = routeSource.slice(at, routeSource.indexOf(']);', at));
    expect(block).toContain('CLIENT_TOOL_NAMES');
    expect(block).toContain('PLAN_MODE_WRITE_TOOLS');
    expect(block).toContain('...mcpTools.keys,');
    expect(block).toContain("...(isToolRouterActive ? ['tools_search', 'tools_load'] : [])");
    expect(block).toContain("...(codeModeEnabled ? ['run_code'] : [])");
  });
});

/* ------------------------------------------------------------------ */
/* 8. Khoá category — bảo vệ cài quyền đã lưu của người dùng          */
/* ------------------------------------------------------------------ */

/**
 * `toolPermissions` persist trong localStorage ('ai-chat-settings' v2) theo ĐÚNG
 * 8 khoá này. Đổi tên / thêm / bớt một khoá là user mất cài đặt quyền — hoặc
 * tool lọt ra ngoài chính sách.
 *
 * ĐẢO ĐIỀU KIỆN ĐỂ TEST ĐỎ: đổi một chữ trong ALL_TOOL_CATEGORIES
 * (lib/tool-catalog.ts:30), hoặc xoá một khoá khỏi TOOL_CATEGORY_LABELS.
 */
describe('8 khoá category giữ nguyên (cài quyền đã lưu phụ thuộc)', () => {
  it('ALL_TOOL_CATEGORIES đúng 8 khoá, đúng thứ tự', () => {
    expect([...ALL_TOOL_CATEGORIES]).toEqual([
      'fs_read', 'fs_write', 'shell', 'git', 'web', 'memory', 'plan', 'delegate',
    ]);
  });

  it('mỗi khoá vẫn có nhãn tiếng Việt (UI Cài đặt đọc TOOL_CATEGORY_LABELS)', () => {
    expect(Object.keys(TOOL_CATEGORY_LABELS).sort()).toEqual([...ALL_TOOL_CATEGORIES].sort());
    for (const cat of ALL_TOOL_CATEGORIES) {
      expect(TOOL_CATEGORY_LABELS[cat].label.length).toBeGreaterThan(0);
      expect(TOOL_CATEGORY_LABELS[cat].label).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('lib/store.ts vẫn re-export đúng mảng này (nguồn quyền dùng chung)', () => {
    const store = fs.readFileSync(path.resolve(__dirname, '../lib/store.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(store).toMatch(
      /import \{\s*\n\s*ALL_TOOL_CATEGORIES,\s*\n\s*TOOL_CATEGORY_LABELS,\s*\n\s*TOOL_CATEGORY_MAP,\s*\n\s*type ToolCategory,\s*\n\} from '@\/lib\/tool-catalog';/,
    );
    expect(store).toMatch(
      /^export \{ ALL_TOOL_CATEGORIES, TOOL_CATEGORY_LABELS, TOOL_CATEGORY_MAP \};$/m,
    );
  });
});