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
      // 滚动到结果
      setTimeout(() => {
        document.getElementById('m-content-result')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 50);
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
    <div className="space-y-3">
      {/* 输入 */}
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
          <Field label="内容类型">
            <select
              className="m-input"
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
              className="m-input"
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
        </div>
        <Field label="风格">
          <div className="flex gap-2 flex-wrap">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => up('tone', t)}
                className={
                  'px-3 py-1.5 rounded-full text-sm border ' +
                  (form.tone === t
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-slate-700 border-slate-300')
                }
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
        <Field label="本次主题（可选）">
          <input
            className="m-input"
            value={form.topic}
            onChange={(e) => up('topic', e.target.value)}
            placeholder="例：奶茶店开业菜单升级"
          />
        </Field>
        <button
          onClick={submit}
          disabled={loading}
          className="w-full rounded-lg bg-brand-600 text-white font-medium py-3 active:bg-brand-700 disabled:opacity-60"
        >
          {loading ? '生成中...' : '生成文案'}
        </button>
      </div>

      {/* 结果 */}
      {result && (
        <div id="m-content-result" className="space-y-3">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between gap-2">
            <div className="text-sm text-emerald-700 font-medium">
              ✨ 已生成
            </div>
            <button
              onClick={copyAllBundle}
              className="rounded-md bg-emerald-600 text-white text-sm font-medium px-3 py-2 active:bg-emerald-700"
            >
              📋 一键复制完整发布包
            </button>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-3 text-center">
              手机预览
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
