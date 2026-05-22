'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORIES, PLATFORMS, PLATFORM_LABEL } from '@/lib/constants';
import { useToast } from '@/components/m/Toast';

interface Stats {
  weekImpressions: number;
  weekMessages: number;
  weekConsult: number;
  weekOrders: number;
  weekRevenue: number;
}

interface MetricRow {
  id: string;
  platform: string;
  date: string;
  title: string;
  category: string;
  impressions: number;
  messages: number;
  consultations: number;
  orders: number;
  revenue: number;
  subscriptionLeads: number;
  notes: string;
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

export default function MAnalyticsClient({
  stats,
  list,
}: {
  stats: Stats;
  list: MetricRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(1); // 1基础 2流量 3互动 4成交
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch('/api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      toast.show('已记录', 'success');
      setForm({ ...EMPTY_FORM, date: form.date, platform: form.platform });
      setShowForm(false);
      setStep(1);
      router.refresh();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!confirm('删除此条数据？')) return;
    const res = await fetch(`/api/metrics/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      toast.show(j.error || '删除失败', 'error');
      return;
    }
    toast.show('已删除', 'success');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {/* 本周统计 */}
      <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white p-4">
        <div className="text-xs opacity-80">本周数据</div>
        <div className="grid grid-cols-3 gap-2 mt-2 text-center">
          <Stat label="曝光" value={stats.weekImpressions} />
          <Stat label="私信" value={stats.weekMessages} />
          <Stat label="咨询" value={stats.weekConsult} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 text-center">
          <Stat label="成交" value={stats.weekOrders} />
          <Stat label="金额" value={stats.weekRevenue} suffix="元" />
        </div>
      </div>

      <button
        onClick={() => {
          setShowForm(true);
          setStep(1);
        }}
        className="w-full rounded-lg bg-brand-600 text-white font-medium py-3 active:bg-brand-700"
      >
        ➕ 录入数据
      </button>

      <div className="text-xs text-slate-500 px-1">最近记录</div>

      {list.map((m) => (
        <div
          key={m.id}
          className="rounded-xl bg-white border border-slate-200 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={
                  m.platform === 'xiaohongshu' ? 'badge-red' : 'badge-yellow'
                }
              >
                {PLATFORM_LABEL[m.platform]}
              </span>
              <span className="badge-gray">{m.category || '-'}</span>
              <span className="text-xs text-slate-400">{m.date}</span>
            </div>
            <button
              onClick={() => del(m.id)}
              className="text-xs text-red-600"
            >
              删除
            </button>
          </div>
          {m.title && (
            <div className="mt-1 text-sm text-slate-800 truncate">
              {m.title}
            </div>
          )}
          <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
            <Mini label="曝光" v={m.impressions} />
            <Mini label="私信" v={m.messages} />
            <Mini label="咨询" v={m.consultations} />
            <Mini label="成交" v={m.orders} />
          </div>
          {(m.revenue > 0 || m.subscriptionLeads > 0) && (
            <div className="mt-1 text-xs text-slate-500 flex items-center gap-3">
              {m.revenue > 0 && <span>💰 {Math.round(m.revenue)}元</span>}
              {m.subscriptionLeads > 0 && (
                <span>📅 包月线索 {m.subscriptionLeads}</span>
              )}
            </div>
          )}
        </div>
      ))}

      {list.length === 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-400">
          暂无数据，点上方录入
        </div>
      )}

      {/* 录入弹窗（4 步骤向导）*/}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
          <div className="bg-white rounded-t-2xl w-full max-h-[92vh] flex flex-col">
            {/* 步骤指示 */}
            <div className="px-4 pt-4 pb-2 flex items-center gap-1">
              {['基础', '流量', '互动', '成交'].map((label, i) => {
                const n = i + 1;
                const active = step >= n;
                return (
                  <div key={n} className="flex-1 flex items-center gap-1">
                    <div
                      className={
                        'flex-1 h-1 rounded-full ' +
                        (active ? 'bg-brand-600' : 'bg-slate-200')
                      }
                    />
                    <span
                      className={
                        'text-xs ' +
                        (active ? 'text-slate-800' : 'text-slate-400')
                      }
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-3 flex-1 overflow-y-auto space-y-3">
              {step === 1 && (
                <>
                  <h3 className="font-semibold">第 1 步：基础信息</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="平台">
                      <select
                        className="m-input"
                        value={form.platform}
                        onChange={(e) => up('platform', e.target.value)}
                      >
                        {PLATFORMS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="日期">
                      <input
                        type="date"
                        className="m-input"
                        value={form.date}
                        onChange={(e) => up('date', e.target.value)}
                      />
                    </Field>
                  </div>
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
                  <Field label="标题">
                    <input
                      className="m-input"
                      value={form.title}
                      onChange={(e) => up('title', e.target.value)}
                      placeholder="对应笔记或商品"
                    />
                  </Field>
                </>
              )}

              {step === 2 && (
                <>
                  <h3 className="font-semibold">第 2 步：流量数据</h3>
                  <NumField label="曝光" k="impressions" form={form} up={up} />
                  <NumField label="点击" k="clicks" form={form} up={up} />
                  <NumField label="闲鱼浏览" k="views" form={form} up={up} />
                </>
              )}

              {step === 3 && (
                <>
                  <h3 className="font-semibold">第 3 步：互动数据</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <NumField label="点赞" k="likes" form={form} up={up} />
                    <NumField label="收藏" k="favorites" form={form} up={up} />
                    <NumField label="评论" k="comments" form={form} up={up} />
                    <NumField label="私信" k="messages" form={form} up={up} />
                  </div>
                  <NumField label="咨询" k="consultations" form={form} up={up} />
                </>
              )}

              {step === 4 && (
                <>
                  <h3 className="font-semibold">第 4 步：成交数据</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <NumField label="成交单数" k="orders" form={form} up={up} />
                    <NumField
                      label="成交金额"
                      k="revenue"
                      form={form}
                      up={up}
                      suffix="元"
                    />
                  </div>
                  <NumField
                    label="客单价"
                    k="averageOrderValue"
                    form={form}
                    up={up}
                    suffix="元"
                  />
                  <NumField
                    label="包月线索"
                    k="subscriptionLeads"
                    form={form}
                    up={up}
                  />
                  <Field label="备注">
                    <textarea
                      className="m-input min-h-[60px]"
                      value={form.notes}
                      onChange={(e) => up('notes', e.target.value)}
                    />
                  </Field>
                </>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 grid grid-cols-2 gap-2">
              {step > 1 ? (
                <button
                  onClick={() => setStep((s) => (s - 1) as any)}
                  className="rounded-lg border border-slate-300 text-slate-700 font-medium py-3"
                >
                  ← 上一步
                </button>
              ) : (
                <button
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-300 text-slate-700 font-medium py-3"
                >
                  取消
                </button>
              )}
              {step < 4 ? (
                <button
                  onClick={() => setStep((s) => (s + 1) as any)}
                  className="rounded-lg bg-brand-600 text-white font-medium py-3"
                >
                  下一步 →
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 text-white font-medium py-3 disabled:opacity-60"
                >
                  {saving ? '保存中...' : '✓ 保存'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-base font-semibold mt-0.5">
        {value}
        {suffix && <span className="text-xs ml-0.5">{suffix}</span>}
      </div>
    </div>
  );
}

function Mini({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="text-slate-400">{label}</div>
      <div className="font-semibold text-slate-800">{v}</div>
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

function NumField({
  label,
  k,
  form,
  up,
  suffix,
}: {
  label: string;
  k: keyof FormState;
  form: FormState;
  up: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  suffix?: string;
}) {
  return (
    <Field label={suffix ? `${label}（${suffix}）` : label}>
      <input
        type="number"
        inputMode="decimal"
        className="m-input"
        value={form[k] as string}
        onChange={(e) => up(k, e.target.value as any)}
      />
    </Field>
  );
}
