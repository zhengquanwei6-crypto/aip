'use client';

// v0.11 B8 · /playground · 三 tab shell（client）
//
// URL 参数 ?tab=llm|image|agent 持久化 tab 选择，三个面板都常驻挂载（hidden/show 模式），
// 切换 0 网络请求。每个 tab 内部自己持有 messages / 选择 state。

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { MessageSquare, Image as ImageIcon, Bot } from 'lucide-react';
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

export interface AdapterPoolItem {
  slug: string;
  name: string;
  enabled: boolean;
  sizes: SizePreset[];
  qualities: QualityPreset[];
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

export default function PlaygroundClient(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<PlaygroundTab>(props.initTab);

  // 同步 URL → 内部 state（用户点浏览器返回 / 直接改 URL 时）
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
    <div className="space-y-4">
      {/* 顶栏：标题 + 三 tab */}
      <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
            <MessageSquare size={18} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 truncate">
              AI 对话 · Playground
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              即时调用 LLM / IMAGE / Agent · 复用「设置 → API Keys 池」+「适配器尺寸预设」+ 8 个 Agent
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Playground 模式选择"
          className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800"
        >
          <TabButton
            label="LLM 对话"
            sub="文案 / 通用问答"
            icon={<MessageSquare size={14} aria-hidden="true" />}
            active={tab === 'llm'}
            onClick={() => switchTab('llm')}
            data-tab="llm"
          />
          <TabButton
            label="图片生成"
            sub="即时出图"
            icon={<ImageIcon size={14} aria-hidden="true" />}
            active={tab === 'image'}
            onClick={() => switchTab('image')}
            data-tab="image"
          />
          <TabButton
            label="Agent 对话"
            sub="8 个内置 agent"
            icon={<Bot size={14} aria-hidden="true" />}
            active={tab === 'agent'}
            onClick={() => switchTab('agent')}
            data-tab="agent"
          />
        </div>
      </header>

      {/* 三个面板都常驻挂载，hidden/show 切换（让对话历史 + 选择 state 在 tab 切换时不丢） */}
      <section
        role="tabpanel"
        aria-labelledby="tab-llm"
        className={clsx(tab === 'llm' ? 'block' : 'hidden')}
        data-panel="llm"
      >
        <LlmTab llmKeys={props.llmKeys} />
      </section>

      <section
        role="tabpanel"
        aria-labelledby="tab-image"
        className={clsx(tab === 'image' ? 'block' : 'hidden')}
        data-panel="image"
      >
        <ImageTab
          imageKeys={props.imageKeys}
          adapters={props.adapters}
          defaultAdapter={props.defaultAdapter}
        />
      </section>

      <section
        role="tabpanel"
        aria-labelledby="tab-agent"
        className={clsx(tab === 'agent' ? 'block' : 'hidden')}
        data-panel="agent"
      >
        <AgentTab agents={props.agents} />
      </section>
    </div>
  );
}

function TabButton({
  label,
  sub,
  icon,
  active,
  onClick,
  ...rest
}: {
  label: string;
  sub: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  [key: string]: unknown;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300'
          : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100',
      )}
      {...rest}
    >
      <span className={clsx('shrink-0', active ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400')}>
        {icon}
      </span>
      <span className="font-medium">{label}</span>
      <span className="hidden sm:inline text-[11px] text-slate-400 dark:text-slate-500">· {sub}</span>
    </button>
  );
}
