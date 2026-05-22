'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PLATFORMS,
  CATEGORIES,
  CONTENT_TYPES,
  TASK_STATUSES,
} from '@/lib/constants';
import { useToast } from '@/components/m/Toast';
import { copyAll } from '@/lib/clipboard';

interface Task {
  id: string;
  platform: string;
  publishTime: string;
  category: string;
  contentType: string;
  title: string;
  body: string;
  coverText: string;
  imageUrl: string;
  status: string;
}

export default function MTaskEditClient({ task }: { task: Task }) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState<Task>(task);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'content' | 'image' | null>(null);

  function up<K extends keyof Task>(k: K, v: Task[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      toast.show('已保存', 'success');
      router.refresh();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function gen(kind: 'content' | 'image') {
    setBusy(kind);
    try {
      const url =
        kind === 'content'
          ? `/api/tasks/${form.id}/generate-content`
          : `/api/tasks/${form.id}/generate-image`;
      const res = await fetch(url, { method: 'POST' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      if (j.task) setForm((f) => ({ ...f, ...j.task }));
      toast.show(kind === 'content' ? '文案已生成' : '图片已生成', 'success');
      router.refresh();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!form.body) {
      toast.show('请先生成文案', 'error');
      return;
    }
    const platform = form.platform === 'xiaohongshu' ? '小红书' : '闲鱼';
    const text = `【${platform} · ${form.publishTime}】\n${form.title}\n\n${form.body}${
      form.coverText ? `\n\n封面大字：${form.coverText}` : ''
    }`;
    const ok = await copyAll(text);
    toast.show(ok ? '已复制完整内容' : '复制失败', ok ? 'success' : 'error');
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
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
          <Field label="发布时间">
            <input
              className="m-input"
              value={form.publishTime}
              onChange={(e) => up('publishTime', e.target.value)}
              placeholder="HH:mm"
            />
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
        </div>

        <Field label="标题">
          <input
            className="m-input"
            value={form.title}
            onChange={(e) => up('title', e.target.value)}
          />
        </Field>
        <Field label="封面大字">
          <input
            className="m-input"
            value={form.coverText}
            onChange={(e) => up('coverText', e.target.value)}
          />
        </Field>
        <Field label="正文">
          <textarea
            className="m-input min-h-[180px]"
            value={form.body}
            onChange={(e) => up('body', e.target.value)}
          />
        </Field>
        <Field label="状态">
          <select
            className="m-input"
            value={form.status}
            onChange={(e) => up('status', e.target.value)}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        {form.imageUrl && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              绑定图片
            </label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.imageUrl}
              alt=""
              className="w-full max-w-xs rounded border border-slate-200"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-brand-600 text-white font-medium py-3 active:bg-brand-700 disabled:opacity-60"
        >
          {saving ? '保存中...' : '💾 保存'}
        </button>
        <button
          onClick={copy}
          className="rounded-lg bg-emerald-600 text-white font-medium py-3 active:bg-emerald-700"
        >
          📋 一键复制
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => gen('content')}
          disabled={!!busy}
          className="rounded-lg border border-slate-300 text-slate-700 font-medium py-3 active:bg-slate-50 disabled:opacity-60"
        >
          {busy === 'content' ? '生成中...' : '🪄 生成文案'}
        </button>
        <button
          onClick={() => gen('image')}
          disabled={!!busy}
          className="rounded-lg border border-slate-300 text-slate-700 font-medium py-3 active:bg-slate-50 disabled:opacity-60"
        >
          {busy === 'image' ? '出图中...' : '🎨 生成图片'}
        </button>
      </div>
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
