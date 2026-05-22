'use client';

import { useState } from 'react';
import {
  PLATFORMS,
  CATEGORIES,
  CONTENT_TYPES,
  TARGET_AUDIENCES,
  TONES,
} from '@/lib/constants';
import { copyAll, buildXhsBundle, buildXianyuBundle } from '@/lib/clipboard';

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
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    platform: Platform;
    output: XHSOutput | XYOutput;
  } | null>(null);

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function copy(s: string) {
    copyAll(s);
  }

  async function copyBundle() {
    if (!result) return;
    const text =
      result.platform === 'xiaohongshu'
        ? buildXhsBundle({
            title: (result.output as XHSOutput).titles?.[0] ?? form.topic ?? '',
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
  }

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
            <input
              className="input"
              value={form.topic}
              onChange={(e) => up('topic', e.target.value)}
              placeholder="例：奶茶店开业菜单升级"
            />
          </Field>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? '生成中...' : '生成文案'}
          </button>
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
        {result && (
          <div className="card border-emerald-200 bg-emerald-50">
            <div className="card-body flex items-center justify-between gap-3">
              <div className="text-sm text-emerald-700 font-medium">
                ✨ 已生成 · 自动保存到「内容仓库」
              </div>
              <button
                onClick={copyBundle}
                className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700"
              >
                📋 一键复制完整发布包
              </button>
            </div>
          </div>
        )}
        {result && result.platform === 'xiaohongshu' && (
          <XHSResult output={result.output as XHSOutput} onCopy={copy} />
        )}
        {result && result.platform === 'xianyu' && (
          <XYResult output={result.output as XYOutput} onCopy={copy} />
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
        <ol className="list-decimal pl-5 space-y-1">
          {(output.titles ?? []).map((t, i) => (
            <li key={i}>
              <span className="mr-2">{t}</span>
              <button
                onClick={() => onCopy(t)}
                className="text-xs text-brand-600 hover:underline"
              >
                复制
              </button>
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
        <div className="text-base font-medium">{output.title}</div>
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
