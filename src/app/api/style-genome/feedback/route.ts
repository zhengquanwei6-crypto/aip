/**
 * v0.16-H1 · POST /api/style-genome/feedback
 * 用户对生成的图打 like / dislike，写到 Setting key 'style:feedback:{ts}'
 * 阶段 3 持续学习用 (cron 跑 recompute 时聚合)
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const aiOutputId = String(body?.aiOutputId || '').trim();
    const assetUrl = String(body?.assetUrl || '').trim();
    const vote = body?.vote === 'like' ? 'like' : body?.vote === 'dislike' ? 'dislike' : null;
    if (!vote || (!aiOutputId && !assetUrl)) {
      return NextResponse.json({ ok: false, error: '需要 vote (like|dislike) + aiOutputId 或 assetUrl' }, { status: 400 });
    }
    const ts = new Date().toISOString();
    const key = `style:feedback:${ts}`;
    const value = JSON.stringify({ aiOutputId, assetUrl, vote, ts });
    await prisma.setting.create({ data: { key, value } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
