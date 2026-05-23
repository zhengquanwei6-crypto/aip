'use client';

/**
 * /(admin)/error.tsx — Next.js 14 App Router error boundary (must be 'use client')
 *
 * 触发：(admin) 路由树内任意 page / layout / loading / route 抛出未捕获错误时挂载本页。
 * 设计：与 brand 风格一致；提供「重试」（reset()）+ 「回首页」两个动作。
 *
 * v0.11 B4：补 §九 #7（缺 error.tsx）。
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface AdminErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: AdminErrorProps) {
  useEffect(() => {
    // 仅 dev 时打到 console，方便排错；生产静默
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[admin error.tsx]', error);
    }
  }, [error]);

  const digest = error?.digest;

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-3">
      <div
        role="alert"
        aria-live="assertive"
        className="card max-w-xl w-full"
      >
        <div className="card-body flex flex-col items-center text-center gap-4 py-10">
          <div className="rounded-full bg-amber-100 dark:bg-amber-900/40 p-3 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-7 h-7" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              出错了，先稳住
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              这个页面没能正常渲染。先试试重新加载，或回到首页换条路。
            </p>
            {digest && (
              <p className="mt-2 text-[11px] text-slate-400 font-mono">
                digest: {digest}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => reset()}
              className="btn-primary inline-flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              重试
            </button>
            <Link
              href="/dashboard"
              className="btn-secondary inline-flex items-center justify-center gap-1.5"
            >
              <Home className="w-4 h-4" aria-hidden="true" />
              回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
