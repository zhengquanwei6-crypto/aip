'use client';

import type { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { History as HistoryIcon, Image as ImageIcon, Layers } from 'lucide-react';

export type WorkspaceTab = 'history' | 'assets' | 'imgbed';

const TABS: { value: WorkspaceTab; label: string; desc: string; icon: typeof HistoryIcon }[] = [
  { value: 'history', label: '历史输出', desc: '生成记录与完整输入输出', icon: HistoryIcon },
  { value: 'assets', label: '资产库', desc: '图片、收藏、分享与任务', icon: Layers },
  { value: 'imgbed', label: '图床', desc: '上传与短链分发', icon: ImageIcon },
];

export default function WorkspaceTabsShell({
  active,
  history,
  assets,
  imgbed,
}: {
  active: WorkspaceTab;
  history: ReactNode;
  assets: ReactNode;
  imgbed: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(tab: WorkspaceTab) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (tab === 'history') params.delete('tab');
    else params.set('tab', tab);
    const query = params.toString();
    router.replace(`/workspace${query ? `?${query}` : ''}`);
  }

  return (
    <div className="page-shell">
      <header className="command-panel p-5 sm:p-6">
        <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold text-cyan-200">
          <span className="pulse-dot" aria-hidden />
          Asset Operations
        </div>
        <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">工作区聚合</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          历史输出、资产库和图床短链集中在同一个资产作战台里，方便从生成结果继续进入复用、分享和发布任务。
        </p>
      </header>

      <nav className="grid gap-2 md:grid-cols-3" aria-label="工作区标签">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = active === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => go(tab.value)}
              aria-pressed={selected}
              className={
                'command-glass detail-lift flex items-start gap-3 p-3 text-left ' +
                (selected ? 'border-cyan-300 ring-2 ring-cyan-400/25 dark:border-cyan-800' : '')
              }
            >
              <span
                className={
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ' +
                  (selected
                    ? 'bg-cyan-400 text-slate-950'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300')
                }
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-slate-950 dark:text-slate-50">{tab.label}</span>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{tab.desc}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className={active === 'history' ? '' : 'hidden'}>{history}</div>
      <div className={active === 'assets' ? '' : 'hidden'}>{assets}</div>
      <div className={active === 'imgbed' ? '' : 'hidden'}>{imgbed}</div>
    </div>
  );
}
