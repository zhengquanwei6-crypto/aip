/**
 * v0.14-z87 · POST /api/vector/recall-history
 *
 * 给定 chat 上下文里的最后一条 user 消息（或自定义 query），
 * 召回相关的 AIOutput（含 input/output）作为 RAG 参考。
 *
 * 用途：playground LLM tab、未来其它 chat UI 都可以调它做 inline 召回。
 *
 * Body: { query: string, topK?: number, type?: string, minScore?: number }
 * Response: { ok: true, items: [{ id, score, type, input, output, model, createdAt, preview }] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { searchHistory } from '@/lib/vector';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function shorten(s: string | null | undefined, max: number): string {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body.query || '').trim();
    if (!query) {
      return NextResponse.json({ ok: false, error: 'query 必填' }, { status: 400 });
    }
    const topK = Math.max(1, Math.min(20, Number(body.topK) || 5));
    const minScore = Math.max(0, Math.min(1, Number(body.minScore) || 0.65));
    const typeFilter: string | undefined =
      typeof body.type === 'string' && body.type.trim() ? body.type.trim() : undefined;

    const filter = typeFilter ? `type == "${typeFilter}"` : undefined;
    const hits = await searchHistory(query, { topK: topK * 2, filter });
    const goodHits = hits.filter((h) => h.score >= minScore).slice(0, topK);

    if (goodHits.length === 0) {
      return NextResponse.json({ ok: true, items: [], meta: { totalHits: hits.length } });
    }

    const ids = goodHits.map((h) => h.id);
    const rows = await prisma.aIOutput.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));

    const items = goodHits
      .map((h) => {
        const r = byId.get(h.id);
        if (!r) return null;
        return {
          id: r.id,
          score: h.score,
          type: r.type,
          input: shorten(r.input, 300),
          output: shorten(r.output, 600),
          model: r.model,
          createdAt: r.createdAt.toISOString(),
          // preview 给 LLM 看的版本（更短）
          preview: shorten(r.output || r.input || '', 200),
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      ok: true,
      items,
      meta: { totalHits: hits.length, passedMinScore: goodHits.length, minScoreUsed: minScore },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'unknown' },
      { status: 500 },
    );
  }
}
