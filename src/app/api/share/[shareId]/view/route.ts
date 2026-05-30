/**
 * v0.17-SHARE · POST /api/share/[shareId]/view
 * 注册一次访问: 校验密码 → 判失效 → viewCount++ → 写日志。
 * 返回 { ok, expired, reason, link 公开字段 (含水印/时长设置, 不含 passwordHash) }
 */
import { NextRequest, NextResponse } from "next/server";
import { getShare, saveShare, checkExpiry, hashPassword, maskIp, EXPIRY_MESSAGE } from "@/lib/share/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: { shareId: string } }) {
  const body = await req.json().catch(() => ({}));
  const link = await getShare(ctx.params.shareId);
  if (!link) return NextResponse.json({ ok: false, error: "链接不存在" }, { status: 404 });

  // 密码校验
  if (link.passwordHash) {
    const pw = String(body?.password || "");
    if (!pw || hashPassword(pw) !== link.passwordHash) {
      return NextResponse.json({ ok: false, needPassword: true, error: "需要访问密码" }, { status: 401 });
    }
  }

  // 失效判定 (访问前)
  const reason = checkExpiry(link);
  if (reason !== "ok") {
    return NextResponse.json({ ok: true, expired: true, reason, message: EXPIRY_MESSAGE[reason] });
  }

  // 注册访问
  link.viewCount += 1;
  link.lastViewedAt = new Date().toISOString();
  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") || "?";
  link.viewLog.unshift({
    ts: link.lastViewedAt,
    ipMasked: maskIp(ip),
    ua: (req.headers.get("user-agent") || "?").slice(0, 120),
  });
  if (link.viewLog.length > 50) link.viewLog = link.viewLog.slice(0, 50);
  await saveShare(link);

  // 访问后再判一次 (这次访问可能正好用尽 maxViews, 但当前这次允许看完)
  const afterReason = checkExpiry(link);

  return NextResponse.json({
    ok: true,
    expired: false,
    settings: {
      watermark: link.watermark,
      perViewSeconds: link.perViewSeconds,
      totalSeconds: link.totalSeconds,
      consumedSeconds: link.consumedSeconds,
      disableDownload: link.disableDownload,
      remainingViews: link.maxViews !== null ? Math.max(0, link.maxViews - link.viewCount) : null,
      willExpireAfter: afterReason !== "ok",
    },
  });
}
