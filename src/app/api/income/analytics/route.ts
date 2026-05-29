/**
 * v0.16-H3.2 · GET /api/income/analytics
 *
 * 漏斗 + 按 category 胜率 + 客户聚类 + 时序
 */
import { NextResponse } from 'next/server';
import { listQuotes, listIncomes } from '@/lib/income/store';
import { aggregateWeekly } from '@/lib/income/forecast';
import { buildClientFeatures, clusterClients } from '@/lib/income/cluster';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [quotes, incomes] = await Promise.all([listQuotes(), listIncomes()]);

  // 漏斗
  const funnel = {
    pending: quotes.filter((q) => q.status === 'pending').length,
    negotiating: quotes.filter((q) => q.status === 'negotiating').length,
    won: quotes.filter((q) => q.status === 'won').length,
    lost: quotes.filter((q) => q.status === 'lost').length,
    cancelled: quotes.filter((q) => q.status === 'cancelled').length,
    total: quotes.length,
  };
  const totalActed = funnel.won + funnel.lost;
  const winRate = totalActed > 0 ? funnel.won / totalActed : 0;

  // 按 category 胜率
  const categoryMap = new Map<string, { inquiries: number; signed: number; lost: number; revenue: number; prices: number[] }>();
  for (const q of quotes) {
    const c = q.category || '未分类';
    if (!categoryMap.has(c)) categoryMap.set(c, { inquiries: 0, signed: 0, lost: 0, revenue: 0, prices: [] });
    const m = categoryMap.get(c)!;
    m.inquiries += 1;
    if (q.status === 'won') {
      m.signed += 1;
      m.revenue += q.finalPrice;
      m.prices.push(q.finalPrice);
    } else if (q.status === 'lost') {
      m.lost += 1;
    }
  }
  const categoryStats = Array.from(categoryMap.entries()).map(([category, m]) => {
    const decided = m.signed + m.lost;
    return {
      category,
      inquiries: m.inquiries,
      signed: m.signed,
      lost: m.lost,
      winRate: decided > 0 ? m.signed / decided : 0,
      avgWonPrice: m.signed > 0 ? Math.round(m.revenue / m.signed) : 0,
      revenue: Math.round(m.revenue),
      minPrice: m.prices.length ? Math.min(...m.prices) : 0,
      maxPrice: m.prices.length ? Math.max(...m.prices) : 0,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const weekly = aggregateWeekly(quotes, incomes);
  const features = buildClientFeatures(quotes);
  const clusters = clusterClients(features);

  // 实际总到账
  const totalReceived = incomes.reduce((acc, r) => acc + r.amount, 0);
  const totalQuoteRevenue = funnel.won > 0
    ? quotes.filter((q) => q.status === 'won').reduce((a, q) => a + q.finalPrice, 0)
    : 0;

  return NextResponse.json({
    ok: true,
    funnel,
    winRate,
    categoryStats,
    weekly,
    clusters: clusters.map((c) => ({
      label: c.label,
      desc: c.centroidDesc,
      memberCount: c.members.length,
      members: c.members.map((m) => ({
        name: m.name,
        signRate: Number(m.signRate.toFixed(2)),
        signed: m.signedCount,
        revenue: Math.round(m.totalRevenue),
        repurchase: m.repurchaseCount,
      })),
    })),
    summary: {
      quoteCount: quotes.length,
      clientCount: features.length,
      totalContractValue: Math.round(totalQuoteRevenue),
      totalReceived: Math.round(totalReceived),
      receivableBalance: Math.round(totalQuoteRevenue - totalReceived),
    },
  });
}
