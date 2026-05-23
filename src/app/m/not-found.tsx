/**
 * /m/not-found.tsx — 移动端 404 page (server component)
 * v0.11 B4：补 §九 #7（移动端缺 not-found.tsx）
 */

import Link from 'next/link';
import { Search, Home } from 'lucide-react';

export default function MNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="card w-full">
        <div className="card-body flex flex-col items-center text-center gap-3 py-8">
          <div className="rounded-full bg-slate-100 dark:bg-slate-800 p-3 text-slate-500 dark:text-slate-400">
            <Search className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              找不到这个页面
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              这个路径不存在。回首页继续工作。
            </p>
          </div>
          <Link
            href="/m"
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
