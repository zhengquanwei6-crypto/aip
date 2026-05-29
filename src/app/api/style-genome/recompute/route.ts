/**
 * v0.16-H1 · POST /api/style-genome/recompute
 * 拉过去 30 天的:
 *   - Asset (favorite 标记 + 用户 👍 反馈) → seed urls
 *   - 用 buildGenome 重算
 * 写 'style:genome:current'，archive 历史
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildGenome } from '@/lib/style-genome/extractor';
import { invalidateGenomeCache } from '@/lib/style-genome/inject';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 240;

export async function POST() {
  const t0 = Date.now();
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // 1. 收集过去 30 天 like 的 url
    const feedbacks = await prisma.setting.findMany({
      where: { key: { startsWith: 'style:feedback:' }, createdAt: { gt: since } },
    });
    const likedUrls = feedbacks
      .map((f) => {
        try {
          const j = JSON.parse(f.value);
          if (j.vote === 'like' && j.assetUrl) return j.assetUrl as string;
        } catch { }
        return null;
      })
      .filter(Boolean) as string[];

    // 2. 收集 fav 标记的 asset
    const favRows = await prisma.setting.findMany({
      where: { key: { startsWith: 'asset:fav:' } },
    });
    const favAssetIds = favRows.map((r) => r.key.replace(/^asset:fav:/, ''));
    const favAssets = await prisma.asset.findMany({
      where: { id: { in: favAssetIds } },
    });
    const favUrls = favAssets.map((a) => a.url);

    const allUrls = Array.from(new Set([...likedUrls, ...favUrls]));
    if (allUrls.length < 3) {
      return NextResponse.json({
        ok: false,
        error: `数据不足: liked=${likedUrls.length}, fav=${favUrls.length} (需 ≥ 3 张)`,
        durationMs: Date.now() - t0,
      });
    }

    const genome = await buildGenome(allUrls.slice(0, 50));
    const ts = new Date().toISOString();
    await prisma.setting.upsert({
      where: { key: 'style:genome:current' },
      update: { value: JSON.stringify(genome) },
      create: { key: 'style:genome:current', value: JSON.stringify(genome) },
    });
    await prisma.setting.create({
      data: { key: `style:genome:history:${ts}`, value: JSON.stringify(genome) },
    });
    invalidateGenomeCache();

    return NextResponse.json({
      ok: true,
      genome,
      sampleCount: genome.sampleCount,
      sources: { liked: likedUrls.length, fav: favUrls.length, deduplicated: allUrls.length },
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, durationMs: Date.now() - t0 }, { status: 500 });
  }
}
