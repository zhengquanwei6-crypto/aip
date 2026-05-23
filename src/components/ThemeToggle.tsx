'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { setTheme, getCurrentTheme } from './ThemeProvider';

export default function ThemeToggle({
  className = '',
}: {
  className?: string;
}) {
  const [theme, setT] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    setT(getCurrentTheme());
  }, []);

  function toggle() {
    const next: 'light' | 'dark' | 'system' =
      theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setT(next);
    setTheme(next);
  }

  // 全局快捷键 D：在 light/dark 之间切换（不进入 system）
  // 跳过 input/textarea/contenteditable 焦点；忽略 ctrl/meta/alt 组合
  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'd' && e.key !== 'D') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      // 当前若为 system，按 D 也切到二元（基于实际显示状态）
      const isDark = document.documentElement.classList.contains('dark');
      const next: 'light' | 'dark' = isDark ? 'light' : 'dark';
      setT(next);
      setTheme(next);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const label =
    theme === 'dark' ? '夜间' : theme === 'light' ? '白天' : '跟随系统';

  return (
    <button
      onClick={toggle}
      className={
        'inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 ' +
        className
      }
      title={`当前：${label}（点击切换；快捷键 D 直接切暗黑）`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
