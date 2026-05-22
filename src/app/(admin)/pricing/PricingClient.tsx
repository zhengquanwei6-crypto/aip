'use client';

import { useMemo, useState } from 'react';
import { CATEGORIES, PRICE_TIERS } from '@/lib/constants';

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

export default function PricingClient({ initial }: { initial: Pkg[] }) {
  const [items, setItems] = useState(initial);
  const [filterCat, setFilterCat] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [editing, setEditing] = useState<Pkg | null>(null);
  const [draft, setDraft] = useState<Pkg>({
    id: '',
    category: 'Logo',
    tier: '标准款',
    name: '',
    priceRange: '',
    description: '',
  });
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return items.filter(
      (x) =>
        (!filterCat || x.category === filterCat) &&
        (!filterTier || x.tier === filterTier),
    );
  }, [items, filterCat, filterTier]);

  async function add() {
    if (!draft.name.trim() || !draft.priceRange.trim()) {
      setError('请填写名称和价格区间');
      return;
    }
    setError(null);
    try {
      const res = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '添加失败');
      setItems((arr) => [{ ...j.item, description: j.item.description ?? '' }, ...arr]);
      setDraft({ ...draft, name: '', priceRange: '', description: '' });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save(p: Pkg) {
    try {
      const res = await fetch(`/api/pricing/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      setItems((arr) =>
        arr.map((x) =>
          x.id === p.id ? { ...j.item, description: j.item.description ?? '' } : x,
        ),
      );
      setEditing(null);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function del(id: string) {
    if (!confirm('确定删除此套餐？')) return;
    const res = await fetch(`/api/pricing/${id}`, { method: 'DELETE' });
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
          <h2 className="font-semibold">新增套餐</h2>
        </div>
        <div className="card-body grid grid-cols-1 sm:grid-cols-[140px_140px_1fr_180px_120px] gap-3 items-end">
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
            <label className="label">档位</label>
            <select
              className="input"
              value={draft.tier}
              onChange={(e) => setDraft({ ...draft, tier: e.target.value })}
            >
              {PRICE_TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">名称</label>
            <input
              className="input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例：基础Logo设计"
            />
          </div>
          <div>
            <label className="label">价格区间</label>
            <input
              className="input"
              value={draft.priceRange}
              onChange={(e) => setDraft({ ...draft, priceRange: e.target.value })}
              placeholder="例：199-399元"
            />
          </div>
          <button onClick={add} className="btn-primary">
            添加
          </button>
        </div>
        <div className="card-body pt-0">
          <label className="label">说明（可选）</label>
          <input
            className="input"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
        </div>
      </div>

      {/* 筛选 */}
      <div className="card">
        <div className="card-body flex items-end gap-3 flex-wrap">
          <div>
            <label className="label">类目</label>
            <select
              className="input w-40"
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
            <label className="label">档位</label>
            <select
              className="input w-32"
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
            >
              <option value="">全部</option>
              {PRICE_TIERS.map((t) => (
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

      {/* 列表 */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="table min-w-[760px]">
          <thead>
            <tr>
              <th className="w-32">类目</th>
              <th className="w-24">档位</th>
              <th>名称</th>
              <th className="w-40">价格区间</th>
              <th>说明</th>
              <th className="w-32 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) =>
              editing?.id === p.id ? (
                <tr key={p.id} className="bg-slate-50">
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
                      value={editing.tier}
                      onChange={(e) =>
                        setEditing({ ...editing!, tier: e.target.value })
                      }
                    >
                      {PRICE_TIERS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing!, name: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={editing.priceRange}
                      onChange={(e) =>
                        setEditing({ ...editing!, priceRange: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={editing.description}
                      onChange={(e) =>
                        setEditing({ ...editing!, description: e.target.value })
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
                <tr key={p.id}>
                  <td>{p.category}</td>
                  <td>
                    <span className={TIER_BADGE[p.tier] ?? 'badge-gray'}>
                      {p.tier}
                    </span>
                  </td>
                  <td>{p.name}</td>
                  <td className="text-slate-700">{p.priceRange}</td>
                  <td className="text-slate-500">{p.description}</td>
                  <td className="text-right space-x-2">
                    <button
                      onClick={() => setEditing(p)}
                      className="text-brand-600 hover:underline"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => del(p.id)}
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
                <td colSpan={6} className="text-center text-slate-400 py-8">
                  暂无套餐
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
