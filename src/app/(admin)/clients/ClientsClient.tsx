'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CATEGORIES } from '@/lib/constants';

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

export default function ClientsClient({ initial }: { initial: ClientItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [filterPlat, setFilterPlat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
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
      if (filterPlat && c.platform !== filterPlat) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      if (q) {
        const t = (c.nickname + c.tags).toLowerCase();
        if (!t.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [items, filterPlat, filterStatus, q]);

  async function add() {
    if (!draft.nickname.trim()) return;
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      alert(j.error || '添加失败');
      return;
    }
    setShowAdd(false);
    setDraft({ ...draft, nickname: '', tags: '' });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body grid grid-cols-1 md:grid-cols-[1fr_140px_140px_120px] gap-3">
          <input
            className="input"
            placeholder="🔍 搜索昵称或标签"
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
            <option value="other">其他</option>
          </select>
          <select
            className="input"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="lead">潜在</option>
            <option value="negotiating">咨询中</option>
            <option value="customer">已成交</option>
            <option value="lost">流失</option>
          </select>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            ➕ 新增客户
          </button>
        </div>
        <div className="card-body pt-0 text-sm text-slate-500">
          共 {filtered.length} 位
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table min-w-[800px]">
            <thead>
              <tr>
                <th>客户</th>
                <th className="w-20">平台</th>
                <th className="w-24">类目</th>
                <th className="w-20">状态</th>
                <th className="w-20">订单</th>
                <th className="w-24">总成交</th>
                <th className="w-28">上次接触</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td>
                    <Link
                      href={`/clients/${c.id}`}
                      className="font-medium text-slate-800 hover:text-brand-600"
                    >
                      {c.nickname}
                    </Link>
                    {c.tags && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        {c.tags
                          .split(',')
                          .filter(Boolean)
                          .map((t) => '#' + t)
                          .join(' ')}
                      </div>
                    )}
                  </td>
                  <td>
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
                  </td>
                  <td>{c.category || '-'}</td>
                  <td>
                    <span className={STATUS_LABEL[c.status]?.cls ?? 'badge-gray'}>
                      {STATUS_LABEL[c.status]?.label ?? c.status}
                    </span>
                  </td>
                  <td>{c.totalOrders}</td>
                  <td className="font-mono">¥{Math.round(c.totalRevenue)}</td>
                  <td className="text-xs text-slate-500">
                    {c.lastContact
                      ? new Date(c.lastContact).toLocaleDateString('zh-CN')
                      : '-'}
                  </td>
                  <td>
                    <Link
                      href={`/clients/${c.id}`}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      详情 →
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-400 py-8">
                    暂无客户。点击「新增客户」开始记录。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新增弹窗 */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="bg-white rounded-lg p-5 w-full max-w-md space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">新增客户</h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input"
                placeholder="昵称"
                value={draft.nickname}
                onChange={(e) =>
                  setDraft({ ...draft, nickname: e.target.value })
                }
                autoFocus
              />
              <select
                className="input"
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
                className="input"
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              >
                <option value="">类目（可选）</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                <option value="lead">潜在</option>
                <option value="negotiating">咨询中</option>
                <option value="customer">已成交</option>
                <option value="lost">流失</option>
              </select>
            </div>
            <input
              className="input"
              placeholder="标签（逗号分隔）"
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="btn-secondary"
              >
                取消
              </button>
              <button onClick={add} className="btn-primary">
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
