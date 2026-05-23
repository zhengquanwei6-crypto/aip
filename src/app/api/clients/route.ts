import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const where: any = {};
  if (sp.get('platform')) where.platform = sp.get('platform');
  if (sp.get('status')) where.status = sp.get('status');
  if (sp.get('q')) {
    where.OR = [
      { nickname: { contains: sp.get('q')! } },
      { tags: { contains: sp.get('q')! } },
    ];
  }

  const clients = await prisma.client.findMany({
    where,
    orderBy: [{ lastContact: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: { _count: { select: { notes: true } } },
  });

  return NextResponse.json({
    ok: true,
    clients: clients.map((c) => ({
      id: c.id,
      nickname: c.nickname,
      platform: c.platform,
      category: c.category,
      tags: c.tags,
      status: c.status,
      totalOrders: c.totalOrders,
      totalRevenue: c.totalRevenue,
      lastContact: c.lastContact?.toISOString() ?? null,
      noteCount: c._count.notes,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    let data: any;
    try {
      data = await req.json();
    } catch {
      // BUG-6 fix: malformed JSON -> 400 instead of 500
      return NextResponse.json({ ok: false, error: '请求体不是合法 JSON' }, { status: 400 });
    }
    if (!data.nickname || !data.platform) {
      return NextResponse.json(
        { ok: false, error: '请填写昵称和平台' },
        { status: 400 },
      );
    }
    // BUG-5 fix: prevent duplicate clients with the same nickname+platform.
    // Returns the existing row if found, with a 200 + already=true flag
    // so the UI can either reuse it or show a duplicate warning.
    const existing = await prisma.client.findFirst({
      where: { nickname: data.nickname, platform: data.platform },
    });
    if (existing) {
      return NextResponse.json(
        { ok: true, already: true, client: existing },
        { status: 200 },
      );
    }
    const client = await prisma.client.create({
      data: {
        nickname: data.nickname,
        platform: data.platform,
        category: data.category || null,
        tags: data.tags || null,
        status: data.status || 'lead',
        lastContact: new Date(),
      },
    });
    return NextResponse.json({ ok: true, client });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
