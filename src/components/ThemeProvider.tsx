'use client';

import { useEffect } from 'react';

/**
 * 主题加载脚本：尽早设置 html.class，避免 FOUC。
 * 优先级：localStorage > prefers-color-scheme
 */
export const themeInitScript = `
(function(){
  try {
    var stored = localStorage.getItem('theme');
    var prefers = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || (!stored && prefers);
    if (dark) document.documentElement.classList.add('dark');
  } catch(e) {}
})();
`;

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // 监听系统主题变化（仅在用户没有手动设置时跟随）
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('theme')) {
        document.documentElement.classList.toggle('dark', e.matches);
      }
    };
    mq.addEventListener?.('change', handler);
    return () => {
      mq.removeEventListener?.('change', handler);
    };
  }, []);
  return <>{children}</>;
}

export function setTheme(theme: 'light' | 'dark' | 'system') {
  if (theme === 'system') {
    localStorage.removeItem('theme');
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefers);
  } else {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}

export function getCurrentTheme(): 'light' | 'dark' | 'system' {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return 'system';
}
