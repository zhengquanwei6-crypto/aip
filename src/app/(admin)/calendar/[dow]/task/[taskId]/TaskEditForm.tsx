'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PLATFORMS,
  CATEGORIES,
  CONTENT_TYPES,
  TASK_STATUSES,
} from '@/lib/constants';

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

export default function TaskEditForm({
  task,
  scheduleTheme,
}: {
  task: Task;
  scheduleTheme: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Task>(task);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<'content' | 'image' | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function update<K extends keyof Task>(k: K, v: Task[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tasks/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '保存失败');
      setMsg({ kind: 'ok', text: '已保存' });
      router.refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function callGenerate(kind: 'content' | 'image') {
    setGenerating(kind);
    setMsg(null);
    try {
      const url =
        kind === 'content'
          ? `/api/tasks/${form.id}/generate-content`
          : `/api/tasks/${form.id}/generate-image`;
      const res = await fetch(url, { method: 'POST' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      if (j.task) {
        setForm((f) => ({
          ...f,
          ...j.task,
          body: j.task.body ?? f.body,
          coverText: j.task.coverText ?? f.coverText,
          imageUrl: j.task.imageUrl ?? f.imageUrl,
        }));
      }
      setMsg({ kind: 'ok', text: kind === 'content' ? '文案已生成' : '图片已生成' });
      router.refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-semibold">任务详情 / 编辑</h2>
        {scheduleTheme && (
          <span className="text-sm text-slate-500">主题：{scheduleTheme}</span>
        )}
      </div>
      <div className="card-body space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="平台">
            <select
              className="input"
              value={form.platform}
              onChange={(e) => update('platform', e.target.value)}
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
              type="text"
              className="input"
              value={form.publishTime}
              onChange={(e) => update('publishTime', e.target.value)}
              placeholder="HH:mm"
            />
          </Field>
          <Field label="类目">
            <select
              className="input"
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
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
              className="input"
              value={form.contentType}
              onChange={(e) => update('contentType', e.target.value)}
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
            className="input"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
          />
        </Field>

        <Field label="封面大字">
          <input
            className="input"
            value={form.coverText}
            onChange={(e) => update('coverText', e.target.value)}
            placeholder="不超过 14 字"
          />
        </Field>

        <Field label="正文">
          <textarea
            className="input min-h-[180px]"
            value={form.body}
            onChange={(e) => update('body', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
          <Field label="状态">
            <select
              className="input"
              value={form.status}
              onChange={(e) => update('status', e.target.value)}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="绑定图片">
            {form.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={form.imageUrl}
                alt=""
                className="w-full aspect-square object-cover rounded border border-slate-200"
              />
            ) : (
              <div className="w-full aspect-square rounded border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400">
                暂无
              </div>
            )}
          </Field>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={() => callGenerate('content')}
            disabled={generating !== null}
            className="btn-secondary"
          >
            {generating === 'content' ? '生成文案中...' : '生成文案'}
          </button>
          <button
            onClick={() => callGenerate('image')}
            disabled={generating !== null}
            className="btn-secondary"
          >
            {generating === 'image' ? '生成图片中...' : '生成图片'}
          </button>
          {msg && (
            <span
              className={
                msg.kind === 'ok'
                  ? 'text-sm text-emerald-600'
                  : 'text-sm text-red-600'
              }
            >
              {msg.text}
            </span>
          )}
        </div>
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
