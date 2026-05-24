'use client';

// v0.11 B8 + B9 · ImageTab — 即时图片生成面板
//
// v0.11 B9 新增：
//   - aspect-ratio select（按 adapter.aspectRatios）
//   - 图生图开关 + 源图选择器（仅 supportsImg2Img=true 显示）
//   - 调 /api/playground/image/generate 时透传 mode/sourceImageUrl/sourceImageBase64/aspectRatio

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Loader2,
  Image as ImageIcon,
  AlertCircle,
  Trash2,
  Sliders,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import ImageLightbox from '@/components/ImageLightbox';
import type {
  ApiKeyRow,
  AdapterPoolItem,
  SizePreset,
  QualityPreset,
  AspectRatioPreset,
} from './PlaygroundClient';

interface GeneratedImage {
  url: string;
  prompt: string;
  ts: number;
  via?: string;
  adapterSlug?: string;
  size?: string;
  quality?: string;
  aspectRatio?: string;
  mode?: 't2i' | 'i2i';
}

interface Props {
  imageKeys: ApiKeyRow[];
  adapters: AdapterPoolItem[];
  defaultAdapter: string | null;
}

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

export default function ImageTab({ imageKeys, adapters, defaultAdapter }: Props) {
  const activeKeys = useMemo(() => imageKeys.filter((k) => k.active), [imageKeys]);

  const [keyId, setKeyId] = useState<string>(() => {
    if (activeKeys.length > 0) return activeKeys[0]!.id;
    if (imageKeys.length > 0) return imageKeys[0]!.id;
    return '';
  });

  const enabledAdapters = useMemo(
    () => adapters.filter((a) => a.enabled !== false),
    [adapters],
  );
  const initSlug = (() => {
    if (defaultAdapter && enabledAdapters.some((a) => a.slug === defaultAdapter)) return defaultAdapter;
    if (enabledAdapters.length > 0) return enabledAdapters[0]!.slug;
    return '';
  })();
  const [adapterSlug, setAdapterSlug] = useState<string>(initSlug);

  const currentAdapter = useMemo(
    () => adapters.find((a) => a.slug === adapterSlug) ?? null,
    [adapters, adapterSlug],
  );
  const sizes: SizePreset[] = currentAdapter?.sizes ?? [];
  const qualities: QualityPreset[] = currentAdapter?.qualities ?? [];
  const aspectRatios: AspectRatioPreset[] = currentAdapter?.aspectRatios ?? [];
  const supportsImg2Img: boolean = currentAdapter?.supportsImg2Img === true;

  const [size, setSize] = useState<string>(() => sizes[0]?.value ?? '');
  const [quality, setQuality] = useState<string>(() => qualities[0]?.value ?? '');
  const [aspectRatio, setAspectRatio] = useState<string>(() => aspectRatios[0]?.ratio ?? '');

  // adapter 切换：reset 选项
  useEffect(() => {
    setSize(sizes[0]?.value ?? '');
    setQuality(qualities[0]?.value ?? '');
    setAspectRatio(aspectRatios[0]?.ratio ?? '');
    if (!supportsImg2Img) {
      setI2iEnabled(false);
      setSourceImageUrl('');
      setSourceImageBase64('');
      setSourceImagePreview(null);
    }
  }, [adapterSlug, sizes, qualities, aspectRatios, supportsImg2Img]);

  const [n, setN] = useState<number>(1);
  const [prompt, setPrompt] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // v0.11 B9：i2i state
  const [i2iEnabled, setI2iEnabled] = useState<boolean>(false);
  const [sourceImageUrl, setSourceImageUrl] = useState<string>('');
  const [sourceImageBase64, setSourceImageBase64] = useState<string>('');
  const [sourceImagePreview, setSourceImagePreview] = useState<string | null>(null);
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedKey = useMemo(() => imageKeys.find((k) => k.id === keyId) ?? null, [keyId, imageKeys]);

  function clearHistory() {
    if (history.length === 0) return;
    if (!confirm('清空当前出图历史？（已落库的 Asset 不受影响）')) return;
    setHistory([]);
    setLastError(null);
  }

  function onAspectChange(v: string) {
    setAspectRatio(v);
    const rule = aspectRatios.find((r) => r.ratio === v)?.sizeRule;
    if (rule && rule.trim() && sizes.some((s) => s.value === rule.trim())) {
      setSize(rule.trim());
    }
  }

  async function handleSourceFile(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
    if (file.size > MAX_SOURCE_BYTES) { toast.error(`图片过大（${(file.size / 1024 / 1024).toFixed(1)}MB）· 上限 5MB`); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setSourceImagePreview(dataUrl);
      const m = dataUrl.match(/^data:image\/[a-z]+;base64,(.+)$/i);
      if (m) {
        setSourceImageBase64(m[1]);
        setSourceImageUrl('');
        toast.success(`已加载源图（${(file.size / 1024).toFixed(0)} KB）`);
      } else {
        toast.error('源图解析失败');
      }
    };
    reader.onerror = () => toast.error('源图读取失败');
    reader.readAsDataURL(file);
  }

  function clearSourceImage() {
    setSourceImageUrl('');
    setSourceImageBase64('');
    setSourceImagePreview(null);
    if (sourceFileInputRef.current) sourceFileInputRef.current.value = '';
  }

  async function generate() {
    if (!prompt.trim()) {
      toast.error('prompt 不能为空');
      return;
    }
    if (imageKeys.length === 0) {
      toast.error('IMAGE 池为空，请先去 /settings 加一条 provider=image 的 key');
      return;
    }
    if (i2iEnabled) {
      if (!sourceImageUrl.trim() && !sourceImageBase64) {
        toast.error('图生图模式需提供源图（URL 或上传文件）');
        return;
      }
    }
    setLoading(true);
    setLastError(null);
    const reqBody: Record<string, unknown> = {
      prompt: prompt.trim(),
      n,
    };
    if (keyId) reqBody.keyId = keyId;
    if (adapterSlug) reqBody.adapterSlug = adapterSlug;
    if (size) reqBody.size = size;
    if (quality) reqBody.quality = quality;
    if (aspectRatio) reqBody.aspectRatio = aspectRatio;
    if (i2iEnabled) {
      reqBody.mode = 'i2i';
      if (sourceImageUrl.trim()) reqBody.sourceImageUrl = sourceImageUrl.trim();
      else if (sourceImageBase64) reqBody.sourceImageBase64 = sourceImageBase64;
    }

    try {
      const res = await fetch('/api/playground/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        const msg = j?.error || `HTTP ${res.status}`;
        setLastError(String(msg));
        toast.error('图片生成失败：' + String(msg).slice(0, 200));
      } else {
        const urls: string[] = Array.isArray(j.assets)
          ? j.assets.map((a: any) => a?.url).filter(Boolean)
          : j?.asset?.url ? [j.asset.url] : [];
        if (urls.length === 0) {
          setLastError('未返回图片 URL');
          toast.error('未返回图片 URL');
        } else {
          const newOnes: GeneratedImage[] = urls.map((url) => ({
            url,
            prompt: prompt.trim(),
            ts: Date.now(),
            via: j.via,
            adapterSlug: j.adapterSlug,
            size,
            quality,
            aspectRatio,
            mode: i2iEnabled ? 'i2i' : 't2i',
          }));
          setHistory((h) => [...newOnes, ...h].slice(0, 40));
          toast.success(`已生成 ${urls.length} 张图`);
        }
      }
    } catch (e) {
      const msg = (e as Error).message || '网络错误';
      setLastError(msg);
      toast.error('请求异常：' + msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4">
      <aside className="space-y-3 lg:sticky lg:top-[72px] lg:self-start">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Sliders size={14} aria-hidden="true" />
            <span>调用参数</span>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              IMAGE Key（共 {imageKeys.length} 条 · {activeKeys.length} active）
            </label>
            <select data-image-key-select value={keyId} onChange={(e) => setKeyId(e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2 py-1.5"
              disabled={loading}>
              {imageKeys.length === 0 && <option value="">（池为空 · 去 /settings 添加）</option>}
              {imageKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label} · {k.model} {k.active ? '' : '（已停用）'}
                </option>
              ))}
            </select>
            {selectedKey && (
              <div className="mt-1 text-[11px] text-slate-400 truncate" title={selectedKey.baseUrl}>
                {selectedKey.baseUrl}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Adapter（共 {adapters.length} 条）
            </label>
            <select data-image-adapter-select value={adapterSlug} onChange={(e) => setAdapterSlug(e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2 py-1.5"
              disabled={loading}>
              {enabledAdapters.length === 0 && <option value="">（无可用 adapter）</option>}
              {enabledAdapters.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.slug}{a.slug === defaultAdapter ? '（默认）' : ''}{a.supportsImg2Img ? ' · i2i' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {aspectRatios.length > 0 && (
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">比例预设</label>
                <select data-aspect-ratio-select value={aspectRatio} onChange={(e) => onAspectChange(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2 py-1.5"
                  disabled={loading || aspectRatios.length === 0}>
                  {aspectRatios.length === 0 && <option value="">—</option>}
                  {aspectRatios.map((r) => <option key={r.ratio} value={r.ratio}>{r.label}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">尺寸预设</label>
                <select data-image-size-select value={size} onChange={(e) => setSize(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2 py-1.5"
                  disabled={loading || sizes.length === 0}>
                  {sizes.length === 0 && <option value="">—</option>}
                  {sizes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">质量预设</label>
                <select data-image-quality-select value={quality} onChange={(e) => setQuality(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2 py-1.5"
                  disabled={loading || qualities.length === 0}>
                  {qualities.length === 0 && <option value="">—</option>}
                  {qualities.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">生成数量 n</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map((v) => (
                <button key={v} type="button" onClick={() => setN(v)}
                  className={'flex-1 rounded-md px-2 py-1.5 text-sm transition-colors ' +
                    (n === v ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700')}
                  aria-pressed={n === v} disabled={loading}>{v}</button>
              ))}
            </div>
          </div>

          {/* v0.11 B9：图生图 */}
          {supportsImg2Img && (
            <div className="rounded-md border border-violet-200 dark:border-violet-700/40 bg-violet-50/40 dark:bg-violet-900/10 p-2 space-y-2">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-violet-800 dark:text-violet-200 cursor-pointer">
                <input type="checkbox" checked={i2iEnabled} onChange={(e) => setI2iEnabled(e.target.checked)}
                  data-i2i-toggle aria-label="图生图开关" disabled={loading} />
                <ImageIcon size={12} aria-hidden="true" />
                图生图（i2i）
              </label>
              {i2iEnabled && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">源图 URL</label>
                    <input className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 py-1"
                      type="text" value={sourceImageUrl}
                      onChange={(e) => {
                        setSourceImageUrl(e.target.value);
                        if (e.target.value.trim()) {
                          setSourceImagePreview(e.target.value);
                          setSourceImageBase64('');
                        }
                      }}
                      disabled={loading}
                      placeholder="https://... 或 /uploads/..."
                      data-source-image-url />
                  </div>
                  <div className="text-xs text-slate-500">— 或 —</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input ref={sourceFileInputRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleSourceFile(f); }}
                      data-source-image-file />
                    <button type="button" onClick={() => sourceFileInputRef.current?.click()} disabled={loading}
                      className="text-[11px] inline-flex items-center gap-1 rounded border border-violet-300 dark:border-violet-700 px-2 py-1 hover:bg-violet-100 dark:hover:bg-violet-900/40">
                      <Upload size={11} /> 上传（≤5MB）
                    </button>
                    {(sourceImagePreview || sourceImageUrl) && (
                      <button type="button" onClick={clearSourceImage} disabled={loading}
                        className="text-[11px] text-slate-500 hover:text-rose-500 inline-flex items-center gap-0.5">
                        <X size={10} /> 清除
                      </button>
                    )}
                  </div>
                  {sourceImagePreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sourceImagePreview} alt="source preview"
                      className="max-h-20 rounded border border-slate-200 dark:border-slate-700" />
                  )}
                </div>
              )}
            </div>
          )}

          <button type="button" onClick={clearHistory} disabled={loading || history.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40">
            <Trash2 size={12} aria-hidden="true" />
            清空当前历史（{history.length}）
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          <div className="font-medium text-slate-600 dark:text-slate-300 mb-1">提示</div>
          <ul className="list-disc pl-4 space-y-1">
            <li>切换 adapter 会写 IMAGE_DEFAULT_ADAPTER（与 /image 共用）</li>
            <li>i2i 模式需要 supportsImg2Img=true 的 adapter</li>
            <li>所有图都落 Asset 表 + AIOutput type=&apos;playground:image&apos;</li>
          </ul>
        </div>
      </aside>

      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            Prompt（可中英；image-runner 不做翻译，复杂场景直接英文）
            {i2iEnabled && <span className="text-violet-600 dark:text-violet-400 ml-1">· i2i 模式（描述"基于源图改..."）</span>}
          </label>
          <textarea data-image-prompt value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder={i2iEnabled
              ? 'Make the cat in the source image wear sunglasses, keep the rest unchanged'
              : 'A minimal flat-design cover image, white background, premium feel...'}
            rows={3}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2 py-1.5 leading-relaxed font-mono"
            disabled={loading}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void generate();
              }
            }} />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-400 dark:text-slate-500">
              {selectedKey ? selectedKey.label : '未选 key'} · {adapterSlug || '未选 adapter'} · {i2iEnabled ? 'i2i' : 't2i'}
            </div>
            <button type="button" data-image-generate onClick={() => void generate()} disabled={loading || !prompt.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 px-4 py-1.5 text-sm text-white font-medium transition-colors">
              {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
              生成 {n} 张
            </button>
          </div>
        </div>

        {lastError && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-900 dark:text-red-100 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="break-all min-w-0">{lastError}</div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 min-h-[40vh]">
          {history.length === 0 ? (
            <div className="text-center text-sm text-slate-400 dark:text-slate-500 py-12">
              <ImageIcon size={24} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
              {loading ? (
                <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> 生成中…</span>
              ) : (
                <span><Sparkles size={14} className="inline mr-1 opacity-50" aria-hidden="true" /> 在上方输入 prompt 后点「生成」开始</span>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {history.map((g, i) => (
                <button key={i} type="button" onClick={() => setLightboxIndex(i)}
                  className="group relative aspect-square overflow-hidden rounded-md border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 hover:ring-2 hover:ring-brand-500 transition-all"
                  title={g.prompt}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.url} alt={g.prompt.slice(0, 60)} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {g.adapterSlug ?? g.via} · {g.aspectRatio || g.size || '—'}{g.mode === 'i2i' ? ' · i2i' : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {lightboxIndex !== null && history.length > 0 && (
        <ImageLightbox
          images={history.map((g) => ({ url: g.url, alt: g.prompt }))}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={(next) => setLightboxIndex(next)}
        />
      )}
    </div>
  );
}
