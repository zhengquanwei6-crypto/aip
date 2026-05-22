'use client';

import { useMemo, useState } from 'react';
import { CATEGORIES, PRICE_TIERS } from '@/lib/constants';
import { useToast } from '@/components/m/Toast';
import { copyAll } from '@/lib/clipboard';

interface Pkg {
  id: string;
  category: string;
  tier: string;
  name: string;
  priceRange: string;
  description: string;
}

const TIER_BADGE: Record<string, string> = {
  引流款: 'badge-gray',
  标准款: 'badge-blue',
  利润款: 'badge-green',
};

const EMPTY: Pkg = {
  id: '',
  category: 'Logo',
  tier: '标准款',
  name: '',
  priceRange: '',
  description: '',
};

export default function MPricingClient({ initial }: { initial: Pkg[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Pkg | null>(null);

  const grouped = useMemo(() => {
    const list = filter ? items.filter((x) => x.category === filter) : items;
    const map: Record<string, Pkg[]> = {};
    for (const p of list) {
      map[p.category] ??= [];
      map[p.category].push(p);
    }
    return Object.entries(map);
  }, [items, filter]);

  async function save(p: Pkg) {
    try {
      const isNew = !p.id;
      const url = isNew ? '/api/pricing' : `/api/pricing/${p.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      const item = { ...j.item, description: j.item.description ?? '' };
      setItems((arr) =>
        isNew ? [item, ...arr] : arr.map((x) => (x.id === p.id ? item : x)),
      );
      setEditing(null);
      toast.show(isNew ? '已新增' : '已保存', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }

  async function del(id: string) {
    if (!confirm('删除此套餐？')) return;
    const res = await fetch(`/api/pricing/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.show(j.error || '删除失败', 'error');
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== id));
    toast.show('已删除', 'success');
  }

  async function copy(p: Pkg) {
    const text = `【${p.tier}】${p.name} ${p.priceRange}${
      p.description ? `\n${p.description}` : ''
    }`;
    const ok = await copyAll(text);
    toast.show(ok ? '已复制' : '复制失败', ok ? 'success' : 'error');
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
        <select
          className="m-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">全部类目</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={() => setEditing({ ...EMPTY, category: filter || 'Logo' })}
          className="w-full rounded-lg bg-brand-600 text-white font-medium py-2.5 active:bg-brand-700"
        >
          ➕ 新增套餐
        </button>
      </div>

      {grouped.map(([cat, list]) => (
        <div
          key={cat}
          className="rounded-xl bg-white border border-slate-200 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 font-semibold text-sm">
            {cat}
          </div>
          <div className="divide-y divide-slate-100">
            {list.map((p) => (
              <div key={p.id} className="px-3 py-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={TIER_BADGE[p.tier] ?? 'badge-gray'}>
                    {p.tier}
                  </span>
                  <span className="font-medium text-slate-800">{p.name}</span>
                  <span className="text-sm font-semibold text-rose-600 ml-auto">
                    {p.priceRange}
                  </span>
                </div>
                {p.description && (
                  <div className="text-xs text-slate-500 leading-relaxed">
                    {p.description}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs">
                  <button
                    onClick={() => copy(p)}
                    className="text-brand-600 active:underline"
                  >
                    复制
                  </button>
                  <button
                    onClick={() => setEditing(p)}
                    className="text-slate-600 active:underline"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => del(p.id)}
                    className="text-red-600 active:underline ml-auto"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 编辑弹窗 */}
      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-white rounded-t-2xl p-4 w-full space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">{editing.id ? '编辑' : '新增'}套餐</h3>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="m-input"
                value={editing.category}
                onChange={(e) =>
                  setEditing({ ...editing, category: e.target.value })
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="m-input"
                value={editing.tier}
                onChange={(e) =>
                  setEditing({ ...editing, tier: e.target.value })
                }
              >
                {PRICE_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <input
              className="m-input"
              placeholder="名称"
              value={editing.name}
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value })
              }
            />
            <input
              className="m-input"
              placeholder="价格区间，例：199-399元"
              value={editing.priceRange}
              onChange={(e) =>
                setEditing({ ...editing, priceRange: e.target.value })
              }
            />
            <textarea
              className="m-input min-h-[60px]"
              placeholder="说明（可选）"
              value={editing.description}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-300 text-slate-700 font-medium py-3"
              >
                取消
              </button>
              <button
                onClick={() => save(editing)}
                className="rounded-lg bg-brand-600 text-white font-medium py-3"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
