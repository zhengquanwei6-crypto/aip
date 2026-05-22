'use client';

import { useState } from 'react';
import { PLATFORM_LABEL, TASK_STATUSES } from '@/lib/constants';

interface TaskRow {
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

export default function TodayTasksClient({
  initialTasks,
}: {
  initialTasks: TaskRow[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  async function patchTask(id: string, data: Partial<TaskRow>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || '保存失败');
    return json.task as TaskRow;
  }

  async function setStatus(id: string, status: string) {
    try {
      setLoadingId(id);
      setLoadingAction('status');
      const t = await patchTask(id, { status });
      setTasks((arr) => arr.map((x) => (x.id === id ? { ...x, ...t } : x)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingId(null);
      setLoadingAction('');
    }
  }

  async function generateContent(id: string) {
    try {
      setLoadingId(id);
      setLoadingAction('content');
      setError(null);
      const res = await fetch(`/api/tasks/${id}/generate-content`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '生成失败');
      setTasks((arr) => arr.map((x) => (x.id === id ? { ...x, ...json.task } : x)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingId(null);
      setLoadingAction('');
    }
  }

  async function generateImage(id: string) {
    try {
      setLoadingId(id);
      setLoadingAction('image');
      setError(null);
      const res = await fetch(`/api/tasks/${id}/generate-image`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '图片生成失败');
      setTasks((arr) => arr.map((x) => (x.id === id ? { ...x, ...json.task } : x)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingId(null);
      setLoadingAction('');
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="card border-red-200 bg-red-50">
          <div className="card-body text-sm text-red-700 flex items-start justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {tasks.length === 0 && (
        <div className="card">
          <div className="card-body text-sm text-slate-400 text-center py-8">
            今日暂无任务，请先运行 <code className="text-xs">npm run prisma:seed</code>
          </div>
        </div>
      )}

      {tasks.map((t) => {
        const isLoading = loadingId === t.id;
        return (
          <div key={t.id} className="card">
            <div className="card-body">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-slate-500">
                    {t.publishTime}
                  </span>
                  <span
                    className={
                      t.platform === 'xiaohongshu' ? 'badge-red' : 'badge-yellow'
                    }
                  >
                    {PLATFORM_LABEL[t.platform]}
                  </span>
                  <span className="badge-gray">{t.category}</span>
                  <span className="badge-gray">{t.contentType}</span>
                  <StatusBadge status={t.status} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => generateContent(t.id)}
                    disabled={isLoading}
                    className="btn-secondary text-xs"
                  >
                    {isLoading && loadingAction === 'content'
                      ? '生成中...'
                      : '生成文案'}
                  </button>
                  <button
                    onClick={() => generateImage(t.id)}
                    disabled={isLoading}
                    className="btn-secondary text-xs"
                  >
                    {isLoading && loadingAction === 'image'
                      ? '生成图片中...'
                      : '生成图片'}
                  </button>
                  <select
                    value={t.status}
                    disabled={isLoading}
                    onChange={(e) => setStatus(t.id, e.target.value)}
                    className="input text-xs py-1 w-28"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_160px] gap-4">
                <div className="min-w-0">
                  <div className="text-base font-medium text-slate-800">
                    {t.title}
                  </div>
                  {t.coverText && (
                    <div className="mt-1 text-xs text-slate-500">
                      封面大字：{t.coverText}
                    </div>
                  )}
                  {t.body && (
                    <div className="mt-2 text-sm text-slate-600 whitespace-pre-wrap line-clamp-6">
                      {t.body}
                    </div>
                  )}
                  {!t.body && (
                    <div className="mt-2 text-xs text-slate-400">
                      尚未生成文案。点击「生成文案」自动生成。
                    </div>
                  )}
                </div>
                <div>
                  {t.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={t.imageUrl}
                      alt={t.title}
                      className="w-full aspect-square object-cover rounded border border-slate-200"
                    />
                  ) : (
                    <div className="w-full aspect-square rounded border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400">
                      暂无图片
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const item = TASK_STATUSES.find((s) => s.value === status);
  return <span className={item?.badge ?? 'badge-gray'}>{item?.label ?? status}</span>;
}
