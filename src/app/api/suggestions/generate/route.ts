import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText, extractJSON } from '@/lib/ai/text';
import { buildSuggestionMessages } from '@/lib/ai/prompts';
import { daysAgo, startOfDay, endOfDay } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function summarize(metrics: any[]) {
  // 聚合：按平台+类目
  const map: Record<string, any> = {};
  for (const m of metrics) {
    const key = `${m.platform}|${m.category ?? '未分类'}`;
    if (!map[key]) {
      map[key] = {
        platform: m.platform,
        category: m.category ?? '未分类',
        impressions: 0,
        messages: 0,
        consultations: 0,
        orders: 0,
        revenue: 0,
        subscriptionLeads: 0,
        topTitles: [] as string[],
      };
    }
    const slot = map[key];
    slot.impressions += m.impressions || 0;
    slot.messages += m.messages || 0;
    slot.consultations += m.consultations || 0;
    slot.orders += m.orders || 0;
    slot.revenue += m.revenue || 0;
    slot.subscriptionLeads += m.subscriptionLeads || 0;
    if (m.title && slot.topTitles.length < 5) slot.topTitles.push(m.title);
  }
  return Object.values(map);
}

export async function POST() {
  try {
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

    const weekly = summarize(w);
    const monthly = summarize(m);

    const messages = buildSuggestionMessages({
      weeklyMetrics: weekly,
      monthlyMetrics: monthly,
    });
    const r = await generateText({
      messages,
      responseFormat: 'json',
      temperature: 0.6,
      maxTokens: 3000,
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
    }
    const parsed = extractJSON<any>(r.content);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: 'AI 输出无法解析为 JSON', raw: r.content },
        { status: 500 },
      );
    }

    await prisma.aIOutput.create({
      data: {
        type: 'suggestion',
        input: JSON.stringify({ weekly, monthly }),
        output: JSON.stringify(parsed),
        model: r.model,
      },
    });
    return NextResponse.json({ ok: true, suggestion: parsed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
