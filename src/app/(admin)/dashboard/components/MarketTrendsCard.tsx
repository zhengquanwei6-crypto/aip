/**
 * v0.11 B10 · Dashboard 第 5 区：市场趋势
 *
 * 三平台 Tab（小红书 / 闲鱼 / 千牛）+ 平台介绍折叠卡 + KPI 行 + 编辑数据 modal。
 * 数据来源说明 icon hover tooltip 指向 /docs/11-market-trends。
 *
 * 注意：
 *   - 0 LLM/IMAGE 消耗（POST /api/market/trends 只是 Setting 表写入）
 *   - placeholder=true 时 KPI 卡显示「示例」徽章 + 「— 待 v0.10 Chrome 扩展填充」灰文案
 *   - 非 placeholder 数据正常展示数值 + 单位 + 趋势
 */
'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  BarChart3,
  Info,
  ChevronDown,
  ChevronRight,
  Pencil,
  X,
} from 'lucide-react';
import type {
  MarketSnapshot,
  PlatformInfo,
  MarketPlatformSlug,
  TrendDataPoint,
} from '@/lib/market/types';

export interface MarketTrendsCardProps {
  data: Record<
    MarketPlatformSlug,
    { latest: MarketSnapshot | null; info: PlatformInfo }
  >;
  /** 三平台顺序，渲染 Tab 用 */
  order: ReadonlyArray<MarketPlatformSlug>;
}

const TABS_LABEL: Record<MarketPlatformSlug, string> = {
  xiaohongshu: '小红书',
  xianyu: '闲鱼',
  qianniu: '千牛',
};

function formatValue(p: TrendDataPoint): string {
  const n = p.value;
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 10_000).toFixed(1)}w`;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function KpiBlock({
  point,
  placeholder,
}: {
  point: TrendDataPoint;
  placeholder: boolean;
}) {
  const muted = placeholder;
  return (
    <div
      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40"
      title={point.hint || point.label}
    >
      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
        {point.label}
      </div>
      <div
        className={clsx(
          'mt-0.5 text-lg font-semibold tabular-nums',
          muted
            ? 'text-slate-400 dark:text-slate-500'
            : 'text-slate-900 dark:text-slate-100',
        )}
      >
        {muted ? '—' : `${formatValue(point)}${point.unit ? ` ${point.unit}` : ''}`}
      </div>
      {point.trend ? (
        <div className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400 truncate">
          {point.trend}
        </div>
      ) : muted ? (
        <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 truncate">
          待 v0.10 扩展填充
        </div>
      ) : null}
    </div>
  );
}

interface EditModalProps {
  platform: MarketPlatformSlug;
  info: PlatformInfo;
  initial: MarketSnapshot | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditDataModal({
  platform,
  info,
  initial,
  onClose,
  onSaved,
}: EditModalProps) {
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initialMap = useMemo(() => {
    const map = new Map<string, TrendDataPoint>();
    if (initial) for (const p of initial.dataPoints) map.set(p.key, p);
    return map;
  }, [initial]);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const k of info.recommendedKpis) {
      const existing = initialMap.get(k.key);
      out[k.key] = existing ? String(existing.value) : '';
    }
    return out;
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const dataPoints: TrendDataPoint[] = [];
    for (const k of info.recommendedKpis) {
      const raw = values[k.key]?.trim();
      if (!raw) continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        setError(`${k.label} 不是合法数字`);
        return;
      }
      dataPoints.push({
        key: k.key,
        label: k.label,
        value: num,
        unit: k.unit ?? '',
        ...(k.hint ? { hint: k.hint } : {}),
      });
    }
    if (dataPoints.length === 0) {
      setError('请至少填写 1 个 KPI');
      return;
    }
    startTransition(async () => {
      try {
        const resp = await fetch('/api/market/trends', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform,
            dataPoints,
            source: 'manual',
            placeholder: false,
          }),
        });
        const json = await resp.json();
        if (!resp.ok || !json?.ok) {
          setError(json?.error || `写入失败 (${resp.status})`);
          return;
        }
        onSaved();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : '写入失败');
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3 dark:bg-black/60"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`编辑 ${info.name} 市场数据`}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <span aria-hidden>{info.icon}</span>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              编辑 {info.name} 市场数据
            </h3>
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="px-4 py-3 space-y-2 max-h-[60vh] overflow-y-auto">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            手动填写当前指标值。空着的字段会被忽略。
          </p>
          {info.recommendedKpis.map((k) => (
            <label
              key={k.key}
              className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
            >
              <span className="w-32 shrink-0 truncate" title={k.label}>
                {k.label}
              </span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={values[k.key] ?? ''}
                onChange={(e) =>
                  setValues((s) => ({ ...s, [k.key]: e.target.value }))
                }
                className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder={k.unit ? `数值（${k.unit}）` : '数值'}
                data-market-kpi-input={k.key}
              />
              <span className="w-8 shrink-0 text-[11px] text-slate-400">
                {k.unit || ''}
              </span>
            </label>
          ))}
          {error ? (
            <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            写入后会更新今日快照（YYYY-MM-DD 覆盖）
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
              disabled={submitting}
              data-market-submit
            >
              {submitting ? '写入中…' : '保存'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

export default function MarketTrendsCard({
  data,
  order,
}: MarketTrendsCardProps) {
  const [active, setActive] = useState<MarketPlatformSlug>(order[0] ?? 'xiaohongshu');
  const [showInfo, setShowInfo] = useState(false);
  const [editing, setEditing] = useState<MarketPlatformSlug | null>(null);
  const [version, setVersion] = useState(0);

  const cur = data[active];
  if (!cur) return null;

  const dataPointsByKey = useMemo(() => {
    const m = new Map<string, TrendDataPoint>();
    if (cur.latest) for (const p of cur.latest.dataPoints) m.set(p.key, p);
    return m;
  }, [cur.latest, version]);

  const isPlaceholder = !cur.latest || cur.latest.placeholder;
  const sourceLabel = cur.latest?.source ?? 'placeholder';

  // 渲染 KPI：按 info.recommendedKpis 顺序，缺失补 0 + placeholder
  const kpiBlocks: Array<{ point: TrendDataPoint; placeholder: boolean }> =
    cur.info.recommendedKpis.map((k) => {
      const existing = dataPointsByKey.get(k.key);
      if (existing) {
        return {
          point: existing,
          placeholder: !!cur.latest?.placeholder,
        };
      }
      return {
        point: {
          key: k.key,
          label: k.label,
          value: 0,
          unit: k.unit ?? '',
          ...(k.hint ? { hint: k.hint } : {}),
        },
        placeholder: true,
      };
    });

  return (
    <section
      data-market-trends-card
      aria-label="市场趋势"
      className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3
            className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0"
            aria-hidden
          />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            📊 市场趋势
          </h2>
          <Link
            href="/docs/11-market-trends"
            className="ml-1 inline-flex items-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
            title="数据来源说明 · 三平台是什么 · 推荐工作流"
            aria-label="数据来源说明"
          >
            <Info className="h-3.5 w-3.5" />
          </Link>
        </div>
        <span
          className={clsx(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
            sourceLabel === 'extension'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : sourceLabel === 'manual'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
          )}
          title={
            sourceLabel === 'placeholder'
              ? '示例数据 · 等待 v0.10 Chrome 扩展或手填'
              : sourceLabel === 'extension'
                ? '由 Chrome 扩展自动喂入'
                : '由用户手填'
          }
        >
          {sourceLabel === 'extension'
            ? '🟢 扩展'
            : sourceLabel === 'manual'
              ? '✍️ 手填'
              : '📝 示例'}
        </span>
      </header>

      {/* 三平台 Tab */}
      <div
        role="tablist"
        aria-label="平台切换"
        className="flex items-center gap-1 border-b border-slate-200 px-4 pt-2 dark:border-slate-800"
      >
        {order.map((slug) => {
          const info = data[slug]?.info;
          if (!info) return null;
          const isActive = slug === active;
          return (
            <button
              key={slug}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-market-tab={slug}
              onClick={() => {
                setActive(slug);
                setShowInfo(false);
              }}
              className={clsx(
                'inline-flex items-center gap-1 rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'border-brand-600 text-brand-700 dark:text-brand-300'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              <span aria-hidden>{info.icon}</span>
              <span>{TABS_LABEL[slug]}</span>
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* 平台介绍折叠卡 */}
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300"
          aria-expanded={showInfo}
          data-market-info-toggle
        >
          <span className="flex items-center gap-2 min-w-0">
            <span aria-hidden>{cur.info.icon}</span>
            <span className="font-medium truncate">{cur.info.name}</span>
            <span className="text-slate-500 dark:text-slate-400 truncate">
              · {cur.info.tagline}
            </span>
          </span>
          {showInfo ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )}
        </button>

        {showInfo ? (
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            <ul className="space-y-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {cur.info.description.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1">
              {cur.info.categories.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                >
                  {c}
                </span>
              ))}
            </div>
            <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] leading-relaxed text-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
              <strong className="font-medium">推荐工作流：</strong>
              {cur.info.recommendedWorkflow}
            </div>
            <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <strong>数据来源：</strong>
              {cur.info.dataSource}
            </div>
          </div>
        ) : null}

        {/* KPI 行 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 gap-2">
          {kpiBlocks.map(({ point, placeholder }) => (
            <KpiBlock key={point.key} point={point} placeholder={placeholder} />
          ))}
        </div>

        {isPlaceholder ? (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            当前数据为示例占位 · 真实数据等 v0.10 Chrome 扩展接入后自动填充。
            也可以点右下「编辑数据」手动维护。
            <Link
              href="/docs/11-market-trends"
              className="ml-1 underline hover:text-amber-900 dark:hover:text-amber-200"
            >
              查看说明
            </Link>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
          <span>
            最近数据：
            {cur.latest ? (
              <>
                <span className="tabular-nums">{cur.latest.date}</span>
                {cur.latest.note ? <> · {cur.latest.note}</> : null}
              </>
            ) : (
              '— 暂无'
            )}
          </span>
          <button
            type="button"
            onClick={() => setEditing(active)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:text-slate-200 dark:hover:border-brand-500 dark:hover:text-brand-300"
            data-market-edit-button
          >
            <Pencil className="h-3 w-3" />
            编辑数据
          </button>
        </div>
      </div>

      {editing ? (
        <EditDataModal
          platform={editing}
          info={data[editing].info}
          initial={data[editing].latest}
          onClose={() => setEditing(null)}
          onSaved={() => setVersion((v) => v + 1)}
        />
      ) : null}
    </section>
  );
}
