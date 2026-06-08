'use client';

/**
 * v0.16-K1 · /ai-tools/prompt-gen · 提示词生成器（优化版）
 *
 * 用户输入主题 → LLM 按平台调性生成 N 条 image prompt
 * 用户复制 prompt 到外部平台（Midjourney / SD / Flux / DALL-E）出图
 *
 * v0.15-k → v0.16-K1 升级点：
 *   1. **language 选择**：英文 / 中文 / 双语 三档（用户提的核心需求）
 *   2. **6 平台**：原 4 + douyin (9:16) + taobao (1:1 高饱和)
 *   3. **每条 prompt 显示更多信息**：cameraAngle chip + negativePrompt 折叠
 *      + mjCommand 一键复制（不用手动拼 --ar/--v）
 *   4. **三种复制按钮**：英文 prompt / 中文 prompt / MJ 完整命令
 *   5. **三档语言下显示策略**：仅英文 / 仅中文 / 双语 — UI 自动适配
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Wand2, Copy, Check, Sparkles, ChevronDown, Clock, RotateCw, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/toast';

type Platform =
  | 'xiaohongshu'
  | 'xianyu'
  | 'qianniu'
  | 'douyin'
  | 'taobao'
  | 'general';

type Language = 'en' | 'zh' | 'both';

interface GeneratedPrompt {
  promptEn: string;
  promptZh: string;
  mjCommand: string;
  modelOutputs: Record<string, string>;
  style: string;
  cameraAngle: string;
  negativePrompt: string;
  aspectRatio: string;
}

interface ApiResponse {
  ok: boolean;
  theme?: string;
  platform?: Platform;
  platformLabel?: string;
  language?: Language;
  languageLabel?: string;
  count?: number;
  prompts?: GeneratedPrompt[];
  timing?: { totalMs: number };
  model?: string;
  error?: string;
  raw?: string;
}

const PLATFORM_OPTIONS: { value: Platform; label: string; desc: string; ratio: string }[] = [
  { value: 'xiaohongshu', label: '小红书', desc: '莫兰迪 / ins / 留白', ratio: '3:4' },
  { value: 'douyin', label: '抖音', desc: '竖屏 / 高饱和 / 动感', ratio: '9:16' },
  { value: 'xianyu', label: '闲鱼', desc: '白底商品 / 电商风', ratio: '1:1' },
  { value: 'taobao', label: '淘宝主图', desc: '高饱和 / banner', ratio: '1:1' },
  { value: 'qianniu', label: '千牛', desc: '高端品牌 / 场景', ratio: '16:9' },
  { value: 'general', label: '通用', desc: '自由风格', ratio: '16:9' },
];

const LANGUAGE_OPTIONS: { value: Language; label: string; sub: string }[] = [
  { value: 'en', label: '英文', sub: 'MJ / SD / Flux 直接出图' },
  { value: 'zh', label: '中文', sub: '本地 RAG / 中文图模 / 设计沟通' },
  { value: 'both', label: '中英双语', sub: '英文出图 + 中文人工核对' },
];

const COUNT_OPTIONS = [3, 5, 10] as const;

/**
 * 8 大主流生图模型清单 — 决定每条 prompt 卡片底部 chip 的顺序与展示文案。
 * key 必须与后端 `modelOutputs` 键名一一对应。
 *
 * 顺序 = 推荐优先级（gpt-image-2 排在 GPT 系列首位，是项目核心模型）。
 */
const TARGET_MODELS: {
  key: string;
  label: string;
  hint: string;
  href?: string;
}[] = [
  { key: 'gpt-image-2', label: 'GPT-Image-2', hint: 'KIE adapter · 项目核心', href: 'https://kie.ai/' },
  { key: 'midjourney', label: 'Midjourney v7', hint: '命令式 inline flag', href: 'https://www.midjourney.com/' },
  { key: 'flux', label: 'Flux 1.1 / Flux 2', hint: 'BFL Playground / fal.ai', href: 'https://fal.ai/models/fal-ai/flux-pro' },
  { key: 'sd', label: 'Stable Diffusion 3.5', hint: 'Prompt + Negative 两段', href: 'https://stability.ai/' },
  { key: 'gpt-image-1', label: 'GPT-Image-1', hint: 'OpenAI Images API', href: 'https://platform.openai.com/docs/guides/images' },
  { key: 'dalle-3', label: 'DALL·E 3', hint: 'OpenAI · 1792x1024 等', href: 'https://platform.openai.com/docs/guides/images' },
  { key: 'imagen', label: 'Google Imagen 3', hint: 'aspectRatio enum', href: 'https://aistudio.google.com/' },
  { key: 'qwen-image', label: '阿里 Qwen-Image', hint: '中文优先（自动降级英文）', href: 'https://tongyi.aliyun.com/' },
];

export default function PromptGenClient() {
  const [theme, setTheme] = useState('');
  const [platform, setPlatform] = useState<Platform>('xiaohongshu');
  const [count, setCount] = useState<3 | 5 | 10>(5);
  const [language, setLanguage] = useState<Language>('en');
  const [activeModel, setActiveModel] = useState<string>('gpt-image-2');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [openNegIdx, setOpenNegIdx] = useState<number | null>(null);

  // C8 history — 持久化 prompt-gen 输出，支持一键重看 / 复用
  interface HistoryItem {
    id: string;
    model?: string;
    createdAt: string;
    summary: {
      theme?: string;
      platform?: string;
      language?: string;
      count?: number;
      firstTitle?: string;
    };
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  }
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await fetch('/api/ai-tools/prompt-gen/history?limit=30', { cache: 'no-store' });
      const j = await r.json();
      if (j.ok && Array.isArray(j.items)) setHistory(j.items);
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function reuseHistory(item: HistoryItem) {
    const i = item.input as { theme?: string; platform?: Platform; count?: 3 | 5 | 10; language?: Language };
    if (i.theme) setTheme(i.theme);
    if (i.platform) setPlatform(i.platform);
    if (typeof i.count === 'number' && (i.count === 3 || i.count === 5 || i.count === 10)) setCount(i.count);
    if (i.language) setLanguage(i.language);
    // 同时把这条历史的输出直接展示出来
    setResult({ ok: true, ...(item.output as Partial<ApiResponse>) } as ApiResponse);
    toast.success('已恢复主题 + 上次结果');
  }

  const showEn = language === 'en' || language === 'both';
  const showZh = language === 'zh' || language === 'both';

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
        body: JSON.stringify({
          theme: theme.trim(),
          platform,
          count,
          language,
        }),
      });
      const j = (await r.json()) as ApiResponse;
      setResult(j);
      if (!j.ok) toast.error(j.error || '生成失败');
      else {
        // 成功后刷新历史列表（异步，失败不影响主流程）
        fetchHistory();
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(text: string, key: string, label: string) {
    if (!text) {
      toast.error('该字段为空');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(`已复制 ${label}`);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      toast.error('复制失败，请手动选中文本');
    }
  }

  const currentRatio =
    PLATFORM_OPTIONS.find((p) => p.value === platform)?.ratio || '16:9';

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4">
      <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-2">
          <Wand2 size={20} className="text-brand-600 dark:text-brand-400" />
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            AI 提示词生成器
          </h1>
          <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded border border-brand-300 text-brand-600 dark:text-brand-400">
            v0.16-K3
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          输入主题 → 选平台 / 语言 / 数量 → 生成 N 条 prompt，一键切到 8 大主流生图模型（GPT-Image-2 / MJ / Flux / SD / GPT-Image-1 / DALL·E 3 / Imagen / Qwen）直接复制
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        {/* 主题输入 */}
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

        {/* 6 平台选择 */}
        <div>
          <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            目标平台
          </label>
          <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
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
                <div className="font-semibold flex items-center justify-between">
                  <span>{p.label}</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {p.ratio}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 语言 + 数量 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* NEW · 语言选择 */}
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              输出语言
              <span className="ml-1 text-[10px] font-mono text-brand-500">NEW</span>
            </label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {LANGUAGE_OPTIONS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLanguage(l.value)}
                  disabled={loading}
                  className={`text-left px-2 py-1.5 rounded-lg border text-xs transition-colors ${
                    language === l.value
                      ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-slate-700 hover:border-brand-300'
                  }`}
                  title={l.sub}
                >
                  <div className="font-semibold">{l.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {l.sub}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 数量 */}
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              生成数量
            </label>
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
              <Sparkles size={14} /> 生成 {count} 条 prompt（{currentRatio}）
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
              <pre className="whitespace-pre-wrap mt-1 text-slate-500">
                {result.raw}
              </pre>
            </details>
          )}
        </div>
      )}

      {result?.ok && result.prompts && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
            <span>共 {result.count} 条</span>
            <span>·</span>
            <span>平台「{result.platformLabel}」</span>
            <span>·</span>
            <span className="text-brand-600 dark:text-brand-400">
              语言「{result.languageLabel}」
            </span>
            <span>·</span>
            <span>用时 {((result.timing?.totalMs ?? 0) / 1000).toFixed(1)}s</span>
            <span>·</span>
            <span>模型 {result.model || '?'}</span>
          </div>

          {/* 全局生图模型切换 — 一次切换所有卡片的复制目标 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium flex items-center gap-2">
              <span>复制目标 · 生图模型</span>
              <span className="text-[10px] font-mono text-brand-500">
                NEW
              </span>
              <span className="text-[10px] text-slate-400 font-normal ml-auto">
                切换后所有卡片同步
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
              {TARGET_MODELS.map((m) => {
                const active = activeModel === m.key;
                // 当 language=zh 时，除 qwen-image 外其它模型的 promptEn 为空，
                // 复制出来只剩 size 注释，意义不大 — 给视觉提示但不禁用
                const dimWhenZh =
                  language === 'zh' && m.key !== 'qwen-image';
                return (
                  <button
                    key={m.key}
                    onClick={() => setActiveModel(m.key)}
                    className={`text-left px-2 py-1.5 rounded-lg border text-xs transition-colors ${
                      active
                        ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                        : 'border-slate-200 dark:border-slate-700 hover:border-brand-300'
                    } ${dimWhenZh ? 'opacity-50' : ''}`}
                    title={m.hint}
                  >
                    <div className="font-semibold truncate">{m.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {m.hint}
                    </div>
                  </button>
                );
              })}
            </div>
            {language === 'zh' && activeModel !== 'qwen-image' && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400">
                ⚠ 当前语言为「中文」，但「{TARGET_MODELS.find((m) => m.key === activeModel)?.label}」需要英文 prompt。
                建议把语言切到「英文」或「中英双语」，或选「Qwen-Image」。
              </div>
            )}
          </div>

          {result.prompts.map((p, i) => (
            <PromptCard
              key={i}
              idx={i}
              prompt={p}
              showEn={showEn}
              showZh={showZh}
              activeModel={activeModel}
              onCopy={copyToClipboard}
              copiedKey={copiedKey}
              negOpen={openNegIdx === i}
              toggleNeg={() => setOpenNegIdx(openNegIdx === i ? null : i)}
            />
          ))}
        </div>
      )}

      {/* 历史记录 · 持久化到 DB，刷新页面也在 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={12} className="text-slate-500" />
          <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            历史记录 · 最近 30 次生成（本地数据库）
          </span>
          <button
            onClick={fetchHistory}
            disabled={historyLoading}
            className="ml-auto text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            title="刷新"
          >
            <RefreshCw size={10} className={historyLoading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
        {history.length === 0 ? (
          <div className="text-[11px] text-slate-400 py-3 text-center">
            {historyLoading ? '加载中...' : '还没有历史记录。生成一次后会自动保存。'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
            {history.map((h) => {
              const t = new Date(h.createdAt);
              const tLabel = !isNaN(t.getTime())
                ? t.toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '?';
              return (
                <button
                  key={h.id}
                  onClick={() => reuseHistory(h)}
                  className="text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 p-2 hover:border-brand-300 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                  title="点击恢复主题 + 重看上次结果"
                >
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="font-mono text-slate-400">{tLabel}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {h.summary.platform || '?'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {h.summary.language || 'en'}
                    </span>
                    <span className="ml-auto text-slate-400">
                      {h.summary.count || 0} 条
                    </span>
                    <RotateCw size={10} className="text-slate-400" />
                  </div>
                  <div className="mt-1 text-xs text-slate-700 dark:text-slate-200 truncate">
                    {h.summary.theme || '(无主题)'}
                  </div>
                  {h.summary.firstTitle && (
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">
                      首条：{h.summary.firstTitle}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** 单条 prompt 卡片 — 抽出来让主组件读起来不打架。 */
function PromptCard({
  idx,
  prompt,
  showEn,
  showZh,
  activeModel,
  onCopy,
  copiedKey,
  negOpen,
  toggleNeg,
}: {
  idx: number;
  prompt: GeneratedPrompt;
  showEn: boolean;
  showZh: boolean;
  activeModel: string;
  onCopy: (text: string, key: string, label: string) => void;
  copiedKey: string | null;
  negOpen: boolean;
  toggleNeg: () => void;
}) {
  const enKey = `en-${idx}`;
  const zhKey = `zh-${idx}`;
  const modelKey = `${activeModel}-${idx}`;
  const negKey = `neg-${idx}`;

  // 当前选中的目标模型字符串 — 来自后端 modelOutputs map
  const activeOutput = prompt.modelOutputs?.[activeModel] ?? '';
  const activeModelMeta = TARGET_MODELS.find((m) => m.key === activeModel);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5">
      {/* meta row · 编号 · style chip · cameraAngle chip · aspect chip */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-mono text-brand-600 dark:text-brand-400 font-semibold">
          #{idx + 1}
        </span>
        {prompt.style && (
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
            {prompt.style}
          </span>
        )}
        {prompt.cameraAngle && (
          <span className="px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 font-mono text-[10.5px]">
            {prompt.cameraAngle}
          </span>
        )}
        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
          {prompt.aspectRatio}
        </span>
      </div>

      {/* 英文 prompt — 总是显示（如果有），是各模型 output 的源头 */}
      {showEn && prompt.promptEn && (
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
            EN · prompt
          </div>
          <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-mono break-words">
            {prompt.promptEn}
          </div>
        </div>
      )}

      {/* 中文 prompt */}
      {showZh && prompt.promptZh && (
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
            ZH · 中文版
          </div>
          <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed break-words">
            {prompt.promptZh}
          </div>
        </div>
      )}

      {/* 负向 prompt — 折叠 */}
      {prompt.negativePrompt && (
        <div>
          <button
            onClick={toggleNeg}
            className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <ChevronDown
              size={12}
              className={`transition-transform ${negOpen ? '' : '-rotate-90'}`}
            />
            negative · 负向 prompt
          </button>
          {negOpen && (
            <div className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed font-mono break-words border-l-2 border-slate-200 dark:border-slate-700 pl-2">
              {prompt.negativePrompt}
            </div>
          )}
        </div>
      )}

      {/* 当前选中模型的最终输出预览 — 这块是用户实际复制的内容 */}
      {activeOutput && (
        <div className="rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50/40 dark:bg-brand-900/10 p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] text-brand-600 dark:text-brand-400 uppercase tracking-wider font-mono font-semibold">
              ▸ {activeModelMeta?.label ?? activeModel} · 可复制
            </div>
            {activeModelMeta?.href && (
              <a
                href={activeModelMeta.href}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline"
              >
                打开 ↗
              </a>
            )}
          </div>
          <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-mono whitespace-pre-wrap break-words">
            {activeOutput}
          </div>
        </div>
      )}

      {/* 操作行：主动作 = 复制当前模型；辅助 = 复制英 / 中 / 负向 */}
      <div className="flex items-center flex-wrap gap-1.5 pt-1">
        {/* 主按钮：复制当前选中模型的输出 */}
        {activeOutput && (
          <button
            onClick={() =>
              onCopy(
                activeOutput,
                modelKey,
                activeModelMeta?.label ?? activeModel,
              )
            }
            className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded border bg-brand-600 hover:bg-brand-700 text-white border-brand-600 font-semibold"
          >
            {copiedKey === modelKey ? (
              <>
                <Check size={12} /> 已复制 · {activeModelMeta?.label}
              </>
            ) : (
              <>
                <Copy size={12} /> 复制 · {activeModelMeta?.label}
              </>
            )}
          </button>
        )}

        {/* 辅助按钮：复制原始英文 / 中文 / 负向 */}
        {showEn && prompt.promptEn && (
          <CopyBtn
            label="只复制英文"
            isCopied={copiedKey === enKey}
            onClick={() => onCopy(prompt.promptEn, enKey, '英文 prompt')}
          />
        )}
        {showZh && prompt.promptZh && (
          <CopyBtn
            label="只复制中文"
            isCopied={copiedKey === zhKey}
            onClick={() => onCopy(prompt.promptZh, zhKey, '中文 prompt')}
          />
        )}
        {prompt.negativePrompt && (
          <CopyBtn
            label="只复制负向"
            isCopied={copiedKey === negKey}
            onClick={() =>
              onCopy(prompt.negativePrompt, negKey, '负向 prompt')
            }
          />
        )}
      </div>
    </div>
  );
}

function CopyBtn({
  label,
  isCopied,
  onClick,
}: {
  label: string;
  isCopied: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
    >
      {isCopied ? (
        <>
          <Check size={12} /> 已复制
        </>
      ) : (
        <>
          <Copy size={12} /> {label}
        </>
      )}
    </button>
  );
}
