/**
 * v0.15 · /playground · AI 对话 · UI 简约重做
 *
 * 用户原话：使用简约、高端的风格，但是不能因为简约去掉有用的功能。
 *
 * 改动点：
 *   - 顶部 hero 改纯文字标题，不要 emoji 大方块 + 副标
 *   - Tab 改成线性下划线 segment，不要彩色 chip
 *   - tab panel 顶部留白增加，整体更"留白舒适"
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import LlmTab from './LlmTab';
import ImageTab from './ImageTab';
import AgentTab from './AgentTab';

export interface ApiKeyRow {
  id: string;
  provider: 'llm' | 'image';
  label: string;
  baseUrl: string;
  model: string;
  active: boolean;
  priority: number;
  consecutiveErrors: number;
  totalRequests: number;
}

export interface SizePreset {
  label: string;
  value: string;
  tier?: string | null;
}

export interface QualityPreset {
  label: string;
  value: string;
}

export interface AspectRatioPreset {
  label: string;
  ratio: string;
  sizeRule?: string | null;
}

export interface AdapterPoolItem {
  slug: string;
  name: string;
  enabled: boolean;
  sizes: SizePreset[];
  qualities: QualityPreset[];
  aspectRatios: AspectRatioPreset[];
  supportsImg2Img: boolean;
}

export interface AgentSummary {
  slug: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
}

export type PlaygroundTab = 'llm' | 'image' | 'agent';

interface Props {
  llmKeys: ApiKeyRow[];
  imageKeys: ApiKeyRow[];
  adapters: AdapterPoolItem[];
  defaultAdapter: string | null;
  agents: AgentSummary[];
  initTab: PlaygroundTab;
}

const TABS: { value: PlaygroundTab; label: string; sub: string }[] = [
  { value: 'llm', label: 'LLM 对话', sub: '文案 / 通用问答' },
  { value: 'image', label: '图片生成', sub: '文生图 + 图生图' },
  { value: 'agent', label: 'Agent 对话', sub: '内置智能体' },
];

export default function PlaygroundClient(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<PlaygroundTab>(props.initTab);

  useEffect(() => {
    const t = searchParams?.get('tab');
    if (t === 'image' || t === 'agent' || t === 'llm') {
      if (t !== tab) setTab(t);
    }
  }, [searchParams, tab]);

  const switchTab = useCallback(
    (next: PlaygroundTab) => {
      setTab(next);
      const sp = new URLSearchParams(searchParams?.toString() ?? '');
      sp.set('tab', next);
      router.replace('/playground?' + sp.toString(), { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.32em] text-slate-400 font-mono">
            playground
          </div>
          <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
            AI 对话
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            即时调用 LLM / 图片 / Agent，复用「设置 → API Keys 池」+ 适配器尺寸/比例预设
          </p>
        </div>

        {/* 线性下划线 segment */}
        <div role="tablist" aria-label="Playground 模式选择" className="border-b border-slate-200 dark:border-slate-800 flex items-end gap-6">
          {TABS.map((t) => {
            const active = t.value === tab;
            return (
              <button
                key={t.value}
                role="tab"
                aria-selected={active}
                aria-pressed={active}
                onClick={() => switchTab(t.value)}
                data-tab={t.value}
                className={clsx(
                  '-mb-px py-2.5 px-1 border-b-2 transition-colors text-sm',
                  active
                    ? 'border-slate-900 dark:border-white text-slate-900 dark:text-slate-100 font-medium'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                )}
              >
                <span>{t.label}</span>
                <span className="hidden sm:inline ml-1.5 text-[11px] text-slate-400">
                  · {t.sub}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <section role="tabpanel" className={clsx(tab === 'llm' ? 'block' : 'hidden')} data-panel="llm">
        <LlmTab llmKeys={props.llmKeys} />
      </section>

      <section role="tabpanel" className={clsx(tab === 'image' ? 'block' : 'hidden')} data-panel="image">
        <ImageTab imageKeys={props.imageKeys} adapters={props.adapters} defaultAdapter={props.defaultAdapter} />
      </section>

      <section role="tabpanel" className={clsx(tab === 'agent' ? 'block' : 'hidden')} data-panel="agent">
        <AgentTab agents={props.agents} />
      </section>
    </div>
  );
}
