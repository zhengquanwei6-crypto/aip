/**
 * v0.18-SHARE6 · POST /api/share/[shareId]/tick
 * 访问页每 5 秒 heartbeat, 累加 consumedSeconds。返回是否仍有效 + 剩余总时长。
 *
 * 关键修复：tick 服务的是「当前这次已被 /view 授权过的会话」，校验失效时
 * 跳过 maxViews —— 否则一次性链接（maxViews=1，/view 已把 viewCount 自增到
 * 1）会在第一次心跳就被判 max_views 失效，导致"未到时间就失效"。
 * maxViews 的把关只在 /view（决定能否开新的一次浏览）。
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

  const before = checkExpiry(link, { ignoreMaxViews: true });
  if (before !== "ok") {
    return NextResponse.json({ ok: true, expired: true, reason: before });
  }

  link.consumedSeconds += delta;
  await saveShare(link);

  const after = checkExpiry(link, { ignoreMaxViews: true });
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
