/**
 * /(admin)/loading.tsx — 路由切换时显示的 skeleton。
 * Next.js 14 自动只替换 children 区，sidebar/topbar 保持不动。
 */

export default function AdminLoading() {
  return (
    <div data-loading-skeleton className="space-y-3 animate-fade-in">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="card overflow-hidden"
          aria-hidden="true"
        >
          <div className="card-header">
            <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          </div>
          <div className="card-body space-y-2">
            <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
            <div className="h-3 w-5/6 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
          </div>
        </div>
      ))}
      <div className="text-center text-xs text-slate-400">页面加载中…</div>
    </div>
  );
}
