'use client';

import { useState } from 'react';
import { CATEGORIES, PRICE_TIERS } from '@/lib/constants';
import { toast } from '@/lib/toast';
import SimpleListShell from '@/components/SimpleListShell';
import { bulkSerial } from '@/components/ListShell';

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
  const [editing, setEditing] = useState<Pkg | null>(null);
  const [draft, setDraft] = useState<Pkg>({
    id: '',
    category: 'Logo',
    tier: '标准款',
    name: '',
    priceRange: '',
    description: '',
  });

  async function add() {
    if (!draft.name.trim() || !draft.priceRange.trim()) {
      toast.error('请填写名称和价格区间');
      return;
    }
    try {
      const res = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '添加失败');
      setItems((arr) => [
        { ...j.item, description: j.item.description ?? '' },
        ...arr,
      ]);
      setDraft({ ...draft, name: '', priceRange: '', description: '' });
      toast.success('已新增套餐');
    } catch (e) {
      toast.error((e as Error).message);
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
          x.id === p.id
            ? { ...j.item, description: j.item.description ?? '' }
            : x,
        ),
      );
      setEditing(null);
      toast.success('已保存');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function del(id: string) {
    if (!confirm('确定删除此套餐？')) return;
    const res = await fetch(`/api/pricing/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.error(j.error || '删除失败');
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
              onChange={(e) =>
                setDraft({ ...draft, priceRange: e.target.value })
              }
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
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </div>
      </div>

      <SimpleListShell<Pkg>
        items={items}
        getId={(p) => p.id}
        storageKey="list:pricing"
        searchPlaceholder="搜索名称 / 类目 / 档位 / 价格"
        searchKeys={['name', 'category', 'tier', 'priceRange', 'description']}
        onToastSuccess={(m) => toast.success(m)}
        onToastError={(m) => toast.error(m)}
        bulkDelete={{
          confirmText: (n) => `确认删除已选 ${n} 个价格套餐？`,
          run: async (ids) => {
            const r = await bulkSerial(ids, async (id) => {
              const res = await fetch(`/api/pricing/${id}`, {
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
              return { ok: true, message: `已删除 ${r.ok} 个套餐` };
            return {
              ok: false,
              message: `部分失败：成功 ${r.ok} / 失败 ${r.failed.length}`,
            };
          },
        }}
      >
        {(filtered, helpers) => (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table min-w-[800px]">
                <thead>
                  <tr>
                    <th className="w-10" />
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
                      <tr key={p.id} className="bg-slate-50 dark:bg-slate-800/50">
                        <td />
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
                      <tr
                        key={p.id}
                        className={
                          helpers.isSelected(p.id)
                            ? 'bg-brand-50 dark:bg-brand-900/30'
                            : ''
                        }
                      >
                        <td>
                          <input
                            type="checkbox"
                            className="w-4 h-4 cursor-pointer"
                            checked={helpers.isSelected(p.id)}
                            onChange={() => helpers.toggle(p.id)}
                            aria-label="选择行"
                          />
                        </td>
                        <td>{p.category}</td>
                        <td>
                          <span className={TIER_BADGE[p.tier] ?? 'badge-gray'}>
                            {p.tier}
                          </span>
                        </td>
                        <td>{p.name}</td>
                        <td className="text-slate-700 dark:text-slate-200">
                          {p.priceRange}
                        </td>
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
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SimpleListShell>
    </div>
  );
}
