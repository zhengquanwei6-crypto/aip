/**
 * v0.14-z79 · /search · 双 tab：网络搜索 (Tavily) + 语义搜索 (Zilliz)
 *
 * 默认 tab=web (用户原版网络搜索保留)
 * tab=semantic 走 Zilliz 全局检索
 */
import WebSearchClient from './WebSearchClient';
import SemanticSearchClient from './SemanticSearchClient';
import SearchTabs from './SearchTabs';
import { vectorStatus } from '@/lib/vector';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; mode?: string };
}) {
  const mode: 'web' | 'semantic' = searchParams.mode === 'semantic' ? 'semantic' : 'web';
  const q = searchParams.q || '';

  let status = {
    enabled: false,
    history: { exists: false, rows: 0 },
    assets: { exists: false, rows: 0 },
  };
  if (mode === 'semantic') {
    try {
      const s = await vectorStatus();
      status = { enabled: s.enabled, history: s.history, assets: s.assets };
    } catch { /* ignore */ }
  }

  return (
    <SearchTabs
      mode={mode}
      web={<WebSearchClient initialQuery={q} />}
      semantic={<SemanticSearchClient initialStatus={status} />}
    />
  );
}
