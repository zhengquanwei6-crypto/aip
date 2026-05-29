/**
 * v0.16-H1 · 风格基因提取核心算法
 *
 * 输入: 一组本地图片 url (/uploads/xxx.png)
 * 输出: StyleGenome JSON (色板 + 构图分布 + 留白 + 饱和度档位 + 冷暖)
 *
 * 算法（无 LLM）:
 *   1. jimp 读图 → resize 到 200x200（速度优化）
 *   2. 颜色量化（median-cut 简化版）取 top-8 dominant colors
 *   3. HSV 转换统计：饱和度 / 留白 / 冷暖
 *   4. 8x8 网格构图分析 → 中心型/三分型/对角型/留白型概率
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import Jimp from 'jimp';

export interface ExtractedFeature {
  colors: { hex: string; weight: number }[]; // 8 个，按面积加权降序
  whitespaceRatio: number;                    // 0-1
  saturationProfile: '高饱和' | '中饱和' | '低饱和(莫兰迪)';
  warmthBias: '偏冷' | '中性' | '偏暖';
  compositionType: '中心型' | '三分型' | '对角型' | '留白型';
  brightnessVariance: number;
}

export interface StyleGenome {
  primaryPalette: string[];          // 5 个 hex (从 colors 取前 5)
  secondaryPalette: string[];        // 3 个 hex (从 colors 取 6-8)
  compositionBias: Record<string, number>; // 每种构图概率
  whitespaceRatio: number;            // 0-1 平均
  saturationProfile: string;
  warmthBias: string;
  sampleCount: number;
  computedAt: string;                 // ISO
  rawFeatures?: ExtractedFeature[];   // debug/audit
}

const RESIZE_DIM = 200;

/** 把 RGB → HSV (H 0-360, S 0-1, V 0-1) */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return [h, s, v];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Median-cut 简化版（递归切色域） */
interface ColorBox {
  pixels: number[][]; // [r,g,b][]
}
function medianCut(pixels: number[][], k: number): { hex: string; weight: number }[] {
  if (pixels.length === 0) return [];
  let boxes: ColorBox[] = [{ pixels }];

  while (boxes.length < k) {
    // 找最大 box
    let largest = -1, largestIdx = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].pixels.length > largest) {
        largest = boxes[i].pixels.length;
        largestIdx = i;
      }
    }
    const box = boxes[largestIdx];
    if (box.pixels.length < 2) break;

    // 找 R/G/B 最大 range 那个 channel
    let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
    for (const [r, g, b] of box.pixels) {
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (g < minG) minG = g;
      if (g > maxG) maxG = g;
      if (b < minB) minB = b;
      if (b > maxB) maxB = b;
    }
    const rRange = maxR - minR, gRange = maxG - minG, bRange = maxB - minB;
    const channel = rRange >= gRange && rRange >= bRange ? 0 : gRange >= bRange ? 1 : 2;

    // 沿该 channel 排序后从中间切开
    box.pixels.sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(box.pixels.length / 2);
    const left = box.pixels.slice(0, mid);
    const right = box.pixels.slice(mid);
    boxes.splice(largestIdx, 1, { pixels: left }, { pixels: right });
  }

  // 每个 box 取均值 + 像素数权重
  const total = pixels.length;
  return boxes.map((b) => {
    let sumR = 0, sumG = 0, sumB = 0;
    for (const [r, g, bv] of b.pixels) {
      sumR += r;
      sumG += g;
      sumB += bv;
    }
    const n = b.pixels.length || 1;
    return {
      hex: rgbToHex(Math.round(sumR / n), Math.round(sumG / n), Math.round(sumB / n)),
      weight: b.pixels.length / total,
    };
  }).sort((a, b) => b.weight - a.weight);
}

/** 提取单图特征 */
export async function extractFeature(absImagePath: string): Promise<ExtractedFeature> {
  const img = await Jimp.read(absImagePath);
  img.resize(RESIZE_DIM, RESIZE_DIM);

  const pixels: number[][] = [];
  let whiteCount = 0;
  let totalCount = 0;
  let warmCount = 0;
  let coolCount = 0;
  const satBuckets = [0, 0, 0]; // 低/中/高
  const gridBrightness: number[] = new Array(64).fill(0); // 8x8
  const gridCount: number[] = new Array(64).fill(0);

  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x: number, y: number, idx: number) {
    const r = this.bitmap.data[idx];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    pixels.push([r, g, b]);

    const [h, s, v] = rgbToHsv(r, g, b);
    if (v > 0.92 && s < 0.1) whiteCount++;
    if (s < 0.25) satBuckets[0]++;
    else if (s < 0.55) satBuckets[1]++;
    else satBuckets[2]++;
    if (s > 0.15) {
      // 暖色: H 0-60 + 300-360；冷色: 180-260
      if ((h >= 0 && h < 60) || h >= 300) warmCount++;
      else if (h >= 180 && h < 260) coolCount++;
    }
    totalCount++;

    // 8x8 grid
    const gx = Math.min(7, Math.floor((x / RESIZE_DIM) * 8));
    const gy = Math.min(7, Math.floor((y / RESIZE_DIM) * 8));
    const gi = gy * 8 + gx;
    gridBrightness[gi] += v;
    gridCount[gi]++;
  });

  // 颜色量化（采样以提速：每 4 像素一个）
  const sampled = pixels.filter((_, i) => i % 4 === 0);
  const colors = medianCut(sampled, 8);

  const whitespaceRatio = totalCount > 0 ? whiteCount / totalCount : 0;
  const totalSat = satBuckets[0] + satBuckets[1] + satBuckets[2];
  let saturationProfile: ExtractedFeature['saturationProfile'];
  if (totalSat === 0 || satBuckets[0] / totalSat > 0.55) saturationProfile = '低饱和(莫兰迪)';
  else if (satBuckets[2] / totalSat > 0.4) saturationProfile = '高饱和';
  else saturationProfile = '中饱和';

  let warmthBias: ExtractedFeature['warmthBias'];
  if (warmCount > coolCount * 1.5) warmthBias = '偏暖';
  else if (coolCount > warmCount * 1.5) warmthBias = '偏冷';
  else warmthBias = '中性';

  // 构图分析 (8x8 grid 亮度方差)
  const gridAvg = gridBrightness.map((sum, i) => (gridCount[i] > 0 ? sum / gridCount[i] : 0));
  const overallMean = gridAvg.reduce((a, b) => a + b, 0) / 64;
  const variance = gridAvg.reduce((acc, v) => acc + Math.pow(v - overallMean, 2), 0) / 64;

  // 各构图模式得分
  const centerScore = (gridAvg[27] + gridAvg[28] + gridAvg[35] + gridAvg[36]) / 4;
  const ruleOfThirdsRows = [gridAvg[16] + gridAvg[19] + gridAvg[44] + gridAvg[47]];
  const ruleOfThirdsScore = ruleOfThirdsRows[0] / 4;
  const diagScore =
    (gridAvg[0] + gridAvg[9] + gridAvg[18] + gridAvg[27] + gridAvg[36] + gridAvg[45] + gridAvg[54] + gridAvg[63]) / 8;
  // 留白型 = whitespaceRatio 高 + 方差低
  const blankScore = whitespaceRatio * 1.5 + (1 - Math.min(1, variance * 10));

  let compositionType: ExtractedFeature['compositionType'] = '中心型';
  let bestScore = centerScore;
  if (ruleOfThirdsScore > bestScore) {
    bestScore = ruleOfThirdsScore;
    compositionType = '三分型';
  }
  if (diagScore > bestScore) {
    bestScore = diagScore;
    compositionType = '对角型';
  }
  if (blankScore > 1.0) compositionType = '留白型';

  return {
    colors,
    whitespaceRatio,
    saturationProfile,
    warmthBias,
    compositionType,
    brightnessVariance: variance,
  };
}

/** 聚合多张图特征 → StyleGenome */
export function aggregateFeatures(features: ExtractedFeature[]): StyleGenome {
  if (features.length === 0) {
    throw new Error('需要至少 1 张图');
  }

  // 颜色聚合：把所有图的 colors 平摊到 hex 桶里加权
  const colorWeight: Record<string, number> = {};
  for (const f of features) {
    for (const c of f.colors) {
      colorWeight[c.hex] = (colorWeight[c.hex] || 0) + c.weight;
    }
  }
  const allColors = Object.entries(colorWeight)
    .map(([hex, w]) => ({ hex, weight: w / features.length }))
    .sort((a, b) => b.weight - a.weight);

  // 构图分布
  const compCount: Record<string, number> = {};
  for (const f of features) {
    compCount[f.compositionType] = (compCount[f.compositionType] || 0) + 1;
  }
  const compositionBias: Record<string, number> = {};
  for (const [k, v] of Object.entries(compCount)) {
    compositionBias[k] = v / features.length;
  }

  // 饱和度档位投票
  const satCount: Record<string, number> = {};
  for (const f of features) {
    satCount[f.saturationProfile] = (satCount[f.saturationProfile] || 0) + 1;
  }
  const saturationProfile = Object.entries(satCount).sort((a, b) => b[1] - a[1])[0][0];

  // 冷暖
  const warmthCount: Record<string, number> = {};
  for (const f of features) {
    warmthCount[f.warmthBias] = (warmthCount[f.warmthBias] || 0) + 1;
  }
  const warmthBias = Object.entries(warmthCount).sort((a, b) => b[1] - a[1])[0][0];

  // 留白率均值
  const whitespaceRatio =
    features.reduce((acc, f) => acc + f.whitespaceRatio, 0) / features.length;

  return {
    primaryPalette: allColors.slice(0, 5).map((c) => c.hex),
    secondaryPalette: allColors.slice(5, 8).map((c) => c.hex),
    compositionBias,
    whitespaceRatio,
    saturationProfile,
    warmthBias,
    sampleCount: features.length,
    computedAt: new Date().toISOString(),
    rawFeatures: features,
  };
}

/** 从相对 url (/uploads/xxx.png) 解析到容器内绝对路径 */
export function resolveAssetPath(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('/uploads/')) {
    return path.join('/app/public', url);
  }
  return null;
}

/** 主入口: 给定 N 个 asset url，返回 StyleGenome */
export async function buildGenome(assetUrls: string[]): Promise<StyleGenome> {
  const features: ExtractedFeature[] = [];
  for (const url of assetUrls) {
    const abs = resolveAssetPath(url);
    if (!abs) continue;
    try {
      await fs.access(abs);
      const f = await extractFeature(abs);
      features.push(f);
    } catch (e) {
      console.warn('[style-genome/extract]', url, (e as Error).message);
    }
  }
  if (features.length === 0) {
    throw new Error('所有图片都读取失败');
  }
  return aggregateFeatures(features);
}
