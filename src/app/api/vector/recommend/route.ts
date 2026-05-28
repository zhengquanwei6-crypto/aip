/**
 * v0.14-z87 · POST /api/vector/recommend
 *
 * 给定用户正在编辑的 prompt，返回相似的过往作品（dao_assets）
 * 用于"写新任务时找类似图作参考"场景。
 *
 * Body: { prompt: string, topK?: number, platform?: string, type?: string, minScore?: number }
 * Response: { ok: true, recommendations: [{ id, score, url, prompt, type, platform, createdAt }] }
 *
 * 与 /api/vector/search 的区别：
 *   - search 是通用语义搜索（history + assets 二选一）
 *   - recommend 专门针对 assets，可加 platform / type 过滤
 *   - 加最低相似度阈值（minScore，默认 0.7），低于不返回
 *   - 自动按 score 降序，限制 topK 默认 6
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { searchAssets } from '@/lib/vector';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt || '').trim();
    if (!prompt) {
      return NextResponse.json({ ok: false, error: 'prompt 必填' }, { status: 400 });
    }
    const topK = Math.max(1, Math.min(20, Number(body.topK) || 6));
    const minScore = Math.max(0, Math.min(1, Number(body.minScore) || 0.7));
    const platformFilter: string | undefined =
      typeof body.platform === 'string' && body.platform.trim() ? body.platform.trim() : undefined;
    const typeFilter: string | undefined =
      typeof body.type === 'string' && body.type.trim() ? body.type.trim() : undefined;

    // Zilliz filter 表达式（注意：要走 dao_assets dynamic 字段）
    const filterParts: string[] = [];
    if (platformFilter) filterParts.push(`platform == "${platformFilter}"`);
    if (typeFilter) filterParts.push(`type == "${typeFilter}"`);
    const filter = filterParts.length > 0 ? filterParts.join(' && ') : undefined;

    const hits = await searchAssets(prompt, { topK: topK * 2, filter });

    // 过滤 minScore + 拉 prisma 完整数据
    const goodHits = hits.filter((h) => h.score >= minScore).slice(0, topK);
    if (goodHits.length === 0) {
      return NextResponse.json({
        ok: true,
        recommendations: [],
        meta: { totalHits: hits.length, filteredByMinScore: hits.length },
      });
    }

    const ids = goodHits.map((h) => h.id);
    const rows = await prisma.asset.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));

    const recommendations = goodHits
      .map((h) => {
        const r = byId.get(h.id);
        if (!r) return null;
        return {
          id: r.id,
          score: h.score,
          url: r.url,
          prompt: r.prompt ?? '',
          type: r.type,
          platform: r.platform ?? null,
          category: r.category ?? null,
          source: r.source,
          createdAt: r.createdAt.toISOString(),
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      ok: true,
      recommendations,
      meta: {
        totalHits: hits.length,
        passedMinScore: goodHits.length,
        minScoreUsed: minScore,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'unknown' },
      { status: 500 },
    );
  }
}
