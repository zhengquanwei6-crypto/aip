import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, Radar } from 'lucide-react';

export default function EmptyActionState({
  title,
  description,
  actionHref,
  actionLabel,
  icon,
}: {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-action-state">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-white dark:text-slate-950">
        {icon ?? <Radar className="h-5 w-5" aria-hidden />}
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-950 dark:text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </p>
      <Link href={actionHref} className="btn-primary mt-5 gap-2">
        {actionLabel}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
