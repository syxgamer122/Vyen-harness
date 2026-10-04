/**
 * Khóa cổng chặn 'deny' cho client tool (R2-1 + R2-2).
 *
 * Phần 1: ma trận isToolDenied (lib/tool-catalog.ts). Hàm thuần quyết định
 * tool có thuộc nhóm đang bị chặn không; tool lạ (mcp__*, tên chưa có trong
 * map) phải false vì không thuộc nhóm quyền nào.
 *
 * Phần 2: source-scan react/use-chat-orchestration.ts theo precedent của
 * tests/staging-panel-keyboard.test.ts (repo chạy vitest environment 'node',
 * không có hạ tầng DOM). `rawHandleClientToolCall` — đường thực thi client
 * tool DUY NHẤT — PHẢI gọi isToolDenied trước khi thực thi; ai bỏ cổng là
 * test đỏ ngay.
 *
 * Trước đây phần này quét components/chat-interface.tsx (`executeClientToolGate`
 * + `new ToolRunner`) — nhưng cả hai đã bị gỡ vì KHÔNG có call site nào gọi:
 * cổng deny thật luôn nằm trong orchestration, nên test chỉ canh một bản sao
 * chết. Nay quét đúng file đang chạy và yêu cầu MỌI cổng deny nằm trước
 * desktop-only gate lẫn trước switch thực thi (chặt hơn bản cũ, vốn chỉ
 * kiểm tra cổng đầu tiên).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_TOOL_CATEGORIES,
  isToolDenied,
  TOOL_CATEGORY_MAP,
} from '@/lib/tool-catalog';
import type { PermissionOverride, ToolPermissions } from '@/lib/store';

/** Quyền đồng loạt MỘT giá trị cho cả 8 nhóm (builder cho ma trận). */
function perms(value: PermissionOverride): ToolPermissions {
  const out = {} as ToolPermissions;
  for (const cat of ALL_TOOL_CATEGORIES) out[cat] = value;
  return out;
}

describe('isToolDenied - ma trận tool → nhóm → quyền deny', () => {
  it('shell_run/bg_run/bg_status/bg_stop theo nhóm shell: chặn shell là chặn cả lệnh nền', () => {
    // Đột biến bị chặn: bỏ bg_* khỏi TOOL_CATEGORY_MAP (bug cũ của taxonomy)
    // → 3 dòng bg_* trả false là đỏ.
    const p = { ...perms('default'), shell: 'deny' };
    expect(isToolDenied('shell_run', p)).toBe(true);
    expect(isToolDenied('bg_run', p)).toBe(true);
    expect(isToolDenied('bg_status', p)).toBe(true);
    expect(isToolDenied('bg_stop', p)).toBe(true);
  });

  it('lesson_save/memory_save theo nhóm memory (bài học không có nhóm riêng)', () => {
    // Đột biến bị chặn: gán nhầm lesson_save sang nhóm khác → dòng đầu đỏ.
    const p = { ...perms('default'), memory: 'deny' };
    expect(isToolDenied('lesson_save', p)).toBe(true);
    expect(isToolDenied('memory_save', p)).toBe(true);
  });

  it('delegate theo nhóm delegate: chặn nhóm này là chặn cả giao subagent', () => {
    expect(isToolDenied('delegate', { ...perms('default'), delegate: 'deny' })).toBe(true);
  });

  it('nhóm khác bị chặn thì tool ngoài nhóm đó vẫn chạy bình thường', () => {
    // Đột biến bị chặn: isToolDenied chỉ tra "có permissions nào là deny
    // không" (bỏ đối chiếu category) → 2 dòng dưới trả true là đỏ.
    const p = { ...perms('default'), shell: 'deny' };
    expect(isToolDenied('fs_read', p)).toBe(false);
    expect(isToolDenied('lesson_save', p)).toBe(false);
  });

  it('tool lạ (mcp__*, tên chưa có trong map, chuỗi rỗng) không bao giờ bị chặn', () => {
    // MCP tool không qua funnel client nên phải false kể cả khi mọi nhóm
    // đều deny - chặn nhầm là vỡ luồng MCP.
    const allDeny = perms('deny');
    expect(isToolDenied('mcp__search', allDeny)).toBe(false);
    expect(isToolDenied('mcp__filesystem__read_file', allDeny)).toBe(false);
    expect(isToolDenied('khong_co_tool_nay', allDeny)).toBe(false);
    expect(isToolDenied('', allDeny)).toBe(false);
  });

  it("chỉ 'deny' chặn; 'ask'/'auto'/'default' đều không chặn", () => {
    // Đột biến bị chặn: điều kiện lỏng thành !== 'auto' hoặc nhầm nhánh
    // 'ask' → một trong các dòng dưới đỏ.
    for (const value of ['ask', 'auto', 'default'] as const) {
      expect(isToolDenied('shell_run', perms(value)), `giá trị "${value}" không được chặn`).toBe(false);
    }
    expect(isToolDenied('shell_run', perms('deny'))).toBe(true);
  });

  it('mọi tên trong TOOL_CATEGORY_MAP đều tra được nhóm (không tool nào lọt lưới)', () => {
    // Đột biến bị chặn: đổi một tên trong map thành khóa lạ → tên cũ lọt
    // ra ngoài map, tra với allDeny trả false là đỏ.
    const allDeny = perms('deny');
    for (const name of Object.keys(TOOL_CATEGORY_MAP)) {
      expect(isToolDenied(name, allDeny), `"${name}" phải tra được nhóm của mình`).toBe(true);
    }
  });

  it('permissions thiếu khoá nhóm (object rỗng) không chặn tool đã biết', () => {
    // Đột biến bị chặn: đọc permissions[category] mà tra undefined !== 'deny'
    // bị sai kiểu (đổi thành === undefined thì test này đỏ).
    expect(isToolDenied('shell_run', {})).toBe(false);
  });
});

describe('rawHandleClientToolCall - cổng deny của đường thực thi client tool (source-scan)', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../react/use-chat-orchestration.ts'), 'utf8');
  /** Mọi vị trí cổng deny dạng per-tool/category trong file. */
  const denyGates = [...code.matchAll(/isToolDenied\(\s*toolCall\.toolName,\s*toolPermissions\s*\)/g)].map(
    (m) => m.index ?? -1,
  );

  it('gọi isToolDenied(toolCall.toolName, toolPermissions)', () => {
    // Đột biến bị chặn: bỏ cổng hoặc đổi tên biến → regex dưới không khớp.
    expect(code).toMatch(/isToolDenied\(\s*toolCall\.toolName,\s*toolPermissions\s*\)/);
  });

  it('MỌI cổng deny nằm TRƯỚC nhánh desktop-only và switch thực thi tool', () => {
    // Đột biến bị chặn: dời cổng xuống sau switch (tool đã chạy xong mới
    // chặn), hoặc thêm một cổng nằm sai chỗ → chỉ số dưới là đỏ.
    const desktopGate = code.indexOf('desktopOnly.has(toolCall.toolName)');
    const execSwitch = code.indexOf('switch (toolCall.toolName)');
    expect(denyGates.length, 'không tìm thấy cổng deny nào trong đường thực thi client tool').toBeGreaterThan(0);
    expect(desktopGate, 'không tìm thấy nhánh desktop-only').toBeGreaterThan(denyGates[0]);
    expect(execSwitch, 'không tìm thấy switch thực thi tool').toBeGreaterThan(denyGates[0]);
    for (const gate of denyGates) {
      expect(gate, 'cổng deny phải đứng trước nhánh desktop-only').toBeLessThan(desktopGate);
      expect(gate, 'cổng deny phải đứng trước switch thực thi').toBeLessThan(execSwitch);
    }
  });

  it('lỗi trả về nêu tên nhóm hiển thị đọc từ TOOL_CATEGORY_LABELS', () => {
    // Đột biến bị chặn: thông báo lỗi chỉ ghi tên tool, không ghi tên nhóm
    // hiển thị → regex dưới không khớp.
    expect(code).toMatch(/TOOL_CATEGORY_LABELS\[category\]/);
  });

  it('không còn bản sao funnel thứ hai (đường thực thi client tool là duy nhất)', () => {
    // Đột biến bị chặn: dựng lại `executeClientToolGate` / `new ToolRunner`
    // trong components/chat-interface.tsx → hai đường thực thi có thể lệch
    // nhau, và chỉ một đường được test canh.
    const chatInterface = fs.readFileSync(path.resolve(__dirname, '../components/chat-interface.tsx'), 'utf8');
    expect(chatInterface).not.toMatch(/executeClientToolGate/);
    expect(chatInterface).not.toMatch(/new ToolRunner\(/);
  });
});
