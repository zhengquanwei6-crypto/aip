import { prisma } from '@/lib/db';
import { daysAgo, startOfDay, endOfDay } from '@/lib/date';
import MAnalyticsClient from './MAnalyticsClient';

export const dynamic = 'force-dynamic';

export default async function MAnalyticsPage() {
  const today = new Date();
  const since7 = daysAgo(6);
  const since30 = daysAgo(29);

  const [w, m] = await Promise.all([
    prisma.metric.findMany({
      where: { date: { gte: startOfDay(since7), lte: endOfDay(today) } },
    }),
    prisma.metric.findMany({
      where: { date: { gte: startOfDay(since30), lte: endOfDay(today) } },
    }),
  ]);

  const sum = (arr: any[], k: string) =>
    arr.reduce((s, m) => s + (Number(m[k]) || 0), 0);

  const stats = {
    weekImpressions: sum(w, 'impressions'),
    weekMessages: sum(w, 'messages'),
    weekConsult: sum(w, 'consultations'),
    weekOrders: sum(w, 'orders'),
    weekRevenue: Math.round(sum(w, 'revenue')),
  };

  const list = await prisma.metric.findMany({
    orderBy: { date: 'desc' },
    take: 100,
  });

  return (
    <MAnalyticsClient
      stats={stats}
      list={list.map((m) => ({
        id: m.id,
        platform: m.platform,
        date: m.date.toISOString().slice(0, 10),
        title: m.title ?? '',
        category: m.category ?? '',
        impressions: m.impressions,
        messages: m.messages,
        consultations: m.consultations,
        orders: m.orders,
        revenue: m.revenue,
        subscriptionLeads: m.subscriptionLeads,
        notes: m.notes ?? '',
      }))}
    />
  );
}
