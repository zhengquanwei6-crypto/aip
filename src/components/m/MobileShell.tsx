'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import ToastProvider from './Toast';
import ThemeToggle from '../ThemeToggle';

const TABS = [
  { href: '/m', label: '首页', icon: 'home' },
  { href: '/m/today', label: '任务', icon: 'check' },
  { href: '/m/content', label: '文案', icon: 'edit' },
  { href: '/m/image', label: '图片', icon: 'image' },
  { href: '/m/me', label: '我的', icon: 'user' },
] as const;

const TITLE_MAP: Record<string, string> = {
  '/m': '首页看板',
  '/m/today': '今日任务',
  '/m/calendar': '发布日历',
  '/m/content': '文案生成',
  '/m/image': '图片生成',
  '/m/assets': '素材库',
  '/m/keywords': '关键词库',
  '/m/pricing': '价格套餐',
  '/m/scripts': '私信话术',
  '/m/analytics': '数据复盘',
  '/m/suggestions': 'AI 建议',
  '/m/contents': '内容仓库',
  '/m/settings': '设置',
  '/m/me': '我的',
};

export default function MobileShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // 找最匹配的标题
  let title = '工作台';
  let bestLen = 0;
  for (const [k, v] of Object.entries(TITLE_MAP)) {
    if ((pathname === k || pathname.startsWith(k + '/')) && k.length > bestLen) {
      title = v;
      bestLen = k.length;
    }
  }

  const isTab = TABS.some((t) => t.href === pathname);
  const showBack = !isTab && pathname !== '/m';

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col pb-16">
        {/* 顶栏 */}
        <header className="h-12 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 flex items-center sticky top-0 z-30">
          {showBack ? (
            <button
              onClick={() => router.back()}
              className="-ml-1 w-9 h-9 flex items-center justify-center text-slate-700"
              aria-label="返回"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          ) : (
            <div className="w-9" />
          )}
          <h1 className="flex-1 text-base font-semibold text-slate-800 dark:text-slate-100 text-center">
            {title}
          </h1>
          <ThemeToggle className="mr-1" />
          <Link
            href="?desktop=1"
            prefetch={false}
            className="text-xs text-slate-400 px-2"
          >
            桌面版
          </Link>
        </header>

        {/* 内容 */}
        <main className="flex-1 p-3 max-w-screen-sm w-full mx-auto">
          {children}
        </main>

        {/* 底部 Tab Bar */}
        <nav className="fixed bottom-0 left-0 right-0 h-14 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 z-30">
          {TABS.map((t) => {
            const active = pathname === t.href || (t.href !== '/m' && pathname.startsWith(t.href));
            return (
              <Link
                key={t.href}
                href={t.href}
                className={clsx(
                  'flex flex-col items-center justify-center gap-0.5 text-[11px]',
                  active
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-500 dark:text-slate-400',
                )}
              >
                <TabIcon name={t.icon} active={active} />
                <span>{t.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </ToastProvider>
  );
}

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? '#2563eb' : '#64748b';
  const props = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M3 12l9-9 9 9" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case 'check':
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <polyline points="9 12 11 14 15 10" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...props}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      );
    case 'image':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case 'user':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a8 8 0 0116 0v1" />
        </svg>
      );
    default:
      return null;
  }
}
