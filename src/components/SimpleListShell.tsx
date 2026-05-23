'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Check, Minus, Trash2 } from 'lucide-react';
import BulkActionBar from './BulkActionBar';
import { useStickyState } from '@/hooks/useStickyState';

export interface SimpleListShellProps<T> {
  items: T[];
  getId: (item: T) => string;
  storageKey: string;
  searchKeys?: (keyof T | string)[];
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
  /** 把列表本体（已经过滤）渲染交给父组件，用以保留各页原有结构 */
  children: (filtered: T[], helpers: SimpleHelpers) => React.ReactNode;
  bulkDelete?: {
    label?: string;
    confirmText?: (n: number) => string;
    run: (ids: string[]) => Promise<{ ok: boolean; message?: string }>;
  };
  onToastSuccess?: (msg: string) => void;
  onToastError?: (msg: string) => void;
}

export interface SimpleHelpers {
  selected: Set<string>;
  toggle: (id: string) => void;
  isSelected: (id: string) => boolean;
}

export default function SimpleListShell<T>(props: SimpleListShellProps<T>) {
  const {
    items,
    getId,
    storageKey,
    searchKeys = [],
    searchPlaceholder = '搜索…',
    toolbar,
    children,
    bulkDelete,
    onToastSuccess,
    onToastError,
  } = props;

  const [persist, setPersist] = useStickyState<{ q: string }>(storageKey, {
    q: '',
  });
  const q = persist.q || '';
  const setQ = (s: string) => setPersist({ q: s });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const filtered = useMemo(() => {
    if (!q.trim() || searchKeys.length === 0) return items;
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      for (const k of searchKeys) {
        const raw = (it as any)[k as string];
        if (raw == null) continue;
        if (String(raw).toLowerCase().includes(needle)) return true;
      }
      return false;
    });
  }, [items, q, searchKeys]);

  // 选中已被筛掉的，要清出
  useEffect(() => {
    if (selected.size === 0) return;
    const ids = new Set(filtered.map(getId));
    let changed = false;
    const next = new Set<string>();
    for (const id of selected) {
      if (ids.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const allIds = filtered.map(getId);
  const allChecked =
    allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someChecked = !allChecked && allIds.some((id) => selected.has(id));
  function toggleAll() {
    if (allChecked) {
      clearSelection();
    } else {
      setSelected(new Set(allIds));
    }
  }

  async function runBulkDelete() {
    if (!bulkDelete || selected.size === 0 || running) return;
    const text =
      (bulkDelete.confirmText && bulkDelete.confirmText(selected.size)) ||
      `确认删除已选 ${selected.size} 条记录？此操作不可撤销。`;
    if (!window.confirm(text)) return;
    setRunning(true);
    try {
      const ids = Array.from(selected);
      const r = await bulkDelete.run(ids);
      if (r.ok) {
        onToastSuccess?.(r.message || `已删除 ${ids.length} 条`);
        clearSelection();
      } else {
        onToastError?.(r.message || '删除失败');
      }
    } catch (e) {
      onToastError?.((e as Error).message || '删除失败');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body space-y-3">
          {toolbar && (
            <div className="flex items-center gap-2 flex-wrap">{toolbar}</div>
          )}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              className="input pl-9 w-full"
              placeholder={searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            {bulkDelete && filtered.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="全选"
              >
                <span
                  className={
                    'w-4 h-4 inline-flex items-center justify-center border rounded ' +
                    (allChecked
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : someChecked
                        ? 'bg-brand-600/40 border-brand-600 text-white'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800')
                  }
                >
                  {allChecked ? (
                    <Check size={12} />
                  ) : someChecked ? (
                    <Minus size={12} />
                  ) : null}
                </span>
                {allChecked ? '取消全选' : '全选'}
              </button>
            )}
            <span>
              共 <b>{filtered.length}</b> 条
              {q ? `（搜索 "${q}"）` : ''}
            </span>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body text-center text-sm text-slate-400 py-10">
            {q ? '没有匹配的记录' : '暂无数据'}
          </div>
        </div>
      ) : (
        children(filtered, {
          selected,
          toggle,
          isSelected: (id: string) => selected.has(id),
        })
      )}

      {bulkDelete && (
        <BulkActionBar
          count={selected.size}
          onClear={clearSelection}
          actions={[
            {
              key: 'delete',
              label: bulkDelete.label || '批量删除',
              icon: <Trash2 size={14} />,
              destructive: true,
              disabled: running,
              onClick: runBulkDelete,
            },
          ]}
        />
      )}
    </div>
  );
}
