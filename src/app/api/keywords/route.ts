import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const where: any = {};
  if (sp.get('category')) where.category = sp.get('category');
  if (sp.get('platform')) where.platform = sp.get('platform');
  const list = await prisma.keyword.findMany({
    where,
    orderBy: [{ category: 'asc' }, { platform: 'asc' }, { keyword: 'asc' }],
  });
  return NextResponse.json({ ok: true, list });
}

export async function POST(req: NextRequest) {
  try {
    const { category, platform, keyword } = await req.json();
    if (!category || !platform || !keyword) {
      return NextResponse.json({ ok: false, error: '字段不完整' }, { status: 400 });
    }
    const item = await prisma.keyword.create({
      data: { category, platform, keyword },
    });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
