'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, LayoutGrid, Table2, Check, Minus } from 'lucide-react';
import BulkActionBar, { type BulkActionDef } from './BulkActionBar';
import { useStickyState } from '@/hooks/useStickyState';

/* ---------------- Types ---------------- */

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
  /** 由 ListShell 调用，传入选中 ids 与对应的 items；返回 ok+message。 */
  run: (
    selectedIds: string[],
    items: T[],
  ) => Promise<{ ok: boolean; message?: string }>;
  /** 是否需要在结束后清除选择（默认 true） */
  clearOnDone?: boolean;
}

export interface ListShellProps<T> {
  items: T[];
  getId: (item: T) => string;
  // 顶部
  title?: React.ReactNode;
  toolbar?: React.ReactNode; // 左侧自定义按钮（如"新建"）
  searchPlaceholder?: string;
  searchKeys?: (keyof T | string)[];
  filters?: ListFilterDef<T>[];
  // 视图
  viewModes?: ViewMode[];
  storageKey: string;
  // 批量
  bulk?: BulkActionConfig<T>[];
  // 渲染
  renderCard?: (item: T, ctx: RenderCtx) => React.ReactNode;
  renderTableRow?: (item: T, ctx: RenderCtx) => React.ReactNode;
  tableColumns?: TableColumn<T>[];
  cardGridClassName?: string;
  emptyState?: React.ReactNode;
  emptyAfterFilterState?: React.ReactNode;
  // 分页
  pageSize?: number;
  // toast 反馈（可选回调）
  onToastSuccess?: (msg: string) => void;
  onToastError?: (msg: string) => void;
}

interface PersistShape {
  view: ViewMode;
  filters: Record<string, string>;
  q: string;
  page: number;
}

/* ---------------- Component ---------------- */

export default function ListShell<T>(props: ListShellProps<T>) {
  const {
    items,
    getId,
    title,
    toolbar,
    searchPlaceholder = '搜索…',
    searchKeys = [],
    filters = [],
    viewModes = ['card'],
    storageKey,
    bulk = [],
    renderCard,
    renderTableRow,
    tableColumns,
    cardGridClassName = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4',
    emptyState,
    emptyAfterFilterState,
    pageSize,
    onToastSuccess,
    onToastError,
  } = props;

  const defaultPersist: PersistShape = useMemo(
    () => ({
      view: viewModes[0] ?? 'card',
      filters: Object.fromEntries(filters.map((f) => [f.key, ''])),
      q: '',
      page: 1,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [persist, setPersist] = useStickyState<PersistShape>(
    storageKey,
    defaultPersist,
  );
  const view = persist.view;
  const filterValues = persist.filters || {};
  const q = persist.q || '';
  const page = persist.page || 1;

  const setView = (v: ViewMode) =>
    setPersist((p) => ({ ...p, view: v }));
  const setFilter = (key: string, value: string) =>
    setPersist((p) => ({
      ...p,
      filters: { ...p.filters, [key]: value },
      page: 1,
    }));
  const setQ = (s: string) =>
    setPersist((p) => ({ ...p, q: s, page: 1 }));
  const setPage = (n: number) =>
    setPersist((p) => ({ ...p, page: n }));

  /* 选择状态（不持久化） */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  /* 客户端筛选 + 搜索 */
  const filtered = useMemo(() => {
    let arr = items.slice();
    for (const f of filters) {
      const v = filterValues[f.key];
      if (v) {
        arr = arr.filter((it) => f.predicate(it, v));
      }
    }
    if (q.trim() && searchKeys.length > 0) {
      const needle = q.trim().toLowerCase();
      arr = arr.filter((it) => {
        for (const k of searchKeys) {
          const raw = (it as any)[k as string];
          if (raw == null) continue;
          if (String(raw).toLowerCase().includes(needle)) return true;
        }
        return false;
      });
    }
    return arr;
  }, [items, filters, filterValues, q, searchKeys]);

  /* 选中已被筛掉的项要清出 selection，避免幽灵选项 */
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

  /* 分页 */
  const totalPages =
    pageSize && pageSize > 0 ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const safePage = Math.min(page, totalPages);
  const visible =
    pageSize && pageSize > 0
      ? filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
      : filtered;

  /* 全选状态 */
  const allVisibleIds = visible.map(getId);
  const allChecked =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const someChecked = !allChecked && allVisibleIds.some((id) => selected.has(id));
  function toggleAll() {
    if (allChecked) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of allVisibleIds) next.delete(id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of allVisibleIds) next.add(id);
        return next;
      });
    }
  }

  /* Bulk 触发 */
  async function runBulk(b: BulkActionConfig<T>) {
    if (bulkRunning) return;
    if (selected.size === 0) return;
    if (b.destructive) {
      const text = b.confirmText || `确认对已选 ${selected.size} 项执行「${b.label}」？此操作不可撤销。`;
      if (!window.confirm(text)) return;
    }
    setBulkRunning(true);
    try {
      const ids = Array.from(selected);
      const idSet = new Set(ids);
      const list = items.filter((it) => idSet.has(getId(it)));
      const r = await b.run(ids, list);
      if (r.ok) {
        onToastSuccess?.(r.message || `已完成「${b.label}」（${ids.length} 项）`);
        if (b.clearOnDone !== false) clearSelection();
      } else {
        onToastError?.(r.message || `「${b.label}」失败`);
      }
    } catch (e) {
      onToastError?.((e as Error).message || '操作失败');
    } finally {
      setBulkRunning(false);
    }
  }

  /* ---------------- Render ---------------- */

  const showViewSwitch = viewModes.length > 1;

  const isFiltered =
    q.trim().length > 0 ||
    Object.values(filterValues).some((v) => v && v.length > 0);

  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <div className="card">
        <div className="card-body space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {title && (
              <div className="font-semibold text-slate-800 dark:text-slate-100 mr-2">
                {title}
              </div>
            )}
            {toolbar}
            <div className="flex-1" />
            {showViewSwitch && (
              <div className="inline-flex border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
                {viewModes.includes('card') && (
                  <button
                    type="button"
                    onClick={() => setView('card')}
                    aria-label="卡片视图"
                    className={
                      'px-2.5 py-1.5 text-sm inline-flex items-center gap-1 ' +
                      (view === 'card'
                        ? 'bg-brand-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700')
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
                      'px-2.5 py-1.5 text-sm inline-flex items-center gap-1 ' +
                      (view === 'table'
                        ? 'bg-brand-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700')
                    }
                  >
                    <Table2 size={14} />
                    表格
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center">
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
            {filters.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {filters.map((f) => (
                  <select
                    key={f.key}
                    className="input text-sm py-1.5 w-auto min-w-[100px]"
                    value={filterValues[f.key] ?? ''}
                    onChange={(e) => setFilter(f.key, e.target.value)}
                    aria-label={f.label}
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            {bulk.length > 0 && visible.length > 0 && (
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
                {allChecked ? '取消全选' : '全选本页'}
              </button>
            )}
            <span>
              共 <b>{filtered.length}</b> 条
              {pageSize && pageSize > 0 && filtered.length > pageSize ? (
                <>
                  {' '}
                  · 第 {safePage}/{totalPages} 页
                </>
              ) : null}
            </span>
          </div>
        </div>
      </div>

      {/* 列表本体 */}
      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body text-center text-sm text-slate-400 py-10">
            {isFiltered
              ? emptyAfterFilterState ?? '没有匹配的内容'
              : emptyState ?? '暂无数据'}
          </div>
        </div>
      ) : view === 'table' && (renderTableRow || tableColumns) ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table min-w-[760px]">
              <thead>
                <tr>
                  {bulk.length > 0 && <th className="w-10" />}
                  {tableColumns?.map((c) => (
                    <th key={c.key} className={c.className} style={c.width ? { width: c.width } : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => {
                  const id = getId(it);
                  const isSel = selected.has(id);
                  const ctx: RenderCtx = { selected: isSel, toggle: () => toggle(id) };
                  if (renderTableRow) return <React.Fragment key={id}>{renderTableRow(it, ctx)}</React.Fragment>;
                  return (
                    <tr key={id} className={isSel ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}>
                      {bulk.length > 0 && (
                        <td>
                          <input
                            type="checkbox"
                            className="w-4 h-4 cursor-pointer"
                            checked={isSel}
                            onChange={() => toggle(id)}
                            aria-label="选择行"
                          />
                        </td>
                      )}
                      {tableColumns?.map((c) => (
                        <td key={c.key} className={c.className}>
                          {c.render(it)}
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
          {visible.map((it) => {
            const id = getId(it);
            const isSel = selected.has(id);
            const ctx: RenderCtx = { selected: isSel, toggle: () => toggle(id) };
            return (
              <div key={id} className="relative">
                {bulk.length > 0 && (
                  <label
                    className={
                      'absolute top-2 left-2 z-10 inline-flex items-center justify-center w-6 h-6 rounded border bg-white/90 dark:bg-slate-900/90 cursor-pointer shadow-sm transition-colors ' +
                      (isSel
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-slate-300 dark:border-slate-600 hover:border-brand-400')
                    }
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={isSel}
                      onChange={() => toggle(id)}
                      aria-label="选择"
                    />
                    {isSel && <Check size={14} />}
                  </label>
                )}
                <div className={isSel ? 'ring-2 ring-brand-500 rounded-lg' : ''}>
                  {renderCard ? renderCard(it, ctx) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {pageSize && pageSize > 0 && filtered.length > pageSize && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, safePage - 1))}
            disabled={safePage <= 1}
            className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
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
            className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      {/* 批量浮条 */}
      {bulk.length > 0 && (
        <BulkActionBar
          count={selected.size}
          onClear={clearSelection}
          actions={bulk.map((b) => ({
            key: b.key,
            label: b.label,
            icon: b.icon,
            destructive: b.destructive,
            disabled: bulkRunning,
            onClick: () => runBulk(b),
          }))}
        />
      )}
    </div>
  );
}

/* 节流工具：批量串行调用，每条间隔 100ms */
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
      ok++;
    } catch (e) {
      failed.push({ id: ids[i], error: (e as Error).message });
    }
    if (i < ids.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return { ok, failed };
}
