'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Check, LayoutGrid, Minus, Search, Table2 } from 'lucide-react';

import BulkActionBar, { type BulkActionDef } from './BulkActionBar';
import { useStickyState } from '@/hooks/useStickyState';

export type ViewMode = 'card' | 'table';

export interface ListFilterDef<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  predicate: (item: T, value: string) => boolean;
}

export interface TableColumn<T> {
  key: string;
  label: string;
  width?: string;
  className?: string;
  render: (item: T) => React.ReactNode;
}

export interface RenderCtx {
  selected: boolean;
  toggle: () => void;
}

export interface BulkActionConfig<T> {
  key: string;
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  confirmText?: string;
  run: (selectedIds: string[], items: T[]) => Promise<{ ok: boolean; message?: string }>;
  clearOnDone?: boolean;
}

export interface ListShellProps<T> {
  items: T[];
  getId: (item: T) => string;
  title?: React.ReactNode;
  toolbar?: React.ReactNode;
  searchPlaceholder?: string;
  searchKeys?: (keyof T | string)[];
  filters?: ListFilterDef<T>[];
  viewModes?: ViewMode[];
  storageKey: string;
  bulk?: BulkActionConfig<T>[];
  renderCard?: (item: T, ctx: RenderCtx) => React.ReactNode;
  renderTableRow?: (item: T, ctx: RenderCtx) => React.ReactNode;
  tableColumns?: TableColumn<T>[];
  cardGridClassName?: string;
  emptyState?: React.ReactNode;
  emptyAfterFilterState?: React.ReactNode;
  pageSize?: number;
  onToastSuccess?: (msg: string) => void;
  onToastError?: (msg: string) => void;
}

interface PersistShape {
  view: ViewMode;
  filters: Record<string, string>;
  q: string;
  page: number;
}

export default function ListShell<T>(props: ListShellProps<T>) {
  const {
    items,
    getId,
    title,
    toolbar,
    searchPlaceholder = '搜索...',
    searchKeys = [],
    filters = [],
    viewModes = ['card'],
    storageKey,
    bulk = [],
    renderCard,
    renderTableRow,
    tableColumns,
    cardGridClassName = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3',
    emptyState,
    emptyAfterFilterState,
    pageSize,
    onToastSuccess,
    onToastError,
  } = props;

  const defaultPersist: PersistShape = useMemo(
    () => ({
      view: viewModes[0] ?? 'card',
      filters: Object.fromEntries(filters.map((filter) => [filter.key, ''])),
      q: '',
      page: 1,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [persist, setPersist] = useStickyState<PersistShape>(storageKey, defaultPersist);
  const view = persist.view;
  const filterValues = persist.filters || {};
  const q = persist.q || '';
  const page = persist.page || 1;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  const setView = (next: ViewMode) => setPersist((prev) => ({ ...prev, view: next }));
  const setFilter = (key: string, value: string) =>
    setPersist((prev) => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
      page: 1,
    }));
  const setQ = (value: string) => setPersist((prev) => ({ ...prev, q: value, page: 1 }));
  const setPage = (value: number) => setPersist((prev) => ({ ...prev, page: value }));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const filtered = useMemo(() => {
    let list = items.slice();
    for (const filter of filters) {
      const value = filterValues[filter.key];
      if (value) list = list.filter((item) => filter.predicate(item, value));
    }

    const needle = q.trim().toLowerCase();
    if (needle && searchKeys.length > 0) {
      list = list.filter((item) =>
        searchKeys.some((key) => {
          const raw = (item as Record<string, unknown>)[key as string];
          return raw != null && String(raw).toLowerCase().includes(needle);
        }),
      );
    }
    return list;
  }, [items, filters, filterValues, q, searchKeys]);

  useEffect(() => {
    if (selected.size === 0) return;
    const visibleIds = new Set(filtered.map(getId));
    let changed = false;
    const next = new Set<string>();
    for (const id of selected) {
      if (visibleIds.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const totalPages =
    pageSize && pageSize > 0 ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const safePage = Math.min(page, totalPages);
  const visible =
    pageSize && pageSize > 0
      ? filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
      : filtered;

  const allVisibleIds = visible.map(getId);
  const allChecked = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const someChecked = !allChecked && allVisibleIds.some((id) => selected.has(id));

  function toggleAll() {
    if (allChecked) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of allVisibleIds) next.delete(id);
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of allVisibleIds) next.add(id);
      return next;
    });
  }

  async function runBulk(action: BulkActionConfig<T>) {
    if (bulkRunning || selected.size === 0) return;
    if (action.destructive) {
      const text =
        action.confirmText ||
        `确认对已选择的 ${selected.size} 项执行「${action.label}」？此操作不可撤销。`;
      if (!window.confirm(text)) return;
    }

    setBulkRunning(true);
    try {
      const ids = Array.from(selected);
      const idSet = new Set(ids);
      const selectedItems = items.filter((item) => idSet.has(getId(item)));
      const result = await action.run(ids, selectedItems);
      if (result.ok) {
        onToastSuccess?.(result.message || `已完成「${action.label}」（${ids.length} 项）`);
        if (action.clearOnDone !== false) clearSelection();
      } else {
        onToastError?.(result.message || `「${action.label}」执行失败`);
      }
    } catch (error) {
      onToastError?.((error as Error).message || '操作失败');
    } finally {
      setBulkRunning(false);
    }
  }

  const showViewSwitch = viewModes.length > 1;
  const isFiltered =
    q.trim().length > 0 || Object.values(filterValues).some((value) => value && value.length > 0);

  return (
    <div className="space-y-4 page-transition">
      <div className="command-toolbar detail-lift">
        <div className="flex flex-wrap items-center gap-2">
          {title && <div className="mr-2 text-xs font-bold uppercase text-cyan-700 dark:text-cyan-300">{title}</div>}
          {toolbar}
          <div className="flex-1" />
          {showViewSwitch && (
            <div className="command-segment">
              {viewModes.includes('card') && (
                <button
                  type="button"
                  onClick={() => setView('card')}
                  aria-label="卡片视图"
                  className={
                    'command-segment-item ' +
                    (view === 'card'
                      ? 'command-segment-item-active'
                      : '')
                  }
                >
                  <LayoutGrid size={14} />
                  卡片
                </button>
              )}
              {viewModes.includes('table') && (
                <button
                  type="button"
                  onClick={() => setView('table')}
                  aria-label="表格视图"
                  className={
                    'command-segment-item ' +
                    (view === 'table'
                      ? 'command-segment-item-active'
                      : '')
                  }
                >
                  <Table2 size={14} />
                  表格
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="input command-input w-full pl-9"
              placeholder={searchPlaceholder}
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          {filters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {filters.map((filter) => (
                <select
                  key={filter.key}
                  className="input command-input w-auto min-w-[120px] py-1.5 text-sm"
                  value={filterValues[filter.key] ?? ''}
                  onChange={(event) => setFilter(filter.key, event.target.value)}
                  aria-label={filter.label}
                >
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {bulk.length > 0 && visible.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="action-link text-slate-600 hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-cyan-950/30 dark:hover:text-cyan-200"
              aria-label="选择本页"
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
              {allChecked ? '取消本页' : '选择本页'}
            </button>
          )}
          <span>
            共 <b>{filtered.length}</b> 项
            {pageSize && pageSize > 0 && filtered.length > pageSize ? (
              <>，第 {safePage} / {totalPages} 页</>
            ) : null}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="command-empty">
          {isFiltered ? emptyAfterFilterState ?? '没有匹配的内容' : emptyState ?? '暂无数据'}
        </div>
      ) : view === 'table' && (renderTableRow || tableColumns) ? (
        <div className="command-glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table command-table">
              <thead>
                <tr>
                  {bulk.length > 0 && <th className="w-10" />}
                  {tableColumns?.map((column) => (
                    <th
                      key={column.key}
                      className={column.className}
                      style={column.width ? { width: column.width } : undefined}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const id = getId(item);
                  const isSelected = selected.has(id);
                  const ctx: RenderCtx = { selected: isSelected, toggle: () => toggle(id) };
                  if (renderTableRow) {
                    return <React.Fragment key={id}>{renderTableRow(item, ctx)}</React.Fragment>;
                  }
                  return (
                    <tr
                      key={id}
                      className={isSelected ? 'bg-cyan-50 dark:bg-cyan-950/30' : ''}
                    >
                      {bulk.length > 0 && (
                        <td>
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggle(id)}
                            aria-label="选择行"
                          />
                        </td>
                      )}
                      {tableColumns?.map((column) => (
                        <td key={column.key} className={column.className}>
                          {column.render(item)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={cardGridClassName}>
          {visible.map((item) => {
            const id = getId(item);
            const isSelected = selected.has(id);
            const ctx: RenderCtx = { selected: isSelected, toggle: () => toggle(id) };
            return (
              <div key={id} className="relative detail-lift result-pop">
                {bulk.length > 0 && (
                  <label
                    className={
                      'absolute left-2 top-2 z-10 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border bg-white/100 shadow-sm transition-colors dark:bg-slate-950/100 ' +
                      (isSelected
                        ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                        : 'border-slate-300 hover:border-cyan-500 dark:border-slate-600')
                    }
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={isSelected}
                      onChange={() => toggle(id)}
                      aria-label="选择"
                    />
                    {isSelected && <Check size={14} />}
                  </label>
                )}
                <div className={isSelected ? 'rounded-lg ring-2 ring-cyan-500' : ''}>
                  {renderCard ? renderCard(item, ctx) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pageSize && pageSize > 0 && filtered.length > pageSize && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, safePage - 1))}
            disabled={safePage <= 1}
            className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-slate-500">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            disabled={safePage >= totalPages}
            className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      {bulk.length > 0 && (
        <BulkActionBar
          count={selected.size}
          onClear={clearSelection}
          actions={bulk.map(
            (action): BulkActionDef => ({
              key: action.key,
              label: action.label,
              icon: action.icon,
              destructive: action.destructive,
              disabled: bulkRunning,
              onClick: () => runBulk(action),
            }),
          )}
        />
      )}
    </div>
  );
}

export async function bulkSerial<R>(
  ids: string[],
  fn: (id: string) => Promise<R>,
  delayMs = 100,
): Promise<{ ok: number; failed: { id: string; error: string }[] }> {
  let ok = 0;
  const failed: { id: string; error: string }[] = [];
  for (let i = 0; i < ids.length; i++) {
    try {
      await fn(ids[i]);
      ok += 1;
    } catch (error) {
      failed.push({ id: ids[i], error: (error as Error).message });
    }
    if (i < ids.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { ok, failed };
}
