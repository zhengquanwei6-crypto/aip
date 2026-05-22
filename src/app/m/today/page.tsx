import { prisma } from '@/lib/db';
import { todayDayOfWeek, formatDateCN } from '@/lib/date';
import MTodayClient from './MTodayClient';

export const dynamic = 'force-dynamic';

export default async function MTodayPage() {
  const today = new Date();
  const dow = todayDayOfWeek(today);
  const schedule = await prisma.schedule.findUnique({
    where: { dayOfWeek: dow },
    include: { tasks: { orderBy: { publishTime: 'asc' } } },
  });
  const tasks = schedule?.tasks ?? [];
  return (
    <MTodayClient
      dateLabel={formatDateCN(today)}
      theme={schedule?.theme ?? ''}
      initialTasks={tasks.map(serialize)}
    />
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
