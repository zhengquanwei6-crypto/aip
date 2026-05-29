'use client';

/**
 * v0.15-k · /ai-tools/prompt-gen · 提示词生成器
 *
 * 用户输入简单主题（中文）→ LLM 按平台调性生成 N 条英文 prompt
 * 用户复制 prompt 到外部平台（Midjourney / SD / Flux / DALL-E）出图
 */

import { useState } from 'react';
import { Loader2, Wand2, Copy, Check, Sparkles } from 'lucide-react';
import { toast } from '@/lib/toast';

type Platform = 'xiaohongshu' | 'xianyu' | 'qianniu' | 'general';

interface GeneratedPrompt {
  promptEn: string;
  promptZh: string;
  style: string;
  aspectRatio: string;
}

interface ApiResponse {
  ok: boolean;
  theme?: string;
  platform?: Platform;
  platformLabel?: string;
  count?: number;
  prompts?: GeneratedPrompt[];
  timing?: { totalMs: number };
  model?: string;
  error?: string;
  raw?: string;
}

const PLATFORM_OPTIONS: { value: Platform; label: string; desc: string }[] = [
  { value: 'xiaohongshu', label: '小红书', desc: '莫兰迪 / ins 风 / 留白' },
  { value: 'xianyu', label: '闲鱼', desc: '白底商品 / 电商风' },
  { value: 'qianniu', label: '千牛', desc: '高端品牌 / 场景' },
  { value: 'general', label: '通用', desc: '自由风格' },
];

const COUNT_OPTIONS = [3, 5, 10] as const;

export default function PromptGenClient() {
  const [theme, setTheme] = useState('');
  const [platform, setPlatform] = useState<Platform>('xiaohongshu');
  const [count, setCount] = useState<3 | 5 | 10>(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function run() {
    if (!theme.trim()) {
      toast.error('请输入主题');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch('/api/ai-tools/prompt-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: theme.trim(), platform, count }),
      });
      const j = (await r.json()) as ApiResponse;
      setResult(j);
      if (!j.ok) toast.error(j.error || '生成失败');
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      toast.success('已复制');
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      toast.error('复制失败，请手动选中文本');
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4">
      <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-2">
          <Wand2 size={20} className="text-brand-600 dark:text-brand-400" />
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            AI 提示词生成器
          </h1>
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          输入主题 → 选平台 → 生成 N 条英文 image prompt，复制到 Midjourney / SD / Flux / DALL-E 直接出图
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div>
          <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            主题（最长 200 字，例如：莫兰迪色冬日早餐桌、复古旗袍人像）
          </label>
          <textarea
            className="input mt-1 w-full"
            rows={3}
            maxLength={200}
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="输入一个简单的主题描述..."
            disabled={loading}
          />
          <div className="text-[10px] text-slate-400 mt-0.5 text-right">
            {theme.length} / 200
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">目标平台</label>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {PLATFORM_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPlatform(p.value)}
                  disabled={loading}
                  className={`text-left px-2 py-1.5 rounded-lg border text-xs transition-colors ${
                    platform === p.value
                      ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-700'
                  }`}
                >
                  <div className="font-semibold">{p.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">生成数量</label>
            <div className="mt-1 flex gap-1.5">
              {COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  disabled={loading}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    count === n
                      ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-slate-700 hover:border-brand-300'
                  }`}
                >
                  {n} 条
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={run}
          disabled={loading || !theme.trim()}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={14} /> 生成中...
            </>
          ) : (
            <>
              <Sparkles size={14} /> 生成 {count} 条 prompt
            </>
          )}
        </button>
      </div>

      {result && !result.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          ✗ {result.error}
          {result.raw && (
            <details className="mt-2 text-xs">
              <summary>原始 LLM 输出</summary>
              <pre className="whitespace-pre-wrap mt-1 text-slate-500">{result.raw}</pre>
            </details>
          )}
        </div>
      )}

      {result?.ok && result.prompts && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            共 {result.count} 条 · 平台「{result.platformLabel}」 · 用时{' '}
            {((result.timing?.totalMs ?? 0) / 1000).toFixed(1)}s · 模型 {result.model || '?'}
          </div>
          {result.prompts.map((p, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
            >
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono text-brand-600 dark:text-brand-400 font-semibold">
                  #{i + 1}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                  {p.style}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                  {p.aspectRatio}
                </span>
              </div>
              <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-mono break-words">
                {p.promptEn}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                💡 {p.promptZh}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => copyToClipboard(p.promptEn, i)}
                  className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {copiedIdx === i ? (
                    <>
                      <Check size={12} /> 已复制
                    </>
                  ) : (
                    <>
                      <Copy size={12} /> 复制英文 prompt
                    </>
                  )}
                </button>
                <a
                  href={`https://www.midjourney.com/explore?prompt=${encodeURIComponent(p.promptEn)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                >
                  → Midjourney
                </a>
                <a
                  href={`https://stability.ai/`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                >
                  → SD
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
