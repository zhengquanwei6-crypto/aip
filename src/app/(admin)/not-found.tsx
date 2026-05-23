/**
 * /(admin)/not-found.tsx — Next.js 14 App Router 404 page (server component, no 'use client')
 *
 * 触发：在 admin 路由树内调用 notFound() 或访问不匹配的 admin 子路径时。
 *
 * v0.11 B4：补 §九 #7（缺 not-found.tsx）。brand 风格 + lucide Search 图标 + 回首页链接。
 */

import Link from 'next/link';
import { Search, Home } from 'lucide-react';

export default function AdminNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-3">
      <div className="card max-w-xl w-full">
        <div className="card-body flex flex-col items-center text-center gap-4 py-10">
          <div className="rounded-full bg-slate-100 dark:bg-slate-800 p-3 text-slate-500 dark:text-slate-400">
            <Search className="w-7 h-7" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              找不到这个页面
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              这个路径在工作台里不存在。可能链接拼错了，或者它已经被合并到别的地方。
            </p>
          </div>
          <Link
            href="/dashboard"
            className="btn-primary inline-flex items-center justify-center gap-1.5"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
