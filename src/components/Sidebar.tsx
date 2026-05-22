'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/constants';
import clsx from 'clsx';

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 bg-white border-r border-slate-200 flex-shrink-0 min-h-screen">
      <div className="px-5 py-5 border-b border-slate-200">
        <div className="text-sm text-slate-400">design-ai-ops</div>
        <div className="text-base font-semibold text-slate-800 leading-snug mt-1">
          平面设计接单
          <br />
          AI 运营工作台
        </div>
      </div>
      <nav className="py-3">
        {NAV_ITEMS.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + '/');
          return (
            <Link
              key={it.href}
              href={it.href}
              className={clsx(
                'block px-5 py-2 text-sm border-l-2',
                active
                  ? 'bg-brand-50 text-brand-700 border-brand-600 font-medium'
                  : 'text-slate-600 border-transparent hover:bg-slate-50',
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
