'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Search, Trash2 } from 'lucide-react';

import BulkActionBar from './BulkActionBar';
import { useStickyState } from '@/hooks/useStickyState';

export interface SimpleListShellProps<T> {
  items: T[];
  getId: (item: T) => string;
  storageKey: string;
  searchKeys?: (keyof T | string)[];
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
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
    searchPlaceholder = '搜索...',
    toolbar,
    children,
    bulkDelete,
    onToastSuccess,
    onToastError,
  } = props;

  const [persist, setPersist] = useStickyState<{ q: string }>(storageKey, { q: '' });
  const q = persist.q || '';
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
    const needle = q.trim().toLowerCase();
    if (!needle || searchKeys.length === 0) return items;
    return items.filter((item) =>
      searchKeys.some((key) => {
        const raw = (item as Record<string, unknown>)[key as string];
        return raw != null && String(raw).toLowerCase().includes(needle);
      }),
    );
  }, [items, q, searchKeys]);

  useEffect(() => {
    if (selected.size === 0) return;
    const filteredIds = new Set(filtered.map(getId));
    let changed = false;
    const next = new Set<string>();
    for (const id of selected) {
      if (filteredIds.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const allIds = filtered.map(getId);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someChecked = !allChecked && allIds.some((id) => selected.has(id));

  function toggleAll() {
    if (allChecked) clearSelection();
    else setSelected(new Set(allIds));
  }

  async function runBulkDelete() {
    if (!bulkDelete || selected.size === 0 || running) return;
    const text =
      bulkDelete.confirmText?.(selected.size) ||
      `确认删除已选择的 ${selected.size} 条记录？此操作不可撤销。`;
    if (!window.confirm(text)) return;

    setRunning(true);
    try {
      const ids = Array.from(selected);
      const result = await bulkDelete.run(ids);
      if (result.ok) {
        onToastSuccess?.(result.message || `已删除 ${ids.length} 条`);
        clearSelection();
      } else {
        onToastError?.(result.message || '删除失败');
      }
    } catch (error) {
      onToastError?.((error as Error).message || '删除失败');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4 page-transition">
      <div className="command-toolbar detail-lift">
        {toolbar && <div className="mb-3 flex flex-wrap items-center gap-2">{toolbar}</div>}
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input command-input w-full pl-9"
            placeholder={searchPlaceholder}
            value={q}
            onChange={(event) => setPersist({ q: event.target.value })}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {bulkDelete && filtered.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="action-link text-slate-600 hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-cyan-950/30 dark:hover:text-cyan-200"
              aria-label="全选"
            >
              <span
                className={
                  'inline-flex h-4 w-4 items-center justify-center rounded border ' +
                  (allChecked
                    ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                    : someChecked
                      ? 'border-cyan-500 bg-cyan-500/50 text-white'
                      : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950')
                }
              >
                {allChecked ? <Check size={12} /> : someChecked ? <Minus size={12} /> : null}
              </span>
              {allChecked ? '取消全选' : '全选'}
            </button>
          )}
          <span>
            共 <b>{filtered.length}</b> 条
            {q ? `，搜索「${q}」` : ''}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="command-empty">
          {q ? '没有匹配的记录' : '暂无数据'}
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
