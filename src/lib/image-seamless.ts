/**
 * v0.13 B4 · 无缝纹理算法（瓷砖 / 布料 / 大理石等规则纹理）
 *
 * 思路：经典 offset + feather blend
 *   1) 用 jimp 读图 → W×H 像素阵列
 *   2) 整图水平移动 W/2 + 竖直移动 H/2 → 原本"图边"被推到中心，"中心"被推到边缘 → 边缘自动接合
 *   3) 但中心被推到边缘后，新中心出现两条接缝（一条水平 + 一条竖直）→ 用羽化叠加抹平：
 *      - 水平缝：在 y ∈ [H/2 - feather, H/2 + feather] 区间，按距离权重把"原图未移动版"叠加上去
 *      - 竖直缝：x 同理
 *   4) 保留原图主体外观（变动最小），仅中心 ±feather 像素受影响
 *
 * 不调 LLM、不调上游 API、不消耗 token。
 *
 * 0 schema · 0 LLM/IMAGE · 完全本地 jimp（已装）。
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
// jimp 在 next.config.js serverComponentsExternalPackages 里，运行时 require
// 用 dynamic import 兼容 ESM/CJS 双形态
async function loadJimp(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod: any = await import('jimp');
  return mod.default ?? mod;
}

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');

export interface SeamlessResult {
  url: string; // /uploads/xxx_seamless.png
  fileName: string;
  width: number;
  height: number;
  featherPx: number;
  bytes: number;
}

/**
 * 把一张本地图变成无缝平铺。
 * @param sourceAbsPath 源图绝对路径
 * @param featherPercent 羽化区域占短边的百分比（0–30），默认 5。
 *                       featherPercent=5 在 1024×1024 图上 = 51 像素羽化区域。
 *                       数值越大 → 接缝过渡越柔，但中心区域被改动得越多；
 *                       数值越小 → 中心改动越少，但接缝可能可见。
 */
export async function makeSeamless(
  sourceAbsPath: string,
  featherPercent = 5,
): Promise<SeamlessResult> {
  const Jimp = await loadJimp();

  // 1) 读源图（v0.13 B4.1: 解除 jimp 默认 256MB 解码上限，给 1024MB 余量；超大图自动降到 4096）
  const orig = await Jimp.read({ src: sourceAbsPath, maxMemoryUsageInMB: 1024 } as any);
  // 大图保护：超过 4096×4096 自动等比缩到长边 4096，避免后续 W*H 像素扫描耗时过长
  const MAX_DIM = 4096;
  if (orig.bitmap.width > MAX_DIM || orig.bitmap.height > MAX_DIM) {
    if (orig.bitmap.width >= orig.bitmap.height) {
      orig.resize(MAX_DIM, Jimp.AUTO);
    } else {
      orig.resize(Jimp.AUTO, MAX_DIM);
    }
  }
  const W: number = orig.bitmap.width;
  const H: number = orig.bitmap.height;
  if (W < 16 || H < 16) {
    throw new Error(`图像过小（${W}x${H}），无缝处理需要至少 16×16`);
  }

  // 2) 偏移版（horizontal + vertical 各半）
  // 直接用 jimp 的 .clone() + 复制像素实现 offset
  const shifted = orig.clone();
  // shifted[x, y] = orig[(x + W/2) % W, (y + H/2) % H]
  const halfW = Math.floor(W / 2);
  const halfH = Math.floor(H / 2);
  // 用底层 bitmap 直接拷贝，比 jimp .scan 快
  const oBuf: Buffer = orig.bitmap.data;
  const sBuf: Buffer = shifted.bitmap.data;
  for (let y = 0; y < H; y++) {
    const srcY = (y + halfH) % H;
    for (let x = 0; x < W; x++) {
      const srcX = (x + halfW) % W;
      const oIdx = (srcY * W + srcX) * 4;
      const sIdx = (y * W + x) * 4;
      sBuf[sIdx] = oBuf[oIdx];
      sBuf[sIdx + 1] = oBuf[oIdx + 1];
      sBuf[sIdx + 2] = oBuf[oIdx + 2];
      sBuf[sIdx + 3] = oBuf[oIdx + 3];
    }
  }

  // 3) 羽化叠加：在 shifted 的中心十字区域，按距离权重融合 orig（未偏移）
  const shortSide = Math.min(W, H);
  const feather = Math.max(
    2,
    Math.min(Math.floor(shortSide * 0.3), Math.floor((shortSide * featherPercent) / 100)),
  );
  // 水平接缝：y ∈ [halfH - feather, halfH + feather]
  // 竖直接缝：x ∈ [halfW - feather, halfW + feather]
  // 在十字相交处取两个权重的最大值
  const result = shifted; // 直接改 shifted 的 bitmap
  const rBuf = result.bitmap.data;

  for (let y = 0; y < H; y++) {
    const dy = Math.abs(y - halfH);
    const wY = dy < feather ? 1 - dy / feather : 0; // 水平缝权重
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - halfW);
      const wX = dx < feather ? 1 - dx / feather : 0; // 竖直缝权重
      const w = Math.max(wX, wY); // 十字交叠取最大
      if (w === 0) continue;

      const idx = (y * W + x) * 4;
      const oIdx = idx; // orig 是同尺寸，索引一致
      // 线性插值：result = result * (1 - w) + orig * w
      // 但羽化目的是"用偏移图覆盖原图的中心 → 反过来：让原图覆盖偏移图的接缝"
      // 准确说：接缝处当前是偏移图，要把原图（无缝问题在边缘）的对应位置"借"过来。
      // 但原图边缘不无缝，所以更稳的做法：在偏移图的接缝处，从 orig 取"另一侧"像素
      // 简化：直接 shifted * (1-w) + orig * w，让中心带有原图的一些细节回归（变动最小）
      rBuf[idx] = Math.round(rBuf[idx] * (1 - w) + oBuf[oIdx] * w);
      rBuf[idx + 1] = Math.round(rBuf[idx + 1] * (1 - w) + oBuf[oIdx + 1] * w);
      rBuf[idx + 2] = Math.round(rBuf[idx + 2] * (1 - w) + oBuf[oIdx + 2] * w);
      // alpha 不动
    }
  }

  // 4) 保存
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  const id = Math.random().toString(16).slice(2, 18).padStart(16, '0');
  const fileName = `${Date.now()}_${id}_seamless.png`;
  const absOut = path.join(UPLOAD_ROOT, fileName);
  await result.writeAsync(absOut);
  const stat = await fs.stat(absOut);

  return {
    url: `/uploads/${fileName}`,
    fileName,
    width: W,
    height: H,
    featherPx: feather,
    bytes: stat.size,
  };
}
