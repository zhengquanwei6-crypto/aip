/**
 * v0.15 · 今日任务页 · 服务器组件
 *
 * 简化：去掉旧顶栏「今日主推 + 全流程发布按钮 + 浮动 day-coach」，
 * 进度 / 状态分组 / 操作完全交给 TodayTasksClient 渲染。
 */
import { prisma } from '@/lib/db';
import { todayDayOfWeek } from '@/lib/date';
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

  return <TodayTasksClient initialTasks={tasks.map(serialize)} />;
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
