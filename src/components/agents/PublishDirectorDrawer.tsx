'use client';

/**
 * <PublishDirectorDrawer> · v0.9 b2
 *
 * "全流程发布导演"抽屉（图片选项扩展版）：
 *
 * v0.9 b2 新增表单字段：
 *   - 风格预设（从 /api/image-presets 拉取列表，含「自定义」选项）
 *   - styleKeywords（自定义模式可改）
 *   - negativePrompt（可改）
 *   - 主色调 primaryColor（输入 hex 或中文，例 "#F5C842 暖黄"）
 *   - 辅色调 accentColor
 *   - 图片主语言 textLanguage（中文 / 英文）
 *   - 数量 n（1-4）
 *   - 同一风格 sameStyle（n>1 时显示）
 *   - 作为一套图 asSeries（n>1 + sameStyle 时显示）
 *
 * 第 ③ 区块改为多图网格：
 *   - n=1：单张
 *   - n>1：grid-cols-2（lg:3）+ 每张下方 scene 描述
 *   - 单张失败：显示该位置错误 + 「重生这张」按钮
 *   - 全部失败：显示整体错误
 *   - 「再来一张/全部重生」按钮根据 n 切换文字
 *
 * 不存任何 LLM key，仅前端。与 GenerateImageForPostDrawer 共存。
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Wand2,
  Image as ImageIcon,
  RotateCw,
  RefreshCw,
  Settings as SettingsIcon,
  AlertCircle,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import {
  PLATFORMS,
  CATEGORIES,
  CONTENT_TYPES,
  TARGET_AUDIENCES,
  TONES,
} from '@/lib/constants';
import ProgressBar from '@/components/ProgressBar';

type Platform = 'xiaohongshu' | 'xianyu';
type Regenerate = 'all' | 'content' | 'style' | 'image';
type TextLanguage = 'zh' | 'en';
type SizeStr = '1024x1024' | '1024x1536' | '1536x1024';

interface ImageOptions {
  autoImage: boolean;
  stylePresetId: string; // '' = 自定义
  styleKeywords: string;
  negativePrompt: string;
  primaryColor: string;
  accentColor: string;
  textLanguage: TextLanguage;
  n: number;
  sameStyle: boolean;
  asSeries: boolean;
}

interface FormState {
  platform: Platform;
  category: string;
  contentType: string;
  audience: string;
  tone: string;
  topic: string;
}

interface XHSContent {
  titles?: string[];
  body?: string;
  coverText?: string;
  imageSuggestion?: string;
  tags?: string[];
  cta?: string;
}

interface XYContent {
  title?: string;
  description?: string;
  coverText?: string;
  tiers?: { tier: string; name: string; priceRange: string }[];
  orderFlow?: string[];
  deliveryScope?: string;
  revisionRule?: string;
  preOrderNotes?: string[];
  faq?: { q: string; a: string }[];
  quickReplies?: string[];
}

type AnyContent = XHSContent | XYContent;

interface SeriesItem {
  scene?: string;
  promptEn: string;
}

interface StylePrompt {
  styleSummary: string;
  promptEn: string;
  negativeEn: string;
  recommendedSize: SizeStr;
  tips?: string[];
  seriesPrompts?: SeriesItem[];
  seriesPlan?: string;
}

interface AssetEntry {
  id?: string;
  url?: string;
  scene?: string;
  error?: string;
  trace?: any;
}

interface Preset {
  id: string;
  name: string;
  styleKeywords: string;
  negativePrompt?: string | null;
  size?: string;
  imageType?: string;
  isDefault?: boolean;
}

interface BuildResp {
  ok: boolean;
  stage?: string;
  content?: AnyContent;
  stylePrompt?: StylePrompt | null;
  stylePromptError?: string | null;
  stylePromptRaw?: string;
  assets?: AssetEntry[];
  /** 兼容字段 */
  asset?: { id?: string; url?: string } | null;
  imageErrors?: { idx: number; scene?: string; error: string }[];
  imageTrace?: any;
  imageFallbackNote?: string | null;
  contentModel?: string;
  styleModel?: string;
  durationMs?: number;
  error?: string;
  raw?: string;
}

const DEFAULT_FORM: FormState = {
  platform: 'xiaohongshu',
  category: 'Logo',
  contentType: '案例型',
  audience: '电商卖家',
  tone: '专业',
  topic: '',
};

const DEFAULT_IMG: ImageOptions = {
  autoImage: true,
  stylePresetId: '',
  styleKeywords: '',
  negativePrompt: '',
  primaryColor: '',
  accentColor: '',
  textLanguage: 'en',
  n: 1,
  sameStyle: true,
  asSeries: true,
};

export interface PublishDirectorDrawerProps {
  open: boolean;
  onClose: () => void;
  initialForm?: Partial<FormState>;
}

export function PublishDirectorDrawer({ open, onClose, initialForm }: PublishDirectorDrawerProps) {
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM, ...(initialForm || {}) });
  const [img, setImg] = useState<ImageOptions>({ ...DEFAULT_IMG });
  const [imgPanelOpen, setImgPanelOpen] = useState(true);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsLoaded, setPresetsLoaded] = useState(false);

  const [busy, setBusy] = useState(false);
  const [busyIdx, setBusyIdx] = useState<number | null>(null); // 单张重生时的索引
  const [stage, setStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState<AnyContent | null>(null);
  const [stylePrompt, setStylePrompt] = useState<StylePrompt | null>(null);
  const [stylePromptErr, setStylePromptErr] = useState<string | null>(null);
  const [editedSummary, setEditedSummary] = useState('');
  const [showEnPrompt, setShowEnPrompt] = useState(false);

  const [assets, setAssets] = useState<AssetEntry[]>([]);
  const [imageFallbackNote, setImageFallbackNote] = useState<string | null>(null);

  const [contentModel, setContentModel] = useState<string | undefined>();
  const [styleModel, setStyleModel] = useState<string | undefined>();
  const [showContentDetails, setShowContentDetails] = useState(true);

  // 拉预设列表
  useEffect(() => {
    if (!open || presetsLoaded) return;
    fetch('/api/image-presets')
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.list)) {
          setPresets(j.list);
        }
      })
      .catch(() => {
        // 静默失败，用户仍可走自定义
      })
      .finally(() => setPresetsLoaded(true));
  }, [open, presetsLoaded]);

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function upImg<K extends keyof ImageOptions>(k: K, v: ImageOptions[K]) {
    setImg((s) => ({ ...s, [k]: v }));
  }

  /** 切换风格预设：选中后自动填 styleKeywords / negativePrompt */
  function applyPreset(presetId: string) {
    upImg('stylePresetId', presetId);
    if (!presetId) return; // 自定义
    const p = presets.find((x) => x.id === presetId);
    if (!p) return;
    setImg((s) => ({
      ...s,
      stylePresetId: presetId,
      styleKeywords: p.styleKeywords || s.styleKeywords,
      negativePrompt: p.negativePrompt || s.negativePrompt,
    }));
  }

  function reset() {
    setContent(null);
    setStylePrompt(null);
    setStylePromptErr(null);
    setEditedSummary('');
    setAssets([]);
    setImageFallbackNote(null);
    setError(null);
  }

  function stageLabelFor(reg: Regenerate): string {
    if (reg === 'content') return '正在写文案…';
    if (reg === 'style') return '正在出风格 prompt…';
    if (reg === 'image') return img.n > 1 ? `正在出图（${img.n} 张串行）…` : '正在出图…';
    return img.n > 1
      ? `正在写文案 → 出 prompt → 出 ${img.n} 张图…`
      : '正在写文案 → 出 prompt → 出图…';
  }

  function buildImageOptionsPayload() {
    return {
      autoImage: img.autoImage,
      stylePresetId: img.stylePresetId || undefined,
      styleKeywords: img.styleKeywords || undefined,
      negativePrompt: img.negativePrompt || undefined,
      primaryColor: img.primaryColor || undefined,
      accentColor: img.accentColor || undefined,
      textLanguage: img.textLanguage,
      n: img.n,
      sameStyle: img.n > 1 ? img.sameStyle : false,
      asSeries: img.n > 1 && img.sameStyle ? img.asSeries : false,
    };
  }

  const run = useCallback(
    async (regenerate: Regenerate, opts?: { regenSingleIdx?: number }) => {
      if (busy) return;
      if (!form.topic.trim() && regenerate !== 'image' && regenerate !== 'style') {
        toast.error('请填写主题');
        return;
      }
      setBusy(true);
      setError(null);
      setStage(stageLabelFor(regenerate));
      if (typeof opts?.regenSingleIdx === 'number') setBusyIdx(opts.regenSingleIdx);

      try {
        // 单张重生：把 imageOptions.n=1 + asSeries=false 送，cachedStylePrompt 用对应 scene 的那条
        let payloadImg = buildImageOptionsPayload();
        let cachedStyle: any = stylePrompt;

        if (regenerate === 'image' && typeof opts?.regenSingleIdx === 'number') {
          payloadImg = { ...payloadImg, n: 1, sameStyle: false, asSeries: false };
          if (stylePrompt?.seriesPrompts && stylePrompt.seriesPrompts[opts.regenSingleIdx]) {
            const target = stylePrompt.seriesPrompts[opts.regenSingleIdx];
            cachedStyle = {
              ...stylePrompt,
              promptEn: target.promptEn,
              seriesPrompts: undefined,
              seriesPlan: undefined,
            };
          }
        }

        const r = await fetch('/api/agents/publish-director/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: form.platform,
            category: form.category,
            contentType: form.contentType,
            topic: form.topic,
            audience: form.audience,
            tone: form.tone,
            imageOptions: payloadImg,
            regenerate,
            cachedContent: regenerate === 'style' || regenerate === 'image' ? content : undefined,
            cachedStylePrompt: regenerate === 'image' ? cachedStyle : undefined,
            styleSummaryHint: regenerate === 'style' ? editedSummary : undefined,
          }),
        });
        const j: BuildResp = await r.json();
        if (!j.ok) {
          const msg = j.error || `HTTP ${r.status}`;
          setError(msg);
          toast.error(msg);
          return;
        }

        if (j.content) {
          setContent(j.content);
          setShowContentDetails(true);
        }
        if (j.contentModel) setContentModel(j.contentModel);
        if (j.styleModel) setStyleModel(j.styleModel);

        if (regenerate !== 'content') {
          if (j.stylePrompt) {
            setStylePrompt(j.stylePrompt);
            setStylePromptErr(null);
            setEditedSummary(j.stylePrompt.styleSummary);
          } else if (j.stylePromptError) {
            setStylePromptErr(j.stylePromptError);
          }
        } else {
          // 仅重生文案，清掉旧 style 强制重生
          setStylePrompt(null);
          setStylePromptErr(null);
          setEditedSummary('');
          setAssets([]);
        }

        if (regenerate === 'all' || regenerate === 'image') {
          const newAssets = Array.isArray(j.assets) ? j.assets : j.asset ? [j.asset as AssetEntry] : [];
          if (regenerate === 'image' && typeof opts?.regenSingleIdx === 'number') {
            // 单张重生：替换对应位置
            setAssets((prev) => {
              const next = [...prev];
              const replacement = newAssets[0] || {
                error: '未返回 asset',
                scene: prev[opts.regenSingleIdx!]?.scene,
              };
              next[opts.regenSingleIdx!] = replacement;
              return next;
            });
          } else {
            setAssets(newAssets);
          }
          setImageFallbackNote(j.imageFallbackNote ?? null);

          if (
            (Array.isArray(j.imageErrors) && j.imageErrors.length > 0) ||
            (Array.isArray(j.assets) && j.assets.every((a) => !a.url))
          ) {
            const errCount = (j.imageErrors ?? []).length;
            if (errCount > 0) toast.error(`图片：${errCount} 张失败`);
          }
        }

        const okMsg =
          regenerate === 'all'
            ? `全流程完成（${img.n} 张图）`
            : regenerate === 'content'
              ? '文案已重生'
              : regenerate === 'style'
                ? 'prompt 已优化'
                : typeof opts?.regenSingleIdx === 'number'
                  ? `第 ${opts.regenSingleIdx + 1} 张已重生`
                  : '已生成新图';
        toast.success(okMsg);
      } catch (e) {
        setError((e as Error).message);
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
        setBusyIdx(null);
        setStage('');
      }
    },
    [busy, form, img, content, stylePrompt, editedSummary],
  );

  if (!open) return null;

  const xhs = content as XHSContent | null;
  const xy = content as XYContent | null;
  const showSameStyle = img.n > 1;
  const showSeries = img.n > 1 && img.sameStyle;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <aside className="w-full sm:w-[680px] h-full bg-white dark:bg-slate-900 shadow-xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <div>
              <div className="font-semibold">发布导演 publish-director</div>
              <div className="text-xs text-slate-500">文案 → 风格 → 图片，每段可单独重生（v0.9 b2 图片选项）</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* 顶部表单 */}
          <div className="rounded border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="平台">
                <select
                  className="input"
                  value={form.platform}
                  onChange={(e) => up('platform', e.target.value as Platform)}
                  disabled={busy}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="类目">
                <select
                  className="input"
                  value={form.category}
                  onChange={(e) => up('category', e.target.value)}
                  disabled={busy}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="内容类型">
                <select
                  className="input"
                  value={form.contentType}
                  onChange={(e) => up('contentType', e.target.value)}
                  disabled={busy}
                >
                  {CONTENT_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="目标客户">
                <select
                  className="input"
                  value={form.audience}
                  onChange={(e) => up('audience', e.target.value)}
                  disabled={busy}
                >
                  {TARGET_AUDIENCES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="文案风格">
                <select
                  className="input"
                  value={form.tone}
                  onChange={(e) => up('tone', e.target.value)}
                  disabled={busy}
                >
                  {TONES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="自动出图">
                <label className="inline-flex items-center gap-2 text-sm select-none mt-1">
                  <input
                    type="checkbox"
                    checked={img.autoImage}
                    onChange={(e) => upImg('autoImage', e.target.checked)}
                    disabled={busy}
                  />
                  自动跑第 3 步
                </label>
              </Field>
            </div>
            <Field label="主题">
              <input
                className="input"
                value={form.topic}
                onChange={(e) => up('topic', e.target.value)}
                placeholder="例：奶茶店开业菜单升级"
                disabled={busy}
              />
            </Field>

            {/* ─── v0.9 b2 图片选项分组 ─── */}
            <div className="rounded border border-amber-200 dark:border-amber-700/40 bg-amber-50/50 dark:bg-amber-900/10">
              <button
                type="button"
                onClick={() => setImgPanelOpen((v) => !v)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-sm font-medium text-amber-800 dark:text-amber-200"
              >
                <span className="inline-flex items-center gap-1">
                  <SettingsIcon size={14} /> 图片选项
                </span>
                {imgPanelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {imgPanelOpen && (
                <div className="px-2.5 pb-2.5 space-y-2 border-t border-amber-200 dark:border-amber-700/40">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="风格预设">
                      <select
                        className="input"
                        value={img.stylePresetId}
                        onChange={(e) => applyPreset(e.target.value)}
                        disabled={busy}
                      >
                        <option value="">自定义</option>
                        {presets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.isDefault ? '★ ' : ''}{p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="图片主语言">
                      <div className="flex items-center gap-3 mt-1.5">
                        <label className="inline-flex items-center gap-1 text-sm">
                          <input
                            type="radio"
                            name="textLang"
                            checked={img.textLanguage === 'zh'}
                            onChange={() => upImg('textLanguage', 'zh')}
                            disabled={busy}
                          />
                          中文
                        </label>
                        <label className="inline-flex items-center gap-1 text-sm">
                          <input
                            type="radio"
                            name="textLang"
                            checked={img.textLanguage === 'en'}
                            onChange={() => upImg('textLanguage', 'en')}
                            disabled={busy}
                          />
                          英文（推荐）
                        </label>
                      </div>
                    </Field>
                  </div>

                  <Field label="风格关键词（自定义可改）">
                    <input
                      className="input"
                      value={img.styleKeywords}
                      onChange={(e) => upImg('styleKeywords', e.target.value)}
                      placeholder="例：minimal flat, soft gradient, editorial layout"
                      disabled={busy || !!img.stylePresetId}
                    />
                  </Field>
                  <Field label="负向词（可选）">
                    <input
                      className="input"
                      value={img.negativePrompt}
                      onChange={(e) => upImg('negativePrompt', e.target.value)}
                      placeholder="例：cluttered, watermark"
                      disabled={busy}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="主色调">
                      <input
                        className="input"
                        value={img.primaryColor}
                        onChange={(e) => upImg('primaryColor', e.target.value)}
                        placeholder="例：#F5C842 暖黄"
                        disabled={busy}
                      />
                    </Field>
                    <Field label="辅色调">
                      <input
                        className="input"
                        value={img.accentColor}
                        onChange={(e) => upImg('accentColor', e.target.value)}
                        placeholder="例：#2B3A55 深蓝灰"
                        disabled={busy}
                      />
                    </Field>
                  </div>

                  <div>
                    <label className="label">生成数量</label>
                    <div className="flex items-center gap-2 mt-1">
                      {[1, 2, 3, 4].map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => upImg('n', k)}
                          disabled={busy}
                          className={[
                            'px-3 py-1 rounded text-sm border transition',
                            img.n === k
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800',
                          ].join(' ')}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>

                  {showSameStyle && (
                    <div className="space-y-1 pl-1 border-l-2 border-amber-300 dark:border-amber-600">
                      <label className="inline-flex items-center gap-2 text-sm select-none">
                        <input
                          type="checkbox"
                          checked={img.sameStyle}
                          onChange={(e) => upImg('sameStyle', e.target.checked)}
                          disabled={busy}
                        />
                        同一风格（推荐）
                      </label>
                      {showSeries && (
                        <div>
                          <label className="inline-flex items-center gap-2 text-sm select-none">
                            <input
                              type="checkbox"
                              checked={img.asSeries}
                              onChange={(e) => upImg('asSeries', e.target.checked)}
                              disabled={busy}
                            />
                            作为一套图（系列）
                          </label>
                          {img.asSeries && (
                            <div className="text-[11px] text-slate-500 ml-6 mt-0.5 leading-relaxed">
                              系列模式：让 LLM 先规划"{img.n} 张共主题不同切片"，再产出独立 promptEn。
                              共享 palette / 字体 / 光线，subject 与构图不同。
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void run('all')}
                disabled={busy}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded px-3 py-2 text-sm inline-flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                {busy
                  ? stage || '生成中…'
                  : content
                    ? `🎯 全部重生（${img.n} 张）`
                    : `🎯 全部生成（${img.n} 张）`}
              </button>
              {content && (
                <button
                  type="button"
                  onClick={() => {
                    if (busy) return;
                    reset();
                  }}
                  disabled={busy}
                  className="text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded px-3 py-2 inline-flex items-center gap-1"
                  title="清空当前结果"
                >
                  <RefreshCw size={14} /> 重置
                </button>
              )}
            </div>
            {busy && <ProgressBar mode="indeterminate" label={stage || '处理中…'} />}
            {error && (
              <div className="text-xs bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded p-2">
                {error}
              </div>
            )}
          </div>

          {/* ① 文案预览 */}
          {content && (
            <div className="rounded border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setShowContentDetails((v) => !v)}
                  className="text-sm font-medium inline-flex items-center gap-1"
                >
                  {showContentDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  ① 文案
                  {contentModel && <span className="text-[11px] text-slate-500 ml-1">({contentModel})</span>}
                </button>
                <button
                  onClick={() => void run('content')}
                  disabled={busy}
                  className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <RotateCw size={12} /> 重新生文案
                </button>
              </div>
              {showContentDetails && (
                <div className="px-3 py-2.5 space-y-2 text-sm">
                  {form.platform === 'xiaohongshu' ? (
                    <>
                      {Array.isArray(xhs?.titles) && xhs!.titles!.length > 0 && (
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">标题候选</div>
                          <ol className="list-decimal pl-5 space-y-0.5">
                            {xhs!.titles!.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                      {xhs?.coverText && (
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">封面大字</div>
                          <div>{xhs.coverText}</div>
                        </div>
                      )}
                      {xhs?.body && (
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">正文</div>
                          <div className="whitespace-pre-wrap leading-relaxed text-[13px]">
                            {xhs.body}
                          </div>
                        </div>
                      )}
                      {Array.isArray(xhs?.tags) && xhs!.tags!.length > 0 && (
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">tags</div>
                          <div className="flex flex-wrap gap-1.5">
                            {xhs!.tags!.map((t, i) => (
                              <span
                                key={i}
                                className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {xhs?.cta && (
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">CTA</div>
                          <div>{xhs.cta}</div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {xy?.title && (
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">商品标题</div>
                          <div className="font-medium">{xy.title}</div>
                        </div>
                      )}
                      {xy?.coverText && (
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">首图大字</div>
                          <div>{xy.coverText}</div>
                        </div>
                      )}
                      {Array.isArray(xy?.tiers) && xy!.tiers!.length > 0 && (
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">三档</div>
                          <ul className="space-y-0.5">
                            {xy!.tiers!.map((t, i) => (
                              <li key={i} className="text-[13px]">
                                <span className="text-slate-500">{t.tier}</span> {t.name}{' '}
                                <span className="text-slate-500">{t.priceRange}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {xy?.description && (
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">描述</div>
                          <div className="whitespace-pre-wrap leading-relaxed text-[13px]">
                            {xy.description}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ② 风格说明 */}
          {(stylePrompt || stylePromptErr) && (
            <div className="rounded border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium inline-flex items-center gap-1">
                  <Wand2 size={14} /> ② 风格说明（中文，可改）
                  {styleModel && <span className="text-[11px] text-slate-500 ml-1">({styleModel})</span>}
                </div>
                <button
                  onClick={() => void run('style')}
                  disabled={busy}
                  className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <RotateCw size={12} /> 重新优化 prompt
                </button>
              </div>
              {stylePromptErr && (
                <div className="text-xs bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded p-2 mb-2">
                  ② 失败：{stylePromptErr}
                  <span className="ml-1">— 你可以手改风格描述后再试。</span>
                </div>
              )}
              {stylePrompt && (
                <>
                  <textarea
                    value={editedSummary}
                    onChange={(e) => setEditedSummary(e.target.value)}
                    rows={3}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm"
                    disabled={busy}
                  />
                  {stylePrompt.seriesPlan && (
                    <div className="mt-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded p-2">
                      <div className="font-medium text-amber-800 dark:text-amber-200 mb-0.5">
                        系列编排
                      </div>
                      <div className="text-amber-700 dark:text-amber-300 leading-relaxed">
                        {stylePrompt.seriesPlan}
                      </div>
                    </div>
                  )}
                  {stylePrompt.tips && stylePrompt.tips.length > 0 && (
                    <ul className="mt-2 text-xs text-slate-500 list-disc list-inside space-y-0.5">
                      {stylePrompt.tips.map((t, i) => (
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
                      <div className="mt-1.5 space-y-1.5 text-[11px] font-mono bg-slate-50 dark:bg-slate-800/60 rounded p-2 max-h-60 overflow-y-auto">
                        {stylePrompt.seriesPrompts && stylePrompt.seriesPrompts.length > 0 ? (
                          <>
                            {stylePrompt.seriesPrompts.map((sp, i) => (
                              <div key={i} className="border-b border-slate-200 dark:border-slate-700 pb-1.5 last:border-b-0">
                                <div className="text-slate-500">#{i + 1} {sp.scene || '(无 scene)'}</div>
                                <div className="whitespace-pre-wrap">{sp.promptEn}</div>
                              </div>
                            ))}
                            <div className="text-slate-500">negative: {stylePrompt.negativeEn}</div>
                            <div className="text-slate-500">size: {stylePrompt.recommendedSize}</div>
                          </>
                        ) : (
                          <>
                            <div>
                              <div className="text-slate-500">prompt:</div>
                              <div className="whitespace-pre-wrap">{stylePrompt.promptEn}</div>
                            </div>
                            <div>
                              <div className="text-slate-500">negative:</div>
                              <div className="whitespace-pre-wrap">{stylePrompt.negativeEn}</div>
                            </div>
                            <div className="text-slate-500">size: {stylePrompt.recommendedSize}</div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ③ 图片网格 */}
          {(assets.length > 0 || imageFallbackNote) && (
            <div className="rounded border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium inline-flex items-center gap-1">
                  <ImageIcon size={14} /> ③ 图片
                  {assets.length > 0 && (
                    <span className="text-[11px] text-slate-500 ml-1">
                      ({assets.filter((a) => a.url).length}/{assets.length})
                    </span>
                  )}
                </div>
                {stylePrompt && (
                  <button
                    onClick={() => void run('image')}
                    disabled={busy}
                    className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 disabled:opacity-40"
                  >
                    <RotateCw size={12} />
                    {img.n > 1 ? `全部重生这 ${img.n} 张` : '再来一张'}
                  </button>
                )}
              </div>

              {imageFallbackNote && (
                <div className="text-[11px] bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 rounded p-2 mb-2 inline-flex items-start gap-1.5">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{imageFallbackNote}</span>
                </div>
              )}

              {assets.length > 0 && (
                <div
                  className={[
                    'grid gap-3',
                    assets.length === 1 ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-3',
                  ].join(' ')}
                >
                  {assets.map((a, i) => (
                    <div
                      key={i}
                      className="rounded border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col"
                    >
                      {a.url ? (
                        <img src={a.url} alt={a.scene || `image ${i + 1}`} className="w-full block" />
                      ) : (
                        <div className="aspect-[3/4] bg-red-50 dark:bg-red-950/30 flex items-center justify-center p-2 text-center">
                          <div className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed">
                            <AlertCircle size={16} className="mx-auto mb-1" />
                            <div>第 {i + 1} 张失败</div>
                            <div className="break-all">{a.error || '未知错误'}</div>
                          </div>
                        </div>
                      )}
                      <div className="px-2 py-1.5 text-[11px] text-slate-500 border-t border-slate-200 dark:border-slate-700">
                        {a.scene && <div className="font-medium text-slate-700 dark:text-slate-300 mb-0.5 truncate">{a.scene}</div>}
                        <div className="flex items-center justify-between gap-1">
                          <span>#{i + 1}</span>
                          <div className="flex items-center gap-1.5">
                            {a.url && (
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noopener"
                                className="text-blue-600 hover:underline"
                              >
                                原图
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => void run('image', { regenSingleIdx: i })}
                              disabled={busy}
                              className="text-blue-600 hover:underline inline-flex items-center gap-0.5 disabled:opacity-40"
                              title={`重生第 ${i + 1} 张`}
                            >
                              {busy && busyIdx === i ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <RotateCw size={11} />
                              )}
                              重生
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
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

export default PublishDirectorDrawer;
