'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/m/Toast';

interface Note {
  id: string;
  type: string;
  content: string;
  amount: number | null;
  createdAt: string;
}

interface Client {
  id: string;
  nickname: string;
  platform: string;
  category: string;
  tags: string;
  status: string;
  totalOrders: number;
  totalRevenue: number;
  lastContact: string | null;
  createdAt: string;
  notes: Note[];
}

const NOTE_TYPE: Record<string, { label: string; emoji: string; cls: string }> = {
  note: { label: '跟进', emoji: '📝', cls: 'badge-gray' },
  quote: { label: '报价', emoji: '💰', cls: 'badge-blue' },
  order: { label: '成交', emoji: '✅', cls: 'badge-green' },
  feedback: { label: '反馈', emoji: '💬', cls: 'badge-yellow' },
};

const STATUS_OPTIONS = [
  { v: 'lead', l: '潜在' },
  { v: 'negotiating', l: '咨询中' },
  { v: 'customer', l: '已成交' },
  { v: 'lost', l: '流失' },
];

export default function MClientDetailClient({ client }: { client: Client }) {
  const router = useRouter();
  const toast = useToast();
  const [c, setC] = useState(client);
  const [newNote, setNewNote] = useState({
    type: 'note',
    content: '',
    amount: '',
  });
  const [adding, setAdding] = useState(false);

  async function setStatus(status: string) {
    const res = await fetch(`/api/clients/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.show(j.error || '保存失败', 'error');
      return;
    }
    setC({ ...c, status });
    toast.show('已更新', 'success');
  }

  async function addNote() {
    if (!newNote.content.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/clients/${c.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newNote.type,
          content: newNote.content,
          amount: newNote.amount ? Number(newNote.amount) : null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '添加失败');
      setNewNote({ type: 'note', content: '', amount: '' });
      toast.show('已添加', 'success');
      router.refresh();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setAdding(false);
    }
  }

  async function delNote(id: string) {
    if (!confirm('删除该条记录？')) return;
    const res = await fetch(`/api/clients/${c.id}/notes/${id}`, {
      method: 'DELETE',
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.show(j.error || '删除失败', 'error');
      return;
    }
    toast.show('已删除', 'success');
    router.refresh();
  }

  async function delClient() {
    if (!confirm(`删除客户「${c.nickname}」及全部跟进记录？`)) return;
    const res = await fetch(`/api/clients/${c.id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.show(j.error || '删除失败', 'error');
      return;
    }
    router.push('/m/clients');
  }

  return (
    <div className="space-y-3">
      {/* 信息卡 */}
      <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white p-4">
        <div className="text-2xl font-semibold">{c.nickname}</div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
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
          {c.category && <span className="badge-gray">{c.category}</span>}
        </div>
        {c.tags && (
          <div className="text-xs opacity-80 mt-2">
            {c.tags
              .split(',')
              .filter(Boolean)
              .map((t) => '#' + t)
              .join(' ')}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="text-center">
            <div className="text-xs opacity-70">订单</div>
            <div className="text-base font-semibold">{c.totalOrders}</div>
          </div>
          <div className="text-center">
            <div className="text-xs opacity-70">总成交</div>
            <div className="text-base font-semibold">
              ¥{Math.round(c.totalRevenue)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs opacity-70">上次</div>
            <div className="text-base font-semibold">
              {c.lastContact
                ? new Date(c.lastContact).toLocaleDateString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                  })
                : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* 状态切换 */}
      <div className="rounded-xl bg-white border border-slate-200 p-3">
        <div className="text-xs text-slate-500 mb-2">客户状态</div>
        <div className="grid grid-cols-4 gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.v}
              onClick={() => setStatus(s.v)}
              className={
                'py-2 rounded-md text-sm border ' +
                (c.status === s.v
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-slate-700 border-slate-300')
              }
            >
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {/* 添加跟进 */}
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
        <div className="text-xs text-slate-500">添加跟进</div>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="m-input"
            value={newNote.type}
            onChange={(e) => setNewNote({ ...newNote, type: e.target.value })}
          >
            <option value="note">📝 跟进</option>
            <option value="quote">💰 报价</option>
            <option value="order">✅ 成交</option>
            <option value="feedback">💬 反馈</option>
          </select>
          <input
            type="number"
            inputMode="decimal"
            className="m-input"
            placeholder="金额(可选)"
            value={newNote.amount}
            onChange={(e) => setNewNote({ ...newNote, amount: e.target.value })}
          />
        </div>
        <textarea
          className="m-input min-h-[60px]"
          placeholder="跟进内容"
          value={newNote.content}
          onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
        />
        <button
          onClick={addNote}
          disabled={adding || !newNote.content.trim()}
          className="w-full rounded-lg bg-brand-600 text-white font-medium py-2.5 active:bg-brand-700 disabled:opacity-60"
        >
          {adding ? '添加中...' : '➕ 添加'}
        </button>
      </div>

      {/* 跟进时间线 */}
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm">跟进记录</h3>
          <span className="text-xs text-slate-400">{c.notes.length} 条</span>
        </div>
        {c.notes.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-6">
            暂无记录
          </div>
        ) : (
          <ol className="p-3 pl-7 space-y-3 relative">
            <div className="absolute left-[18px] top-3 bottom-3 w-px bg-slate-200" />
            {c.notes.map((n) => {
              const meta = NOTE_TYPE[n.type] ?? NOTE_TYPE.note;
              return (
                <li key={n.id} className="relative">
                  <div className="absolute -left-[22px] top-0 w-5 h-5 rounded-full bg-white border-2 border-brand-500 flex items-center justify-center text-xs">
                    {meta.emoji}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={meta.cls}>{meta.label}</span>
                    {n.amount !== null && (
                      <span className="text-sm font-mono text-rose-600">
                        ¥{n.amount}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 ml-auto">
                      {new Date(n.createdAt).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {n.content}
                  </div>
                  <button
                    onClick={() => delNote(n.id)}
                    className="text-xs text-red-500 mt-1"
                  >
                    删除
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <button
        onClick={delClient}
        className="w-full text-sm text-red-600 py-2 active:underline"
      >
        删除此客户
      </button>
    </div>
  );
}
