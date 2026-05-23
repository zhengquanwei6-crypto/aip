'use client';

// v0.11 B6 · /docs 左 ToC + 右内容布局
//   - sticky ToC（桌面侧栏 + 移动端顶部 select）
//   - active 高亮基于 props.activeSlug（由 server 传入，避免客户端 mismatch）
//   - 0 第三方 markdown 依赖（HTML 已在 server 渲染好，这里只放进 dangerouslySetInnerHTML）

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import clsx from 'clsx';
import { BookOpen, ChevronRight } from 'lucide-react';
import type { DocsEntry } from '@/lib/docs';

export default function DocsLayout({
  entries,
  active,
  html,
}: {
  entries: ReadonlyArray<DocsEntry>;
  active: DocsEntry;
  html: string;
}) {
  const selectId = useId();
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4 lg:gap-8">
      {/* 移动端：顶部下拉 */}
      <div className="lg:hidden">
        <label htmlFor={selectId} className="sr-only">
          选择手册章节
        </label>
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            使用手册
          </span>
        </div>
        <select
          id={selectId}
          value={active.slug}
          onChange={(e) => router.push(`/docs/${e.target.value}`)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
        >
          {entries.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.order}. {e.title}
            </option>
          ))}
        </select>
      </div>

      {/* 桌面端：sticky ToC */}
      <aside
        className="hidden lg:block self-start sticky top-[72px] max-h-[calc(100dvh-96px)] overflow-y-auto"
        aria-label="使用手册目录"
      >
        <div className="flex items-center gap-2 mb-3 px-2">
          <BookOpen className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            使用手册
          </span>
        </div>
        <nav className="space-y-0.5">
          {entries.map((e) => {
            const isActive = e.slug === active.slug;
            return (
              <Link
                key={e.slug}
                href={`/docs/${e.slug}`}
                aria-current={isActive ? 'page' : undefined}
                className={clsx(
                  'block rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 font-medium dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      'inline-flex w-5 h-5 items-center justify-center rounded text-[11px] font-mono',
                      isActive
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
                    )}
                    aria-hidden="true"
                  >
                    {e.order}
                  </span>
                  <span className="truncate">{e.title}</span>
                  {isActive && (
                    <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                </div>
                <div className="mt-0.5 ml-7 text-[11px] text-slate-400 dark:text-slate-500 line-clamp-2">
                  {e.description}
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* 右侧内容 */}
      <article
        className="min-w-0 max-w-3xl mx-auto lg:mx-0 lg:max-w-none w-full"
        aria-labelledby="doc-title"
      >
        <header className="mb-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">
            /docs/{active.slug}
          </div>
          <h1
            id="doc-title"
            className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50"
          >
            {active.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {active.description}
          </p>
        </header>

        {/* server 渲染好的 HTML — 内容均已 escape，参 src/lib/docs/render.ts */}
        <div
          className="docs-prose"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <footer className="mt-12 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
          <span>v0.11 内部使用手册 · 共 {entries.length} 篇</span>
          <Link
            href="/docs/01-quick-start"
            className="hover:text-brand-600 dark:hover:text-brand-400"
          >
            回到快速开始 ↑
          </Link>
        </footer>
      </article>
    </div>
  );
}
