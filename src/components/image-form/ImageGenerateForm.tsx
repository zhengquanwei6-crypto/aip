'use client';

/**
 * <ImageGenerateForm> · v0.13 BUG-M30 fix-2
 *   - 13 比例 × 3 清晰度，按 GPT Image 2 真实约束 disable 不合法组合
 *   - 高端动效：framer-style transitions（用 Tailwind transitions 模拟）
 *   - 拖拽 / 点击 / 粘贴源图三种方式
 *   - 出图实时显示真实尺寸
 *
 *   后端真相在 /api/image/presets，前端拉一次缓存。
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Send, Loader2, Upload, X, Wand2, AlertCircle, Type, FileImage, Sparkles, Info,
  Image as ImageIcon, ChevronRight, Lock,
} from 'lucide-react';

// ───────────────── 类型 ─────────────────

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

// ───────────────── 比例 / 清晰度 / 质量元数据 ─────────────────

interface RatioMeta {
  ratio: string;
  short: string;     // "方"、"竖"、"横"、"超宽"
  full: string;      // "1:1 方形"
  shape: 'square' | 'tallM' | 'tallL' | 'wideM' | 'wideL' | 'tallXL' | 'wideXL';
}

const RATIOS: RatioMeta[] = [
  { ratio: '1:1',  short: '方', full: '1:1 正方',     shape: 'square' },
  { ratio: '2:3',  short: '竖', full: '2:3 竖屏',     shape: 'tallM' },
  { ratio: '3:2',  short: '横', full: '3:2 横屏',     shape: 'wideM' },
  { ratio: '3:4',  short: '竖', full: '3:4 竖屏',     shape: 'tallM' },
  { ratio: '4:3',  short: '横', full: '4:3 横屏',     shape: 'wideM' },
  { ratio: '4:5',  short: '竖', full: '4:5 竖屏',     shape: 'tallM' },
  { ratio: '5:4',  short: '横', full: '5:4 横屏',     shape: 'wideM' },
  { ratio: '9:16', short: '竖', full: '9:16 抖音',    shape: 'tallL' },
  { ratio: '16:9', short: '横', full: '16:9 视频',    shape: 'wideL' },
  { ratio: '1:2',  short: '竖', full: '1:2 长竖',     shape: 'tallXL' },
  { ratio: '2:1',  short: '横', full: '2:1 长横',     shape: 'wideXL' },
  { ratio: '9:21', short: '竖', full: '9:21 超长竖',  shape: 'tallXL' },
  { ratio: '21:9', short: '横', full: '21:9 电影',    shape: 'wideXL' },
];

const TIERS: { tier: ImageTier; label: string; sub: string; etaSec: string }[] = [
  { tier: '1k', label: '1K',  sub: '草图', etaSec: '20-40s' },
  { tier: '2k', label: '2K',  sub: '推荐', etaSec: '40-90s' },
  { tier: '4k', label: '4K',  sub: '成片', etaSec: '70-180s' },
];

const QUALITIES: { value: string; label: string; sub: string }[] = [
  { value: 'low',    label: '低', sub: '快' },
  { value: 'medium', label: '中', sub: '平衡' },
  { value: 'high',   label: '高', sub: '精细' },
];

const MAX_SOURCE_BYTES = 200 * 1024 * 1024; // v0.13 BUG-M32: 上限 200MB

// v0.13 BUG-M30 fix-5: Card 提到模块级，避免在主函数体内每次渲染都重新创建函数引用
//   旧 bug：Card 定义在主组件里 → setState 重渲染时 Card 是「新组件」→
//          React 把 Card 整体卸载重建 → 里面的 textarea 失去焦点 → 输入一个字符就跳到顶部。
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
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 backdrop-blur-sm ${compact ? 'p-3' : 'p-3.5'} transition-all hover:border-purple-200 dark:hover:border-purple-700/50 ${className}`}
    >
      {children}
    </div>
  );
}

// ───────────────── 小图标：比例缩略图 ─────────────────

function RatioGlyph({ shape, selected }: { shape: RatioMeta['shape']; selected: boolean }) {
  const dims: Record<string, { w: number; h: number }> = {
    square:  { w: 22, h: 22 },
    tallM:   { w: 16, h: 22 },
    tallL:   { w: 13, h: 24 },
    tallXL:  { w: 10, h: 24 },
    wideM:   { w: 22, h: 16 },
    wideL:   { w: 24, h: 13 },
    wideXL:  { w: 24, h: 10 },
  };
  const d = dims[shape];
  const cls = selected
    ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/40'
    : 'bg-slate-300 dark:bg-slate-600 group-hover:bg-purple-400 dark:group-hover:bg-purple-500';
  return (
    <span className="flex items-center justify-center" style={{ width: 26, height: 26 }}>
      <span className={`${cls} rounded-sm transition-all duration-300`} style={{ width: d.w, height: d.h }} />
    </span>
  );
}

// ───────────────── 子组件：源图上传区 ─────────────────

interface SourceImageDropzoneProps {
  preview: string | null;
  onFileSelected: (file: File) => void;
  onClear: () => void;
  onUrlInput?: (url: string) => void;
  urlValue?: string;
}

function SourceImageDropzone({ preview, onFileSelected, onClear, onUrlInput, urlValue }: SourceImageDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
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
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer?.files?.[0];
          if (f) onFileSelected(f);
        }}
        onClick={() => !preview && fileInputRef.current?.click()}
        className={[
          'relative rounded-xl border-2 border-dashed transition-all duration-300 ease-out overflow-hidden',
          preview ? 'p-3 cursor-default' : 'p-5 cursor-pointer',
          dragOver
            ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/20 scale-[1.02] shadow-lg shadow-purple-500/20'
            : preview
              ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40'
              : 'border-slate-300 dark:border-slate-600 hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 bg-slate-50 dark:bg-slate-900/40',
        ].join(' ')}
      >
        {preview ? (
          <div className="flex items-center gap-3">
            <div className="relative w-20 h-20 rounded-lg overflow-hidden ring-2 ring-purple-300 dark:ring-purple-700">
              <img src={preview} alt="source" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">已选源图</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">点击 ✕ 移除并重选</div>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-colors"
              aria-label="移除"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div className={`mx-auto mb-2 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${dragOver ? 'bg-purple-500 text-white scale-110' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
              <Upload size={18} />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              拖拽图片到这里
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              点击选择 · <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded font-mono text-[10px]">Ctrl+V</kbd> 粘贴 · 上限 200MB
            </p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileSelected(f);
            e.currentTarget.value = '';
          }}
        />
      </div>

      {onUrlInput && (
        <div>
          <button
            type="button"
            onClick={() => setShowUrlInput((v) => !v)}
            className="text-xs text-purple-600 dark:text-purple-400 hover:underline transition-colors"
          >
            {showUrlInput ? '收起 URL 输入' : '或填外链 URL'}
          </button>
          <div className={`overflow-hidden transition-all duration-300 ${showUrlInput ? 'max-h-20 mt-2' : 'max-h-0'}`}>
            <input
              type="text"
              value={urlValue ?? ''}
              onChange={(e) => onUrlInput(e.target.value)}
              onCompositionEnd={(e) => onUrlInput((e.target as HTMLInputElement).value)}
              placeholder="https://… 或 /uploads/abc.png"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────── 主组件 ─────────────────

interface PresetCombo { ratio: string; tier: ImageTier; size: string; w: number; h: number; }

export default function ImageGenerateForm(props: ImageGenerateFormProps) {
  const {
    adapters, defaultAdapter, keyOverrideScope,
    endpoint = '/api/image/generate',
    extraBody = {},
    onGenerated,
    hidePromptInput, controlledPrompt,
    initial,
    compact,
    controlled, onChange,
  } = props;

  const enabledAdapters = useMemo(
    () => adapters.filter((a) => a.enabled !== false),
    [adapters],
  );
  const initialSlug = useMemo(() => {
    if (defaultAdapter && enabledAdapters.some((a) => a.slug === defaultAdapter)) return defaultAdapter;
    return enabledAdapters[0]?.slug ?? '';
  }, [defaultAdapter, enabledAdapters]);

  const [adapterSlug, setAdapterSlug] = useState<string>(initialSlug);
  const currentAdapter = useMemo(() => adapters.find((a) => a.slug === adapterSlug) ?? null, [adapters, adapterSlug]);
  const supportsI2i = currentAdapter?.supportsImg2Img === true;

  const [mode, setMode] = useState<ImageMode>(initial?.mode ?? 't2i');
  const [aspectRatio, setAspectRatio] = useState<string>(initial?.aspectRatio ?? '1:1');
  const [tier, setTier] = useState<ImageTier>(initial?.tier ?? '2k');
  const [quality, setQuality] = useState<string>(initial?.quality ?? 'medium');
  const [n, setN] = useState<number>(initial?.n ?? 1);
  const [innerPrompt, setInnerPrompt] = useState<string>(initial?.prompt ?? '');
  const prompt = hidePromptInput ? (controlledPrompt ?? '') : innerPrompt;

  // v0.13 BUG-M30 fix-3: IME 组合状态守卫（中文拼音输入）
  const isComposingRef = useRef(false);

  // —— 拉合法组合表 ——
  const [combos, setCombos] = useState<PresetCombo[]>([]);
  useEffect(() => {
    let mounted = true;
    fetch('/api/image/presets').then((r) => r.json()).then((j) => {
      if (mounted && j?.ok && Array.isArray(j.combos)) setCombos(j.combos);
    }).catch(() => { /* ignore */ });
    return () => { mounted = false; };
  }, []);

  // 哪些 ratio 在当前 tier 下合法
  const legalRatiosInCurrentTier = useMemo(() => {
    return new Set(combos.filter((c) => c.tier === tier).map((c) => c.ratio));
  }, [combos, tier]);
  // 哪些 tier 在当前 ratio 下合法
  const legalTiersInCurrentRatio = useMemo(() => {
    return new Set(combos.filter((c) => c.ratio === aspectRatio).map((c) => c.tier));
  }, [combos, aspectRatio]);
  // 当前组合实际尺寸（用于显示）
  const currentSize = useMemo(() => {
    const hit = combos.find((c) => c.ratio === aspectRatio && c.tier === tier);
    return hit ? hit.size : '';
  }, [combos, aspectRatio, tier]);

  // 用户切换比例时如果当前 tier 不合法 → 自动降到最近合法 tier
  useEffect(() => {
    if (combos.length === 0) return;
    if (!legalTiersInCurrentRatio.has(tier)) {
      // 优先 2k → 1k → 4k
      const fallback = ['2k', '1k', '4k'].find((t) => legalTiersInCurrentRatio.has(t as ImageTier)) as ImageTier | undefined;
      if (fallback) setTier(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspectRatio]);

  useEffect(() => { if (!supportsI2i && mode === 'i2i') setMode('t2i'); }, [supportsI2i, mode]);

  // —— 源图 ——
  const [sourceBase64, setSourceBase64] = useState<string>('');
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string>('');

  const handleSourceFile = useCallback((file: File) => {
    if (file.size > MAX_SOURCE_BYTES) {
      setLastError(`图片过大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 200MB`);
      return;
    }
    setSourceUrl('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUri = String(e.target?.result || '');
      setSourcePreview(dataUri);
      const m = dataUri.match(/^data:image\/[a-z]+;base64,(.+)$/i);
      if (m) setSourceBase64(m[1]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleClearSource = useCallback(() => {
    setSourceBase64('');
    setSourcePreview(null);
    setSourceUrl('');
  }, []);

  const [busy, setBusy] = useState(false);
  const [busyElapsed, setBusyElapsed] = useState(0);
  const [results, setResults] = useState<GeneratedAsset[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  // 受控模式上报（用 useEffect 自动延迟到组件渲染稳定后，规避 IME 抖动）
  useEffect(() => {
    if (!controlled || !onChange) return;
    if (isComposingRef.current) return; // IME 组合中暂不上报
    onChange({
      mode, adapterSlug, aspectRatio, tier, quality, n, prompt,
      sourceImageUrl: sourceUrl, sourceImageBase64: sourceBase64,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, mode, adapterSlug, aspectRatio, tier, quality, n, prompt, sourceUrl, sourceBase64]);

  // 出图计时
  useEffect(() => {
    if (!busy) { setBusyElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setBusyElapsed(Math.floor((Date.now() - t0) / 100) / 10), 100);
    return () => clearInterval(id);
  }, [busy]);

  const handleSubmit = async () => {
    setLastError(null);
    if (!prompt.trim()) { setLastError('请填写描述'); return; }
    if (mode === 'i2i' && !sourceBase64 && !sourceUrl.trim()) {
      setLastError('图生图模式需要源图：拖拽 / 点击 / Ctrl+V 粘贴 / 填 URL');
      return;
    }
    if (combos.length > 0 && !legalRatiosInCurrentTier.has(aspectRatio)) {
      setLastError(`${aspectRatio} 比例在 ${tier.toUpperCase()} 档下不可用`);
      return;
    }

    const body: Record<string, unknown> = {
      ...extraBody,
      prompt: prompt.trim(),
      adapterSlug, aspectRatio, tier, quality, mode, n,
    };
    if (mode === 'i2i') {
      if (sourceUrl.trim()) body.sourceImageUrl = sourceUrl.trim();
      else if (sourceBase64) body.sourceImageBase64 = sourceBase64;
    }
    if (keyOverrideScope && typeof window !== 'undefined') {
      try {
        const k = localStorage.getItem(`keyOverride:${keyOverrideScope}:image`);
        if (k) body.imageKeyOverride = k;
      } catch { /* ignore */ }
    }

    setBusy(true);
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await resp.json().catch(() => ({} as any));
      if (!resp.ok || !j.ok) {
        setLastError(j?.error || `HTTP ${resp.status}`);
        return;
      }
      const assets: any[] = Array.isArray(j.assets) ? j.assets : (j.asset ? [j.asset] : []);
      const mapped: GeneratedAsset[] = assets.map((a) => ({
        id: a.id, url: a.url, prompt: a.prompt, size: currentSize, aspectRatio,
      }));
      setResults((prev) => [...mapped, ...prev]);
      mapped.forEach((m) => onGenerated?.(m));
    } catch (e: any) {
      setLastError(e?.message || '网络错误');
    } finally {
      setBusy(false);
    }
  };

  // ───────────────── 渲染 ─────────────────

  const gap = compact ? 'gap-2.5' : 'gap-3.5';

  return (
    <div className={`space-y-${compact ? 3 : 4}`}>
      {/* ① 模式 + ② 模型 同行 */}
      <Card compact={compact}>
        <div className={`grid grid-cols-1 sm:grid-cols-[auto,1fr] ${gap} items-center`}>
          <div className="inline-flex rounded-xl border border-slate-300 dark:border-slate-600 overflow-hidden text-sm bg-slate-100/50 dark:bg-slate-800/40 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setMode('t2i')}
              className={[
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all duration-300 font-medium',
                mode === 't2i'
                  ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white shadow-md shadow-purple-500/30'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60',
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
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all duration-300 font-medium',
                mode === 'i2i'
                  ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white shadow-md shadow-purple-500/30'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60',
                supportsI2i ? '' : 'opacity-40 cursor-not-allowed hover:bg-transparent',
              ].join(' ')}
            >
              <FileImage size={14} /> 图生图
            </button>
          </div>

          <select
            value={adapterSlug}
            onChange={(e) => setAdapterSlug(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all cursor-pointer"
          >
            {enabledAdapters.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name || a.slug}{a.supportsImg2Img ? '' : '（仅文生图）'}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* ③ 比例（13 档，按行分组）*/}
      <Card compact={compact}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">比例</div>
          {currentSize && (
            <div className="text-[11px] text-purple-600 dark:text-purple-400 font-mono bg-purple-50 dark:bg-purple-900/30 px-2 py-0.5 rounded-full">
              {currentSize}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 sm:grid-cols-7 gap-1.5">
          {RATIOS.map((r) => {
            const allowed = combos.length === 0 || legalRatiosInCurrentTier.has(r.ratio);
            const active = aspectRatio === r.ratio;
            return (
              <button
                key={r.ratio}
                type="button"
                onClick={() => allowed && setAspectRatio(r.ratio)}
                disabled={!allowed}
                title={allowed ? r.full : `${r.full} 在 ${tier.toUpperCase()} 档不可用（GPT Image 2 限制）`}
                className={[
                  'group relative flex flex-col items-center justify-center gap-1 py-2 rounded-xl border transition-all duration-300',
                  active
                    ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/20 ring-2 ring-purple-300/50 dark:ring-purple-700/50 shadow-md shadow-purple-500/10 scale-[1.03]'
                    : allowed
                      ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-purple-300 hover:scale-[1.05] hover:shadow-md'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 opacity-40 cursor-not-allowed',
                ].join(' ')}
              >
                <RatioGlyph shape={r.shape} selected={active} />
                <span className={`text-[11px] font-medium ${active ? 'text-purple-700 dark:text-purple-300' : 'text-slate-600 dark:text-slate-400'}`}>{r.ratio}</span>
                {!allowed && (
                  <span className="absolute top-1 right-1 text-slate-400 dark:text-slate-600">
                    <Lock size={10} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {combos.length > 0 && (
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <Info size={11} className="mt-0.5 flex-shrink-0" />
            <span>4K 仅支持 16:9 / 9:16 / 2:1 / 1:2 / 21:9 / 9:21（GPT Image 2 像素上限）</span>
          </div>
        )}
      </Card>

      {/* ④ 清晰度 + ⑤ 质量 同行 */}
      <Card compact={compact}>
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${gap}`}>
          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide mb-1.5">清晰度</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {TIERS.map((t) => {
                const allowed = combos.length === 0 || legalTiersInCurrentRatio.has(t.tier);
                const active = tier === t.tier;
                return (
                  <button
                    key={t.tier}
                    type="button"
                    onClick={() => allowed && setTier(t.tier)}
                    disabled={!allowed}
                    title={allowed ? `${t.label} ${t.sub} · 预计 ${t.etaSec}` : `${t.label} 在 ${aspectRatio} 比例下不可用`}
                    className={[
                      'relative flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all duration-300',
                      active
                        ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/20 ring-2 ring-purple-300/50 shadow-md scale-[1.03]'
                        : allowed
                          ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-purple-300 hover:shadow'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 opacity-40 cursor-not-allowed',
                    ].join(' ')}
                  >
                    <span className={`text-base font-bold ${active ? 'bg-gradient-to-br from-purple-600 to-pink-600 bg-clip-text text-transparent' : 'text-slate-700 dark:text-slate-300'}`}>{t.label}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{t.sub}</span>
                    {!allowed && <span className="absolute top-1 right-1 text-slate-400"><Lock size={10} /></span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide mb-1.5">质量</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {QUALITIES.map((q) => {
                const active = quality === q.value;
                return (
                  <button
                    key={q.value}
                    type="button"
                    onClick={() => setQuality(q.value)}
                    className={[
                      'flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all duration-300',
                      active
                        ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/20 ring-2 ring-purple-300/50 shadow-md scale-[1.03]'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-purple-300 hover:shadow',
                    ].join(' ')}
                  >
                    <span className={`text-base font-bold ${active ? 'bg-gradient-to-br from-purple-600 to-pink-600 bg-clip-text text-transparent' : 'text-slate-700 dark:text-slate-300'}`}>{q.label}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{q.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 张数 */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">张数</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((nn) => (
              <button
                key={nn}
                type="button"
                onClick={() => setN(nn)}
                className={[
                  'w-9 h-9 rounded-lg border text-sm font-semibold transition-all duration-300',
                  n === nn
                    ? 'border-purple-500 bg-gradient-to-br from-purple-600 to-pink-600 text-white shadow-md shadow-purple-500/30 scale-[1.05]'
                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-purple-400',
                ].join(' ')}
              >{nn}</button>
            ))}
          </div>
        </div>
      </Card>

      {/* 源图（仅 i2i）*/}
      {mode === 'i2i' && (
        <Card compact={compact}>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide mb-2">
            <FileImage size={12} className="text-purple-600 dark:text-purple-400" /> 源图
          </div>
          <SourceImageDropzone
            preview={sourcePreview}
            onFileSelected={handleSourceFile}
            onClear={handleClearSource}
            onUrlInput={(url) => { setSourceUrl(url); if (url.trim()) { setSourceBase64(''); setSourcePreview(null); } }}
            urlValue={sourceUrl}
          />
        </Card>
      )}

      {/* prompt */}
      {!hidePromptInput && (
        <Card compact={compact} className="!p-0">
          <textarea
            value={innerPrompt}
            onChange={(e) => {
              // v0.13 BUG-M30 fix-3: IME 组合期间也允许 onChange，
              //   但用 isComposingRef 标记，组合结束前不触发 onChange 之外的副作用
              setInnerPrompt(e.target.value);
            }}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={(e) => {
              isComposingRef.current = false;
              // 组合结束后读最终值（IE/旧 Safari 兼容）
              setInnerPrompt((e.target as HTMLTextAreaElement).value);
            }}
            placeholder="描述你想要的图片… 中英文均可"
            rows={3}
            className="w-full px-3.5 py-3 rounded-xl bg-transparent text-sm text-slate-900 dark:text-slate-50 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-inset"
          />
        </Card>
      )}

      {/* 错误条 */}
      {lastError && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 p-3 text-xs text-red-800 dark:text-red-200 flex items-start gap-2 animate-shake">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span className="break-all">{lastError}</span>
        </div>
      )}

      {/* 提交（受控模式不渲染）*/}
      {!controlled && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !prompt.trim()}
          className={[
            'group relative w-full overflow-hidden flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-medium transition-all duration-300',
            busy || !prompt.trim()
              ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-700 hover:via-fuchsia-700 hover:to-pink-700 shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.01] active:scale-[0.99]',
          ].join(' ')}
        >
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              生成中… {busyElapsed.toFixed(1)}s
            </>
          ) : (
            <>
              <Sparkles size={16} className="group-hover:rotate-12 transition-transform" />
              开始生成
              <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </>
          )}
        </button>
      )}

      {/* 结果 */}
      {!controlled && results.length > 0 && (
        <Card compact={compact}>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide mb-2">
            <ImageIcon size={12} className="text-purple-600 dark:text-purple-400" />
            本次生成 · {results.length}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 gap-2">
            {results.map((r, i) => (
              <a
                key={r.id ?? i}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="group relative block overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-400 transition-all hover:shadow-lg hover:shadow-purple-500/20 hover:scale-[1.02] duration-300"
              >
                <img
                  src={r.url}
                  alt={r.prompt || ''}
                  className="w-full transition-transform duration-500 group-hover:scale-105"
                />
                {r.size && (
                  <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                    {r.size}
                  </div>
                )}
              </a>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
