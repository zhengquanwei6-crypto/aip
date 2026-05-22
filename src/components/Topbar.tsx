'use client';

export default function Topbar({ title }: { title: string }) {
  return (
    <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
      <h1 className="text-base font-semibold text-slate-800">{title}</h1>
      <div className="text-xs text-slate-400">个人本地工作台 · design-ai-ops</div>
    </header>
  );
}
