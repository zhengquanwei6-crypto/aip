import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const conversationId = String(body?.conversationId || '').trim();
    const vote = body?.vote === 'helpful' ? 'helpful' : body?.vote === 'unhelpful' ? 'unhelpful' : null;
    if (!conversationId || !vote) {
      return NextResponse.json({ ok: false, error: '需要 conversationId + vote' }, { status: 400 });
    }
    const ts = new Date().toISOString();
    await prisma.setting.create({
      data: {
        key: `critic:feedback:${ts}`,
        value: JSON.stringify({ conversationId, vote, ts }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
