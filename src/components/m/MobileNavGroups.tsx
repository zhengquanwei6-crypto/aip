/**
 * MobileNavGroups · /m/me 上的"快速跳转"分组列表（shim 版）。
 * 数据源直接来自 @/lib/constants 的 NAV_ITEMS / NAV_GROUPS / HIDDEN_NAV_HREFS。
 * 折叠状态走 localStorage 'nav-collapsed-<slug>'，与桌面 AdminShell 同 key 共享。
 */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { NAV_GROUPS, NAV_ITEMS, HIDDEN_NAV_HREFS } from "@/lib/constants";

const KEY_PREFIX = "nav-collapsed-";

function NavGroup({
  slug,
  label,
  emoji,
  defaultCollapsed,
  hrefs,
}: {
  slug: string;
  label: string;
  emoji: string;
  defaultCollapsed: boolean;
  hrefs: string[];
}) {
  const items = hrefs
    .filter((h) => !HIDDEN_NAV_HREFS.has(h))
    .map((h) => NAV_ITEMS.find((i) => i.href === h))
    .filter((x): x is { href: string; label: string; hidden?: boolean } => Boolean(x));

  const [open, setOpen] = useState<boolean>(!defaultCollapsed);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(KEY_PREFIX + slug);
      if (v === "1") setOpen(false);
      else if (v === "0") setOpen(true);
    } catch {
      /* noop */
    }
  }, [slug]);

  function toggle() {
    setOpen((cur) => {
      const next = !cur;
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(KEY_PREFIX + slug, next ? "0" : "1");
        }
      } catch {
        /* noop */
      }
      return next;
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-200"
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden>{emoji}</span>
          <span>{label}</span>
          <span className="ml-1 text-[11px] text-slate-400 tabular-nums">
            {items.length}
          </span>
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <ul className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((it) => (
            <li key={it.href}>
              <Link
                href={it.href}
                className="block px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {it.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function MobileNavGroups() {
  return (
    <div className="space-y-3">
      {NAV_GROUPS.map((g) => (
        <NavGroup
          key={g.slug}
          slug={g.slug}
          label={g.label}
          emoji={g.emoji}
          defaultCollapsed={g.defaultCollapsed}
          hrefs={g.hrefs}
        />
      ))}
    </div>
  );
}
