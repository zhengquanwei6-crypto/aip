'use client';

import { useEffect, useState } from 'react';
import { PLATFORMS, CATEGORIES, IMAGE_TYPES } from '@/lib/constants';
import { useToast } from '@/components/m/Toast';
import { copyAll } from '@/lib/clipboard';

type Platform = 'xiaohongshu' | 'xianyu';

/**
 * v0.11 B14（BUG-L11 修）：删掉硬编码的 `<option value="3:4">` / `<option value="1:1">`
 *   ratio select。
 *   - 改用 adapter.aspectRatios 池驱动（与桌面 ImageStudioClient 同源）
 *   - 移动端拉一次 /api/health → /api/adapters/<slug> 获取 aspectRatios 池，渲染 select
 *   - 池为空时整个 Field 隐藏，server-side /api/image/prompt 仍按 platform 推 size 兜底
 */

interface ImagePreset {
  id: string;
  name: string;
  styleKeywords: string;
  negativePrompt: string | null;
  size: string;
  imageType: string;
  isDefault: boolean;
}

interface AspectRatioPreset {
  label: string;
  ratio: string;
  sizeRule?: string | null;
}

export default function MImageClient() {
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [presets, setPresets] = useState<ImagePreset[]>([]);
  const [form, setForm] = useState({
    platform: 'xiaohongshu' as Platform,
    imageType: '封面图',
    category: 'Logo',
    coverTitle: '',
    styleKeywords: '简约现代、高级感、清爽白底',
  });
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1536');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);

  // v0.11 B14：adapter aspectRatios 池
  const [aspectRatiosPool, setAspectRatiosPool] = useState<AspectRatioPreset[]>([]);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('');

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
          }
        }
      })
      .catch(() => {});
  }, []);

  // v0.11 B14：拉默认 adapter 的 aspectRatios 池（与桌面同源）
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
        const ars: AspectRatioPreset[] = (Array.isArray(a.adapter?.aspectRatios) ? a.adapter.aspectRatios : [])
          .filter((r: any) => r && typeof r.ratio === 'string');
        setAspectRatiosPool(ars);
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

  function up<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function applyPreset(p: ImagePreset) {
    setForm((f) => ({
      ...f,
      styleKeywords: p.styleKeywords,
      imageType: p.imageType,
    }));
    setSize(p.size);
    toast.show(`已套用「${p.name}」`, 'success');
  }

  async function buildPrompt() {
    setLoading1(true);
    try {
      const res = await fetch('/api/image/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      setPrompt(j.prompt || '');
      setSize(
        j.size || (form.platform === 'xiaohongshu' ? '1024x1536' : '1024x1024'),
      );
      setStep(2);
      toast.show('提示词已生成', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setLoading1(false);
    }
  }

  async function callImage() {
    if (!prompt.trim()) {
      toast.show('请先生成或填写提示词', 'error');
      return;
    }
    setLoading2(true);
    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          size,
          aspectRatio: selectedAspectRatio || undefined,
          platform: form.platform,
          category: form.category,
          imageType: form.imageType,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '图片生成失败');
      setImageUrl(j.asset?.url ?? null);
      toast.show('图片已生成并保存到素材库', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setLoading2(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* 步骤指示 */}
      <div className="flex items-center gap-2 text-xs">
        <StepBadge n={1} active={step >= 1} label="提示词" />
        <div className="flex-1 h-px bg-slate-300" />
        <StepBadge n={2} active={step >= 2} label="出图" />
      </div>

      {step === 1 && (
        <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="平台">
              <select
                className="m-input"
                value={form.platform}
                onChange={(e) => up('platform', e.target.value as Platform)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            {/* v0.11 B14（BUG-L11 修）：比例改为 adapter.aspectRatios 池驱动 */}
            {aspectRatiosPool.length > 0 && (
              <Field label="比例预设">
                <select
                  className="m-input"
                  value={selectedAspectRatio}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedAspectRatio(v);
                    const rule = aspectRatiosPool.find((r) => r.ratio === v)?.sizeRule;
                    if (rule && rule.trim()) {
                      setSize(rule.trim());
                    }
                  }}
                  data-aspect-ratio-select
                  aria-label="比例预设"
                >
                  {aspectRatiosPool.map((r) => (
                    <option key={r.ratio} value={r.ratio}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="图片类型">
              <select
                className="m-input"
                value={form.imageType}
                onChange={(e) => up('imageType', e.target.value)}
              >
                {IMAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="类目">
              <select
                className="m-input"
                value={form.category}
                onChange={(e) => up('category', e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="封面标题">
            <input
              className="m-input"
              value={form.coverTitle}
              onChange={(e) => up('coverTitle', e.target.value)}
              placeholder="例：奶茶店开业菜单升级"
            />
          </Field>
          <Field label="风格预设">
            <div className="flex flex-wrap gap-1.5">
              {presets.length === 0 && (
                <span className="text-xs text-slate-400">
                  尚未配置预设，去「我的 → 设置」管理
                </span>
              )}
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={
                    'px-2.5 py-1 rounded-full text-xs border ' +
                    (form.styleKeywords === p.styleKeywords
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-slate-600 border-slate-300')
                  }
                >
                  {p.name}
                </button>
              ))}
            </div>
          </Field>
          <Field label="风格关键词（可手动改）">
            <textarea
              className="m-input min-h-[60px]"
              value={form.styleKeywords}
              onChange={(e) => up('styleKeywords', e.target.value)}
            />
          </Field>
          <button
            onClick={buildPrompt}
            disabled={loading1}
            className="w-full rounded-lg bg-brand-600 text-white font-medium py-3 active:bg-brand-700 disabled:opacity-60"
          >
            {loading1 ? '生成中...' : '① 生成图片提示词'}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
            <Field label="提示词（可修改）">
              <textarea
                className="m-input min-h-[120px]"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <button
                onClick={async () => {
                  const ok = await copyAll(prompt);
                  toast.show(ok ? '已复制' : '复制失败', ok ? 'success' : 'error');
                }}
                className="mt-1 text-xs text-brand-600"
              >
                复制提示词
              </button>
            </Field>
            <Field label="尺寸">
              <input
                className="m-input"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setStep(1)}
                className="rounded-lg border border-slate-300 text-slate-700 font-medium py-3 active:bg-slate-50"
              >
                ← 返回参数
              </button>
              <button
                onClick={callImage}
                disabled={loading2}
                className="rounded-lg bg-brand-600 text-white font-medium py-3 active:bg-brand-700 disabled:opacity-60"
              >
                {loading2 ? '出图中...' : '② 调用 API 出图'}
              </button>
            </div>
          </div>

          {imageUrl && (
            <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-sm">生成结果</h3>
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-600"
                >
                  打开原图
                </a>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="w-full" />
              <div className="p-3 text-xs text-slate-500">
                已自动保存到素材库
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function StepBadge({
  n,
  active,
  label,
}: {
  n: number;
  active: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={
          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ' +
          (active ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500')
        }
      >
        {n}
      </div>
      <span className={active ? 'text-slate-800 font-medium' : 'text-slate-500'}>
        {label}
      </span>
    </div>
  );
}
