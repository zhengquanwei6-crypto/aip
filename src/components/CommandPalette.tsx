'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  X as XIcon,
  ArrowRight,
  Plus,
  Sun,
  Moon,
  Monitor,
  Image as ImageIcon,
  ListChecks,
} from 'lucide-react';
import { NAV_ITEMS } from '@/lib/constants';
import { setTheme } from './ThemeProvider';
import { toast } from '@/lib/toast';

type Group = '跳页面' | '快速搜任务' | '快速创建' | '切换主题' | '切换默认 adapter';

interface CommandItem {
  id: string;
  group: Group;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  run: () => void | Promise<void>;
}

interface AdapterLite {
  slug: string;
  name?: string;
}

interface TaskHit {
  id: string;
  title: string;
  category?: string;
}

const ADDITIONAL_PAGES: { href: string; label: string }[] = [
  { href: '/history', label: 'AI 输出历史' },
  { href: '/prompts', label: 'Prompt 模板库' },
];

const NEW_TARGETS: { href: string; label: string }[] = [
  { href: '/clients#new', label: '新建客户档案' },
  { href: '/keywords#new', label: '新建关键词' },
  { href: '/pricing#new', label: '新建价格套餐' },
  { href: '/scripts#new', label: '新建私信话术' },
  { href: '/presets#new', label: '新建图片预设' },
];

function highlight(text: string, q: string) {
  if (!q) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 dark:bg-amber-700/60 text-inherit rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [adapters, setAdapters] = useState<AdapterLite[]>([]);
  const [taskHits, setTaskHits] = useState<TaskHit[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskAvailable, setTaskAvailable] = useState<boolean>(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  /** 全局快捷键 Cmd/Ctrl+K 打开。Lightbox 等 modal 打开时跳过。 */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onKey(e: KeyboardEvent) {
      const isK = e.key === 'k' || e.key === 'K';
      if (!isK) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      // 检测有没有 modal（Lightbox 等）已经打开 → 让它自己处理 Esc
      const modal = document.querySelector(
        '[role="dialog"][aria-modal="true"]',
      );
      if (modal && !modal.hasAttribute('data-command-palette')) return;
      e.preventDefault();
      setOpen((v) => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 打开时聚焦
  useEffect(() => {
    if (open) {
      setQ('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // 拉 adapters 列表（用于"切换默认 adapter"分组）
  useEffect(() => {
    if (!open) return;
    if (adapters.length > 0) return;
    fetch('/api/adapters')
      .then((r) => r.json())
      .then((j: any) => {
        const arr = j.adapters ?? j.list ?? [];
        if (Array.isArray(arr)) {
          setAdapters(
            arr
              .map((a: any) => ({
                slug: String(a.slug ?? ''),
                name: a.name ?? a.slug,
              }))
              .filter((a: AdapterLite) => a.slug),
          );
        }
      })
      .catch(() => {});
  }, [open, adapters.length]);

  // 实时搜任务（≥2 字时）
  useEffect(() => {
    if (!open || !taskAvailable) {
      setTaskHits([]);
      return;
    }
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setTaskHits([]);
      return;
    }
    let cancel = false;
    setTaskLoading(true);
    fetch('/api/tasks?q=' + encodeURIComponent(trimmed))
      .then((r) => {
        if (!r.ok) {
          if (r.status === 404 || r.status === 405) {
            setTaskAvailable(false);
          }
          throw new Error('no');
        }
        return r.json();
      })
      .then((j: any) => {
        if (cancel) return;
        const arr = j.list ?? j.tasks ?? j.items ?? [];
        if (Array.isArray(arr)) {
          setTaskHits(
            arr.slice(0, 6).map((t: any) => ({
              id: String(t.id ?? ''),
              title: t.title ?? t.name ?? '(untitled)',
              category: t.category,
            })),
          );
        } else {
          setTaskHits([]);
        }
      })
      .catch(() => {
        if (!cancel) setTaskHits([]);
      })
      .finally(() => {
        if (!cancel) setTaskLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [q, open, taskAvailable]);

  const close = useCallback(() => setOpen(false), []);

  /** 构建命令列表 */
  const commands = useMemo<CommandItem[]>(() => {
    const out: CommandItem[] = [];

    // 跳页面
    const navAll = [
      ...NAV_ITEMS.map((i) => ({ href: i.href, label: i.label })),
      ...ADDITIONAL_PAGES,
    ];
    for (const it of navAll) {
      out.push({
        id: 'nav:' + it.href,
        group: '跳页面',
        label: it.label,
        hint: it.href,
        icon: <ArrowRight size={14} />,
        run: () => router.push(it.href),
      });
    }

    // 快速搜任务
    if (taskAvailable && q.trim().length >= 2) {
      for (const t of taskHits) {
        out.push({
          id: 'task:' + t.id,
          group: '快速搜任务',
          label: t.title,
          hint: t.category ? `任务 · ${t.category}` : '任务',
          icon: <ListChecks size={14} />,
          run: () => router.push('/today'),
        });
      }
      if (taskHits.length === 0 && !taskLoading) {
        out.push({
          id: 'task:empty',
          group: '快速搜任务',
          label: '（没有匹配任务）',
          icon: <ListChecks size={14} />,
          run: () => {},
        });
      }
    }

    // 快速创建
    for (const it of NEW_TARGETS) {
      out.push({
        id: 'new:' + it.href,
        group: '快速创建',
        label: it.label,
        hint: it.href,
        icon: <Plus size={14} />,
        run: () => router.push(it.href),
      });
    }

    // 切换主题
    out.push(
      {
        id: 'theme:light',
        group: '切换主题',
        label: '切到白天',
        icon: <Sun size={14} />,
        run: () => {
          setTheme('light');
          toast.info('已切换到白天');
        },
      },
      {
        id: 'theme:dark',
        group: '切换主题',
        label: '切到夜间',
        icon: <Moon size={14} />,
        run: () => {
          setTheme('dark');
          toast.info('已切换到夜间');
        },
      },
      {
        id: 'theme:system',
        group: '切换主题',
        label: '跟随系统',
        icon: <Monitor size={14} />,
        run: () => {
          setTheme('system');
          toast.info('已设为跟随系统');
        },
      },
    );

    // 切换默认 adapter
    for (const a of adapters) {
      out.push({
        id: 'adapter:' + a.slug,
        group: '切换默认 adapter',
        label: a.name ?? a.slug,
        hint: a.slug,
        icon: <ImageIcon size={14} />,
        run: async () => {
          try {
            const r = await fetch('/api/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ IMAGE_DEFAULT_ADAPTER: a.slug }),
            });
            const j = await r.json();
            if (!r.ok || !j.ok) throw new Error(j.error || '保存失败');
            toast.success(`默认 adapter 已切到 ${a.name ?? a.slug}`);
          } catch (e) {
            toast.error((e as Error).message);
          }
        },
      });
    }

    return out;
  }, [router, taskAvailable, taskHits, taskLoading, q, adapters]);

  /** 过滤 + 分组 */
  const filtered = useMemo(() => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) return commands;
    return commands.filter((c) => {
      // 任务命中已经是远端筛过的，保留
      if (c.group === '快速搜任务') return true;
      const hay = (c.label + ' ' + (c.hint ?? '')).toLowerCase();
      return hay.includes(trimmed);
    });
  }, [commands, q]);

  // 分组渲染顺序
  const grouped = useMemo(() => {
    const order: Group[] = [
      '跳页面',
      '快速搜任务',
      '快速创建',
      '切换主题',
      '切换默认 adapter',
    ];
    const map = new Map<Group, CommandItem[]>();
    for (const c of filtered) {
      const arr = map.get(c.group) ?? [];
      arr.push(c);
      map.set(c.group, arr);
    }
    return order
      .map((g) => ({ group: g, items: map.get(g) ?? [] }))
      .filter((s) => s.items.length > 0);
  }, [filtered]);

  // 扁平索引（用于上下键）
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // q 变化时重置 active
  useEffect(() => {
    setActiveIdx(0);
  }, [q]);

  /** 键盘 */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, flat.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = flat[activeIdx];
        if (item) {
          item.run();
          close();
        }
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, flat, activeIdx, close]);

  if (!open) return null;

  let runningIdx = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-command-palette
      className="fixed inset-0 z-[10000] flex items-start justify-center pt-[10vh] px-4"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={close}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-zoom-in">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 dark:border-slate-800">
          <Search size={16} className="text-slate-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="跳页面 / 搜任务 / 快速创建 / 切主题 / 换 adapter…"
            className="flex-1 bg-transparent outline-none text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
            Esc
          </kbd>
          <button
            onClick={close}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="关闭"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto py-2"
        >
          {grouped.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              没有匹配的命令
            </div>
          ) : (
            grouped.map((sec) => (
              <div key={sec.group} className="mb-2">
                <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {sec.group}
                </div>
                <ul>
                  {sec.items.map((item) => {
                    runningIdx++;
                    const active = runningIdx === activeIdx;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setActiveIdx(runningIdx)}
                          onClick={() => {
                            item.run();
                            close();
                          }}
                          className={
                            'w-full flex items-center gap-2 px-3 py-2 text-sm text-left ' +
                            (active
                              ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200')
                          }
                        >
                          <span className="shrink-0 text-slate-400">
                            {item.icon}
                          </span>
                          <span className="flex-1 min-w-0 truncate">
                            {highlight(item.label, q.trim())}
                          </span>
                          {item.hint && (
                            <span className="shrink-0 text-[11px] text-slate-400 truncate max-w-[40%]">
                              {item.hint}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center gap-3">
          <span>↑↓ 选择</span>
          <span>Enter 执行</span>
          <span>Esc 关闭</span>
          <span className="ml-auto">⌘/Ctrl + K 打开</span>
        </div>
      </div>
    </div>
  );
}
