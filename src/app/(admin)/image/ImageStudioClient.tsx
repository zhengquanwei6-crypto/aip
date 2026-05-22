'use client';

import { useEffect, useState } from 'react';
import {
  PLATFORMS,
  CATEGORIES,
  IMAGE_TYPES,
} from '@/lib/constants';

type Platform = 'xiaohongshu' | 'xianyu';
type Ratio = '3:4' | '1:1';

interface FormState {
  platform: Platform;
  ratio: Ratio;
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

const DEFAULT: FormState = {
  platform: 'xiaohongshu',
  ratio: '3:4',
  imageType: '封面图',
  category: 'Logo',
  coverTitle: '',
  styleKeywords: '简约现代、高级感、清爽白底',
};

export default function ImageStudioClient() {
  const [form, setForm] = useState<FormState>(DEFAULT);
  const [presets, setPresets] = useState<ImagePreset[]>([]);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [size, setSize] = useState('1024x1536');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [step1Loading, setStep1Loading] = useState(false);
  const [step2Loading, setStep2Loading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'platform') {
        next.ratio = v === 'xiaohongshu' ? '3:4' : '1:1';
      }
      return next;
    });
  }

  function applyPreset(p: ImagePreset) {
    setForm((f) => ({
      ...f,
      styleKeywords: p.styleKeywords,
      imageType: p.imageType,
    }));
    setSize(p.size);
    setNegativePrompt(p.negativePrompt || '');
  }

  async function buildPrompt() {
    setStep1Loading(true);
    setError(null);
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStep1Loading(false);
    }
  }

  async function callImage() {
    if (!prompt.trim()) {
      setError('请先生成或填写提示词');
      return;
    }
    setStep2Loading(true);
    setError(null);
    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          size,
          platform: form.platform,
          category: form.category,
          imageType: form.imageType,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '图片生成失败');
      setImageUrl(j.asset?.url ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStep2Loading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
      {/* 左侧：参数 */}
      <div className="card h-fit">
        <div className="card-header">
          <h2 className="font-semibold">图片参数</h2>
        </div>
        <div className="card-body space-y-3">
          <Field label="平台">
            <select
              className="input"
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
          <Field label="比例">
            <select
              className="input"
              value={form.ratio}
              onChange={(e) => up('ratio', e.target.value as Ratio)}
            >
              <option value="3:4">3:4（小红书竖图）</option>
              <option value="1:1">1:1（闲鱼方图）</option>
            </select>
          </Field>
          <Field label="图片类型">
            <select
              className="input"
              value={form.imageType}
              onChange={(e) => up('imageType', e.target.value)}
            >
              {IMAGE_TYPES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="类目">
            <select
              className="input"
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
          <Field label="封面标题">
            <input
              className="input"
              value={form.coverTitle}
              onChange={(e) => up('coverTitle', e.target.value)}
              placeholder="例：奶茶店开业菜单升级"
            />
          </Field>
          <Field label="风格关键词">
            <input
              className="input"
              value={form.styleKeywords}
              onChange={(e) => up('styleKeywords', e.target.value)}
            />
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs text-slate-400 mr-1">预设:</span>
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={
                      'px-2 py-0.5 rounded-full text-xs border ' +
                      (form.styleKeywords === p.styleKeywords
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50')
                    }
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <button
            onClick={buildPrompt}
            disabled={step1Loading}
            className="btn-primary w-full"
          >
            {step1Loading ? '生成中...' : '① 先生成图片提示词'}
          </button>
          <p className="text-xs text-slate-400 leading-relaxed">
            提示：先生成提示词后，可以在右侧手动调整再生成图片。
          </p>
        </div>
      </div>

      {/* 右侧：提示词 + 输出 */}
      <div className="space-y-4">
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">提示词（可手动修改）</h2>
            {prompt && (
              <button
                onClick={() => navigator.clipboard?.writeText(prompt)}
                className="text-xs text-brand-600 hover:underline"
              >
                复制
              </button>
            )}
          </div>
          <div className="card-body space-y-3">
            <Field label="正向提示词">
              <textarea
                className="input min-h-[140px]"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='点击左侧"先生成图片提示词"，或在此手动填写'
              />
            </Field>
            <Field label="负向提示词">
              <textarea
                className="input min-h-[60px]"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
              />
            </Field>
            <Field label="尺寸">
              <input
                className="input"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="例：1024x1536"
              />
            </Field>
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </div>
            )}
            <button
              onClick={callImage}
              disabled={step2Loading}
              className="btn-primary"
            >
              {step2Loading ? '调用图片 API 中...' : '② 调用 GPT IMG 2 生成图片'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">生成结果</h2>
            {imageUrl && (
              <a href={imageUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
                打开原图
              </a>
            )}
          </div>
          <div className="card-body">
            {imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imageUrl}
                alt="生成结果"
                className="max-w-full rounded border border-slate-200"
              />
            ) : (
              <div className="text-sm text-slate-400 text-center py-12">
                尚未生成图片。完成上方两步后会显示在这里。生成的图片会自动保存到「素材库」。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
