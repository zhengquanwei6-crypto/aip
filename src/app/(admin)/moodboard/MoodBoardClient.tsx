'use client';

/**
 * v0.16-H4.2 · /moodboard · 智能 Mood Board 生成器
 *
 * 用户场景: 输入主题 → 5 秒生成 mood board (向量召回 + 颜色聚类 + 自适应排版)
 */

import { useState } from 'react';
import { Loader2, Palette, Download, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/toast';

interface MoodImage {
  id: string;
  url: string;
  dominantHex: string;
  prompt?: string;
}

interface ToneGroup {
  tone: string;
  toneHex: string;
  count: number;
}

interface Result {
  ok: boolean;
  theme?: string;
  images?: MoodImage[];
  palette?: string[];
  groups?: ToneGroup[];
  composedDataUrl?: string;
  genomeAvoided?: boolean;
  durationMs?: number;
  error?: string;
}

const COUNT_OPTIONS = [6, 9, 12] as const;

export default function MoodBoardClient() {
  const [theme, setTheme] = useState('');
  const [refCount, setRefCount] = useState<6 | 9 | 12>(9);
  const [avoidGenome, setAvoidGenome] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function generate() {
    if (!theme.trim()) {
      toast.error('请输入主题');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch('/api/moodboard/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: theme.trim(), refCount, avoidGenome }),
      });
      const j = await r.json();
      setResult(j);
      if (!j.ok) toast.error(j.error || '生成失败');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function downloadComposed() {
    if (!result?.composedDataUrl) return;
    const a = document.createElement('a');
    a.href = result.composedDataUrl;
    a.download = `moodboard-${(result.theme || 'untitled').slice(0, 20)}.png`;
    a.click();
  }

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-4 space-y-4">
      <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Palette size={20} className="text-brand-600 dark:text-brand-400" />
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            🎯 智能 Mood Board · 灵感板
          </h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          输入主题 → 向量召回相似作品 + 色调聚类 + 自适应排版生成可下载的 mood board
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div>
          <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            主题（例如：极简风咖啡店 logo / 莫兰迪色冬日早餐）
          </label>
          <textarea
            className="input mt-1 w-full"
            rows={2}
            maxLength={200}
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="输入一个主题描述..."
            disabled={busy}
          />
          <div className="text-[10px] text-slate-400 mt-0.5 text-right">
            {theme.length} / 200
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">参考图数量</label>
            <div className="mt-1 flex gap-1.5">
              {COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setRefCount(n)}
                  disabled={busy}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    refCount === n
                      ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-slate-700 hover:border-brand-300'
                  }`}
                >
                  {n} 张
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">智能选项</label>
            <label className="mt-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={avoidGenome}
                onChange={(e) => setAvoidGenome(e.target.checked)}
                disabled={busy}
                className="rounded"
              />
              <span className="text-sm">🧬 避同求异（与你常用色板降权）</span>
            </label>
          </div>
        </div>

        <button
          onClick={generate}
          disabled={busy || !theme.trim()}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          {busy ? (
            <><Loader2 className="animate-spin" size={14} /> 生成中...</>
          ) : (
            <><Sparkles size={14} /> 生成 Mood Board ({refCount} 张)</>
          )}
        </button>
      </div>

      {result && !result.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          ✗ {result.error}
        </div>
      )}

      {result?.ok && (
        <>
          {/* 信息条 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center gap-3 text-xs">
            <span className="text-slate-500">主题: <span className="text-slate-800 dark:text-slate-200 font-medium">{result.theme}</span></span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">{result.images?.length} 张</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">{((result.durationMs ?? 0) / 1000).toFixed(1)}s</span>
            {result.genomeAvoided && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-emerald-600 dark:text-emerald-400">🧬 已避开常用风格</span>
              </>
            )}
            <div className="ml-auto flex gap-2">
              {result.composedDataUrl && (
                <button onClick={downloadComposed} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Download size={12} /> 下载 PNG
                </button>
              )}
              <button onClick={generate} disabled={busy} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                <RefreshCw size={12} /> 重新生成
              </button>
            </div>
          </div>

          {/* 拼图 */}
          {result.composedDataUrl && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
              <img src={result.composedDataUrl} alt="mood board" className="w-full rounded-lg" />
            </div>
          )}

          {/* 色板 */}
          {result.palette && result.palette.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-semibold mb-2">🎨 色板</h3>
              <div className="grid grid-cols-5 gap-2">
                {result.palette.map((c, i) => (
                  <div key={i}>
                    <div className="aspect-square rounded-lg border border-slate-200 dark:border-slate-700" style={{ background: c }} />
                    <div className="text-center mt-1 text-[10px] font-mono text-slate-500">{c}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 色调分组 */}
          {result.groups && result.groups.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-semibold mb-3">🌈 色调构成</h3>
              <div className="flex flex-wrap gap-2">
                {result.groups.map((g, i) => (
                  <div key={i} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-xs">
                    <span className="w-3 h-3 rounded-full border border-white dark:border-slate-800" style={{ background: g.toneHex }} />
                    <span className="font-medium">{g.tone}</span>
                    <span className="text-slate-400">{g.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 单张参考 */}
          {result.images && result.images.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-semibold mb-3">🖼 参考素材 ({result.images.length})</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {result.images.map((img) => (
                  <a key={img.id} href={img.url} target="_blank" rel="noreferrer" className="group block">
                    <div className="aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                      <img src={img.url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="w-3 h-3 rounded-full border border-slate-200 dark:border-slate-700" style={{ background: img.dominantHex }} />
                      <span className="text-[10px] font-mono text-slate-500">{img.dominantHex}</span>
                    </div>
                    {img.prompt && (
                      <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{img.prompt}</div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
