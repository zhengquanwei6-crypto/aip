/**
 * v0.11 B3 · 系统健康卡（左侧）+ 最近失败卡（右侧）
 *
 * 注意：本组件包含两个并列卡片（系统健康 + 最近失败），
 * 在 DashboardClient 里以一对组件出现于「右下区」grid。
 */
'use client';

import clsx from 'clsx';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  KeyRound,
  Server,
} from 'lucide-react';
import type { DashboardSummarySystem } from '@/app/api/dashboard/summary/aggregate';

function formatUptime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

function formatBytes(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function PoolBadge({
  total,
  active,
}: {
  total: number;
  active: number;
}) {
  const ok = active > 0;
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        ok
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      )}
      title={ok ? '池中有可用 key' : '池中无可用 key'}
    >
      {active}/{total}
    </span>
  );
}

export interface SystemHealthCardProps {
  system: DashboardSummarySystem;
}

export function SystemHealthCard({ system }: SystemHealthCardProps) {
  const llm = system.apiKeyPool.llm;
  const image = system.apiKeyPool.image;
  const poolHealthy = llm.active > 0 && image.active > 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <Activity
            className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0"
            aria-hidden
          />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            系统健康
          </h2>
        </div>
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
            poolHealthy
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
          )}
        >
          <CheckCircle2 className="h-3 w-3" aria-hidden />
          {system.version}
        </span>
      </header>
      <dl className="grid grid-cols-1 sm:grid-cols-2 divide-y divide-slate-100 sm:divide-y-0 sm:divide-x dark:divide-slate-800">
        <div className="flex items-start gap-3 px-4 py-3">
          <Server
            className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <dt className="text-[11px] text-slate-500 dark:text-slate-400">
              进程运行时间
            </dt>
            <dd className="mt-0.5 text-sm text-slate-900 dark:text-slate-100">
              {formatUptime(system.uptimeMs)}
            </dd>
            <dd className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              容器：
              <span className="text-emerald-600 dark:text-emerald-400">
                {system.containerStatus}
              </span>
              {' · '}
              Agents：{system.agentRoutes}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-3 px-4 py-3">
          <Database
            className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <dt className="text-[11px] text-slate-500 dark:text-slate-400">
              SQLite 数据库
            </dt>
            <dd className="mt-0.5 text-sm text-slate-900 dark:text-slate-100">
              {formatBytes(system.dbSize)}
            </dd>
            <dd className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              发布导演 24h：成功 {system.publishDirectorStats.success}
              {' / '}
              失败 {system.publishDirectorStats.fail}
            </dd>
          </div>
        </div>
        <div className="sm:col-span-2 border-t border-slate-100 dark:border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <KeyRound
              className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0"
              aria-hidden
            />
            <dt className="text-[11px] text-slate-500 dark:text-slate-400">
              API Keys 池（v0.11 B1）
            </dt>
          </div>
          <dd className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  LLM
                </span>
                <PoolBadge total={llm.total} active={llm.active} />
              </div>
              {llm.lastError ? (
                <div
                  className="mt-1 truncate text-[11px] text-red-600 dark:text-red-400"
                  title={llm.lastError}
                >
                  最近错误：{llm.lastError}
                </div>
              ) : null}
            </div>
            <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  IMAGE
                </span>
                <PoolBadge total={image.total} active={image.active} />
              </div>
              {image.lastError ? (
                <div
                  className="mt-1 truncate text-[11px] text-red-600 dark:text-red-400"
                  title={image.lastError}
                >
                  最近错误：{image.lastError}
                </div>
              ) : null}
            </div>
          </dd>
        </div>
      </dl>
    </section>
  );
}

export interface RecentFailuresCardProps {
  publishDirectorStats: { total: number; success: number; fail: number };
  recentFailures: { llm: string | null; image: string | null };
}

export function RecentFailuresCard({
  publishDirectorStats,
  recentFailures,
}: RecentFailuresCardProps) {
  const hasFailure =
    publishDirectorStats.fail > 0 ||
    !!recentFailures.llm ||
    !!recentFailures.image;
  return (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle
            className={clsx(
              'h-4 w-4 shrink-0',
              hasFailure
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-400 dark:text-slate-500',
            )}
            aria-hidden
          />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            最近失败（24h）
          </h2>
        </div>
      </header>
      <div className="px-4 py-3 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 px-2 py-2">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              发布导演
            </div>
            <div className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {publishDirectorStats.total}
            </div>
          </div>
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-2 py-2">
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
              成功
            </div>
            <div className="mt-0.5 text-base font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
              {publishDirectorStats.success}
            </div>
          </div>
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 px-2 py-2">
            <div className="text-[11px] text-red-600 dark:text-red-400">
              失败
            </div>
            <div className="mt-0.5 text-base font-semibold text-red-700 dark:text-red-300 tabular-nums">
              {publishDirectorStats.fail}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              LLM 最近失败
            </div>
            <div
              className={clsx(
                'mt-0.5 text-xs leading-relaxed',
                recentFailures.llm
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-slate-400 dark:text-slate-500',
              )}
              title={recentFailures.llm ?? ''}
            >
              {recentFailures.llm ?? '无'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              IMAGE 最近失败
            </div>
            <div
              className={clsx(
                'mt-0.5 text-xs leading-relaxed',
                recentFailures.image
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-slate-400 dark:text-slate-500',
              )}
              title={recentFailures.image ?? ''}
            >
              {recentFailures.image ?? '无'}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
