import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const data = await req.json();
    const updates: any = {};
    for (const k of [
      'name',
      'styleKeywords',
      'negativePrompt',
      'size',
      'imageType',
      'isDefault',
    ]) {
      if (k in data) updates[k] = data[k];
    }
    if (updates.isDefault) {
      await prisma.imagePreset.updateMany({
        where: { isDefault: true, NOT: { id: params.id } },
        data: { isDefault: false },
      });
    }
    const item = await prisma.imagePreset.update({
      where: { id: params.id },
      data: updates,
    });
    return NextResponse.json({ ok: true, item });
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
    await prisma.imagePreset.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
