import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const data = await req.json();
    if (!data.content) {
      return NextResponse.json(
        { ok: false, error: '请填写跟进内容' },
        { status: 400 },
      );
    }
    const note = await prisma.clientNote.create({
      data: {
        clientId: params.id,
        type: data.type || 'note',
        content: data.content,
        amount: data.amount ? Number(data.amount) : null,
      },
    });

    // 同步更新客户的 lastContact 与累计成交（如果是 order 类型）
    const updates: any = { lastContact: new Date() };
    if (note.type === 'order' && note.amount) {
      updates.totalOrders = { increment: 1 };
      updates.totalRevenue = { increment: note.amount };
      updates.status = 'customer';
    }
    await prisma.client.update({ where: { id: params.id }, data: updates });

    return NextResponse.json({ ok: true, note });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
