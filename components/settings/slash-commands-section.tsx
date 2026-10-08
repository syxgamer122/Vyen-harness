'use client';

/**
 * Settings → Lệnh gõ nhanh (Slash commands)
 *
 * Ánh xạ /<tên> tuỳ biến sang recipe.
 *
 * (Tách ra từ components/settings-dialog.tsx — file đó từng dài 1.668 dòng.)
 */

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import { db, type RecipeRecord } from '@/lib/db';
import { useAppStore } from '@/lib/store';
import { BUILTIN_SLASH_COMMANDS, validateSlashCommandName } from '@/lib/slash-commands';

export function CustomSlashCommandsSection() {
  const customSlashCommands = useAppStore((s) => s.settings.customSlashCommands ?? {});
  const setCustomSlashCommand = useAppStore((s) => s.setCustomSlashCommand);
  const removeCustomSlashCommand = useAppStore((s) => s.removeCustomSlashCommand);

  const recipes = useLiveQuery(
    () => db.recipes.orderBy('updatedAt').reverse().toArray(),
    [],
    [] as RecipeRecord[],
  );

  const [cmdName, setCmdName] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [error, setError] = useState<string | null>(null);

  /*
   * Chặn TRÙNG TÊN LÚC ĐẶT, không đợi tới lúc chạy.
   *
   * Palette dựng hàng cho lệnh built-in và lệnh tùy biến theo cùng một hình
   * `/<tên>`, và `parseSlashCommand` luôn route về built-in. Một lệnh tùy biến
   * tên `/plan` vì vậy cho ra hai hàng trông y hệt mà hàng custom không bao giờ
   * được gọi tới. Báo ở đây là chỗ duy nhất người dùng còn định được tên
   * của mình; sau khi lưu thì sửa được thì cũng đã mất.
   *
   * Luật tên thì dùng chung với tên skill (`validateSlashCommandName`), không
   * chế riêng ở form — trước đây form có `^[a-zA-Z0-9_-]+$`, lệch với parser
   * nên tên đặt được lại không chạy được.
   */
  const handleAdd = () => {
    const check = validateSlashCommandName(cmdName, Object.keys(customSlashCommands));
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (!selectedRecipeId) {
      setError('Vui lòng chọn một recipe để liên kết.');
      return;
    }
    setCustomSlashCommand(check.name, selectedRecipeId);
    setCmdName('');
    setSelectedRecipeId('');
    setError(null);
  };

  const commandEntries = Object.entries(customSlashCommands);

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h4 className="field-label text-read">
          Lệnh gõ nhanh (Slash Commands)
        </h4>
        <p className="mt-0.5 text-ui leading-relaxed text-tertiary">
          Gõ <code className="claude-inline-code">/</code> trong khung chat để điều khiển nhanh hoặc kích hoạt workflow.
        </p>
      </div>

      {/* Danh sách lệnh built-in */}
      <div className="border border-subtle bg-surface p-3">
        <h5 className="field-label mb-2 text-ui">
          Lệnh hệ thống mặc định
        </h5>
        <div className="grid grid-cols-1 gap-2 text-ui sm:grid-cols-2">
          {BUILTIN_SLASH_COMMANDS.map((cmd) => (
            <div
              key={cmd.name}
              className="flex flex-col gap-0.5 border border-subtle bg-raised p-2"
            >
              <div className="flex items-center gap-1.5 font-sans font-medium text-accent">
                <span>/{cmd.name}</span>
                {cmd.aliases && cmd.aliases.length > 0 && (
                  <span className="font-sans text-micro font-normal text-disabled">
                    ({cmd.aliases.map((a) => `/${a}`).join(', ')})
                  </span>
                )}
              </div>
              <p className="field-hint">
                {cmd.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Danh sách custom slash commands */}
      <div className="space-y-2">
        <h5 className="field-label text-ui">
          Lệnh tùy biến liên kết Recipe (Custom /&lt;tên&gt; → Recipe)
        </h5>

        {commandEntries.length === 0 ? (
          <p className="field-hint italic">
            Chưa có lệnh tùy biến nào. Thêm lệnh bên dưới để mở nhanh workflow yêu thích bằng phím tắt <code className="claude-inline-code">/</code>.
          </p>
        ) : (
          <div className="space-y-1.5">
            {commandEntries.map(([name, recipeId]) => {
              const rec = (recipes ?? []).find((r) => r.id === recipeId);
              return (
                <div
                  key={name}
                  className="flex items-center justify-between border border-subtle bg-surface px-3 py-2 text-ui"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-accent">/{name}</span>
                    <span className="text-disabled" aria-hidden="true">→</span>
                    <span className="font-medium text-primary">
                      {rec?.title ?? recipeId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCustomSlashCommand(name)}
                    className="icon-btn icon-btn-sm icon-btn-danger"
                    aria-label={`Xóa lệnh /${name}`}
                    title={`Xóa lệnh /${name}`}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Form thêm custom command */}
        <div className="space-y-2 border border-dashed border-default p-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <input
                value={cmdName}
                onChange={(e) => {
                  setCmdName(e.target.value);
                  if (error) setError(null);
                }}
                className="field-sm w-full"
                placeholder="Tên lệnh (vd: lint hoặc test)"
                aria-label="Tên lệnh slash"
              />
            </div>
            <div>
              <select
                value={selectedRecipeId}
                onChange={(e) => {
                  setSelectedRecipeId(e.target.value);
                  if (error) setError(null);
                }}
                className="field-sm w-full"
                aria-label="Chọn Recipe"
              >
                <option value="">-- Chọn Recipe liên kết --</option>
                {(recipes ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="btn-secondary w-full py-1.5"
          >
            + Gán lệnh slash vào Recipe
          </button>
          {error && <p className="notice-error text-ui" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}
