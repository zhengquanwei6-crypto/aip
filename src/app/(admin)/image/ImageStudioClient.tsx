'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { History as HistoryIcon, RotateCcw, X, Trash2, Upload, Image as ImageIcon } from 'lucide-react';
import {
  PLATFORMS,
  CATEGORIES,
  IMAGE_TYPES,
} from '@/lib/constants';
import { toast } from '@/lib/toast';
import ProgressBar from '@/components/ProgressBar';
import ImageLightbox from '@/components/ImageLightbox';
import { usePromptHistory } from '@/hooks/usePromptHistory';

type Platform = 'xiaohongshu' | 'xianyu';

/**
 * v0.11 B14（BUG-L11 修）：删掉 v0.6 老的硬编码 `<option value="3:4">` / `<option value="1:1">`
 *   ratio select。原来与 adapter.aspectRatios 池脱节，4router-gpt-image-2 池
 *   只有 1:1/3:2/2:3，用户选「3:4」会触发 fallback 到 1:1。
 *   现在统一改用 selectedAspectRatio 池驱动（与 publish-director / playground 同源）。
 */

interface FormState {
  platform: Platform;
  imageType: string;
  category: string;
  coverTitle: string;
  styleKeywords: string;
}

interface ImagePreset {
  id: string;
  name: string;
  styleKeywords: string;
  negativePrompt: string | null;
  size: string;
  imageType: string;
  isDefault: boolean;
}

interface AssetRow {
  id?: string;
  url: string;
  fileName?: string;
}

interface HistoryEntry {
  id: string;
  prompt: string;
  url: string;
  ts: number;
}

interface QueueFailure {
  prompt: string;
  error: string;
}

/** v0.11 B7：尺寸 / 质量预设 */
interface SizePreset {
  label: string;
  value: string;
  tier?: string | null;
}
interface QualityPreset {
  label: string;
  value: string;
}
/** v0.11 B9：比例预设 */
interface AspectRatioPreset {
  label: string;
  ratio: string;
  sizeRule?: string | null;
}
interface AdapterSummaryItem {
  slug: string;
  name?: string;
  sizes?: SizePreset[] | null;
  qualities?: QualityPreset[] | null;
  aspectRatios?: AspectRatioPreset[] | null;
  supportsImg2Img?: boolean;
}

const DEFAULT: FormState = {
  platform: 'xiaohongshu',
  imageType: '封面图',
  category: 'Logo',
  coverTitle: '',
  styleKeywords: '简约现代、高级感、清爽白底',
};

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

export default function ImageStudioClient() {
  const [form, setForm] = useState<FormState>(DEFAULT);
  const [presets, setPresets] = useState<ImagePreset[]>([]);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [size, setSize] = useState('1024x1536');
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [step1Loading, setStep1Loading] = useState(false);
  const [step2Loading, setStep2Loading] = useState(false);
  const [elapsed1, setElapsed1] = useState(0);
  const [elapsed2, setElapsed2] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [lastError, setLastError] = useState<string | null>(null);
  const [lastTrace, setLastTrace] = useState<any>(null);

  const [batchPrompts, setBatchPrompts] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchDone, setBatchDone] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchElapsed, setBatchElapsed] = useState(0);
  const [batchFailures, setBatchFailures] = useState<QueueFailure[]>([]);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { history: textHistory, push: pushTextHistory, clear: clearTextHistory } =
    usePromptHistory('image', 20);

  // ─── v0.11 B7：尺寸 / 质量预设池 ───
  const [adapterSummary, setAdapterSummary] = useState<AdapterSummaryItem | null>(null);
  const [sizesPool, setSizesPool] = useState<SizePreset[]>([]);
  const [qualitiesPool, setQualitiesPool] = useState<QualityPreset[]>([]);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedQuality, setSelectedQuality] = useState<string>('');

  // ─── v0.11 B9：比例 / i2i ───
  const [aspectRatiosPool, setAspectRatiosPool] = useState<AspectRatioPreset[]>([]);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('');
  const [supportsImg2Img, setSupportsImg2Img] = useState(false);
  const [i2iEnabled, setI2iEnabled] = useState(false);
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [sourceImageBase64, setSourceImageBase64] = useState('');
  const [sourceImagePreview, setSourceImagePreview] = useState<string | null>(null);

  // v0.12 B3.3 · V012_B3_IMAGE_SOURCE_FROM_URL marker
  // /create?tab=image&sourceImage=<url> 在 mount 时把 URL 写到 sourceImageUrl，
  // 打通 /workspace?tab=assets 资产卡的「→ 用作 i2i 源图」入口。
  // useSearchParams 是 client hook，在 mount 后读一次即可（变更 URL 不强行覆盖用户已编辑的输入）。
  const _v012b3SearchParams = useSearchParams();
  useEffect(() => {
    const url = _v012b3SearchParams?.get('sourceImage');
    if (url && !sourceImageUrl && !sourceImageBase64) {
      setSourceImageUrl(url);
    }
    // 仅 mount 时跑一次，后续 URL 变化不强制覆盖（用户可能已改）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);

  // 拉默认 adapter
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const h = await fetch('/api/health').then((r) => r.json()).catch(() => null);
        const slug: string | null = h?.imageDefaultAdapter ?? null;
        if (!slug) return;
        const a = await fetch(`/api/adapters/${encodeURIComponent(slug)}`)
          .then((r) => r.json()).catch(() => null);
        if (!a?.ok || cancelled) return;
        const ad: AdapterSummaryItem = {
          slug,
          name: typeof a.adapter?.name === 'string' ? a.adapter.name : slug,
          sizes: Array.isArray(a.adapter?.sizes) ? a.adapter.sizes : null,
          qualities: Array.isArray(a.adapter?.qualities) ? a.adapter.qualities : null,
          aspectRatios: Array.isArray(a.adapter?.aspectRatios) ? a.adapter.aspectRatios : null,
          supportsImg2Img: a.adapter?.supportsImg2Img === true,
        };
        setAdapterSummary(ad);
        const sizes = (ad.sizes ?? []).filter((s) => s && typeof s.value === 'string');
        const qs = (ad.qualities ?? []).filter((q) => q && typeof q.value === 'string');
        const ars = (ad.aspectRatios ?? []).filter((r) => r && typeof r.ratio === 'string');
        setSizesPool(sizes);
        setQualitiesPool(qs);
        setAspectRatiosPool(ars);
        setSupportsImg2Img(!!ad.supportsImg2Img);
        if (sizes.length > 0) {
          setSelectedSize((prev) => prev && sizes.some((s) => s.value === prev) ? prev : sizes[0].value);
          setSize((prev) => prev && sizes.some((s) => s.value === prev) ? prev : sizes[0].value);
        }
        if (qs.length > 0) {
          setSelectedQuality((prev) => prev && qs.some((q) => q.value === prev) ? prev : qs[0].value);
        }
        if (ars.length > 0) {
          setSelectedAspectRatio((prev) => prev && ars.some((r) => r.ratio === prev) ? prev : ars[0].ratio);
        }
      } catch {
        /* silent */
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetch('/api/image-presets')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setPresets(j.list);
          const def = j.list.find((p: ImagePreset) => p.isDefault);
          if (def) {
            setForm((f) => ({
              ...f,
              styleKeywords: def.styleKeywords,
              imageType: def.imageType,
            }));
            setSize(def.size);
            setNegativePrompt(def.negativePrompt || '');
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!step1Loading) { setElapsed1(0); return; }
    const t = window.setInterval(() => setElapsed1((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [step1Loading]);

  useEffect(() => {
    if (!step2Loading) { setElapsed2(0); return; }
    const t = window.setInterval(() => setElapsed2((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [step2Loading]);

  useEffect(() => {
    if (!batchRunning) { setBatchElapsed(0); return; }
    const t = window.setInterval(() => setBatchElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [batchRunning]);

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function applyPreset(p: ImagePreset) {
    setForm((f) => ({ ...f, styleKeywords: p.styleKeywords, imageType: p.imageType }));
    setSize(p.size);
    setNegativePrompt(p.negativePrompt || '');
  }

  function appendHistory(items: AssetRow[], usedPrompt: string) {
    if (items.length === 0) return;
    setHistory((h) => {
      const next: HistoryEntry[] = [
        ...items.map((a, i) => ({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          prompt: usedPrompt,
          url: a.url,
          ts: Date.now(),
        })),
        ...h,
      ];
      return next.slice(0, 20);
    });
    pushTextHistory(usedPrompt);
  }

  async function buildPrompt() {
    setStep1Loading(true);
    try {
      const res = await fetch('/api/image/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      setPrompt(j.prompt || '');
      setNegativePrompt(j.negativePrompt || '');
      setSize(j.size || (form.platform === 'xiaohongshu' ? '1024x1536' : '1024x1024'));
      toast.success('提示词已生成');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStep1Loading(false);
    }
  }

  /** v0.11 B9：上传源图（base64 内存，5MB 上限） */
  async function handleSourceFile(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error(`图片过大（${(file.size / 1024 / 1024).toFixed(1)}MB）· 上限 5MB`);
      return;
    }
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

  async function callImage(customPrompt?: string): Promise<{ ok: boolean; assets: AssetRow[]; error?: string }> {
    const usePrompt = (customPrompt ?? prompt).trim();
    if (!usePrompt) {
      toast.error('请先生成或填写提示词');
      return { ok: false, assets: [], error: '提示词为空' };
    }
    if (i2iEnabled) {
      if (!sourceImageUrl.trim() && !sourceImageBase64) {
        toast.error('图生图模式需提供源图（URL 或上传文件）');
        return { ok: false, assets: [], error: '缺源图' };
      }
    }
    setStep2Loading(true);
    setLastError(null);
    setLastTrace(null);
    try {
      const finalSize = selectedSize || size;
      const finalQuality = selectedQuality || undefined;
      const finalAspect = selectedAspectRatio || undefined;
      const reqBody: Record<string, unknown> = {
        prompt: usePrompt,
        size: finalSize,
        quality: finalQuality,
        aspectRatio: finalAspect,
        platform: form.platform,
        category: form.category,
        imageType: form.imageType,
      };
      if (i2iEnabled) {
        reqBody.mode = 'i2i';
        if (sourceImageUrl.trim()) reqBody.sourceImageUrl = sourceImageUrl.trim();
        else if (sourceImageBase64) reqBody.sourceImageBase64 = sourceImageBase64;
      }
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        const msg = j.error || '图片生成失败';
        setLastError(msg);
        if (j.trace) setLastTrace(j.trace);
        throw new Error(msg);
      }
      const arr: AssetRow[] = Array.isArray(j.assets) && j.assets.length > 0
        ? j.assets
        : j.asset ? [j.asset] : [];
      if (!customPrompt) setAssets(arr);
      appendHistory(arr, usePrompt);
      if (arr.length > 0 && !customPrompt) toast.success(`已生成 ${arr.length} 张图`);
      return { ok: true, assets: arr };
    } catch (e) {
      const msg = (e as Error).message;
      if (!customPrompt) toast.error(msg);
      return { ok: false, assets: [], error: msg };
    } finally {
      setStep2Loading(false);
    }
  }

  async function retry() { await callImage(); }

  async function runBatch() {
    const lines = batchPrompts.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) {
      toast.error('请在批量框里至少写一行 prompt');
      return;
    }
    setBatchRunning(true);
    setBatchTotal(lines.length);
    setBatchDone(0);
    setBatchFailures([]);
    let okCount = 0;
    const fails: QueueFailure[] = [];
    const allAssets: AssetRow[] = [];

    for (let i = 0; i < lines.length; i++) {
      const p = lines[i];
      const r = await callImage(p);
      if (r.ok) {
        okCount++;
        allAssets.push(...r.assets);
      } else {
        fails.push({ prompt: p, error: r.error ?? '未知错误' });
      }
      setBatchDone(i + 1);
      setBatchFailures([...fails]);
      if (i < lines.length - 1) await new Promise((res) => setTimeout(res, 800));
    }
    setBatchRunning(false);
    if (allAssets.length > 0) setAssets(allAssets);
    if (fails.length === 0) toast.success(`批量完成 ${okCount}/${lines.length}`);
    else toast.error(`完成 ${okCount}/${lines.length}，失败 ${fails.length} 张`);
  }

  async function retryFailure(idx: number) {
    const item = batchFailures[idx];
    if (!item) return;
    const r = await callImage(item.prompt);
    if (r.ok) {
      setBatchFailures((arr) => arr.filter((_, i) => i !== idx));
      setAssets((curr) => [...curr, ...r.assets]);
      toast.success('重试成功');
    } else {
      setBatchFailures((arr) =>
        arr.map((x, i) => (i === idx ? { ...x, error: r.error ?? '未知错误' } : x)),
      );
    }
  }

  function reusePromptFromHistory(h: HistoryEntry) {
    setPrompt(h.prompt);
    toast.info('已填入提示词，可直接生成');
  }

  function reusePromptFromText(text: string) {
    setPrompt(text);
    toast.info('已填入历史提示词');
  }

  const adapterLabel = useMemo(() => {
    if (!adapterSummary) return '';
    return adapterSummary.name || adapterSummary.slug;
  }, [adapterSummary]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
      <div className="card h-fit">
        <div className="card-header">
          <h2 className="font-semibold">图片参数</h2>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600"
            title="本会话最近 20 次生成（刷新清空） + 持久化 prompt 历史"
            data-prompt-history
          >
            <HistoryIcon size={14} />
            历史 {history.length + textHistory.length > 0 ? `(${history.length}/${textHistory.length})` : ''}
          </button>
        </div>
        <div className="card-body space-y-3">
          <Field label="平台">
            <select className="input" value={form.platform} onChange={(e) => up('platform', e.target.value as Platform)}>
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          {/* v0.11 B14（BUG-L11 修）：删掉硬编码 ratio select，统一用下方「比例预设」(adapter.aspectRatios 池) */}
          <Field label="图片类型">
            <select className="input" value={form.imageType} onChange={(e) => up('imageType', e.target.value)}>
              {IMAGE_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="类目">
            <select className="input" value={form.category} onChange={(e) => up('category', e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="封面标题">
            <input className="input" value={form.coverTitle} onChange={(e) => up('coverTitle', e.target.value)} placeholder="例：奶茶店开业菜单升级" />
          </Field>
          <Field label="风格关键词">
            <input className="input" value={form.styleKeywords} onChange={(e) => up('styleKeywords', e.target.value)} />
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs text-slate-400 mr-1">预设:</span>
                {presets.map((p) => (
                  <button key={p.id} type="button" onClick={() => applyPreset(p)}
                    className={'px-2 py-0.5 rounded-full text-xs border ' + (form.styleKeywords === p.styleKeywords ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50')}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <button onClick={buildPrompt} disabled={step1Loading} className="btn-primary w-full">
            {step1Loading ? '生成中...' : '① 先生成图片提示词'}
          </button>
          {step1Loading && <ProgressBar mode="indeterminate" label="正在生成提示词…" elapsed={elapsed1} />}
          <p className="text-xs text-slate-400 leading-relaxed">提示：先生成提示词后，可以在右侧手动调整再生成图片。</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">提示词（可手动修改）</h2>
            {prompt && (
              <button onClick={async () => { try { await navigator.clipboard?.writeText(prompt); toast.success('已复制提示词'); } catch { toast.error('复制失败'); } }}
                className="text-xs text-brand-600 hover:underline">复制</button>
            )}
          </div>
          <div className="card-body space-y-3">
            <Field label="正向提示词">
              <textarea className="input min-h-[140px]" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder='点击左侧"先生成图片提示词"，或在此手动填写' />
            </Field>
            <Field label="负向提示词">
              <textarea className="input min-h-[60px]" value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} />
            </Field>

            {/* v0.11 B7 + B9：尺寸 / 质量 / 比例三个 select（B14 起此处是唯一 ratio 入口） */}
            {(sizesPool.length > 0 || qualitiesPool.length > 0 || aspectRatiosPool.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {aspectRatiosPool.length > 0 && (
                  <Field label={`比例预设${adapterLabel ? `（${adapterLabel}）` : ''}`}>
                    <select className="input" value={selectedAspectRatio}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedAspectRatio(v);
                        const rule = aspectRatiosPool.find((r) => r.ratio === v)?.sizeRule;
                        if (rule && rule.trim()) {
                          setSelectedSize(rule.trim());
                          setSize(rule.trim());
                        }
                      }}
                      data-aspect-ratio-select aria-label="比例预设">
                      {aspectRatiosPool.map((r) => <option key={r.ratio} value={r.ratio}>{r.label}</option>)}
                    </select>
                  </Field>
                )}
                {sizesPool.length > 0 && (
                  <Field label="尺寸预设">
                    <select className="input" value={selectedSize}
                      onChange={(e) => { const v = e.target.value; setSelectedSize(v); if (v) setSize(v); }}
                      data-size-preset-select aria-label="尺寸预设">
                      {sizesPool.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </Field>
                )}
                {qualitiesPool.length > 0 && (
                  <Field label="质量预设">
                    <select className="input" value={selectedQuality} onChange={(e) => setSelectedQuality(e.target.value)}
                      data-quality-preset-select aria-label="质量预设">
                      {qualitiesPool.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
                    </select>
                  </Field>
                )}
              </div>
            )}

            {/* v0.11 B9：图生图开关 + 源图选择器（仅 supportsImg2Img 显示） */}
            {supportsImg2Img && (
              <div className="rounded border border-violet-200 dark:border-violet-700/40 bg-violet-50/40 dark:bg-violet-900/10 p-3 space-y-2">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-violet-800 dark:text-violet-200 cursor-pointer">
                  <input type="checkbox" checked={i2iEnabled} onChange={(e) => setI2iEnabled(e.target.checked)}
                    data-i2i-toggle aria-label="图生图开关" />
                  <ImageIcon size={14} aria-hidden="true" />
                  图生图模式（image-to-image）
                </label>
                {i2iEnabled && (
                  <div className="space-y-2">
                    <Field label="源图 URL（外链或 /uploads/...）">
                      <input className="input" type="text" value={sourceImageUrl}
                        onChange={(e) => { setSourceImageUrl(e.target.value); if (e.target.value.trim()) { setSourceImagePreview(e.target.value); setSourceImageBase64(''); } }}
                        placeholder="https://example.com/source.png 或 /uploads/abc.png"
                        data-source-image-url />
                    </Field>
                    <div className="text-xs text-slate-500">— 或 —</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input ref={sourceFileInputRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleSourceFile(f); }}
                        data-source-image-file />
                      <button type="button" onClick={() => sourceFileInputRef.current?.click()}
                        className="btn-secondary inline-flex items-center gap-1 text-sm">
                        <Upload size={14} aria-hidden="true" />
                        上传源图（≤ 5MB）
                      </button>
                      {(sourceImagePreview || sourceImageUrl) && (
                        <button type="button" onClick={clearSourceImage}
                          className="text-xs text-slate-500 hover:text-rose-500 inline-flex items-center gap-1">
                          <X size={12} /> 清除
                        </button>
                      )}
                    </div>
                    {sourceImagePreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sourceImagePreview} alt="source preview"
                        className="max-h-32 rounded border border-slate-200 dark:border-slate-700" />
                    )}
                    <p className="text-[11px] text-violet-700 dark:text-violet-300 leading-relaxed">
                      勾选后系统会调用 image-to-image 接口（KIE Flux / GPT Image 2 i2i / OpenAI /images/edits）。
                      正向 prompt 描述"基于源图改..."的指令。
                    </p>
                  </div>
                )}
              </div>
            )}

            <Field label="尺寸（自定义可改，预设优先）">
              <input className="input" value={size} onChange={(e) => setSize(e.target.value)} placeholder="例：1024x1536" />
            </Field>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => callImage()} disabled={step2Loading || batchRunning} className="btn-primary">
                {step2Loading ? '调用图片 API 中...' : '② 调用图片 API 生成'}
              </button>
              {lastError && !step2Loading && (
                <button onClick={retry} disabled={step2Loading || batchRunning}
                  className="btn-secondary inline-flex items-center gap-1 text-sm">
                  <RotateCcw size={14} /> 重试
                </button>
              )}
            </div>
            {step2Loading && <ProgressBar mode="indeterminate" label="正在出图…" elapsed={elapsed2} />}

            {lastError && !step2Loading && (
              <div className="rounded border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800 p-2 space-y-1">
                <div className="text-xs text-rose-700 dark:text-rose-300 break-all">✗ {lastError}</div>
                {lastTrace && (
                  <details>
                    <summary className="text-[11px] text-rose-500 cursor-pointer">调试信息</summary>
                    <pre className="mt-1 text-[11px] bg-white/60 dark:bg-rose-950/60 p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap break-all">{JSON.stringify(lastTrace, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">批量生成（每行一个 prompt，串行节流 800ms）</h2>
            {batchRunning && <span className="text-xs text-slate-500">运行中…</span>}
          </div>
          <div className="card-body space-y-2">
            <textarea className="input min-h-[100px] font-mono text-xs" value={batchPrompts} onChange={(e) => setBatchPrompts(e.target.value)}
              placeholder={'每行一个 prompt，例：\n清新简约的母婴用品 logo\n复古日式茶馆海报\n极简北欧风家居图'} disabled={batchRunning} />
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={runBatch} disabled={batchRunning || step2Loading} className="btn-primary text-sm">
                {batchRunning ? `批量生成中（${batchDone}/${batchTotal}）…` : '批量生成'}
              </button>
              {batchPrompts && !batchRunning && (
                <button onClick={() => setBatchPrompts('')} className="text-xs text-slate-500 hover:text-slate-700">清空</button>
              )}
            </div>
            {batchTotal > 0 && <ProgressBar mode="determinate" value={batchDone} max={batchTotal} label={`队列 ${batchDone}/${batchTotal}`} elapsed={batchElapsed} />}
            {batchFailures.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2 space-y-1">
                <div className="text-xs text-amber-700 dark:text-amber-300">失败 {batchFailures.length} 项 · 可二次重试</div>
                <ul className="space-y-1">
                  {batchFailures.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px]">
                      <button onClick={() => retryFailure(i)}
                        className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-300 hover:bg-amber-100">
                        <RotateCcw size={10} /> 重试
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-slate-700 dark:text-slate-300 truncate" title={f.prompt}>{f.prompt}</div>
                        <div className="text-rose-600 dark:text-rose-400 truncate" title={f.error}>{f.error}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">生成结果</h2>
            {assets.length > 0 && <span className="text-xs text-slate-500">共 {assets.length} 张 · 点击查看大图</span>}
          </div>
          <div className="card-body">
            {assets.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-12">尚未生成图片。完成上方两步后会显示在这里。生成的图片会自动保存到「素材库」。</div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {assets.map((a, i) => (
                  <button key={a.id ?? i} type="button" onClick={() => setLightboxIndex(i)} className="block relative group" aria-label={`查看第 ${i + 1} 张大图`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={`生成结果 ${i + 1}`} className="w-full aspect-square object-cover rounded border border-slate-200 dark:border-slate-700 group-hover:opacity-90 cursor-zoom-in transition-opacity" />
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px] tabular-nums">{i + 1} / {assets.length}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {lightboxIndex !== null && assets.length > 0 && (
        <ImageLightbox images={assets.map((a) => ({ url: a.url }))} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onIndexChange={(i) => setLightboxIndex(i)} />
      )}

      {historyOpen && (
        <>
          <div className="fixed inset-0 z-[9000] bg-black/30 backdrop-blur-sm" onClick={() => setHistoryOpen(false)} aria-hidden="true" />
          <aside className="fixed top-0 right-0 z-[9001] h-full w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-xl flex flex-col" role="dialog" aria-label="本会话生成历史 + 持久化 prompt 历史">
            <header className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800">
              <div className="font-medium text-sm flex items-center gap-1.5"><HistoryIcon size={14} /> 历史</div>
              <button onClick={() => setHistoryOpen(false)} aria-label="关闭历史" className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </header>
            <div className="flex-1 overflow-auto p-2 space-y-3">
              <section>
                <div className="px-1 py-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">本会话 · 含图（刷新清空）</div>
                {history.length === 0 ? (<div className="text-xs text-slate-400 text-center py-4">暂无记录</div>) : (
                  history.map((h) => (
                    <button key={h.id} type="button" onClick={() => reusePromptFromHistory(h)}
                      className="w-full flex gap-2 items-start text-left p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" title="点击复用 prompt">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.url} alt="history thumb" className="w-12 h-12 object-cover rounded border border-slate-200 dark:border-slate-700 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-slate-500">{new Date(h.ts).toLocaleTimeString('zh-CN')}</div>
                        <div className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">{h.prompt}</div>
                      </div>
                    </button>
                  ))
                )}
              </section>
              <section data-prompt-text-history>
                <div className="px-1 py-1 text-[11px] font-medium uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>持久化 prompt（最近 20 条）</span>
                  {textHistory.length > 0 && (
                    <button type="button" onClick={() => { clearTextHistory(); toast.info('已清空持久化 prompt 历史'); }}
                      className="text-slate-400 hover:text-rose-500 inline-flex items-center gap-0.5" title="清空持久化历史">
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
                {textHistory.length === 0 ? (<div className="text-xs text-slate-400 text-center py-4">暂无记录</div>) : (
                  <ul className="space-y-1">
                    {textHistory.map((p, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => reusePromptFromText(p)}
                          className="w-full text-left p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 line-clamp-2" title="点击复用 prompt">{p}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
