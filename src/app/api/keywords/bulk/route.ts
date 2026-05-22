import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/keywords/bulk
 * body: { items: { category, platform, keyword }[] }
 * 已存在则跳过
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items: { category: string; platform: string; keyword: string }[] =
      body.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: '没有要添加的关键词' }, { status: 400 });
    }
    let added = 0;
    for (const it of items) {
      if (!it.keyword || !it.category || !it.platform) continue;
      const exists = await prisma.keyword.findFirst({
        where: {
          category: it.category,
          platform: it.platform,
          keyword: it.keyword,
        },
      });
      if (!exists) {
        await prisma.keyword.create({ data: it });
        added++;
      }
    }
    return NextResponse.json({ ok: true, added, total: items.length });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
