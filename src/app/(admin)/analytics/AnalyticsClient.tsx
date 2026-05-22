'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORIES, PLATFORMS, PLATFORM_LABEL } from '@/lib/constants';

interface MetricRow {
  id: string;
  platform: string;
  date: string;
  title: string;
  category: string;
  impressions: number;
  clicks: number;
  likes: number;
  favorites: number;
  comments: number;
  messages: number;
  views: number;
  consultations: number;
  orders: number;
  revenue: number;
  averageOrderValue: number;
  subscriptionLeads: number;
  notes: string;
}

interface Stats {
  weekImpressions: number;
  weekMessages: number;
  weekConsult: number;
  weekOrders: number;
  weekRevenue: number;
}

interface Props {
  stats: Stats;
  categoryRank: { category: string; revenue: number; orders: number; impressions: number }[];
  byPlatform: Record<string, { revenue: number; orders: number; impressions: number; messages: number }>;
  topTitles: { id: string; title: string; platform: string; orders: number; revenue: number }[];
  lowTitles: { id: string; title: string; platform: string; orders: number; revenue: number }[];
  list: MetricRow[];
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  platform: 'xiaohongshu',
  date: todayStr(),
  title: '',
  category: 'Logo',
  impressions: '',
  clicks: '',
  likes: '',
  favorites: '',
  comments: '',
  messages: '',
  views: '',
  consultations: '',
  orders: '',
  revenue: '',
  averageOrderValue: '',
  subscriptionLeads: '',
  notes: '',
};

type FormState = typeof EMPTY_FORM;

export default function AnalyticsClient({
  stats,
  categoryRank,
  byPlatform,
  topTitles,
  lowTitles,
  list,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      setForm({ ...EMPTY_FORM, date: form.date, platform: form.platform });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!confirm('确定删除该条数据？')) return;
    const res = await fetch(`/api/metrics/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      alert(j.error || '删除失败');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="本周总曝光" value={stats.weekImpressions} />
        <Stat label="本周私信" value={stats.weekMessages} />
        <Stat label="本周咨询" value={stats.weekConsult} />
        <Stat label="本周成交" value={stats.weekOrders} />
        <Stat label="本周成交金额" value={stats.weekRevenue} suffix="元" tone="green" />
      </div>

      {/* 录入 + 列表 */}
      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <form onSubmit={submit} className="card h-fit">
          <div className="card-header">
            <h2 className="font-semibold">录入数据</h2>
          </div>
          <div className="card-body grid grid-cols-2 gap-3">
            <div>
              <label className="label">平台</label>
              <select
                className="input"
                value={form.platform}
                onChange={(e) => up('platform', e.target.value)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">日期</label>
              <input
                type="date"
                className="input"
                value={form.date}
                onChange={(e) => up('date', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="label">标题</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => up('title', e.target.value)}
                placeholder="对应笔记或商品标题"
              />
            </div>
            <div className="col-span-2">
              <label className="label">类目</label>
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
            </div>
            <NumField label="曝光" k="impressions" form={form} up={up} />
            <NumField label="点击" k="clicks" form={form} up={up} />
            <NumField label="点赞" k="likes" form={form} up={up} />
            <NumField label="收藏" k="favorites" form={form} up={up} />
            <NumField label="评论" k="comments" form={form} up={up} />
            <NumField label="私信" k="messages" form={form} up={up} />
            <NumField label="闲鱼浏览" k="views" form={form} up={up} />
            <NumField label="咨询" k="consultations" form={form} up={up} />
            <NumField label="成交" k="orders" form={form} up={up} />
            <NumField label="成交金额(元)" k="revenue" form={form} up={up} />
            <NumField label="客单价(元)" k="averageOrderValue" form={form} up={up} />
            <NumField label="包月线索" k="subscriptionLeads" form={form} up={up} />
            <div className="col-span-2">
              <label className="label">备注</label>
              <textarea
                className="input min-h-[60px]"
                value={form.notes}
                onChange={(e) => up('notes', e.target.value)}
              />
            </div>
            {error && (
              <div className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </div>
            )}
            <div className="col-span-2">
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? '保存中...' : '保存数据'}
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-4">
          {/* 平台对比 */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold">平台表现对比（近30天）</h2>
            </div>
            <div className="card-body">
              <table className="table">
                <thead>
                  <tr>
                    <th>平台</th>
                    <th>曝光</th>
                    <th>私信</th>
                    <th>成交</th>
                    <th>成交金额</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byPlatform).map(([p, v]) => (
                    <tr key={p}>
                      <td>{PLATFORM_LABEL[p] ?? p}</td>
                      <td>{v.impressions}</td>
                      <td>{v.messages}</td>
                      <td>{v.orders}</td>
                      <td>{Math.round(v.revenue)}元</td>
                    </tr>
                  ))}
                  {Object.keys(byPlatform).length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-slate-400 py-4">
                        暂无数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 类目排行 */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold">类目表现排行（近30天）</h2>
            </div>
            <div className="card-body">
              <table className="table">
                <thead>
                  <tr>
                    <th>类目</th>
                    <th>成交金额</th>
                    <th>成交数</th>
                    <th>曝光</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRank.map((c) => (
                    <tr key={c.category}>
                      <td>{c.category}</td>
                      <td>{Math.round(c.revenue)}元</td>
                      <td>{c.orders}</td>
                      <td>{c.impressions}</td>
                    </tr>
                  ))}
                  {categoryRank.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-slate-400 py-4">
                        暂无数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 高低表现 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TitleList title="高表现内容" rows={topTitles} tone="green" />
            <TitleList title="低表现内容" rows={lowTitles} tone="red" />
          </div>
        </div>
      </div>

      {/* 数据列表 */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="font-semibold">最近数据记录</h2>
          <span className="text-xs text-slate-500">显示最新 200 条</span>
        </div>
        <div className="card-body overflow-x-auto">
          <table className="table min-w-[1000px]">
            <thead>
              <tr>
                <th>日期</th>
                <th>平台</th>
                <th>类目</th>
                <th>标题</th>
                <th>曝光</th>
                <th>私信</th>
                <th>咨询</th>
                <th>成交</th>
                <th>金额</th>
                <th>包月线索</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td>{m.date}</td>
                  <td>{PLATFORM_LABEL[m.platform] ?? m.platform}</td>
                  <td>{m.category}</td>
                  <td className="max-w-[260px] truncate" title={m.title}>
                    {m.title}
                  </td>
                  <td>{m.impressions}</td>
                  <td>{m.messages}</td>
                  <td>{m.consultations}</td>
                  <td>{m.orders}</td>
                  <td>{Math.round(m.revenue)}</td>
                  <td>{m.subscriptionLeads}</td>
                  <td className="text-right">
                    <button
                      onClick={() => del(m.id)}
                      className="text-red-600 hover:underline text-xs"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-slate-400 py-6">
                    暂无数据，先在左侧录入第一条
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  tone = 'gray',
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: 'gray' | 'green';
}) {
  return (
    <div className="rounded-md bg-white border border-slate-200 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`text-2xl font-semibold mt-1 ${
          tone === 'green' ? 'text-emerald-600' : 'text-slate-700'
        }`}
      >
        {value}
        {suffix && <span className="text-sm ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

function NumField({
  label,
  k,
  form,
  up,
}: {
  label: string;
  k: keyof FormState;
  form: FormState;
  up: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        className="input"
        value={form[k] as string}
        onChange={(e) => up(k, e.target.value as any)}
      />
    </div>
  );
}

function TitleList({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { title: string; platform: string; orders: number; revenue: number }[];
  tone: 'green' | 'red';
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="card-body">
        <ol className="list-decimal pl-5 space-y-1 text-sm">
          {rows.map((r, i) => (
            <li key={i}>
              <span className={tone === 'green' ? 'text-emerald-700' : 'text-red-700'}>
                {r.title}
              </span>
              <span className="ml-2 text-xs text-slate-400">
                {PLATFORM_LABEL[r.platform] ?? r.platform} · 成交 {r.orders} ·{' '}
                {Math.round(r.revenue)}元
              </span>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="list-none text-slate-400 text-sm">暂无数据</li>
          )}
        </ol>
      </div>
    </div>
  );
}
