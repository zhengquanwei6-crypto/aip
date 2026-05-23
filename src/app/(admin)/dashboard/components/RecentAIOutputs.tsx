/**
 * v0.11 B3 · 最近 5 条 AIOutput
 *
 * 点击 → 跳 /history?id=Y
 */
'use client';

import Link from 'next/link';
import clsx from 'clsx';
import {
  Sparkles,
  ChevronRight,
  Image as ImageIcon,
  PencilLine,
  Lightbulb,
  HelpCircle,
} from 'lucide-react';
import type { RecentAIOutputItem } from '@/app/api/dashboard/summary/aggregate';

const TYPE_LABEL: Record<string, string> = {
  text: '文案',
  image: '图片',
  image_prompt: '图提示词',
  suggestion: '运营建议',
};

const TYPE_TONE: Record<string, string> = {
  text: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  image:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  image_prompt:
    'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  suggestion:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

function TypeIcon({ type }: { type: string }) {
  const cls = 'h-3.5 w-3.5';
  switch (type) {
    case 'image':
    case 'image_prompt':
      return <ImageIcon className={cls} aria-hidden />;
    case 'suggestion':
      return <Lightbulb className={cls} aria-hidden />;
    case 'text':
      return <PencilLine className={cls} aria-hidden />;
    default:
      return <HelpCircle className={cls} aria-hidden />;
  }
}

const PLATFORM_LABEL: Record<string, string> = {
  xiaohongshu: '小红书',
  xianyu: '闲鱼',
};

function relativeFromNow(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec}s 前`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} 天前`;
}

export interface RecentAIOutputsProps {
  items: RecentAIOutputItem[];
}

export default function RecentAIOutputs({ items }: RecentAIOutputsProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles
            className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0"
            aria-hidden
          />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            最近 AI 输出
          </h2>
        </div>
        <Link
          href="/history"
          className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 shrink-0"
        >
          全部 →
        </Link>
      </header>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            还没有生成记录
          </li>
        ) : (
          items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/history?id=${encodeURIComponent(r.id)}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
              >
                <span
                  className={clsx(
                    'shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    TYPE_TONE[r.type] ??
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                  )}
                >
                  <TypeIcon type={r.type} />
                  {TYPE_LABEL[r.type] ?? r.type}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-900 dark:text-slate-100">
                    {r.summary || `${TYPE_LABEL[r.type] ?? r.type} 输出`}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {r.platform ? (
                      <>
                        <span>
                          {PLATFORM_LABEL[r.platform] ?? r.platform}
                        </span>
                        <span aria-hidden>·</span>
                      </>
                    ) : null}
                    <span>{relativeFromNow(r.createdAt)}</span>
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0"
                  aria-hidden
                />
              </Link>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
