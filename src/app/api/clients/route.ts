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
    const data = await req.json();
    if (!data.nickname || !data.platform) {
      return NextResponse.json(
        { ok: false, error: '请填写昵称和平台' },
        { status: 400 },
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
