/**
 * v0.17-SHARE · POST /api/share/create
 * 入参: { assetId, watermark?, maxViews?, perViewSeconds?, totalSeconds?, expiresInHours?, password?, disableDownload? }
 * 出参: { ok, shareId, shareUrl }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  genShareId, hashPassword, saveShare, type ShareLink, type WatermarkConfig,
} from "@/lib/share/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const assetId = String(body?.assetId || "").trim();
    if (!assetId) {
      return NextResponse.json({ ok: false, error: "需要 assetId" }, { status: 400 });
    }
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || !asset.url) {
      return NextResponse.json({ ok: false, error: "找不到该图片" }, { status: 404 });
    }

    const wm = body?.watermark || {};
    const watermark: WatermarkConfig = {
      enabled: Boolean(wm.enabled),
      text: String(wm.text || "果冻的AI").slice(0, 40),
      position: ["tl", "tr", "bl", "br", "center"].includes(wm.position) ? wm.position : "br",
      opacity: Math.max(0.1, Math.min(1, Number(wm.opacity) || 0.5)),
    };

    const maxViews =
      body?.maxViews === null || body?.maxViews === undefined || body?.maxViews === ""
        ? null
        : Math.max(1, Math.floor(Number(body.maxViews)));
    const perViewSeconds =
      body?.perViewSeconds ? Math.max(5, Math.floor(Number(body.perViewSeconds))) : null;
    const totalSeconds =
      body?.totalSeconds ? Math.max(5, Math.floor(Number(body.totalSeconds))) : null;
    const expiresAt =
      body?.expiresInHours
        ? new Date(Date.now() + Number(body.expiresInHours) * 3600_000).toISOString()
        : null;
    const passwordHash = body?.password ? hashPassword(String(body.password)) : null;

    const shareId = genShareId();
    const link: ShareLink = {
      shareId,
      assetId,
      assetUrl: asset.url,
      watermark,
      maxViews,
      viewCount: 0,
      perViewSeconds,
      totalSeconds,
      consumedSeconds: 0,
      expiresAt,
      passwordHash,
      disableDownload: Boolean(body?.disableDownload),
      revoked: false,
      createdAt: new Date().toISOString(),
      lastViewedAt: null,
      viewLog: [],
    };
    await saveShare(link);

    return NextResponse.json({
      ok: true,
      shareId,
      shareUrl: `/s/${shareId}`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
