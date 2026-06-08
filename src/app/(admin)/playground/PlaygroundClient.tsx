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
      <header className="studio-shell overflow-hidden p-5 text-white sm:p-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-100">
            GPT IMG 2 / Live Studio
          </div>
          <h1 className="mt-4 max-w-3xl text-3xl font-black leading-none tracking-normal text-white sm:text-5xl">
            GPT IMG 2 Creative Cockpit
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Prompt, model, ratio, quality, source image and asset handoff are now in one visible production lane.
          </p>
        </div>

        {/* 线性下划线 segment */}
        <div role="tablist" aria-label="Playground mode" className="relative mt-5 grid gap-2 sm:grid-cols-3">
          {TABS.map((t) => {
            const active = t.value === tab;
            return (
              <button
                key={t.value}
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(t.value)}
                data-tab={t.value}
                className={clsx(
                  'rounded-lg border px-4 py-3 text-left transition-all duration-300',
                  active
                    ? 'border-cyan-300/60 bg-cyan-300/20 text-white shadow-lg shadow-cyan-950/20'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10',
                )}
              >
                <span className="block text-sm font-bold">{t.label}</span>
                <span className="mt-1 block text-xs text-slate-400">
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
