// v0.11 B6 · /docs/[slug] 单篇渲染（server component · SSR · 0 客户端 markdown 解析）
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  DOCS_ENTRIES,
  loadDocBySlug,
  listDocSlugs,
} from '@/lib/docs';
import { renderMarkdown } from '@/lib/docs/render';
import DocsLayout from '../DocsLayout';

export const dynamic = 'force-dynamic';

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
    notFound();
  }
  const html = renderMarkdown(found.content);
  return (
    <DocsLayout entries={DOCS_ENTRIES} active={found.entry} html={html} />
  );
}
