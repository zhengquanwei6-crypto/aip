'use client';

/**
 * /m/error.tsx — 移动端 error boundary
 * v0.11 B4：补 §九 #7（移动端缺 error.tsx）
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface MErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MError({ error, reset }: MErrorProps) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[m error.tsx]', error);
    }
  }, [error]);

  const digest = error?.digest;

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div
        role="alert"
        aria-live="assertive"
        className="card w-full"
      >
        <div className="card-body flex flex-col items-center text-center gap-3 py-8">
          <div className="rounded-full bg-amber-100 dark:bg-amber-900/40 p-3 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              出错了
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              这个页面没能正常加载。重试看看。
            </p>
            {digest && (
              <p className="mt-1.5 text-[11px] text-slate-400 font-mono">
                digest: {digest}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 w-full">
            <button
              type="button"
              onClick={() => reset()}
              className="btn-primary inline-flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              重试
            </button>
            <Link
              href="/m"
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
