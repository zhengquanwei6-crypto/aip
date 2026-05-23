'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PLATFORM_LABEL, TASK_STATUSES } from '@/lib/constants';
import { useToast } from '@/components/m/Toast';
import { copyAll } from '@/lib/clipboard';
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

export default function MTodayClient({
  dateLabel,
  theme,
  initialTasks,
}: {
  dateLabel: string;
  theme: string;
  initialTasks: TaskRow[];
}) {
  const toast = useToast();
  const [tasks, setTasks] = useState(initialTasks);
  const [busy, setBusy] = useState<Record<string, string>>({}); // id -> action
  const [batchProgress, setBatchProgress] = useState<{
    total: number;
    done: number;
    label: string;
  } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // v0.9 b3：publish-director 抽屉（移动端全屏）
  const [pubDrawer, setPubDrawer] = useState<{ taskId: string; row: TaskRow } | null>(null);
  const router = useRouter();

  function setTaskBusy(id: string, action: string) {
    setBusy((b) => ({ ...b, [id]: action }));
  }
  function clearTaskBusy(id: string) {
    setBusy((b) => {
      const n = { ...b };
      delete n[id];
      return n;
    });
  }

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
      setTaskBusy(id, 'status');
      const t = await patchTask(id, { status });
      setTasks((arr) => arr.map((x) => (x.id === id ? { ...x, ...t } : x)));
      toast.show('状态已更新', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      clearTaskBusy(id);
    }
  }

  async function genContent(id: string) {
    try {
      setTaskBusy(id, 'content');
      const res = await fetch(`/api/tasks/${id}/generate-content`, {
        method: 'POST',
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '生成失败');
      setTasks((arr) => arr.map((x) => (x.id === id ? { ...x, ...j.task } : x)));
      toast.show('文案已生成', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      clearTaskBusy(id);
    }
  }

  async function genImage(id: string) {
    try {
      setTaskBusy(id, 'image');
      const res = await fetch(`/api/tasks/${id}/generate-image`, {
        method: 'POST',
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || '图片生成失败');
      setTasks((arr) => arr.map((x) => (x.id === id ? { ...x, ...j.task } : x)));
      toast.show('图片已生成', 'success');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      clearTaskBusy(id);
    }
  }

  // 批量
  async function batchGenContent() {
    const list = tasks.filter((t) => !t.body); // 只生成还没文案的
    if (list.length === 0) {
      toast.show('所有任务都已有文案', 'info');
      return;
    }
    setBatchProgress({ total: list.length, done: 0, label: '批量生成文案' });
    let success = 0;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      try {
        setTaskBusy(t.id, 'content');
        const res = await fetch(`/api/tasks/${t.id}/generate-content`, {
          method: 'POST',
        });
        const j = await res.json();
        if (res.ok && j.ok) {
          setTasks((arr) =>
            arr.map((x) => (x.id === t.id ? { ...x, ...j.task } : x)),
          );
          success++;
        }
      } catch {}
      clearTaskBusy(t.id);
      setBatchProgress((p) => p && { ...p, done: i + 1 });
    }
    setBatchProgress(null);
    toast.show(`完成 ${success}/${list.length}`, success > 0 ? 'success' : 'error');
  }

  async function copyTask(t: TaskRow) {
    if (!t.body) {
      toast.show('请先生成文案', 'error');
      return;
    }
    const platform = t.platform === 'xiaohongshu' ? '小红书' : '闲鱼';
    const sections = [`【${platform} · ${t.publishTime}】`, t.title, '', t.body];
    if (t.coverText) sections.push('', `封面大字：${t.coverText}`);
    const text = sections.join('\n');
    const ok = await copyAll(text);
    toast.show(ok ? '已复制完整内容' : '复制失败', ok ? 'success' : 'error');
  }

  return (
    <div className="space-y-3">
      {/* 顶部信息 */}
      <div className="rounded-xl bg-white border border-slate-200 p-3">
        <div className="text-xs text-slate-500">{dateLabel}</div>
        <div className="mt-1 font-semibold text-slate-800">{theme || '未配置'}</div>
        <div className="mt-2 text-xs text-slate-500">
          共 {tasks.length} 条 · 小红书{' '}
          {tasks.filter((t) => t.platform === 'xiaohongshu').length} · 闲鱼{' '}
          {tasks.filter((t) => t.platform === 'xianyu').length}
        </div>
      </div>

      {/* 批量操作 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={batchGenContent}
          disabled={!!batchProgress}
          className="rounded-lg bg-brand-600 text-white text-sm font-medium py-2.5 active:bg-brand-700 disabled:opacity-60"
        >
          {batchProgress
            ? `${batchProgress.label} ${batchProgress.done}/${batchProgress.total}`
            : '🚀 一键生成今日全部文案'}
        </button>
        <Link
          href="/m/calendar"
          className="rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium py-2.5 text-center active:bg-slate-50"
        >
          📅 查看周计划
        </Link>
      </div>

      {tasks.length === 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-400">
          今日暂无任务，请先运行 prisma:seed
        </div>
      )}

      {/* 任务列表 */}
      {tasks.map((t) => {
        const action = busy[t.id];
        const expanded = expandedId === t.id;
        const stripColor =
          t.platform === 'xiaohongshu' ? 'bg-rose-500' : 'bg-amber-500';
        return (
          <div
            key={t.id}
            className="relative rounded-xl bg-white border border-slate-200 overflow-hidden"
          >
            <div className={`absolute top-0 left-0 bottom-0 w-1 ${stripColor}`} />
            <div className="pl-3 pr-3 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
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
                  <span className="badge-gray">{t.contentType}</span>
                </div>
                <StatusSelect
                  value={t.status}
                  disabled={!!action}
                  onChange={(v) => setStatus(t.id, v)}
                />
              </div>

              <div className="text-base font-medium text-slate-800 leading-snug">
                {t.title}
              </div>
              {t.coverText && (
                <div className="text-xs text-slate-500">
                  封面大字：{t.coverText}
                </div>
              )}

              {/* 图片 + 正文摘要 */}
              <div className="flex gap-3 items-start">
                <div className="w-20 shrink-0">
                  {t.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={t.imageUrl}
                      alt=""
                      className="w-20 h-20 rounded object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">
                      暂无图
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {t.body ? (
                    <div
                      className={
                        'text-sm text-slate-600 whitespace-pre-wrap leading-relaxed ' +
                        (expanded ? '' : 'line-clamp-3')
                      }
                    >
                      {t.body}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">尚未生成文案</div>
                  )}
                  {t.body && t.body.length > 80 && (
                    <button
                      onClick={() =>
                        setExpandedId(expanded ? null : t.id)
                      }
                      className="mt-1 text-xs text-brand-600"
                    >
                      {expanded ? '收起' : '展开全文'}
                    </button>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <button
                  onClick={() => genContent(t.id)}
                  disabled={!!action}
                  className="rounded-md border border-slate-300 text-xs py-2 active:bg-slate-50 disabled:opacity-60"
                >
                  {action === 'content' ? '生成中...' : '生成文案'}
                </button>
                <button
                  onClick={() => genImage(t.id)}
                  disabled={!!action}
                  className="rounded-md border border-slate-300 text-xs py-2 active:bg-slate-50 disabled:opacity-60"
                >
                  {action === 'image' ? '生成中...' : '生成图片'}
                </button>
                <button
                  onClick={() => copyTask(t)}
                  className="rounded-md bg-brand-600 text-white text-xs py-2 active:bg-brand-700"
                >
                  📋 一键复制
                </button>
              </div>

              {/* v0.9 b3：publish-director 入口（移动端，绑当前 task） */}
              <button
                onClick={() => setPubDrawer({ taskId: t.id, row: t })}
                disabled={!!action}
                className="w-full rounded-md bg-amber-100 text-amber-800 text-xs py-2 active:bg-amber-200 disabled:opacity-60 inline-flex items-center justify-center gap-1"
              >
                🎯 用 publish-director 跑这个 task
              </button>
            </div>
          </div>
        );
      })}

      {/* v0.9 b3：publish-director 抽屉（移动端 sm:w-[680px] 在小屏自动全屏） */}
      {pubDrawer && (
        <PublishDirectorDrawer
          open={true}
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
              arr.map((x) => (x.id === pubDrawer.taskId ? { ...x, status: 'generated' } : x)),
            );
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs rounded border border-slate-300 px-2 py-1 bg-white"
    >
      {TASK_STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}