import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { type: string; id: string } },
) {
  try {
    const data = await req.json();
    if (params.type === 'post') {
      const updates: any = {};
      for (const k of ['title', 'body', 'tags', 'coverText', 'cta', 'status']) {
        if (k in data) updates[k] = data[k];
      }
      const item = await prisma.post.update({
        where: { id: params.id },
        data: updates,
      });
      return NextResponse.json({ ok: true, item });
    }
    if (params.type === 'product') {
      const updates: any = {};
      for (const k of [
        'title',
        'description',
        'coverText',
        'priceTier',
        'deliveryScope',
        'revisionRule',
        'status',
      ]) {
        if (k in data) updates[k] = data[k];
      }
      const item = await prisma.product.update({
        where: { id: params.id },
        data: updates,
      });
      return NextResponse.json({ ok: true, item });
    }
    return NextResponse.json({ ok: false, error: '未知类型' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { type: string; id: string } },
) {
  try {
    if (params.type === 'post') {
      await prisma.post.delete({ where: { id: params.id } });
    } else if (params.type === 'product') {
      await prisma.product.delete({ where: { id: params.id } });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
