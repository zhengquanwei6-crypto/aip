import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const list = await prisma.pricePackage.findMany({
    orderBy: [{ category: 'asc' }, { tier: 'asc' }],
  });
  return NextResponse.json({ ok: true, list });
}

export async function POST(req: NextRequest) {
  try {
    const { category, tier, name, priceRange, description } = await req.json();
    if (!category || !tier || !name || !priceRange) {
      return NextResponse.json({ ok: false, error: '字段不完整' }, { status: 400 });
    }
    const item = await prisma.pricePackage.create({
      data: { category, tier, name, priceRange, description: description || null },
    });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
