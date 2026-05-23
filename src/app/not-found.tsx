/**
 * /app/not-found.tsx — root-level 404 page (server component)
 *
 * Next.js App Router 用此页面渲染所有未匹配路由的 404。
 * (admin)/not-found.tsx 与 m/not-found.tsx 只在各自路由树内部 notFound() 时生效；
 * 对于完全不匹配的路径（如 /xxx-not-exist），Next 会落到此根级 not-found。
 *
 * v0.11 B4：补 §九 #7（不存在的路径要渲染 brand 404 而不是 Next 默认页）。
 */

import Link from 'next/link';
import { Search, Home } from 'lucide-react';

export default function RootNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-10">
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
