/**
 * POST /api/vector/backfill
 * 一键回填：把所有 AIOutput / Asset 索引到 Zilliz。
 * 分批处理（每批 50 条），避免单次 embeddings 调用过大。
 *
 * 入参（可选）：{ limit?: number, batch?: number, target?: 'history' | 'assets' | 'all' }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureCollections, indexAIOutputs, indexAssets } from "@/lib/vector";
import { loadZillizConfig } from "@/lib/vector/zilliz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(0, Math.min(5000, Number(body.limit) || 0)); // 0 = 全部
    const batch = Math.max(1, Math.min(100, Number(body.batch) || 50));
    const target: "history" | "assets" | "all" =
      body.target === "history" || body.target === "assets" ? body.target : "all";

    const cfg = await loadZillizConfig();
    if (!cfg.enabled) {
      return NextResponse.json(
        { ok: false, error: "Zilliz 未启用，请先去 /settings 配置" },
        { status: 400 },
      );
    }
    await ensureCollections(cfg);

    const result = {
      history: { processed: 0, ok: 0, fail: 0 },
      assets: { processed: 0, ok: 0, fail: 0 },
    };

    if (target === "history" || target === "all") {
      const total = await prisma.aIOutput.count();
      const cap = limit > 0 ? Math.min(total, limit) : total;
      let cursor: string | undefined;
      while (result.history.processed < cap) {
        const take = Math.min(batch, cap - result.history.processed);
        const rows = await prisma.aIOutput.findMany({
          take,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { createdAt: "desc" },
        });
        if (rows.length === 0) break;
        try {
          const r = await indexAIOutputs(rows);
          result.history.ok += r.ok;
          result.history.fail += r.fail;
        } catch (e) {
          result.history.fail += rows.length;
          console.warn("[vector/backfill] history batch failed:", (e as Error).message);
        }
        result.history.processed += rows.length;
        cursor = rows[rows.length - 1].id;
      }
    }

    if (target === "assets" || target === "all") {
      const total = await prisma.asset.count();
      const cap = limit > 0 ? Math.min(total, limit) : total;
      let cursor: string | undefined;
      while (result.assets.processed < cap) {
        const take = Math.min(batch, cap - result.assets.processed);
        const rows = await prisma.asset.findMany({
          take,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { createdAt: "desc" },
        });
        if (rows.length === 0) break;
        try {
          const r = await indexAssets(rows);
          result.assets.ok += r.ok;
          result.assets.fail += r.fail;
        } catch (e) {
          result.assets.fail += rows.length;
          console.warn("[vector/backfill] assets batch failed:", (e as Error).message);
        }
        result.assets.processed += rows.length;
        cursor = rows[rows.length - 1].id;
      }
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || "unknown" },
      { status: 500 },
    );
  }
}
