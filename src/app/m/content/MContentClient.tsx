'use client';

import { useState } from 'react';
import {
  PLATFORMS,
  CATEGORIES,
  CONTENT_TYPES,
  TARGET_AUDIENCES,
  TONES,
} from '@/lib/constants';
import { useToast } from '@/components/m/Toast';
import { copyAll, buildXhsBundle, buildXianyuBundle } from '@/lib/clipboard';
import PhonePreview from '@/components/PhonePreview';
import TitleRefiner from '@/components/TitleRefiner';
import { Sparkles, Copy, ClipboardCheck, ArrowRight, RefreshCw, Layers, Users, Palette, BookOpen, Smartphone } from 'lucide-react';

type Platform = 'xiaohongshu' | 'xianyu';

interface FormState {
  platform: Platform;
  category: string;
  contentType: string;
  audience: string;
  tone: string;
  topic: string;
}

const DEFAULT: FormState = {
  platform: 'xiaohongshu',
  category: 'Logo',
  contentType: '案例型',
  audience: '电商卖家',
  tone: '专业',
  topic: '',
};

export default function MContentClient() {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(DEFAULT);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ platform: Platform; output: any } | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      setResult({ platform: form.platform, output: j.content });
      toast.show('文案已生成', 'success');
      setActiveTab('preview');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, label = '已复制') {
    const ok = await copyAll(text);
    toast.show(ok ? label : '复制失败', ok ? 'success' : 'error');
  }

  async function copyAllBundle() {
    if (!result) return;
    const text =
      result.platform === 'xiaohongshu'
        ? buildXhsBundle({
            title: result.output.titles?.[0] ?? form.topic ?? '',
            body: result.output.body ?? '',
            tags: result.output.tags,
            coverText: result.output.coverText,
            cta: result.output.cta,
          })
        : buildXianyuBundle({
            title: result.output.title ?? '',
            description: result.output.description ?? '',
            coverText: result.output.coverText,
            preOrderNotes: result.output.preOrderNotes,
          });
    await copy(text, '已复制完整发布包');
  }

  return (
    <div className="space-y-4 max-w-md mx-auto pb-10">
      {/* 顶部标签切换 - 如果有结果，展示预览和编辑 Tab */}
      {result && (
        <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('edit')}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all duration-200 ${
              activeTab === 'edit'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            ✏️ 修改配置
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all duration-200 ${
              activeTab === 'preview'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            👀 查看效果
          </button>
        </div>
      )}

      {/* 编辑表单面板 */}
      <div className={`${activeTab === 'edit' ? 'block' : 'hidden'} space-y-4`}>
        {/* 输入卡片 */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 p-4 shadow-sm space-y-4">
          
          {/* 平台选择 - 大按钮设计 */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">选择发布平台</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => up('platform', 'xiaohongshu')}
                className={`py-3 px-4 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
                  form.platform === 'xiaohongshu'
                    ? 'border-red-500 bg-red-50/50 text-red-600 dark:bg-red-950/20 dark:text-red-400'
                    : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="text-base">📕</span> 小红书
              </button>
              <button
                type="button"
                onClick={() => up('platform', 'xianyu')}
                className={`py-3 px-4 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
                  form.platform === 'xianyu'
                    ? 'border-yellow-500 bg-yellow-50/50 text-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-400'
                    : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="text-base">💛</span> 闲鱼
              </button>
            </div>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800/80"></div>

          {/* 类目 & 内容类型 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="制作类目" icon={<Layers className="w-3 h-3 text-slate-400" />}>
              <select
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/60 rounded-xl px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-brand-500 transition-all outline-none"
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
            <Field label="策划类型" icon={<BookOpen className="w-3 h-3 text-slate-400" />}>
              <select
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/60 rounded-xl px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-brand-500 transition-all outline-none"
                value={form.contentType}
                onChange={(e) => up('contentType', e.target.value)}
              >
                {CONTENT_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* 目标客户 */}
          <Field label="目标受众人群" icon={<Users className="w-3 h-3 text-slate-400" />}>
            <select
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/60 rounded-xl px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-brand-500 transition-all outline-none"
              value={form.audience}
              onChange={(e) => up('audience', e.target.value)}
            >
              {TARGET_AUDIENCES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          {/* 风格语气 */}
          <Field label="文案风格调性" icon={<Palette className="w-3 h-3 text-slate-400" />}>
            <div className="flex gap-2 flex-wrap mt-1">
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => up('tone', t)}
                  className={
                    'px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ' +
                    (form.tone === t
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/20'
                      : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-200/50 dark:border-slate-800/60 hover:bg-slate-100')
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          {/* 写作主题 */}
          <Field label="写作主题主题描述（推荐）">
            <input
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/60 rounded-xl px-3 py-3 text-xs font-medium placeholder-slate-400 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
              value={form.topic}
              onChange={(e) => up('topic', e.target.value)}
              placeholder="例：奶茶店新开业，推出高颜值手绘菜单升级活动..."
            />
          </Field>

          {/* 生成提交按钮 */}
          <button
            onClick={submit}
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white font-semibold py-3.5 flex items-center justify-center gap-2 hover:opacity-95 shadow-md shadow-brand-500/10 active:scale-[0.99] disabled:opacity-60 transition-all duration-200"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-1 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                AI 正在构思文案...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>生成 AIGC 文案</span>
              </>
            )}
          </button>
        </div>

        {/* 正在生成中的呼吸态骨架屏 */}
        {loading && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 p-5 shadow-sm space-y-4 animate-pulse">
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4"></div>
            <div className="space-y-2">
              <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded"></div>
              <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-5/6"></div>
              <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-2/3"></div>
            </div>
            <div className="h-28 bg-slate-100 dark:bg-slate-800/50 rounded-xl"></div>
          </div>
        )}
      </div>

      {/* 结果和预览面板 */}
      {result && (
        <div className={`${activeTab === 'preview' ? 'block' : 'hidden'} space-y-4`}>
          {/* 一键复制浮窗 */}
          <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/10 border border-emerald-150 dark:border-emerald-900/40 p-4 flex items-center justify-between gap-3 shadow-sm">
            <div>
              <div className="text-xs font-bold text-emerald-800 dark:text-emerald-400">✨ 写作生成已完成</div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-500 mt-0.5">可以直接复制下方的一键发布包</div>
            </div>
            <button
              onClick={copyAllBundle}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 flex items-center gap-1.5 shadow-sm transition-all duration-200 active:scale-95"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              一键复制发布包
            </button>
          </div>

          {/* 手机预览容器 */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-bold mb-3 justify-center">
              <Smartphone className="w-3.5 h-3.5" />
              模拟移动端渲染效果
            </div>
            {result.platform === 'xiaohongshu' ? (
              <PhonePreview
                platform="xiaohongshu"
                title={result.output.titles?.[0] ?? form.topic}
                body={result.output.body}
                coverText={result.output.coverText}
                tags={result.output.tags}
              />
            ) : (
              <PhonePreview
                platform="xianyu"
                title={result.output.title ?? form.topic}
                description={result.output.description}
                coverText={result.output.coverText}
                priceRange={
                  result.output.tiers?.[1]?.priceRange ??
                  result.output.tiers?.[0]?.priceRange
                }
              />
            )}
          </div>

          <div id="m-content-result" className="h-px"></div>

          {result.platform === 'xiaohongshu' ? (
            <XHSResult output={result.output} onCopy={copy} />
          ) : (
            <XYResult output={result.output} onCopy={copy} />
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400">
        {icon}
        <span>{label}</span>
      </label>
      {children}
    </div>
  );
}

function Block({
  title,
  copyText,
  onCopy,
  children,
}: {
  title: string;
  copyText?: string;
  onCopy?: (s: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-sm">{title}</h3>
        {copyText && onCopy && (
          <button
            onClick={() => onCopy(copyText)}
            className="text-xs text-brand-600 px-2 py-0.5 rounded active:bg-brand-50"
          >
            复制
          </button>
        )}
      </div>
      <div className="p-3 text-sm text-slate-700">{children}</div>
    </div>
  );
}

function XHSResult({
  output,
  onCopy,
}: {
  output: any;
  onCopy: (s: string, label?: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Block title="5个标题备选">
        <ol className="space-y-2">
          {(output.titles ?? []).map((t: string, i: number) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-slate-400 text-xs w-5 mt-0.5">{i + 1}.</span>
              <span className="flex-1">{t}</span>
              <button
                onClick={() => onCopy(t)}
                className="text-xs text-brand-600 px-2 active:bg-brand-50 rounded"
              >
                复制
              </button>
              <TitleRefiner title={t} platform="xiaohongshu" />
            </li>
          ))}
        </ol>
      </Block>

      <Block title="正文" copyText={output.body} onCopy={onCopy}>
        <div className="whitespace-pre-wrap leading-relaxed">{output.body}</div>
      </Block>

      <Block title="封面大字" copyText={output.coverText} onCopy={onCopy}>
        <div>{output.coverText}</div>
      </Block>

      <Block title="私信引导" copyText={output.cta} onCopy={onCopy}>
        <div>{output.cta}</div>
      </Block>

      <Block title="配图建议">
        <div className="whitespace-pre-wrap text-slate-600">
          {output.imageSuggestion}
        </div>
      </Block>

      <Block
        title="标签"
        copyText={(output.tags ?? []).map((t: string) => `#${t}`).join(' ')}
        onCopy={onCopy}
      >
        <div className="flex flex-wrap gap-1.5">
          {(output.tags ?? []).map((t: string, i: number) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs"
            >
              #{t}
            </span>
          ))}
        </div>
      </Block>
    </div>
  );
}

function XYResult({
  output,
  onCopy,
}: {
  output: any;
  onCopy: (s: string, label?: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Block title="商品标题" copyText={output.title} onCopy={onCopy}>
        <div className="font-medium flex items-center gap-2 flex-wrap">
          <span>{output.title}</span>
          {output.title && (
            <TitleRefiner title={output.title} platform="xianyu" />
          )}
        </div>
      </Block>
      <Block title="商品详情" copyText={output.description} onCopy={onCopy}>
        <div className="whitespace-pre-wrap leading-relaxed">
          {output.description}
        </div>
      </Block>
      <Block title="首图文案" copyText={output.coverText} onCopy={onCopy}>
        <div>{output.coverText}</div>
      </Block>
      <Block title="三档套餐">
        <div className="space-y-2">
          {(output.tiers ?? []).map((t: any, i: number) => (
            <div key={i} className="text-sm">
              <span className="badge-yellow mr-2">{t.tier}</span>
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 text-slate-500">{t.priceRange}</span>
            </div>
          ))}
        </div>
      </Block>
      <Block title="下单流程">
        <ol className="list-decimal pl-5 space-y-1">
          {(output.orderFlow ?? []).map((s: string, i: number) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </Block>
      <Block title="交付范围" copyText={output.deliveryScope} onCopy={onCopy}>
        <div className="whitespace-pre-wrap">{output.deliveryScope}</div>
      </Block>
      <Block title="修改规则" copyText={output.revisionRule} onCopy={onCopy}>
        <div className="whitespace-pre-wrap">{output.revisionRule}</div>
      </Block>
      <Block title="拍前须知">
        <ul className="list-disc pl-5 space-y-1">
          {(output.preOrderNotes ?? []).map((s: string, i: number) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </Block>
      <Block title="常见问题">
        <div className="space-y-2">
          {(output.faq ?? []).map((f: any, i: number) => (
            <div key={i}>
              <div className="font-medium">Q：{f.q}</div>
              <div className="text-slate-600">A：{f.a}</div>
            </div>
          ))}
        </div>
      </Block>
      <Block title="快捷回复话术">
        <ul className="space-y-2">
          {(output.quickReplies ?? []).map((s: string, i: number) => (
            <li key={i} className="flex items-start gap-2">
              <span className="flex-1 whitespace-pre-wrap">{s}</span>
              <button
                onClick={() => onCopy(s)}
                className="text-xs text-brand-600 shrink-0"
              >
                复制
              </button>
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}
