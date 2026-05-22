import { prisma } from '@/lib/db';
import { todayDayOfWeek, formatDateCN } from '@/lib/date';
import TodayTasksClient from './TodayTasksClient';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const today = new Date();
  const dow = todayDayOfWeek(today);
  const schedule = await prisma.schedule.findUnique({
    where: { dayOfWeek: dow },
    include: { tasks: { orderBy: { publishTime: 'asc' } } },
  });
  const tasks = schedule?.tasks ?? [];

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm text-slate-500">{formatDateCN(today)}</div>
            <div className="text-lg font-semibold text-slate-800 mt-0.5">
              今日主推：{schedule?.theme ?? '未配置'}
            </div>
          </div>
          <div className="text-sm text-slate-500">
            共 {tasks.length} 条 · 小红书{' '}
            {tasks.filter((t) => t.platform === 'xiaohongshu').length} · 闲鱼{' '}
            {tasks.filter((t) => t.platform === 'xianyu').length}
          </div>
        </div>
      </div>

      <TodayTasksClient initialTasks={tasks.map(serialize)} />
    </div>
  );
}

function serialize(t: any) {
  return {
    id: t.id,
    platform: t.platform,
    publishTime: t.publishTime,
    category: t.category,
    contentType: t.contentType,
    title: t.title,
    body: t.body ?? '',
    coverText: t.coverText ?? '',
    imageUrl: t.imageUrl ?? '',
    status: t.status,
  };
}
