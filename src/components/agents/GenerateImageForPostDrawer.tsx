'use client';

/**
 * <GenerateImageForPostDrawer> · v0.13 BUG-M30
 *
 * 入口：/content 页生成完笔记后点「为这篇生图」。
 *
 * 重构（v0.13 BUG-M30）：
 *   - 删除：493 行各自实现的 size / quality / aspectRatio / i2i 表单
 *   - 改用：<ImageGenerateForm controlled> 收所有图片选项
 *   - 流程不变：先调 photo-director/build 拿 prompt，再调 /api/image/generate
 */

import { useEffect, useRef, useState } from 'react';
import { X, Wand2, Loader2, RotateCw, Image as ImageIcon, ChevronDown, ChevronUp, Settings as SettingsIcon } from 'lucide-react';
import ImageGenerateForm, { type AdapterOption, type ImageFormState } from '@/components/image-form/ImageGenerateForm';

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

interface GeneratedImage { url: string; ts: number; }

interface AdapterSummary {
  slug: string;
  name?: string;
  enabled?: boolean;
  supportsImg2Img?: boolean;
}

export function GenerateImageForPostDrawer({
  open, onClose, platform, category, imageType, notes,
}: GenerateImageForPostDrawerProps) {
  // —— build prompt 阶段 ——
  const [building, setBuilding] = useState(false);
  const [buildErr, setBuildErr] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildResult | null>(null);
  const [editedSummary, setEditedSummary] = useState('');
  const [showEnPrompt, setShowEnPrompt] = useState(false);

  // —— 出图阶段 ——
  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [genElapsed, setGenElapsed] = useState(0);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // adapter pool 用于给 ImageGenerateForm 喂数据
  const [adapters, setAdapters] = useState<AdapterSummary[]>([]);
  const [defaultAdapter, setDefaultAdapter] = useState<string>('');

  // controlled 模式下的图片选项（由 ImageGenerateForm 实时上报）
  const [formState, setFormState] = useState<ImageFormState | null>(null);

  // 抽屉打开时拉数据
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        const h = await fetch('/api/health').then((r) => r.json());
        const slug = h?.imageDefaultAdapter || '';
        if (mounted) setDefaultAdapter(slug);
        const list = await fetch('/api/adapters').then((r) => r.json());
        if (!mounted) return;
        const items: AdapterSummary[] = (list?.adapters || []).map((a: any) => ({
          slug: a.slug, name: a.name, enabled: a.enabled !== false,
          supportsImg2Img: a.supportsImg2Img === true,
        }));
        setAdapters(items);
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [open]);

  // 抽屉打开时自动调 photo-director/build 拿英文 prompt
  useEffect(() => {
    if (!open) return;
    setBuild(null); setBuildErr(null); setEditedSummary('');
    let cancelled = false;
    (async () => {
      setBuilding(true);
      try {
        const r = await fetch('/api/agents/photo-director/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, category, imageType, notes }),
        });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok || !j.ok) { setBuildErr(j?.error || `HTTP ${r.status}`); return; }
        const result: BuildResult = {
          styleSummary: j.styleSummary || '',
          promptEn: j.promptEn || '',
          negativeEn: j.negativeEn || '',
          recommendedSize: j.recommendedSize || '1024x1024',
          tips: Array.isArray(j.tips) ? j.tips : [],
        };
        setBuild(result);
        setEditedSummary(result.styleSummary);
      } catch (e: any) {
        if (!cancelled) setBuildErr(e?.message || '网络错误');
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, platform, category, imageType, JSON.stringify(notes)]);

  // —— 生图：用当前 formState + build.promptEn 调 /api/image/generate ——
  const handleGenerate = async () => {
    if (!build || !formState) return;
    if (!formState.prompt.trim()) { setGenErr('请填写中文风格描述'); return; }
    setGenErr(null); setGenerating(true); setGenElapsed(0);

    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    const t0 = Date.now();
    elapsedTimer.current = setInterval(() => setGenElapsed(Math.floor((Date.now() - t0) / 1000)), 500);

    try {
      const body: Record<string, unknown> = {
        prompt: build.promptEn + (formState.prompt.trim() ? '. Style hint: ' + formState.prompt.trim() : ''),
        adapterSlug: formState.adapterSlug,
        aspectRatio: formState.aspectRatio,
        tier: formState.tier,
        quality: formState.quality,
        n: formState.n,
        mode: formState.mode,
        platform,
        category,
        imageType: imageType || '封面图',
      };
      if (formState.mode === 'i2i') {
        if (formState.sourceImageUrl) body.sourceImageUrl = formState.sourceImageUrl;
        else if (formState.sourceImageBase64) body.sourceImageBase64 = formState.sourceImageBase64;
      }
      const r = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setGenErr(j?.error || `HTTP ${r.status}`); return; }
      const list: any[] = Array.isArray(j.assets) ? j.assets : (j.asset ? [j.asset] : []);
      const ts = Date.now();
      setImages((prev) => [...list.map((a) => ({ url: a.url, ts })), ...prev]);
    } catch (e: any) {
      setGenErr(e?.message || '网络错误');
    } finally {
      setGenerating(false);
      if (elapsedTimer.current) { clearInterval(elapsedTimer.current); elapsedTimer.current = null; }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* mask */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* drawer */}
      <div className="w-full sm:w-[600px] h-full bg-white dark:bg-slate-950 shadow-2xl flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ImageIcon size={18} className="text-purple-600 dark:text-purple-400" />
            <h2 className="font-semibold text-slate-900 dark:text-slate-50">为这篇笔记生图</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* photo-director build */}
          {building && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Loader2 size={14} className="animate-spin" /> AI 正在分析笔记并生成英文 prompt…
            </div>
          )}
          {buildErr && (
            <div className="rounded border border-red-200 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
              {buildErr}
            </div>
          )}

          {build && (
            <>
              {/* 风格摘要可编辑 */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-3">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">中文风格描述（可编辑）</div>
                <textarea
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  rows={2}
                  className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-50 resize-none"
                />
                <button
                  onClick={() => setShowEnPrompt(!showEnPrompt)}
                  className="mt-2 text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                >
                  {showEnPrompt ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {showEnPrompt ? '收起' : '查看'} 英文 prompt
                </button>
                {showEnPrompt && (
                  <pre className="mt-2 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{build.promptEn}</pre>
                )}
              </div>

              {/* 统一图片选项 */}
              <ImageGenerateForm
                adapters={adapters as AdapterOption[]}
                defaultAdapter={defaultAdapter}
                controlled
                onChange={setFormState}
                hidePromptInput={false}
                initial={{
                  prompt: editedSummary,
                  aspectRatio: build.recommendedSize === '1024x1536' ? '2:3' : build.recommendedSize === '1536x1024' ? '3:2' : '1:1',
                  tier: '2k',
                  quality: 'medium',
                  n: 1,
                }}
                compact
              />

              {/* 生图按钮 */}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !formState?.prompt.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 dark:disabled:bg-slate-700 text-white text-sm font-medium transition-colors"
              >
                {generating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {generating ? `生成中…（${genElapsed}s）` : '生成图片'}
              </button>

              {genErr && (
                <div className="rounded border border-red-200 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">{genErr}</div>
              )}

              {/* 已生成 */}
              {images.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-200 mb-2">已生成（{images.length}）</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {images.map((img, i) => (
                      <a key={img.url + i} href={img.url} target="_blank" rel="noreferrer" className="block">
                        <img src={img.url} alt="" className="w-full rounded border border-slate-200 dark:border-slate-700" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
