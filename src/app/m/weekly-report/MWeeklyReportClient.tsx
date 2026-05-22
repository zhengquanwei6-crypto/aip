'use client';

import { useState } from 'react';
import { copyAll } from '@/lib/clipboard';
import { useToast } from '@/components/m/Toast';
import type { WeeklyReport } from '@/lib/weekly';
import { PLATFORM_LABEL } from '@/lib/constants';

const METRIC_LABELS: Record<string, string> = {
  impressions: '曝光',
  messages: '私信',
  consultations: '咨询',
  orders: '成交',
  revenue: '金额',
  subscriptionLeads: '包月',
};

export default function MWeeklyReportClient({
  initial,
}: {
  initial: WeeklyReport;
}) {
  const toast = useToast();
  const [report] = useState(initial);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<{
    summary: string;
    actions: string[];
  } | null>(null);

  async function genAi() {
    setAiLoading(true);
    try {
      const res = await fetch('/api/weekly-report', { method: 'POST' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      setAiSummary(j.summary);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setAiLoading(false);
    }
  }

  async function copyMd() {
    const res = await fetch('/api/weekly-report?format=md');
    const text = await res.text();
    const ok = await copyAll(text);
    toast.show(ok ? '已复制 Markdown' : '复制失败', ok ? 'success' : 'error');
  }

  const ws = report.weekStart.slice(0, 10);
  const we = report.weekEnd.slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white p-4">
        <div className="text-xs opacity-80">周复盘</div>
        <div className="text-base font-semibold mt-0.5">
          {ws} ~ {we}
        </div>
        <div className="text-xs opacity-80 mt-1">
          共 {report.metricCount} 条数据
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={genAi}
          disabled={aiLoading}
          className="rounded-lg bg-brand-600 text-white font-medium py-3 disabled:opacity-60 active:bg-brand-700"
        >
          {aiLoading ? 'AI 生成中...' : '🤖 AI 写下周建议'}
        </button>
        <button
          onClick={copyMd}
          className="rounded-lg border border-slate-300 text-slate-700 font-medium py-3 active:bg-slate-50"
        >
          📋 复制 Markdown
        </button>
      </div>

      {aiSummary && (
        <div className="rounded-xl bg-brand-50 border border-brand-200 p-3 space-y-2">
          <div className="text-sm font-semibold text-brand-700">AI 总结</div>
          <p className="text-sm text-slate-700 leading-relaxed">
            {aiSummary.summary}
          </p>
          <div className="text-sm font-semibold text-brand-700 pt-1">
            下周 5 条行动建议
          </div>
          <ol className="space-y-1.5 text-sm">
            {aiSummary.actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="badge-blue mt-0.5">{i + 1}</span>
                <span className="flex-1">{a}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="rounded-xl bg-white border border-slate-200 p-3">
        <h3 className="font-semibold text-sm mb-2">关键指标 vs 上周</h3>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(METRIC_LABELS) as (keyof typeof METRIC_LABELS)[]).map(
            (k) => {
              const t = (report.delta.thisWeek as any)[k];
              const l = (report.delta.lastWeek as any)[k];
              const d = (report.delta.delta as any)[k];
              const tone =
                d > 0
                  ? 'text-emerald-600'
                  : d < 0
                    ? 'text-red-600'
                    : 'text-slate-400';
              const arrow = d > 0 ? '↑' : d < 0 ? '↓' : '—';
              return (
                <div
                  key={k}
                  className="rounded-md border border-slate-200 p-2"
                >
                  <div className="text-[11px] text-slate-500">
                    {METRIC_LABELS[k]}
                  </div>
                  <div className="text-lg font-semibold mt-0.5">
                    {k === 'revenue' ? '¥' : ''}
                    {k === 'revenue' ? Math.round(t) : t}
                  </div>
                  <div className={'text-[11px] ' + tone}>
                    {arrow}{' '}
                    {d === 0 ? '持平' : `${Math.abs(d)}%`}
                  </div>
                </div>
              );
            },
          )}
        </div>
      </div>

      {report.byCategory.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 font-semibold text-sm">
            类目表现
          </div>
          <div className="divide-y divide-slate-100">
            {report.byCategory.map((c) => (
              <div
                key={c.category}
                className="px-3 py-2 flex items-center justify-between text-sm"
              >
                <span>{c.category}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{c.orders} 单</span>
                  <span className="font-mono text-rose-600">
                    ¥{Math.round(c.revenue)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.topTitles.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 font-semibold text-sm">
            🚀 本周高表现 Top 5
          </div>
          <ol className="p-3 space-y-2 text-sm">
            {report.topTitles.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="badge-green mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 truncate">
                    {r.title}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {PLATFORM_LABEL[r.platform] ?? r.platform} · 曝光{' '}
                    {r.impressions} · ¥{Math.round(r.revenue)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {report.lowTitles.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 font-semibold text-sm">
            📉 本周低表现 Bottom 5
          </div>
          <ol className="p-3 space-y-2 text-sm">
            {report.lowTitles.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="badge-red mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 truncate">
                    {r.title}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {PLATFORM_LABEL[r.platform] ?? r.platform} · 曝光{' '}
                    {r.impressions} · ¥{Math.round(r.revenue)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
