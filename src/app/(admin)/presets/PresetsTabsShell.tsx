'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ImageIcon, FileText, Bot } from 'lucide-react';
import clsx from 'clsx';

/**
 * v0.11 B5 · /presets 三 tab：图片预设 / 文案模板（合并 /prompts） / Agent 系统（占位）。
 *
 * - tab=image   (默认) 图片预设（原 /presets）
 * - tab=content         文案模板（原 /prompts，可编辑、vs 默认 diff、新增/编辑）
 * - tab=agent           Agent 系统 prompt 编辑器，v0.11 之后规划，本批仅展示占位说明
 */
export type PresetsTab = 'image' | 'content' | 'agent';

const TABS: { value: PresetsTab; label: string; icon: typeof ImageIcon }[] = [
  { value: 'image', label: '图片预设', icon: ImageIcon },
  { value: 'content', label: '文案模板', icon: FileText },
  { value: 'agent', label: 'Agent 系统', icon: Bot },
];

export default function PresetsTabsShell({
  active,
  image,
  content,
  agent,
}: {
  active: PresetsTab;
  image: React.ReactNode;
  content: React.ReactNode;
  agent: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(tab: PresetsTab) {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (tab === 'image') sp.delete('tab');
    else sp.set('tab', tab);
    const qs = sp.toString();
    router.replace('/presets' + (qs ? '?' + qs : ''));
  }

  return (
    <div className="space-y-3">
      <header className="command-panel p-5 sm:p-6">
        <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold text-cyan-200">
          <span className="pulse-dot" aria-hidden />
          Prompt Arsenal
        </div>
        <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">预设武器库</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          图片预设、文案模板和 Agent 系统提示词统一管理，让高频生产动作更稳定。
        </p>
      </header>

      <div className="command-toolbar flex items-center gap-2 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => go(t.value)}
              aria-pressed={isActive}
              className={clsx(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
                isActive
                  ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-slate-200 bg-white/70 text-slate-600 hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:border-cyan-800',
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className={active === 'image' ? '' : 'hidden'}>{image}</div>
      <div className={active === 'content' ? '' : 'hidden'}>{content}</div>
      <div className={active === 'agent' ? '' : 'hidden'}>{agent}</div>
    </div>
  );
}
