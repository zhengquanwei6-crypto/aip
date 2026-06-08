'use client';

import { useMemo, useState } from 'react';
import { copyAll } from '@/lib/clipboard';
import { Calculator, Check, Copy, FileText, AlertTriangle } from 'lucide-react';

interface Pkg {
  id: string;
  category: string;
  tier: string;
  name: string;
  priceRange: string;
  midPrice: number;
  description: string;
}

interface QuoteResult {
  category: string;
  tier: string;
  basePrice: number;
  finalPrice: number;
  breakdown: { label: string; amount: number }[];
  delivery: string;
  scope: string[];
  notes: string[];
  message: string;
}

const TIER_BADGE: Record<string, string> = {
  引流款: 'badge-gray',
  标准款: 'badge-blue',
  利润款: 'badge-green',
};

export default function CalculatorClient({ packages }: { packages: Pkg[] }) {
  const categories = useMemo(
    () => Array.from(new Set(packages.map((p) => p.category))),
    [packages],
  );
  const [category, setCategory] = useState(categories[0] ?? '');
  const [tier, setTier] = useState('标准款');
  const [urgent, setUrgent] = useState(false);
  const [sourceFiles, setSourceFiles] = useState(false);
  const [commercialUse, setCommercialUse] = useState(false);
  const [revisions, setRevisions] = useState(3);
  const [customPrice, setCustomPrice] = useState<string>('');
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 找当前选中的套餐
  const currentPkg = useMemo(
    () => packages.find((p) => p.category === category && p.tier === tier),
    [packages, category, tier],
  );

  const basePrice = customPrice
    ? parseFloat(customPrice)
    : currentPkg?.midPrice ?? 0;

  async function calc() {
    setMsg(null);
    try {
      const res = await fetch('/api/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          tier,
          basePrice,
          urgent,
          sourceFiles,
          commercialUse,
          revisions,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '计算失败');
      setResult(j.result);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function copyMessage() {
    if (!result) return;
    const ok = await copyAll(result.message);
    setMsg(ok ? '已复制报价话术' : '复制失败');
    setTimeout(() => setMsg(null), 2000);
  }

  async function copyBreakdown() {
    if (!result) return;
    const lines: string[] = [];
    lines.push(`报价 · ${result.category} · ${result.tier}`);
    lines.push('───');
    for (const b of result.breakdown) lines.push(`${b.label}: ${b.amount} 元`);
    lines.push(`总价：${result.finalPrice} 元`);
    lines.push('');
    lines.push(`交付：${result.delivery}`);
    lines.push(`包含：${result.scope.join('、')}`);
    if (result.notes.length) {
      lines.push('注意：');
      result.notes.forEach((n) => lines.push(`· ${n}`));
    }
    const ok = await copyAll(lines.join('\n'));
    setMsg(ok ? '已复制完整报价单' : '复制失败');
    setTimeout(() => setMsg(null), 2000);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
      {/* 输入 */}
      <div className="command-glass h-fit">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
          <Calculator size={16} className="text-cyan-500" aria-hidden />
          <h2 className="font-semibold">报价参数</h2>
        </div>
        <div className="space-y-3 p-4 sm:p-5">
          <Field label="类目">
            <select
              className="input command-input"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setCustomPrice('');
              }}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="档位">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {['引流款', '标准款', '利润款'].map((t) => {
                const pkg = packages.find(
                  (p) => p.category === category && p.tier === t,
                );
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTier(t);
                      setCustomPrice('');
                    }}
                    disabled={!pkg}
                    className={
                      'rounded-lg border px-3 py-2 text-sm font-semibold transition-all ' +
                      (tier === t
                        ? 'border-slate-950 bg-slate-950 text-white shadow-[0_0_24px_rgba(34,211,238,0.18)] dark:border-white dark:bg-white dark:text-slate-950'
                        : 'border-slate-200 bg-white/70 text-slate-700 hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:border-cyan-800') +
                      (!pkg ? ' opacity-40 cursor-not-allowed' : '')
                    }
                  >
                    <div>{t}</div>
                    {pkg && (
                      <div className="text-xs opacity-80 mt-0.5">
                        {pkg.priceRange}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Field>
          {currentPkg && (
            <div className="rounded-lg border border-slate-200 bg-white/60 p-3 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-950/60">
              {currentPkg.name}：{currentPkg.description || '—'}
            </div>
          )}
          <Field label={`基础价（默认中位 ${currentPkg?.midPrice ?? 0} 元，可手动调整）`}>
            <input
              type="number"
              className="input command-input"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              placeholder={String(currentPkg?.midPrice ?? '')}
            />
          </Field>
          <Field label="加价项">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={urgent}
                  onChange={(e) => setUrgent(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>急单 (+40%)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={sourceFiles}
                  onChange={(e) => setSourceFiles(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>源文件 PSD/AI (+50 元)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={commercialUse}
                  onChange={(e) => setCommercialUse(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>商用授权 (+100 元)</span>
              </label>
            </div>
          </Field>
          <Field label="修改次数">
            <input
              type="number"
              className="input command-input"
              min={1}
              max={20}
              value={revisions}
              onChange={(e) => setRevisions(Number(e.target.value) || 3)}
            />
          </Field>
          <button onClick={calc} className="btn-primary inline-flex w-full items-center justify-center gap-2">
            <Calculator size={16} />
            💰 计算报价
          </button>
          {msg && (
            <div className="text-xs text-emerald-600 text-center">{msg}</div>
          )}
        </div>
      </div>

      {/* 结果 */}
      <div className="space-y-4">
        {!result && (
          <div className="command-glass">
            <div className="px-4 py-14 text-center text-sm text-slate-400 sm:px-5">
              填写左侧参数，点击计算
            </div>
          </div>
        )}
        {result && (
          <>
            <div className="command-glass border-cyan-300/60 bg-cyan-50/70 dark:bg-cyan-950/20">
              <div className="flex items-center justify-between gap-3 p-4 sm:p-5">
                <div>
                  <div className="text-xs text-brand-700">总价</div>
                  <div className="text-3xl font-bold text-brand-700 mt-0.5">
                    ¥ {result.finalPrice}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {result.category} · {result.tier} · {result.delivery}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={copyMessage}
                    className="btn-primary inline-flex items-center justify-center gap-2 text-sm"
                  >
                    <Copy size={14} />
                    复制报价话术
                  </button>
                  <button
                    onClick={copyBreakdown}
                    className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
                  >
                    <FileText size={14} />
                    复制完整报价单
                  </button>
                </div>
              </div>
            </div>

            <div className="command-glass">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
                <h3 className="font-semibold">价格明细</h3>
              </div>
              <div className="overflow-x-auto p-4 sm:p-5">
                <table className="table command-table">
                  <tbody>
                    {result.breakdown.map((b, i) => (
                      <tr key={i}>
                        <td>{b.label}</td>
                        <td className="text-right font-mono">
                          + {b.amount} 元
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td>合计</td>
                      <td className="text-right font-mono text-brand-700">
                        {result.finalPrice} 元
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="command-glass">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
                  <h3 className="font-semibold">本次包含</h3>
                </div>
                <div className="p-4 sm:p-5">
                  <ul className="space-y-1 text-sm">
                    {result.scope.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-emerald-700">
                        <Check size={14} className="mt-0.5 shrink-0" aria-hidden />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="command-glass">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
                  <h3 className="font-semibold">注意事项</h3>
                </div>
                <div className="p-4 sm:p-5">
                  <ul className="space-y-1 text-sm">
                    {result.notes.map((n, i) => (
                      <li key={i} className="flex items-start gap-2 text-amber-700">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="command-glass">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
                <h3 className="font-semibold">报价话术</h3>
                <button
                  onClick={copyMessage}
                  className="btn-secondary h-8 text-xs"
                >
                  复制
                </button>
              </div>
              <div className="p-4 sm:p-5">
                <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white/70 p-3 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
                  {result.message}
                </div>
              </div>
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
