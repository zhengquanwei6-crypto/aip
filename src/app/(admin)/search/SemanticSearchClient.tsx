'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search as SearchIcon, Sparkles, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface HistoryHit {
  id: string;
  score: number;
  type: string;
  input: string;
  output: string;
  model: string;
  createdAt: string;
}

interface AssetHit {
  id: string;
  score: number;
  type: string;
  platform: string | null;
  category: string | null;
  url: string;
  prompt: string;
  createdAt: string;
}

interface Props {
  initialStatus: {
    enabled: boolean;
    history: { exists: boolean; rows: number };
    assets: { exists: boolean; rows: number };
  };
}

type Tab = 'history' | 'assets';

function shorten(s: string, max: number): string {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function tryParseJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

function previewHistory(item: HistoryHit): { title: string; body: string } {
  const inJson = tryParseJson(item.input);
  const outJson = tryParseJson(item.output);
  const title = (() => {
    if (inJson?.prompt) return shorten(inJson.prompt, 60);
    if (inJson?.q) return shorten(inJson.q, 60);
    if (inJson?.firstUser) return shorten(inJson.firstUser, 60);
    return `[${item.type}]`;
  })();
  const body = (() => {
    if (outJson?.content) return shorten(outJson.content, 200);
    if (outJson?.urls) return `→ ${outJson.urls.length} 张图`;
    if (outJson?.error) return `❌ ${shorten(String(outJson.error), 200)}`;
    return shorten(item.output || '', 200);
  })();
  return { title, body };
}

export default function SemanticSearchClient({ initialStatus }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams?.get('q') ?? '');
  const [tab, setTab] = useState<Tab>((searchParams?.get('t') === 'assets' ? 'assets' : 'history') as Tab);
  const [historyHits, setHistoryHits] = useState<HistoryHit[]>([]);
  const [assetHits, setAssetHits] = useState<AssetHit[]>([]);
  const [loading, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function runSearch(query: string, target: Tab) {
    if (!query.trim()) {
      if (target === 'history') setHistoryHits([]);
      else setAssetHits([]);
      return;
    }
    setErr(null);
    try {
      const res = await fetch('/api/vector/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: target, q: query, topK: 30 }),
      });
      const j = await res.json();
      if (!j.ok) {
        setErr(j.error || '搜索失败');
        return;
      }
      if (target === 'history') setHistoryHits(j.items || []);
      else setAssetHits(j.items || []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  // 自动用初始 q 触发一次
  useEffect(() => {
    const initialQ = searchParams?.get('q');
    if (initialQ && initialQ.trim()) {
      startTransition(() => {
        void runSearch(initialQ, tab);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    const trimmed = q.trim();
    const sp = new URLSearchParams();
    if (trimmed) sp.set('q', trimmed);
    if (tab === 'assets') sp.set('t', 'assets');
    router.replace('/search' + (sp.toString() ? '?' + sp.toString() : ''));
    startTransition(() => {
      void runSearch(trimmed, tab);
    });
  }

  function switchTab(next: Tab) {
    setTab(next);
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (next === 'assets') sp.set('t', 'assets');
    else sp.delete('t');
    router.replace('/search?' + sp.toString());
    if (q.trim()) {
      startTransition(() => {
        void runSearch(q.trim(), next);
      });
    }
  }

  const hits = tab === 'history' ? historyHits : assetHits;

  return (
      <div className="space-y-4">
            {!initialStatus.enabled && (
        <div className="command-glass border-amber-300/70 p-4 text-amber-900 dark:border-amber-700/70 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="text-sm">
              向量数据库未启用。去 <Link href="/settings" className="font-medium underline">/settings</Link> 配置 Zilliz endpoint。
            </div>
          </div>
        </div>
      )}

      {/* 搜索框 */}
      <form
        className="command-glass flex items-center gap-2 px-3 py-2 transition-colors focus-within:border-cyan-400 dark:focus-within:border-cyan-600"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <SearchIcon className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === 'history' ? '搜历史输出 · 例：小红书包装设计案例 / image generation' : '搜素材 · 例：封面 / 紫色 mascot'}
          className="flex-1 bg-transparent outline-none text-sm sm:text-base"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-1"
          >
            清空
          </button>
        )}
        <button type="submit" className="btn-primary text-xs px-3 py-1.5" disabled={loading || !q.trim()}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '搜索'}
        </button>
      </form>

      {/* tab 切换 */}
      <div className="command-toolbar flex items-center gap-2 overflow-x-auto">
        {[
          { v: 'history' as Tab, label: '历史输出', icon: Sparkles, count: initialStatus.history.rows },
          { v: 'assets' as Tab, label: '素材', icon: ImageIcon, count: initialStatus.assets.rows },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.v;
          return (
            <button
              key={t.v}
              type="button"
              onClick={() => switchTab(t.v)}
              className={clsx(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                isActive
                  ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-slate-200 bg-white/70 text-slate-600 hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:border-cyan-800',
              )}
            >
              <Icon size={14} aria-hidden />
              {t.label}
              <span className="text-[10px] text-slate-400 tabular-nums">({t.count})</span>
            </button>
          );
        })}
      </div>

      {/* 错误条 */}
      {err && (
        <div className="command-glass border-red-300/70 p-3 text-sm text-red-700 dark:border-red-800/70 dark:text-red-300">
          {err}
        </div>
      )}

      {/* 结果列表 */}
      {!q.trim() ? (
        <div className="command-glass py-12 text-center text-sm text-slate-400">
          输入关键词开始语义搜索（支持中英混合、模糊匹配）
        </div>
      ) : loading ? (
        <div className="command-glass inline-flex w-full items-center justify-center gap-2 py-12 text-center text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          搜索中…
        </div>
      ) : hits.length === 0 ? (
        <div className="command-glass py-12 text-center text-sm text-slate-400">
          没有相关结果。试试换个关键词。
        </div>
      ) : tab === 'history' ? (
        <ul className="space-y-2">
          {historyHits.map((h) => {
            const { title, body } = previewHistory(h);
            return (
              <li
                key={h.id}
                className="command-glass detail-lift p-3 transition-colors hover:border-cyan-300 dark:hover:border-cyan-700"
              >
                <div className="flex items-center gap-2 mb-1 text-xs">
                  <span className="badge badge-blue">{h.type}</span>
                  <span className="text-slate-400 tabular-nums">{(h.score * 100).toFixed(0)}%</span>
                  <span className="text-slate-400 font-mono truncate">{h.model}</span>
                  <span className="text-slate-400 ml-auto">{new Date(h.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
                </div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-all line-clamp-2">{body}</div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {assetHits.map((a) => (
            <Link
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener"
              className="command-glass detail-lift block overflow-hidden transition-colors hover:border-cyan-400 dark:hover:border-cyan-600"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.prompt}
                loading="lazy"
                className="w-full aspect-square object-cover bg-slate-100 dark:bg-slate-800"
              />
              <div className="p-2 text-xs">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="badge badge-purple text-[9px]">{a.type}</span>
                  <span className="text-slate-400 tabular-nums">{(a.score * 100).toFixed(0)}%</span>
                </div>
                <div className="text-slate-600 dark:text-slate-300 line-clamp-2">{a.prompt || '(无 prompt)'}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
