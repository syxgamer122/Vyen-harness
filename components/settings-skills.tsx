'use client';

/**
 * Settings → Skills (P0-3): liệt kê SKILL.md tìm thấy (workspace + toàn cục),
 * bật/tắt từng cái (lọc khỏi chỉ mục gửi lên model), tạo skill mới bằng cách
 * scaffold .vyen/skills/<name>/SKILL.md ngay trong workspace.
 */

import { useCallback, useEffect, useState } from 'react';
import { FolderPlus, RefreshCw } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import {
  scanDiskSkills,
  scaffoldSkillFile,
  type DiskSkillEntry,
} from '@/lib/skills/disk';
import { buildDiskSkillAdapters } from '@/lib/skills/client-adapters';
import { desktopFsWrite } from '@/lib/desktop-fs';
import { requireWorkspace, fsWrite } from '@/lib/fs-access';
import { isVyenDesktop } from '@/lib/desktop-bridge';

export function DiskSkillsSection() {
  const disabledSkills = useAppStore((s) => s.settings.disabledSkills);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [entries, setEntries] = useState<DiskSkillEntry[]>([]);
  const [errors, setErrors] = useState<Array<{ source: string; error: string }>>([]);
  const [scanning, setScanning] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const rescan = useCallback(async () => {
    setScanning(true);
    try {
      const scan = await scanDiskSkills(buildDiskSkillAdapters());
      setEntries(scan.entries);
      setErrors(scan.errors);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    void rescan();
  }, [rescan]);

  const toggle = (name: string) => {
    const next = disabledSkills.includes(name)
      ? disabledSkills.filter((n) => n !== name)
      : [...disabledSkills, name];
    updateSettings({ disabledSkills: next });
  };

  const createSkill = useCallback(async () => {
    const name = newName.trim();
    if (!/^[a-zA-Z0-9][\w.-]*$/.test(name)) {
      setNotice('Tên skill chỉ gồm chữ-số-._- , không bắt đầu bằng dấu.');
      return;
    }
    if (!newDesc.trim()) {
      setNotice('Cần mô tả ngắn để agent biết khi nào dùng skill này.');
      return;
    }
    const content = scaffoldSkillFile(name, newDesc.trim());
    try {
      if (isVyenDesktop()) {
        await desktopFsWrite(`.vyen/skills/${name}/SKILL.md`, content);
      } else {
        const ws = await requireWorkspace();
        if (!ws.ok) throw new Error(ws.error);
        await fsWrite(ws.deps, `.vyen/skills/${name}/SKILL.md`, content);
      }
      setNewName('');
      setNewDesc('');
      setNotice(`Đã tạo .vyen/skills/${name}/SKILL.md — mở file để viết nội dung.`);
      await rescan();
    } catch (err) {
      setNotice(`Tạo skill thất bại: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [newName, newDesc, rescan]);

  return (
    <div className="space-y-3 font-sans">
      <div className="flex items-center justify-between gap-2">
        <h3 className="field-label text-read">Kỹ năng (SKILL.md)</h3>
        <button
          type="button"
          onClick={() => void rescan()}
          className="btn-secondary px-2 py-1"
        >
          <RefreshCw size={11} className={scanning ? 'animate-spin' : undefined} aria-hidden="true" />
          Quét lại
        </button>
      </div>
      <p className="text-ui leading-relaxed text-tertiary">
        Kỹ năng dạng file <code className="claude-inline-code">SKILL.md</code> trong{' '}
        <code className="claude-inline-code">.vyen/skills/</code> của workspace và{' '}
        <code className="claude-inline-code">~/.vyen/skills/</code> (desktop). Agent chỉ thấy{' '}
        <em>tên + mô tả</em>; nội dung được nạp khi agent gọi <code className="claude-inline-code">skill_load</code>.
      </p>

      <ul className="space-y-1.5">
        {entries.map((e) => {
          const disabled = disabledSkills.includes(e.name);
          return (
            <li key={`${e.source}:${e.name}`} className="flex items-start gap-2">
              <input
                id={`skill-toggle-${e.source}-${e.name}`}
                type="checkbox"
                checked={!disabled}
                onChange={() => toggle(e.name)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full accent-accent"
              />
              <label htmlFor={`skill-toggle-${e.source}-${e.name}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="block text-ui font-medium text-primary">
                  {e.name}
                  <span className="ml-1.5 font-normal text-tertiary">{e.source === 'workspace' ? 'workspace' : 'toàn cục'}</span>
                  {e.version && <span className="ml-1.5 font-sans text-micro text-tertiary">v{e.version}</span>}
                </span>
                <span className="field-hint block truncate">{e.description}</span>
              </label>
            </li>
          );
        })}
        {!scanning && entries.length === 0 && (
          <li className="text-ui text-tertiary">
            Chưa tìm thấy skill nào. Kết nối workspace rồi bấm Quét lại, hoặc tạo skill mới bên dưới.
          </li>
        )}
        {scanning && <li className="text-ui text-tertiary">Đang quét…</li>}
      </ul>

      {errors.length > 0 && (
        <div role="status" className="notice-warn text-meta">
          {errors.slice(0, 3).map((e) => (
            <div key={e.source} className="truncate">
              {e.source}: {e.error}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-subtle pt-3">
        <div className="field-label flex items-center gap-1.5 text-ui">
          <FolderPlus size={13} aria-hidden="true" />
          Tạo skill mới
        </div>
        <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="tên-khong-dau"
            aria-label="Tên skill mới"
            className="field-sm"
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Mô tả ngắn: dùng khi nào"
            aria-label="Mô tả skill mới"
            className="field-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => void createSkill()}
          className="btn-secondary w-full py-1.5"
        >
          Scaffold .vyen/skills/…/SKILL.md
        </button>
        {notice && <p role="status" className="text-meta text-accent">{notice}</p>}
      </div>
    </div>
  );
}
