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
      <header className="command-panel p-5 sm:p-6">
        <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold text-cyan-200">
          <span className="pulse-dot" aria-hidden />
          Search Command
        </div>
        <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">搜索指挥台</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          网络搜索调 Tavily + LLM 摘要；语义搜索查本地向量库，贯穿已索引的 AI 输出和素材。
        </p>
      </header>

      <div className="command-toolbar flex items-center gap-2 overflow-x-auto">
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
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                isActive
                  ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-slate-200 bg-white/70 text-slate-600 hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:border-cyan-800',
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
