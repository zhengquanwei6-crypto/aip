/**
 * v0.17-SHARE · POST /api/share/[shareId]/tick
 * 访问页每 5 秒 heartbeat, 累加 consumedSeconds。返回是否仍有效 + 剩余总时长。
 */
import { NextRequest, NextResponse } from "next/server";
import { getShare, saveShare, checkExpiry } from "@/lib/share/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: { shareId: string } }) {
  const body = await req.json().catch(() => ({}));
  const delta = Math.max(0, Math.min(30, Number(body?.seconds) || 5));
  const link = await getShare(ctx.params.shareId);
  if (!link) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const before = checkExpiry(link);
  if (before !== "ok") {
    return NextResponse.json({ ok: true, expired: true, reason: before });
  }

  link.consumedSeconds += delta;
  await saveShare(link);

  const after = checkExpiry(link);
  const remainingTotal = link.totalSeconds !== null
    ? Math.max(0, link.totalSeconds - link.consumedSeconds)
    : null;

  return NextResponse.json({
    ok: true,
    expired: after !== "ok",
    reason: after,
    remainingTotalSeconds: remainingTotal,
  });
}
