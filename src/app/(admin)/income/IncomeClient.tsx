'use client';

/**
 * v0.16-H3.3 · /income · 接单收入引擎
 *
 * 功能区:
 *  - 上方: KPI 行 (总询价/总成交/总到账/胜率)
 *  - 中间: 漏斗 + 时序图 + 下月预测
 *  - 下方: 报价表格 (含状态切换 + 删除)
 *  - 右侧: 客户聚类卡片 + 报价建议器
 */

import { useEffect, useState, useMemo } from 'react';
import { Loader2, Plus, TrendingUp, Users, DollarSign, Target, Trash2, X, AlertCircle } from 'lucide-react';
import { toast } from '@/lib/toast';

const CATEGORIES = ['Logo', 'VI品牌', '电商主图', '详情页', '海报', '菜单', 'PPT', '作品集', '包装', '门店视觉', '包月合作'];
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  negotiating: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  won: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  lost: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  cancelled: 'bg-slate-100 dark:bg-slate-800 text-slate-500',
};
const STATUS_LABEL: Record<string, string> = {
  pending: '待跟进', negotiating: '谈判中', won: '已成交', lost: '已丢单', cancelled: '已取消',
};

interface Quote {
  id: string;
  clientName: string;
  category: string;
  difficulty?: number;
  items: { name: string; qty: number; unitPrice: number }[];
  total: number;
  discount?: number;
  finalPrice: number;
  status: string;
  notes?: string;
  createdAt: string;
  wonAt?: string;
}

interface Analytics {
  funnel: { pending: number; negotiating: number; won: number; lost: number; cancelled: number; total: number };
  winRate: number;
  categoryStats: { category: string; inquiries: number; signed: number; winRate: number; avgWonPrice: number; revenue: number; minPrice: number; maxPrice: number }[];
  weekly: { weekStart: string; gmv: number; signed: number; inquired: number }[];
  clusters: { label: string; desc: string; memberCount: number; members: { name: string; signRate: number; signed: number; revenue: number; repurchase: number }[] }[];
  summary: { quoteCount: number; clientCount: number; totalContractValue: number; totalReceived: number; receivableBalance: number };
}

interface Forecast {
  forecast: { predictedGmv: number; lower: number; upper: number; confidence: number; basis: string };
}

export default function IncomeClient() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const [q, a, f] = await Promise.all([
        fetch('/api/income/quotes').then((r) => r.json()),
        fetch('/api/income/analytics').then((r) => r.json()),
        fetch('/api/income/forecast').then((r) => r.json()),
      ]);
      if (q.ok) setQuotes(q.list);
      if (a.ok) setAnalytics(a);
      if (f.ok) setForecast(f);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function changeStatus(q: Quote, status: string) {
    try {
      const r = await fetch(`/api/income/quotes/${q.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success('状态已更新');
      reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function recordIncome(q: Quote) {
    const amt = prompt(`记录到账金额（默认 ${q.finalPrice}）:`, String(q.finalPrice));
    if (amt === null) return;
    const amount = Number(amt);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('金额无效');
      return;
    }
    try {
      const r = await fetch(`/api/income/quotes/${q.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'won', incomeAmount: amount }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success('已记到账');
      reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function deleteQuote(q: Quote) {
    if (!confirm(`删除 ${q.clientName} 的 ${q.category} 报价？`)) return;
    try {
      const r = await fetch(`/api/income/quotes/${q.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('失败');
      toast.success('已删除');
      reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-4">
      <header className="command-panel p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-950">
              <DollarSign size={20} />
            </span>
            <div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-bold text-cyan-200">
                <span className="pulse-dot" aria-hidden />
                Business Cockpit
              </div>
              <h1 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">接单收入引擎</h1>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} className="command-rail btn-primary bg-white text-slate-950 hover:bg-slate-200 inline-flex items-center gap-1 text-xs">
            <Plus size={14} /> 新报价
          </button>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
          报价管理 + 漏斗分析 + GMV 预测 + 客户聚类 + 同类报价建议
        </p>
      </header>

      {loading && <div className="command-empty py-12"><Loader2 className="animate-spin inline mr-2" />加载中...</div>}

      {!loading && analytics && (
        <>
          {/* KPI 行 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI icon={<Target size={14} />} label="总报价" value={analytics.summary.quoteCount} />
            <KPI icon={<TrendingUp size={14} />} label="已成交" value={analytics.funnel.won} accent="emerald" subtext={`胜率 ${(analytics.winRate * 100).toFixed(0)}%`} />
            <KPI icon={<DollarSign size={14} />} label="合同总额" value={`¥${analytics.summary.totalContractValue.toLocaleString()}`} accent="brand" />
            <KPI icon={<Users size={14} />} label="客户数" value={analytics.summary.clientCount} />
          </div>

          {/* 漏斗 + 预测 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="command-glass p-4 lg:col-span-2">
              <h3 className="mb-3 text-sm font-bold text-slate-950 dark:text-white">接单漏斗</h3>
              <div className="space-y-2">
                {[
                  { key: 'pending', label: '待跟进', value: analytics.funnel.pending },
                  { key: 'negotiating', label: '谈判中', value: analytics.funnel.negotiating },
                  { key: 'won', label: '已成交', value: analytics.funnel.won },
                  { key: 'lost', label: '已丢单', value: analytics.funnel.lost },
                ].map((s) => {
                  const max = Math.max(analytics.funnel.total, 1);
                  const pct = (s.value / max) * 100;
                  return (
                    <div key={s.key} className="flex items-center gap-3 text-sm">
                      <span className="w-16 text-xs text-slate-600 dark:text-slate-400">{s.label}</span>
                      <div className="h-7 flex-1 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                        <div className={`h-full ${s.key === 'won' ? 'bg-emerald-400' : s.key === 'lost' ? 'bg-red-400' : 'bg-brand-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-16 text-right font-mono text-xs">{s.value} ({pct.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="command-glass p-4">
              <h3 className="mb-3 text-sm font-bold text-slate-950 dark:text-white">下月 GMV 预测</h3>
              {forecast?.forecast && (
                <>
                  <div className="text-2xl font-bold bg-gradient-to-r from-brand-500 to-emerald-500 bg-clip-text text-transparent mb-1">
                    ¥{forecast.forecast.predictedGmv.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500">
                    区间: ¥{forecast.forecast.lower.toLocaleString()} - ¥{forecast.forecast.upper.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    置信度 {(forecast.forecast.confidence * 100).toFixed(0)}% · {forecast.forecast.basis}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 报价建议器 + 客户聚类 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <QuoteRecommender />
            <div className="command-glass p-4">
              <h3 className="mb-3 text-sm font-bold text-slate-950 dark:text-white">客户群体</h3>
              <div className="space-y-3">
                {analytics.clusters.map((c, i) => (
                  <div key={i} className="border-l-4 border-brand-300 dark:border-brand-700 pl-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{c.label}</span>
                      <span className="text-xs text-slate-400">({c.memberCount} 人)</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{c.desc}</div>
                    {c.members.slice(0, 3).map((m) => (
                      <div key={m.name} className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        · {m.name} · 成交 {m.signed} 单 ¥{m.revenue}
                      </div>
                    ))}
                    {c.members.length > 3 && <div className="text-[10px] text-slate-400 mt-0.5">还有 {c.members.length - 3} 个…</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* category 胜率 */}
          {analytics.categoryStats.length > 0 && (
            <div className="command-glass p-4">
              <h3 className="mb-3 text-sm font-bold text-slate-950 dark:text-white">品类表现</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                {analytics.categoryStats.map((s) => (
                    <div key={s.category} className="rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-950/60">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{s.category}</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">¥{s.revenue}</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {s.inquiries} 报价 · 胜率 {(s.winRate * 100).toFixed(0)}% · 均价 ¥{s.avgWonPrice}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 报价列表 */}
          <div className="command-glass p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-950 dark:text-white">报价列表 ({quotes.length})</h3>
            {quotes.length === 0 ? (
              <div className="command-empty py-12">
                <AlertCircle size={32} className="mx-auto mb-2 opacity-40" />
                还没有报价，点击右上角“新报价”开始
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table command-table w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left py-2 font-medium">客户</th>
                      <th className="text-left py-2 font-medium">品类</th>
                      <th className="text-right py-2 font-medium">总价</th>
                      <th className="text-center py-2 font-medium">状态</th>
                      <th className="text-left py-2 font-medium">日期</th>
                      <th className="text-right py-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr key={q.id}>
                        <td className="py-2">{q.clientName}</td>
                        <td className="py-2">{q.category}{q.difficulty ? <span className="text-slate-400 ml-1">· 难度 {q.difficulty}</span> : null}</td>
                        <td className="py-2 text-right font-mono">¥{q.finalPrice.toLocaleString()}</td>
                        <td className="py-2 text-center">
                          <select
                            value={q.status}
                            onChange={(e) => changeStatus(q, e.target.value)}
                            className={`text-[10px] px-1.5 py-0.5 rounded border-0 outline-none cursor-pointer ${STATUS_COLOR[q.status]}`}
                          >
                            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </td>
                        <td className="py-2 text-slate-500">{new Date(q.createdAt).toLocaleDateString('zh-CN')}</td>
                        <td className="py-2 text-right">
                          {q.status === 'won' && (
                            <button onClick={() => recordIncome(q)} className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline mr-2">记到账</button>
                          )}
                          <button onClick={() => deleteQuote(q)} className="text-slate-400 hover:text-red-500">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {showCreate && <CreateQuoteModal onClose={() => setShowCreate(false)} onCreated={reload} />}
    </div>
  );
}

function KPI({ icon, label, value, accent, subtext }: { icon: React.ReactNode; label: string; value: number | string; accent?: 'brand' | 'emerald'; subtext?: string }) {
  const accentClass = accent === 'emerald' ? 'from-emerald-400 to-emerald-600' : accent === 'brand' ? 'from-brand-400 to-brand-600' : 'from-slate-500 to-slate-700';
  return (
    <div className="command-stat-card">
      <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-1">{icon}{label}</div>
      <div className={`text-xl font-bold bg-gradient-to-r ${accentClass} bg-clip-text text-transparent`}>{value}</div>
      {subtext && <div className="text-[10px] text-slate-500">{subtext}</div>}
    </div>
  );
}

function QuoteRecommender() {
  const [category, setCategory] = useState('Logo');
  const [difficulty, setDifficulty] = useState<number>(3);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function ask() {
    setBusy(true);
    try {
      const r = await fetch('/api/income/quote-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, difficulty }),
      });
      const j = await r.json();
      setResult(j);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="command-glass p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-950 dark:text-white">同类报价建议</h3>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <select className="input text-xs" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input text-xs" value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>难度 {n}</option>)}
        </select>
      </div>
      <button onClick={ask} disabled={busy} className="btn-primary w-full text-xs inline-flex items-center justify-center gap-1">
        {busy ? <Loader2 size={12} className="animate-spin" /> : null}
        基于历史给建议
      </button>

      {result && (
        <div className="mt-3 text-xs space-y-1">
          {result.suggestedRange ? (
            <>
              <div className="font-mono text-base">
                <span className="text-slate-500">建议区间</span>{' '}
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">¥{result.suggestedRange.low}</span>
                <span className="text-slate-400">-</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">¥{result.suggestedRange.high}</span>
                <span className="text-slate-500"> 中位 ¥{result.suggestedRange.mid}</span>
              </div>
              <div className="text-slate-500">基于 {result.sampleCount} 单历史 · 成交率 {(result.winRate * 100).toFixed(0)}%</div>
              {result.similarQuotes && result.similarQuotes.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
                  {result.similarQuotes.slice(0, 3).map((q: any) => (
                    <div key={q.id} className="text-[10px] text-slate-500">
                      · {q.clientName}: ¥{q.finalPrice} ({new Date(q.createdAt).toLocaleDateString('zh-CN')})
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-slate-500">{result.message || '暂无建议'}</div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateQuoteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [clientName, setClientName] = useState('');
  const [category, setCategory] = useState('Logo');
  const [difficulty, setDifficulty] = useState<number>(3);
  const [items, setItems] = useState([{ name: '主项目', qty: 1, unitPrice: 1000 }]);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const total = useMemo(() => items.reduce((acc, it) => acc + it.qty * it.unitPrice, 0), [items]);
  const finalPrice = Math.round(total * (1 - discount));

  async function save() {
    if (!clientName.trim()) { toast.error('请填客户名'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/income/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, category, difficulty, items, discount, notes }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success('报价已保存');
      onCreated();
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="command-glass max-h-[90vh] w-full max-w-lg overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="page-kicker">Quote Intake</div>
            <h3 className="mt-1 text-base font-bold text-slate-950 dark:text-white">新建报价</h3>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-slate-500">客户名</label>
            <input className="input mt-1 w-full" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="王先生 / 某某品牌" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500">品类</label>
              <select className="input mt-1 w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">难度 1-5</label>
              <select className="input mt-1 w-full" value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500">条目</label>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mt-1">
                <input className="input col-span-6" value={it.name} placeholder="项目" onChange={(e) => {
                  const n = [...items]; n[i] = { ...it, name: e.target.value }; setItems(n);
                }} />
                <input type="number" className="input col-span-2" value={it.qty} onChange={(e) => {
                  const n = [...items]; n[i] = { ...it, qty: Number(e.target.value) }; setItems(n);
                }} />
                <input type="number" className="input col-span-3" value={it.unitPrice} onChange={(e) => {
                  const n = [...items]; n[i] = { ...it, unitPrice: Number(e.target.value) }; setItems(n);
                }} />
                <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="col-span-1 text-slate-400 hover:text-red-500" disabled={items.length === 1}>
                  <X size={14} />
                </button>
              </div>
            ))}
          <button onClick={() => setItems([...items, { name: '', qty: 1, unitPrice: 0 }])} className="mt-2 text-xs font-semibold text-cyan-700 hover:underline dark:text-cyan-300">加一条</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500">折扣 0-1 (0.1 = 9 折)</label>
              <input type="number" step="0.05" min="0" max="1" className="input mt-1 w-full" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 mt-1">总价</div>
              <div className="font-mono font-bold text-base">¥{finalPrice.toLocaleString()}</div>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500">备注</label>
            <textarea className="input mt-1 w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-xs">取消</button>
          <button onClick={save} disabled={busy} className="btn-primary text-xs inline-flex items-center gap-1">
            {busy ? <Loader2 size={12} className="animate-spin" /> : null}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
