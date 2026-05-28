/**
 * Toaster · 全局 toast 渲染层（零依赖）
 *
 * 订阅 @/lib/toast 的 emitter；右下角浮层堆叠；
 * 自动消失（duration > 0 时），可手动关闭，深浅色自适应。
 */
"use client";

import { useEffect, useState } from "react";
import {
  __subscribeToast,
  __subscribeDismiss,
  type ToastItem,
} from "@/lib/toast";

const COLORS: Record<ToastItem["kind"], { bg: string; bar: string; text: string }> = {
  success: {
    bg: "bg-emerald-50 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-700",
    bar: "bg-emerald-500",
    text: "text-emerald-900 dark:text-emerald-50",
  },
  error: {
    bg: "bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-700",
    bar: "bg-red-500",
    text: "text-red-900 dark:text-red-50",
  },
  info: {
    bg: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    bar: "bg-slate-400 dark:bg-slate-500",
    text: "text-slate-800 dark:text-slate-100",
  },
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const offAdd = __subscribeToast((it) => {
      setItems((prev) => [...prev, it]);
      if (it.duration > 0) {
        setTimeout(() => {
          setItems((prev) => prev.filter((x) => x.id !== it.id));
        }, it.duration);
      }
    });
    const offDismiss = __subscribeDismiss((id) => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    });
    return () => {
      offAdd();
      offDismiss();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="通知"
      className="fixed z-[200] right-4 bottom-4 flex flex-col gap-2 max-w-[calc(100vw-2rem)] w-[360px] pointer-events-none"
    >
      {items.map((it) => {
        const c = COLORS[it.kind];
        return (
          <div
            key={it.id}
            role="alert"
            aria-live={it.kind === "error" ? "assertive" : "polite"}
            className={
              "pointer-events-auto rounded-lg border shadow-lg overflow-hidden flex items-stretch gap-0 animate-fade-in " +
              c.bg
            }
          >
            <span className={"w-1 shrink-0 " + c.bar} aria-hidden />
            <div className="flex-1 px-3 py-2.5 min-w-0">
              <div className={"text-sm leading-snug whitespace-pre-wrap break-words " + c.text}>
                {it.message}
              </div>
            </div>
            <button
              type="button"
              aria-label="关闭"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
              className="shrink-0 px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default Toaster;
