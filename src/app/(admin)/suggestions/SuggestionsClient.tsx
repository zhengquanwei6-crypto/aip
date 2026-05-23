'use client';

import { useState } from 'react';
import { PLATFORM_LABEL } from '@/lib/constants';
import { toast } from '@/lib/toast';

interface Suggestion {
  summary?: string;
  amplifyCategories?: string[];
  reduceCategories?: string[];
  rewriteTitles?: string[];
  redoCovers?: string[];
  raisePrice?: string[];
  pushSubscription?: string[];
  weekFocus?: string[];
  nextWeek10?: { platform: string; time: string; category: string; title: string }[];
}

export default function SuggestionsClient({
  initial,
}: {
  initial: { suggestion: Suggestion; createdAt: string; model?: string | null } | null;
}) {
  const [data, setData] = useState<Suggestion | null>(initial?.suggestion ?? null);
  const [createdAt, setCreatedAt] = useState<string | null>(
    initial?.createdAt ?? null,
  );
  const [loading, setLoading] = useState(false);

  async function regenerate() {
    setLoading(true);
    try {
      const res = await fetch('/api/suggestions/generate', { method: 'POST' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      setData(j.suggestion);
      setCreatedAt(new Date().toISOString());
      toast.success('AI 建议已生成');
    } catch (e) {
      // v0.11 B4: setError → toast.error 统一错误展示
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold">AI 复盘建议</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              基于最近 7 天 / 30 天的数据。每次重新生成会调用 LLM API。
            </div>
            {createdAt && (
              <div className="text-xs text-slate-400 mt-1">
                上次生成时间：{new Date(createdAt).toLocaleString('zh-CN')}
              </div>
            )}
          </div>
          <button
            onClick={regenerate}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? '生成中...' : data ? '重新生成' : '生成 AI 建议'}
          </button>
        </div>
      </div>

      {!data && !loading && (
        <div className="card">
          <div className="card-body text-sm text-slate-400 text-center py-12">
            尚未生成 AI 建议。点击右上角生成。
          </div>
        </div>
      )}

      {data && (
        <>
          {data.summary && (
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold">总体总结</h2>
              </div>
              <div className="card-body text-sm leading-relaxed whitespace-pre-wrap">
                {data.summary}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ListCard title="下周继续放大的类目" items={data.amplifyCategories} tone="green" />
            <ListCard title="下周减少发布的类目" items={data.reduceCategories} tone="red" />
            <ListCard title="需要重写标题的内容" items={data.rewriteTitles} tone="yellow" />
            <ListCard title="需要重做首图的商品" items={data.redoCovers} tone="yellow" />
            <ListCard title="可适度提高价格的服务" items={data.raisePrice} tone="green" />
            <ListCard title="适合主推包月的服务" items={data.pushSubscription} tone="blue" />
          </div>

          <ListCard title="下周发布重点" items={data.weekFocus} tone="brand" />

          {data.nextWeek10 && data.nextWeek10.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold">下周 10 条内容建议</h2>
                <span className="text-xs text-slate-400">小红书 6 条 + 闲鱼 4 条</span>
              </div>
              <div className="card-body overflow-x-auto">
                <table className="table min-w-[640px]">
                  <thead>
                    <tr>
                      <th className="w-20">平台</th>
                      <th className="w-20">时间</th>
                      <th className="w-28">类目</th>
                      <th>标题建议</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.nextWeek10.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <span
                            className={
                              r.platform === 'xiaohongshu'
                                ? 'badge-red'
                                : 'badge-yellow'
                            }
                          >
                            {PLATFORM_LABEL[r.platform] ?? r.platform}
                          </span>
                        </td>
                        <td className="font-mono">{r.time}</td>
                        <td>{r.category}</td>
                        <td>{r.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ListCard({
  title,
  items,
  tone = 'gray',
}: {
  title: string;
  items?: string[];
  tone?: 'gray' | 'green' | 'red' | 'yellow' | 'blue' | 'brand';
}) {
  const cls: Record<string, string> = {
    gray: 'badge-gray',
    green: 'badge-green',
    red: 'badge-red',
    yellow: 'badge-yellow',
    blue: 'badge-blue',
    brand: 'badge-blue',
  };
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="card-body">
        {items && items.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {items.map((it, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={cls[tone] + ' mt-0.5'}>{i + 1}</span>
                <span className="text-slate-700 dark:text-slate-200 flex-1">{it}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-slate-400">无</div>
        )}
      </div>
    </div>
  );
}
