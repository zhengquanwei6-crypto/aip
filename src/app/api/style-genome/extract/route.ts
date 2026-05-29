/**
 * v0.16-H1 · POST /api/style-genome/extract
 * 入参: { assetIds: string[], save?: boolean }
 * 出参: { ok: true, genome: StyleGenome, savedAt?: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildGenome } from '@/lib/style-genome/extractor';
import { invalidateGenomeCache } from '@/lib/style-genome/inject';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.assetIds) ? body.assetIds.filter((x: any) => typeof x === 'string') : [];
    const save = body?.save !== false;

    if (ids.length < 3) {
      return NextResponse.json({ ok: false, error: '至少需要 3 张图' }, { status: 400 });
    }
    if (ids.length > 50) {
      return NextResponse.json({ ok: false, error: '一次最多 50 张图' }, { status: 400 });
    }

    const assets = await prisma.asset.findMany({ where: { id: { in: ids } } });
    if (assets.length === 0) {
      return NextResponse.json({ ok: false, error: '找不到对应 Asset' }, { status: 404 });
    }

    const urls = assets.map((a) => a.url);
    const genome = await buildGenome(urls);

    let savedAt: string | undefined;
    if (save) {
      const ts = new Date().toISOString();
      // 当前 + 历史归档
      await prisma.setting.upsert({
        where: { key: 'style:genome:current' },
        update: { value: JSON.stringify(genome) },
        create: { key: 'style:genome:current', value: JSON.stringify(genome) },
      });
      await prisma.setting.upsert({
        where: { key: `style:genome:history:${ts}` },
        update: { value: JSON.stringify(genome) },
        create: { key: `style:genome:history:${ts}`, value: JSON.stringify(genome) },
      });
      invalidateGenomeCache();
      savedAt = ts;
    }

    return NextResponse.json({
      ok: true,
      genome,
      savedAt,
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'unknown', durationMs: Date.now() - t0 },
      { status: 500 },
    );
  }
}
