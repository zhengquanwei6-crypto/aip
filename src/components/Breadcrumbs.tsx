'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/constants';

/**
 * 顶栏面包屑：把 /clients/abc123 解析成 [客户档案, 详情] 两段。
 * - 第一级用 NAV_ITEMS 找中文 label
 * - 第二级如果是 cuid（25 字符 a-z0-9）显示「详情」
 * - 最后一段加粗、其余半透明
 *
 * v0.12 B3.3：
 *   - /create?tab=content/image/publish 显示三级 [创作 → 文案/图片/全流程发布]
 *   - /clients?tab=pricing 也支持子级显示
 *   - /presets?tab=image/content/agent 也支持子级显示
 */

const TAB_LABEL: Record<string, Record<string, string>> = {
  '/create': {
    content: '文案',
    image: '图片',
    publish: '全流程发布',
  },
  '/clients': {
    pricing: '报价方案',
  },
  '/presets': {
    image: '图片模板',
    content: '文案模板',
    agent: 'Agent 模板',
  },
  '/workspace': {
    history: '历史输出',
    assets: '素材库',
  },
};

export default function Breadcrumbs({
  className = '',
}: {
  className?: string;
}) {
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  // 已知的二级路由名映射（如果有的话）
  const SECOND_LABEL: Record<string, string> = {
    new: '新建',
  };

  type Crumb = { href: string; label: string };
  const crumbs: Crumb[] = [];

  // 第一级
  const firstHref = '/' + parts[0];
  const navItem = NAV_ITEMS.find(
    (i) => i.href === firstHref || i.href === '/' + parts[0],
  );
  crumbs.push({
    href: firstHref,
    label: navItem?.label ?? parts[0],
  });

  // v0.12 B3.3 · 优先解析 ?tab=xxx 为子面包屑（如 /create?tab=content）
  const tabValue = searchParams?.get('tab');
  const tabMap = TAB_LABEL[firstHref];
  if (tabValue && tabMap && tabMap[tabValue]) {
    crumbs.push({
      href: `${firstHref}?tab=${tabValue}`,
      label: tabMap[tabValue],
    });
  } else if (parts.length >= 2) {
    // 第二级路径段（仅当没有 ?tab= 时）
    const seg = parts[1];
    const isCuid = /^c[a-z0-9]{24}$/i.test(seg) || /^[a-z0-9]{25}$/i.test(seg);
    const label = isCuid ? '详情' : SECOND_LABEL[seg] ?? seg;
    const href = '/' + parts.slice(0, 2).join('/');
    crumbs.push({ href, label });
  }

  return (
    <nav
      aria-label="breadcrumb"
      data-breadcrumb
      className={
        'breadcrumbs flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 ' +
        className
      }
    >
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={c.href} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight
                size={12}
                aria-hidden="true"
                className="text-slate-300 dark:text-slate-600"
              />
            )}
            {last ? (
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {c.label}
              </span>
            ) : (
              <Link
                href={c.href}
                className="opacity-70 hover:opacity-100 hover:text-brand-600"
              >
                {c.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
