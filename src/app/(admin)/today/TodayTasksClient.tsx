/**
 * v0.15 · 今日任务页 · UI 整体推倒重做
 *
 * 用户原话：让整体保持合理化，现在的页面看起来过于杂乱，UI 布局也非常不合理。
 *
 * 新结构：
 *   1. 顶部进度条：待办 / 已生成 / 已发布 三段式可视化进度
 *   2. 状态分组：按 pending / generated / published / recapped 横向 segment 切换
 *   3. 卡片：左 96px 缩略图 + 右文字 + 顶部状态条 + 底部一行操作
 *   4. 一致的 spacing / shadow / border / radius
 */
'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Send,
  Inbox,
  CheckSquare,
  Sparkles,
  Image as ImageIcon,
  Loader2,
  ArrowRight,
  Target,
  ChevronRight,
} from 'lucide-react';
import { PLATFORM_LABEL, TASK_STATUSES } from '@/lib/constants';
import { toast } from '@/lib/toast';
import ImageLightbox from '@/components/ImageLightbox';
import { PublishDirectorDrawer } from '@/components/agents/PublishDirectorDrawer';

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

const STATUSES: { value: string; label: string; tone: string }[] = [
  { value: 'pending', label: '待办', tone: 'amber' },
  { value: 'generated', label: '已生成', tone: 'blue' },
  { value: 'published', label: '已发布', tone: 'green' },
  { value: 'recapped', label: '已复盘', tone: 'purple' },
];

export default function TodayTasksClient({
  initialTasks,
}: {
  initialTasks: TaskRow[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [activeStatus, setActiveStatus] = useState<string>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<'content' | 'image' | 'status' | ''>(
    '',
  );
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [pubDrawer, setPubDrawer] = useState<{ taskId: string; row: TaskRow } | null>(
    null,
  );

  // 进度条数据
  const counts = useMemo(() => {
    const m: Record<string, number> = {
      pending: 0,
      generated: 0,
      published: 0,
      recapped: 0,
    };
    tasks.forEach((t) => {
      m[t.status] = (m[t.status] ?? 0) + 1;
    });
    return m;
  }, [tasks]);

  const total = tasks.length || 1;
  const filtered = useMemo(
    () => tasks.filter((t) => t.status === activeStatus),
    [tasks, activeStatus],
  );

  // Lightbox 序列：当前筛选下有图的任务
  const lightboxTasks = filtered.filter((t) => t.imageUrl);
  const lightboxImages = lightboxTasks.map((t) => ({ url: t.imageUrl, alt: t.title }));

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
      setBusyId(id);
      setBusyKind('status');
      const t = await patchTask(id, { status });
      setTasks((arr) => arr.map((x) => (x.id === id ? { ...x, ...t } : x)));
      toast.success('已更新状态');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
      setBusyKind('');
    }
  }

  async function gen(kind: 'content' | 'image', id: string) {
    try {
      setBusyId(id);
      setBusyKind(kind);
      const url = `/api/tasks/${id}/${kind === 'content' ? 'generate-content' : 'generate-image'}`;
      const res = await fetch(url, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '生成失败');
      setTasks((arr) => arr.map((x) => (x.id === id ? { ...x, ...json.task } : x)));
      toast.success(kind === 'content' ? '已生成文案' : '已生成图片');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
      setBusyKind('');
    }
  }

  function openLightbox(id: string) {
    const idx = lightboxTasks.findIndex((t) => t.id === id);
    if (idx >= 0) setLightbox(idx);
  }

  return (
    <div className="space-y-5">
      {/* 顶部进度条 */}
      <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400 font-mono">
              today
            </div>
            <div className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 mt-0.5">
              共 {tasks.length} 条任务
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              小红书 {tasks.filter((t) => t.platform === 'xiaohongshu').length}
            </span>
            <span>·</span>
            <span>闲鱼 {tasks.filter((t) => t.platform === 'xianyu').length}</span>
          </div>
        </div>

        {/* 三段式进度条 */}
        <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <span
            className="bg-amber-400 transition-all"
            style={{ width: `${(counts.pending / total) * 100}%` }}
            title={`待办 ${counts.pending}`}
          />
          <span
            className="bg-blue-400 transition-all"
            style={{ width: `${(counts.generated / total) * 100}%` }}
            title={`已生成 ${counts.generated}`}
          />
          <span
            className="bg-emerald-500 transition-all"
            style={{ width: `${(counts.published / total) * 100}%` }}
            title={`已发布 ${counts.published}`}
          />
          <span
            className="bg-purple-400 transition-all"
            style={{ width: `${(counts.recapped / total) * 100}%` }}
            title={`已复盘 ${counts.recapped}`}
          />
        </div>

        {/* 状态分段 */}
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => {
            const active = s.value === activeStatus;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setActiveStatus(s.value)}
                aria-pressed={active}
                className={
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ' +
                  (active
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700')
                }
              >
                <StatusBullet status={s.value} />
                {s.label}
                <span className="font-mono tabular-nums opacity-70">
                  {counts[s.value] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* 任务卡片 */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500">
          这个状态下没有任务。
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              busy={busyId === t.id}
              busyKind={busyKind}
              onPubDirector={() => setPubDrawer({ taskId: t.id, row: t })}
              onGenContent={() => gen('content', t.id)}
              onGenImage={() => gen('image', t.id)}
              onSetStatus={(s) => setStatus(t.id, s)}
              onOpenImage={() => openLightbox(t.id)}
            />
          ))}
        </div>
      )}

      {lightbox !== null && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onIndexChange={(i) => setLightbox(i)}
        />
      )}

      {pubDrawer && (
        <PublishDirectorDrawer
          open
          onClose={() => setPubDrawer(null)}
          taskId={pubDrawer.taskId}
          initialForm={{
            platform: pubDrawer.row.platform as 'xiaohongshu' | 'xianyu',
            category: pubDrawer.row.category,
            contentType: pubDrawer.row.contentType,
            topic: pubDrawer.row.title,
          }}
          onTaskUpdated={() => {
            setTasks((arr) =>
              arr.map((x) =>
                x.id === pubDrawer.taskId ? { ...x, status: 'generated' } : x,
              ),
            );
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function TaskCard({
  task,
  busy,
  busyKind,
  onPubDirector,
  onGenContent,
  onGenImage,
  onSetStatus,
  onOpenImage,
}: {
  task: TaskRow;
  busy: boolean;
  busyKind: string;
  onPubDirector: () => void;
  onGenContent: () => void;
  onGenImage: () => void;
  onSetStatus: (s: string) => void;
  onOpenImage: () => void;
}) {
  return (
    <article className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all">
      {/* 顶部状态条 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 text-[11px]">
        <span className="font-mono tabular-nums text-slate-500">
          {task.publishTime}
        </span>
        <span
          className={
            'badge text-[10px] ' +
            (task.platform === 'xiaohongshu' ? 'badge-red' : 'badge-yellow')
          }
        >
          {PLATFORM_LABEL[task.platform] ?? task.platform}
        </span>
        <span className="badge-gray text-[10px]">{task.category}</span>
        <span className="badge-gray text-[10px]">{task.contentType}</span>
        <span className="ml-auto">
          <StatusBadge status={task.status} />
        </span>
      </div>

      {/* 主体 */}
      <div className="p-4 flex gap-3">
        {/* 缩略图 */}
        <div className="shrink-0">
          {task.imageUrl ? (
            <button
              type="button"
              onClick={onOpenImage}
              className="block w-24 h-24 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:opacity-90"
              aria-label="查看大图"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={task.imageUrl}
                alt={task.title}
                className="w-full h-full object-cover"
              />
            </button>
          ) : (
            <div className="w-24 h-24 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400">
              <ImageIcon size={20} aria-hidden="true" />
            </div>
          )}
        </div>

        {/* 文字 */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm sm:text-base font-medium text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">
            {task.title}
          </h3>
          {task.coverText && (
            <p className="mt-1 text-[11px] text-slate-500">封面：{task.coverText}</p>
          )}
          {task.body ? (
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
              {task.body}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-400">尚未生成文案</p>
          )}
        </div>
      </div>

      {/* 底部操作 */}
      <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex items-center gap-2 flex-wrap text-xs">
        <button
          type="button"
          onClick={onPubDirector}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-white px-2.5 py-1 text-xs"
        >
          <Target size={12} aria-hidden="true" />
          全流程
        </button>
        {!task.body && (
          <button
            type="button"
            onClick={onGenContent}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 px-2.5 py-1"
          >
            {busy && busyKind === 'content' ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={12} aria-hidden="true" />
            )}
            生成文案
          </button>
        )}
        {!task.imageUrl && (
          <button
            type="button"
            onClick={onGenImage}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 px-2.5 py-1"
          >
            {busy && busyKind === 'image' ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <ImageIcon size={12} aria-hidden="true" />
            )}
            生成图片
          </button>
        )}
        <span className="ml-auto inline-flex items-center gap-1">
          <StatusSelect value={task.status} onChange={onSetStatus} disabled={busy} />
        </span>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const item = TASK_STATUSES.find((s) => s.value === status);
  return (
    <span className={(item?.badge ?? 'badge-gray') + ' text-[10px]'}>
      {item?.label ?? status}
    </span>
  );
}

function StatusBullet({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-amber-400',
    generated: 'bg-blue-400',
    published: 'bg-emerald-500',
    recapped: 'bg-purple-400',
  };
  return (
    <span
      aria-hidden
      className={'inline-block w-1.5 h-1.5 rounded-full ' + (colors[status] ?? 'bg-slate-400')}
    />
  );
}

function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
      改为
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded border border-slate-300 dark:border-slate-700 bg-transparent text-xs px-1.5 py-0.5"
      >
        {TASK_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
