'use client';

import { useState } from 'react';
import { SCRIPT_TYPES } from '@/lib/constants';
import { toast } from '@/lib/toast';
import SimpleListShell from '@/components/SimpleListShell';
import { bulkSerial } from '@/components/ListShell';

interface Script {
  id: string;
  type: string;
  title: string;
  content: string;
}

export default function ScriptsClient({ initial }: { initial: Script[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<Script | null>(null);
  const [draft, setDraft] = useState<Script>({
    id: '',
    type: '小红书首轮咨询',
    title: '',
    content: '',
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function add() {
    if (!draft.title.trim() || !draft.content.trim()) {
      toast.error('请填写标题和内容');
      return;
    }
    try {
      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '添加失败');
      setItems((arr) => [j.item, ...arr]);
      setDraft({ ...draft, title: '', content: '' });
      toast.success('已新增话术');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function save(s: Script) {
    try {
      const res = await fetch(`/api/scripts/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      setItems((arr) => arr.map((x) => (x.id === s.id ? j.item : x)));
      setEditing(null);
      toast.success('已保存');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function del(id: string) {
    if (!confirm('确定删除？')) return;
    const res = await fetch(`/api/scripts/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.error(j.error || '删除失败');
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== id));
  }

  function copy(id: string, text: string) {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((p) => (p === id ? null : p)), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">新增话术</h2>
        </div>
        <div className="card-body grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
          <div>
            <label className="label">类型</label>
            <select
              className="input"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            >
              {SCRIPT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">标题</label>
            <input
              className="input"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="例：客户犹豫处理"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">话术内容</label>
            <textarea
              className="input min-h-[120px]"
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <button onClick={add} className="btn-primary">
              添加话术
            </button>
          </div>
        </div>
      </div>

      <SimpleListShell<Script>
        items={items}
        getId={(s) => s.id}
        storageKey="list:scripts"
        searchPlaceholder="搜索标题 / 类型 / 内容"
        searchKeys={['title', 'type', 'content']}
        onToastSuccess={(m) => toast.success(m)}
        onToastError={(m) => toast.error(m)}
        bulkDelete={{
          confirmText: (n) => `确认删除已选 ${n} 条话术？`,
          run: async (ids) => {
            const r = await bulkSerial(ids, async (id) => {
              const res = await fetch(`/api/scripts/${id}`, {
                method: 'DELETE',
              });
              const j = await res.json().catch(() => ({}));
              if (!res.ok || !j.ok) throw new Error(j.error || '删除失败');
            });
            const failedIds = new Set(r.failed.map((f) => f.id));
            setItems((arr) =>
              arr.filter((x) => !ids.includes(x.id) || failedIds.has(x.id)),
            );
            if (r.failed.length === 0)
              return { ok: true, message: `已删除 ${r.ok} 条话术` };
            return {
              ok: false,
              message: `部分失败：成功 ${r.ok} / 失败 ${r.failed.length}`,
            };
          },
        }}
      >
        {(filtered, helpers) => (
          <div className="space-y-3">
            {filtered.map((s) =>
              editing?.id === s.id ? (
                <div key={s.id} className="card border-brand-300">
                  <div className="card-body space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
                      <div>
                        <label className="label">类型</label>
                        <select
                          className="input"
                          value={editing.type}
                          onChange={(e) =>
                            setEditing({ ...editing!, type: e.target.value })
                          }
                        >
                          {SCRIPT_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">标题</label>
                        <input
                          className="input"
                          value={editing.title}
                          onChange={(e) =>
                            setEditing({ ...editing!, title: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label">内容</label>
                      <textarea
                        className="input min-h-[120px]"
                        value={editing.content}
                        onChange={(e) =>
                          setEditing({ ...editing!, content: e.target.value })
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => save(editing!)}
                        className="btn-primary"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="btn-secondary"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  key={s.id}
                  className={
                    'card ' +
                    (helpers.isSelected(s.id)
                      ? 'ring-2 ring-brand-500'
                      : '')
                  }
                >
                  <div className="card-body">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="checkbox"
                        className="w-4 h-4 cursor-pointer"
                        checked={helpers.isSelected(s.id)}
                        onChange={() => helpers.toggle(s.id)}
                        aria-label="选择"
                      />
                      <span className="badge-blue">{s.type}</span>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                        {s.title}
                      </h3>
                      <div className="flex-1" />
                      <button
                        onClick={() => copy(s.id, s.content)}
                        className="text-sm text-brand-600 hover:underline"
                      >
                        {copiedId === s.id ? '已复制' : '复制'}
                      </button>
                      <button
                        onClick={() => setEditing(s)}
                        className="text-sm text-slate-600 dark:text-slate-300 hover:underline"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => del(s.id)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        删除
                      </button>
                    </div>
                    <div className="mt-2 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {s.content}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </SimpleListShell>
    </div>
  );
}
