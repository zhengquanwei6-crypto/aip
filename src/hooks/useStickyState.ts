'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * useStickyState — 把 state 持久化到 localStorage。
 *
 * - SSR 安全：服务端及首次客户端渲染都返回 initialValue，
 *   useEffect 内 hydrate 真实存储值，避免水合不匹配。
 * - JSON parse 失败时回退到 initialValue 并清除该 key。
 *
 *   const [v, setV] = useStickyState('list:today:filters', { status: '' });
 */
export function useStickyState<T>(
  key: string,
  initialValue: T,
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValueRaw] = useState<T>(initialValue);

  // 客户端 mount 后读取 localStorage。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return;
      const parsed = JSON.parse(raw) as T;
      setValueRaw(parsed);
    } catch {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* noop */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValueRaw((prev) => {
        const resolved =
          typeof next === 'function'
            ? (next as (p: T) => T)(prev)
            : next;
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(key, JSON.stringify(resolved));
          } catch {
            /* quota / disabled — 静默 */
          }
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, setValue];
}

export default useStickyState;
