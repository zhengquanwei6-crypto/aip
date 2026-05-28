/**
 * 零依赖版 CommandPalette · ⌘K / Ctrl+K 打开
 *  - 模糊搜索 NAV_ITEMS（隐藏项也可搜到）
 *  - 键盘 ↑↓ Enter Esc
 *  - 不依赖 cmdk / @radix-ui/react-dialog
 */
"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/cn";

interface Item {
  href: string;
  label: string;
}

const ALL: Item[] = NAV_ITEMS.map((i) => ({ href: i.href, label: i.label }));

function fuzzy(q: string, items: Item[]): Item[] {
  const k = q.trim().toLowerCase();
  if (!k) return items.slice(0, 20);
  return items
    .map((it) => {
      const hay = (it.label + " " + it.href).toLowerCase();
      const idx = hay.indexOf(k);
      const score = idx === -1 ? 9999 : idx + (hay.length - k.length) * 0.001;
      return { it, score };
    })
    .filter((x) => x.score < 9999)
    .sort((a, b) => a.score - b.score)
    .slice(0, 20)
    .map((x) => x.it);
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const list = useMemo(() => fuzzy(q, ALL), [q]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      const isOpen = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (isOpen) {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
        setActive(0);
      } else if (open && e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, list.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = list[active];
      if (it) go(it.href);
    }
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 backdrop-blur-sm pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800">
          <Search size={16} className="text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="搜页面、跳转……"
            className="flex-1 bg-transparent outline-none text-sm text-slate-800 dark:text-slate-100"
          />
          <kbd className="text-[10px] text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {list.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-slate-400">没有匹配项</li>
          ) : (
            list.map((it, i) => (
              <li key={it.href}>
                <button
                  type="button"
                  onClick={() => go(it.href)}
                  className={cn(
                    "block w-full text-left px-3 py-2 text-sm flex items-center gap-2",
                    i === active
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  )}
                >
                  <span className="flex-1">{it.label}</span>
                  <span className="text-[10px] text-slate-400">{it.href}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
