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

  // AI 扩词
  const [showExpand, setShowExpand] = useState(false);
  const [expandSeed, setExpandSeed] = useState('');
  const [expandCount, setExpandCount] = useState(20);
  const [expandLoading, setExpandLoading] = useState(false);
  const [expandResults, setExpandResults] = useState<string[]>([]);
  const [expandSelected, setExpandSelected] = useState<Set<string>>(new Set());

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

  async function expandKeywords() {
    if (!expandSeed.trim()) {
      setError('请填写种子词');
      return;
    }
    setExpandLoading(true);
    setError(null);
    setExpandResults([]);
    try {
      const res = await fetch('/api/keywords/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed: expandSeed,
          category: draft.category,
          platform: draft.platform,
          count: expandCount,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '扩词失败');
      setExpandResults(j.keywords);
      setExpandSelected(new Set(j.keywords));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExpandLoading(false);
    }
  }

  async function saveExpanded() {
    const selected = Array.from(expandSelected);
    if (selected.length === 0) return;
    const items = selected.map((k) => ({
      category: draft.category,
      platform: draft.platform,
      keyword: k,
    }));
    const res = await fetch('/api/keywords/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      setError(j.error || '保存失败');
      return;
    }
    // 重新加载
    const r = await fetch('/api/keywords');
    const j2 = await r.json();
    if (j2.ok) {
      setItems(
        j2.list.map((k: any) => ({
          id: k.id,
          category: k.category,
          platform: k.platform,
          keyword: k.keyword,
        })),
      );
    }
    setShowExpand(false);
    setExpandResults([]);
    setExpandSelected(new Set());
    setExpandSeed('');
    alert(`已新增 ${j.added} 个关键词（共选中 ${selected.length}）`);
  }

  return (
    <div className="space-y-4">
      {/* 新增 */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">新增关键词</h2>
          <button
            onClick={() => setShowExpand(true)}
            className="text-sm text-brand-600 hover:underline"
          >
            🤖 AI 扩词
          </button>
        </div>
        <div className="card-body grid grid-cols-1 sm:grid-cols-[160px_140px_1fr_120px] gap-3 items-end">
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
        <div className="overflow-x-auto">
        <table className="table min-w-[600px]">
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

      {/* AI 扩词弹窗 */}
      {showExpand && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowExpand(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-lg p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-lg">🤖 AI 关键词扩词</h3>
            <p className="text-sm text-slate-500">
              输入一个种子词，AI 帮你扩 N 个长尾词，可勾选后批量入库（已存在的会自动跳过）
            </p>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_140px_100px] gap-2">
              <input
                className="input"
                placeholder="种子词，如 logo设计 / 奶茶店菜单"
                value={expandSeed}
                onChange={(e) => setExpandSeed(e.target.value)}
              />
              <select
                className="input"
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={draft.platform}
                onChange={(e) =>
                  setDraft({ ...draft, platform: e.target.value })
                }
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="input"
                value={expandCount}
                onChange={(e) =>
                  setExpandCount(Number(e.target.value) || 20)
                }
                min={5}
                max={50}
              />
            </div>
            <button
              onClick={expandKeywords}
              disabled={expandLoading}
              className="btn-primary w-full"
            >
              {expandLoading ? 'AI 生成中...' : `① 扩展 ${expandCount} 个长尾词`}
            </button>

            {expandResults.length > 0 && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">
                    已扩展 {expandResults.length} 个，已选 {expandSelected.size} 个
                  </span>
                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() =>
                        setExpandSelected(new Set(expandResults))
                      }
                      className="text-brand-600 hover:underline"
                    >
                      全选
                    </button>
                    <button
                      onClick={() => setExpandSelected(new Set())}
                      className="text-slate-500 hover:underline"
                    >
                      清空
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-2 border border-slate-200 dark:border-slate-700 rounded">
                  {expandResults.map((k) => {
                    const sel = expandSelected.has(k);
                    return (
                      <button
                        key={k}
                        onClick={() => {
                          const next = new Set(expandSelected);
                          if (sel) next.delete(k);
                          else next.add(k);
                          setExpandSelected(next);
                        }}
                        className={
                          'px-2.5 py-1 rounded-full text-sm border transition-colors ' +
                          (sel
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700')
                        }
                      >
                        {k}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={saveExpanded}
                  disabled={expandSelected.size === 0}
                  className="btn-primary w-full"
                >
                  ② 入库选中的 {expandSelected.size} 个
                </button>
              </>
            )}

            <button
              onClick={() => setShowExpand(false)}
              className="btn-secondary w-full"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
