'use client';

import { useState } from 'react';
import { PLATFORM_LABEL } from '@/lib/constants';
import { useToast } from '@/components/m/Toast';

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

export default function MSuggestionsClient({
  initial,
}: {
  initial: { suggestion: Suggestion; createdAt: string } | null;
}) {
  const toast = useToast();
  const [data, setData] = useState<Suggestion | null>(initial?.suggestion ?? null);
  const [createdAt, setCreatedAt] = useState<string | null>(
    initial?.createdAt ?? null,
  );
  const [loading, setLoading] = useState(false);

  async function regen() {
    setLoading(true);
    try {
      const res = await fetch('/api/suggestions/generate', { method: 'POST' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      setData(j.suggestion);
      setCreatedAt(new Date().toISOString());
      toast.show('已生成', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white border border-slate-200 p-3">
        <div className="text-xs text-slate-500">
          {createdAt
            ? `上次生成：${new Date(createdAt).toLocaleString('zh-CN')}`
            : '尚未生成'}
        </div>
        <button
          onClick={regen}
          disabled={loading}
          className="mt-2 w-full rounded-lg bg-brand-600 text-white font-medium py-3 disabled:opacity-60 active:bg-brand-700"
        >
          {loading ? '生成中（约30秒）...' : data ? '🔄 重新生成' : '🤖 生成 AI 建议'}
        </button>
      </div>

      {!data && !loading && (
        <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-400">
          基于近 7/30 天数据生成下周打法
        </div>
      )}

      {data && (
        <>
          {data.summary && (
            <Block title="📋 总体总结">
              <div className="whitespace-pre-wrap leading-relaxed text-sm">
                {data.summary}
              </div>
            </Block>
          )}
          <ListBlock title="🚀 继续放大" items={data.amplifyCategories} tone="green" />
          <ListBlock title="📉 减少发布" items={data.reduceCategories} tone="red" />
          <ListBlock title="✏️ 重写标题" items={data.rewriteTitles} tone="yellow" />
          <ListBlock title="🎨 重做首图" items={data.redoCovers} tone="yellow" />
          <ListBlock title="💰 可提价" items={data.raisePrice} tone="green" />
          <ListBlock title="📅 主推包月" items={data.pushSubscription} tone="blue" />
          <ListBlock title="🎯 下周重点" items={data.weekFocus} tone="brand" />

          {data.nextWeek10 && data.nextWeek10.length > 0 && (
            <Block title="📌 下周 10 条内容建议">
              <div className="space-y-2">
                {data.nextWeek10.map((r, i) => (
                  <div
                    key={i}
                    className="border-l-2 border-slate-200 pl-2 text-sm"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          r.platform === 'xiaohongshu'
                            ? 'badge-red'
                            : 'badge-yellow'
                        }
                      >
                        {PLATFORM_LABEL[r.platform] ?? r.platform}
                      </span>
                      <span className="font-mono text-slate-500">{r.time}</span>
                      <span className="text-slate-500">{r.category}</span>
                    </div>
                    <div className="mt-1 text-slate-800">{r.title}</div>
                  </div>
                ))}
              </div>
            </Block>
          )}
        </>
      )}
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 font-semibold text-sm">
        {title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function ListBlock({
  title,
  items,
  tone,
}: {
  title: string;
  items?: string[];
  tone: 'green' | 'red' | 'yellow' | 'blue' | 'brand';
}) {
  if (!items || items.length === 0) return null;
  const cls = {
    green: 'text-emerald-700',
    red: 'text-red-700',
    yellow: 'text-amber-700',
    blue: 'text-blue-700',
    brand: 'text-brand-700',
  }[tone];
  return (
    <Block title={title}>
      <ul className="space-y-1.5 text-sm">
        {items.map((it, i) => (
          <li key={i} className={cls}>
            {i + 1}. {it}
          </li>
        ))}
      </ul>
    </Block>
  );
}
