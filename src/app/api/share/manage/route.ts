import { NextResponse } from "next/server";
import { listShares, checkExpiry } from "@/lib/share/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const links = await listShares();
  return NextResponse.json({
    ok: true,
    links: links.map((l) => ({
      shareId: l.shareId,
      assetId: l.assetId,
      assetUrl: l.assetUrl,
      watermark: l.watermark,
      maxViews: l.maxViews,
      viewCount: l.viewCount,
      perViewSeconds: l.perViewSeconds,
      totalSeconds: l.totalSeconds,
      consumedSeconds: l.consumedSeconds,
      expiresAt: l.expiresAt,
      hasPassword: !!l.passwordHash,
      disableDownload: l.disableDownload,
      revoked: l.revoked,
      status: checkExpiry(l),
      createdAt: l.createdAt,
      lastViewedAt: l.lastViewedAt,
      viewCountLog: l.viewLog.length,
    })),
  });
}
