/**
 * v0.15 · 首页看板 · 推倒重做
 *
 * 用户原话：去掉多余无用的内容，仅保留有用的数据展示以及快捷入口。
 *
 * 留下：
 *   - 顶部 AI 搜（最高频入口）
 *   - 一行 4 个核心 KPI（待办 / 已生成 / 已发布 / AI 输出）
 *   - 4 个真正用得到的快捷入口（小红书 / 闲鱼 / 千牛 / 今日任务）
 *   - 今日任务前 5 条（预览，跳转 /today 处理）
 *
 * 删除：
 *   - 磁盘警告卡（移到 /settings）
 *   - 市场趋势卡
 *   - 系统健康 + 最近失败双卡
 *   - 最近 AI 输出卡（已在 /history 展示）
 *   - KPI section heading + 内容沉淀分组
 *   - 创作 / 看素材 等重复入口
 */
'use client';

import {
  CalendarCheck,
  CheckSquare,
  CheckCircle2,
  Send,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import KpiCard from './components/KpiCard';
import type { DashboardSummary } from '@/app/api/dashboard/summary/aggregate';

export interface DashboardClientProps {
  data: DashboardSummary;
}

export default function DashboardClient({ data }: DashboardClientProps) {
  const { today, kpi, todayTasks, system } = data;

  return (
    <div className="space-y-6" data-v015-dashboard>
      {/* v0.14 ui-1 hero - OLD 字段版 */}
      <section className="hero-bar p-5 sm:p-7 mb-6 sm:mb-8" aria-label="今日概览">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-medium text-brand-700 dark:text-brand-300 tracking-wide uppercase">
              {today.date} · {today.weekday}
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
              你好，今天有 <span className="hero-num-accent">{today.pendingTasksCount}</span> 个待办
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl">
              已生成 <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{kpi.generatedTasks}</span> 条 ·
              已发布 <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{kpi.publishedTasks}</span> 条 ·
              累计 AI 输出 <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{kpi.aioutputs}</span> 次
            </p>
          </div>
        </div>
      </section>

      {/* v0.14-z41: KEY pool 失败警告 banner */}
      {(system?.apiKeyPool?.llm?.lastError || system?.apiKeyPool?.image?.lastError) && (
        <section
          aria-label="API Key 警告"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5 mb-6 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <div className="flex items-start gap-3">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">
              ⚠️
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm sm:text-base font-semibold mb-1">API Key 池有失败</h3>
              {system.apiKeyPool.llm.lastError && (
                <div className="text-xs sm:text-sm">
                  <span className="font-medium">LLM</span>（{system.apiKeyPool.llm.active}/{system.apiKeyPool.llm.total} 可用）：
                  <span className="text-amber-700 dark:text-amber-300 break-all">{system.apiKeyPool.llm.lastError}</span>
                </div>
              )}
              {system.apiKeyPool.image.lastError && (
                <div className="text-xs sm:text-sm mt-1">
                  <span className="font-medium">IMAGE</span>（{system.apiKeyPool.image.active}/{system.apiKeyPool.image.total} 可用）：
                  <span className="text-amber-700 dark:text-amber-300 break-all">{system.apiKeyPool.image.lastError}</span>
                </div>
              )}
              <a href="/settings" className="inline-block mt-2 text-xs sm:text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline">
                去 /settings 查看 KEY 余额 / 切换备用 →
              </a>
            </div>
          </div>
        </section>
      )}

      {/* AI 搜 · 最高频入口 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const q = String(fd.get('q') || '').trim();
          if (q) window.location.href = `/search?q=${encodeURIComponent(q)}`;
        }}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex items-center gap-3"
      >
        <span className="text-2xl shrink-0" aria-hidden>🔍</span>
        <input
          name="q"
          className="flex-1 bg-transparent outline-none text-sm sm:text-base placeholder:text-slate-400 dark:placeholder:text-slate-500"
          placeholder="问点什么 · 例如「小红书今日平面设计类目最火的主题」"
        />
        <button type="submit" className="btn-primary text-sm shrink-0">
          搜索
        </button>
      </form>

      {/* 顶部欢迎条：日期 + 待办数量 */}
      <header className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 shrink-0"
            aria-hidden
          >
            <CalendarCheck className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
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
          <Link
            href="/today"
            className="text-xs sm:text-sm text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 shrink-0"
          >
            查看今日 <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* 4 个核心 KPI · 一排 */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
      </section>

      {/* 4 个快捷入口 · 直击工作场景 */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickLink
          href="/work/xiaohongshu"
          emoji="📕"
          title="小红书运营"
          desc="一键产 5 张同源笔记"
        />
        <QuickLink
          href="/work/xianyu"
          emoji="🐟"
          title="闲鱼运营"
          desc="主图 + 卖点详情图"
        />
        <QuickLink
          href="/work/qianniu"
          emoji="🐂"
          title="千牛运营"
          desc="主图 + 详情场景图"
        />
        <QuickLink
          href="/today"
          emoji="📋"
          title="今日任务"
          desc={`${today.pendingTasksCount} 条待办`}
        />
      </section>

      {/* 今日待办预览（前 5 条） */}
      {todayTasks.length > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              今日任务预览
            </h2>
            <Link
              href="/today"
              className="text-xs text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
            >
              全部 {todayTasks.length}+ 条 <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {todayTasks.slice(0, 5).map((t) => (
              <li
                key={t.id}
                className="px-4 sm:px-5 py-2.5 flex items-center gap-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <span className="font-mono text-xs text-slate-400 tabular-nums shrink-0 w-12">
                  {t.publishTime}
                </span>
                <span
                  className={
                    'badge text-[10px] shrink-0 ' +
                    (t.platform === 'xiaohongshu' ? 'badge-red' : 'badge-yellow')
                  }
                >
                  {t.platform === 'xiaohongshu' ? '小红书' : '闲鱼'}
                </span>
                <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-200">
                  {t.title}
                </span>
                <StatusDot status={t.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function QuickLink({
  href,
  emoji,
  title,
  desc,
}: {
  href: string;
  emoji: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-sm transition-all"
    >
      <div className="text-2xl mb-2" aria-hidden>
        {emoji}
      </div>
      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {title}
      </div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
        {desc}
        <ArrowRight
          size={12}
          aria-hidden="true"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>
    </Link>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    pending: { color: 'bg-slate-400', label: '未生成' },
    generated: { color: 'bg-blue-500', label: '已生成' },
    published: { color: 'bg-emerald-500', label: '已发布' },
    recapped: { color: 'bg-purple-500', label: '已复盘' },
  };
  const it = map[status] ?? { color: 'bg-slate-300', label: status };
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 shrink-0"
      title={it.label}
    >
      <span className={'inline-block w-1.5 h-1.5 rounded-full ' + it.color} aria-hidden />
      {it.label}
    </span>
  );
}
