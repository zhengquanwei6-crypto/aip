/**
 * v0.17-SHARE · POST /api/share/create
 * 入参: { assetId, watermark?, maxViews?, perViewSeconds?, totalSeconds?, expiresInHours?, password?, disableDownload? }
 * 出参: { ok, shareId, shareUrl, absoluteShareUrl }
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
      opacity: Math.max(0.05, Math.min(1, Number(wm.opacity) || 0.22)),
      // v0.18-SHARE4：默认满铺防骗稿；显式传 corner 才用旧单角标
      mode: wm.mode === "corner" ? "corner" : "tiled",
      tileDensity:
        wm.tileDensity !== undefined
          ? Math.max(0.12, Math.min(0.6, Number(wm.tileDensity) || 0.26))
          : 0.26,
      tileAngle:
        wm.tileAngle !== undefined ? Math.max(-90, Math.min(90, Number(wm.tileAngle) || -30)) : -30,
      // v0.18-SHARE7 corner 自定义坐标 + 字号
      offsetXPct:
        wm.offsetXPct !== undefined && wm.offsetXPct !== null
          ? Math.max(0, Math.min(1, Number(wm.offsetXPct)))
          : undefined,
      offsetYPct:
        wm.offsetYPct !== undefined && wm.offsetYPct !== null
          ? Math.max(0, Math.min(1, Number(wm.offsetYPct)))
          : undefined,
      fontScale:
        wm.fontScale !== undefined && wm.fontScale !== null
          ? Math.max(0.02, Math.min(0.3, Number(wm.fontScale)))
          : undefined,
    };
    const clientLabel = body?.clientLabel
      ? String(body.clientLabel).slice(0, 40)
      : undefined;

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
      clientLabel,
      revoked: false,
      createdAt: new Date().toISOString(),
      lastViewedAt: null,
      viewLog: [],
    };
    await saveShare(link);

    const shareUrl = `/s/${shareId}`;
    const origin = resolvePublicOrigin(req);

    return NextResponse.json({
      ok: true,
      shareId,
      shareUrl,
      absoluteShareUrl: `${origin}${shareUrl}`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

function resolvePublicOrigin(req: NextRequest): string {
  const headerOrigin = req.headers.get("origin");
  if (headerOrigin) return headerOrigin.replace(/\/$/, "");

  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${forwardedHost}`.replace(/\/$/, "");
  }

  const host = req.headers.get("host");
  if (host) {
    const proto = req.nextUrl.protocol || "https:";
    return `${proto}//${host}`.replace(/\/$/, "");
  }

  return req.nextUrl.origin.replace(/\/$/, "");
}
