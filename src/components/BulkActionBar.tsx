'use client';

import React from 'react';
import { X } from 'lucide-react';

export interface BulkActionDef {
  key: string;
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  confirmText?: string;
  /** 触发时由父组件包装好的 handler */
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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 animate-slide-up pointer-events-none">
      <div className="pointer-events-auto bg-slate-900 dark:bg-slate-800 text-white shadow-xl rounded-full pl-4 pr-2 py-2 flex items-center gap-3 border border-slate-700">
        <span className="text-sm">
          已选 <span className="font-semibold">{count}</span> 项
        </span>
        <button
          onClick={onClear}
          className="text-xs text-slate-300 hover:text-white px-2 py-1 inline-flex items-center gap-1 rounded hover:bg-slate-700 transition-colors"
          aria-label="清除选择"
        >
          <X size={14} />
          清除
        </button>
        <div className="w-px h-6 bg-slate-600 mx-1" aria-hidden />
        <div className="flex items-center gap-1.5 flex-wrap">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={a.disabled}
              onClick={a.onClick}
              className={
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
                (a.destructive
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white')
              }
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
