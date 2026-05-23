/**
 * v0.11 B3 · 今日待办前 5 条
 *
 * 点击单条 → 跳 /today/?taskId=X
 */
'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { CheckSquare, ChevronRight } from 'lucide-react';
import type { TodayTaskItem } from '@/app/api/dashboard/summary/aggregate';

const PLATFORM_LABEL: Record<string, string> = {
  xiaohongshu: '小红书',
  xianyu: '闲鱼',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '待生成',
  generated: '已生成',
  published: '已发布',
  recapped: '已复盘',
};

const STATUS_TONE: Record<string, string> = {
  pending:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  generated:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  published:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  recapped:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

export interface TodayTasksListProps {
  items: TodayTaskItem[];
  todayLabel: string;
}

export default function TodayTasksList({
  items,
  todayLabel,
}: TodayTasksListProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <CheckSquare
            className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0"
            aria-hidden
          />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            今日待办（{todayLabel}）
          </h2>
        </div>
        <Link
          href="/today"
          className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 shrink-0"
        >
          全部 →
        </Link>
      </header>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            今天没有待办任务
          </li>
        ) : (
          items.map((t) => (
            <li key={t.id}>
              <Link
                href={`/today?taskId=${encodeURIComponent(t.id)}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
              >
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 w-12 shrink-0">
                  {t.publishTime}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-900 dark:text-slate-100">
                    {t.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>
                      {PLATFORM_LABEL[t.platform] ?? t.platform}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="truncate">{t.category}</span>
                    <span aria-hidden>·</span>
                    <span className="truncate">{t.contentType}</span>
                  </span>
                </span>
                <span
                  className={clsx(
                    'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                    STATUS_TONE[t.status] ??
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                  )}
                >
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
                <ChevronRight
                  className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0"
                  aria-hidden
                />
              </Link>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
