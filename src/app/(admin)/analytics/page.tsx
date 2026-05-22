import { prisma } from '@/lib/db';
import { daysAgo, startOfDay, endOfDay } from '@/lib/date';
import AnalyticsClient from './AnalyticsClient';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const today = new Date();
  const since7 = daysAgo(6);
  const since30 = daysAgo(29);

  const list = await prisma.metric.findMany({
    where: { date: { gte: startOfDay(since30), lte: endOfDay(today) } },
    orderBy: { date: 'desc' },
  });

  // 本周聚合
  const weekly = list.filter((m) => m.date >= startOfDay(since7));

  const sum = (arr: typeof weekly, k: keyof (typeof weekly)[number]) =>
    arr.reduce((s, m) => s + (Number(m[k]) || 0), 0);

  const stats = {
    weekImpressions: sum(weekly, 'impressions'),
    weekMessages: sum(weekly, 'messages'),
    weekConsult: sum(weekly, 'consultations'),
    weekOrders: sum(weekly, 'orders'),
    weekRevenue: Math.round(sum(weekly, 'revenue')),
  };

  // 类目排行
  const byCategory: Record<string, { revenue: number; orders: number; impressions: number }> = {};
  for (const m of list) {
    const k = m.category ?? '未分类';
    byCategory[k] ??= { revenue: 0, orders: 0, impressions: 0 };
    byCategory[k].revenue += m.revenue || 0;
    byCategory[k].orders += m.orders || 0;
    byCategory[k].impressions += m.impressions || 0;
  }
  const categoryRank = Object.entries(byCategory)
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // 平台对比
  const byPlatform: Record<string, { revenue: number; orders: number; impressions: number; messages: number }> = {};
  for (const m of list) {
    byPlatform[m.platform] ??= { revenue: 0, orders: 0, impressions: 0, messages: 0 };
    byPlatform[m.platform].revenue += m.revenue || 0;
    byPlatform[m.platform].orders += m.orders || 0;
    byPlatform[m.platform].impressions += m.impressions || 0;
    byPlatform[m.platform].messages += m.messages || 0;
  }

  // 高/低表现标题（按 impressions+orders*100 简单打分）
  const scored = list
    .filter((m) => m.title)
    .map((m) => ({
      id: m.id,
      title: m.title!,
      platform: m.platform,
      score: (m.impressions || 0) + (m.orders || 0) * 100,
      orders: m.orders,
      revenue: m.revenue,
    }))
    .sort((a, b) => b.score - a.score);

  const topTitles = scored.slice(0, 5);
  const lowTitles = scored.slice(-5).reverse();

  return (
    <AnalyticsClient
      stats={stats}
      categoryRank={categoryRank}
      byPlatform={byPlatform}
      topTitles={topTitles}
      lowTitles={lowTitles}
      list={list.map((m) => ({
        id: m.id,
        platform: m.platform,
        date: m.date.toISOString().slice(0, 10),
        title: m.title ?? '',
        category: m.category ?? '',
        impressions: m.impressions,
        clicks: m.clicks,
        likes: m.likes,
        favorites: m.favorites,
        comments: m.comments,
        messages: m.messages,
        views: m.views,
        consultations: m.consultations,
        orders: m.orders,
        revenue: m.revenue,
        averageOrderValue: m.averageOrderValue,
        subscriptionLeads: m.subscriptionLeads,
        notes: m.notes ?? '',
      }))}
    />
  );
}
