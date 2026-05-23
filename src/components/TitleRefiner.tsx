'use client';

import { useState } from 'react';
import { copyAll } from '@/lib/clipboard';
import { toast } from '@/lib/toast';

interface RefinedItem {
  style: string;
  title: string;
}

type Version = RefinedItem[];

interface Props {
  title: string;
  platform: 'xiaohongshu' | 'xianyu';
  onSelect?: (newTitle: string) => void;
}

export default function TitleRefiner({ title, platform, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [compareMode, setCompareMode] = useState(false);

  const current = versions.length > 0 ? versions[versions.length - 1] : [];
  const previous = versions.length >= 2 ? versions[versions.length - 2] : null;

  async function refine() {
    setLoading(true);
    try {
      const res = await fetch('/api/title/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, platform }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      setVersions((arr) => [...arr, j.refined as Version]);
      setCompareMode(false);
    } catch (e) {
      // v0.11 B4: setError → toast.error 统一错误展示
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          if (versions.length === 0) refine();
        }}
        className="text-xs text-brand-600 hover:underline ml-2"
        title="让 AI 用 5 种风格改写这个标题"
      >
        ✨ 改写
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-lg p-5 w-full max-w-2xl space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">✨ 标题打磨器</h3>
            <div className="text-xs text-slate-500 dark:text-slate-400">原标题：</div>
            <div className="text-sm bg-slate-50 dark:bg-slate-800 p-2.5 rounded">
              {title}
            </div>

            {loading && (
              <div className="text-center py-6 text-sm text-slate-500 dark:text-slate-400">
                AI 改写中...
              </div>
            )}

            {!loading && current.length > 0 && !compareMode && (
              <div className="space-y-2">
                {versions.length >= 2 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    已生成 {versions.length} 版，可点击「对比上一版」。
                  </div>
                )}
                {current.map((r, i) => (
                  <RefinedRow
                    key={i}
                    item={r}
                    onCopy={copyAll}
                    onSelect={onSelect}
                    onClose={() => setOpen(false)}
                  />
                ))}
              </div>
            )}

            {!loading && compareMode && previous && (
              <CompareTitles prev={previous} curr={current} />
            )}

            <div className="grid grid-cols-3 gap-2 pt-2">
              <button
                onClick={refine}
                disabled={loading}
                className="btn-secondary"
              >
                🔄 再来一版
              </button>
              <button
                onClick={() => setCompareMode((v) => !v)}
                disabled={loading || versions.length < 2}
                className={
                  'text-xs px-3 py-2 rounded border ' +
                  (versions.length < 2
                    ? 'opacity-40 border-slate-200 dark:border-slate-700'
                    : 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200')
                }
              >
                {compareMode ? '↩️ 退出对比' : '🔍 对比上一版'}
              </button>
              <button onClick={() => setOpen(false)} className="btn-primary">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RefinedRow({
  item,
  onCopy,
  onSelect,
  onClose,
}: {
  item: RefinedItem;
  onCopy: (s: string) => void;
  onSelect?: (s: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded border border-slate-200 dark:border-slate-700 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="badge-blue">{item.style}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onCopy(item.title)}
            className="text-xs text-brand-600 hover:underline"
          >
            复制
          </button>
          {onSelect && (
            <button
              onClick={() => {
                onSelect(item.title);
                onClose();
              }}
              className="text-xs text-emerald-600 hover:underline"
            >
              采用
            </button>
          )}
        </div>
      </div>
      <div className="mt-1.5 text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
        {item.title}
      </div>
    </div>
  );
}

function CompareTitles({
  prev,
  curr,
}: {
  prev: RefinedItem[];
  curr: RefinedItem[];
}) {
  const styles = Array.from(
    new Set([...prev.map((r) => r.style), ...curr.map((r) => r.style)]),
  );
  const prevMap = new Map(prev.map((r) => [r.style, r.title] as const));
  const currMap = new Map(curr.map((r) => [r.style, r.title] as const));

  return (
    <div className="space-y-2">
      <div className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 rounded p-2">
        差异已用黄色高亮（按风格对齐）。
      </div>
      {styles.map((style) => {
        const p = prevMap.get(style) ?? '';
        const c = currMap.get(style) ?? '';
        const same = p === c;
        return (
          <div
            key={style}
            className="rounded border border-slate-200 dark:border-slate-700 p-2.5 space-y-1"
          >
            <span className="badge-blue">{style}</span>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div
                className={
                  'rounded px-2 py-1 ' +
                  (same
                    ? 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-slate-800 dark:text-slate-100')
                }
              >
                <div className="text-[10px] text-slate-500 mb-0.5">上一版</div>
                {p || '—'}
              </div>
              <div
                className={
                  'rounded px-2 py-1 ' +
                  (same
                    ? 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-slate-800 dark:text-slate-100')
                }
              >
                <div className="text-[10px] text-slate-500 mb-0.5">当前版</div>
                {c || '—'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
