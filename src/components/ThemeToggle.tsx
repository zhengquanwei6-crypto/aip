'use client';

import { useEffect, useState } from 'react';
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

  const icon =
    theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '💻';
  const label =
    theme === 'dark' ? '夜间' : theme === 'light' ? '白天' : '跟随系统';

  return (
    <button
      onClick={toggle}
      className={
        'inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 ' +
        className
      }
      title={`当前：${label}（点击切换）`}
    >
      <span>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
