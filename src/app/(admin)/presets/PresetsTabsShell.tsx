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
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 -mt-1 overflow-x-auto">
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
                'inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors',
                isActive
                  ? 'border-brand-600 text-brand-700 font-medium dark:text-brand-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200',
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
