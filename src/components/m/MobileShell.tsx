"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Command, History, Image as ImageIcon, LayoutDashboard, Menu, Radio, Timer } from "lucide-react";

const NAV = [
  { href: "/m/dashboard", label: "控制台", icon: LayoutDashboard },
  { href: "/m/today", label: "任务", icon: Timer },
  { href: "/m/image", label: "创作", icon: ImageIcon },
  { href: "/m/history", label: "历史", icon: History },
  { href: "/m/me", label: "更多", icon: Menu },
];

export default function MobileShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" data-mobile-command>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(6,182,212,.22),transparent_34%),linear-gradient(90deg,rgba(255,255,255,.055)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:auto,28px_28px,28px_28px]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-screen-sm flex-col px-3 pb-24 pt-3">
        <header className="sticky top-0 z-30 -mx-3 border-b border-white/10 bg-slate-950/100 px-3 py-2 shadow-2xl shadow-slate-950/20 backdrop-blur">
          <div className="flex items-center justify-between">
            <Link href="/m/dashboard" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-950 shadow-lg shadow-cyan-950/25">
                <Command className="h-4 w-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold leading-none text-white">随身战情端</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                  <Radio className="h-3 w-3 text-emerald-500" aria-hidden />
                  创作 · 任务 · 资产
                </span>
              </span>
            </Link>
            <Link href="/dashboard" className="command-rail rounded-lg border border-white/10 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm">
              桌面版
            </Link>
          </div>
        </header>

        <main className="relative z-10 flex-1 py-3">
          <div key={pathname} className="page-transition">{children}</div>
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/102 px-2 pb-2 pt-1.5 shadow-2xl shadow-slate-950/30 backdrop-blur">
          <div className="mx-auto grid max-w-screen-sm grid-cols-5 gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "flex h-12 flex-col items-center justify-center rounded-lg border text-[11px] transition-all " +
                    (active
                      ? "border-cyan-300/50 bg-cyan-300/20 text-white shadow-lg shadow-cyan-950/20"
                      : "border-transparent text-slate-400 hover:-translate-y-0.5 hover:bg-white/10 hover:text-white")
                  }
                >
                  <Icon className="mb-0.5 h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
