/**
 * v0.12 B5.1 · 移动端 NAV 4 分组组件（client component · 折叠 + localStorage 共享）
 *
 * 桌面 v0.12-b3.2 落地了 NAV_GROUPS（常用 / 资源 / 工具 / 系统 4 组），但移动端 /m/me 一直是
 * v0.11 B7 的 8 组手写清单（日常 / 生成 / 工作区 / 客户与报价 / 数据 / 资料库 / 综合工具 / 系统）。
 * 本组件把桌面 NAV_GROUPS 直接搬到移动端：
 *   - 同样的 4 组 emoji + label
 *   - 同样的 HIDDEN_NAV_HREFS 过滤（/clients /scripts /suggestions /analytics）
 *   - 同样的 localStorage key 前缀 `nav-collapsed-<slug>`（跨 desktop / mobile 共享一台设备的偏好）
 *
 * 单一数据源仍是 src/lib/constants.ts NAV_ITEMS / NAV_GROUPS / HIDDEN_NAV_HREFS。
 * 没有桌面 sidebar 折叠态（lg:w-14），所以这里没有 collapsed icon-only 分支。
 *
 * 移动端 href 加 /m 前缀策略：
 *   - 如果该 href 有对应 /m 子页（见 M_PATH_OVERRIDES + buildMHref 函数），跳 /m/<rest>
 *   - 否则保留桌面路径（middleware 会重定向到 /m，或者仍 200 显示桌面版）
 *   桌面专享的项（如 /create /workspace /presets /docs）走 ?desktop=1 由 middleware 处理。
 */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  NAV_ITEMS,
  NAV_GROUPS,
  HIDDEN_NAV_HREFS,
} from '@/lib/constants';

const NAV_GROUP_COLLAPSED_KEY = 'nav-collapsed'; // 与桌面 AdminShell.tsx 同名 · 完整 key: nav-collapsed-<slug>

/**
 * 桌面 href → 移动端对应路径映射。
 * - 有 m/<x>/page.tsx 的：直接 /m/<x>
 * - 没有 m 子页的（例如 /create /workspace /presets /docs /adapters /playground）：返回 null,
 *   组件渲染时把 link 改成 ?desktop=1（middleware 会写 view_mode=desktop cookie 然后跳同名桌面路径）+ ⤴ 桌面 badge
 * 单一数据源：见 recon §一 src/app/m/* 实际目录列表（22 个 m 子页）。
 */
const M_PATH_OVERRIDES: Record<string, string | null> = {
  '/dashboard': '/m', // 移动端的 dashboard 入口是 /m 本身
  '/today': '/m/today',
  '/calendar': '/m/calendar',
  '/playground': null, // 没 /m/playground
  '/calendar/today': '/m/calendar',
  '/keywords': '/m/keywords',
  '/scripts': '/m/scripts', // (B4.1 已 hidden 但 URL 保留)
  '/suggestions': '/m/suggestions', // (hidden)
  '/analytics': '/m/analytics', // (hidden)
  '/clients': '/m/clients', // (hidden)
  '/create': null, // /m/content + /m/image 拆分，没有合并的 m/create
  '/workspace': null, // 没 /m/workspace
  '/presets': '/m/presets',
  '/adapters': null, // 没 /m/adapters
  '/docs': null, // 没 /m/docs
  '/settings': '/m/settings',
};

function buildMHref(href: string): { mHref: string; desktopOnly: boolean } {
  const override = M_PATH_OVERRIDES[href];
  if (override === null) {
    // 桌面专享（无 m 子页）→ 走 ?desktop=1 让 middleware 写 view_mode=desktop cookie
    return { mHref: '?desktop=1', desktopOnly: true };
  }
  if (typeof override === 'string') {
    return { mHref: override, desktopOnly: false };
  }
  // 默认尝试 /m + href
  return { mHref: `/m${href}`, desktopOnly: false };
}

interface MobileNavGroupsProps {
  /** 当前 mobile 路径（pathname），用于高亮（暂未启用，保留扩展） */
  pathname?: string;
}

/** v0.12 B5.1 · 移动端 NAV 4 分组主组件 */
export default function MobileNavGroups({ pathname }: MobileNavGroupsProps) {
  return (
    <nav
      data-v012-b5-mobile-nav-groups
      aria-label="主导航 4 分组（移动端）"
      className="space-y-3"
    >
      {NAV_GROUPS.map((group) => {
        const items = group.hrefs
          .filter((h) => !HIDDEN_NAV_HREFS.has(h))
          .map((h) => NAV_ITEMS.find((i) => i.href === h))
          .filter((x): x is { href: string; label: string; hidden?: boolean } =>
            Boolean(x),
          );
        if (items.length === 0) return null;
        return (
          <NavGroupBlock
            key={group.slug}
            slug={group.slug}
            label={group.label}
            emoji={group.emoji}
            defaultCollapsed={group.defaultCollapsed}
            items={items}
            pathname={pathname}
          />
        );
      })}
    </nav>
  );
}

function NavGroupBlock({
  slug,
  label,
  emoji,
  defaultCollapsed,
  items,
  pathname,
}: {
  slug: 'core' | 'resources' | 'tools' | 'system';
  label: string;
  emoji: string;
  defaultCollapsed: boolean;
  items: { href: string; label: string }[];
  pathname?: string;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const storageKey = `${NAV_GROUP_COLLAPSED_KEY}-${slug}`;

  // hydrate 共享的 localStorage 偏好（与桌面 AdminShell 完全一致 key + 取值）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = window.localStorage.getItem(storageKey);
      if (v === '1') setOpen(false);
      else if (v === '0') setOpen(true);
    } catch {
      /* noop */
    }
  }, [storageKey]);

  function toggle() {
    setOpen((cur) => {
      const next = !cur;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(storageKey, next ? '0' : '1');
        }
      } catch {
        /* noop */
      }
      return next;
    });
  }

  return (
    <div data-nav-group={slug}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`mobile-nav-group-${slug}`}
        className="w-full flex items-center justify-between px-1 mb-1.5 text-xs text-slate-500 dark:text-slate-400"
      >
        <span className="flex items-center gap-1">
          <span aria-hidden>{emoji}</span>
          <span>{label}</span>
          <span className="text-[10px] opacity-50">({items.length})</span>
        </span>
        <span aria-hidden className="text-slate-400">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div
          id={`mobile-nav-group-${slug}`}
          className="rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800"
        >
          {items.map((it) => {
            const { mHref, desktopOnly } = buildMHref(it.href);
            const inner = (
              <div className="flex items-center justify-between px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800">
                <span className="text-sm text-slate-800 dark:text-slate-100">
                  {it.label}
                </span>
                <div className="flex items-center gap-2">
                  {desktopOnly && (
                    <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/40">
                      ⤴ 桌面
                    </span>
                  )}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-slate-400"
                    aria-hidden="true"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>
            );
            if (desktopOnly) {
              return (
                <a key={it.href} href={mHref} aria-label={`${it.label}（桌面版）`}>
                  {inner}
                </a>
              );
            }
            return (
              <Link key={it.href} href={mHref} aria-label={it.label}>
                {inner}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
