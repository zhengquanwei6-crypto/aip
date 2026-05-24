'use client';

/**
 * v0.12 B3.3 · /create 客户端容器（三 tab 切换）
 *
 * tab=content / image / publish
 *
 * - 三 tab 同时挂载，用 hidden/show 切换（保留各自 useState · 沿袭 /workspace 模式）
 * - 切 tab 写 URL（router.replace）便于书签 + 面包屑解析
 * - 仅在 mount 第一次时根据 initialSourceImage 把 ImageStudio 切到 image tab（兼容 deep-link）
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PencilLine,
  Image as ImageIcon,
  Send,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import clsx from 'clsx';
import ContentGeneratorClient from '../content/ContentGeneratorClient';
import ImageStudioClient from '../image/ImageStudioClient';
import { PublishDirectorDrawer } from '@/components/agents/PublishDirectorDrawer';
import { AgentLauncher } from '@/components/agents/AgentDrawer';

export type CreateTab = 'content' | 'image' | 'publish';

const TABS: { value: CreateTab; label: string; icon: typeof PencilLine; hint: string }[] = [
  { value: 'content', label: '文案', icon: PencilLine, hint: '小红书 / 闲鱼 文案生成' },
  { value: 'image', label: '图片', icon: ImageIcon, hint: 'AI 出图 · 支持 i2i 源图改写' },
  { value: 'publish', label: '全流程发布', icon: Send, hint: '一键串连「文案 → 图片 → 任务卡」' },
];

export default function CreateClient({
  initialTab,
}: {
  initialTab: CreateTab;
  /** v0.12 B3.3 · 保留 prop 让 page.tsx 类型一致；URL 解析在 ImageStudioClient 内部完成 */
  initialSourceImage?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 当前 tab 来自 URL（initialTab 是首屏的 hint，后续以 URL 为准）
  const urlTab = (() => {
    const t = searchParams?.get('tab');
    return t === 'image' || t === 'publish' ? t : 'content';
  })() as CreateTab;
  const activeTab: CreateTab = urlTab ?? initialTab ?? 'content';

  const [pubDrawerOpen, setPubDrawerOpen] = useState(activeTab === 'publish');

  // 切到 publish tab 时自动开抽屉（关闭抽屉时 URL 切回 content）
  useEffect(() => {
    if (activeTab === 'publish') {
      setPubDrawerOpen(true);
    } else {
      setPubDrawerOpen(false);
    }
  }, [activeTab]);

  function go(tab: CreateTab) {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (tab === 'content') sp.delete('tab');
    else sp.set('tab', tab);
    // 切 tab 时不自动清 sourceImage（让它在 image tab 内被消费 / 清掉）
    const qs = sp.toString();
    router.replace('/create' + (qs ? '?' + qs : ''));
  }

  // 兼容 v0.11 的 mount 自动加载入口（floating Agent 按钮只在 image / content tab 显示对应 agent）
  return (
    <div className="space-y-4" data-v012-b3-create-shell>
      {/* 顶部说明条 */}
      <header className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 shrink-0"
            aria-hidden
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
              创作中心
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              文案 + 图片 + 全流程发布 · 三个 tab 一站式打通
            </p>
          </div>
        </div>
      </header>

      {/* 三 tab 切换 */}
      <div
        className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 -mt-1"
        role="tablist"
        data-v012-b3-create-tabs
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              data-create-tab={t.value}
              onClick={() => go(t.value)}
              aria-pressed={isActive}
              aria-selected={isActive}
              title={t.hint}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm border-b-2 -mb-px transition-colors',
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

      {/* 生态联通快捷条 · 仅在 image tab 显示 */}
      {activeTab === 'image' && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/40"
          data-v012-b3-image-eco
        >
          <span className="text-slate-500 dark:text-slate-400">需要 i2i 源图？</span>
          <a
            href="/workspace?tab=assets"
            className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-brand-700 ring-1 ring-slate-200 hover:ring-brand-400 dark:bg-slate-800 dark:text-brand-300 dark:ring-slate-700"
          >
            从素材库选 <ArrowRight size={12} aria-hidden="true" />
          </a>
          {searchParams?.get('sourceImage') ? (
            <span className="ml-auto truncate max-w-[260px] text-slate-400">
              已传入源图 URL
            </span>
          ) : null}
        </div>
      )}

      {/* tab 内容（同时挂载 · 切换走 hidden/show） */}
      <div className={activeTab === 'content' ? '' : 'hidden'} data-create-pane="content">
        <ContentGeneratorClient />
      </div>
      <div className={activeTab === 'image' ? '' : 'hidden'} data-create-pane="image">
        <ImageStudioClient />
      </div>
      <div className={activeTab === 'publish' ? '' : 'hidden'} data-create-pane="publish">
        {/* publish tab 是抽屉式（PublishDirectorDrawer 已是一个 drawer 组件），
            这里给个静态说明卡 + 按钮重新开抽屉 */}
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <Send className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="space-y-2">
              <h2 className="text-base font-semibold">全流程发布（publish-director）</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                串连 文案生成 → 图片生成 → 任务回写。如果抽屉没自动打开，点下面按钮再开一次。
              </p>
              <button
                type="button"
                onClick={() => setPubDrawerOpen(true)}
                className="btn-primary inline-flex items-center gap-1.5"
                data-v012-b3-publish-reopen
              >
                <Send size={14} aria-hidden="true" />
                打开 publish-director
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* publish-director 抽屉 · 全 tab 公用一个实例 */}
      <PublishDirectorDrawer
        open={pubDrawerOpen}
        onClose={() => {
          setPubDrawerOpen(false);
          if (activeTab === 'publish') {
            // 关闭抽屉时把 URL 切回 content tab，避免下次进 publish 还是抽屉关闭状态
            go('content');
          }
        }}
      />

      {/* 浮动 agent 按钮 · 按当前 tab 切换不同 slug
          - content tab → copy-writer 文案撰写助手
          - image   tab → prompt-coach 图片提示词教练
          - publish tab → 不显示（避免与 director 抽屉冲突） */}
      {activeTab === 'content' && <AgentLauncher slug="copy-writer" />}
      {activeTab === 'image' && <AgentLauncher slug="prompt-coach" />}
    </div>
  );
}
