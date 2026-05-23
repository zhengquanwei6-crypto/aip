'use client';

/**
 * <PublishDirectorDrawer> · v0.9 b1
 *
 * "全流程发布导演"抽屉：一次表单 → 文案 + 风格 + 图片三段式产出。
 *
 * 入口：
 *   1) /content 页 ContentGeneratorClient 顶部 sticky 按钮
 *   2) /today 页（如果合适位置可挂）
 *
 * 流程：
 *   提交表单 → POST /api/agents/publish-director/build (regenerate:'all')
 *   显示 3 个区块：
 *     ① 文案预览（折叠展开 title/coverText/body/tags）
 *        「重新生文案」 → regenerate:'content'
 *     ② 风格说明（中文 styleSummary 可改 + 折叠英文 prompt）
 *        「重新优化 prompt」 → regenerate:'style'
 *     ③ 图片网格
 *        「再来一张」 → regenerate:'image'
 *        「全部重生」 → regenerate:'all'
 *
 * 进度：调用期间 ProgressBar.indeterminate + 当前步骤文字
 * 错误：toast.error + inline 详细
 *
 * 设计取舍：
 *   - 抽屉宽度 sm:w-[640px]（比 GenerateImageForPostDrawer 的 520px 更宽）
 *   - 不存任何 LLM key，仅前端
 *   - 与 GenerateImageForPostDrawer 共存，photo-director 路由仍可用
 */

import { useState } from 'react';
import {
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Wand2,
  Image as ImageIcon,
  RotateCw,
  RefreshCw,
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

interface FormState {
  platform: Platform;
  category: string;
  contentType: string;
  audience: string;
  tone: string;
  topic: string;
  autoImage: boolean;
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

interface StylePrompt {
  styleSummary: string;
  promptEn: string;
  negativeEn: string;
  recommendedSize: '1024x1024' | '1024x1536' | '1536x1024';
  tips?: string[];
}

interface AssetInfo {
  url?: string;
  id?: string;
}

interface BuildResp {
  ok: boolean;
  stage?: string;
  content?: AnyContent;
  stylePrompt?: StylePrompt | null;
  stylePromptError?: string | null;
  stylePromptRaw?: string;
  asset?: AssetInfo | null;
  imageError?: string | null;
  imageTrace?: any;
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
  autoImage: true,
};

export interface PublishDirectorDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 默认表单值（可选，用于在 today 页面预填） */
  initialForm?: Partial<FormState>;
}

export function PublishDirectorDrawer({ open, onClose, initialForm }: PublishDirectorDrawerProps) {
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM, ...(initialForm || {}) });
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>(''); // '正在写文案…' / '正在出风格 prompt…' / '正在出图…'
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<AnyContent | null>(null);
  const [stylePrompt, setStylePrompt] = useState<StylePrompt | null>(null);
  const [stylePromptErr, setStylePromptErr] = useState<string | null>(null);
  const [editedSummary, setEditedSummary] = useState('');
  const [showEnPrompt, setShowEnPrompt] = useState(false);
  const [images, setImages] = useState<{ url: string; ts: number }[]>([]);
  const [imageErr, setImageErr] = useState<string | null>(null);
  const [imageTrace, setImageTrace] = useState<any>(null);
  const [contentModel, setContentModel] = useState<string | undefined>();
  const [styleModel, setStyleModel] = useState<string | undefined>();
  const [showContentDetails, setShowContentDetails] = useState(true);

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function reset() {
    setContent(null);
    setStylePrompt(null);
    setStylePromptErr(null);
    setEditedSummary('');
    setImages([]);
    setImageErr(null);
    setImageTrace(null);
    setError(null);
  }

  function stageLabelFor(reg: Regenerate): string {
    if (reg === 'content') return '正在写文案…';
    if (reg === 'style') return '正在出风格 prompt…';
    if (reg === 'image') return '正在出图…';
    return '正在写文案 → 出 prompt → 出图…';
  }

  async function run(regenerate: Regenerate) {
    if (busy) return;
    if (!form.topic.trim() && regenerate !== 'image' && regenerate !== 'style') {
      toast.error('请填写主题');
      return;
    }
    setBusy(true);
    setError(null);
    setStage(stageLabelFor(regenerate));
    try {
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
          autoImage: form.autoImage,
          regenerate,
          cachedContent: regenerate === 'style' || regenerate === 'image' ? content : undefined,
          cachedStylePrompt: regenerate === 'image' ? stylePrompt : undefined,
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
      // 应用结果
      if (j.content) {
        setContent(j.content);
        if ((j.content as XHSContent).body || (j.content as XYContent).description) {
          // 自动展开
          setShowContentDetails(true);
        }
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
        setImages([]);
      }

      if (regenerate === 'all' || regenerate === 'image') {
        if (j.asset?.url) {
          setImages((prev) => [{ url: j.asset!.url!, ts: Date.now() }, ...prev]);
          setImageErr(null);
          setImageTrace(null);
        } else if (j.imageError) {
          setImageErr(j.imageError);
          setImageTrace(j.imageTrace ?? null);
          toast.error(`图片生成失败：${j.imageError}`);
        }
      }

      const stage = j.stage || regenerate;
      const okMsg =
        regenerate === 'all'
          ? '全流程完成'
          : regenerate === 'content'
            ? '文案已重生'
            : regenerate === 'style'
              ? 'prompt 已优化'
              : '已生成新图';
      toast.success(okMsg);
      void stage; // 占位避免未用警告
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setStage('');
    }
  }

  if (!open) return null;

  const xhs = content as XHSContent | null;
  const xy = content as XYContent | null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <aside className="w-full sm:w-[640px] h-full bg-white dark:bg-slate-900 shadow-xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <div>
              <div className="font-semibold">发布导演 publish-director</div>
              <div className="text-xs text-slate-500">文案 → 风格 → 图片，每段可单独重生</div>
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
                    checked={form.autoImage}
                    onChange={(e) => up('autoImage', e.target.checked)}
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void run('all')}
                disabled={busy}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded px-3 py-2 text-sm inline-flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                {busy ? stage || '生成中…' : content ? '🎯 全部重生' : '🎯 全部生成'}
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
                      <div className="mt-1.5 space-y-1.5 text-[11px] font-mono bg-slate-50 dark:bg-slate-800/60 rounded p-2 max-h-40 overflow-y-auto">
                        <div>
                          <div className="text-slate-500">prompt:</div>
                          <div className="whitespace-pre-wrap">{stylePrompt.promptEn}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">negative:</div>
                          <div className="whitespace-pre-wrap">{stylePrompt.negativeEn}</div>
                        </div>
                        <div className="text-slate-500">size: {stylePrompt.recommendedSize}</div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ③ 图片 */}
          {(images.length > 0 || imageErr) && (
            <div className="rounded border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium inline-flex items-center gap-1">
                  <ImageIcon size={14} /> ③ 图片（最新在上）
                </div>
                {stylePrompt && (
                  <button
                    onClick={() => void run('image')}
                    disabled={busy}
                    className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 disabled:opacity-40"
                  >
                    <RotateCw size={12} /> 再来一张
                  </button>
                )}
              </div>
              {imageErr && (
                <div className="text-xs bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded p-2 mb-2">
                  ③ 失败：{imageErr}
                  {imageTrace?.lastResponseSnippet && (
                    <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                      {imageTrace.lastResponseSnippet}
                    </pre>
                  )}
                </div>
              )}
              {images.length > 0 && (
                <div className="space-y-3">
                  {images.map((im, i) => (
                    <div
                      key={i}
                      className="rounded border border-slate-200 dark:border-slate-700 overflow-hidden"
                    >
                      <img src={im.url} alt={`generated ${i}`} className="w-full block" />
                      <div className="px-2 py-1 text-[11px] text-slate-500 flex items-center justify-between">
                        <span>{new Date(im.ts).toLocaleTimeString()}</span>
                        <a
                          href={im.url}
                          target="_blank"
                          rel="noopener"
                          className="text-blue-600 hover:underline"
                        >
                          原图
                        </a>
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
