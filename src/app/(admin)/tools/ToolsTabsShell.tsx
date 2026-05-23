'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Calculator } from 'lucide-react';
import clsx from 'clsx';

/**
 * v0.11 B5 · /tools tabs 容器（合并 /weekly-report + /calculator）
 *
 * - tab=weekly (默认) 渲染 WeeklyReportClient
 * - tab=calc          渲染 CalculatorClient
 */
export type ToolsTab = 'weekly' | 'calc';

const TABS: { value: ToolsTab; label: string; icon: typeof ClipboardList }[] = [
  { value: 'weekly', label: '周报告', icon: ClipboardList },
  { value: 'calc', label: '报价计算器', icon: Calculator },
];

export default function ToolsTabsShell({
  active,
  weekly,
  calc,
}: {
  active: ToolsTab;
  weekly: React.ReactNode;
  calc: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(tab: ToolsTab) {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (tab === 'weekly') sp.delete('tab');
    else sp.set('tab', tab);
    const qs = sp.toString();
    router.replace('/tools' + (qs ? '?' + qs : ''));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 -mt-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => go(t.value)}
              aria-pressed={isActive}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-brand-600 text-brand-700 font-medium dark:text-brand-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200',
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className={active === 'weekly' ? '' : 'hidden'}>{weekly}</div>
      <div className={active === 'calc' ? '' : 'hidden'}>{calc}</div>
    </div>
  );
}
