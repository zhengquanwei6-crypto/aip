'use client';

/**
 * <GenerateImageForPostDrawer>
 *
 * 入口：在 /content 页生成完笔记后点「为这篇生图」打开。
 *
 * 流程：
 *   1. 打开抽屉 → 自动调 /api/agents/photo-director/build，把笔记字段喂进去
 *   2. 拿到 { styleSummary(中文), promptEn(英文), negativeEn, recommendedSize, tips } 显示给用户
 *   3. 用户可以改 styleSummary（中文）后点「重新优化」→ 再调一次 photo-director
 *   4. 用户点「生成图片」→ 调 /api/image/generate（用 promptEn + negativeEn + size + n=1）
 *   5. 显示出图，提供「再来一张」「关闭」
 *
 * v0.11 B7：
 *   - 抽屉打开时根据 IMAGE_DEFAULT_ADAPTER 拉 sizes/qualities 池
 *   - 「图片选项」区新增 size + quality select（pool 有 ≥1 项才显示）
 *   - 调 /api/image/generate 时把 size + quality 透传
 *   - 老 imageOptions 用户没动 → 自动用 sizes[0] / qualities[0]（默认 1k + standard/medium）
 *   - 用户选了不在 pool 的值 → 后端 image-runner 内 fallback（前端不阻挡）
 */

import { useEffect, useRef, useState } from 'react';
import { X, Wand2, Loader2, RotateCw, Image as ImageIcon, ChevronDown, ChevronUp, Settings as SettingsIcon } from 'lucide-react';

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
  /** 平台 */
  platform: 'xiaohongshu' | 'xianyu';
  /** 类目 */
  category?: string;
  /** 图片用途 */
  imageType?: string;
  /** 笔记/商品字段 */
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
interface AdapterSummary {
  slug: string;
  name?: string;
  sizes: SizePreset[];
  qualities: QualityPreset[];
}

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

  // v0.11 B7：adapter 池 + 用户选择
  const [adapter, setAdapter] = useState<AdapterSummary | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedQuality, setSelectedQuality] = useState<string>('');

  const ranInitial = useRef(false);

  // 第一次打开时自动跑 photo-director + 拉 adapter 池
  useEffect(() => {
    if (!open) {
      ranInitial.current = false;
      return;
    }
    if (ranInitial.current) return;
    ranInitial.current = true;
    void runBuild();
    void loadAdapter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 重置状态当抽屉关闭时
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
      const summary: AdapterSummary = {
        slug,
        name: typeof a.adapter?.name === 'string' ? a.adapter.name : slug,
        sizes,
        qualities,
      };
      setAdapter(summary);
      if (sizes.length > 0) setSelectedSize(sizes[0].value);
      if (qualities.length > 0) setSelectedQuality(qualities[0].value);
    } catch {
      // 静默：没有 adapter 池时回退老路径
    }
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
          // v0.11 B7：透传当前选择，server 端目前仅回显
          imageOptions: {
            ...(selectedSize ? { size: selectedSize } : {}),
            ...(selectedQuality ? { quality: selectedQuality } : {}),
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
    setGenerating(true);
    setGenErr(null);
    setGenElapsed(0);
    const t0 = Date.now();
    elapsedTimer.current = setInterval(() => setGenElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    try {
      const promptForApi =
        build.promptEn +
        (build.negativeEn ? `\n\nNegative: ${build.negativeEn}` : '');
      // v0.11 B7：用户在 select 选了 size 就用 select 值；否则用 LLM 推荐 build.recommendedSize
      const finalSize = selectedSize || build.recommendedSize;
      const finalQuality = selectedQuality || undefined;
      const r = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 把英文 prompt 直接送进 image-runner（adapter 会按 bodyTemplate 转）
          prompt: promptForApi,
          platform,
          category,
          imageType: imageType || '封面图',
          size: finalSize,
          ...(finalQuality !== undefined ? { quality: finalQuality } : {}),
          n: 1,
          extra: {
            // 保留中文风格说明，便于在 Asset 表里回看
            styleSummary: editedSummary,
          },
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        throw new Error(j.error || `HTTP ${r.status}`);
      }
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
          {/* v0.11 B7：图片选项（尺寸 / 质量 select） */}
          {(sizesPool.length > 0 || qualitiesPool.length > 0) && (
            <div className="rounded border border-amber-200 dark:border-amber-700/40 bg-amber-50/50 dark:bg-amber-900/10 p-3">
              <div className="text-sm font-medium text-amber-800 dark:text-amber-200 inline-flex items-center gap-1 mb-2">
                <SettingsIcon size={14} /> 图片选项{adapter?.name ? `（${adapter.name}）` : ''}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {sizesPool.length > 0 && (
                  <div>
                    <label className="label">尺寸预设</label>
                    <select
                      className="input"
                      value={selectedSize}
                      onChange={(e) => setSelectedSize(e.target.value)}
                      disabled={building || generating}
                      data-size-preset-select
                      aria-label="尺寸预设"
                    >
                      {sizesPool.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {qualitiesPool.length > 0 && (
                  <div>
                    <label className="label">质量预设</label>
                    <select
                      className="input"
                      value={selectedQuality}
                      onChange={(e) => setSelectedQuality(e.target.value)}
                      disabled={building || generating}
                      data-quality-preset-select
                      aria-label="质量预设"
                    >
                      {qualitiesPool.map((q) => (
                        <option key={q.value} value={q.value}>
                          {q.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 1. 风格优化区 */}
          <div className="rounded border border-slate-200 dark:border-slate-700 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium inline-flex items-center gap-1">
                <Wand2 size={14} /> 风格说明（中文，可改）
              </div>
              <button
                onClick={() => void runBuild(editedSummary)}
                disabled={building}
                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 disabled:opacity-40"
              >
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
                <button
                  onClick={() => void runBuild()}
                  className="ml-2 underline"
                >
                  重试
                </button>
              </div>
            )}
            {build && (
              <>
                <textarea
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm"
                  disabled={building || generating}
                />
                {build.tips && build.tips.length > 0 && (
                  <ul className="mt-2 text-xs text-slate-500 list-disc list-inside space-y-0.5">
                    {build.tips.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 text-xs">
                  <button
                    onClick={() => setShowEnPrompt((v) => !v)}
                    className="text-slate-500 hover:underline inline-flex items-center gap-1"
                  >
                    {showEnPrompt ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    实际发给上游的英文 prompt
                  </button>
                  {showEnPrompt && (
                    <div className="mt-1.5 space-y-1.5 text-[11px] font-mono bg-slate-50 dark:bg-slate-800/60 rounded p-2 max-h-40 overflow-y-auto">
                      <div>
                        <div className="text-slate-500">prompt:</div>
                        <div className="whitespace-pre-wrap">{build.promptEn}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">negative:</div>
                        <div className="whitespace-pre-wrap">{build.negativeEn}</div>
                      </div>
                      <div className="text-slate-500">
                        size: {selectedSize || build.recommendedSize}
                        {selectedQuality ? ` · quality: ${selectedQuality}` : ''}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 2. 生成按钮 */}
          {build && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void runGenerate()}
                disabled={generating || building}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded px-3 py-2 text-sm inline-flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> 生成中… {genElapsed}s
                  </>
                ) : (
                  <>
                    <ImageIcon size={14} /> {images.length === 0 ? '生成图片' : '再来一张'}
                  </>
                )}
              </button>
            </div>
          )}

          {/* 3. 错误提示 */}
          {genErr && (
            <div className="text-xs bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded p-2">
              生成失败：{genErr}
            </div>
          )}

          {/* 4. 图片结果 */}
          {images.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-medium">已生成（最新在上）</div>
              {images.map((im, i) => (
                <div key={i} className="rounded border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <img src={im.url} alt={`generated ${i}`} className="w-full block" />
                  <div className="px-2 py-1 text-[11px] text-slate-500 flex items-center justify-between">
                    <span>{new Date(im.ts).toLocaleTimeString()}</span>
                    <a href={im.url} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                      原图
                    </a>
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
