'use client';

import React from 'react';
import { X } from 'lucide-react';

export interface BulkActionDef {
  key: string;
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  confirmText?: string;
  onClick: () => void;
  disabled?: boolean;
}

export default function BulkActionBar({
  count,
  onClear,
  actions,
}: {
  count: number;
  onClear: () => void;
  actions: BulkActionDef[];
}) {
  if (count <= 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 animate-slide-up px-3 pointer-events-none">
      <div className="pointer-events-auto flex max-w-[calc(100vw-24px)] items-center gap-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white shadow-2xl shadow-slate-950/30">
        <span className="whitespace-nowrap text-sm">
          已选择 <span className="font-semibold tabular-nums">{count}</span> 项
        </span>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="清除选择"
        >
          <X size={14} />
          清除
        </button>
        <div className="h-6 w-px bg-slate-700" aria-hidden />
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={action.disabled}
              onClick={action.onClick}
              className={
                'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' +
                (action.destructive
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-white/10 text-white hover:bg-white/20')
              }
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
