// v0.11 B6 · /docs 默认入口 → 重定向到第一篇
import { redirect } from 'next/navigation';
import { DEFAULT_DOC_SLUG } from '@/lib/docs';

export const dynamic = 'force-dynamic';

export default function DocsIndexPage(): never {
  redirect(`/docs/${DEFAULT_DOC_SLUG}`);
}
