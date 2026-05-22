import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const c = await prisma.client.findUnique({
    where: { id: params.id },
    include: { notes: { orderBy: { createdAt: 'desc' } } },
  });
  if (!c) {
    return NextResponse.json({ ok: false, error: '客户不存在' }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    client: {
      id: c.id,
      nickname: c.nickname,
      platform: c.platform,
      category: c.category ?? '',
      tags: c.tags ?? '',
      status: c.status,
      totalOrders: c.totalOrders,
      totalRevenue: c.totalRevenue,
      lastContact: c.lastContact?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      notes: c.notes.map((n) => ({
        id: n.id,
        type: n.type,
        content: n.content,
        amount: n.amount,
        createdAt: n.createdAt.toISOString(),
      })),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const data = await req.json();
    const updates: any = {};
    for (const k of [
      'nickname',
      'platform',
      'category',
      'tags',
      'status',
      'totalOrders',
      'totalRevenue',
    ]) {
      if (k in data) updates[k] = data[k];
    }
    const client = await prisma.client.update({
      where: { id: params.id },
      data: updates,
    });
    return NextResponse.json({ ok: true, client });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.client.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
