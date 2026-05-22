'use client';

import { useMemo, useState } from 'react';
import { CATEGORIES, PLATFORMS, PLATFORM_LABEL } from '@/lib/constants';
import { useToast } from '@/components/m/Toast';

interface KW {
  id: string;
  category: string;
  platform: string;
  keyword: string;
}

export default function MKeywordsClient({ initial }: { initial: KW[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [filterCat, setFilterCat] = useState('');
  const [filterPlat, setFilterPlat] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    category: 'Logo',
    platform: 'xiaohongshu',
    keyword: '',
  });

  const filtered = useMemo(() => {
    return items.filter(
      (x) =>
        (!filterCat || x.category === filterCat) &&
        (!filterPlat || x.platform === filterPlat),
    );
  }, [items, filterCat, filterPlat]);

  // 按类目分组
  const grouped = useMemo(() => {
    const map: Record<string, KW[]> = {};
    for (const k of filtered) {
      const key = `${k.category}-${k.platform}`;
      map[key] ??= [];
      map[key].push(k);
    }
    return Object.entries(map);
  }, [filtered]);

  async function add() {
    if (!draft.keyword.trim()) return;
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
      toast.show('已添加', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }

  async function del(id: string) {
    if (!confirm('删除此关键词？')) return;
    const res = await fetch(`/api/keywords/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.show(j.error || '删除失败', 'error');
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== id));
    toast.show('已删除', 'success');
  }

  return (
    <div className="space-y-3">
      {/* 筛选 */}
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select
            className="m-input"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
          >
            <option value="">全部类目</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="m-input"
            value={filterPlat}
            onChange={(e) => setFilterPlat(e.target.value)}
          >
            <option value="">全部平台</option>
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="w-full rounded-lg bg-brand-600 text-white font-medium py-2.5 active:bg-brand-700"
        >
          ➕ 新增关键词
        </button>
      </div>

      <div className="text-xs text-slate-500 px-1">共 {filtered.length} 条</div>

      {grouped.map(([key, list]) => {
        const [cat, plat] = key.split('-');
        return (
          <div
            key={key}
            className="rounded-xl bg-white border border-slate-200 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <span className="badge-gray">{cat}</span>
              <span
                className={
                  plat === 'xiaohongshu' ? 'badge-red' : 'badge-yellow'
                }
              >
                {PLATFORM_LABEL[plat]}
              </span>
              <span className="text-xs text-slate-400 ml-auto">
                {list.length}
              </span>
            </div>
            <div className="p-3 flex flex-wrap gap-1.5">
              {list.map((k) => (
                <span
                  key={k.id}
                  onClick={() => del(k.id)}
                  className="px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-700 text-sm active:bg-red-100"
                  title="点击删除"
                >
                  {k.keyword}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {/* 新增弹窗 */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="bg-white rounded-t-2xl p-4 w-full space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">新增关键词</h3>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="m-input"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="m-input"
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
            <input
              className="m-input"
              placeholder="关键词"
              value={draft.keyword}
              onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-slate-300 text-slate-700 font-medium py-3"
              >
                取消
              </button>
              <button
                onClick={add}
                className="rounded-lg bg-brand-600 text-white font-medium py-3"
              >
                添加
              </button>
            </div>
            <p className="text-xs text-slate-400 text-center">
              提示：列表中点击关键词可删除
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
