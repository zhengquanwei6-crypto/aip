'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  Home,
  CheckSquare,
  PencilLine,
  Image as ImageIcon,
  User,
  ChevronLeft,
} from 'lucide-react';
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

  /**
   * 桌面版按钮：
   * - 写 cookie view_mode=desktop（一年）
   * - 路径里去掉 /m 前缀（例如 /m/today → /today；/m → /dashboard）
   * - 用 router.push 跳过去；middleware 看到 cookie 后会放行
   */
  function switchToDesktop() {
    if (typeof document !== 'undefined') {
      const oneYear = 60 * 60 * 24 * 365;
      document.cookie = `view_mode=desktop; path=/; max-age=${oneYear}; SameSite=Lax`;
    }
    let target = pathname && pathname.startsWith('/m')
      ? pathname.replace(/^\/m(?=\/|$)/, '')
      : pathname;
    if (!target || target === '') target = '/dashboard';
    router.push(target);
  }

  return (
    <ToastProvider>
      {/* v0.11 B2: pb 含 safe-area-inset-bottom，避免 iPhone 全面屏 home indicator 盖住底栏 */}
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col pb-[calc(theme(spacing.16)+env(safe-area-inset-bottom))]">
        {/* 顶栏 */}
        <header className="h-12 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-3 flex items-center sticky top-0 z-30">
          {showBack ? (
            <button
              onClick={() => router.back()}
              className="-ml-1 w-9 h-9 flex items-center justify-center text-slate-700"
              aria-label="返回"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : (
            <div className="w-9" />
          )}
          <h1 className="flex-1 text-base font-semibold text-slate-800 dark:text-slate-100 text-center">
            {title}
          </h1>
          <ThemeToggle className="mr-1" />
          <button
            type="button"
            onClick={switchToDesktop}
            data-switch-desktop
            className="text-xs text-slate-400 px-2 hover:text-brand-600"
            aria-label="切到桌面版"
          >
            桌面版
          </button>
        </header>

        {/* 内容 */}
        <main className="flex-1 p-3 max-w-screen-sm w-full mx-auto">
          {children}
        </main>

        {/* v0.11 B2: 底部 Tab Bar 加 safe-area inner padding（h-14 视觉高度不变，padding 在内部，纯保护）  */}
        <nav className="fixed bottom-0 left-0 right-0 h-14 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 z-30 pb-[env(safe-area-inset-bottom)]">
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
  const color = active ? '#2563eb' : '#64748b';
  const common = {
    size: 22,
    color,
    strokeWidth: 2,
    'aria-hidden': true as const,
  };
  switch (name) {
    case 'home':
      return <Home {...common} />;
    case 'check':
      return <CheckSquare {...common} />;
    case 'edit':
      return <PencilLine {...common} />;
    case 'image':
      return <ImageIcon {...common} />;
    case 'user':
      return <User {...common} />;
    default:
      return null;
  }
}
