'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CATEGORIES } from '@/lib/constants';
import { useToast } from '@/components/m/Toast';

interface ClientItem {
  id: string;
  nickname: string;
  platform: string;
  category: string;
  tags: string;
  status: string;
  totalOrders: number;
  totalRevenue: number;
  lastContact: string | null;
  noteCount: number;
  createdAt: string;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  lead: { label: '潜在', cls: 'badge-gray' },
  negotiating: { label: '咨询中', cls: 'badge-yellow' },
  customer: { label: '已成交', cls: 'badge-green' },
  lost: { label: '流失', cls: 'badge-red' },
};

export default function MClientsClient({ initial }: { initial: ClientItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    nickname: '',
    platform: 'xiaohongshu',
    category: '',
    tags: '',
    status: 'lead',
  });

  const filtered = useMemo(() => {
    return items.filter((c) => {
      if (filter && c.status !== filter) return false;
      if (q) {
        const t = (c.nickname + c.tags).toLowerCase();
        if (!t.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [items, filter, q]);

  async function add() {
    if (!draft.nickname.trim()) return;
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.show(j.error || '添加失败', 'error');
      return;
    }
    setShowAdd(false);
    setDraft({ ...draft, nickname: '', tags: '' });
    toast.show('已添加', 'success');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
        <input
          className="m-input"
          placeholder="🔍 搜索昵称或标签"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex gap-2">
          {[
            { v: '', l: '全部' },
            { v: 'lead', l: '潜在' },
            { v: 'negotiating', l: '咨询中' },
            { v: 'customer', l: '已成交' },
            { v: 'lost', l: '流失' },
          ].map((s) => (
            <button
              key={s.v}
              onClick={() => setFilter(s.v)}
              className={
                'flex-1 py-1.5 rounded-md text-xs border ' +
                (filter === s.v
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-slate-700 border-slate-300')
              }
            >
              {s.l}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="w-full rounded-lg bg-brand-600 text-white font-medium py-2.5 active:bg-brand-700"
        >
          ➕ 新增客户
        </button>
      </div>

      <div className="text-xs text-slate-500 px-1">
        共 {filtered.length} 位
      </div>

      {filtered.map((c) => (
        <Link
          key={c.id}
          href={`/m/clients/${c.id}`}
          className="block rounded-xl bg-white border border-slate-200 p-3 active:bg-slate-50"
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-800 truncate">
                {c.nickname}
              </div>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <span
                  className={
                    c.platform === 'xiaohongshu'
                      ? 'badge-red'
                      : c.platform === 'xianyu'
                        ? 'badge-yellow'
                        : 'badge-gray'
                  }
                >
                  {c.platform === 'xiaohongshu'
                    ? '小红书'
                    : c.platform === 'xianyu'
                      ? '闲鱼'
                      : '其他'}
                </span>
                <span className={STATUS_LABEL[c.status]?.cls ?? 'badge-gray'}>
                  {STATUS_LABEL[c.status]?.label ?? c.status}
                </span>
                {c.category && <span className="badge-gray">{c.category}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-slate-400">订单/金额</div>
              <div className="text-sm font-semibold text-slate-800">
                {c.totalOrders} 单
              </div>
              <div className="text-xs text-rose-600 font-mono">
                ¥{Math.round(c.totalRevenue)}
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span>跟进 {c.noteCount} 条</span>
            <span>
              上次：
              {c.lastContact
                ? new Date(c.lastContact).toLocaleDateString('zh-CN')
                : '-'}
            </span>
          </div>
        </Link>
      ))}

      {filtered.length === 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-400">
          暂无客户，点上方新增
        </div>
      )}

      {showAdd && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="bg-white rounded-t-2xl p-4 w-full space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">新增客户</h3>
            <input
              className="m-input"
              placeholder="昵称"
              value={draft.nickname}
              onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className="m-input"
                value={draft.platform}
                onChange={(e) =>
                  setDraft({ ...draft, platform: e.target.value })
                }
              >
                <option value="xiaohongshu">小红书</option>
                <option value="xianyu">闲鱼</option>
                <option value="other">其他</option>
              </select>
              <select
                className="m-input"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                <option value="lead">潜在</option>
                <option value="negotiating">咨询中</option>
                <option value="customer">已成交</option>
                <option value="lost">流失</option>
              </select>
            </div>
            <select
              className="m-input"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            >
              <option value="">类目（可选）</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className="m-input"
              placeholder="标签（逗号分隔）"
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
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
          </div>
        </div>
      )}
    </div>
  );
}
