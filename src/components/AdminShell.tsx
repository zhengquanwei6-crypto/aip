'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  Menu,
  X,
  PanelLeftClose,
  PanelLeft,
  Home,
  CheckSquare,
  Calendar,
  PencilLine,
  Image as ImageIcon,
  FolderOpen,
  Calculator,
  Users,
  Layers,
  Tags,
  DollarSign,
  MessageCircle,
  MessageSquare,
  SlidersHorizontal,
  Plug,
  BarChart3,
  ClipboardList,
  History as HistoryIcon,
  Sparkles,
  Lightbulb,
  Wrench,
  Briefcase,
  BookOpen,
  HelpCircle,
  Settings as SettingsIcon,
} from 'lucide-react';
import { NAV_ITEMS } from '@/lib/constants';
import ThemeToggle from './ThemeToggle';
import Breadcrumbs from './Breadcrumbs';

const SIDEBAR_COLLAPSED_KEY = 'sidebar:collapsed';

/**
 * NAV 路径 → lucide icon。
 * v0.11 B5：新增 /workspace（合并 history+assets）+ /tools（合并 weekly+calculator），
 * 旧 /history /assets /weekly-report /calculator /contents /pricing /prompts /suggestions
 * 仍保留映射以便深链可读到 breadcrumb / topbar 标题（NAV 不再列），即使从 NAV 移除也不影响 URL 可达。
 *
 * v0.11 B6：新增 /docs (BookOpen) — 内部使用手册 9 篇。
 *
 * v0.11 B8：新增 /playground (MessageSquare) — AI 对话三 tab 即时调用。
 */
function iconFor(href: string) {
  switch (href) {
    case '/dashboard':
      return Home;
    case '/today':
      return CheckSquare;
    case '/calendar':
      return Calendar;
    case '/content':
      return PencilLine;
    case '/image':
      return ImageIcon;
    case '/playground':
      return MessageSquare;
    case '/workspace':
      return Briefcase;
    case '/contents':
      return FolderOpen;
    case '/calculator':
      return Calculator;
    case '/clients':
      return Users;
    case '/assets':
      return Layers;
    case '/keywords':
      return Tags;
    case '/pricing':
      return DollarSign;
    case '/scripts':
      return MessageCircle;
    case '/presets':
      return SlidersHorizontal;
    case '/adapters':
      return Plug;
    case '/analytics':
      return BarChart3;
    case '/tools':
      return Wrench;
    case '/weekly-report':
      return ClipboardList;
    case '/history':
      return HistoryIcon;
    case '/prompts':
      return Sparkles;
    case '/suggestions':
      return Lightbulb;
    case '/docs':
      return BookOpen;
    case '/settings':
      return SettingsIcon;
    default:
      return Home;
  }
}

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // hydrate collapsed state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (v === '1') setCollapsed(true);
    } catch {
      /* noop */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(
            SIDEBAR_COLLAPSED_KEY,
            next ? '1' : '0',
          );
        }
      } catch {
        /* noop */
      }
      return next;
    });
  }

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
    // v0.11 B2: lg:items-start lets sticky aside align to top of flex container
    // (without explicit alignment, default `stretch` interferes with sticky positioning).
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 lg:flex lg:items-start">
      {/* v0.11 B2: 桌面 sidebar 自身 sticky+独立 scroll，修 22/22 sidebar drift */}
      <SidebarContent
        pathname={pathname}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        className={clsx(
          'hidden lg:sticky lg:top-0 lg:h-dvh lg:flex lg:flex-col lg:flex-shrink-0 lg:overflow-y-auto lg:border-r lg:border-slate-200 lg:bg-white dark:lg:bg-slate-900 dark:lg:border-slate-800 transition-[width] duration-200',
          collapsed ? 'lg:w-14' : 'lg:w-56',
        )}
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
          collapsed={false}
          onToggleCollapsed={toggleCollapsed}
          className={clsx(
            'absolute left-0 top-0 h-full w-64 bg-white dark:bg-slate-900 shadow-xl flex flex-col transform transition-transform duration-200',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
          onClickClose={() => setOpen(false)}
          mobile
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0 w-full">
        <header className="h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 flex items-center gap-3 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="lg:hidden -ml-1 inline-flex items-center justify-center w-9 h-9 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="打开菜单"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate shrink-0">
            {title}
          </h1>
          <div className="hidden md:flex flex-1 min-w-0 ml-2">
            <Breadcrumbs />
          </div>
          <div className="flex-1 md:hidden" />
          <Breadcrumbs className="md:hidden" />
          <ThemeToggle />
          <div className="hidden sm:block text-xs text-slate-400 shrink-0">
            个人本地工作台
          </div>
        </header>

        {/* v0.11 B2: 主区移除自身 padding，改由内层 max-w-[1400px] 包装统一 4K 屏幕宽度上限 + 24px gutter */}
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1400px] px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  className,
  onClickClose,
  collapsed,
  onToggleCollapsed,
  mobile,
}: {
  pathname: string;
  className?: string;
  onClickClose?: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobile?: boolean;
}) {
  return (
    <aside className={className}>
      <div
        className={clsx(
          'border-b border-slate-200 dark:border-slate-800 flex items-start justify-between',
          collapsed ? 'px-2 py-3' : 'px-5 py-5',
        )}
      >
        {collapsed ? (
          <div
            className="w-full text-center font-semibold text-brand-600 text-sm"
            title="design-ai-ops"
          >
            d.a.o
          </div>
        ) : (
          <div>
            <div className="text-sm text-slate-400">design-ai-ops</div>
            <div className="text-base font-semibold text-slate-800 dark:text-slate-100 leading-snug mt-1">
              平面设计接单
              <br />
              AI 运营工作台
            </div>
          </div>
        )}
        {onClickClose && (
          <button
            type="button"
            onClick={onClickClose}
            className="text-slate-400 hover:text-slate-700 -mr-1 -mt-1 p-1"
            aria-label="关闭菜单"
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        )}
      </div>
      <nav className="py-3 flex-1 overflow-y-auto" aria-label="primary">
        {NAV_ITEMS.map((it) => {
          const active =
            pathname === it.href || pathname.startsWith(it.href + '/');
          const Icon = iconFor(it.href);
          if (collapsed) {
            return (
              <Link
                key={it.href}
                href={it.href}
                title={it.label}
                aria-label={it.label}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex items-center justify-center mx-2 my-0.5 h-9 rounded text-sm',
                  active
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                <Icon size={16} aria-hidden="true" />
              </Link>
            );
          }
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 text-sm border-l-2',
                active
                  ? 'bg-brand-50 text-brand-700 border-brand-600 font-medium dark:bg-brand-900/30 dark:text-brand-300'
                  : 'text-slate-600 dark:text-slate-300 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800',
              )}
            >
              <Icon size={14} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{it.label}</span>
            </Link>
          );
        })}
      </nav>
      {/* v0.11 B6: 底部"?" 图标 → /docs 快速跳转使用手册（移动+桌面通用，折叠态也保留） */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-2 flex flex-col gap-1.5">
        <Link
          href="/docs"
          aria-label="使用手册"
          title="使用手册"
          data-docs-quicklink
          className={clsx(
            'inline-flex items-center justify-center gap-1.5 rounded text-xs text-slate-500 hover:text-brand-700 hover:bg-brand-50 dark:hover:bg-brand-900/20 dark:text-slate-400 dark:hover:text-brand-300 transition-colors',
            collapsed ? 'h-9' : 'h-8 px-2',
          )}
        >
          <HelpCircle size={14} aria-hidden="true" />
          {!collapsed && <span>使用手册</span>}
        </Link>
        {!mobile && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            data-sidebar-toggle
            className={clsx(
              'w-full inline-flex items-center justify-center gap-1.5 rounded text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 transition-colors',
              collapsed ? 'h-9' : 'h-8 px-2',
            )}
            aria-pressed={collapsed}
            aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
            title={collapsed ? '展开侧栏' : '折叠侧栏'}
          >
            {collapsed ? (
              <PanelLeft size={14} aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose size={14} aria-hidden="true" />
                <span>折叠侧栏</span>
              </>
            )}
          </button>
        )}
      </div>
    </aside>
  );
}
