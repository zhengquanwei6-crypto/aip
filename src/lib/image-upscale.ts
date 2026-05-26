/**
 * v0.13 B5 · 图片软放大（post-process）
 *
 * 用途：上游协议（如 OpenAI gpt-image-2）只支持 1024×1024 / 1024×1536 / 1536×1024 三档原生分辨率。
 * 用户想要 2K/4K 时，上游照常出 1K，落盘前用 jimp bicubic 等比放大长边到 2048/4096。
 *
 * 注意：
 *   - 这是软放大（双三次插值），不是真 super-resolution。画质 = 原 1K 画质平铺到大尺寸。
 *   - 真要"提升细节"需要 Real-ESRGAN / SD upscale 等，本批不做。
 *   - 0 LLM/IMAGE token · 完全本地 jimp。
 *   - jimp 0.22 的 PNG 解码用 pngjs（无内存上限），JPEG 用 jpeg-js（B4.2 已抬到 4096MB）。
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';

export type OutputTier = '1k' | '2k' | '4k';

export interface UpscaleResult {
  /** 新文件 /uploads/xxx_2k.png */
  url: string;
  fileName: string;
  /** 实际输出宽 */
  width: number;
  /** 实际输出高 */
  height: number;
  /** 字节 */
  bytes: number;
  /** 应用了哪个 tier */
  appliedTier: OutputTier;
  /** 是否真的执行了放大（1k 或 已经超大时 = false） */
  upscaled: boolean;
}

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');

async function loadJimp(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod: any = await import('jimp');
  return mod.default ?? mod;
}

function tierToTargetLong(tier: OutputTier): number {
  if (tier === '4k') return 4096;
  if (tier === '2k') return 2048;
  return 1024;
}

/**
 * 把本地 /uploads/<file> 按 tier 软放大。
 *
 * - 1k → 不放大，直接返回原 URL（upscaled=false）
 * - 2k/4k → 长边等比放大到 2048/4096，bicubic 插值
 *
 * 输入超过目标长边时不再放大（避免缩小操作）。
 */
export async function upscaleLocal(
  localUrl: string,
  tier: OutputTier,
): Promise<UpscaleResult> {
  // 1k 不动
  if (tier === '1k') {
    return await peek(localUrl, '1k', false);
  }

  // 校验路径
  if (!localUrl.startsWith('/uploads/')) {
    throw new Error(`upscale 仅支持 /uploads/<file> 路径：${localUrl}`);
  }
  const fn = localUrl.replace('/uploads/', '');
  if (fn.includes('..') || fn.includes('/') || fn.includes('\\')) {
    throw new Error('非法 fileName');
  }

  const Jimp = await loadJimp();

  // jpeg-js 内存上限提到 4096MB（沿袭 v0.13 B4.2）
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jpegJs: any = require('jpeg-js');
    const J: any = jpegJs.JpegImage || jpegJs.default?.JpegImage;
    if (J && typeof J.resetMaxMemoryUsage === 'function') {
      J.resetMaxMemoryUsage(4096 * 1024 * 1024);
    }
  } catch {
    /* ignore */
  }

  const absSrc = path.join(UPLOAD_ROOT, fn);
  const img = await Jimp.read(absSrc);
  const w0: number = img.bitmap.width;
  const h0: number = img.bitmap.height;
  const longSide = Math.max(w0, h0);
  const target = tierToTargetLong(tier);

  // 已经够大 → 不动
  if (longSide >= target) {
    return await peek(localUrl, tier, false);
  }

  // 等比 resize：长边 = target
  let newW: number;
  let newH: number;
  if (w0 >= h0) {
    newW = target;
    newH = Math.round((h0 / w0) * target);
  } else {
    newH = target;
    newW = Math.round((w0 / h0) * target);
  }

  // jimp 0.22 的 RESIZE_BICUBIC = 'bicubicInterpolation'
  img.resize(newW, newH, Jimp.RESIZE_BICUBIC);

  // 写新文件
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  const id = Math.random().toString(16).slice(2, 18).padStart(16, '0');
  const fileName = `${Date.now()}_${id}_${tier}.png`;
  const absOut = path.join(UPLOAD_ROOT, fileName);
  await img.writeAsync(absOut);
  const stat = await fs.stat(absOut);

  return {
    url: `/uploads/${fileName}`,
    fileName,
    width: newW,
    height: newH,
    bytes: stat.size,
    appliedTier: tier,
    upscaled: true,
  };
}

/** 读现有文件维度（不动文件） */
async function peek(localUrl: string, tier: OutputTier, upscaled: boolean): Promise<UpscaleResult> {
  const fn = localUrl.replace('/uploads/', '');
  const abs = path.join(UPLOAD_ROOT, fn);
  let width = 0;
  let height = 0;
  let bytes = 0;
  try {
    const buf = await fs.readFile(abs);
    bytes = buf.byteLength;
    if (buf.length >= 24 && buf.toString('ascii', 1, 4) === 'PNG') {
      width = buf.readUInt32BE(16);
      height = buf.readUInt32BE(20);
    }
  } catch {
    /* file may not exist; return zero */
  }
  return {
    url: localUrl,
    fileName: fn,
    width,
    height,
    bytes,
    appliedTier: tier,
    upscaled,
  };
}

/** body 中拿到的字符串安全转 OutputTier */
export function parseOutputTier(v: unknown): OutputTier {
  if (v === '4k' || v === '4K') return '4k';
  if (v === '2k' || v === '2K') return '2k';
  return '1k';
}
