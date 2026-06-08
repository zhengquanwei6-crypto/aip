'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  Gauge,
  Info,
  Layers3,
  Loader2,
  Lock,
  Maximize2,
  PanelRight,
  Sparkles,
  Type,
  Upload,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

export type ImageMode = 't2i' | 'i2i';
export type ImageTier = '1k' | '2k' | '4k';

export interface AdapterOption {
  slug: string;
  name?: string;
  enabled?: boolean;
  supportsImg2Img?: boolean;
}

export interface GeneratedAsset {
  id?: string;
  url: string;
  prompt?: string;
  size?: string;
  aspectRatio?: string;
}

export interface ImageGenerateFormProps {
  adapters: AdapterOption[];
  defaultAdapter?: string | null;
  keyOverrideScope?: string;
  endpoint?: string;
  extraBody?: Record<string, unknown>;
  onGenerated?: (asset: GeneratedAsset) => void;
  hidePromptInput?: boolean;
  controlledPrompt?: string;
  initial?: {
    mode?: ImageMode;
    aspectRatio?: string;
    tier?: ImageTier;
    quality?: string;
    n?: number;
    prompt?: string;
  };
  compact?: boolean;
  controlled?: boolean;
  onChange?: (state: ImageFormState) => void;
}

export interface ImageFormState {
  mode: ImageMode;
  adapterSlug: string;
  aspectRatio: string;
  tier: ImageTier;
  quality: string;
  n: number;
  prompt: string;
  sourceImageUrl: string;
  sourceImageBase64: string;
}

interface RatioMeta {
  ratio: string;
  short: string;
  full: string;
  shape: 'square' | 'tallM' | 'tallL' | 'wideM' | 'wideL' | 'tallXL' | 'wideXL';
}

interface PresetCombo {
  ratio: string;
  tier: ImageTier;
  size: string;
  w: number;
  h: number;
}

const RATIOS: RatioMeta[] = [
  { ratio: '1:1', short: '方', full: '1:1 正方', shape: 'square' },
  { ratio: '2:3', short: '竖', full: '2:3 竖屏', shape: 'tallM' },
  { ratio: '3:2', short: '横', full: '3:2 横屏', shape: 'wideM' },
  { ratio: '3:4', short: '竖', full: '3:4 竖屏', shape: 'tallM' },
  { ratio: '4:3', short: '横', full: '4:3 横屏', shape: 'wideM' },
  { ratio: '4:5', short: '竖', full: '4:5 竖屏', shape: 'tallM' },
  { ratio: '5:4', short: '横', full: '5:4 横屏', shape: 'wideM' },
  { ratio: '9:16', short: '竖', full: '9:16 抖音', shape: 'tallL' },
  { ratio: '16:9', short: '横', full: '16:9 视频', shape: 'wideL' },
  { ratio: '1:2', short: '竖', full: '1:2 长竖', shape: 'tallXL' },
  { ratio: '2:1', short: '横', full: '2:1 长横', shape: 'wideXL' },
  { ratio: '9:21', short: '竖', full: '9:21 超长竖', shape: 'tallXL' },
  { ratio: '21:9', short: '横', full: '21:9 电影', shape: 'wideXL' },
];

const TIERS: { tier: ImageTier; label: string; sub: string; etaSec: string }[] = [
  { tier: '1k', label: '1K', sub: '快速草图', etaSec: '20-40s' },
  { tier: '2k', label: '2K', sub: '日常推荐', etaSec: '40-90s' },
  { tier: '4k', label: '4K', sub: '成片输出', etaSec: '70-180s' },
];

const QUALITIES: { value: string; label: string; sub: string }[] = [
  { value: 'low', label: '快', sub: '低成本' },
  { value: 'medium', label: '稳', sub: '平衡' },
  { value: 'high', label: '精', sub: '细节优先' },
];

const PROMPT_STARTERS = [
  '电商商品主图，干净背景，高级布光，突出材质和卖点',
  '小红书封面，视觉中心明确，真实生活方式场景，留出标题空间',
  '品牌海报，电影感光影，强层级构图，适合商业发布',
  '透明底图标或贴纸，主体完整，边缘干净，PNG 透明背景',
];

const PRODUCTION_RECIPES: {
  title: string;
  desc: string;
  prompt: string;
  ratio: string;
  tier: ImageTier;
  quality: string;
  transparent?: boolean;
}[] = [
  {
    title: '电商主图',
    desc: '商品质感 / 干净背景',
    prompt: '电商商品主图，单一主体居中，高级棚拍布光，冷灰或雾白背景，突出材质、结构和卖点，画面干净，可直接用于商品详情页。',
    ratio: '1:1',
    tier: '2k',
    quality: 'high',
  },
  {
    title: '小红书封面',
    desc: '真实生活方式 / 留标题区',
    prompt: '小红书封面，真实生活方式场景，人物或产品在画面中心，明亮自然光，顶部或侧边留出标题空间，视觉抓眼但不廉价。',
    ratio: '4:5',
    tier: '2k',
    quality: 'medium',
  },
  {
    title: '品牌海报',
    desc: '电影感 / 强层级',
    prompt: '品牌视觉海报，电影感光影，强层级构图，主体清晰，前景和背景有空间纵深，适合活动发布和高端社媒传播。',
    ratio: '16:9',
    tier: '4k',
    quality: 'high',
  },
  {
    title: '透明贴纸',
    desc: 'PNG 透明底 / 干净边缘',
    prompt: '透明底贴纸或 Logo 元素，主体完整，边缘干净，无背景，无阴影污染，适合后续合成、商品图叠加和社媒素材复用。',
    ratio: '1:1',
    tier: '2k',
    quality: 'high',
    transparent: true,
  },
];

const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

const DEFAULT_GPT_IMAGE_COMBOS: PresetCombo[] = RATIOS.flatMap((ratio) => {
  const tiers: ImageTier[] = ['1k', '2k'];
  if (['16:9', '9:16', '2:1', '1:2', '21:9', '9:21'].includes(ratio.ratio)) {
    tiers.push('4k');
  }
  return tiers.map((tier) => ({
    ratio: ratio.ratio,
    tier,
    size: `${tier.toUpperCase()} · ${ratio.ratio}`,
    w: 0,
    h: 0,
  }));
});

function Card({
  children,
  className = '',
  compact = false,
}: {
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        'studio-card transition-all duration-300',
        'hover:border-cyan-300 hover:shadow-lg hover:shadow-slate-200/70',
        'dark:border-slate-800 dark:bg-slate-950/75 dark:shadow-black/20 dark:hover:border-cyan-800',
        compact ? 'p-3' : 'p-4',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

function RatioGlyph({ shape, selected }: { shape: RatioMeta['shape']; selected: boolean }) {
  const dims: Record<RatioMeta['shape'], { w: number; h: number }> = {
    square: { w: 22, h: 22 },
    tallM: { w: 16, h: 22 },
    tallL: { w: 13, h: 24 },
    tallXL: { w: 10, h: 24 },
    wideM: { w: 22, h: 16 },
    wideL: { w: 24, h: 13 },
    wideXL: { w: 24, h: 10 },
  };
  const d = dims[shape];
  return (
    <span className="flex h-7 w-7 items-center justify-center">
      <span
        className={[
          'rounded-sm transition-all duration-300',
          selected
            ? 'bg-cyan-300 shadow-lg shadow-cyan-300/30'
            : 'bg-slate-300 group-hover:bg-cyan-400 dark:bg-slate-600',
        ].join(' ')}
        style={{ width: d.w, height: d.h }}
      />
    </span>
  );
}

interface SourceImageDropzoneProps {
  preview: string | null;
  onFileSelected: (file: File) => void;
  onClear: () => void;
  onUrlInput?: (url: string) => void;
  urlValue?: string;
}

function SourceImageDropzone({
  preview,
  onFileSelected,
  onClear,
  onUrlInput,
  urlValue,
}: SourceImageDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: ClipboardEvent) => {
      if (!event.clipboardData) return;
      for (let i = 0; i < event.clipboardData.items.length; i++) {
        const item = event.clipboardData.items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            onFileSelected(file);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [onFileSelected]);

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer?.files?.[0];
          if (file) onFileSelected(file);
        }}
        onClick={() => !preview && fileInputRef.current?.click()}
        className={[
          'relative overflow-hidden rounded-lg border border-dashed transition-all duration-300',
          preview ? 'cursor-default p-3' : 'cursor-pointer p-5',
          dragOver
            ? 'scale-[1.01] border-cyan-300 bg-cyan-50 shadow-lg shadow-cyan-300/20 dark:bg-cyan-950/30'
            : preview
              ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60'
              : 'border-slate-300 bg-slate-50 hover:border-cyan-300 hover:bg-cyan-50/60 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-cyan-950/20',
        ].join(' ')}
      >
        {preview ? (
          <div className="flex items-center gap-3">
            <div className="relative h-20 w-20 overflow-hidden rounded-lg ring-1 ring-cyan-300/80">
              <img src={preview} alt="source" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">源图已接入</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">图生图会优先使用这张参考图</div>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClear();
              }}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40"
              aria-label="移除源图"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div
              className={[
                'mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg transition-all duration-300',
                dragOver ? 'scale-110 bg-cyan-300 text-slate-950' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
              ].join(' ')}
            >
              <Upload size={18} />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">拖入、选择或粘贴源图</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">支持 PNG / JPEG / WebP，单图上限 200MB</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFileSelected(file);
            event.currentTarget.value = '';
          }}
        />
      </div>

      {onUrlInput && (
        <div>
          <button
            type="button"
            onClick={() => setShowUrlInput((value) => !value)}
            className="text-xs font-medium text-cyan-700 transition hover:text-cyan-900 dark:text-cyan-300"
          >
            {showUrlInput ? '收起外链输入' : '使用图片外链'}
          </button>
          <div className={`overflow-hidden transition-all duration-300 ${showUrlInput ? 'mt-2 max-h-20' : 'max-h-0'}`}>
            <input
              type="text"
              value={urlValue ?? ''}
              onChange={(event) => onUrlInput(event.target.value)}
              onCompositionEnd={(event) => onUrlInput((event.target as HTMLInputElement).value)}
              placeholder="https://... 或 /uploads/abc.png"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-transparent focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImageGenerateForm(props: ImageGenerateFormProps) {
  const {
    adapters,
    defaultAdapter,
    keyOverrideScope,
    endpoint = '/api/image/generate',
    extraBody = {},
    onGenerated,
    hidePromptInput,
    controlledPrompt,
    initial,
    compact,
    controlled,
    onChange,
  } = props;

  const enabledAdapters = useMemo(() => adapters.filter((adapter) => adapter.enabled !== false), [adapters]);
  const initialSlug = useMemo(() => {
    if (defaultAdapter && enabledAdapters.some((adapter) => adapter.slug === defaultAdapter)) return defaultAdapter;
    return enabledAdapters[0]?.slug ?? '';
  }, [defaultAdapter, enabledAdapters]);

  const [adapterSlug, setAdapterSlug] = useState(initialSlug);
  const currentAdapter = useMemo(
    () => adapters.find((adapter) => adapter.slug === adapterSlug) ?? null,
    [adapters, adapterSlug],
  );
  const supportsI2i = currentAdapter?.supportsImg2Img === true;
  const supportsTransparent = useMemo(() => {
    const slug = adapterSlug.toLowerCase();
    return /gpt-?image|gpt-img|cometapi|4router/.test(slug);
  }, [adapterSlug]);

  const [mode, setMode] = useState<ImageMode>(initial?.mode ?? 't2i');
  const [aspectRatio, setAspectRatio] = useState(initial?.aspectRatio ?? '1:1');
  const [tier, setTier] = useState<ImageTier>(initial?.tier ?? '2k');
  const [quality, setQuality] = useState(initial?.quality ?? 'medium');
  const [n, setN] = useState(initial?.n ?? 1);
  const [innerPrompt, setInnerPrompt] = useState(initial?.prompt ?? '');
  const [transparent, setTransparent] = useState(false);
  const prompt = hidePromptInput ? (controlledPrompt ?? '') : innerPrompt;
  const isComposingRef = useRef(false);

  const [combos] = useState<PresetCombo[]>(DEFAULT_GPT_IMAGE_COMBOS);

  const legalRatiosInCurrentTier = useMemo(
    () => new Set(combos.filter((combo) => combo.tier === tier).map((combo) => combo.ratio)),
    [combos, tier],
  );
  const legalTiersInCurrentRatio = useMemo(
    () => new Set(combos.filter((combo) => combo.ratio === aspectRatio).map((combo) => combo.tier)),
    [combos, aspectRatio],
  );
  const currentSize = useMemo(() => {
    const hit = combos.find((combo) => combo.ratio === aspectRatio && combo.tier === tier);
    return hit ? hit.size : '';
  }, [combos, aspectRatio, tier]);

  useEffect(() => {
    if (combos.length === 0) return;
    if (!legalTiersInCurrentRatio.has(tier)) {
      const fallback = ['2k', '1k', '4k'].find((value) =>
        legalTiersInCurrentRatio.has(value as ImageTier),
      ) as ImageTier | undefined;
      if (fallback) setTier(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspectRatio]);

  useEffect(() => {
    if (!supportsI2i && mode === 'i2i') setMode('t2i');
  }, [supportsI2i, mode]);

  const [sourceBase64, setSourceBase64] = useState('');
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyElapsed, setBusyElapsed] = useState(0);
  const [results, setResults] = useState<GeneratedAsset[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const handleSourceFile = useCallback((file: File) => {
    if (file.size > MAX_SOURCE_BYTES) {
      setLastError(`图片过大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 200MB`);
      return;
    }
    setSourceUrl('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUri = String(event.target?.result || '');
      setSourcePreview(dataUri);
      const match = dataUri.match(/^data:image\/[a-z]+;base64,(.+)$/i);
      if (match) setSourceBase64(match[1]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleClearSource = useCallback(() => {
    setSourceBase64('');
    setSourcePreview(null);
    setSourceUrl('');
  }, []);

  useEffect(() => {
    if (!controlled || !onChange) return;
    if (isComposingRef.current) return;
    onChange({
      mode,
      adapterSlug,
      aspectRatio,
      tier,
      quality,
      n,
      prompt,
      sourceImageUrl: sourceUrl,
      sourceImageBase64: sourceBase64,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, mode, adapterSlug, aspectRatio, tier, quality, n, prompt, sourceUrl, sourceBase64]);

  useEffect(() => {
    if (!busy) {
      setBusyElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setBusyElapsed(Math.floor((Date.now() - start) / 100) / 10), 100);
    return () => clearInterval(id);
  }, [busy]);

  const currentTier = TIERS.find((item) => item.tier === tier);
  const currentQuality = QUALITIES.find((item) => item.value === quality);
  const generationStage = busy
    ? busyElapsed < 8
      ? 0
      : busyElapsed < 24
        ? 1
        : 2
    : results.length > 0
      ? 3
      : -1;
  const canSubmit = Boolean(prompt.trim()) && !busy;
  const rootSpacing = compact ? 'space-y-3' : 'space-y-4';

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setLastError('复制失败，请直接打开图片后复制地址');
    }
  }

  function applyStarter(text: string) {
    if (hidePromptInput) return;
    setInnerPrompt((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
  }

  function applyRecipe(recipe: (typeof PRODUCTION_RECIPES)[number]) {
    if (!hidePromptInput) setInnerPrompt(recipe.prompt);
    setMode('t2i');
    setAspectRatio(recipe.ratio);
    setTier(recipe.tier);
    setQuality(recipe.quality);
    setTransparent(Boolean(recipe.transparent) && supportsTransparent);
    setN(1);
  }

  const handleSubmit = async () => {
    setLastError(null);
    if (!prompt.trim()) {
      setLastError('请填写图片描述');
      return;
    }
    if (mode === 'i2i' && !sourceBase64 && !sourceUrl.trim()) {
      setLastError('图生图模式需要源图：拖拽、点击、粘贴或填写 URL');
      return;
    }
    if (combos.length > 0 && !legalRatiosInCurrentTier.has(aspectRatio)) {
      setLastError(`${aspectRatio} 比例在 ${tier.toUpperCase()} 档下不可用`);
      return;
    }

    const body: Record<string, unknown> = {
      ...extraBody,
      prompt: prompt.trim(),
      adapterSlug,
      aspectRatio,
      tier,
      quality,
      mode,
      n,
      transparent,
    };
    if (mode === 'i2i') {
      if (sourceUrl.trim()) body.sourceImageUrl = sourceUrl.trim();
      else if (sourceBase64) body.sourceImageBase64 = sourceBase64;
    }
    if (keyOverrideScope && typeof window !== 'undefined') {
      try {
        const key = localStorage.getItem(`keyOverride:${keyOverrideScope}:image`);
        if (key) body.imageKeyOverride = key;
      } catch {}
    }

    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data.ok) {
        setLastError(data?.error || `HTTP ${response.status}`);
        return;
      }
      const assets: any[] = Array.isArray(data.assets) ? data.assets : data.asset ? [data.asset] : [];
      const mapped: GeneratedAsset[] = assets.map((asset) => ({
        id: asset.id,
        url: asset.url,
        prompt: asset.prompt,
        size: currentSize,
        aspectRatio,
      }));
      setResults((prev) => [...mapped, ...prev]);
      mapped.forEach((asset) => onGenerated?.(asset));
    } catch (error: any) {
      setLastError(error?.message || '网络错误');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={rootSpacing}>
      <section className="studio-card overflow-hidden">
        <div className="studio-shell p-4 sm:p-5">
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(148,163,184,.25)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.25)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-100">
                <Zap className="h-3.5 w-3.5" aria-hidden />
                GPT IMG 2 主生产线
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-normal sm:text-3xl">图像生成控制舱</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                把模型、比例、清晰度、质量、透明底和图生图源图放到同一张生产 Brief 里，生成结果直接回流资产。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[520px]">
              <BriefStat icon={<PanelRight className="h-4 w-4" />} label="模式" value={mode === 'i2i' ? '图生图' : '文生图'} />
              <BriefStat icon={<Gauge className="h-4 w-4" />} label="清晰度" value={tier.toUpperCase()} />
              <BriefStat icon={<Layers3 className="h-4 w-4" />} label="张数" value={`${n} 张`} />
              <BriefStat icon={<Clock3 className="h-4 w-4" />} label="预估" value={currentTier?.etaSec ?? '-'} />
            </div>
          </div>
          <div className="pipeline-mini mt-5">
            {['Brief', 'Model', 'Render', 'Asset'].map((label, index) => {
              const active = busy && generationStage === index;
              const done = generationStage >= index;
              return (
                <div
                  key={label}
                  className={[
                    'pipeline-mini-step',
                    active ? 'pipeline-mini-step-active' : '',
                    done && !active ? 'pipeline-mini-step-done' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{label}</span>
                    <span className="font-mono text-[10px] opacity-70">0{index + 1}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!hidePromptInput && (
          <div className="border-b border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold uppercase text-cyan-700 dark:text-cyan-300">Production Presets</div>
                <h3 className="mt-1 text-sm font-bold text-slate-950 dark:text-white">从成熟场景直接开工</h3>
              </div>
              <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                一键填充 Brief + 参数
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {PRODUCTION_RECIPES.map((recipe) => (
                <button
                  key={recipe.title}
                  type="button"
                  onClick={() => applyRecipe(recipe)}
                  className="detail-lift group rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-cyan-300 hover:bg-cyan-50/60 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-cyan-950/20"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-950 dark:text-white">{recipe.title}</span>
                    <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-cyan-600" aria-hidden />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{recipe.desc}</div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">{recipe.ratio}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">{recipe.tier.toUpperCase()}</span>
                    {recipe.transparent && <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">透明底</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-5">
          <div className={rootSpacing}>
            <Card compact={compact}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto,1fr] sm:items-center">
                <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100/70 p-0.5 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setMode('t2i')}
                    className={[
                      'flex items-center gap-1.5 rounded-md px-3.5 py-2 font-semibold transition-all duration-300',
                      mode === 't2i' ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800',
                    ].join(' ')}
                  >
                    <Type size={14} /> 文生图
                  </button>
                  <button
                    type="button"
                    onClick={() => supportsI2i && setMode('i2i')}
                    disabled={!supportsI2i}
                    title={!supportsI2i ? '当前模型不支持图生图' : ''}
                    className={[
                      'flex items-center gap-1.5 rounded-md px-3.5 py-2 font-semibold transition-all duration-300',
                      mode === 'i2i' ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800',
                      supportsI2i ? '' : 'cursor-not-allowed opacity-40',
                    ].join(' ')}
                  >
                    <FileImage size={14} /> 图生图
                  </button>
                </div>

                <select
                  value={adapterSlug}
                  onChange={(event) => setAdapterSlug(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-transparent focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                >
                  {enabledAdapters.map((adapter) => (
                    <option key={adapter.slug} value={adapter.slug}>
                      {adapter.name || adapter.slug}
                      {adapter.supportsImg2Img ? '' : '（仅文生图）'}
                    </option>
                  ))}
                </select>
              </div>
            </Card>

            {!hidePromptInput && (
              <Card compact={compact} className="!p-0">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
                      <Wand2 className="h-4 w-4 text-cyan-500" aria-hidden />
                      生成 Brief
                    </span>
                    <span className="text-xs text-slate-500">{prompt.trim().length} 字</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {PROMPT_STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => applyStarter(starter)}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-xs leading-5 text-slate-600 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-800"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={innerPrompt}
                  onChange={(event) => setInnerPrompt(event.target.value)}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={(event) => {
                    isComposingRef.current = false;
                    setInnerPrompt((event.target as HTMLTextAreaElement).value);
                  }}
                  placeholder="描述画面主体、场景、光线、构图、风格、用途。比如：一张高级电商商品主图，冷灰背景，柔和棚拍灯，突出金属质感..."
                  rows={compact ? 4 : 6}
                  className="w-full resize-none rounded-b-lg bg-transparent px-4 py-4 text-sm leading-6 text-slate-900 outline-none transition focus:ring-2 focus:ring-inset focus:ring-cyan-300 dark:text-slate-50"
                />
              </Card>
            )}

            <Card compact={compact}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500">画幅比例</div>
                  {currentSize && <div className="mt-1 text-xs font-mono text-cyan-700 dark:text-cyan-300">{currentSize}</div>}
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  GPT IMG 2 尺寸约束
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 xl:grid-cols-7">
                {RATIOS.map((ratio) => {
                  const allowed = combos.length === 0 || legalRatiosInCurrentTier.has(ratio.ratio);
                  const active = aspectRatio === ratio.ratio;
                  return (
                    <button
                      key={ratio.ratio}
                      type="button"
                      onClick={() => allowed && setAspectRatio(ratio.ratio)}
                      disabled={!allowed}
                      title={allowed ? ratio.full : `${ratio.full} 在 ${tier.toUpperCase()} 档不可用`}
                      className={[
                        'group relative flex min-h-[66px] flex-col items-center justify-center gap-1 rounded-lg border text-xs transition-all duration-300',
                        active
                          ? 'border-cyan-300 bg-slate-950 text-white shadow-lg shadow-cyan-950/20 dark:bg-white dark:text-slate-950'
                          : allowed
                            ? 'border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-cyan-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                            : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-45 dark:border-slate-800 dark:bg-slate-900',
                      ].join(' ')}
                    >
                      <RatioGlyph shape={ratio.shape} selected={active} />
                      <span className="font-semibold">{ratio.ratio}</span>
                      {!allowed && <Lock className="absolute right-1 top-1 h-3 w-3" aria-hidden />}
                    </button>
                  );
                })}
              </div>
              {combos.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>4K 只开放部分超宽/竖长比例；切换比例时系统会自动回落到可用清晰度。</span>
                </div>
              )}
            </Card>

            <Card compact={compact}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-bold uppercase text-slate-500">清晰度</div>
                  <div className="grid grid-cols-3 gap-2">
                    {TIERS.map((item) => {
                      const allowed = combos.length === 0 || legalTiersInCurrentRatio.has(item.tier);
                      const active = tier === item.tier;
                      return (
                        <button
                          key={item.tier}
                          type="button"
                          onClick={() => allowed && setTier(item.tier)}
                          disabled={!allowed}
                          className={[
                            'relative rounded-lg border px-2 py-3 text-center transition-all duration-300',
                            active
                              ? 'border-cyan-300 bg-cyan-50 shadow-sm dark:bg-cyan-950/30'
                              : allowed
                                ? 'border-slate-200 hover:border-cyan-300 dark:border-slate-800'
                                : 'cursor-not-allowed border-slate-200 opacity-40 dark:border-slate-800',
                          ].join(' ')}
                        >
                          <div className="text-base font-black text-slate-950 dark:text-white">{item.label}</div>
                          <div className="mt-0.5 text-[10px] text-slate-500">{item.sub}</div>
                          {!allowed && <Lock className="absolute right-1 top-1 h-3 w-3 text-slate-400" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-bold uppercase text-slate-500">质量与张数</div>
                  <div className="grid grid-cols-3 gap-2">
                    {QUALITIES.map((item) => {
                      const active = quality === item.value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setQuality(item.value)}
                          className={[
                            'rounded-lg border px-2 py-3 text-center transition-all duration-300',
                            active
                              ? 'border-cyan-300 bg-cyan-50 shadow-sm dark:bg-cyan-950/30'
                              : 'border-slate-200 hover:border-cyan-300 dark:border-slate-800',
                          ].join(' ')}
                        >
                          <div className="text-base font-black text-slate-950 dark:text-white">{item.label}</div>
                          <div className="mt-0.5 text-[10px] text-slate-500">{item.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {[1, 2, 3, 4].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setN(value)}
                        className={[
                          'h-9 flex-1 rounded-lg border text-sm font-bold transition-all duration-300',
                          n === value
                            ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                            : 'border-slate-200 text-slate-600 hover:border-cyan-300 dark:border-slate-800 dark:text-slate-300',
                        ].join(' ')}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => supportsTransparent && setTransparent((value) => !value)}
                disabled={!supportsTransparent}
                title={supportsTransparent ? '生成 PNG 透明背景' : '当前 adapter 不支持透明底'}
                className={[
                  'mt-4 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-all duration-300',
                  !supportsTransparent
                    ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-55 dark:border-slate-800 dark:bg-slate-900'
                    : transparent
                      ? 'border-cyan-300 bg-cyan-50 dark:bg-cyan-950/30'
                      : 'border-slate-200 hover:border-cyan-300 dark:border-slate-800',
                ].join(' ')}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-5 w-5 shrink-0 rounded border border-slate-300"
                    style={{
                      backgroundImage:
                        'linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%)',
                      backgroundSize: '8px 8px',
                      backgroundPosition: '0 0,0 4px,4px -4px,-4px 0',
                      backgroundColor: '#fff',
                    }}
                    aria-hidden
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">透明背景</span>
                    <span className="block text-xs text-slate-500">
                      {supportsTransparent ? '适合贴纸、Logo、商品抠图' : '需切换到 GPT Image 系列 adapter'}
                    </span>
                  </span>
                </span>
                <span className={`relative h-5 w-10 rounded-full transition-colors ${transparent && supportsTransparent ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                  <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${transparent && supportsTransparent ? 'translate-x-5' : ''}`} />
                </span>
              </button>
            </Card>

            {mode === 'i2i' && (
              <Card compact={compact}>
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
                  <FileImage className="h-4 w-4 text-cyan-500" aria-hidden />
                  图生图源图
                </div>
                <SourceImageDropzone
                  preview={sourcePreview}
                  onFileSelected={handleSourceFile}
                  onClear={handleClearSource}
                  onUrlInput={(url) => {
                    setSourceUrl(url);
                    if (url.trim()) {
                      setSourceBase64('');
                      setSourcePreview(null);
                    }
                  }}
                  urlValue={sourceUrl}
                />
              </Card>
            )}

            {lastError && (
              <div className="animate-shake rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200">
                <div className="flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span className="break-all">{lastError}</span>
                </div>
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="studio-shell overflow-hidden">
              <div className="relative p-4">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase text-cyan-200">Generation Status</div>
                    <h3 className="mt-1 text-lg font-bold">生成状态</h3>
                  </div>
                  <span className={busy ? 'rounded-md bg-blue-400/15 px-2 py-1 text-xs text-blue-100' : 'rounded-md bg-emerald-400/15 px-2 py-1 text-xs text-emerald-100'}>
                    {busy ? '运行中' : results.length ? '已完成' : '待启动'}
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  {['校验参数', '提交模型', '生成图像', '资产回流'].map((label, index) => {
                    const done = generationStage >= index;
                    const active = busy && generationStage === index;
                    return (
                      <div
                        key={label}
                        className={[
                          'flex items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-300',
                          done
                            ? 'border-cyan-300/30 bg-cyan-300/10'
                            : 'border-white/10 bg-white/5',
                        ].join(' ')}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-950">
                          {active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                        </span>
                        <span className="text-sm text-slate-200">{label}</span>
                      </div>
                    );
                  })}
                </div>

                {busy && (
                  <div className="mt-4 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-1.5 rounded-full bg-gradient-to-r from-cyan-300 via-emerald-200 to-cyan-300 transition-all duration-500"
                      style={{ width: `${Math.min(92, 18 + busyElapsed * 1.8)}%` }}
                    />
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <StatusChip label="模型" value={currentAdapter?.name || adapterSlug || '-'} />
                  <StatusChip label="尺寸" value={currentSize || aspectRatio} />
                  <StatusChip label="质量" value={currentQuality?.sub || quality} />
                  <StatusChip label="透明" value={transparent ? '开启' : '关闭'} />
                </div>

                {!controlled && (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className={[
                      'group mt-4 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-lg text-sm font-bold transition-all duration-300',
                      canSubmit
                        ? 'command-rail bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30 hover:-translate-y-0.5 hover:bg-cyan-200 hover:shadow-cyan-900/35 active:scale-[0.99]'
                        : 'cursor-not-allowed bg-slate-700 text-slate-400',
                    ].join(' ')}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 transition group-hover:rotate-12" />}
                    {busy ? `生成中 ${busyElapsed.toFixed(1)}s` : '开始生成 GPT IMG 2'}
                    {!busy && <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>

      {!controlled && results.length > 0 && (
        <section className="command-glass p-4 result-pop">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase text-cyan-700 dark:text-cyan-300">Generated Assets</div>
              <h3 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">本次生成 · {results.length}</h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
              已写入生成结果，可继续进入资产链路
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((asset, index) => (
              <div
                key={asset.id ?? `${asset.url}-${index}`}
                  className="result-pop detail-lift group overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-xl hover:shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-black/30"
              >
                <a href={asset.url} target="_blank" rel="noreferrer" className="relative block overflow-hidden bg-slate-950">
                  <img src={asset.url} alt={asset.prompt || 'generated image'} className="w-full object-cover transition duration-500 group-hover:scale-105" />
                  <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-mono text-white backdrop-blur">
                    {asset.size || currentSize || aspectRatio}
                  </span>
                </a>
                <div className="space-y-3 p-3">
                  <p className="line-clamp-2 min-h-[40px] text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {asset.prompt || prompt}
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    <a href={asset.url} target="_blank" rel="noreferrer" className="micro-action">
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </a>
                    <a href={asset.url} download className="micro-action">
                      <Download className="h-4 w-4" aria-hidden />
                    </a>
                    <button type="button" onClick={() => copyUrl(asset.url)} className="micro-action">
                      <Copy className="h-4 w-4" aria-hidden />
                    </button>
                    <a href={asset.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                      <Maximize2 className="h-4 w-4" aria-hidden />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BriefStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="mt-1 truncate font-medium text-slate-200">{value}</div>
    </div>
  );
}
