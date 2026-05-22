import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NUMERIC_FIELDS = [
  'impressions',
  'clicks',
  'likes',
  'favorites',
  'comments',
  'messages',
  'views',
  'consultations',
  'orders',
  'revenue',
  'averageOrderValue',
  'subscriptionLeads',
] as const;

function parseNumeric(input: any) {
  const out: Record<string, number> = {};
  for (const k of NUMERIC_FIELDS) {
    if (k in input && input[k] !== '' && input[k] !== null) {
      const n = Number(input[k]);
      if (!Number.isNaN(n)) out[k] = n;
    }
  }
  return out;
}

export async function GET() {
  const list = await prisma.metric.findMany({
    orderBy: [{ date: 'desc' }],
    take: 200,
  });
  return NextResponse.json({ ok: true, list });
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    if (!data.platform || !data.date) {
      return NextResponse.json(
        { ok: false, error: '请提供 platform 和 date' },
        { status: 400 },
      );
    }
    // averageOrderValue 自动计算：如果未传，且 orders 和 revenue 存在则算
    const numeric = parseNumeric(data);
    if (
      numeric.orders &&
      numeric.revenue &&
      (numeric.averageOrderValue === undefined || numeric.averageOrderValue === 0)
    ) {
      numeric.averageOrderValue =
        Math.round((numeric.revenue / numeric.orders) * 100) / 100;
    }

    const item = await prisma.metric.create({
      data: {
        platform: data.platform,
        date: new Date(data.date),
        title: data.title || null,
        category: data.category || null,
        notes: data.notes || null,
        ...numeric,
      },
    });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
