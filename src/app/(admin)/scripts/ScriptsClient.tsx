'use client';

import { useMemo, useState } from 'react';
import { SCRIPT_TYPES } from '@/lib/constants';

interface Script {
  id: string;
  type: string;
  title: string;
  content: string;
}

export default function ScriptsClient({ initial }: { initial: Script[] }) {
  const [items, setItems] = useState(initial);
  const [filterType, setFilterType] = useState('');
  const [editing, setEditing] = useState<Script | null>(null);
  const [draft, setDraft] = useState<Script>({
    id: '',
    type: '小红书首轮咨询',
    title: '',
    content: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return items.filter((x) => !filterType || x.type === filterType);
  }, [items, filterType]);

  async function add() {
    if (!draft.title.trim() || !draft.content.trim()) {
      setError('请填写标题和内容');
      return;
    }
    setError(null);
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
    } catch (e) {
      setError((e as Error).message);
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
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function del(id: string) {
    if (!confirm('确定删除？')) return;
    const res = await fetch(`/api/scripts/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      alert(j.error || '删除失败');
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
          <div className="md:col-span-2 flex items-center gap-2">
            <button onClick={add} className="btn-primary">
              添加话术
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body flex items-end gap-3">
          <div>
            <label className="label">类型筛选</label>
            <select
              className="input w-44"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">全部</option>
              {SCRIPT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-slate-500 ml-auto">
            共 {filtered.length} 条
          </div>
        </div>
      </div>

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
            <div key={s.id} className="card">
              <div className="card-body">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge-blue">{s.type}</span>
                  <h3 className="font-semibold text-slate-800">{s.title}</h3>
                  <div className="flex-1" />
                  <button
                    onClick={() => copy(s.id, s.content)}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    {copiedId === s.id ? '已复制' : '复制'}
                  </button>
                  <button
                    onClick={() => setEditing(s)}
                    className="text-sm text-slate-600 hover:underline"
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
                <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {s.content}
                </div>
              </div>
            </div>
          ),
        )}
        {filtered.length === 0 && (
          <div className="card">
            <div className="card-body text-center text-sm text-slate-400 py-8">
              暂无话术
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
