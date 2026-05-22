import { NextRequest, NextResponse } from 'next/server';
import { generateWeeklyReport, reportToMarkdown } from '@/lib/weekly';
import { generateText, extractJSON } from '@/lib/ai/text';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/weekly-report?format=md|json */
export async function GET(req: NextRequest) {
  const fmt = req.nextUrl.searchParams.get('format') || 'json';
  const r = await generateWeeklyReport();
  if (fmt === 'md') {
    const md = reportToMarkdown(r);
    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="weekly-${r.weekStart.slice(0, 10)}.md"`,
      },
    });
  }
  return NextResponse.json({ ok: true, report: r });
}

/** POST /api/weekly-report 让 LLM 写下周建议 */
export async function POST() {
  try {
    const r = await generateWeeklyReport();
    const messages = [
      {
        role: 'system' as const,
        content:
          '你是平面设计接单的运营复盘助手。基于本周与上周对比数据，输出严格 JSON：{"summary":"一句话总结，不超过 80 字","actions":["下周应该做的 5 条具体行动建议，每条不超过 30 字"]}。actions 必须 5 条，必须可执行（写动作不写理由）。',
      },
      {
        role: 'user' as const,
        content: JSON.stringify({
          thisWeek: r.delta.thisWeek,
          lastWeek: r.delta.lastWeek,
          deltaPercent: r.delta.delta,
          topTitles: r.topTitles.map((t) => ({
            title: t.title,
            orders: t.orders,
            revenue: t.revenue,
          })),
          byCategory: r.byCategory,
        }),
      },
    ];
    const ai = await generateText({
      messages,
      temperature: 0.7,
      responseFormat: 'json',
      maxTokens: 800,
    });
    if (!ai.ok) {
      return NextResponse.json({ ok: false, error: ai.error }, { status: 500 });
    }
    const parsed = extractJSON<{ summary: string; actions: string[] }>(
      ai.content,
    );
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: 'AI 输出无法解析', raw: ai.content },
        { status: 500 },
      );
    }
    await prisma.aIOutput.create({
      data: {
        type: 'weekly_summary',
        input: JSON.stringify(r.delta),
        output: JSON.stringify(parsed),
        model: ai.model,
      },
    });
    return NextResponse.json({ ok: true, summary: parsed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
