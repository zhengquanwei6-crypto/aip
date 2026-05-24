/**
 * v0.11 B3 · Dashboard 客户端组件
 * v0.11 B10 · 加入第 5 区：市场趋势卡（MarketTrendsCard）
 * v0.11 B15.7 · 加 DiskWarningCard（顶部条件渲染 · BUG-L12 闭环）
 *
 * 4 区 + 第 5 区布局（max-w-[1400px] 由 B2 容器控制，本组件用 grid）：
 *   0)   B15.7 磁盘警告（仅 rootPercent ≥ 85% 时渲染 · 否则不占位）
 *   1) 顶部欢迎条（今日日期 / 周X / 待办数量）
 *   2) 6 KPI 小卡：待办 / 已生成 / 已发布 / AIOutput / 图片 / 客户
 *   3) 4 快速操作：新建任务 / 写文案 / 出图 / 全流程发布
 *   4-A) 左下：今日待办前 5 + 最近 5 条 AIOutput
 *   4-B) 右下：系统健康 + 最近失败
 *   5)   市场趋势（B10）：小红书 / 闲鱼 / 千牛 三 Tab + KPI + 编辑数据
 */
'use client';

import {
  CalendarCheck,
  CheckSquare,
  CheckCircle2,
  Send,
  Sparkles,
  Image as ImageIcon,
  Users,
  PencilLine,
  PlusCircle,
} from 'lucide-react';
import KpiCard from './components/KpiCard';
import QuickAction from './components/QuickAction';
import TodayTasksList from './components/TodayTasksList';
import RecentAIOutputs from './components/RecentAIOutputs';
import {
  SystemHealthCard,
  RecentFailuresCard,
} from './components/SystemHealthCard';
import MarketTrendsCard from './components/MarketTrendsCard';
import DiskWarningCard from './components/DiskWarningCard';
import type { DashboardSummary } from '@/app/api/dashboard/summary/aggregate';
import { PLATFORM_SLUGS } from '@/lib/market/types';

export interface DashboardClientProps {
  data: DashboardSummary;
}

export default function DashboardClient({ data }: DashboardClientProps) {
  const { today, kpi, todayTasks, recentAIOutputs, system, marketTrends, diskUsage } =
    data;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 0) v0.11 B15.7 磁盘警告（≥ 85% 才渲染） */}
      <DiskWarningCard diskUsage={diskUsage} />

      {/* 1) 顶部欢迎条 */}
      <header className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 shrink-0"
            aria-hidden
          >
            <CalendarCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
              今天 {today.date} · {today.weekday}
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              你有{' '}
              <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                {today.pendingTasksCount}
              </span>{' '}
              个待办任务
            </p>
          </div>
        </div>
      </header>

      {/* 2) 6 KPI 小卡 */}
      <section
        aria-labelledby="kpi-heading"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
      >
        <h2 id="kpi-heading" className="sr-only">
          关键指标
        </h2>
        <KpiCard
          label="待办"
          value={kpi.pendingTasks}
          icon={<CheckSquare className="h-4 w-4" />}
          tone="amber"
          href="/today"
        />
        <KpiCard
          label="已生成"
          value={kpi.generatedTasks}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="blue"
          href="/today"
        />
        <KpiCard
          label="已发布"
          value={kpi.publishedTasks}
          icon={<Send className="h-4 w-4" />}
          tone="green"
          href="/today"
        />
        <KpiCard
          label="AI 输出"
          value={kpi.aioutputs}
          icon={<Sparkles className="h-4 w-4" />}
          tone="purple"
          href="/history"
        />
        <KpiCard
          label="图片"
          value={kpi.assets}
          icon={<ImageIcon className="h-4 w-4" />}
          tone="pink"
          href="/assets"
        />
        <KpiCard
          label="客户"
          value={kpi.clients}
          icon={<Users className="h-4 w-4" />}
          tone="slate"
          href="/clients"
        />
      </section>

      {/* 3) 快速操作 */}
      <section
        aria-labelledby="quick-heading"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <h2 id="quick-heading" className="sr-only">
          快速操作
        </h2>
        <QuickAction
          label="新建任务"
          description="进入今日任务，安排新的发布计划"
          icon={<PlusCircle className="h-5 w-5" />}
          href="/today"
          tone="brand"
        />
        <QuickAction
          label="写文案"
          description="按平台/类目快速生成小红书或闲鱼文案"
          icon={<PencilLine className="h-5 w-5" />}
          href="/content"
          tone="blue"
        />
        <QuickAction
          label="出图"
          description="按预设风格批量生成封面图或商品首图"
          icon={<ImageIcon className="h-5 w-5" />}
          href="/image"
          tone="purple"
        />
        <QuickAction
          label="全流程发布"
          description="一键调用发布导演 Agent 串完文案+图片"
          icon={<Send className="h-5 w-5" />}
          href="/content"
          tone="green"
        />
      </section>

      {/* 4-A 左下：今日待办 + 最近 AIOutput */}
      <section
        aria-label="活动概览"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        <TodayTasksList
          items={todayTasks}
          todayLabel={`${today.date} ${today.weekday}`}
        />
        <RecentAIOutputs items={recentAIOutputs} />
      </section>

      {/* 4-B 右下：系统健康 + 最近失败 */}
      <section
        aria-label="系统状态"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        <SystemHealthCard system={system} />
        <RecentFailuresCard
          publishDirectorStats={system.publishDirectorStats}
          recentFailures={system.recentFailures}
        />
      </section>

      {/* 5) 市场趋势（v0.11 B10） */}
      {marketTrends ? (
        <MarketTrendsCard data={marketTrends} order={PLATFORM_SLUGS} />
      ) : null}
    </div>
  );
}
