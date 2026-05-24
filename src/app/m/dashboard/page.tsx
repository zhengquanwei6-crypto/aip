// v0.11 B11 · 移动端 dashboard 页面
//
// 修复 BUG-S5: 桌面 NAV 「dashboard」入口在移动端访问会 404。
// 复用 buildDashboardSummary() 数据源 + /api/market/trends 三平台快照。
// 0 LLM/IMAGE 消耗（仅 SSR 读 prisma + Setting 表）。

import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { buildDashboardSummary } from '@/app/api/dashboard/summary/aggregate';
import type {
  DashboardSummary,
  DashboardSummaryKpi,
  DashboardSummaryMarketTrends,
  DashboardSummarySystem,
  TodayTaskItem,
  RecentAIOutputItem,
} from '@/app/api/dashboard/summary/aggregate';

export const dynamic = 'force-dynamic';

const PLATFORM_LABELS: Record<string, { name: string; icon: string }> = {
  xiaohongshu: { name: '小红书', icon: '📕' },
  xianyu: { name: '闲鱼', icon: '🐟' },
  qianniu: { name: '千牛', icon: '🐂' },
};

const EMPTY_KPI: DashboardSummaryKpi = {
  pendingTasks: 0,
  generatedTasks: 0,
  publishedTasks: 0,
  aioutputs: 0,
  assets: 0,
  clients: 0,
};

export default async function MDashboardPage() {
  const summary: DashboardSummary | null = await buildDashboardSummary().catch(() => null);
  const kpi = summary?.kpi ?? EMPTY_KPI;
  const todayTasks: TodayTaskItem[] = summary?.todayTasks ?? [];
  const recentAIOutputs: RecentAIOutputItem[] = summary?.recentAIOutputs ?? [];
  const marketTrends: Partial<DashboardSummaryMarketTrends> = summary?.marketTrends ?? {};
  const system: DashboardSummarySystem | null = summary?.system ?? null;

  return (
    <div className="space-y-3 pb-20">
      {/* 顶部条 */}
      <div className="rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white p-4 shadow">
        <div className="text-xs opacity-80">📊 工作台 · 移动端</div>
        <div className="mt-1 font-semibold leading-snug">概览</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <Stat label="待办" value={kpi.pendingTasks} />
          <Stat label="已生成" value={kpi.generatedTasks} />
          <Stat label="资产" value={kpi.assets} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
          <Stat label="客户" value={kpi.clients} small />
          <Stat label="已发布" value={kpi.publishedTasks} small />
          <Stat label="AI 输出" value={kpi.aioutputs} small />
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="grid grid-cols-2 gap-3">
        <ActionCard href="/m/today" title="📋 今日任务" desc="查看 / 处理" color="bg-rose-50 text-rose-700 border-rose-200" />
        <ActionCard href="/m/content" title="✍️ 生成文案" desc="一键出稿" color="bg-emerald-50 text-emerald-700 border-emerald-200" />
        <ActionCard href="/m/image" title="🖼️ 生成图片" desc="i2i / 比例" color="bg-blue-50 text-blue-700 border-blue-200" />
        <ActionCard href="/m/history" title="📚 历史" desc="AI 输出 / 资产" color="bg-amber-50 text-amber-700 border-amber-200" />
      </div>

      {/* 市场趋势卡（B10 关键功能在移动端的精简版 · B10 followup #6） */}
      <div className="rounded-xl bg-white border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-1">
            📊 市场趋势
            <span className="text-[10px] text-slate-400 font-normal">三平台精选</span>
          </h3>
          <Link href="/m/me" className="text-xs text-brand-600 inline-flex items-center gap-0.5">
            桌面查看 <ExternalLink className="size-3" aria-hidden />
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {(['xiaohongshu', 'xianyu', 'qianniu'] as const).map((slug) => {
            const entry = marketTrends[slug];
            const info = entry?.info ?? null;
            const latest = entry?.latest ?? null;
            const labels = PLATFORM_LABELS[slug] ?? { name: slug, icon: '📊' };
            const top = (latest?.dataPoints ?? []).slice(0, 3);
            return (
              <div key={slug} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-medium">
                    {labels.icon} {labels.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {latest?.placeholder ? '📝 示例数据' : latest ? '✍️ 已写入' : '— 暂无'}
                  </div>
                </div>
                {info?.tagline && (
                  <div className="mt-1 text-[11px] text-slate-500 leading-relaxed">{info.tagline}</div>
                )}
                {top.length > 0 ? (
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {top.map((dp) => (
                      <div key={dp.key} className="rounded bg-white px-2 py-1.5 text-center">
                        <div className="text-[10px] text-slate-500 truncate">{dp.label}</div>
                        <div className="text-[12px] font-semibold mt-0.5">
                          {dp.value}
                          {dp.unit ? <span className="text-[9px] text-slate-400 ml-0.5">{dp.unit}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-slate-400">— 数据待填 —</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 今日任务摘要 */}
      <div className="rounded-xl bg-white border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">📋 今日任务</h3>
          <Link href="/m/today" className="text-xs text-brand-600 inline-flex items-center">
            全部 <ChevronRight className="size-3" aria-hidden />
          </Link>
        </div>
        {todayTasks.length === 0 ? (
          <div className="mt-2 text-xs text-slate-400">今日没有待办</div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {todayTasks.slice(0, 4).map((t) => (
              <li key={t.id} className="text-xs flex items-center justify-between bg-slate-50 rounded px-2 py-1.5">
                <span className="truncate flex-1 mr-2">
                  <span className="text-slate-400 mr-1">{t.publishTime}</span>
                  {t.title || '无主题'}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                    t.status === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : t.status === 'generated'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {t.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 最近 AI 输出 */}
      <div className="rounded-xl bg-white border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">📝 最近 AI 输出</h3>
          <Link href="/m/history" className="text-xs text-brand-600 inline-flex items-center">
            全部 <ChevronRight className="size-3" aria-hidden />
          </Link>
        </div>
        {recentAIOutputs.length === 0 ? (
          <div className="mt-2 text-xs text-slate-400">暂无</div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {recentAIOutputs.slice(0, 4).map((o) => (
              <li key={o.id} className="text-xs bg-slate-50 rounded px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{o.type}</span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(o.createdAt).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="mt-1 truncate text-slate-700">{o.summary || ''}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 系统状态 */}
      <div className="rounded-xl bg-white border border-slate-200 p-4">
        <h3 className="font-semibold">🩺 系统</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <SystemRow label="版本" value={system?.version ?? 'v0.11'} />
          <SystemRow
            label="apiKey 池"
            value={
              system?.apiKeyPool
                ? `LLM ${system.apiKeyPool.llm?.active ?? 0}/${system.apiKeyPool.llm?.total ?? 0}`
                : '—'
            }
          />
          <SystemRow label="docker" value={system?.containerStatus ?? 'unknown'} />
          <SystemRow label="agents" value={String(system?.agentRoutes ?? '—')} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: number | string; small?: boolean }) {
  return (
    <div>
      <div className={`font-semibold ${small ? 'text-base' : 'text-xl'}`}>{value}</div>
      <div className="text-[10px] opacity-80">{label}</div>
    </div>
  );
}

function ActionCard({
  href,
  title,
  desc,
  color,
}: {
  href: string;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border p-3 ${color} active:scale-[0.98] transition`}
    >
      <div className="font-semibold text-sm leading-tight">{title}</div>
      <div className="text-[11px] opacity-80 mt-1 leading-tight">{desc}</div>
    </Link>
  );
}

function SystemRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded px-2 py-1.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="font-medium text-slate-800 truncate">{value}</div>
    </div>
  );
}
