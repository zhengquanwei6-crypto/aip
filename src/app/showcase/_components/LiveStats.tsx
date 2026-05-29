"use client";

import { useEffect, useState } from "react";

/**
 * showcase v4 · LiveStats — 5s 轮询 hook
 *
 * 给客户端组件提供两份实时数据：
 *   - `/api/health`           — api-key pool, version, publishDirector
 *   - `/api/showcase/recent-demos` — 最近匿名 demo
 *
 * 行为：
 *   - 文档可见时每 5s 拉一次；
 *   - `document.visibilityState === "hidden"` 时暂停（不发请求）；
 *   - 切回 visible 时立即拉一次然后续上 5s 节奏。
 *   - SSR 阶段返回 `null` 让 hydration 与 server HTML 完全一致。
 *
 * 不依赖 SWR / react-query；为 /showcase 单独维护，避免引入额外 KB。
 *
 * Validates: Requirements 8.4, 8.5
 */

const POLL_MS = 5_000;

export interface HealthSnapshot {
  version: string;
  pool: {
    llm: { active: number; total: number };
    image: { active: number; total: number };
  };
  publishDirector: { total: number; success: number; fail: number };
}

export interface RecentDemo {
  id: number;
  promptPreview: string;
  outputPreview: string;
  model: string;
  isoDate: string;
  ago: string;
}

export interface LiveStatsState {
  health: HealthSnapshot | null;
  recentDemos: RecentDemo[];
  generatedAt: number | null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function useLiveStats(): LiveStatsState | null {
  const [state, setState] = useState<LiveStatsState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      const [health, demos] = await Promise.all([
        fetchJson<{
          version?: string;
          apiKeyPool?: {
            llm?: { active?: number; total?: number };
            image?: { active?: number; total?: number };
          };
          publishDirectorStats?: { total?: number; success?: number; fail?: number };
        }>("/api/health"),
        fetchJson<{ ok: boolean; items?: RecentDemo[] }>("/api/showcase/recent-demos"),
      ]);
      if (cancelled) return;
      const snap: HealthSnapshot | null = health
        ? {
            version: health.version ?? "",
            pool: {
              llm: {
                active: health.apiKeyPool?.llm?.active ?? 0,
                total: health.apiKeyPool?.llm?.total ?? 0,
              },
              image: {
                active: health.apiKeyPool?.image?.active ?? 0,
                total: health.apiKeyPool?.image?.total ?? 0,
              },
            },
            publishDirector: {
              total: health.publishDirectorStats?.total ?? 0,
              success: health.publishDirectorStats?.success ?? 0,
              fail: health.publishDirectorStats?.fail ?? 0,
            },
          }
        : null;
      setState({
        health: snap,
        recentDemos: demos?.ok && Array.isArray(demos.items) ? demos.items : [],
        generatedAt: Date.now(),
      });
    };

    const start = () => {
      if (intervalId !== null) return;
      tick();
      intervalId = setInterval(tick, POLL_MS);
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      // tab loaded while hidden — record one snapshot, do not poll
      tick();
    } else {
      start();
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, []);

  return state;
}

/**
 * Tiny dummy component so this file can also be imported as a component
 * import even though the primary export is the hook. Some bundlers complain
 * if a `_components/*.tsx` file has zero React component exports.
 */
export default function LiveStatsBoundary() {
  return null;
}
