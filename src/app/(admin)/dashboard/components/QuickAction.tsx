/**
 * v0.11 B3 · 快速操作大按钮
 */
'use client';

import Link from 'next/link';
import clsx from 'clsx';

export interface QuickActionProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  tone?: 'brand' | 'blue' | 'green' | 'purple';
}

const TONE_BORDER: Record<NonNullable<QuickActionProps['tone']>, string> = {
  brand: 'hover:border-brand-400 dark:hover:border-brand-600',
  blue: 'hover:border-blue-400 dark:hover:border-blue-600',
  green: 'hover:border-emerald-400 dark:hover:border-emerald-600',
  purple: 'hover:border-purple-400 dark:hover:border-purple-600',
};

const TONE_ICON: Record<NonNullable<QuickActionProps['tone']>, string> = {
  brand: 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  green:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  purple:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

export default function QuickAction({
  label,
  description,
  icon,
  href,
  tone = 'brand',
}: QuickActionProps) {
  return (
    <Link
      href={href}
      className={clsx(
        'group flex h-full items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4 transition-colors',
        'dark:border-slate-800 dark:bg-slate-900',
        TONE_BORDER[tone],
        'focus:outline-none focus:ring-2 focus:ring-brand-500',
      )}
    >
      <div
        className={clsx(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
          TONE_ICON[tone],
        )}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {label}
        </div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
          {description}
        </div>
      </div>
    </Link>
  );
}
