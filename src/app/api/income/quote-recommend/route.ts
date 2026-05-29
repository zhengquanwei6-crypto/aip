/**
 * v0.16-H3.2 · POST /api/income/quote-recommend
 *
 * 输入: { category, difficulty?, similarTo? }
 * 输出: { suggestedRange, similarQuotes[] }
 *
 * 基于历史同 category + 难度相近的成交价分布给区间建议
 */
import { NextRequest, NextResponse } from 'next/server';
import { listQuotes } from '@/lib/income/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const category = String(body?.category || '').trim();
    const difficulty: number | undefined = typeof body?.difficulty === 'number' ? body.difficulty : undefined;
    if (!category) {
      return NextResponse.json({ ok: false, error: '需要 category' }, { status: 400 });
    }

    const all = await listQuotes();
    const sameCat = all.filter((q) => q.category === category);
    if (sameCat.length === 0) {
      return NextResponse.json({
        ok: true,
        suggestedRange: null,
        similarQuotes: [],
        message: `还没有 ${category} 历史数据`,
      });
    }

    // 同难度优先，没有就退回同 category
    let candidates = sameCat;
    if (difficulty) {
      const sameDiff = sameCat.filter((q) => q.difficulty === difficulty);
      if (sameDiff.length >= 3) candidates = sameDiff;
    }

    const won = candidates.filter((q) => q.status === 'won').map((q) => q.finalPrice);
    if (won.length === 0) {
      const allPrices = candidates.map((q) => q.finalPrice);
      const avg = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
      return NextResponse.json({
        ok: true,
        suggestedRange: { low: Math.round(avg * 0.85), mid: Math.round(avg), high: Math.round(avg * 1.15) },
        winRate: 0,
        sampleCount: candidates.length,
        message: `${candidates.length} 单 ${category} 历史 (尚无成交), 用报价平均估算`,
        similarQuotes: candidates.slice(0, 5).map((q) => ({
          id: q.id,
          clientName: q.clientName,
          difficulty: q.difficulty,
          finalPrice: q.finalPrice,
          status: q.status,
          createdAt: q.createdAt,
        })),
      });
    }

    const sorted = [...won].sort((a, b) => a - b);
    const p25 = sorted[Math.floor(sorted.length * 0.25)];
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    const winRate = won.length / candidates.length;

    return NextResponse.json({
      ok: true,
      suggestedRange: { low: p25, mid: p50, high: p75 },
      winRate,
      sampleCount: candidates.length,
      wonCount: won.length,
      similarQuotes: candidates
        .filter((q) => q.status === 'won')
        .slice(0, 6)
        .map((q) => ({
          id: q.id,
          clientName: q.clientName,
          difficulty: q.difficulty,
          finalPrice: q.finalPrice,
          status: q.status,
          createdAt: q.createdAt,
        })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
