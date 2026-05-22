'use client';

import { useMemo, useState } from 'react';
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

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  reviewed: '已审核',
  published: '已发布',
};

export default function ContentsClient({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [filterPlat, setFilterPlat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filterPlat && it.platform !== filterPlat) return false;
      if (filterStatus && it.status !== filterStatus) return false;
      if (q) {
        const text = (it.title + it.body).toLowerCase();
        if (!text.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [items, filterPlat, filterStatus, q]);

  function showMsg(s: string) {
    setMsg(s);
    setTimeout(() => setMsg(null), 2000);
  }

  async function copyItem(it: Item) {
    const text =
      it.type === 'post'
        ? buildXhsBundle({
            title: it.title,
            body: it.body,
            tags: it.tags ? it.tags.split(',').filter(Boolean) : [],
            coverText: it.coverText,
            cta: it.cta,
          })
        : buildXianyuBundle({
            title: it.title,
            description: it.body,
            coverText: it.coverText,
          });
    const ok = await copyAll(text);
    showMsg(ok ? '已复制完整内容' : '复制失败');
  }

  async function setStatus(it: Item, status: string) {
    const res = await fetch(`/api/contents/${it.type}/${it.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      showMsg(j.error || '保存失败');
      return;
    }
    setItems((arr) => arr.map((x) => (x.id === it.id ? { ...x, status } : x)));
  }

  async function del(it: Item) {
    if (!confirm('确定删除？')) return;
    const res = await fetch(`/api/contents/${it.type}/${it.id}`, {
      method: 'DELETE',
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      showMsg(j.error || '删除失败');
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== it.id));
  }

  return (
    <div className="space-y-4">
      {/* 筛选 */}
      <div className="card">
        <div className="card-body grid grid-cols-1 md:grid-cols-[1fr_160px_140px] gap-3">
          <input
            className="input"
            placeholder="🔍 搜索标题或正文"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input"
            value={filterPlat}
            onChange={(e) => setFilterPlat(e.target.value)}
          >
            <option value="">全部平台</option>
            <option value="xiaohongshu">小红书</option>
            <option value="xianyu">闲鱼</option>
          </select>
          <select
            className="input"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="reviewed">已审核</option>
            <option value="published">已发布</option>
          </select>
        </div>
        <div className="card-body pt-0 text-sm text-slate-500 flex items-center justify-between">
          <span>共 {filtered.length} 条</span>
          {msg && <span className="text-emerald-600">{msg}</span>}
        </div>
      </div>

      {/* 列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((it) => (
          <Card
            key={it.type + it.id}
            item={it}
            onCopy={() => copyItem(it)}
            onSetStatus={(s) => setStatus(it, s)}
            onDelete={() => del(it)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full card">
            <div className="card-body text-center text-slate-400 py-8">
              没有匹配的内容
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({
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
  const platLabel = item.platform === 'xiaohongshu' ? '小红书' : '闲鱼';
  const stripColor =
    item.platform === 'xiaohongshu' ? 'bg-rose-500' : 'bg-amber-500';
  const date = new Date(item.createdAt).toLocaleString('zh-CN');
  return (
    <div className="card relative overflow-hidden flex flex-col">
      <div className={`absolute top-0 left-0 bottom-0 w-1 ${stripColor}`} />
      <div className="card-body pl-4 flex-1 flex flex-col">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className={item.platform === 'xiaohongshu' ? 'badge-red' : 'badge-yellow'}>
            {platLabel}
          </span>
          <span className="badge-gray">{item.type === 'post' ? '笔记' : '商品'}</span>
          <span className="badge-blue">{STATUS_LABEL[item.status] ?? item.status}</span>
          <span className="text-slate-400 ml-auto">{date}</span>
        </div>
        <h3 className="mt-2 font-semibold text-slate-800 leading-snug line-clamp-2">
          {item.title}
        </h3>
        <p className="mt-1.5 text-sm text-slate-600 leading-relaxed line-clamp-4 whitespace-pre-wrap">
          {item.body}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={onCopy} className="btn-primary text-xs px-3 py-1.5">
            📋 一键复制
          </button>
          <select
            value={item.status}
            onChange={(e) => onSetStatus(e.target.value)}
            className="input text-xs py-1 w-24"
          >
            <option value="draft">草稿</option>
            <option value="reviewed">已审核</option>
            <option value="published">已发布</option>
          </select>
          <button
            onClick={onDelete}
            className="text-red-600 hover:underline text-xs ml-auto"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
