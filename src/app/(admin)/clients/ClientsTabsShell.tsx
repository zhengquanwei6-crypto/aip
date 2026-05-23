'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Users, DollarSign } from 'lucide-react';
import clsx from 'clsx';

/**
 * v0.11 B5 · /clients tabs 容器（合并 /pricing → tab=pricing）
 *
 * - tab=list (默认) 渲染 ClientsClient
 * - tab=pricing 渲染 PricingClient + price-quoter agent launcher
 *
 * 选项卡切换基于 URL searchParam (`?tab=pricing`)，没有 SPA history 入侵 ——
 * 这样 /pricing → /clients?tab=pricing 的 redirect 拿到的就是「已经选中报价 tab」的页面。
 */
export type ClientsTab = 'list' | 'pricing';

const TABS: { value: ClientsTab; label: string; icon: typeof Users }[] = [
  { value: 'list', label: '客户列表', icon: Users },
  { value: 'pricing', label: '报价方案', icon: DollarSign },
];

export default function ClientsTabsShell({
  active,
  list,
  pricing,
}: {
  active: ClientsTab;
  list: React.ReactNode;
  pricing: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(tab: ClientsTab) {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (tab === 'list') sp.delete('tab');
    else sp.set('tab', tab);
    const qs = sp.toString();
    router.replace('/clients' + (qs ? '?' + qs : ''));
  }

  return (
    <div className="space-y-3">
      {/* tab bar */}
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

      {/* panels — 用 hidden 切换以保留两个面板的 useState（切回客户列表时不丢搜索框/筛选） */}
      <div className={active === 'list' ? '' : 'hidden'}>{list}</div>
      <div className={active === 'pricing' ? '' : 'hidden'}>{pricing}</div>
    </div>
  );
}
