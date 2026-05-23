'use client';

import { useState } from 'react';
import { Pencil, RotateCcw, Plus, Trash2 } from 'lucide-react';
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

export default function PromptsClient({
  initial,
}: {
  initial: PromptRow[];
}) {
  const [rows, setRows] = useState<PromptRow[]>(initial);
  const [editing, setEditing] = useState<PromptRow | null>(null);
  const [creating, setCreating] = useState(false);

  function startEdit(row: PromptRow) {
    setCreating(false);
    setEditing({ ...row, vars: row.vars.map((v) => ({ ...v })) });
  }

  function startCreate() {
    setCreating(true);
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

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
            Prompt 模板库
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            编辑后会写入 Setting 表（key 前缀 prompt:），删除即可恢复默认。
            模板 key 可包含 a-z 0-9 :_-。
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
              <div key={r.key} className="card">
                <div className="card-body">
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
                      <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 line-clamp-3 bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-wrap font-mono">
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
                          className="text-xs px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1"
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
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => {
            setEditing(null);
            setCreating(false);
          }}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-lg p-5 w-full max-w-2xl space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-lg">
              {creating ? '新建模板' : '编辑模板'}
            </h3>

            {creating && (
              <div>
                <label className="label">key（^[a-z0-9:_-]+$）</label>
                <input
                  className="input"
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
                className="input"
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </div>

            <div>
              <label className="label">description 简介</label>
              <input
                className="input"
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </div>

            <div>
              <label className="label">system 提示词</label>
              <textarea
                className="input font-mono text-xs min-h-[140px]"
                value={editing.system}
                onChange={(e) =>
                  setEditing({ ...editing, system: e.target.value })
                }
              />
            </div>

            <div>
              <label className="label">user 模板（可用 {`{{var}}`} 占位）</label>
              <textarea
                className="input font-mono text-xs min-h-[100px]"
                value={editing.user}
                onChange={(e) =>
                  setEditing({ ...editing, user: e.target.value })
                }
              />
            </div>

            <div>
              <label className="label">变量</label>
              <div className="space-y-2">
                {editing.vars.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                    <input
                      className="input text-xs"
                      placeholder="key"
                      value={v.key}
                      onChange={(e) => {
                        const next = editing.vars.slice();
                        next[i] = { ...next[i], key: e.target.value };
                        setEditing({ ...editing, vars: next });
                      }}
                    />
                    <input
                      className="input text-xs"
                      placeholder="label"
                      value={v.label}
                      onChange={(e) => {
                        const next = editing.vars.slice();
                        next[i] = { ...next[i], label: e.target.value };
                        setEditing({ ...editing, vars: next });
                      }}
                    />
                    <input
                      className="input text-xs"
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
                  className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
                >
                  <Plus size={12} />
                  添加变量
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCreating(false);
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
