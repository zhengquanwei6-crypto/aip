/**
 * POST /api/vector/search
 * 语义搜索接口。
 *
 * Body: { collection: 'history' | 'assets', q: string, topK?: number, filter?: string }
 * 返回 Zilliz 命中后再回 prisma 查一次拿完整数据，前端不需要二次请求。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { searchHistory, searchAssets } from "@/lib/vector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const collection: "history" | "assets" = body.collection === "assets" ? "assets" : "history";
    const q = String(body.q || "").trim();
    const topK = Math.max(1, Math.min(50, Number(body.topK) || 10));
    const filter = typeof body.filter === "string" ? body.filter : undefined;

    if (!q) {
      return NextResponse.json({ ok: false, error: "q 必填" }, { status: 400 });
    }

    if (collection === "history") {
      const hits = await searchHistory(q, { topK, filter });
      const ids = hits.map((h) => h.id);
      const rows = ids.length
        ? await prisma.aIOutput.findMany({ where: { id: { in: ids } } })
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const items = hits
        .map((h) => {
          const r = byId.get(h.id);
          if (!r) return null;
          return {
            id: r.id,
            score: h.score,
            type: r.type,
            input: r.input,
            output: r.output,
            model: r.model,
            createdAt: r.createdAt.toISOString(),
          };
        })
        .filter(Boolean);
      return NextResponse.json({ ok: true, items });
    } else {
      const hits = await searchAssets(q, { topK, filter });
      const ids = hits.map((h) => h.id);
      const rows = ids.length
        ? await prisma.asset.findMany({ where: { id: { in: ids } } })
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const items = hits
        .map((h) => {
          const r = byId.get(h.id);
          if (!r) return null;
          return {
            id: r.id,
            score: h.score,
            type: r.type,
            platform: r.platform,
            category: r.category,
            url: r.url,
            prompt: r.prompt,
            createdAt: r.createdAt.toISOString(),
          };
        })
        .filter(Boolean);
      return NextResponse.json({ ok: true, items });
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || "unknown" },
      { status: 500 },
    );
  }
}
