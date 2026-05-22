import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_FIELDS = [
  'platform',
  'publishTime',
  'category',
  'contentType',
  'title',
  'body',
  'coverText',
  'imageUrl',
  'status',
  'priority',
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const data = await req.json();
    const updates: Record<string, any> = {};
    for (const k of ALLOWED_FIELDS) {
      if (k in data) updates[k] = data[k];
    }
    const task = await prisma.task.update({
      where: { id: params.id },
      data: updates,
    });
    return NextResponse.json({ ok: true, task });
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
    await prisma.task.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
