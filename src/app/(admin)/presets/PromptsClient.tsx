'use client';

import { useState, useMemo } from 'react';
import { Pencil, RotateCcw, Plus, Trash2, GitCompare } from 'lucide-react';
import SimpleListShell from '@/components/SimpleListShell';
import { toast } from '@/lib/toast';

interface PromptVar {
  key: string;
  label: string;
  example?: string;
}

interface PromptRow {
  key: string;
  source: 'custom' | 'default';
  name: string;
  description: string;
  system: string;
  user: string;
  vars: PromptVar[];
}

const KEY_RE = /^[a-z0-9:_-]+$/;

/**
 * v0.9.2 b1：把当前文本与"默认 system"逐行对比，差异行 bg-yellow。
 * 简单逐行匹配，不依赖第三方 diff 库。
 */
function lineDiff(currentText: string, defaultText: string): {
  current: { line: string; changed: boolean }[];
  defaultLines: { line: string; changed: boolean }[];
} {
  const a = (currentText || '').split('\n');
  const b = (defaultText || '').split('\n');
  const max = Math.max(a.length, b.length);
  const current: { line: string; changed: boolean }[] = [];
  const defaultLines: { line: string; changed: boolean }[] = [];
  for (let i = 0; i < max; i++) {
    const ai = a[i] ?? '';
    const bi = b[i] ?? '';
    const changed = ai !== bi;
    current.push({ line: ai, changed });
    defaultLines.push({ line: bi, changed });
  }
  return { current, defaultLines };
}

export default function PromptsClient({
  initial,
}: {
  initial: PromptRow[];
}) {
  const [rows, setRows] = useState<PromptRow[]>(initial);
  const [editing, setEditing] = useState<PromptRow | null>(null);
  const [creating, setCreating] = useState(false);

  // v0.9.2 b1：默认模板缓存（key → default tpl），用于"vs 默认"对比
  const [defaultCache, setDefaultCache] = useState<Record<string, PromptRow>>({});
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);

  function startEdit(row: PromptRow) {
    setCreating(false);
    setDiffOpen(false);
    setEditing({ ...row, vars: row.vars.map((v) => ({ ...v })) });
  }

  function startCreate() {
    setCreating(true);
    setDiffOpen(false);
    setEditing({
      key: '',
      source: 'custom',
      name: '',
      description: '',
      system: '',
      user: '',
      vars: [],
    });
  }

  /**
   * v0.9.2 b1：
   * 拉默认模板用于 diff。先看 cache；
   * 若当前是 default 直接拿当前；
   * 否则调 GET /api/prompts/<key>，但如果服务端返回 source=custom，
   * 我们 fallback 到 DELETE? 不行 —— 简化方案：
   *   /api/prompts/<key> 返回的 row 始终是当前生效（custom 优先），
   *   v0.9.2 b1 不动 API，所以默认 system 用本地 initial 中其他默认条目兜底，
   *   或者更可靠：直接读 row.source==='default' 时的内容做对比。
   * 这里我们：用一个隐式的 ?source=default query（API 未实现时 fallback）。
   */
  async function openDiff() {
    if (!editing) return;
    if (creating) {
      toast.error('新建模板没有"默认"可对比');
      return;
    }
    const key = editing.key;
    if (!key) return;
    setDiffLoading(true);
    try {
      // 优先 cache
      if (defaultCache[key]) {
        setDiffOpen(true);
        return;
      }
      // 当前 row 已经是 default → 直接做缓存
      const cur = rows.find((r) => r.key === key);
      if (cur && cur.source === 'default') {
        setDefaultCache((m) => ({ ...m, [key]: cur }));
        setDiffOpen(true);
        return;
      }
      // 否则向 API 拉一次默认（带 ?source=default）
      const res = await fetch(
        `/api/prompts/${encodeURIComponent(key)}?source=default`,
        { method: 'GET' },
      );
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '拉默认模板失败');
      // 服务端如果忽略 query，会回退到 custom；此时我们仍用返回内容作为对比基准
      // （至少能给用户看到一份"标准模板"）
      const cmp: PromptRow = {
        key,
        source: j.source === 'default' ? 'default' : 'custom',
        name: j.tpl?.name ?? '',
        description: j.tpl?.description ?? '',
        system: j.tpl?.system ?? '',
        user: j.tpl?.user ?? '',
        vars: Array.isArray(j.tpl?.vars) ? j.tpl.vars : [],
      };
      setDefaultCache((m) => ({ ...m, [key]: cmp }));
      setDiffOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDiffLoading(false);
    }
  }

  async function save() {
    if (!editing) return;
    const key = editing.key.trim();
    if (!KEY_RE.test(key)) {
      toast.error('key 只能包含小写字母、数字、冒号、下划线、连字符');
      return;
    }
    if (!editing.name.trim() || !editing.system.trim() || !editing.user.trim()) {
      toast.error('name / system / user 不能为空');
      return;
    }
    try {
      const res = await fetch(`/api/prompts/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editing.name,
          description: editing.description,
          system: editing.system,
          user: editing.user,
          vars: editing.vars,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      const saved: PromptRow = {
        key,
        source: 'custom',
        name: j.tpl.name,
        description: j.tpl.description,
        system: j.tpl.system,
        user: j.tpl.user,
        vars: j.tpl.vars ?? [],
      };
      setRows((arr) => {
        const idx = arr.findIndex((r) => r.key === key);
        if (idx >= 0) {
          const next = arr.slice();
          next[idx] = saved;
          return next;
        }
        return [saved, ...arr];
      });
      toast.success('已保存');
      setEditing(null);
      setCreating(false);
      setDiffOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function restoreDefault(key: string) {
    if (!window.confirm('确认恢复默认？自定义内容会丢失。')) return;
    try {
      const res = await fetch(`/api/prompts/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '恢复失败');
      if (j.tpl) {
        const restored: PromptRow = {
          key,
          source: 'default',
          name: j.tpl.name,
          description: j.tpl.description,
          system: j.tpl.system,
          user: j.tpl.user,
          vars: j.tpl.vars ?? [],
        };
        setRows((arr) => {
          const idx = arr.findIndex((r) => r.key === key);
          if (idx >= 0) {
            const next = arr.slice();
            next[idx] = restored;
            return next;
          }
          return arr;
        });
      } else {
        // 没有默认 → 自定义 key，从列表移除
        setRows((arr) => arr.filter((r) => r.key !== key));
      }
      toast.success('已恢复默认');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // diff 数据准备
  const diffData = useMemo(() => {
    if (!editing || !diffOpen) return null;
    const cmp = defaultCache[editing.key];
    if (!cmp) return null;
    return {
      systemDiff: lineDiff(editing.system, cmp.system),
      userDiff: lineDiff(editing.user, cmp.user),
      cmp,
    };
  }, [editing, diffOpen, defaultCache]);

  return (
    <div className="space-y-4">
      <div className="command-glass">
        <div className="p-4 sm:p-5">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
            Prompt 模板库
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            编辑后会写入 Setting 表（key 前缀 prompt:），删除即可恢复默认。
            模板 key 可包含 a-z 0-9 :_-。
            <span className="ml-2 text-brand-600 dark:text-brand-400">
              · v0.9.2 b1：编辑器内可点"vs 默认"看与默认模板的差异（黄色高亮）
            </span>
          </p>
        </div>
      </div>

      <SimpleListShell<PromptRow>
        items={rows}
        getId={(r) => r.key}
        storageKey="list:prompts"
        searchPlaceholder="搜索 key 或 name"
        searchKeys={['key', 'name', 'description']}
        toolbar={
          <button
            type="button"
            onClick={startCreate}
            className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1"
          >
            <Plus size={14} />
            新建模板
          </button>
        }
        onToastSuccess={(m) => toast.success(m)}
        onToastError={(m) => toast.error(m)}
      >
        {(filtered) => (
          <div className="space-y-3">
            {filtered.map((r) => (
              <div key={r.key} className="command-glass detail-lift">
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-200">
                          {r.key}
                        </span>
                        {r.source === 'custom' ? (
                          <span className="badge-blue">自定义</span>
                        ) : (
                          <span className="badge-gray">默认</span>
                        )}
                      </div>
                      <div className="mt-1.5 text-base font-medium text-slate-800 dark:text-slate-100">
                        {r.name}
                      </div>
                      {r.description && (
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          {r.description}
                        </div>
                      )}
                      <div className="mt-2 line-clamp-3 rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs whitespace-pre-wrap text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
                        {r.system}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1"
                      >
                        <Pencil size={12} />
                        编辑
                      </button>
                      {r.source === 'custom' && (
                        <button
                          type="button"
                          onClick={() => restoreDefault(r.key)}
                          className="btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1"
                          title="恢复为默认或删除自定义"
                        >
                          <RotateCcw size={12} />
                          恢复默认
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SimpleListShell>

      {/* 编辑弹窗 */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => {
            setEditing(null);
            setCreating(false);
            setDiffOpen(false);
          }}
        >
          <div
            className={
              'command-glass max-h-[90vh] w-full space-y-3 overflow-y-auto p-5 ' +
              (diffOpen ? 'max-w-5xl' : 'max-w-2xl')
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-lg">
                {creating ? '新建模板' : '编辑模板'}
              </h3>
              {!creating && (
                <button
                  type="button"
                  onClick={() => {
                    if (diffOpen) {
                      setDiffOpen(false);
                    } else {
                      openDiff();
                    }
                  }}
                  disabled={diffLoading}
                  className="btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1 disabled:opacity-50"
                  title="对比当前内容与默认模板"
                >
                  <GitCompare size={12} />
                  {diffLoading
                    ? '加载中…'
                    : diffOpen
                      ? '关闭 vs 默认'
                      : 'vs 默认'}
                </button>
              )}
            </div>

            {creating && (
              <div>
                <label className="label">key（^[a-z0-9:_-]+$）</label>
                <input
                  className="input command-input"
                  value={editing.key}
                  onChange={(e) =>
                    setEditing({ ...editing, key: e.target.value })
                  }
                  placeholder="例如 xiaohongshu:case"
                />
              </div>
            )}
            {!creating && (
              <div className="text-xs text-slate-500">
                key：
                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {editing.key}
                </span>
              </div>
            )}

            <div>
              <label className="label">name 名称</label>
              <input
                className="input command-input"
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </div>

            <div>
              <label className="label">description 简介</label>
              <input
                className="input command-input"
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </div>

            <div>
              <label className="label">system 提示词</label>
              <textarea
                className="input command-input font-mono text-xs min-h-[140px]"
                value={editing.system}
                onChange={(e) =>
                  setEditing({ ...editing, system: e.target.value })
                }
              />
            </div>

            <div>
              <label className="label">user 模板（可用 {`{{var}}`} 占位）</label>
              <textarea
                className="input command-input font-mono text-xs min-h-[100px]"
                value={editing.user}
                onChange={(e) =>
                  setEditing({ ...editing, user: e.target.value })
                }
              />
            </div>

            {/* v0.9.2 b1 · 双栏 diff */}
            {diffOpen && diffData && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3 space-y-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  对比基准：
                  <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded ml-1">
                    {diffData.cmp.source === 'default' ? '默认模板' : '当前已保存版本'}
                  </span>
                  ，黄色行 = 与对比基准不同。
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1 text-slate-700 dark:text-slate-200">
                    system
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-slate-500 mb-0.5">
                        当前编辑
                      </div>
                      <pre className="text-[11px] font-mono bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-wrap break-words leading-relaxed">
                        {diffData.systemDiff.current.map((r, i) => (
                          <div
                            key={i}
                            className={
                              r.changed
                                ? 'bg-yellow-100 dark:bg-yellow-900/30'
                                : ''
                            }
                          >
                            {r.line || ' '}
                          </div>
                        ))}
                      </pre>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 mb-0.5">
                        对比基准
                      </div>
                      <pre className="text-[11px] font-mono bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-wrap break-words leading-relaxed">
                        {diffData.systemDiff.defaultLines.map((r, i) => (
                          <div
                            key={i}
                            className={
                              r.changed
                                ? 'bg-yellow-100 dark:bg-yellow-900/30'
                                : ''
                            }
                          >
                            {r.line || ' '}
                          </div>
                        ))}
                      </pre>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1 text-slate-700 dark:text-slate-200">
                    user
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-slate-500 mb-0.5">
                        当前编辑
                      </div>
                      <pre className="text-[11px] font-mono bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-wrap break-words leading-relaxed">
                        {diffData.userDiff.current.map((r, i) => (
                          <div
                            key={i}
                            className={
                              r.changed
                                ? 'bg-yellow-100 dark:bg-yellow-900/30'
                                : ''
                            }
                          >
                            {r.line || ' '}
                          </div>
                        ))}
                      </pre>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 mb-0.5">
                        对比基准
                      </div>
                      <pre className="text-[11px] font-mono bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-wrap break-words leading-relaxed">
                        {diffData.userDiff.defaultLines.map((r, i) => (
                          <div
                            key={i}
                            className={
                              r.changed
                                ? 'bg-yellow-100 dark:bg-yellow-900/30'
                                : ''
                            }
                          >
                            {r.line || ' '}
                          </div>
                        ))}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="label">变量</label>
              <div className="space-y-2">
                {editing.vars.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                    <input
                      className="input command-input text-xs"
                      placeholder="key"
                      value={v.key}
                      onChange={(e) => {
                        const next = editing.vars.slice();
                        next[i] = { ...next[i], key: e.target.value };
                        setEditing({ ...editing, vars: next });
                      }}
                    />
                    <input
                      className="input command-input text-xs"
                      placeholder="label"
                      value={v.label}
                      onChange={(e) => {
                        const next = editing.vars.slice();
                        next[i] = { ...next[i], label: e.target.value };
                        setEditing({ ...editing, vars: next });
                      }}
                    />
                    <input
                      className="input command-input text-xs"
                      placeholder="example"
                      value={v.example ?? ''}
                      onChange={(e) => {
                        const next = editing.vars.slice();
                        next[i] = { ...next[i], example: e.target.value };
                        setEditing({ ...editing, vars: next });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = editing.vars.slice();
                        next.splice(i, 1);
                        setEditing({ ...editing, vars: next });
                      }}
                      className="text-red-500 text-xs px-2"
                      aria-label="删除变量"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      vars: [...editing.vars, { key: '', label: '', example: '' }],
                    })
                  }
                  className="btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1"
                >
                  <Plus size={12} />
                  添加变量
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCreating(false);
                  setDiffOpen(false);
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button type="button" onClick={save} className="btn-primary">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
