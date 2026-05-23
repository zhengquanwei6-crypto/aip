'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import {
  __subscribeToast,
  __subscribeDismiss,
  type ToastItem,
} from '@/lib/toast';

/* ── 单条 Toast ── */
function ToastRow({
  item,
  onClose,
}: {
  item: ToastItem;
  onClose: (id: number) => void;
}) {
  const [leaving, setLeaving] = useState(false);

  const close = useCallback(() => {
    setLeaving(true);
    // 等过渡完成再真正卸载（150ms 与下面的 transition 时长一致）
    window.setTimeout(() => onClose(item.id), 160);
  }, [item.id, onClose]);

  useEffect(() => {
    if (item.duration && item.duration > 0) {
      const t = window.setTimeout(close, item.duration);
      return () => window.clearTimeout(t);
    }
    return;
  }, [item.duration, close]);

  const kindStyle =
    item.kind === 'success'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-100'
      : item.kind === 'error'
        ? 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/60 dark:border-red-800 dark:text-red-100'
        : 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-100';

  const iconColor =
    item.kind === 'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : item.kind === 'error'
        ? 'text-red-600 dark:text-red-400'
        : 'text-blue-600 dark:text-blue-400';

  const Icon =
    item.kind === 'success'
      ? CheckCircle2
      : item.kind === 'error'
        ? XCircle
        : Info;

  return (
    <div
      role={item.kind === 'error' ? 'alert' : 'status'}
      aria-live={item.kind === 'error' ? 'assertive' : 'polite'}
      className={
        'pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-md min-w-[260px] max-w-[400px] transition-all duration-150 ' +
        (leaving
          ? 'opacity-0 translate-x-2'
          : 'opacity-100 translate-x-0 animate-fade-in') +
        ' ' +
        kindStyle
      }
    >
      <Icon
        className={'h-5 w-5 flex-shrink-0 mt-0.5 ' + iconColor}
        aria-hidden="true"
      />
      <div className="flex-1 text-sm leading-5 break-words whitespace-pre-wrap">
        {item.message}
      </div>
      <button
        type="button"
        onClick={close}
        className="flex-shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        aria-label="关闭"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/* ── 容器 + Provider ── */
const MAX_QUEUE = 3; // v0.11 B4: 同时显示的 toast 上限
const DEDUPE_WINDOW_MS = 800; // v0.11 B4: 同 message+kind 在窗口内被视为重复

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as typeof window & { __TOAST_PROVIDER_ACTIVE__?: boolean };
    // 仅第一个挂载的 Provider 接管渲染（避免多 Provider 重复显示）
    if (w.__TOAST_PROVIDER_ACTIVE__) {
      return;
    }
    w.__TOAST_PROVIDER_ACTIVE__ = true;
    setActive(true);

    // v0.11 B4: 维护「最近一条相同 (kind|message) 的入队时间」用于 dedupe
    const recent = new Map<string, number>();

    const offAdd = __subscribeToast((item) => {
      const dedupeKey = item.kind + '|' + item.message;
      const now = Date.now();
      const last = recent.get(dedupeKey) ?? 0;
      if (now - last < DEDUPE_WINDOW_MS) {
        // dedupe：极短时间内的重复 toast 直接丢弃
        return;
      }
      recent.set(dedupeKey, now);

      setItems((arr) => {
        // v0.11 B4: 队列上限 3 条；超出时优先舍弃「最早的非 sticky 那条」
        // 把 duration<=0 视为 sticky（永不自动消失）
        if (arr.length >= MAX_QUEUE) {
          const idx = arr.findIndex((t) => t.duration > 0);
          if (idx >= 0) {
            const next = arr.slice();
            next.splice(idx, 1);
            return [...next, item];
          }
          // 全是 sticky 时，只丢 head
          return [...arr.slice(1), item];
        }
        return [...arr, item];
      });
    });
    const offDismiss = __subscribeDismiss((id) => {
      setItems((arr) => arr.filter((t) => t.id !== id));
    });

    return () => {
      offAdd();
      offDismiss();
      w.__TOAST_PROVIDER_ACTIVE__ = false;
    };
  }, []);

  const remove = useCallback((id: number) => {
    setItems((arr) => arr.filter((t) => t.id !== id));
  }, []);

  return (
    <>
      {children}
      {active && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
              aria-label="通知"
            >
              {items.map((it) => (
                <ToastRow key={it.id} item={it} onClose={remove} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export default ToastProvider;
