import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Server,
  TrendingUp,
  Users,
} from 'lucide-react';

import { buildDashboardSummary } from '@/app/api/dashboard/summary/aggregate';
import type {
  DashboardSummary,
  DashboardSummaryKpi,
  DashboardSummaryMarketTrends,
  DashboardSummarySystem,
  RecentAIOutputItem,
  TodayTaskItem,
} from '@/app/api/dashboard/summary/aggregate';

export const dynamic = 'force-dynamic';

const PLATFORM_LABELS: Record<string, string> = {
  xiaohongshu: '小红书',
  xianyu: '闲鱼',
  qianniu: '千牛',
};

const EMPTY_KPI: DashboardSummaryKpi = {
  pendingTasks: 0,
  generatedTasks: 0,
  publishedTasks: 0,
  aioutputs: 0,
  assets: 0,
  clients: 0,
};

const STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  generated: '已生成',
  published: '已发布',
};

export default async function MDashboardPage() {
  const summary: DashboardSummary | null = await buildDashboardSummary().catch(() => null);
  const kpi = summary?.kpi ?? EMPTY_KPI;
  const todayTasks: TodayTaskItem[] = summary?.todayTasks ?? [];
  const recentAIOutputs: RecentAIOutputItem[] = summary?.recentAIOutputs ?? [];
  const marketTrends: Partial<DashboardSummaryMarketTrends> = summary?.marketTrends ?? {};
  const system: DashboardSummarySystem | null = summary?.system ?? null;

  return (
    <div className="space-y-4">
      <section className="command-panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-cyan-200">AIP Mobile Command</div>
            <h1 className="mt-2 text-2xl font-semibold leading-tight">控制台总览</h1>
            <p className="mt-2 text-sm leading-5 text-slate-300">
              任务、资产、输出和系统状态压缩到一个手机屏幕里，适合快速巡检和即时处理。
            </p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-cyan-100">
            healthy
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <HeroStat label="待办" value={kpi.pendingTasks} />
          <HeroStat label="资产" value={kpi.assets} />
          <HeroStat label="输出" value={kpi.aioutputs} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <QuickAction href="/m/today" icon={<ClipboardList className="h-4 w-4" />} title="今日任务" desc="排程与发布" />
        <QuickAction href="/m/image" icon={<ImageIcon className="h-4 w-4" />} title="图片创作" desc="生成与编辑" />
        <QuickAction href="/m/history" icon={<History className="h-4 w-4" />} title="历史输出" desc="复用结果" />
        <QuickAction href="/m/assets" icon={<Layers className="h-4 w-4" />} title="资产库" desc="素材与分享" />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Metric icon={<CheckCircle2 className="h-4 w-4" />} label="已生成任务" value={kpi.generatedTasks} />
        <Metric icon={<Users className="h-4 w-4" />} label="客户数" value={kpi.clients} />
        <Metric icon={<FileText className="h-4 w-4" />} label="已发布" value={kpi.publishedTasks} />
        <Metric icon={<Activity className="h-4 w-4" />} label="Agent 路由" value={system?.agentRoutes ?? 0} />
      </section>

      <Panel title="市场趋势" href="/m/me" icon={<TrendingUp className="h-4 w-4" />}>
        <div className="space-y-2">
          {(['xiaohongshu', 'xianyu', 'qianniu'] as const).map((slug) => {
            const entry = marketTrends[slug];
            const latest = entry?.latest ?? null;
            const points = (latest?.dataPoints ?? []).slice(0, 3);
            return (
              <div key={slug} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{PLATFORM_LABELS[slug] ?? slug}</div>
                  <div className="text-[11px] text-slate-500">{latest?.placeholder ? '示例数据' : latest ? '已同步' : '暂无'}</div>
                </div>
                {points.length > 0 ? (
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {points.map((point) => (
                      <div key={point.key} className="rounded-md bg-white px-2 py-1.5 text-center dark:bg-slate-950">
                        <div className="truncate text-[10px] text-slate-500">{point.label}</div>
                        <div className="mt-0.5 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {point.value}
                          {point.unit ? <span className="ml-0.5 text-[9px] text-slate-400">{point.unit}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-slate-400">等待数据写入</div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="今日任务" href="/m/today" icon={<ClipboardList className="h-4 w-4" />}>
        {todayTasks.length === 0 ? (
          <EmptyText>今日没有待办任务</EmptyText>
        ) : (
          <div className="space-y-2">
            {todayTasks.slice(0, 4).map((task) => (
              <div key={task.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
                <div className="w-11 shrink-0 font-mono text-xs text-slate-400">{task.publishTime}</div>
                <div className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-200">{task.title || '无主题'}</div>
                <span className="rounded-md bg-white px-2 py-1 text-[11px] text-slate-500 dark:bg-slate-950">
                  {STATUS_LABEL[task.status] ?? task.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="最近输出" href="/m/history" icon={<FileText className="h-4 w-4" />}>
        {recentAIOutputs.length === 0 ? (
          <EmptyText>暂无 AI 输出</EmptyText>
        ) : (
          <div className="space-y-2">
            {recentAIOutputs.slice(0, 4).map((output) => (
              <div key={output.id} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md bg-white px-2 py-1 text-[11px] text-slate-500 dark:bg-slate-950">{output.type}</span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(output.createdAt).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-sm text-slate-700 dark:text-slate-300">{output.summary || '无摘要'}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <section className="grid grid-cols-2 gap-3">
        <SystemTile icon={<Server className="h-4 w-4" />} label="Docker" value={system?.containerStatus ?? 'unknown'} />
        <SystemTile
          icon={<KeyRound className="h-4 w-4" />}
          label="API Key 池"
          value={system?.apiKeyPool ? `LLM ${system.apiKeyPool.llm?.active ?? 0}/${system.apiKeyPool.llm?.total ?? 0}` : '未读取'}
        />
      </section>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-center">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-300">{label}</div>
    </div>
  );
}

function QuickAction({ href, icon, title, desc }: { href: string; icon: ReactNode; title: string; desc: string }) {
  return (
    <Link href={href} className="surface flex items-center gap-3 p-3 transition-transform active:scale-[0.98]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{desc}</span>
      </span>
    </Link>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <div className="surface p-3">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums text-slate-950 dark:text-slate-50">{value}</div>
    </div>
  );
}

function Panel({ title, href, icon, children }: { title: string; href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-slate-50">
          {icon}
          {title}
        </h2>
        <Link href={href} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
          查看
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {children}
    </section>
  );
}

function SystemTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="surface p-3">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-2 truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{value}</div>
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-400 dark:bg-slate-900">{children}</div>;
}
