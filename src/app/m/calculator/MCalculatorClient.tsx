'use client';

import { useMemo, useState } from 'react';
import { copyAll } from '@/lib/clipboard';
import { useToast } from '@/components/m/Toast';

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

export default function MCalculatorClient({ packages }: { packages: Pkg[] }) {
  const toast = useToast();
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

  const currentPkg = useMemo(
    () => packages.find((p) => p.category === category && p.tier === tier),
    [packages, category, tier],
  );
  const basePrice = customPrice
    ? parseFloat(customPrice)
    : currentPkg?.midPrice ?? 0;

  async function calc() {
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
      setTimeout(() => {
        document.getElementById('m-quote-result')?.scrollIntoView({
          behavior: 'smooth',
        });
      }, 50);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }

  async function copyMsg() {
    if (!result) return;
    const ok = await copyAll(result.message);
    toast.show(ok ? '已复制报价话术' : '复制失败', ok ? 'success' : 'error');
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
    toast.show(ok ? '已复制完整报价单' : '复制失败', ok ? 'success' : 'error');
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
        <Field label="类目">
          <select
            className="m-input"
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
          <div className="grid grid-cols-3 gap-2">
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
                    'rounded-lg border px-2 py-2.5 text-sm ' +
                    (tier === t
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-slate-700 border-slate-300') +
                    (!pkg ? ' opacity-40' : '')
                  }
                >
                  <div className="font-medium">{t}</div>
                  {pkg && (
                    <div className="text-[10px] opacity-80 mt-0.5">
                      {pkg.priceRange}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Field>
        {currentPkg && (
          <div className="text-xs text-slate-500 leading-relaxed bg-slate-50 rounded p-2">
            {currentPkg.name}：{currentPkg.description || '—'}
          </div>
        )}
        <Field label={`基础价（默认 ${currentPkg?.midPrice ?? 0} 元）`}>
          <input
            type="number"
            className="m-input"
            inputMode="decimal"
            value={customPrice}
            onChange={(e) => setCustomPrice(e.target.value)}
            placeholder={String(currentPkg?.midPrice ?? '')}
          />
        </Field>
        <Field label="加价项">
          <div className="space-y-1.5">
            <label className="flex items-center gap-3 p-2 rounded border border-slate-200">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                className="w-5 h-5"
              />
              <span className="flex-1 text-sm">急单 (+40%)</span>
              <span className="text-xs text-slate-400">
                +{Math.round(basePrice * 0.4)} 元
              </span>
            </label>
            <label className="flex items-center gap-3 p-2 rounded border border-slate-200">
              <input
                type="checkbox"
                checked={sourceFiles}
                onChange={(e) => setSourceFiles(e.target.checked)}
                className="w-5 h-5"
              />
              <span className="flex-1 text-sm">源文件 PSD/AI</span>
              <span className="text-xs text-slate-400">+50 元</span>
            </label>
            <label className="flex items-center gap-3 p-2 rounded border border-slate-200">
              <input
                type="checkbox"
                checked={commercialUse}
                onChange={(e) => setCommercialUse(e.target.checked)}
                className="w-5 h-5"
              />
              <span className="flex-1 text-sm">商用授权</span>
              <span className="text-xs text-slate-400">+100 元</span>
            </label>
          </div>
        </Field>
        <Field label="修改次数">
          <input
            type="number"
            className="m-input"
            inputMode="numeric"
            value={revisions}
            onChange={(e) => setRevisions(Number(e.target.value) || 3)}
          />
        </Field>
        <button
          onClick={calc}
          className="w-full rounded-lg bg-brand-600 text-white font-medium py-3 active:bg-brand-700"
        >
          💰 计算报价
        </button>
      </div>

      {result && (
        <>
          <div
            id="m-quote-result"
            className="rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white p-4"
          >
            <div className="text-xs opacity-80">总价</div>
            <div className="text-4xl font-bold mt-1">¥ {result.finalPrice}</div>
            <div className="text-xs opacity-80 mt-1">
              {result.category} · {result.tier} · {result.delivery}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={copyMsg}
              className="rounded-lg bg-emerald-600 text-white font-medium py-3 active:bg-emerald-700"
            >
              📋 复制话术
            </button>
            <button
              onClick={copyBreakdown}
              className="rounded-lg border border-slate-300 text-slate-700 font-medium py-3 active:bg-slate-50"
            >
              复制报价单
            </button>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-3">
            <h3 className="font-semibold text-sm mb-2">价格明细</h3>
            <div className="space-y-1.5 text-sm">
              {result.breakdown.map((b, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-slate-600">{b.label}</span>
                  <span className="font-mono">+{b.amount}</span>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-1.5 flex items-center justify-between font-semibold">
                <span>合计</span>
                <span className="text-brand-700">{result.finalPrice} 元</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-3">
            <h3 className="font-semibold text-sm mb-2">本次包含</h3>
            <ul className="space-y-1 text-sm">
              {result.scope.map((s, i) => (
                <li key={i} className="text-emerald-700">
                  ✓ {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-3">
            <h3 className="font-semibold text-sm mb-2">注意事项</h3>
            <ul className="space-y-1 text-sm">
              {result.notes.map((n, i) => (
                <li key={i} className="text-amber-700">
                  ⚠ {n}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">报价话术</h3>
              <button onClick={copyMsg} className="text-xs text-brand-600">
                复制
              </button>
            </div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded p-2.5">
              {result.message}
            </div>
          </div>
        </>
      )}
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
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
