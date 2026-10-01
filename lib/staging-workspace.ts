/**
 * Workspace-scoped staging helpers — tách phần gắn staging với workspace ra
 * khỏi lib/staging.ts để staging.ts giữ nguyên pure-function, không import
 * fs-access (tránh vòng phụ thuộc staging → fs-access → staging).
 *
 * Quy ước:
 *  - stagingWorkspaceKey(): định danh workspace hiện tại (tên thư mục gốc
 *    hoặc đường dẫn desktop). Chuỗi rỗng = chưa kết nối.
 *  - stagingKvKey(workspaceKey): key Dexie scoped theo workspace.
 */

import { getWorkspaceInfo } from '@/lib/fs-access';
import { isVyenDesktop } from '@/lib/desktop-bridge';

/** Lấy định danh workspace đang kết nối (web FS Access hoặc desktop). */
export async function stagingWorkspaceKey(): Promise<string> {
  try {
    if (isVyenDesktop()) {
      const info = await getWorkspaceInfo();
      return (info as unknown as { path?: string })?.path || info?.name || '';
    }
    const info = getWorkspaceInfo();
    return info?.name || '';
  } catch {
    return '';
  }
}

/** Key kv scoped theo workspace — giữ backward compat với staging:current. */
export function stagingKvKey(workspaceKey: string): string {
  return workspaceKey ? `staging:${workspaceKey}` : 'staging:current';
}

/** Lọc staging chỉ giữ record thuộc workspaceKey hiện tại. */
export function filterStagingByWorkspace(
  store: Record<string, { workspaceKey?: string }>,
  workspaceKey: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, file] of Object.entries(store)) {
    if (file.workspaceKey === workspaceKey) out[key] = file;
  }
  return out;
}
