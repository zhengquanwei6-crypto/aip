'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { NAV_ITEMS } from '@/lib/constants';
import ThemeToggle from './ThemeToggle';

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const currentNav = NAV_ITEMS.find(
    (i) => pathname === i.href || pathname.startsWith(i.href + '/'),
  );
  const title = currentNav?.label ?? '平面设计接单 AI 运营工作台';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 lg:flex">
      <SidebarContent
        pathname={pathname}
        className="hidden lg:flex lg:flex-col lg:w-56 lg:flex-shrink-0 lg:border-r lg:border-slate-200 lg:bg-white dark:lg:bg-slate-900 dark:lg:border-slate-800"
      />

      <div
        className={clsx(
          'lg:hidden fixed inset-0 z-40 transition-opacity duration-200',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div
          className="absolute inset-0 bg-slate-900/50"
          onClick={() => setOpen(false)}
        />
        <SidebarContent
          pathname={pathname}
          className={clsx(
            'absolute left-0 top-0 h-full w-64 bg-white dark:bg-slate-900 shadow-xl flex flex-col transform transition-transform duration-200',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
          onClickClose={() => setOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 flex items-center gap-3 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="lg:hidden -ml-1 inline-flex items-center justify-center w-9 h-9 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="打开菜单"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate flex-1">
            {title}
          </h1>
          <ThemeToggle />
          <div className="hidden sm:block text-xs text-slate-400 shrink-0">
            个人本地工作台
          </div>
        </header>

        <main className="p-3 sm:p-4 lg:p-6 flex-1">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  className,
  onClickClose,
}: {
  pathname: string;
  className?: string;
  onClickClose?: () => void;
}) {
  return (
    <aside className={className}>
      <div className="px-5 py-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between">
        <div>
          <div className="text-sm text-slate-400">design-ai-ops</div>
          <div className="text-base font-semibold text-slate-800 dark:text-slate-100 leading-snug mt-1">
            平面设计接单
            <br />
            AI 运营工作台
          </div>
        </div>
        {onClickClose && (
          <button
            type="button"
            onClick={onClickClose}
            className="text-slate-400 hover:text-slate-700 -mr-1 -mt-1 p-1"
            aria-label="关闭菜单"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      <nav className="py-3 flex-1 overflow-y-auto">
        {NAV_ITEMS.map((it) => {
          const active =
            pathname === it.href || pathname.startsWith(it.href + '/');
          return (
            <Link
              key={it.href}
              href={it.href}
              className={clsx(
                'block px-5 py-2.5 text-sm border-l-2',
                active
                  ? 'bg-brand-50 text-brand-700 border-brand-600 font-medium dark:bg-brand-900/30 dark:text-brand-300'
                  : 'text-slate-600 dark:text-slate-300 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800',
              )}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
