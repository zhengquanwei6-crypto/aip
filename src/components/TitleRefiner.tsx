'use client';

import { useState } from 'react';
import { copyAll } from '@/lib/clipboard';

interface Props {
  title: string;
  platform: 'xiaohongshu' | 'xianyu';
  onSelect?: (newTitle: string) => void;
}

export default function TitleRefiner({ title, platform, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ style: string; title: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refine() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/title/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, platform }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      setResult(j.refined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          if (result.length === 0) refine();
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
            className="bg-white dark:bg-slate-900 rounded-lg p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">✨ 标题打磨器</h3>
            <div className="text-xs text-slate-500">原标题：</div>
            <div className="text-sm bg-slate-50 dark:bg-slate-800 p-2.5 rounded">
              {title}
            </div>

            {loading && (
              <div className="text-center py-6 text-sm text-slate-500">
                AI 改写中...
              </div>
            )}

            {error && (
              <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded p-2">
                {error}
              </div>
            )}

            {result.length > 0 && (
              <div className="space-y-2">
                {result.map((r, i) => (
                  <div
                    key={i}
                    className="rounded border border-slate-200 dark:border-slate-700 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="badge-blue">{r.style}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyAll(r.title)}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          复制
                        </button>
                        {onSelect && (
                          <button
                            onClick={() => {
                              onSelect(r.title);
                              setOpen(false);
                            }}
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            采用
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                      {r.title}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={refine}
                disabled={loading}
                className="btn-secondary"
              >
                🔄 再生成
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
