'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Send, Inbox, CheckSquare } from 'lucide-react';
import { PLATFORM_LABEL, TASK_STATUSES } from '@/lib/constants';
import { toast } from '@/lib/toast';
import ProgressBar from '@/components/ProgressBar';
import ImageLightbox from '@/components/ImageLightbox';
import ListShell, { bulkSerial } from '@/components/ListShell';
import { PublishDirectorDrawer } from '@/components/agents/PublishDirectorDrawer';
// v0.11 B7: TaskActionGroup 从内嵌组件抽到独立文件 src/components/admin/TaskActionGroup.tsx
import TaskActionGroup from '@/components/admin/TaskActionGroup';

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

const STATUS_FILTER_OPTIONS = [
  { value: '', label: '全部状态' },
  ...TASK_STATUSES.map((s) => ({ value: s.value, label: s.label })),
];

const PLATFORM_FILTER_OPTIONS = [
  { value: '', label: '全部平台' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'xianyu', label: '闲鱼' },
];

export default function TodayTasksClient({
  initialTasks,
}: {
  initialTasks: TaskRow[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string>('');
  const [elapsed, setElapsed] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // v0.9 b3：publish-director 抽屉（绑定到某条 task）
  const [pubDrawer, setPubDrawer] = useState<{ taskId: string; row: TaskRow } | null>(null);
  // v0.11 B5：每张卡的「更多动作」下拉是否展开
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const router = useRouter();

  /** 触发 publish-director 抽屉，预填 task 上下文 */
  function openPubDirectorForTask(t: TaskRow) {
    setPubDrawer({ taskId: t.id, row: t });
    setOpenMenuId(null);
  }

  /** publish-director 反写 task 后刷新页面 RSC payload */
  function handlePubDirectorTaskUpdated(taskId: string) {
    // 乐观把当前任务标 generated（service 已经写库，下次 router.refresh 会同步真实数据）
    setTasks((arr) =>
      arr.map((x) => (x.id === taskId ? { ...x, status: 'generated' } : x)),
    );
    router.refresh();
  }

  useEffect(() => {
    if (!loadingId) {
      setElapsed(0);
      return;
    }
    const t = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [loadingId]);

  // v0.11 B5: 点卡片外面关闭下拉菜单
  useEffect(() => {
    if (!openMenuId) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-task-menu]')) return;
      setOpenMenuId(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenuId]);

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
      toast.error((e as Error).message);
    } finally {
      setLoadingId(null);
      setLoadingAction('');
    }
  }

  async function generateContent(id: string) {
    try {
      setLoadingId(id);
      setLoadingAction('content');
      setOpenMenuId(null);
      const res = await fetch(`/api/tasks/${id}/generate-content`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '生成失败');
      setTasks((arr) => arr.map((x) => (x.id === id ? { ...x, ...json.task } : x)));
      toast.success('已生成文案');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingId(null);
      setLoadingAction('');
    }
  }

  async function generateImage(id: string) {
    try {
      setLoadingId(id);
      setLoadingAction('image');
      setOpenMenuId(null);
      const res = await fetch(`/api/tasks/${id}/generate-image`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '图片生成失败');
      setTasks((arr) => arr.map((x) => (x.id === id ? { ...x, ...json.task } : x)));
      toast.success('已生成图片');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingId(null);
      setLoadingAction('');
    }
  }

  // Lightbox 用：所有任务里有图的，按当前 tasks 顺序
  const imageTasks = tasks.filter((t) => t.imageUrl);
  const lightboxImages = imageTasks.map((t) => ({
    url: t.imageUrl,
    alt: t.title,
  }));

  function openLightbox(taskId: string) {
    const idx = imageTasks.findIndex((t) => t.id === taskId);
    if (idx >= 0) setLightboxIndex(idx);
  }

  /* ---------------- 批量动作 ---------------- */

  function makeBulkStatusAction(
    targetStatus: string,
    label: string,
    icon: React.ReactNode,
  ) {
    return {
      key: `status:${targetStatus}`,
      label,
      icon,
      run: async (ids: string[]) => {
        const r = await bulkSerial(ids, async (id) => {
          const t = await patchTask(id, { status: targetStatus });
          setTasks((arr) => arr.map((x) => (x.id === id ? { ...x, ...t } : x)));
        });
        if (r.failed.length === 0) {
          return { ok: true, message: `已批量改为「${label}」（${r.ok} 项）` };
        }
        return {
          ok: false,
          message: `部分失败：成功 ${r.ok} / 失败 ${r.failed.length}`,
        };
      },
    };
  }

  return (
    <>
      <ListShell<TaskRow>
        items={tasks}
        getId={(t) => t.id}
        storageKey="list:today"
        searchPlaceholder="搜索标题、正文或封面字"
        searchKeys={['title', 'body', 'coverText']}
        filters={[
          {
            key: 'status',
            label: '状态',
            options: STATUS_FILTER_OPTIONS,
            predicate: (t, v) => t.status === v,
          },
          {
            key: 'platform',
            label: '平台',
            options: PLATFORM_FILTER_OPTIONS,
            predicate: (t, v) => t.platform === v,
          },
        ]}
        viewModes={['card']}
        pageSize={50}
        emptyState={
          <div className="space-y-3">
            <div>今日暂无任务，可在 /calendar 添加或在 /content 直接生成。</div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <Link href="/calendar" className="btn-secondary text-xs px-3 py-1.5">
                打开发布日历
              </Link>
              <Link href="/content" className="btn-primary text-xs px-3 py-1.5">
                直接生成文案
              </Link>
            </div>
          </div>
        }
        onToastSuccess={(m) => toast.success(m)}
        onToastError={(m) => toast.error(m)}
        bulk={[
          makeBulkStatusAction('generated', '批量改为已生成', <CheckSquare size={14} />),
          makeBulkStatusAction('published', '批量改为已发布', <Send size={14} />),
          makeBulkStatusAction('recapped', '批量改为已复盘', <Inbox size={14} />),
        ]}
        cardGridClassName="space-y-3"
        renderCard={(t) => {
          const isLoading = loadingId === t.id;
          const isThisGenerating =
            isLoading && (loadingAction === 'content' || loadingAction === 'image');
          const menuOpen = openMenuId === t.id;
          return (
            <div className="card">
              <div className="card-body">
                <div className="flex items-start justify-between flex-wrap gap-3 pl-8">
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

                  {/* v0.11 B5：「主动作 + 下拉」整合
                      v0.11 B7：抽到 src/components/admin/TaskActionGroup.tsx 独立文件 */}
                  <TaskActionGroup
                    task={t}
                    isLoading={isLoading}
                    loadingAction={loadingAction}
                    menuOpen={menuOpen}
                    onToggleMenu={() => setOpenMenuId(menuOpen ? null : t.id)}
                    onPubDirector={() => openPubDirectorForTask(t)}
                    onGenerateContent={() => generateContent(t.id)}
                    onGenerateImage={() => generateImage(t.id)}
                    onSetStatus={(v) => setStatus(t.id, v)}
                  />
                </div>

                {isThisGenerating && (
                  <div className="mt-3">
                    <ProgressBar
                      mode="indeterminate"
                      label={
                        loadingAction === 'image' ? '正在生成图片…' : '正在生成文案…'
                      }
                      elapsed={elapsed}
                    />
                  </div>
                )}

                <div className="mt-3 grid grid-cols-[80px_1fr] sm:grid-cols-[1fr_160px] gap-3 sm:gap-4">
                  <div className="order-2 sm:order-1 min-w-0 col-span-2 sm:col-span-1">
                    <div className="text-base font-medium text-slate-800 dark:text-slate-100">
                      {t.title}
                    </div>
                    {t.coverText && (
                      <div className="mt-1 text-xs text-slate-500">
                        封面大字：{t.coverText}
                      </div>
                    )}
                    {t.body && (
                      <div className="mt-2 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap line-clamp-6">
                        {t.body}
                      </div>
                    )}
                    {!t.body && (
                      <div className="mt-2 text-xs text-slate-400">
                        尚未生成文案。点击「生成文案」自动生成。
                      </div>
                    )}
                  </div>
                  <div className="order-1 sm:order-2">
                    {t.imageUrl ? (
                      <button
                        type="button"
                        onClick={() => openLightbox(t.id)}
                        className="block w-full"
                        aria-label="查看大图"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={t.imageUrl}
                          alt={t.title}
                          className="w-full aspect-square object-cover rounded border border-slate-200 dark:border-slate-700 hover:opacity-90 cursor-zoom-in transition-opacity"
                        />
                      </button>
                    ) : (
                      <div className="w-full aspect-square rounded border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-[10px] sm:text-xs text-slate-400">
                        暂无图片
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      />

      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={(i) => setLightboxIndex(i)}
        />
      )}

      {/* v0.9 b3：publish-director 抽屉，绑定到当前 task */}
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
          onTaskUpdated={() => handlePubDirectorTaskUpdated(pubDrawer.taskId)}
        />
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const item = TASK_STATUSES.find((s) => s.value === status);
  return <span className={item?.badge ?? 'badge-gray'}>{item?.label ?? status}</span>;
}
