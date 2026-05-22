'use client';

import { useMemo, useState } from 'react';
import { CATEGORIES, PLATFORMS, PLATFORM_LABEL } from '@/lib/constants';

interface KW {
  id: string;
  category: string;
  platform: string;
  keyword: string;
}

export default function KeywordsClient({ initial }: { initial: KW[] }) {
  const [items, setItems] = useState(initial);
  const [filterCat, setFilterCat] = useState('');
  const [filterPlat, setFilterPlat] = useState('');
  const [editing, setEditing] = useState<KW | null>(null);
  const [draft, setDraft] = useState({
    category: 'Logo',
    platform: 'xiaohongshu',
    keyword: '',
  });
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return items.filter(
      (x) =>
        (!filterCat || x.category === filterCat) &&
        (!filterPlat || x.platform === filterPlat),
    );
  }, [items, filterCat, filterPlat]);

  async function add() {
    if (!draft.keyword.trim()) return;
    setError(null);
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '添加失败');
      setItems((arr) => [j.item, ...arr]);
      setDraft({ ...draft, keyword: '' });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save(k: KW) {
    setError(null);
    try {
      const res = await fetch(`/api/keywords/${k.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(k),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      setItems((arr) => arr.map((x) => (x.id === k.id ? j.item : x)));
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function del(id: string) {
    if (!confirm('确定删除？')) return;
    const res = await fetch(`/api/keywords/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      alert(j.error || '删除失败');
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* 新增 */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">新增关键词</h2>
        </div>
        <div className="card-body grid grid-cols-1 md:grid-cols-[160px_140px_1fr_120px] gap-3 items-end">
          <div>
            <label className="label">类目</label>
            <select
              className="input"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">平台</label>
            <select
              className="input"
              value={draft.platform}
              onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">关键词</label>
            <input
              className="input"
              value={draft.keyword}
              onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
              placeholder="例：logo设计"
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
              }}
            />
          </div>
          <button onClick={add} className="btn-primary">
            添加
          </button>
        </div>
        {error && <div className="card-body pt-0 text-sm text-red-600">{error}</div>}
      </div>

      {/* 筛选 */}
      <div className="card">
        <div className="card-body flex items-end gap-3 flex-wrap">
          <div>
            <label className="label">按类目筛选</label>
            <select
              className="input w-36"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
              <option value="">全部</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">按平台筛选</label>
            <select
              className="input w-32"
              value={filterPlat}
              onChange={(e) => setFilterPlat(e.target.value)}
            >
              <option value="">全部</option>
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-slate-500 ml-auto">
            共 {filtered.length} 条
          </div>
        </div>
      </div>

      {/* 列表 */}
      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th className="w-32">类目</th>
              <th className="w-24">平台</th>
              <th>关键词</th>
              <th className="w-32 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) =>
              editing?.id === k.id ? (
                <tr key={k.id} className="bg-slate-50">
                  <td>
                    <select
                      className="input"
                      value={editing.category}
                      onChange={(e) =>
                        setEditing({ ...editing!, category: e.target.value })
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="input"
                      value={editing.platform}
                      onChange={(e) =>
                        setEditing({ ...editing!, platform: e.target.value })
                      }
                    >
                      {PLATFORMS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      value={editing.keyword}
                      onChange={(e) =>
                        setEditing({ ...editing!, keyword: e.target.value })
                      }
                    />
                  </td>
                  <td className="text-right space-x-2">
                    <button
                      onClick={() => save(editing!)}
                      className="text-brand-600 hover:underline"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="text-slate-500 hover:underline"
                    >
                      取消
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={k.id}>
                  <td>{k.category}</td>
                  <td>{PLATFORM_LABEL[k.platform] ?? k.platform}</td>
                  <td>{k.keyword}</td>
                  <td className="text-right space-x-2">
                    <button
                      onClick={() => setEditing(k)}
                      className="text-brand-600 hover:underline"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => del(k.id)}
                      className="text-red-600 hover:underline"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ),
            )}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-slate-400 py-8">
                  暂无关键词
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
