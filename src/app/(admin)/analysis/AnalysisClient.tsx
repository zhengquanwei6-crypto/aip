'use client';

import { useState } from 'react';
import { Loader2, ExternalLink, Target, Palette, FileText } from 'lucide-react';
import { KeyOverrideSelector, useKeyOverride } from '@/components/key-override/KeyOverrideSelector';

interface AnalysisOutput {
  dataOverview: string;
  directions: { title: string; reason: string; example?: string }[];
  visualTrends: string;
  sources: { title: string; url: string }[];
}

interface Resp {
  ok: boolean;
  topic?: string;
  platform?: string;
  queries?: string[];
  analysis?: AnalysisOutput;
  timing?: { searchMs: number; analyzeMs: number; totalMs: number };
  error?: string;
}

const PLATFORM_OPTIONS = [
  { value: '', label: '不限' },
  { value: '小红书', label: '小红书' },
  { value: '闲鱼', label: '闲鱼' },
  { value: '淘宝', label: '淘宝' },
  { value: '抖音', label: '抖音' },
  { value: 'B站', label: 'B站' },
];

export default function AnalysisClient() {
  const keyOverride = useKeyOverride('analysis');
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('小红书');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState<Resp | null>(null);

  async function run() {
    if (!topic.trim() || loading) return;
    setLoading(true); setResult(null); setStage('AI 拆解搜索词...');
    const t1 = setTimeout(() => setStage('正在联网搜索（这一步约 10-30 秒）...'), 2000);
    const t2 = setTimeout(() => setStage('AI 综合分析中...'), 30000);
    try {
      const r = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), platform, keyOverride }),
      });
      const j = await r.json();
      clearTimeout(t1); clearTimeout(t2);
      setResult(j);
    } catch (e) {
      clearTimeout(t1); clearTimeout(t2);
      setResult({ ok: false, error: (e as Error).message });
    } finally { setLoading(false); setStage(''); }
  }

  const a = result?.analysis;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="command-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold text-cyan-200">
              <span className="pulse-dot" aria-hidden />
              AI Analysis
            </div>
            <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">AI 分析</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              输入主题，AI 联网搜集真实数据，输出选题方向、视觉趋势和可追溯来源。
            </p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/5 p-2">
            <KeyOverrideSelector scope="analysis" show={['llm']} />
          </div>
        </div>
      </header>

      <div className="command-glass">
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-slate-500">主题</label>
              <input
                className="input command-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例如：今日平面设计类目爆款主体"
                disabled={loading}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">平台</label>
              <select className="input command-input" value={platform} onChange={(e) => setPlatform(e.target.value)} disabled={loading}>
                {PLATFORM_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <button onClick={run} disabled={loading || !topic.trim()} className="btn-primary inline-flex items-center gap-1">
              {loading ? <><Loader2 className="animate-spin" size={14} /> {stage || '...'}</> : '开始分析'}
            </button>
          </div>
        </div>
      </div>

      {result && !result.ok && (
        <div className="command-glass">
          <div className="p-4 text-sm text-red-600 sm:p-5">{result.error}</div>
        </div>
      )}

      {result?.ok && a && (
        <>
          {result.queries && result.queries.length > 0 && (
            <div className="text-xs text-slate-500">
              AI 用的搜索词：{result.queries.map((q, i) => <span key={i} className="mr-1 inline-block rounded border border-slate-200 bg-white/100 px-2 py-0.5 dark:border-slate-800 dark:bg-slate-950/100">{q}</span>)}
            </div>
          )}

          <div className="command-glass">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="inline-flex items-center gap-1 font-semibold"><FileText size={16}/> 数据概览</h2></div>
            <div className="whitespace-pre-wrap p-4 text-sm leading-relaxed sm:p-5">{a.dataOverview}</div>
          </div>

          {a.directions && a.directions.length > 0 && (
            <div className="command-glass">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="inline-flex items-center gap-1 font-semibold"><Target size={16}/> 选题方向（{a.directions.length}）</h2></div>
              <div className="space-y-3 p-4 sm:p-5">
                {a.directions.map((d, i) => (
                  <div key={i} className="border-l-4 border-orange-300 dark:border-orange-700 pl-3 py-1">
                    <div className="font-medium text-sm">{i + 1}. {d.title}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{d.reason}</div>
                    {d.example && <div className="text-xs text-slate-500 mt-1 italic">例：{d.example}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="command-glass">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="inline-flex items-center gap-1 font-semibold"><Palette size={16}/> 视觉风格趋势</h2></div>
            <div className="whitespace-pre-wrap p-4 text-sm leading-relaxed sm:p-5">{a.visualTrends}</div>
          </div>

          {a.sources && a.sources.length > 0 && (
            <div className="command-glass">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="font-semibold">参考来源</h2></div>
              <div className="space-y-2 p-4 sm:p-5">
                {a.sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 hover:underline">
                    [{i + 1}] {s.title} <ExternalLink className="inline" size={12} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {result.timing && (
            <div className="text-xs text-slate-400">
              用时：搜索 {(result.timing.searchMs/1000).toFixed(1)}s · 分析 {(result.timing.analyzeMs/1000).toFixed(1)}s（共 {(result.timing.totalMs/1000).toFixed(1)}s）
            </div>
          )}
        </>
      )}
    </div>
  );
}
