'use client';

/**
 * Panel Recipes — danh sách recipe (Dexie + workspace .vyen/recipes), form
 * tham số, Run / Export / Import. Recipe từ liên kết share luôn mở ở chế độ
 * XEM TRƯỚC: không có gì chạy cho tới khi người dùng bấm Run (chống
 * prompt-injection qua link).
 */

import { Z_CLASS } from '@/lib/ui-z';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChefHat, FileDown, FileUp, Link2, Play, Trash2, X } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';
import { db, type RecipeRecord } from '@/lib/db';
import {
  coerceParamValue,
  discoverWorkspaceRecipes,
  importRecipeText,
  readRecipeRecord,
  deleteRecipe as deleteRecipeRecord,
  serializeRecipe,
  buildRecipeShareLink,
  resolveParameters,
  prepareRecipeRun,
  resolveSubRecipesAtStart,
  type Recipe,
  type RecipeParamValues,
} from '@/lib/recipes';
import { useRecipeUiStore, type ActiveRecipeRun } from '@/lib/recipes/run-store';
import { desktopFsList, desktopFsRead } from '@/lib/desktop-fs';
import { requireWorkspace, fsRead } from '@/lib/fs-access';
import { isVyenDesktop } from '@/lib/desktop-bridge';

/* ---------------- pure helpers (test được) ---------------- */

/** Ghép danh sách hiển thị: DB trước (mới nhất trước), workspace sau. */
export interface RecipeListItem {
  key: string;
  recipe: Recipe;
  origin: 'db' | 'workspace' | 'link';
  recordId?: string;
  workspacePath?: string;
  updatedAt?: number;
}

export function mergeRecipeLists(
  dbRecords: readonly RecipeRecord[],
  workspace: readonly { path: string; recipe: Recipe }[],
): RecipeListItem[] {
  const items: RecipeListItem[] = [];
  for (const r of dbRecords) {
    const recipe = readRecipeRecord(r);
    if (recipe) {
      items.push({ key: `db:${r.id}`, recipe, origin: 'db', recordId: r.id, updatedAt: r.updatedAt });
    }
  }
  for (const w of workspace) {
    items.push({ key: `ws:${w.path}`, recipe: w.recipe, origin: 'workspace', workspacePath: w.path });
  }
  return items;
}

/** Giá trị mặc định cho form theo khai báo tham số. */
export function defaultFormValues(recipe: Recipe): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of recipe.parameters ?? []) {
    out[p.key] = p.default !== undefined ? String(p.default) : p.input_type === 'boolean' ? 'false' : '';
  }
  return out;
}

/** Đọc file text trong workspace (desktop bridge hoặc web FSA) — cho sub-recipe path. */
export function makeWorkspaceTextReader(): (path: string) => Promise<string> {
  if (isVyenDesktop()) {
    return async (p) =>
      String((await desktopFsRead(p) as unknown as { content?: string }).content ?? '');
  }
  return async (p) => {
    const ws = await requireWorkspace();
    if (!ws.ok) throw new Error(ws.error);
    const r = await fsRead(ws.deps, p);
    return String((r as unknown as { content?: string }).content ?? '');
  };
}

/* ---------------- UI ---------------- */

function ParamField({
  def,
  value,
  onChange,
}: {
  def: NonNullable<Recipe['parameters']>[number];
  value: string;
  onChange: (v: string) => void;
}) {
  const label = (
    <label htmlFor={`recipe-param-${def.key}`} className="field-label block">
      <span className="font-mono">{def.key}</span>
      <span className="ml-1 font-normal text-disabled">
        {def.requirement === 'required' ? '(bắt buộc)' : def.requirement === 'user_prompt' ? '(hỏi khi chạy)' : '(tuỳ chọn)'}
      </span>
    </label>
  );
  const base = 'field-sm mt-1 w-full';
  if (def.input_type === 'select') {
    return (
      <div>
        {label}
        <select id={`recipe-param-${def.key}`} value={value} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">— chọn —</option>
          {(def.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
    );
  }
  if (def.input_type === 'boolean') {
    return (
      <label
        htmlFor={`recipe-param-${def.key}`}
        className="mt-2 flex cursor-pointer items-center gap-2"
      >
        <input
          id={`recipe-param-${def.key}`}
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
          className="h-4 w-4 flex-shrink-0 rounded-full accent-accent"
        />
        <span className="text-ui text-primary">
          <span className="font-mono font-medium">{def.key}</span>
          {def.description ? <span className="text-tertiary"> — {def.description}</span> : null}
        </span>
      </label>
    );
  }
  return (
    <div>
      {label}
      <input
        id={`recipe-param-${def.key}`}
        type={def.input_type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={def.description ? def.description.slice(0, 80) : `giá trị ${def.input_type}`}
        className={base}
      />
    </div>
  );
}

export function RecipesPanel({
  open,
  onClose,
  onRun,
}: {
  open: boolean;
  onClose: () => void;
  /** Chat-interface đăng ký: bấm Run → bắt đầu run thật. */
  onRun?: (run: ActiveRecipeRun) => void;
}) {
  const selected = useRecipeUiStore((s) => s.selected);
  const select = useRecipeUiStore((s) => s.select);

  const dbRecords = useLiveQuery(() => db.recipes.orderBy('updatedAt').reverse().toArray(), [], [] as RecipeRecord[]);
  const [workspaceRecipes, setWorkspaceRecipes] = useState<Array<{ path: string; recipe: Recipe }>>([]);
  const [wsError, setWsError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const containerRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(containerRef, {
    active: open,
    onEscape: onClose,
  });

  const items = useMemo(() => mergeRecipeLists(dbRecords ?? [], workspaceRecipes), [dbRecords, workspaceRecipes]);

  /* Quét .vyen/recipes mỗi khi mở panel (desktop bridge hoặc web FSA). */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const adapter = isVyenDesktop()
          ? {
              listRecipeFiles: async () =>
                (await desktopFsList('.vyen/recipes'))
                  .filter((e) => e.type === 'file')
                  .map((e) => e.name),
              readText: async (p: string) =>
                String((await desktopFsRead(`.vyen/recipes/${p}`) as unknown as { content?: string }).content ?? ''),
            }
          : await (async () => {
              const ws = await requireWorkspace();
              if (!ws.ok) throw new Error(ws.error);
              const dirHandle = await ws.deps.root
                .getDirectoryHandle('.vyen', { create: false })
                .then((h) => h.getDirectoryHandle('recipes', { create: false }));
              return {
                listRecipeFiles: async () => {
                  const names: string[] = [];
                  for await (const entry of dirHandle.values()) {
                    if (entry.kind === 'file') names.push(entry.name);
                  }
                  return names;
                },
                readText: async (p: string) => {
                  const fh = await dirHandle.getFileHandle(p);
                  return (await fh.getFile()).text();
                },
              };
            })();
        const found = await discoverWorkspaceRecipes(adapter);
        if (!cancelled) {
          setWorkspaceRecipes(found.recipes);
          setWsError(found.errors.length ? `${found.errors.length} file hỏng: ${found.errors[0]!.error.slice(0, 80)}` : null);
        }
      } catch {
        if (!cancelled) setWorkspaceRecipes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  /* Đổi selection → reset form theo default của recipe mới. */
  useEffect(() => {
    setFormValues(selected ? defaultFormValues(selected.recipe) : {});
    setFormError(null);
  }, [selected]);

  const handleRun = useCallback(async () => {
    if (!selected) return;
    const recipe = selected.recipe;
    const values: RecipeParamValues = {};
    for (const p of recipe.parameters ?? []) {
      const raw = formValues[p.key] ?? '';
      if (raw === '') continue;
      const coerced = coerceParamValue(raw, p.input_type);
      if (coerced === null) {
        setFormError(`Tham số "${p.key}" cần giá trị ${p.input_type} hợp lệ.`);
        return;
      }
      values[p.key] = coerced;
    }
    const resolved = resolveParameters(recipe, values);
    if (resolved.missing.length) {
      setFormError(`Thiếu tham số bắt buộc: ${resolved.missing.join(', ')}.`);
      return;
    }
    const prepared = prepareRecipeRun(recipe, resolved.values, {
      includeStructuredDirective: true,
      ...(selected.origin === 'workspace' && selected.workspacePath
        ? { recipeDir: '.vyen/recipes' }
        : {}),
    });

    /* Sub-recipes: resolve path/inline NGAY lúc Run (đọc file ở máy user) —
       hỏng cái nào thì chặn cả Run để user sửa, không chạy dở. */
    let subRecipes: ActiveRecipeRun['body']['subRecipes'];
    if (recipe.sub_recipes?.length) {
      try {
        const readText = makeWorkspaceTextReader();
        const result = await resolveSubRecipesAtStart(recipe.sub_recipes, readText, {
          baseDir: '.vyen/recipes',
        });
        if (result.errors.length || result.resolved.length !== recipe.sub_recipes.length) {
          setFormError(
            `Sub-recipe hỏng: ${result.errors.map((e) => `${e.name}: ${e.error}`).join(' · ')}`,
          );
          return;
        }
        subRecipes = result.resolved.map((r) => ({
          name: r.name,
          mode: r.mode,
          returnMode: r.returnMode,
          fixedValues: r.fixedValues,
          recipe: r.recipe,
        }));
      } catch (err) {
        setFormError(
          `Không đọc được sub-recipe từ workspace: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
    }

    const run: ActiveRecipeRun = {
      runId: `rrun-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      recipe,
      body: {
        title: recipe.title,
        instructions: prepared.systemAppend,
        ...(recipe.response?.json_schema ? { jsonSchema: recipe.response.json_schema } : {}),
        ...(prepared.toolPolicy.deny.length ? { toolDeny: prepared.toolPolicy.deny } : {}),
        ...(prepared.toolPolicy.allow.length ? { toolAllow: prepared.toolPolicy.allow } : {}),
        ...(subRecipes ? { subRecipes } : {}),
      },
      firstUserMessage: prepared.firstUserMessage,
      values: resolved.values,
      attempt: 1,
      maxAttempts: 1 + (recipe.retry?.max_retries ?? 0),
      status: 'running',
      log: [`bắt đầu: ${recipe.title}`],
    };
    onRun?.(run);
  }, [selected, formValues, onRun]);

  const handleImportFile = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const text = await files[0]!.text();
    const res = await importRecipeText(text);
    setNotice(res.ok ? `Đã nhập "${res.record.title}".` : `Nhập thất bại: ${res.error}`);
  }, []);

  const handleImportLink = useCallback(async () => {
    const { decodeRecipeParam } = await import('@/lib/recipes/share');
    const param = /(?:\?|&)recipe=([^&]+)/.exec(linkInput.trim());
    const decoded = param ? decodeRecipeParam(decodeURIComponent(param[1]!)) : null;
    if (!decoded?.ok || !decoded.recipe) {
      setNotice('Liên kết không đọc được recipe (hỏng hoặc sai định dạng).');
      return;
    }
    const res = await importRecipeText(serializeRecipe(decoded.recipe, 'yaml'));
    setNotice(res.ok ? `Đã nhập "${res.record.title}" từ liên kết.` : `Lưu thất bại: ${res.error}`);
    setLinkInput('');
  }, [linkInput]);

  const handleExport = useCallback(async () => {
    if (!selected) return;
    const yaml = serializeRecipe(selected.recipe, 'yaml');
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected.recipe.title.toLowerCase().replace(/[^\w\d-]+/g, '-')}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selected]);

  const handleCopyLink = useCallback(async () => {
    if (!selected) return;
    const link = buildRecipeShareLink(selected.recipe);
    try {
      await navigator.clipboard.writeText(link);
      setNotice('Đã copy liên kết share vào clipboard.');
    } catch {
      setNotice('Không copy được clipboard — thử lại hoặc export file .yaml.');
    }
  }, [selected]);

  if (!open) return null;

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipes-panel-title"
      className={`fixed inset-0 ${Z_CLASS.navigation} flex justify-end bg-sunken/70`}
      onClick={onClose}
    >
      <aside
        className="flex h-full w-[min(30rem,100vw)] flex-col overflow-hidden lift-md rounded-xl border border-subtle bg-overlay font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-subtle bg-raised px-4 py-3">
          <div className="min-w-0">
            <h2 id="recipes-panel-title" className="flex items-center gap-2 text-read font-semibold text-primary">
              <span className="font-bold text-accent">$</span>
              <span className="text-accent">recipes</span>
              <span>· {items.length} workflow</span>
            </h2>
            <div className="text-meta text-tertiary">
              Workflow đóng gói: tham số, tool, kiểm chứng và retry.
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng panel recipes"
            className="icon-btn icon-btn-md"
          >
            <X size={14} />
          </button>
        </div>

        {!selected && (
          <>
            <div className="flex items-center gap-1.5 border-b border-subtle px-3 py-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary px-2 py-1.5"
              >
                <FileUp size={12} aria-hidden="true" /> Nhập file
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <Link2 size={12} aria-hidden="true" className="flex-none text-accent" />
                <input
                  type="text"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="dán liên kết ?recipe=…"
                  aria-label="Liên kết recipe"
                  className="field-sm min-w-0 flex-1"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleImportLink()}
                disabled={!linkInput.trim()}
                className="btn-secondary px-2 py-1.5"
              >
                Nhập
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".yaml,.yml,.json"
                hidden
                onChange={(e) => {
                  void handleImportFile(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => select({ recipe: item.recipe, origin: item.origin, ...(item.recordId ? { recordId: item.recordId } : {}), ...(item.workspacePath ? { workspacePath: item.workspacePath } : {}) })}
                  className="block w-full border-b border-subtle px-3 py-2.5 text-left transition-colors hover:bg-raised"
                >
                  <div className="flex items-baseline gap-2">
                    <ChefHat size={13} aria-hidden="true" className="flex-none text-accent" />
                    <span className="min-w-0 flex-1 truncate text-body text-primary">{item.recipe.title}</span>
                    <span className="flex-none text-micro text-tertiary">
                      {item.origin === 'db' ? 'đã lưu' : item.workspacePath}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-meta leading-relaxed text-tertiary">
                    {item.recipe.description}
                  </p>
                  {(item.recipe.parameters?.length ?? 0) > 0 && (
                    <p className="mt-0.5 text-micro text-disabled">
                      tham số: {item.recipe.parameters!.map((p) => p.key).join(', ')}
                    </p>
                  )}
                </button>
              ))}
              {items.length === 0 && (
                <div role="status" className="px-4 py-8 text-center text-ui leading-relaxed text-tertiary">
                  Chưa có recipe nào. Nhập file .yaml, dán liên kết share, hoặc tạo
                  thư mục <code>.vyen/recipes/</code> trong workspace rồi đặt file
                  recipe vào đó.
                </div>
              )}
              {wsError && (
                <div role="status" className="border-t border-subtle px-3 py-2 text-micro text-warning">
                  {wsError}
                </div>
              )}
            </div>
          </>
        )}

        {selected && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-subtle bg-raised px-4 py-3">
              <div className="flex items-baseline gap-2">
                <ChefHat size={14} aria-hidden="true" className="flex-none text-accent" />
                <span className="min-w-0 flex-1 truncate text-read font-semibold text-primary">{selected.recipe.title}</span>
                <button
                  type="button"
                  onClick={() => select(null)}
                  aria-label="Quay lại danh sách"
                  className="flex-none text-meta text-accent hover:text-primary"
                >
                  danh sách
                </button>
              </div>
              <p className="mt-1 text-meta leading-relaxed text-tertiary">{selected.recipe.description}</p>
              {selected.origin === 'link' && (
                <p className="mt-1 text-micro text-warning">
                  Recipe từ liên kết — xem trước nội dung, không gì chạy cho tới khi bạn bấm Run.
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {(selected.recipe.parameters?.length ?? 0) > 0 ? (
                <div className="space-y-3">
                  {selected.recipe.parameters!.map((p) => (
                    <ParamField
                      key={p.key}
                      def={p}
                      value={formValues[p.key] ?? ''}
                      onChange={(v) => setFormValues((f) => ({ ...f, [p.key]: v }))}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-meta text-tertiary">Recipe không cần tham số.</p>
              )}

              {(selected.recipe.retry?.checks?.length ?? 0) > 0 && (
                <div className="mt-4 border-t border-subtle pt-3">
                  <p className="text-meta font-semibold text-primary">Kiểm chứng sau khi agent xong</p>
                  <ul className="mt-1 space-y-0.5">
                    {selected.recipe.retry!.checks.map((c, i) => (
                      <li key={i} className="text-meta text-tertiary">
                        <code className="text-accent">{c.command}</code>
                      </li>
                    ))}
                  </ul>
                  <p className="field-hint mt-1">
                    Tối đa {selected.recipe.retry!.max_retries} lần chạy lại; lệnh vẫn qua phê duyệt như thường.
                  </p>
                </div>
              )}

              {formError && <p role="alert" className="mt-3 text-meta text-danger">{formError}</p>}
              {notice && <p role="status" className="mt-3 text-meta text-success">{notice}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-subtle bg-raised px-3 py-2.5">
              <button
                type="button"
                onClick={() => void handleRun()}
                className="btn-primary"
              >
                <Play size={12} aria-hidden="true" /> Run
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                className="btn-secondary px-2 py-1.5"
              >
                <FileDown size={12} aria-hidden="true" /> Export .yaml
              </button>
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="btn-secondary px-2 py-1.5"
              >
                <Link2 size={12} aria-hidden="true" /> Copy link
              </button>
              {selected.recordId && (
                <button
                  type="button"
                  onClick={() => {
                    void deleteRecipeRecord(selected.recordId!);
                    select(null);
                  }}
                  aria-label={`Xoá recipe ${selected.recipe.title}`}
                  className="btn-secondary ml-auto border-danger px-2 py-1.5 text-danger hover:border-danger hover:text-danger"
                >
                  <Trash2 size={12} aria-hidden="true" /> Xoá
                </button>
              )}
            </div>
          </div>
        )}

        {!selected && notice && (
          <div className="border-t border-subtle bg-raised px-4 py-2 text-meta text-success" role="status">
            {notice}
          </div>
        )}
      </aside>
    </div>
  );
}
