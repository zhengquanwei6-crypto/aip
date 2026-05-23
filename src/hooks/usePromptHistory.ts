'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * usePromptHistory — 把 prompt 历史持久化到 localStorage。
 *
 * - scope: 'image' | 'content'
 * - 去重：相同字符串置顶
 * - 上限 max（默认 20）
 * - SSR 安全：初次 render 返回空数组，useEffect 内 hydrate
 *
 *   const { history, push, clear } = usePromptHistory('image');
 */
export function usePromptHistory(
  scope: 'image' | 'content',
  max = 20,
): {
  history: string[];
  push: (p: string) => void;
  clear: () => void;
} {
  const key = `prompt-history:${scope}`;
  const [history, setHistory] = useState<string[]>([]);

  // hydrate
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setHistory(parsed.filter((s) => typeof s === 'string'));
      }
    } catch {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* noop */
      }
    }
  }, [key]);

  const persist = useCallback(
    (next: string[]) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* quota / disabled — 静默 */
      }
    },
    [key],
  );

  const push = useCallback(
    (p: string) => {
      const trimmed = (p ?? '').trim();
      if (!trimmed) return;
      setHistory((prev) => {
        const next = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(
          0,
          max,
        );
        persist(next);
        return next;
      });
    },
    [persist, max],
  );

  const clear = useCallback(() => {
    setHistory([]);
    persist([]);
  }, [persist]);

  return { history, push, clear };
}

export default usePromptHistory;
