// v0.11 B6 · /docs 默认入口 — 直接渲染第 1 篇（DEFAULT_DOC_SLUG = '01-quick-start'）
//
// 设计：路线图原文 §3 B6 给两个选项二选一：
//   (a) /docs → redirect → /docs/01-quick-start
//   (b) /docs → 直接渲染第 1 篇
//
// 选 (b) 因为：
//   - Next.js next/navigation `redirect()` 在 server component 里某些路径下
//     会变成 200 + <meta http-equiv="refresh" content="1;url=...">（1 秒后客户端转），
//     不是真 HTTP 307/308。Playwright fetch redirect:'follow' 不跟 meta refresh，
//     测出来 /docs finalUrl 还是 /docs，看着像没生效
//   - 直接渲染第 1 篇没有这个问题，URL 保留 /docs，内容立即给出，体验更好
//   - /docs 与 /docs/01-quick-start 内容等价（点 ToC 可切其它篇）

import type { Metadata } from 'next';
import { DOCS_ENTRIES, loadDocBySlug, DEFAULT_DOC_SLUG } from '@/lib/docs';
import { renderMarkdown } from '@/lib/docs/render';
import DocsLayout from './DocsLayout';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '使用手册 · 快速开始',
  description: '5 分钟从零跑通：设置 LLM key → 第一个任务 → 第一次出图',
};

export default function DocsIndexPage() {
  const found = loadDocBySlug(DEFAULT_DOC_SLUG);
  // 不应发生：DEFAULT_DOC_SLUG 一定在 DOCS_ENTRIES 里。但仍兜底。
  if (!found) {
    return (
    <>
      <header className="page-hero"><h1>使用手册</h1><p>11 篇内置文档：快速上手 / 模块 / 工作流 / 故障排查。</p></header>
      <div className="text-slate-500 dark:text-slate-400">
        使用手册暂未生成。请联系管理员或重试。
      </div>
    </>
  );
  }
  const html = renderMarkdown(found.content);
  return <DocsLayout entries={DOCS_ENTRIES} active={found.entry} html={html} />;
}
