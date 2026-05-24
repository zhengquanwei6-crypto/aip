/**
 * v0.11 B15.6 · 市场平台编辑 Modal
 *
 * 编辑 PlatformInfo（name / icon / tagline / description[] / categories[] /
 * dataSource / recommendedKpis[] / recommendedWorkflow），保存调
 *   PUT /api/market/platforms { slug, platform }
 * 写回 Setting 表 `market:platform:<slug>`。
 *
 * 设计选择（B15.6 风险注意）：
 *   - description / categories 用 textarea，一行一项（最简最快，避免嵌套 form）
 *   - recommendedKpis 用 textarea JSON 编辑模式，提交前 JSON.parse + 客户端形状检查
 *     · 服务端会用 platformInfoSchema 严格 zod 校验，失败把 issues 显示给用户
 *   - 0 LLM/IMAGE 消耗
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
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

function linesToArray(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function arrayToLines(arr: string[] | undefined): string {
  return Array.isArray(arr) ? arr.join('\n') : '';
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
  const [recommendedKpisJson, setRecommendedKpisJson] = useState<string>(
    JSON.stringify(current.recommendedKpis ?? [], null, 2),
  );
  const [recommendedWorkflow, setRecommendedWorkflow] = useState(current.recommendedWorkflow);

  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState<Array<{ path: string; message: string }>>([]);

  // 切换平台时（虽然每次开 modal 通常只编一个 slug）重置表单
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
  }, [open, slug, current]);

  const kpiPreview = useMemo(() => {
    try {
      const parsed = JSON.parse(recommendedKpisJson);
      if (!Array.isArray(parsed)) return { ok: false as const, error: '必须是 JSON 数组' };
      for (let i = 0; i < parsed.length; i++) {
        const k = parsed[i];
        if (!k || typeof k !== 'object') return { ok: false as const, error: `第 ${i + 1} 条不是对象` };
        if (typeof k.key !== 'string' || !k.key) return { ok: false as const, error: `第 ${i + 1} 条 key 缺失` };
        if (typeof k.label !== 'string' || !k.label)
          return { ok: false as const, error: `第 ${i + 1} 条 label 缺失` };
      }
      return { ok: true as const, count: parsed.length };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [recommendedKpisJson]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIssues([]);

    // 1) 客户端 KPI JSON 解析
    let recommendedKpis: PlatformKpi[];
    try {
      const parsed = JSON.parse(recommendedKpisJson);
      if (!Array.isArray(parsed)) throw new Error('recommendedKpis 必须是 JSON 数组');
      recommendedKpis = parsed as PlatformKpi[];
    } catch (err) {
      const msg = (err as Error).message;
      toast.error('recommendedKpis JSON 解析失败：' + msg);
      setIssues([{ path: 'recommendedKpis', message: msg }]);
      return;
    }

    const description = linesToArray(descriptionText);
    const categories = linesToArray(categoriesText);

    const platform: PlatformInfoLite = {
      slug,
      name: name.trim(),
      icon: icon.trim(),
      tagline: tagline.trim(),
      description,
      categories,
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
        const msg = j?.error || `保存失败 (${res.status})`;
        toast.error(msg);
        if (Array.isArray(j?.issues)) {
          setIssues(j.issues as Array<{ path: string; message: string }>);
        } else {
          setIssues([{ path: '', message: msg }]);
        }
        return;
      }
      toast.success(`已保存「${j.platform?.name || slug}」`);
      onSaved(j.platform as PlatformInfoLite);
      onClose();
    } catch (err) {
      const msg = (err as Error).message;
      toast.error('保存失败：' + msg);
      setIssues([{ path: '', message: msg }]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3 dark:bg-black/60"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`编辑 ${current.name} 平台信息`}
      data-b15-6-platform-edit-modal=""
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 flex flex-col"
      >
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <span aria-hidden>{icon || '📊'}</span>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              编辑平台信息 · {slug}
            </h3>
            <span className="text-[11px] text-slate-400 font-normal">v0.11 B15.6</span>
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2"
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            slug = <span className="font-mono">{slug}</span>，写入 Setting 表 key{' '}
            <span className="font-mono">market:platform:{slug}</span>。
            数组字段一行一项；recommendedKpis 用 JSON 编辑模式（提交前会校验）。
            服务端用 zod 严格校验，失败会在底部显示具体原因。
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block sm:col-span-2 text-xs">
              <span className="text-slate-700 dark:text-slate-300">name（中文名）</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                required
                data-b15-6-field="name"
              />
            </label>
            <label className="block text-xs">
              <span className="text-slate-700 dark:text-slate-300">icon（emoji，最多 4）</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={4}
                required
                data-b15-6-field="icon"
              />
            </label>
          </div>

          <label className="block text-xs">
            <span className="text-slate-700 dark:text-slate-300">tagline（一句话定位 · 最多 80）</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={80}
              required
              data-b15-6-field="tagline"
            />
          </label>

          <label className="block text-xs">
            <span className="text-slate-700 dark:text-slate-300">
              description（一行一段 · 3–8 段，每段最多 220 字）
            </span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              rows={5}
              value={descriptionText}
              onChange={(e) => setDescriptionText(e.target.value)}
              data-b15-6-field="description"
            />
            <span className="block mt-0.5 text-[10px] text-slate-400">
              当前 {linesToArray(descriptionText).length} 段
            </span>
          </label>

          <label className="block text-xs">
            <span className="text-slate-700 dark:text-slate-300">
              categories（一行一项 · 1–10 项，每项最多 20 字）
            </span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              rows={3}
              value={categoriesText}
              onChange={(e) => setCategoriesText(e.target.value)}
              data-b15-6-field="categories"
            />
            <span className="block mt-0.5 text-[10px] text-slate-400">
              当前 {linesToArray(categoriesText).length} 项
            </span>
          </label>

          <label className="block text-xs">
            <span className="text-slate-700 dark:text-slate-300">
              dataSource（数据来源说明 · 最多 200 字）
            </span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              rows={2}
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              maxLength={200}
              required
              data-b15-6-field="dataSource"
            />
          </label>

          <label className="block text-xs">
            <span className="text-slate-700 dark:text-slate-300">
              recommendedKpis（JSON 数组 · 2–8 条 · 每条 {`{key,label,unit?,hint?}`}）
            </span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              rows={8}
              value={recommendedKpisJson}
              onChange={(e) => setRecommendedKpisJson(e.target.value)}
              spellCheck={false}
              data-b15-6-field="recommendedKpis"
            />
            <span
              className={
                'block mt-0.5 text-[10px] ' +
                (kpiPreview.ok ? 'text-emerald-600' : 'text-red-600')
              }
            >
              {kpiPreview.ok
                ? `JSON OK · ${kpiPreview.count} 条`
                : `JSON 错误：${kpiPreview.error}`}
            </span>
          </label>

          <label className="block text-xs">
            <span className="text-slate-700 dark:text-slate-300">
              recommendedWorkflow（推荐工作流 · 最多 400 字）
            </span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              rows={4}
              value={recommendedWorkflow}
              onChange={(e) => setRecommendedWorkflow(e.target.value)}
              maxLength={400}
              required
              data-b15-6-field="recommendedWorkflow"
            />
          </label>

          {issues.length > 0 ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/40 dark:bg-red-900/20 dark:text-red-300">
              <div className="font-medium mb-1">校验失败：</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {issues.map((i, idx) => (
                  <li key={idx}>
                    <span className="font-mono">{i.path || '(root)'}</span>: {i.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            写入 Setting 表 · 立即生效 · entrypoint 自动 seed 检测到此行后会跳过覆盖
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              disabled={submitting || !kpiPreview.ok}
              data-b15-6-submit
            >
              {submitting ? '保存中…' : '保存'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
