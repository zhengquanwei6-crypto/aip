/**
 * v0.18-SHARE4 · GET /api/share/[shareId]/image
 *
 * 分享图片的唯一字节出口（不直接暴露 /uploads）。中心思想：
 *   让客户看清全分辨率原图质量，但拿到的每一张都布满洗不掉、可溯源的水印，
 *   防止白嫖成品 / 骗稿。
 *
 *   - 先判失效，失效返回 403
 *   - watermark.enabled:
 *       · mode="tiled"  → 满铺斜纹水印（裁剪/克隆都去不掉）+ 溯源串
 *       · mode="corner" → 旧版单角标（兼容老链接）
 *   - 否则直接返回原图字节
 *   - **保留原始分辨率**（不缩图、不降质），客户能验证质量为真
 *   - 合成结果缓存到 /uploads/share-wm/{shareId}.png
 *
 * 访问计数 + 日志写在 /s/[shareId] 页的 view-register，不在这里。
 */
import { NextRequest, NextResponse } from "next/server";
import { getShare, checkExpiry, type ShareLink } from "@/lib/share/store";
import { promises as fs } from "node:fs";
import path from "node:path";
import Jimp from "jimp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WM_DIR = "/app/public/uploads/share-wm";

function resolveLocal(url: string): string | null {
  if (url.startsWith("/uploads/")) return path.join("/app/public", url);
  if (url.startsWith("/") && !url.startsWith("/api/")) return path.join("/app/public", url);
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

  const reason = checkExpiry(link, { ignoreMaxViews: true });
  if (reason !== "ok") {
    return NextResponse.json({ error: "expired", reason }, { status: 403 });
  }

  let asset: { buffer: Buffer; mime: string };
  try {
    asset = await readAssetBytes(link.assetUrl);
  } catch (e) {
    return NextResponse.json({ error: "asset unavailable", detail: (e as Error).message }, { status: 404 });
  }

  // 无水印 → 直接返回原图
  if (!link.watermark.enabled) {
    return new Response(new Uint8Array(asset.buffer), {
      headers: { "Content-Type": asset.mime, "Cache-Control": "no-store" },
    });
  }

  // 缓存 key 带 mode，旧缓存（单角标）不会污染新模式
  const mode = link.watermark.mode === "corner" ? "corner" : "tiled";
  const wmPath = path.join(WM_DIR, `${link.shareId}.${mode}.png`);
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
    const img = await Jimp.read(asset.buffer);
    if (mode === "tiled") {
      await applyTiledWatermark(img, link);
    } else {
      await applyCornerWatermark(img, link);
    }

    const out = await img.getBufferAsync(Jimp.MIME_PNG);
    try {
      await fs.mkdir(WM_DIR, { recursive: true });
      await fs.writeFile(wmPath, out);
    } catch {
      /* cache write non-fatal */
    }

    return new Response(new Uint8Array(out), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (e) {
    // 合成失败 → 退回原图（宁可给原图也不要 500，保证客户能看）
    console.error("[share] watermark composite failed:", (e as Error).message);
    return new Response(new Uint8Array(asset.buffer), {
      headers: { "Content-Type": asset.mime, "Cache-Control": "no-store" },
    });
  }
}

async function readAssetBytes(assetUrl: string): Promise<{ buffer: Buffer; mime: string }> {
  const local = resolveLocal(assetUrl);
  if (local) {
    await fs.access(local);
    const buffer = await fs.readFile(local);
    return { buffer, mime: guessMime(local) };
  }

  if (assetUrl.startsWith("data:image/")) {
    const match = assetUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("invalid data url");
    return { buffer: Buffer.from(match[2], "base64"), mime: match[1] };
  }

  if (/^https?:\/\//i.test(assetUrl)) {
    const response = await fetch(assetUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`remote image ${response.status}`);
    const mime = response.headers.get("content-type")?.split(";")[0] || guessMime(assetUrl);
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mime };
  }

  throw new Error("asset path invalid");
}

/**
 * 满铺斜纹水印 —— 防骗稿核心。
 *
 * 做法：
 *   1. 选字号（随图宽自适应，保证高清大图上水印不至于太小）
 *   2. 渲染一块"水印单元"（白字 + 黑描边底，保证在亮/暗图上都看得见）
 *   3. 旋转 tileAngle 度
 *   4. 以 tileDensity 间距在整张图上平铺 composite
 *   5. 文案末尾附溯源串（shareId / clientLabel）—— 泄露后能追到是哪条分享
 *
 * 关键：水印铺满全图，客户裁掉一块、用克隆图章抹一处都没用；但单条水印
 * 半透明且不挡主体细节，客户依然能看清全分辨率质量。
 */
async function applyTiledWatermark(img: Jimp, link: ShareLink): Promise<void> {
  const W = img.bitmap.width;
  const H = img.bitmap.height;

  const baseText = (link.watermark.text || "果冻的AI").slice(0, 30);
  // 溯源串：shareId 一定带；clientLabel 有就带（如"张三-餐饮Logo"）
  const trace = link.clientLabel
    ? `${link.clientLabel} · ${link.shareId}`
    : `预览样稿 · ${link.shareId}`;

  const opacity = clamp(link.watermark.opacity ?? 0.18, 0.05, 0.6);
  const angle = typeof link.watermark.tileAngle === "number" ? link.watermark.tileAngle : -30;
  const density = clamp(link.watermark.tileDensity ?? 0.26, 0.12, 0.6);

  // 字号：优先 fontScale（占图宽比例）映射三档；否则随图宽自适应
  const long = Math.max(W, H);
  let mainSize: number;
  if (typeof link.watermark.fontScale === "number" && link.watermark.fontScale > 0) {
    const px = link.watermark.fontScale * W;
    mainSize = px >= 50 ? 64 : px >= 26 ? 32 : 16;
  } else {
    mainSize = long > 1600 ? 64 : long > 700 ? 32 : 16;
  }
  const subSize = mainSize >= 64 ? 32 : 16;
  const mainFontW = await loadFont(mainSize, "white");
  const mainFontB = await loadFont(mainSize, "black");
  const subFontW = await loadFont(subSize, "white");
  const subFontB = await loadFont(subSize, "black");
  if (!mainFontW) {
    console.error("[share] tiled watermark: white font failed to load, skipping");
    return;
  }

  // 1) 渲染单个水印单元（主文案 + 下方溯源小字），白字 + 黑描边
  const mainW = Jimp.measureText(mainFontW, baseText);
  const mainH = Jimp.measureTextHeight(mainFontW, baseText, mainW + 40);
  const subW = subFontW ? Jimp.measureText(subFontW, trace) : 0;
  const subH = subFontW ? Jimp.measureTextHeight(subFontW, trace, subW + 40) : 0;

  const pad = Math.round(mainSize / 6) + 4;
  const unitW = Math.max(mainW, subW) + pad * 2 + 4;
  const unitH = mainH + subH + 12 + pad * 2;

  const unit = await Jimp.create(unitW, unitH, 0x00000000);
  // 主文案
  printOutlined(unit, mainFontW, mainFontB, pad, pad, baseText, unitW);
  // 溯源串
  if (subFontW && subFontB) {
    printOutlined(unit, subFontW, subFontB, pad, pad + mainH + 8, trace, unitW);
  }
  unit.opacity(opacity);

  // 2) 旋转
  unit.rotate(angle, false); // false = 不放大画布到 resize，保持透明
  const rW = unit.bitmap.width;
  const rH = unit.bitmap.height;

  // 3) 平铺：步距 = 图宽 * density，错位排列（砖墙式）更难裁
  const stepX = Math.max(rW * 0.6, Math.round(W * density));
  const stepY = Math.max(rH * 0.6, Math.round(H * density));
  let row = 0;
  for (let y = -rH; y < H + rH; y += stepY) {
    const offset = row % 2 === 0 ? 0 : Math.round(stepX / 2);
    for (let x = -rW + offset; x < W + rW; x += stepX) {
      img.composite(unit, x, y, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 1,
        opacityDest: 1,
      });
    }
    row++;
  }
}

/** 单角标 / 自定义坐标水印。 */
async function applyCornerWatermark(img: Jimp, link: ShareLink): Promise<void> {
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  const wm = link.watermark;

  // 字号：优先用 fontScale（占图宽比例）映射到 jimp 的 16/32/64 三档；否则按图宽自适应
  let size: number;
  if (typeof wm.fontScale === "number" && wm.fontScale > 0) {
    const px = wm.fontScale * W;
    size = px >= 50 ? 64 : px >= 26 ? 32 : 16;
  } else {
    size = W > 800 ? 64 : 32;
  }
  const fontW = await loadFont(size, "white");
  const fontB = await loadFont(size, "black");
  if (!fontW) {
    console.error("[share] corner watermark: white font failed to load, skipping");
    return;
  }
  const text = wm.text || "果冻的AI";
  const tw = Jimp.measureText(fontW, text);
  const th = Jimp.measureTextHeight(fontW, text, tw + 20);

  // 坐标：自定义百分比优先；否则用 5 预设
  let x: number;
  let y: number;
  if (typeof wm.offsetXPct === "number" || typeof wm.offsetYPct === "number") {
    const [px, py] = (POS_FN[wm.position] || POS_FN.br)(W, H, tw, th);
    x = typeof wm.offsetXPct === "number" ? Math.round(wm.offsetXPct * W) : px;
    y = typeof wm.offsetYPct === "number" ? Math.round(wm.offsetYPct * H) : py;
    // 夹紧不越界（留点边）
    x = clamp(x, 0, Math.max(0, W - tw));
    y = clamp(y, 0, Math.max(0, H - th));
  } else {
    [x, y] = (POS_FN[wm.position] || POS_FN.br)(W, H, tw, th);
  }

  const layer = await Jimp.create(tw + 12, th + 12, 0x00000000);
  if (fontB) printOutlined(layer, fontW, fontB, 6, 6, text, tw + 12);
  else layer.print(fontW, 6, 6, text);
  layer.opacity(clamp(wm.opacity ?? 0.5, 0.1, 1));
  img.composite(layer, x, y);
}

/** 缓存字体 loader（white/black × size）。 */
const FONT_CACHE: Record<string, any> = {};
async function loadFont(size: number, color: "white" | "black"): Promise<any> {
  const key = `${size}-${color}`;
  if (FONT_CACHE[key]) return FONT_CACHE[key];
  const map: Record<string, string> = {
    "16-white": Jimp.FONT_SANS_16_WHITE,
    "32-white": Jimp.FONT_SANS_32_WHITE,
    "64-white": Jimp.FONT_SANS_64_WHITE,
    "16-black": Jimp.FONT_SANS_16_BLACK,
    "32-black": Jimp.FONT_SANS_32_BLACK,
    "64-black": Jimp.FONT_SANS_64_BLACK,
  };
  const f = await Jimp.loadFont(map[key] || Jimp.FONT_SANS_32_WHITE).catch(() => null);
  if (f) FONT_CACHE[key] = f;
  return f;
}

/**
 * 白字 + 黑描边：先在 8 个偏移位打黑字做描边，再在中心打白字。
 * 保证水印在亮图 / 暗图上都清晰可辨（防止客户故意找亮区截图逃避水印）。
 */
function printOutlined(
  target: Jimp,
  fontWhite: any,
  fontBlack: any,
  x: number,
  y: number,
  text: string,
  maxW: number,
): void {
  const o = 1; // 描边偏移像素
  const offsets: [number, number][] = [
    [-o, -o], [0, -o], [o, -o],
    [-o, 0], [o, 0],
    [-o, o], [0, o], [o, o],
  ];
  if (fontBlack) {
    for (const [dx, dy] of offsets) {
      target.print(fontBlack, x + dx, y + dy, { text }, maxW);
    }
  }
  target.print(fontWhite, x, y, { text }, maxW);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function guessMime(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "application/octet-stream";
}
