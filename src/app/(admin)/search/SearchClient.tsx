'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search, ExternalLink, Sparkles } from 'lucide-react';
import { KeyOverrideSelector, useKeyOverride } from '@/components/key-override/KeyOverrideSelector';

interface Source { title: string; url: string; content: string; score: number; }
interface SearchResp {
  ok: boolean;
  query?: string;
  optimizedQuery?: string;
  summary?: string;
  tavilyAnswer?: string;
  sources?: Source[];
  timing?: { optimizeMs: number; searchMs: number; summarizeMs: number; totalMs: number };
  error?: string;
}

export default function SearchClient({ initialQuery }: { initialQuery: string }) {
  const keyOverride = useKeyOverride('search');
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState<SearchResp | null>(null);

  useEffect(() => {
    if (initialQuery) void run(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(q: string) {
    if (!q.trim()) return;
    setLoading(true); setResult(null); setStage('优化搜索词...');
    const t1 = setTimeout(() => setStage('正在联网搜索...'), 1500);
    const t2 = setTimeout(() => setStage('AI 总结中...'), 5000);
    try {
      const r = await fetch('/api/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim(), keyOverride }),
      });
      const j = await r.json();
      clearTimeout(t1); clearTimeout(t2);
      setResult(j);
      // 更新 URL 但不重新加载
      const params = new URLSearchParams({ q: q.trim() });
      window.history.replaceState(null, '', `/search?${params}`);
    } catch (e) {
      clearTimeout(t1); clearTimeout(t2);
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setLoading(false); setStage('');
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="text-blue-500" size={24} />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">AI 搜</h1>
          <p className="text-xs text-slate-500">问任何问题，AI 会联网查实时信息再给你总结</p>
        </div>
        <KeyOverrideSelector scope="search" show={['llm']} />
      </div>

      <div className="card">
        <div className="card-body">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) void run(query); }}
              placeholder="例如：小红书今日平面设计类目爆款主体是什么"
              disabled={loading}
              autoFocus
            />
            <button onClick={() => run(query)} disabled={loading || !query.trim()} className="btn-primary inline-flex items-center gap-1">
              {loading ? <><Loader2 className="animate-spin" size={14} /> {stage || '...'}</> : <><Search size={14} /> 搜索</>}
            </button>
          </div>
        </div>
      </div>

      {result && !result.ok && (
        <div className="card">
          <div className="card-body text-red-600 text-sm">✗ {result.error}</div>
        </div>
      )}

      {result?.ok && (
        <>
          {result.optimizedQuery && result.optimizedQuery !== query && (
            <div className="text-xs text-slate-500">
              已自动优化搜索词：<span className="font-mono">{result.optimizedQuery}</span>
            </div>
          )}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold">📝 AI 总结</h2>
            </div>
            <div className="card-body whitespace-pre-wrap leading-relaxed text-sm">
              {result.summary}
            </div>
          </div>

          {result.sources && result.sources.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold">🔗 来源（{result.sources.length}）</h2>
              </div>
              <div className="card-body space-y-3">
                {result.sources.map((s, i) => (
                  <div key={i} className="border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
                      [{i + 1}] {s.title} <ExternalLink size={12} />
                    </a>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.content?.slice(0, 200)}...</p>
                    <div className="text-[10px] text-slate-400 mt-1 break-all">{s.url} · 相关性 {(s.score * 100).toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.timing && (
            <div className="text-xs text-slate-400">
              用时：优化 {(result.timing.optimizeMs/1000).toFixed(1)}s · 搜索 {(result.timing.searchMs/1000).toFixed(1)}s · 总结 {(result.timing.summarizeMs/1000).toFixed(1)}s（共 {(result.timing.totalMs/1000).toFixed(1)}s）
            </div>
          )}
        </>
      )}
    </div>
  );
}
