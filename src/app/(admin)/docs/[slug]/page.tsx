// v0.11 B6 · /docs/[slug] 单篇渲染（server component · SSR · 0 客户端 markdown 解析）
// v0.11 B7 fix #2: 移除 force-dynamic, 让 generateStaticParams 真正生效 ——
//   B6 walk 抓到 /docs/bogus-slug 返回 200 (而不是 404).
//   原因: 'force-dynamic' 强制每个 slug 都走运行时, notFound() 渲染 brand 404 body
//   但 HTTP status 仍是 200. 改为静态预渲染后, 9 个合法 slug 进 SSG, 其它路径
//   (任何 bogus slug) 走 dynamicParams=false 路径 → Next.js 返回真正的 404 status code.
//
// 安全性:
//   - DOCS_CONTENT_MAP 是构建期生成的 JS bundle 字符串字面量, 0 fs 调用, 0 运行时变量
//   - generateStaticParams 列出 9 个 slug, dynamicParams=false 拒绝其它任何 slug
//   - 9 篇文档内容静态 → 与 B6 设计意图一致 (markdown 内容嵌入 bundle, 不依赖运行时 fs)

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  DOCS_ENTRIES,
  loadDocBySlug,
  listDocSlugs,
} from '@/lib/docs';
import { renderMarkdown } from '@/lib/docs/render';
import DocsLayout from '../DocsLayout';

// v0.11 B7: 不再设 force-dynamic，改用静态生成 + dynamicParams=false 让 unknown slug → 真 404
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return listDocSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const found = loadDocBySlug(params.slug);
  if (!found) {
    return { title: '未找到 · 使用手册' };
  }
  return {
    title: `${found.entry.title} · 使用手册`,
    description: found.entry.description,
  };
}

export default function DocSlugPage({
  params,
}: {
  params: { slug: string };
}) {
  const found = loadDocBySlug(params.slug);
  if (!found) {
    // 兜底: 理论上 dynamicParams=false 已让 unknown slug 走 next 内置 404 chain,
    // 但 generateStaticParams 列错时这里 notFound() 也会走 (admin)/not-found.tsx
    notFound();
  }
  const html = renderMarkdown(found.content);
  return (
    <DocsLayout entries={DOCS_ENTRIES} active={found.entry} html={html} />
  );
}
