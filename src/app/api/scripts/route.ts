import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const list = await prisma.script.findMany({
    orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ ok: true, list });
}

export async function POST(req: NextRequest) {
  try {
    const { type, title, content } = await req.json();
    if (!type || !title || !content) {
      return NextResponse.json({ ok: false, error: '字段不完整' }, { status: 400 });
    }
    const item = await prisma.script.create({ data: { type, title, content } });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
