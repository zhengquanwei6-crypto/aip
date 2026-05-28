/**
 * GET /api/vector/status
 * 返回 Zilliz 当前状态：是否启用、endpoint、两个 collection 行数。
 */
import { NextResponse } from "next/server";
import { vectorStatus } from "@/lib/vector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const s = await vectorStatus();
    return NextResponse.json({ ok: true, ...s });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || "unknown" },
      { status: 500 },
    );
  }
}
