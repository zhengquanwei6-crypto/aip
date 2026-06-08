import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';

export interface OpsRailStep {
  label: string;
  description?: string;
  href: string;
  value?: string | number;
  icon: LucideIcon;
  active?: boolean;
}

export default function OpsRail({ steps }: { steps: OpsRailStep[] }) {
  return (
    <div className="ops-rail">
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <Link
            key={step.href}
            href={step.href}
            className={`ops-rail-step ${step.active ? 'ops-rail-step-active' : ''}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              {index < steps.length - 1 && (
                <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden />
              )}
            </span>
            <span className="mt-3 block text-sm font-semibold text-slate-950 dark:text-white">
              {step.label}
            </span>
            {step.description && (
              <span className="mt-1 block min-h-[32px] text-xs leading-4 text-slate-500 dark:text-slate-400">
                {step.description}
              </span>
            )}
            {step.value !== undefined && (
              <span className="mt-3 inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-medium tabular-nums text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                {step.value}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
