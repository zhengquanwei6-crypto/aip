/**
 * v0.11 B3 · 单个 KPI 小卡片
 * 用法：<KpiCard label="待办" value={12} icon={<CheckSquare/>} tone="amber" href="/today" />
 */
'use client';

import Link from 'next/link';
import clsx from 'clsx';

export type KpiTone =
  | 'amber'
  | 'blue'
  | 'green'
  | 'purple'
  | 'pink'
  | 'slate';

const TONE_CLASS: Record<KpiTone, string> = {
  amber: 'text-amber-600 dark:text-amber-400',
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-emerald-600 dark:text-emerald-400',
  purple: 'text-purple-600 dark:text-purple-400',
  pink: 'text-pink-600 dark:text-pink-400',
  slate: 'text-slate-700 dark:text-slate-200',
};

const TONE_BG: Record<KpiTone, string> = {
  amber: 'bg-amber-50 dark:bg-amber-900/20',
  blue: 'bg-blue-50 dark:bg-blue-900/20',
  green: 'bg-emerald-50 dark:bg-emerald-900/20',
  purple: 'bg-purple-50 dark:bg-purple-900/20',
  pink: 'bg-pink-50 dark:bg-pink-900/20',
  slate: 'bg-slate-100 dark:bg-slate-800/40',
};

export interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: KpiTone;
  href?: string;
  hint?: string;
}

export default function KpiCard({
  label,
  value,
  icon,
  tone = 'slate',
  href,
  hint,
}: KpiCardProps) {
  const inner = (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 sm:p-5 pt-5 sm:pt-6 dark:border-slate-800 dark:bg-slate-900 hover:border-brand-300 hover:shadow-md dark:hover:border-brand-700 transition-all">
      <div className={`kpi-bar-${tone}`} aria-hidden />
      <div className="flex items-center gap-2">
        <div
          className={clsx(
            'inline-flex h-8 w-8 items-center justify-center rounded-md',
            TONE_BG[tone],
            TONE_CLASS[tone],
          )}
          aria-hidden
        >
          {icon}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {label}
        </div>
      </div>
      <div
        className={clsx(
          'mt-2 text-2xl sm:text-3xl font-semibold tabular-nums',
          TONE_CLASS[tone],
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
          {hint}
        </div>
      ) : null}
    </div>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
