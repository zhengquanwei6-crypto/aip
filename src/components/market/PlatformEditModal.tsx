'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Loader2, Save, X } from 'lucide-react';

import { toast } from '@/lib/toast';

export type PlatformSlug = 'xiaohongshu' | 'xianyu' | 'qianniu';

export interface PlatformKpi {
  key: string;
  label: string;
  unit?: string;
  hint?: string;
}

export interface PlatformInfoLite {
  slug: PlatformSlug;
  name: string;
  icon: string;
  tagline: string;
  description: string[];
  categories: string[];
  dataSource: string;
  recommendedKpis: PlatformKpi[];
  recommendedWorkflow: string;
}

export interface PlatformEditModalProps {
  open: boolean;
  slug: PlatformSlug;
  current: PlatformInfoLite;
  onClose: () => void;
  onSaved: (next: PlatformInfoLite) => void;
}

function linesToArray(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(value: string[] | undefined): string {
  return Array.isArray(value) ? value.join('\n') : '';
}

export default function PlatformEditModal({
  open,
  slug,
  current,
  onClose,
  onSaved,
}: PlatformEditModalProps) {
  const [name, setName] = useState(current.name);
  const [icon, setIcon] = useState(current.icon);
  const [tagline, setTagline] = useState(current.tagline);
  const [descriptionText, setDescriptionText] = useState(arrayToLines(current.description));
  const [categoriesText, setCategoriesText] = useState(arrayToLines(current.categories));
  const [dataSource, setDataSource] = useState(current.dataSource);
  const [recommendedKpisJson, setRecommendedKpisJson] = useState(JSON.stringify(current.recommendedKpis ?? [], null, 2));
  const [recommendedWorkflow, setRecommendedWorkflow] = useState(current.recommendedWorkflow);
  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState<Array<{ path: string; message: string }>>([]);

  useEffect(() => {
    if (!open) return;
    setName(current.name);
    setIcon(current.icon);
    setTagline(current.tagline);
    setDescriptionText(arrayToLines(current.description));
    setCategoriesText(arrayToLines(current.categories));
    setDataSource(current.dataSource);
    setRecommendedKpisJson(JSON.stringify(current.recommendedKpis ?? [], null, 2));
    setRecommendedWorkflow(current.recommendedWorkflow);
    setIssues([]);
  }, [current, open]);

  const kpiPreview = useMemo(() => {
    try {
      const parsed = JSON.parse(recommendedKpisJson);
      if (!Array.isArray(parsed)) return { ok: false as const, error: '必须是 JSON 数组' };
      for (let index = 0; index < parsed.length; index++) {
        const item = parsed[index];
        if (!item || typeof item !== 'object') return { ok: false as const, error: `第 ${index + 1} 项不是对象` };
        if (typeof item.key !== 'string' || !item.key) return { ok: false as const, error: `第 ${index + 1} 项缺少 key` };
        if (typeof item.label !== 'string' || !item.label) return { ok: false as const, error: `第 ${index + 1} 项缺少 label` };
      }
      return { ok: true as const, count: parsed.length };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [recommendedKpisJson]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIssues([]);

    let recommendedKpis: PlatformKpi[];
    try {
      const parsed = JSON.parse(recommendedKpisJson);
      if (!Array.isArray(parsed)) throw new Error('recommendedKpis 必须是 JSON 数组');
      recommendedKpis = parsed as PlatformKpi[];
    } catch (err) {
      const message = (err as Error).message;
      toast.error(`KPI JSON 解析失败：${message}`);
      setIssues([{ path: 'recommendedKpis', message }]);
      return;
    }

    const platform: PlatformInfoLite = {
      slug,
      name: name.trim(),
      icon: icon.trim(),
      tagline: tagline.trim(),
      description: linesToArray(descriptionText),
      categories: linesToArray(categoriesText),
      dataSource: dataSource.trim(),
      recommendedKpis,
      recommendedWorkflow: recommendedWorkflow.trim(),
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/market/platforms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, platform }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        const message = j?.error || `保存失败 (${res.status})`;
        toast.error(message);
        if (Array.isArray(j?.issues)) setIssues(j.issues as Array<{ path: string; message: string }>);
        else setIssues([{ path: '', message }]);
        return;
      }
      toast.success(`已保存 ${j.platform?.name || slug}`);
      onSaved(j.platform as PlatformInfoLite);
      onClose();
    } catch (err) {
      const message = (err as Error).message;
      toast.error(`保存失败：${message}`);
      setIssues([{ path: '', message }]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-3 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`编辑 ${current.name} 平台信息`}
    >
      <form
        onSubmit={handleSubmit}
        className="surface-elevated flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <div className="page-kicker">平台信息</div>
            <h3 className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              编辑 {current.name} · {slug}
            </h3>
          </div>
          <button
            type="button"
            className="tap-target-sm inline-flex w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-900 dark:hover:text-slate-200"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="名称" className="sm:col-span-2">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required />
            </Field>
            <Field label="图标">
              <input className="input" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} required />
            </Field>
          </div>

          <Field label="一句话定位">
            <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={80} required />
          </Field>

          <Field label="平台说明">
            <textarea className="input font-mono text-xs" rows={5} value={descriptionText} onChange={(e) => setDescriptionText(e.target.value)} />
            <span className="mt-1 block text-[10px] text-slate-400">当前 {linesToArray(descriptionText).length} 段</span>
          </Field>

          <Field label="类目">
            <textarea className="input font-mono text-xs" rows={3} value={categoriesText} onChange={(e) => setCategoriesText(e.target.value)} />
            <span className="mt-1 block text-[10px] text-slate-400">当前 {linesToArray(categoriesText).length} 项</span>
          </Field>

          <Field label="数据来源">
            <textarea className="input" rows={2} value={dataSource} onChange={(e) => setDataSource(e.target.value)} maxLength={200} required />
          </Field>

          <Field label="推荐 KPI JSON">
            <textarea
              className="input font-mono text-xs"
              rows={8}
              value={recommendedKpisJson}
              onChange={(e) => setRecommendedKpisJson(e.target.value)}
              spellCheck={false}
            />
            <span className={`mt-1 block text-[10px] ${kpiPreview.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {kpiPreview.ok ? `JSON OK · ${kpiPreview.count} 条` : `JSON 错误：${kpiPreview.error}`}
            </span>
          </Field>

          <Field label="推荐工作流">
            <textarea className="input" rows={4} value={recommendedWorkflow} onChange={(e) => setRecommendedWorkflow(e.target.value)} maxLength={400} required />
          </Field>

          {issues.length > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/40 dark:bg-red-950 dark:text-red-300">
              <div className="mb-1 font-medium">校验失败：</div>
              <ul className="space-y-0.5">
                {issues.map((issue, index) => (
                  <li key={index}>
                    <span className="font-mono">{issue.path || '(root)'}</span>: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <button type="button" className="btn-secondary text-xs" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button type="submit" className="btn-primary gap-2 text-xs" disabled={submitting || !kpiPreview.ok}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
