import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, CircleDot, Radio } from 'lucide-react';

export interface CommandHeaderStat {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning' | 'info' | 'ai';
}

export interface CommandHeaderAction {
  href: string;
  label: string;
  icon?: ReactNode;
  primary?: boolean;
}

const toneClass: Record<NonNullable<CommandHeaderStat['tone']>, string> = {
  neutral: 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-300',
  info: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/50 dark:text-cyan-300',
  ai: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900/70 dark:bg-fuchsia-950/50 dark:text-fuchsia-300',
};

export default function CommandHeader({
  eyebrow,
  title,
  description,
  stats = [],
  actions = [],
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  stats?: CommandHeaderStat[];
  actions?: CommandHeaderAction[];
}) {
  return (
    <section className="command-header">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-200">
            <Radio className="h-3.5 w-3.5" aria-hidden />
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl font-black leading-tight text-white sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            {description}
          </p>
        )}
        {stats.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {stats.map((stat) => (
              <span
                key={`${stat.label}-${stat.value}`}
                className={`command-rail inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium ${toneClass[stat.tone ?? 'neutral']}`}
              >
                <CircleDot className="h-3 w-3" aria-hidden />
                <span className="text-current/70">{stat.label}</span>
                <span className="tabular-nums">{stat.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {actions.length > 0 && (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={
                action.primary
                  ? 'command-rail inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-50'
                  : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:border-cyan-300/60 hover:bg-white/10'
              }
            >
              {action.icon}
              {action.label}
              {!action.icon && <ArrowRight className="h-4 w-4" aria-hidden />}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
