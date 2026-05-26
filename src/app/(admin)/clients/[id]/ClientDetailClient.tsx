'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORIES } from '@/lib/constants';

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

const NOTE_TYPE_LABEL: Record<string, { label: string; emoji: string; cls: string }> = {
  note: { label: '跟进', emoji: '📝', cls: 'badge-gray' },
  quote: { label: '报价', emoji: '💰', cls: 'badge-blue' },
  order: { label: '成交', emoji: '✅', cls: 'badge-green' },
  feedback: { label: '反馈', emoji: '💬', cls: 'badge-yellow' },
};

export default function ClientDetailClient({ client }: { client: Client }) {
  const router = useRouter();
  const [c, setC] = useState(client);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    nickname: c.nickname,
    platform: c.platform,
    category: c.category,
    tags: c.tags,
    status: c.status,
  });
  const [newNote, setNewNote] = useState({
    type: 'note',
    content: '',
    amount: '',
  });
  const [adding, setAdding] = useState(false);

  async function saveProfile() {
    const res = await fetch(`/api/clients/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      alert(j.error || '保存失败');
      return;
    }
    setC({ ...c, ...draft });
    setEditing(false);
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
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
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
      alert(j.error || '删除失败');
      return;
    }
    router.refresh();
  }

  async function delClient() {
    if (!confirm(`确定删除客户「${c.nickname}」及其全部跟进记录？`)) return;
    const res = await fetch(`/api/clients/${c.id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      alert(j.error || '删除失败');
      return;
    }
    router.push('/clients');
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
      {/* 左：客户信息 */}
      <div className="space-y-4">
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">客户信息</h2>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-sm text-brand-600 hover:underline"
              >
                编辑
              </button>
            )}
          </div>
          <div className="card-body space-y-3">
            {editing ? (
              <>
                <Field label="昵称">
                  <input
                    className="input"
                    value={draft.nickname}
                    onChange={(e) =>
                      setDraft({ ...draft, nickname: e.target.value })
                    }
                  />
                </Field>
                <Field label="平台">
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
                </Field>
                <Field label="类目偏好">
                  <select
                    className="input"
                    value={draft.category}
                    onChange={(e) =>
                      setDraft({ ...draft, category: e.target.value })
                    }
                  >
                    <option value="">未设置</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="状态">
                  <select
                    className="input"
                    value={draft.status}
                    onChange={(e) =>
                      setDraft({ ...draft, status: e.target.value })
                    }
                  >
                    <option value="lead">潜在</option>
                    <option value="negotiating">咨询中</option>
                    <option value="customer">已成交</option>
                    <option value="lost">流失</option>
                  </select>
                </Field>
                <Field label="标签（逗号分隔）">
                  <input
                    className="input"
                    value={draft.tags}
                    onChange={(e) =>
                      setDraft({ ...draft, tags: e.target.value })
                    }
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="btn-secondary"
                  >
                    取消
                  </button>
                  <button onClick={saveProfile} className="btn-primary">
                    保存
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-semibold text-slate-800">
                  {c.nickname}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
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
                  <span className="badge-blue">
                    {c.status === 'lead'
                      ? '潜在'
                      : c.status === 'negotiating'
                        ? '咨询中'
                        : c.status === 'customer'
                          ? '已成交'
                          : '流失'}
                  </span>
                </div>
                {c.tags && (
                  <div className="text-xs text-slate-500">
                    标签：
                    {c.tags
                      .split(',')
                      .filter(Boolean)
                      .map((t) => '#' + t)
                      .join(' ')}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                  <Stat label="累计订单" value={`${c.totalOrders} 单`} />
                  <Stat
                    label="总成交"
                    value={`¥${Math.round(c.totalRevenue)}`}
                  />
                  <Stat
                    label="上次接触"
                    value={
                      c.lastContact
                        ? new Date(c.lastContact).toLocaleDateString('zh-CN')
                        : '-'
                    }
                  />
                  <Stat
                    label="首次接触"
                    value={new Date(c.createdAt).toLocaleDateString('zh-CN')}
                  />
                </div>
                <button
                  onClick={delClient}
                  className="text-sm text-red-600 hover:underline w-full text-center pt-2"
                >
                  删除此客户
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 右：跟进时间线 */}
      <div className="space-y-4">
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">添加跟进</h2>
          </div>
          <div className="card-body grid grid-cols-1 md:grid-cols-[120px_120px_1fr_100px] gap-3">
            <select
              className="input"
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
              className="input"
              placeholder="金额(元)"
              value={newNote.amount}
              onChange={(e) =>
                setNewNote({ ...newNote, amount: e.target.value })
              }
            />
            <input
              className="input"
              placeholder="跟进内容"
              value={newNote.content}
              onChange={(e) =>
                setNewNote({ ...newNote, content: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') addNote();
              }}
            />
            <button
              onClick={addNote}
              disabled={adding || !newNote.content.trim()}
              className="btn-primary"
            >
              {adding ? '添加中...' : '添加'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">跟进记录</h2>
            <span className="text-sm text-slate-500">
              共 {c.notes.length} 条
            </span>
          </div>
          <div className="card-body">
            {c.notes.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-6">
                暂无跟进记录，添加第一条吧
              </div>
            ) : (
              <ol className="space-y-3 relative pl-6 border-l-2 border-slate-200">
                {c.notes.map((n) => {
                  const meta = NOTE_TYPE_LABEL[n.type] ?? NOTE_TYPE_LABEL.note;
                  return (
                    <li key={n.id} className="relative">
                      <div className="absolute -left-[28px] top-0.5 w-5 h-5 rounded-full bg-white border-2 border-brand-500 flex items-center justify-center text-xs">
                        {meta.emoji}
                      </div>
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className={meta.cls}>{meta.label}</span>
                        {n.amount !== null && (
                          <span className="text-sm font-mono text-rose-600">
                            ¥{n.amount}
                          </span>
                        )}
                        <span className="text-xs text-slate-400 ml-auto">
                          {new Date(n.createdAt).toLocaleString('zh-CN')}
                        </span>
                        <button
                          onClick={() => delNote(n.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          删除
                        </button>
                      </div>
                      <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {n.content}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-base font-semibold text-slate-800 mt-0.5">
        {value}
      </div>
    </div>
  );
}
