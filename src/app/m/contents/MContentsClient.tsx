'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/components/m/Toast';
import { copyAll, buildXhsBundle, buildXianyuBundle } from '@/lib/clipboard';

interface Item {
  id: string;
  type: 'post' | 'product';
  platform: string;
  title: string;
  body: string;
  coverText?: string;
  tags?: string;
  cta?: string;
  priceTier?: string;
  status: string;
  createdAt: string;
}

const FILTERS = [
  { value: '', label: '全部' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'xianyu', label: '闲鱼' },
];

export default function MContentsClient({ initial }: { initial: Item[] }) {
  const toast = useToast();
  const [items, setItems] = useState<Item[]>(initial);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filter && it.platform !== filter) return false;
      if (q) {
        const text = (it.title + it.body).toLowerCase();
        if (!text.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [items, filter, q]);

  async function copyItem(it: Item) {
    let text: string;
    if (it.type === 'post') {
      text = buildXhsBundle({
        title: it.title,
        body: it.body,
        tags: it.tags ? it.tags.split(',').filter(Boolean) : [],
        coverText: it.coverText,
        cta: it.cta,
      });
    } else {
      text = buildXianyuBundle({
        title: it.title,
        description: it.body,
        coverText: it.coverText,
      });
    }
    const ok = await copyAll(text);
    toast.show(ok ? '已复制完整内容' : '复制失败', ok ? 'success' : 'error');
  }

  async function setStatus(it: Item, status: string) {
    try {
      const res = await fetch(`/api/contents/${it.type}/${it.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      setItems((arr) => arr.map((x) => (x.id === it.id ? { ...x, status } : x)));
      toast.show('已更新', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }

  async function del(it: Item) {
    if (!confirm('确定删除？')) return;
    try {
      const res = await fetch(`/api/contents/${it.type}/${it.id}`, {
        method: 'DELETE',
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '删除失败');
      setItems((arr) => arr.filter((x) => x.id !== it.id));
      toast.show('已删除', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-3">
      {/* 筛选 */}
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
        <input
          className="m-input"
          placeholder="搜索标题或正文"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={
                'flex-1 py-1.5 rounded-md text-sm border ' +
                (filter === f.value
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-slate-700 border-slate-300')
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-slate-500 px-1">
        共 {filtered.length} 条
      </div>

      {filtered.map((it) => (
        <ItemCard
          key={it.type + it.id}
          item={it}
          onCopy={() => copyItem(it)}
          onSetStatus={(s) => setStatus(it, s)}
          onDelete={() => del(it)}
        />
      ))}

      {filtered.length === 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-400">
          没有匹配的内容
        </div>
      )}
    </div>
  );
}

function ItemCard({
  item,
  onCopy,
  onSetStatus,
  onDelete,
}: {
  item: Item;
  onCopy: () => void;
  onSetStatus: (s: string) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stripColor =
    item.platform === 'xiaohongshu' ? 'bg-rose-500' : 'bg-amber-500';
  const platLabel = item.platform === 'xiaohongshu' ? '小红书' : '闲鱼';
  const date = new Date(item.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="relative rounded-xl bg-white border border-slate-200 overflow-hidden">
      <div className={`absolute top-0 left-0 bottom-0 w-1 ${stripColor}`} />
      <div className="pl-3 pr-3 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={
                item.platform === 'xiaohongshu' ? 'badge-red' : 'badge-yellow'
              }
            >
              {platLabel}
            </span>
            <span className="badge-gray">{item.type === 'post' ? '笔记' : '商品'}</span>
            <StatusBadge status={item.status} />
          </div>
          <span className="text-xs text-slate-400">{date}</span>
        </div>

        <div className="font-medium text-slate-800 leading-snug">
          {item.title}
        </div>

        <div
          className={
            'text-sm text-slate-600 whitespace-pre-wrap leading-relaxed ' +
            (expanded ? '' : 'line-clamp-3')
          }
        >
          {item.body}
        </div>
        {item.body.length > 100 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-brand-600"
          >
            {expanded ? '收起' : '展开全文'}
          </button>
        )}

        {/* 操作 */}
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <button
            onClick={onCopy}
            className="rounded-md bg-brand-600 text-white text-xs py-2 active:bg-brand-700"
          >
            📋 复制
          </button>
          <select
            value={item.status}
            onChange={(e) => onSetStatus(e.target.value)}
            className="rounded-md border border-slate-300 text-xs py-2 bg-white"
          >
            <option value="draft">草稿</option>
            <option value="reviewed">已审核</option>
            <option value="published">已发布</option>
          </select>
          <button
            onClick={onDelete}
            className="rounded-md border border-red-300 text-red-600 text-xs py-2 active:bg-red-50"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: '草稿', cls: 'badge-gray' },
    reviewed: { label: '已审核', cls: 'badge-yellow' },
    published: { label: '已发布', cls: 'badge-green' },
  };
  const m = map[status] ?? { label: status, cls: 'badge-gray' };
  return <span className={m.cls}>{m.label}</span>;
}
