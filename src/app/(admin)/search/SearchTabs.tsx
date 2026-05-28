'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Globe, Database } from 'lucide-react';
import clsx from 'clsx';

export default function SearchTabs({
  mode,
  web,
  semantic,
}: {
  mode: 'web' | 'semantic';
  web: React.ReactNode;
  semantic: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(next: 'web' | 'semantic') {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (next === 'web') sp.delete('mode');
    else sp.set('mode', 'semantic');
    router.replace('/search' + (sp.toString() ? '?' + sp.toString() : ''));
  }

  return (
    <div className="space-y-3">
      <header className="page-hero">
        <h1>搜索</h1>
        <p>网络搜索调 Tavily + LLM 摘要；语义搜索查本地向量库（已索引的 AI 输出和素材）。</p>
      </header>

      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { v: 'web' as const, label: '网络搜索', icon: Globe },
          { v: 'semantic' as const, label: '语义检索', icon: Database },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = mode === t.v;
          return (
            <button
              key={t.v}
              type="button"
              onClick={() => go(t.v)}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-brand-600 text-brand-700 dark:text-brand-300 font-medium'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200',
              )}
            >
              <Icon size={14} aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className={mode === 'web' ? '' : 'hidden'}>{web}</div>
      <div className={mode === 'semantic' ? '' : 'hidden'}>{semantic}</div>
    </div>
  );
}
