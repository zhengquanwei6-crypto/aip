/**
 * v0.17-SHARE S4 · GET /api/share/[shareId]/image
 *
 * 分享图片的唯一字节出口 (不直接暴露 /uploads)。
 *   - 先判失效, 失效返回 403
 *   - watermark.enabled → jimp 实时合成水印 (带缓存到 /uploads/share-wm/)
 *   - 否则直接返回原图字节
 *
 * 访问计数 + 日志写在 /s/[shareId] 页的 view-register, 不在这里 (图片可能被预取多次)
 */
import { NextRequest, NextResponse } from "next/server";
import { getShare, checkExpiry } from "@/lib/share/store";
import { promises as fs } from "node:fs";
import path from "node:path";
import Jimp from "jimp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WM_DIR = "/app/public/uploads/share-wm";

function resolveLocal(url: string): string | null {
  if (url.startsWith("/uploads/")) return path.join("/app/public", url);
  return null;
}

const POS_FN: Record<string, (W: number, H: number, w: number, h: number) => [number, number]> = {
  tl: () => [20, 20],
  tr: (W, _H, w) => [W - w - 20, 20],
  bl: (_W, H, _w, h) => [20, H - h - 20],
  br: (W, H, w, h) => [W - w - 20, H - h - 20],
  center: (W, H, w, h) => [Math.round((W - w) / 2), Math.round((H - h) / 2)],
};

export async function GET(_req: NextRequest, ctx: { params: { shareId: string } }) {
  const link = await getShare(ctx.params.shareId);
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });

  const reason = checkExpiry(link);
  if (reason !== "ok") {
    return NextResponse.json({ error: "expired", reason }, { status: 403 });
  }

  const abs = resolveLocal(link.assetUrl);
  if (!abs) return NextResponse.json({ error: "asset path invalid" }, { status: 500 });

  try {
    await fs.access(abs);
  } catch {
    return NextResponse.json({ error: "asset file missing" }, { status: 404 });
  }

  // 无水印 → 直接返回原图
  if (!link.watermark.enabled) {
    const buf = await fs.readFile(abs);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": guessMime(abs), "Cache-Control": "no-store" },
    });
  }

  // 有水印 → 缓存合成
  const wmPath = path.join(WM_DIR, `${link.shareId}.png`);
  try {
    await fs.access(wmPath);
    const cached = await fs.readFile(wmPath);
    return new Response(new Uint8Array(cached), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch {
    /* 未缓存, 合成 */
  }

  try {
    const img = await Jimp.read(abs);
    const W = img.bitmap.width;
    const H = img.bitmap.height;
    const font = await Jimp.loadFont(
      W > 800 ? Jimp.FONT_SANS_64_WHITE : Jimp.FONT_SANS_32_WHITE,
    ).catch(() => null);

    if (font) {
      const text = link.watermark.text || "果冻的AI";
      const tw = Jimp.measureText(font, text);
      const th = Jimp.measureTextHeight(font, text, tw);
      const posFn = POS_FN[link.watermark.position] || POS_FN.br;
      const [x, y] = posFn(W, H, tw, th);
      // 透明度: 先在临时图上打字再 opacity composite
      const layer = await Jimp.create(tw + 8, th + 8, 0x00000000);
      layer.print(font, 4, 4, text);
      layer.opacity(link.watermark.opacity);
      img.composite(layer, x, y);
    }

    const out = await img.getBufferAsync(Jimp.MIME_PNG);
    // 缓存
    try {
      await fs.mkdir(WM_DIR, { recursive: true });
      await fs.writeFile(wmPath, out);
    } catch { /* cache write non-fatal */ }

    return new Response(new Uint8Array(out), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (e) {
    // 合成失败 → 退回原图
    const buf = await fs.readFile(abs);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": guessMime(abs), "Cache-Control": "no-store" },
    });
  }
}

function guessMime(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "application/octet-stream";
}
