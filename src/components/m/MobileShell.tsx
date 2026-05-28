/**
 * 移动端壳层 shim：m/ 路由共用的最简外壳。
 * 历史 MobileShell 已被移除；这里提供一个透传容器，让 m/* 页面能正常渲染。
 */
"use client";

import type { ReactNode } from "react";

export default function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
      <div className="mx-auto w-full max-w-screen-sm px-3 py-3">{children}</div>
    </div>
  );
}
