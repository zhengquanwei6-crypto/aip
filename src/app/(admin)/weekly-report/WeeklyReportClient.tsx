'use client';

import { useState } from 'react';
import { copyAll } from '@/lib/clipboard';
import type { WeeklyReport } from '@/lib/weekly';
import { PLATFORM_LABEL } from '@/lib/constants';

const METRIC_LABELS: Record<string, string> = {
  impressions: '曝光',
  messages: '私信',
  consultations: '咨询',
  orders: '成交',
  revenue: '金额',
  subscriptionLeads: '包月线索',
};

export default function WeeklyReportClient({
  initial,
}: {
  initial: WeeklyReport;
}) {
  const [report] = useState(initial);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<{
    summary: string;
    actions: string[];
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function showMsg(s: string) {
    setMsg(s);
    setTimeout(() => setMsg(null), 2000);
  }

  async function genAi() {
    setAiLoading(true);
    try {
      const res = await fetch('/api/weekly-report', { method: 'POST' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      setAiSummary(j.summary);
    } catch (e) {
      showMsg((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  }

  async function copyMd() {
    const res = await fetch('/api/weekly-report?format=md');
    const text = await res.text();
    const ok = await copyAll(text);
    showMsg(ok ? '已复制 Markdown' : '复制失败');
  }

  function downloadMd() {
    window.open('/api/weekly-report?format=md', '_blank');
  }

  const ws = report.weekStart.slice(0, 10);
  const we = report.weekEnd.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* 头 */}
      <div className="card">
        <div className="card-body flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs text-slate-500">周复盘</div>
            <h2 className="text-lg font-semibold mt-0.5">
              {ws} ~ {we}
            </h2>
            <div className="text-xs text-slate-500 mt-1">
              共 {report.metricCount} 条数据记录
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {msg && <span className="text-sm text-emerald-600">{msg}</span>}
            <button onClick={copyMd} className="btn-secondary text-sm">
              📋 复制 Markdown
            </button>
            <button onClick={downloadMd} className="btn-secondary text-sm">
              ⬇ 下载 .md
            </button>
            <button
              onClick={genAi}
              disabled={aiLoading}
              className="btn-primary text-sm"
            >
              {aiLoading ? 'AI 生成中...' : '🤖 AI 写下周建议'}
            </button>
          </div>
        </div>
      </div>

      {/* AI 建议 */}
      {aiSummary && (
        <div className="card border-brand-200 bg-brand-50">
          <div className="card-body">
            <div className="text-sm text-brand-700 font-semibold mb-2">
              AI 总结
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {aiSummary.summary}
            </p>
            <div className="mt-3 text-sm text-brand-700 font-semibold">
              下周 5 条行动建议
            </div>
            <ol className="mt-1 space-y-1.5">
              {aiSummary.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="badge-blue mt-0.5">{i + 1}</span>
                  <span className="flex-1">{a}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* 关键指标对比 */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">关键指标 vs 上周</h3>
        </div>
        <div className="card-body grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {(Object.keys(METRIC_LABELS) as (keyof typeof METRIC_LABELS)[]).map(
            (k) => {
              const t = (report.delta.thisWeek as any)[k];
              const l = (report.delta.lastWeek as any)[k];
              const d = (report.delta.delta as any)[k];
              return (
                <CompareCard
                  key={k}
                  label={METRIC_LABELS[k]}
                  thisVal={k === 'revenue' ? Math.round(t) : t}
                  lastVal={k === 'revenue' ? Math.round(l) : l}
                  delta={d}
                  prefix={k === 'revenue' ? '¥' : ''}
                />
              );
            },
          )}
        </div>
      </div>

      {/* 类目排行 + 平台对比 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">本周类目表现</h3>
          </div>
          <div className="card-body">
            <table className="table">
              <thead>
                <tr>
                  <th>类目</th>
                  <th className="text-right">成交</th>
                  <th className="text-right">金额</th>
                </tr>
              </thead>
              <tbody>
                {report.byCategory.map((c) => (
                  <tr key={c.category}>
                    <td>{c.category}</td>
                    <td className="text-right">{c.orders}</td>
                    <td className="text-right font-mono">
                      ¥{Math.round(c.revenue)}
                    </td>
                  </tr>
                ))}
                {report.byCategory.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-slate-400 py-4">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">本周平台对比</h3>
          </div>
          <div className="card-body">
            <table className="table">
              <thead>
                <tr>
                  <th>平台</th>
                  <th className="text-right">曝光</th>
                  <th className="text-right">成交</th>
                  <th className="text-right">金额</th>
                </tr>
              </thead>
              <tbody>
                {report.byPlatform.map((p) => (
                  <tr key={p.platform}>
                    <td>{PLATFORM_LABEL[p.platform] ?? p.platform}</td>
                    <td className="text-right">{p.impressions}</td>
                    <td className="text-right">{p.orders}</td>
                    <td className="text-right font-mono">
                      ¥{Math.round(p.revenue)}
                    </td>
                  </tr>
                ))}
                {report.byPlatform.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-slate-400 py-4">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 高/低表现榜 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TitleList
          title="🚀 本周高表现 Top 5"
          rows={report.topTitles}
          tone="green"
        />
        <TitleList
          title="📉 本周低表现 Bottom 5"
          rows={report.lowTitles}
          tone="red"
        />
      </div>
    </div>
  );
}

function CompareCard({
  label,
  thisVal,
  lastVal,
  delta,
  prefix = '',
}: {
  label: string;
  thisVal: number;
  lastVal: number;
  delta: number;
  prefix?: string;
}) {
  const tone = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-slate-400';
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '—';
  return (
    <div className="rounded-md border border-slate-200 p-3 bg-white">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-800 mt-1">
        {prefix}
        {thisVal}
      </div>
      <div className="text-xs text-slate-400 mt-1">
        上周 {prefix}
        {lastVal}
      </div>
      <div className={`text-xs mt-1 ${tone}`}>
        {arrow} {delta === 0 ? '持平' : `${Math.abs(delta)}%`}
      </div>
    </div>
  );
}

function TitleList({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: any[];
  tone: 'green' | 'red';
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="card-body">
        {rows.length === 0 ? (
          <div className="text-sm text-slate-400 py-4 text-center">暂无数据</div>
        ) : (
          <ol className="space-y-2 text-sm">
            {rows.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={
                    tone === 'green' ? 'badge-green' : 'badge-red'
                  }
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 truncate">
                    {r.title}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {PLATFORM_LABEL[r.platform] ?? r.platform} · 曝光{' '}
                    {r.impressions} · 成交 {r.orders} · ¥
                    {Math.round(r.revenue)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
