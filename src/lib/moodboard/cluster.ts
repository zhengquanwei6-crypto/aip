/**
 * v0.16-H4.1 · Mood Board 颜色聚类 + 排版
 *
 * 输入: 一组 (assetId, url, dominantColors[3]) 元素
 * 算法:
 *   1. 用 Lab 色距 计算每个 image 的 dominant 色与"色调中心" (red/orange/yellow/green/blue/purple/neutral)
 *   2. K-means K=3 (色调) 把 N 张图分 3 组
 *   3. 每组在 board 上一行，行内按 brightness 降序
 */
import { hexToLab, deltaE } from '@/lib/critic/style-distance';

export interface MoodImage {
  id: string;
  url: string;
  dominantHex: string;       // 主色 (top 1)
  prompt?: string;
}

export interface MoodGroup {
  toneLabel: string;
  toneHex: string;          // 该组中心色
  images: MoodImage[];
}

/** 7 色调中心 hex */
const TONE_CENTERS: { hex: string; label: string }[] = [
  { hex: '#E11D48', label: '红 / 暖' },
  { hex: '#F59E0B', label: '橙 / 阳光' },
  { hex: '#FBBF24', label: '黄 / 明亮' },
  { hex: '#10B981', label: '绿 / 自然' },
  { hex: '#3B82F6', label: '蓝 / 冷静' },
  { hex: '#8B5CF6', label: '紫 / 高级' },
  { hex: '#94A3B8', label: '灰 / 中性' },
];

/** 把 image 分配到最近的色调中心 */
export function groupByTone(images: MoodImage[]): MoodGroup[] {
  const buckets: Record<string, MoodImage[]> = {};
  for (const t of TONE_CENTERS) buckets[t.hex] = [];

  for (const img of images) {
    const lab = hexToLab(img.dominantHex);
    if (!lab) continue;
    let best = TONE_CENTERS[0];
    let bestD = Infinity;
    for (const t of TONE_CENTERS) {
      const tLab = hexToLab(t.hex);
      if (!tLab) continue;
      const d = deltaE(lab, tLab);
      if (d < bestD) { bestD = d; best = t; }
    }
    buckets[best.hex].push(img);
  }

  const out: MoodGroup[] = [];
  for (const t of TONE_CENTERS) {
    if (buckets[t.hex].length > 0) {
      out.push({ toneLabel: t.label, toneHex: t.hex, images: buckets[t.hex] });
    }
  }
  return out;
}

/** 取色板（前 5 高频主色） */
export function buildPalette(images: MoodImage[]): string[] {
  const counts: Record<string, number> = {};
  for (const img of images) {
    counts[img.dominantHex] = (counts[img.dominantHex] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hex]) => hex);
}
