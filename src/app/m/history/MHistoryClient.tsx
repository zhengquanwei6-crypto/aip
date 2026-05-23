'use client';

/**
 * /m/history · v0.9 b3 移动端 AI 输出历史（简化版）
 *
 * 沿用 /m/contents 的写法：
 *   - 顶部筛选（type / publish-director 虚拟筛选）
 *   - 列表卡片：类型 badge + model + 时间 + input/output 摘要
 *   - 单条「复制 output」/「删除」/「重新生成」（跳桌面）
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/m/Toast';
import { copyAll } from '@/lib/clipboard';

interface Row {
  id: string;
  type: string;
  input: string;
  output: string;
  model: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  text: '文案',
  image: '图片',
  image_prompt: '图片提示词',
  suggestion: '运营建议',
};

const TYPE_BADGE: Record<string, string> = {
  text: 'badge-blue',
  image: 'badge-yellow',
  image_prompt: 'badge-purple',
  suggestion: 'badge-green',
};

const FILTERS = [
  { value: '', label: '全部' },
  { value: 'text', label: '文案' },
  { value: 'image', label: '图片' },
  { value: 'image_prompt', label: '图片提示词' },
  { value: 'suggestion', label: '建议' },
  { value: '__publish_director__', label: '🎯 发布导演' },
];

function isPublishDirector(row: Row): boolean {
  return !!row.input && row.input.includes('"via":"publish-director"');
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

function preview(text: string, max = 200): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export default function MHistoryClient({ initial }: { initial: Row[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(initial);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return rows.filter((it) => {
      if (filter === '__publish_director__') {
        if (!isPublishDirector(it)) return false;
      } else if (filter && it.type !== filter) {
        return false;
      }
      if (q) {
        const text = (it.input + it.output + it.model).toLowerCase();
        if (!text.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, filter, q]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyOutput(it: Row) {
    const ok = await copyAll(it.output);
    toast.show(ok ? '已复制 output' : '复制失败', ok ? 'success' : 'error');
  }

  async function del(it: Row) {
    if (!confirm('确认删除？')) return;
    try {
      const res = await fetch(`/api/history/${it.id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '删除失败');
      setRows((arr) => arr.filter((x) => x.id !== it.id));
      toast.show('已删除', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-3">
      {/* 顶部筛选 */}
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
        <input
          className="m-input"
          placeholder="搜索 input / output / model"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="grid grid-cols-3 gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={
                'py-1.5 rounded-md text-xs border ' +
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
        共 {filtered.length} / {rows.length} 条
      </div>

      {filtered.map((it) => {
        const fromPub = isPublishDirector(it);
        const open = expanded.has(it.id);
        return (
          <div
            key={it.id}
            className="rounded-xl bg-white border border-slate-200 overflow-hidden"
          >
            <div className="px-3 py-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={TYPE_BADGE[it.type] ?? 'badge-gray'}>
                  {TYPE_LABEL[it.type] ?? it.type}
                </span>
                {fromPub && (
                  <span className="badge-yellow">🎯 publish-director</span>
                )}
                {it.model && (
                  <span className="text-xs text-slate-500 font-mono truncate max-w-[160px]">
                    {it.model}
                  </span>
                )}
                <span className="text-xs text-slate-400 ml-auto">
                  {fmtDate(it.createdAt)}
                </span>
              </div>

              <div
                className={
                  'text-xs text-slate-600 whitespace-pre-wrap break-words font-mono ' +
                  (open ? '' : 'line-clamp-4')
                }
              >
                <span className="text-slate-400">[output] </span>
                {open ? it.output : preview(it.output, 240)}
              </div>

              {open && (
                <div className="text-xs text-slate-500 whitespace-pre-wrap break-words font-mono bg-slate-50 rounded p-2">
                  <span className="text-slate-400">[input] </span>
                  {it.input}
                </div>
              )}

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => copyOutput(it)}
                  className="rounded-md bg-brand-600 text-white text-xs py-2 active:bg-brand-700"
                >
                  📋 复制 output
                </button>
                <button
                  onClick={() => toggle(it.id)}
                  className="rounded-md border border-slate-300 text-xs py-2 active:bg-slate-50"
                >
                  {open ? '收起' : '展开'}
                </button>
                <button
                  onClick={() => del(it)}
                  className="rounded-md border border-red-300 text-red-600 text-xs py-2 active:bg-red-50"
                >
                  删除
                </button>
              </div>

              <Link
                href={`/history`}
                className="block text-xs text-center text-brand-600 active:text-brand-700"
              >
                打开桌面版「重新生成」 →
              </Link>
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-400">
          没有匹配的历史记录
        </div>
      )}
    </div>
  );
}
