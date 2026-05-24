'use client';

/**
 * <GenerateImageForPostDrawer>
 *
 * 入口：在 /content 页生成完笔记后点「为这篇生图」。
 *
 * v0.11 B7：尺寸 / 质量 select
 * v0.11 B9：比例 select + 图生图开关 + 源图选择器
 */

import { useEffect, useRef, useState } from 'react';
import { X, Wand2, Loader2, RotateCw, Image as ImageIcon, ChevronDown, ChevronUp, Settings as SettingsIcon, Upload } from 'lucide-react';

interface PostNotes {
  title?: string;
  body?: string;
  coverText?: string;
  tags?: string;
  description?: string;
  tiers?: { tier: string; name: string; priceRange: string }[];
}

export interface GenerateImageForPostDrawerProps {
  open: boolean;
  onClose: () => void;
  platform: 'xiaohongshu' | 'xianyu';
  category?: string;
  imageType?: string;
  notes: PostNotes;
}

interface BuildResult {
  styleSummary: string;
  promptEn: string;
  negativeEn: string;
  recommendedSize: '1024x1024' | '1024x1536' | '1536x1024';
  tips?: string[];
}

interface GeneratedImage {
  url: string;
  ts: number;
}

interface SizePreset { label: string; value: string; tier?: string | null; }
interface QualityPreset { label: string; value: string; }
interface AspectRatioPreset { label: string; ratio: string; sizeRule?: string | null; }
interface AdapterSummary {
  slug: string;
  name?: string;
  sizes: SizePreset[];
  qualities: QualityPreset[];
  aspectRatios: AspectRatioPreset[];
  supportsImg2Img: boolean;
}

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

export function GenerateImageForPostDrawer({
  open,
  onClose,
  platform,
  category,
  imageType,
  notes,
}: GenerateImageForPostDrawerProps) {
  const [building, setBuilding] = useState(false);
  const [buildErr, setBuildErr] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildResult | null>(null);
  const [editedSummary, setEditedSummary] = useState('');
  const [showEnPrompt, setShowEnPrompt] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [genElapsed, setGenElapsed] = useState(0);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [adapter, setAdapter] = useState<AdapterSummary | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedQuality, setSelectedQuality] = useState<string>('');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('');

  // v0.11 B9：i2i
  const [i2iEnabled, setI2iEnabled] = useState(false);
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [sourceImageBase64, setSourceImageBase64] = useState('');
  const [sourceImagePreview, setSourceImagePreview] = useState<string | null>(null);
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);

  const ranInitial = useRef(false);

  useEffect(() => {
    if (!open) { ranInitial.current = false; return; }
    if (ranInitial.current) return;
    ranInitial.current = true;
    void runBuild();
    void loadAdapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      setBuild(null);
      setBuildErr(null);
      setEditedSummary('');
      setImages([]);
      setGenErr(null);
      setShowEnPrompt(false);
      setAdapter(null);
      setSelectedSize('');
      setSelectedQuality('');
      setSelectedAspectRatio('');
      setI2iEnabled(false);
      setSourceImageUrl('');
      setSourceImageBase64('');
      setSourceImagePreview(null);
    }
  }, [open]);

  async function loadAdapter() {
    try {
      const h = await fetch('/api/health').then((r) => r.json()).catch(() => null);
      const slug: string | null = h?.imageDefaultAdapter ?? null;
      if (!slug) return;
      const a = await fetch(`/api/adapters/${encodeURIComponent(slug)}`)
        .then((r) => r.json()).catch(() => null);
      if (!a?.ok) return;
      const sizes: SizePreset[] = Array.isArray(a.adapter?.sizes)
        ? a.adapter.sizes.filter((s: any) => s && typeof s.value === 'string' && typeof s.label === 'string')
        : [];
      const qualities: QualityPreset[] = Array.isArray(a.adapter?.qualities)
        ? a.adapter.qualities.filter((q: any) => q && typeof q.value === 'string' && typeof q.label === 'string')
        : [];
      const aspectRatios: AspectRatioPreset[] = Array.isArray(a.adapter?.aspectRatios)
        ? a.adapter.aspectRatios.filter((r: any) => r && typeof r.ratio === 'string' && typeof r.label === 'string')
        : [];
      const summary: AdapterSummary = {
        slug,
        name: typeof a.adapter?.name === 'string' ? a.adapter.name : slug,
        sizes,
        qualities,
        aspectRatios,
        supportsImg2Img: a.adapter?.supportsImg2Img === true,
      };
      setAdapter(summary);
      if (sizes.length > 0) setSelectedSize(sizes[0].value);
      if (qualities.length > 0) setSelectedQuality(qualities[0].value);
      if (aspectRatios.length > 0) setSelectedAspectRatio(aspectRatios[0].ratio);
    } catch {
      /* silent */
    }
  }

  function onAspectChange(v: string) {
    setSelectedAspectRatio(v);
    const rule = adapter?.aspectRatios.find((r) => r.ratio === v)?.sizeRule;
    if (rule && rule.trim() && adapter?.sizes.some((s) => s.value === rule.trim())) {
      setSelectedSize(rule.trim());
    }
  }

  async function handleSourceFile(file: File) {
    if (!file.type.startsWith('image/')) { alert('请选择图片文件'); return; }
    if (file.size > MAX_SOURCE_BYTES) { alert(`图片过大（${(file.size / 1024 / 1024).toFixed(1)}MB）· 上限 5MB`); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setSourceImagePreview(dataUrl);
      const m = dataUrl.match(/^data:image\/[a-z]+;base64,(.+)$/i);
      if (m) {
        setSourceImageBase64(m[1]);
        setSourceImageUrl('');
      }
    };
    reader.readAsDataURL(file);
  }
  function clearSourceImage() {
    setSourceImageUrl('');
    setSourceImageBase64('');
    setSourceImagePreview(null);
    if (sourceFileInputRef.current) sourceFileInputRef.current.value = '';
  }

  async function runBuild(hint?: string) {
    setBuilding(true);
    setBuildErr(null);
    try {
      const r = await fetch('/api/agents/photo-director/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          category,
          imageType,
          notes,
          styleSummaryHint: hint,
          imageOptions: {
            ...(selectedSize ? { size: selectedSize } : {}),
            ...(selectedQuality ? { quality: selectedQuality } : {}),
            ...(selectedAspectRatio ? { aspectRatio: selectedAspectRatio } : {}),
            mode: i2iEnabled ? 'i2i' : 't2i',
            ...(i2iEnabled && sourceImageUrl ? { sourceImageUrl } : {}),
          },
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setBuild(j.result as BuildResult);
      setEditedSummary(j.result.styleSummary);
    } catch (e) {
      setBuildErr((e as Error).message);
    } finally {
      setBuilding(false);
    }
  }

  async function runGenerate() {
    if (!build) return;
    if (i2iEnabled && !sourceImageUrl.trim() && !sourceImageBase64) {
      setGenErr('图生图模式需提供源图（URL 或上传文件）');
      return;
    }
    setGenerating(true);
    setGenErr(null);
    setGenElapsed(0);
    const t0 = Date.now();
    elapsedTimer.current = setInterval(() => setGenElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    try {
      const promptForApi =
        build.promptEn + (build.negativeEn ? `\n\nNegative: ${build.negativeEn}` : '');
      const finalSize = selectedSize || build.recommendedSize;
      const finalQuality = selectedQuality || undefined;
      const finalAspect = selectedAspectRatio || undefined;
      const reqBody: Record<string, unknown> = {
        prompt: promptForApi,
        platform,
        category,
        imageType: imageType || '封面图',
        size: finalSize,
        ...(finalQuality !== undefined ? { quality: finalQuality } : {}),
        ...(finalAspect !== undefined ? { aspectRatio: finalAspect } : {}),
        n: 1,
        extra: { styleSummary: editedSummary },
      };
      if (i2iEnabled) {
        reqBody.mode = 'i2i';
        if (sourceImageUrl.trim()) reqBody.sourceImageUrl = sourceImageUrl.trim();
        else if (sourceImageBase64) reqBody.sourceImageBase64 = sourceImageBase64;
      }
      const r = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const url = j.asset?.url as string | undefined;
      if (url) {
        setImages((prev) => [{ url, ts: Date.now() }, ...prev]);
      } else {
        throw new Error('未返回图片 URL');
      }
    } catch (e) {
      setGenErr((e as Error).message);
    } finally {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      elapsedTimer.current = null;
      setGenerating(false);
    }
  }

  if (!open) return null;

  const sizesPool = adapter?.sizes ?? [];
  const qualitiesPool = adapter?.qualities ?? [];
  const aspectRatiosPool = adapter?.aspectRatios ?? [];
  const supportsImg2Img = !!adapter?.supportsImg2Img;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <aside className="w-full sm:w-[520px] h-full bg-white dark:bg-slate-900 shadow-xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎬</span>
            <div>
              <div className="font-semibold">为这篇笔记生图</div>
              <div className="text-xs text-slate-500">photo-director · 中文你看，英文上游用</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* 图片选项（比例 + 尺寸 + 质量） */}
          {(aspectRatiosPool.length > 0 || sizesPool.length > 0 || qualitiesPool.length > 0) && (
            <div className="rounded border border-amber-200 dark:border-amber-700/40 bg-amber-50/50 dark:bg-amber-900/10 p-3">
              <div className="text-sm font-medium text-amber-800 dark:text-amber-200 inline-flex items-center gap-1 mb-2">
                <SettingsIcon size={14} /> 图片选项{adapter?.name ? `（${adapter.name}）` : ''}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {aspectRatiosPool.length > 0 && (
                  <div>
                    <label className="label">比例预设</label>
                    <select className="input" value={selectedAspectRatio} onChange={(e) => onAspectChange(e.target.value)}
                      disabled={building || generating} data-aspect-ratio-select aria-label="比例预设">
                      {aspectRatiosPool.map((r) => <option key={r.ratio} value={r.ratio}>{r.label}</option>)}
                    </select>
                  </div>
                )}
                {sizesPool.length > 0 && (
                  <div>
                    <label className="label">尺寸预设</label>
                    <select className="input" value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)}
                      disabled={building || generating} data-size-preset-select aria-label="尺寸预设">
                      {sizesPool.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                )}
                {qualitiesPool.length > 0 && (
                  <div>
                    <label className="label">质量预设</label>
                    <select className="input" value={selectedQuality} onChange={(e) => setSelectedQuality(e.target.value)}
                      disabled={building || generating} data-quality-preset-select aria-label="质量预设">
                      {qualitiesPool.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* v0.11 B9：图生图 */}
          {supportsImg2Img && (
            <div className="rounded border border-violet-200 dark:border-violet-700/40 bg-violet-50/40 dark:bg-violet-900/10 p-3 space-y-2">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-violet-800 dark:text-violet-200 cursor-pointer">
                <input type="checkbox" checked={i2iEnabled} onChange={(e) => setI2iEnabled(e.target.checked)}
                  disabled={building || generating} data-i2i-toggle aria-label="图生图开关" />
                <ImageIcon size={14} aria-hidden="true" />
                图生图模式（image-to-image）
              </label>
              {i2iEnabled && (
                <div className="space-y-2">
                  <div>
                    <label className="label">源图 URL</label>
                    <input className="input" type="text" value={sourceImageUrl}
                      onChange={(e) => {
                        setSourceImageUrl(e.target.value);
                        if (e.target.value.trim()) {
                          setSourceImagePreview(e.target.value);
                          setSourceImageBase64('');
                        }
                      }}
                      disabled={building || generating}
                      placeholder="https://example.com/source.png 或 /uploads/abc.png"
                      data-source-image-url />
                  </div>
                  <div className="text-xs text-slate-500">— 或 —</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input ref={sourceFileInputRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleSourceFile(f); }}
                      data-source-image-file />
                    <button type="button" onClick={() => sourceFileInputRef.current?.click()} disabled={building || generating}
                      className="text-xs inline-flex items-center gap-1 rounded border border-violet-300 dark:border-violet-700 px-2 py-1 hover:bg-violet-100 dark:hover:bg-violet-900/40">
                      <Upload size={12} /> 上传源图（≤ 5MB）
                    </button>
                    {(sourceImagePreview || sourceImageUrl) && (
                      <button type="button" onClick={clearSourceImage} disabled={building || generating}
                        className="text-xs text-slate-500 hover:text-rose-500 inline-flex items-center gap-0.5">
                        <X size={11} /> 清除
                      </button>
                    )}
                  </div>
                  {sourceImagePreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sourceImagePreview} alt="source preview"
                      className="max-h-24 rounded border border-slate-200 dark:border-slate-700" />
                  )}
                </div>
              )}
            </div>
          )}

          {/* 风格优化区 */}
          <div className="rounded border border-slate-200 dark:border-slate-700 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium inline-flex items-center gap-1">
                <Wand2 size={14} /> 风格说明（中文，可改）
              </div>
              <button onClick={() => void runBuild(editedSummary)} disabled={building}
                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 disabled:opacity-40">
                <RotateCw size={12} /> 重新优化
              </button>
            </div>
            {building && !build && (
              <div className="text-sm text-slate-500 inline-flex items-center gap-2 py-3">
                <Loader2 size={14} className="animate-spin" /> 拍摄总监正在分析这篇笔记…
              </div>
            )}
            {buildErr && (
              <div className="text-xs bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded p-2">
                photo-director 失败：{buildErr}
                <button onClick={() => void runBuild()} className="ml-2 underline">重试</button>
              </div>
            )}
            {build && (
              <>
                <textarea value={editedSummary} onChange={(e) => setEditedSummary(e.target.value)} rows={3}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm"
                  disabled={building || generating} />
                {build.tips && build.tips.length > 0 && (
                  <ul className="mt-2 text-xs text-slate-500 list-disc list-inside space-y-0.5">
                    {build.tips.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                )}
                <div className="mt-2 text-xs">
                  <button onClick={() => setShowEnPrompt((v) => !v)}
                    className="text-slate-500 hover:underline inline-flex items-center gap-1">
                    {showEnPrompt ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    实际发给上游的英文 prompt
                  </button>
                  {showEnPrompt && (
                    <div className="mt-1.5 space-y-1.5 text-[11px] font-mono bg-slate-50 dark:bg-slate-800/60 rounded p-2 max-h-40 overflow-y-auto">
                      <div><div className="text-slate-500">prompt:</div><div className="whitespace-pre-wrap">{build.promptEn}</div></div>
                      <div><div className="text-slate-500">negative:</div><div className="whitespace-pre-wrap">{build.negativeEn}</div></div>
                      <div className="text-slate-500">
                        size: {selectedSize || build.recommendedSize}
                        {selectedAspectRatio ? ` · aspectRatio: ${selectedAspectRatio}` : ''}
                        {selectedQuality ? ` · quality: ${selectedQuality}` : ''}
                        {i2iEnabled ? ' · mode: i2i' : ''}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {build && (
            <div className="flex items-center gap-2">
              <button onClick={() => void runGenerate()} disabled={generating || building}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded px-3 py-2 text-sm inline-flex items-center justify-center gap-2">
                {generating ? (<><Loader2 size={14} className="animate-spin" /> 生成中… {genElapsed}s</>) : (<><ImageIcon size={14} /> {images.length === 0 ? '生成图片' : '再来一张'}</>)}
              </button>
            </div>
          )}

          {genErr && (
            <div className="text-xs bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded p-2">
              生成失败：{genErr}
            </div>
          )}

          {images.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-medium">已生成（最新在上）</div>
              {images.map((im, i) => (
                <div key={i} className="rounded border border-slate-200 dark:border-slate-700 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt={`generated ${i}`} className="w-full block" />
                  <div className="px-2 py-1 text-[11px] text-slate-500 flex items-center justify-between">
                    <span>{new Date(im.ts).toLocaleTimeString()}</span>
                    <a href={im.url} target="_blank" rel="noopener" className="text-blue-600 hover:underline">原图</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
