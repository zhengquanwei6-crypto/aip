import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { deleteLocalFile } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const a = await prisma.asset.findUnique({ where: { id: params.id } });
    if (a?.url) await deleteLocalFile(a.url);
    await prisma.asset.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
