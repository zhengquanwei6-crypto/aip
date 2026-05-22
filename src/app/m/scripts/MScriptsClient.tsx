'use client';

import { useMemo, useState } from 'react';
import { SCRIPT_TYPES } from '@/lib/constants';
import { useToast } from '@/components/m/Toast';
import { copyAll } from '@/lib/clipboard';

interface Script {
  id: string;
  type: string;
  title: string;
  content: string;
}

const EMPTY: Script = {
  id: '',
  type: '小红书首轮咨询',
  title: '',
  content: '',
};

export default function MScriptsClient({ initial }: { initial: Script[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Script | null>(null);

  const filtered = useMemo(
    () => items.filter((x) => !filter || x.type === filter),
    [items, filter],
  );

  async function save(s: Script) {
    try {
      const isNew = !s.id;
      const url = isNew ? '/api/scripts' : `/api/scripts/${s.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      setItems((arr) =>
        isNew ? [j.item, ...arr] : arr.map((x) => (x.id === s.id ? j.item : x)),
      );
      setEditing(null);
      toast.show('已保存', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }

  async function del(id: string) {
    if (!confirm('删除？')) return;
    const res = await fetch(`/api/scripts/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.show(j.error || '删除失败', 'error');
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== id));
    toast.show('已删除', 'success');
  }

  async function copy(s: Script) {
    const ok = await copyAll(s.content);
    toast.show(ok ? '已复制话术' : '复制失败', ok ? 'success' : 'error');
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
        <select
          className="m-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">全部类型</option>
          {SCRIPT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          onClick={() => setEditing(EMPTY)}
          className="w-full rounded-lg bg-brand-600 text-white font-medium py-2.5 active:bg-brand-700"
        >
          ➕ 新增话术
        </button>
      </div>

      {filtered.map((s) => (
        <div
          key={s.id}
          className="rounded-xl bg-white border border-slate-200 p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="badge-blue">{s.type}</span>
            <button
              onClick={() => copy(s)}
              className="text-xs text-brand-600 px-2 py-1 active:bg-brand-50 rounded"
            >
              📋 复制
            </button>
          </div>
          <div className="font-semibold text-slate-800 text-sm">{s.title}</div>
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
            {s.content}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => setEditing(s)}
              className="text-slate-600 active:underline"
            >
              编辑
            </button>
            <button
              onClick={() => del(s.id)}
              className="text-red-600 active:underline ml-auto"
            >
              删除
            </button>
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-400">
          暂无话术
        </div>
      )}

      {/* 编辑 */}
      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-white rounded-t-2xl p-4 w-full space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">{editing.id ? '编辑' : '新增'}话术</h3>
            <select
              className="m-input"
              value={editing.type}
              onChange={(e) => setEditing({ ...editing, type: e.target.value })}
            >
              {SCRIPT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              className="m-input"
              placeholder="标题"
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
            <textarea
              className="m-input min-h-[160px]"
              placeholder="话术内容"
              value={editing.content}
              onChange={(e) =>
                setEditing({ ...editing, content: e.target.value })
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
