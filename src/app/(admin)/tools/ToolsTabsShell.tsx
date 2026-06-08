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
      <header className="command-panel p-5 sm:p-6">
        <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold text-cyan-200">
          <span className="pulse-dot" aria-hidden />
          Utility Deck
        </div>
        <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">工具作战台</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          周报告和报价计算统一收纳，面向复盘、报价和经营动作。
        </p>
      </header>

      <div className="command-toolbar flex items-center gap-2 overflow-x-auto">
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
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                isActive
                  ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-slate-200 bg-white/70 text-slate-600 hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:border-cyan-800',
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
