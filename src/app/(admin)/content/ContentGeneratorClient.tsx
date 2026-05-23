'use client';

import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, GitCompare, ArrowLeft, Trash2 } from 'lucide-react';
import {
  PLATFORMS,
  CATEGORIES,
  CONTENT_TYPES,
  TARGET_AUDIENCES,
  TONES,
} from '@/lib/constants';
import { copyAll, buildXhsBundle, buildXianyuBundle } from '@/lib/clipboard';
import PhonePreview from '@/components/PhonePreview';
import TitleRefiner from '@/components/TitleRefiner';
import ProgressBar from '@/components/ProgressBar';
import { toast } from '@/lib/toast';
import { usePromptHistory } from '@/hooks/usePromptHistory';
import { GenerateImageForPostDrawer } from '@/components/agents/GenerateImageForPostDrawer';

type Platform = 'xiaohongshu' | 'xianyu';

interface FormState {
  platform: Platform;
  category: string;
  contentType: string;
  audience: string;
  tone: string;
  topic: string;
}

interface XHSOutput {
  titles?: string[];
  body?: string;
  coverText?: string;
  imageSuggestion?: string;
  tags?: string[];
  cta?: string;
}

interface XYOutput {
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

type AnyOutput = XHSOutput | XYOutput;

interface ContentVersion {
  platform: Platform;
  output: AnyOutput;
  topic: string;
  generatedAt: number;
}

const DEFAULT_FORM: FormState = {
  platform: 'xiaohongshu',
  category: 'Logo',
  contentType: '案例型',
  audience: '电商卖家',
  tone: '专业',
  topic: '',
};

export default function ContentGeneratorClient() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  // 为这篇生图抽屉状态
  const [imgDrawerOpen, setImgDrawerOpen] = useState(false);

  // B6.4：主题（topic）历史
  const { history: topicHistory, push: pushTopicHistory, clear: clearTopicHistory } =
    usePromptHistory('content', 20);

  // 生成中累计已用时（秒）
  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const t = window.setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(t);
  }, [loading]);

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // 当前展示的版本 = 最后一条
  const result = versions.length > 0 ? versions[versions.length - 1] : null;
  const previousVersion =
    versions.length >= 2 ? versions[versions.length - 2] : null;

  async function doGenerate() {
    setLoading(true);
    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      setVersions((arr) => [
        ...arr,
        {
          platform: form.platform,
          output: j.content,
          topic: form.topic,
          generatedAt: Date.now(),
        },
      ]);
      // B6.4：成功后推入 topic 历史
      if (form.topic.trim()) pushTopicHistory(form.topic);
      // 新版本生成后，如果之前在对比模式，切回正常视图
      setCompareMode(false);
      toast.success(versions.length === 0 ? '文案生成完成' : '已生成新版本');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    await doGenerate();
  }

  function copy(s: string) {
    copyAll(s);
  }

  async function copyBundle() {
    if (!result) return;
    const text =
      result.platform === 'xiaohongshu'
        ? buildXhsBundle({
            title: (result.output as XHSOutput).titles?.[0] ?? result.topic ?? '',
            body: (result.output as XHSOutput).body ?? '',
            tags: (result.output as XHSOutput).tags,
            coverText: (result.output as XHSOutput).coverText,
            cta: (result.output as XHSOutput).cta,
          })
        : buildXianyuBundle({
            title: (result.output as XYOutput).title ?? '',
            description: (result.output as XYOutput).description ?? '',
            coverText: (result.output as XYOutput).coverText,
            preOrderNotes: (result.output as XYOutput).preOrderNotes,
          });
    await copyAll(text);
    toast.success('已复制完整发布包');
  }

  // 显示最近 5 条 topic（去重）
  const recentTopics = topicHistory.slice(0, 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
      {/* 输入 */}
      <form onSubmit={submit} className="card h-fit sticky top-4">
        <div className="card-header">
          <h2 className="font-semibold">生成参数</h2>
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
          <Field label="内容类型">
            <select
              className="input"
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
          <Field label="目标客户">
            <select
              className="input"
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
          <Field label="文案风格">
            <select
              className="input"
              value={form.tone}
              onChange={(e) => up('tone', e.target.value)}
            >
              {TONES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="本次主题（可选）">
            {recentTopics.length > 0 && (
              <div
                data-topic-recent
                className="flex flex-wrap items-center gap-1 mb-1.5"
              >
                <span className="text-[11px] text-slate-400">最近用过:</span>
                {recentTopics.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => up('topic', t)}
                    className="text-[11px] px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-brand-50 hover:border-brand-300 dark:hover:bg-brand-900/30 truncate max-w-[200px]"
                    title={t}
                  >
                    {t}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    clearTopicHistory();
                    toast.info('已清空主题历史');
                  }}
                  className="text-[11px] text-slate-400 hover:text-rose-500 inline-flex items-center"
                  title="清空"
                  aria-label="清空主题历史"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            )}
            <input
              className="input"
              value={form.topic}
              onChange={(e) => up('topic', e.target.value)}
              placeholder="例：奶茶店开业菜单升级"
            />
          </Field>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? '生成中...' : versions.length === 0 ? '生成文案' : '重新生成（替换当前）'}
          </button>
          {result && !loading && (
            <button
              type="button"
              onClick={doGenerate}
              disabled={loading}
              className="btn-secondary w-full inline-flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} />
              再来一版（保留当前作为上一版）
            </button>
          )}
          {loading && (
            <ProgressBar
              mode="indeterminate"
              label="正在生成文案…"
              elapsed={elapsed}
            />
          )}
          {versions.length >= 2 && !loading && (
            <button
              type="button"
              onClick={() => setCompareMode((v) => !v)}
              className="w-full text-xs px-3 py-2 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 inline-flex items-center justify-center gap-2"
            >
              {compareMode ? (
                <>
                  <ArrowLeft size={14} />
                  退出对比
                </>
              ) : (
                <>
                  <GitCompare size={14} />
                  对比上一版
                </>
              )}
            </button>
          )}
          {versions.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              已生成 {versions.length} 版。最新一版在右侧显示，
              {versions.length >= 2 ? '可点击「对比上一版」查看差异。' : '再来一版可触发对比。'}
            </p>
          )}
          <p className="text-xs text-slate-400 leading-relaxed">
            提示：会自动引用关键词库和价格套餐。生成结果会自动保存到 AI 输出历史与帖子/商品库。
          </p>
        </div>
      </form>

      {/* 输出 */}
      <div className="space-y-4">
        {!result && !loading && (
          <div className="card">
            <div className="card-body text-sm text-slate-400 text-center py-12">
              填写左侧参数，点击生成文案。
            </div>
          </div>
        )}

        {result && compareMode && previousVersion && (
          <CompareView prev={previousVersion} curr={result} />
        )}

        {result && !compareMode && (
          <>
            <div className="card border-emerald-200 bg-emerald-50">
              <div className="card-body flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-emerald-700 font-medium">
                  ✨ 已生成 · 自动保存到「内容仓库」
                  {versions.length >= 2 ? `（第 ${versions.length} 版）` : ''}
                </div>
                <button
                  onClick={copyBundle}
                  className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700"
                >
                  📋 一键复制完整发布包
                </button>
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold">手机预览</h3>
                <span className="text-xs text-slate-400">所见即所得（仅参考）</span>
              </div>
              <div className="card-body">
                {result.platform === 'xiaohongshu' ? (
                  <PhonePreview
                    platform="xiaohongshu"
                    title={
                      (result.output as XHSOutput).titles?.[0] ?? result.topic
                    }
                    body={(result.output as XHSOutput).body}
                    coverText={(result.output as XHSOutput).coverText}
                    tags={(result.output as XHSOutput).tags}
                  />
                ) : (
                  <PhonePreview
                    platform="xianyu"
                    title={(result.output as XYOutput).title ?? result.topic}
                    description={(result.output as XYOutput).description}
                    coverText={(result.output as XYOutput).coverText}
                    priceRange={
                      (result.output as XYOutput).tiers?.[1]?.priceRange ??
                      (result.output as XYOutput).tiers?.[0]?.priceRange
                    }
                  />
                )}
              </div>
            </div>
            {result.platform === 'xiaohongshu' ? (
              <XHSResult output={result.output as XHSOutput} onCopy={copy} />
            ) : (
              <XYResult output={result.output as XYOutput} onCopy={copy} />
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setImgDrawerOpen(true)}
                className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded px-4 py-2 inline-flex items-center gap-2"
              >
                🎬 为这篇生图
              </button>
            </div>
          </>
        )}
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

function Section({
  title,
  children,
  copyText,
  onCopy,
}: {
  title: string;
  children: React.ReactNode;
  copyText?: string;
  onCopy?: (s: string) => void;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="font-semibold">{title}</h3>
        {copyText && onCopy && (
          <button
            type="button"
            onClick={() => onCopy(copyText)}
            className="text-xs text-brand-600 hover:underline"
          >
            复制
          </button>
        )}
      </div>
      <div className="card-body text-sm text-slate-700">{children}</div>
          {result && (
        <GenerateImageForPostDrawer
          open={imgDrawerOpen}
          onClose={() => setImgDrawerOpen(false)}
          platform={result.platform}
          category={form.category}
          imageType={result.platform === 'xianyu' ? '商品首图' : '封面图'}
          notes={
            result.platform === 'xiaohongshu'
              ? {
                  title: (result.output as XHSOutput).titles?.[0],
                  body: (result.output as XHSOutput).body,
                  coverText: (result.output as XHSOutput).coverText,
                  tags: (result.output as XHSOutput).tags?.join(','),
                }
              : {
                  title: (result.output as XYOutput).title,
                  description: (result.output as XYOutput).description,
                  coverText: (result.output as XYOutput).coverText,
                  tiers: (result.output as XYOutput).tiers,
                }
          }
        />
      )}
      </div>
  );
}

function XHSResult({
  output,
  onCopy,
}: {
  output: XHSOutput;
  onCopy: (s: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Section title="5个标题备选">
        <ol className="list-decimal pl-5 space-y-1.5">
          {(output.titles ?? []).map((t, i) => (
            <li key={i}>
              <span className="mr-2">{t}</span>
              <button
                onClick={() => onCopy(t)}
                className="text-xs text-brand-600 hover:underline"
              >
                复制
              </button>
              <TitleRefiner title={t} platform="xiaohongshu" />
            </li>
          ))}
        </ol>
      </Section>

      <Section title="正文" copyText={output.body} onCopy={onCopy}>
        <div className="whitespace-pre-wrap leading-relaxed">{output.body}</div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="封面大字" copyText={output.coverText} onCopy={onCopy}>
          <div className="text-base">{output.coverText}</div>
        </Section>
        <Section title="私信引导 CTA" copyText={output.cta} onCopy={onCopy}>
          <div>{output.cta}</div>
        </Section>
      </div>

      <Section title="配图建议">
        <div className="whitespace-pre-wrap">{output.imageSuggestion}</div>
      </Section>

      <Section
        title="标签关键词"
        copyText={(output.tags ?? []).map((t) => `#${t}`).join(' ')}
        onCopy={onCopy}
      >
        <div className="flex flex-wrap gap-2">
          {(output.tags ?? []).map((t, i) => (
            <span key={i} className="badge-blue">
              #{t}
            </span>
          ))}
        </div>
      </Section>
    </div>
  );
}

function XYResult({
  output,
  onCopy,
}: {
  output: XYOutput;
  onCopy: (s: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Section title="商品标题" copyText={output.title} onCopy={onCopy}>
        <div className="text-base font-medium flex items-center gap-2">
          <span>{output.title}</span>
          {output.title && (
            <TitleRefiner title={output.title} platform="xianyu" />
          )}
        </div>
      </Section>

      <Section title="商品详情" copyText={output.description} onCopy={onCopy}>
        <div className="whitespace-pre-wrap leading-relaxed">
          {output.description}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="首图文案" copyText={output.coverText} onCopy={onCopy}>
          <div>{output.coverText}</div>
        </Section>
        <Section title="三档套餐">
          <div className="space-y-1">
            {(output.tiers ?? []).map((t, i) => (
              <div key={i} className="text-xs">
                <span className="badge-yellow mr-2">{t.tier}</span>
                {t.name} <span className="text-slate-500">{t.priceRange}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="下单流程">
        <ol className="list-decimal pl-5 space-y-1">
          {(output.orderFlow ?? []).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section
          title="交付范围"
          copyText={output.deliveryScope}
          onCopy={onCopy}
        >
          <div className="whitespace-pre-wrap">{output.deliveryScope}</div>
        </Section>
        <Section
          title="修改规则"
          copyText={output.revisionRule}
          onCopy={onCopy}
        >
          <div className="whitespace-pre-wrap">{output.revisionRule}</div>
        </Section>
      </div>

      <Section title="拍前须知">
        <ul className="list-disc pl-5 space-y-1">
          {(output.preOrderNotes ?? []).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </Section>

      <Section title="常见问题">
        <div className="space-y-2">
          {(output.faq ?? []).map((f, i) => (
            <div key={i}>
              <div className="font-medium">Q：{f.q}</div>
              <div className="text-slate-600">A：{f.a}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="快捷回复话术">
        <ul className="space-y-1">
          {(output.quickReplies ?? []).map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="flex-1 whitespace-pre-wrap">{s}</span>
              <button
                onClick={() => onCopy(s)}
                className="text-xs text-brand-600 hover:underline shrink-0"
              >
                复制
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/* ---------------- 双版对比 ---------------- */

interface CompareFieldDef {
  label: string;
  prev?: string;
  curr?: string;
}

function flattenForCompare(
  platform: Platform,
  out: AnyOutput,
): { label: string; text: string }[] {
  const fields: { label: string; text: string }[] = [];
  if (platform === 'xiaohongshu') {
    const x = out as XHSOutput;
    const titles = (x.titles ?? []).map((t, i) => `${i + 1}. ${t}`).join('\n');
    fields.push({ label: '标题备选', text: titles });
    fields.push({ label: '正文', text: x.body ?? '' });
    fields.push({ label: '封面大字', text: x.coverText ?? '' });
    fields.push({ label: '私信引导 CTA', text: x.cta ?? '' });
    fields.push({ label: '配图建议', text: x.imageSuggestion ?? '' });
    fields.push({
      label: '标签',
      text: (x.tags ?? []).map((t) => `#${t}`).join(' '),
    });
  } else {
    const y = out as XYOutput;
    fields.push({ label: '商品标题', text: y.title ?? '' });
    fields.push({ label: '商品详情', text: y.description ?? '' });
    fields.push({ label: '首图文案', text: y.coverText ?? '' });
    fields.push({
      label: '三档套餐',
      text: (y.tiers ?? [])
        .map((t) => `${t.tier} · ${t.name} · ${t.priceRange}`)
        .join('\n'),
    });
    fields.push({
      label: '下单流程',
      text: (y.orderFlow ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n'),
    });
    fields.push({ label: '交付范围', text: y.deliveryScope ?? '' });
    fields.push({ label: '修改规则', text: y.revisionRule ?? '' });
    fields.push({
      label: '拍前须知',
      text: (y.preOrderNotes ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n'),
    });
    fields.push({
      label: '常见问题',
      text: (y.faq ?? []).map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n'),
    });
    fields.push({
      label: '快捷回复',
      text: (y.quickReplies ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n'),
    });
  }
  return fields;
}

function CompareView({
  prev,
  curr,
}: {
  prev: ContentVersion;
  curr: ContentVersion;
}) {
  const fields = useMemo(() => {
    if (prev.platform !== curr.platform) {
      // 不同平台不对比，回退展示当前版
      return flattenForCompare(curr.platform, curr.output).map((f) => ({
        label: f.label,
        prev: '',
        curr: f.text,
      }));
    }
    const a = flattenForCompare(prev.platform, prev.output);
    const b = flattenForCompare(curr.platform, curr.output);
    const out: CompareFieldDef[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      out.push({
        label: a[i]?.label ?? b[i]?.label ?? `字段 ${i + 1}`,
        prev: a[i]?.text,
        curr: b[i]?.text,
      });
    }
    return out;
  }, [prev, curr]);

  return (
    <div className="space-y-4">
      <div className="card border-amber-200 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-700">
        <div className="card-body text-sm text-amber-800 dark:text-amber-200">
          📊 双版对比：左侧为<b>上一版</b>，右侧为<b>当前版</b>。
          差异行已用黄色高亮。
        </div>
      </div>
      {fields.map((f, i) => (
        <div key={i} className="card">
          <div className="card-header">
            <h3 className="font-semibold text-sm">{f.label}</h3>
          </div>
          <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <DiffSide
              label="上一版"
              text={f.prev ?? ''}
              other={f.curr ?? ''}
            />
            <DiffSide
              label="当前版"
              text={f.curr ?? ''}
              other={f.prev ?? ''}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DiffSide({
  label,
  text,
  other,
}: {
  label: string;
  text: string;
  other: string;
}) {
  const lines = text.split('\n');
  const otherLines = new Set(other.split('\n'));
  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</div>
      <div className="rounded border border-slate-200 dark:border-slate-700 overflow-hidden">
        {lines.length === 0 || (lines.length === 1 && lines[0] === '') ? (
          <div className="px-2 py-1.5 text-xs text-slate-400 italic">（空）</div>
        ) : (
          lines.map((ln, i) => {
            const same = otherLines.has(ln);
            return (
              <div
                key={i}
                className={
                  'px-2 py-1 whitespace-pre-wrap break-words text-xs leading-relaxed ' +
                  (same
                    ? 'text-slate-700 dark:text-slate-200'
                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-slate-800 dark:text-slate-100')
                }
              >
                {ln === '' ? '\u00a0' : ln}
              </div>
            );
          })
        )}
      </div>
          </div>
  );
}
