'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { History as HistoryIcon, Layers } from 'lucide-react';
import clsx from 'clsx';

/**
 * v0.11 B5 · /workspace tabs 容器（合并 /history + /assets）
 *
 * - tab=history (默认) 渲染 HistoryClient
 * - tab=assets         渲染 AssetsClient
 *
 * 同 /clients 模式：两面板同时挂载，切换走 hidden/show，保留各自 useState（搜索框、筛选）。
 */
export type WorkspaceTab = 'history' | 'assets';

const TABS: { value: WorkspaceTab; label: string; icon: typeof HistoryIcon }[] = [
  { value: 'history', label: '历史输出', icon: HistoryIcon },
  { value: 'assets', label: '素材库', icon: Layers },
];

export default function WorkspaceTabsShell({
  active,
  history,
  assets,
}: {
  active: WorkspaceTab;
  history: React.ReactNode;
  assets: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(tab: WorkspaceTab) {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (tab === 'history') sp.delete('tab');
    else sp.set('tab', tab);
    const qs = sp.toString();
    router.replace('/workspace' + (qs ? '?' + qs : ''));
  }

  return (
    <div className="space-y-3">
      <header className="page-hero">
        <h1>工作区</h1>
        <p>AI 输出历史 + 上传素材，统一管理。</p>
      </header>

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

      <div className={active === 'history' ? '' : 'hidden'}>{history}</div>
      <div className={active === 'assets' ? '' : 'hidden'}>{assets}</div>
    </div>
  );
}
