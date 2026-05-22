/**
 * 周复盘报告：从 Metric 表聚合，生成对比数据 + 排行榜 + Markdown
 */
import { prisma } from './db';
import { startOfDay, endOfDay, daysAgo } from './date';

export interface WeekStats {
  impressions: number;
  messages: number;
  consultations: number;
  orders: number;
  revenue: number;
  subscriptionLeads: number;
}

export interface WeekDelta {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  /** 变化率，正数为增长 */
  delta: Record<keyof WeekStats, number>;
}

export interface WeeklyTitle {
  title: string;
  platform: string;
  category: string;
  impressions: number;
  messages: number;
  orders: number;
  revenue: number;
  score: number;
}

export interface WeeklyCategory {
  category: string;
  orders: number;
  revenue: number;
  count: number;
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  delta: WeekDelta;
  topTitles: WeeklyTitle[];
  lowTitles: WeeklyTitle[];
  byCategory: WeeklyCategory[];
  byPlatform: { platform: string; impressions: number; orders: number; revenue: number }[];
  metricCount: number;
}

const EMPTY: WeekStats = {
  impressions: 0,
  messages: 0,
  consultations: 0,
  orders: 0,
  revenue: 0,
  subscriptionLeads: 0,
};

function sumStats(metrics: any[]): WeekStats {
  return metrics.reduce(
    (s, m) => ({
      impressions: s.impressions + (m.impressions || 0),
      messages: s.messages + (m.messages || 0),
      consultations: s.consultations + (m.consultations || 0),
      orders: s.orders + (m.orders || 0),
      revenue: s.revenue + (m.revenue || 0),
      subscriptionLeads: s.subscriptionLeads + (m.subscriptionLeads || 0),
    }),
    { ...EMPTY },
  );
}

function deltaPercent(curr: WeekStats, prev: WeekStats): WeekDelta['delta'] {
  const calc = (a: number, b: number) =>
    b === 0 ? (a === 0 ? 0 : 100) : Math.round(((a - b) / b) * 100);
  return {
    impressions: calc(curr.impressions, prev.impressions),
    messages: calc(curr.messages, prev.messages),
    consultations: calc(curr.consultations, prev.consultations),
    orders: calc(curr.orders, prev.orders),
    revenue: calc(curr.revenue, prev.revenue),
    subscriptionLeads: calc(curr.subscriptionLeads, prev.subscriptionLeads),
  };
}

export async function generateWeeklyReport(
  baseDate: Date = new Date(),
): Promise<WeeklyReport> {
  const thisWeekStart = startOfDay(daysAgo(6, baseDate));
  const thisWeekEnd = endOfDay(baseDate);
  const lastWeekStart = startOfDay(daysAgo(13, baseDate));
  const lastWeekEnd = endOfDay(daysAgo(7, baseDate));

  const [thisWeekRows, lastWeekRows] = await Promise.all([
    prisma.metric.findMany({
      where: { date: { gte: thisWeekStart, lte: thisWeekEnd } },
    }),
    prisma.metric.findMany({
      where: { date: { gte: lastWeekStart, lte: lastWeekEnd } },
    }),
  ]);

  const thisWeek = sumStats(thisWeekRows);
  const lastWeek = sumStats(lastWeekRows);

  const titleMap = new Map<string, WeeklyTitle>();
  for (const m of thisWeekRows) {
    if (!m.title) continue;
    const key = m.title;
    const score = (m.impressions || 0) + (m.orders || 0) * 100;
    const exists = titleMap.get(key);
    if (exists) {
      exists.impressions += m.impressions || 0;
      exists.messages += m.messages || 0;
      exists.orders += m.orders || 0;
      exists.revenue += m.revenue || 0;
      exists.score += score;
    } else {
      titleMap.set(key, {
        title: m.title,
        platform: m.platform,
        category: m.category ?? '',
        impressions: m.impressions || 0,
        messages: m.messages || 0,
        orders: m.orders || 0,
        revenue: m.revenue || 0,
        score,
      });
    }
  }
  const allTitles = [...titleMap.values()].sort((a, b) => b.score - a.score);

  const catMap = new Map<string, WeeklyCategory>();
  for (const m of thisWeekRows) {
    const key = m.category ?? '未分类';
    const exists = catMap.get(key);
    if (exists) {
      exists.orders += m.orders || 0;
      exists.revenue += m.revenue || 0;
      exists.count += 1;
    } else {
      catMap.set(key, {
        category: key,
        orders: m.orders || 0,
        revenue: m.revenue || 0,
        count: 1,
      });
    }
  }

  const platMap = new Map<
    string,
    { platform: string; impressions: number; orders: number; revenue: number }
  >();
  for (const m of thisWeekRows) {
    const key = m.platform;
    const exists = platMap.get(key);
    if (exists) {
      exists.impressions += m.impressions || 0;
      exists.orders += m.orders || 0;
      exists.revenue += m.revenue || 0;
    } else {
      platMap.set(key, {
        platform: key,
        impressions: m.impressions || 0,
        orders: m.orders || 0,
        revenue: m.revenue || 0,
      });
    }
  }

  return {
    weekStart: thisWeekStart.toISOString(),
    weekEnd: thisWeekEnd.toISOString(),
    delta: { thisWeek, lastWeek, delta: deltaPercent(thisWeek, lastWeek) },
    topTitles: allTitles.slice(0, 5),
    lowTitles: allTitles.slice(-5).reverse(),
    byCategory: [...catMap.values()].sort((a, b) => b.revenue - a.revenue),
    byPlatform: [...platMap.values()],
    metricCount: thisWeekRows.length,
  };
}

export function reportToMarkdown(r: WeeklyReport): string {
  const ws = r.weekStart.slice(0, 10);
  const we = r.weekEnd.slice(0, 10);
  const lines: string[] = [];
  lines.push(`# 本周复盘 ${ws} ~ ${we}`);
  lines.push('');
  lines.push('## 关键指标（vs 上周）');
  lines.push('');
  lines.push('| 指标 | 本周 | 上周 | 变化 |');
  lines.push('|---|---|---|---|');
  const fmt = (n: number) => Math.round(n).toLocaleString('zh-CN');
  const pct = (n: number) =>
    n > 0 ? `↑ ${n}%` : n < 0 ? `↓ ${Math.abs(n)}%` : '—';
  const t = r.delta.thisWeek;
  const l = r.delta.lastWeek;
  const d = r.delta.delta;
  lines.push(`| 曝光 | ${fmt(t.impressions)} | ${fmt(l.impressions)} | ${pct(d.impressions)} |`);
  lines.push(`| 私信 | ${fmt(t.messages)} | ${fmt(l.messages)} | ${pct(d.messages)} |`);
  lines.push(`| 咨询 | ${fmt(t.consultations)} | ${fmt(l.consultations)} | ${pct(d.consultations)} |`);
  lines.push(`| 成交 | ${fmt(t.orders)} | ${fmt(l.orders)} | ${pct(d.orders)} |`);
  lines.push(`| 金额 | ¥${fmt(t.revenue)} | ¥${fmt(l.revenue)} | ${pct(d.revenue)} |`);
  lines.push(`| 包月线索 | ${fmt(t.subscriptionLeads)} | ${fmt(l.subscriptionLeads)} | ${pct(d.subscriptionLeads)} |`);

  if (r.byCategory.length) {
    lines.push('');
    lines.push('## 类目表现');
    lines.push('');
    lines.push('| 类目 | 成交 | 金额 |');
    lines.push('|---|---|---|');
    for (const c of r.byCategory) {
      lines.push(`| ${c.category} | ${c.orders} | ¥${fmt(c.revenue)} |`);
    }
  }

  if (r.topTitles.length) {
    lines.push('');
    lines.push('## 高表现内容');
    lines.push('');
    for (let i = 0; i < r.topTitles.length; i++) {
      const x = r.topTitles[i];
      lines.push(
        `${i + 1}. **${x.title}** · ${x.platform === 'xiaohongshu' ? '小红书' : '闲鱼'} · 曝光 ${x.impressions} · 成交 ${x.orders} · ¥${fmt(x.revenue)}`,
      );
    }
  }

  return lines.join('\n');
}
