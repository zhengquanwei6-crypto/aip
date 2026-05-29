/**
 * v0.16-H2.1 · CIE Lab 色距 + 构图相似度
 *
 * sRGB → Lab (D65 illuminant)
 * Δ E*ab (CIE76) - 简化版，足够人眼粗判
 */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** sRGB linear */
function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** RGB → XYZ (D65) */
function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750;
  const z = lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041;
  return [x * 100, y * 100, z * 100];
}

/** XYZ → Lab (D65) */
function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const Xn = 95.047, Yn = 100.0, Zn = 108.883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / Xn), fy = f(y / Yn), fz = f(z / Zn);
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  return [L, a, b];
}

export function hexToLab(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const xyz = rgbToXyz(rgb[0], rgb[1], rgb[2]);
  return xyzToLab(xyz[0], xyz[1], xyz[2]);
}

/** Δ E*ab (CIE76) - 越小越接近，0-100 范围 */
export function deltaE(lab1: [number, number, number], lab2: [number, number, number]): number {
  const dl = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** 两组色板的平均距离（每个 a 取 b 中最近，avg） */
export function paletteDistance(paletteA: string[], paletteB: string[]): number {
  if (paletteA.length === 0 || paletteB.length === 0) return Infinity;
  const labsA = paletteA.map(hexToLab).filter(Boolean) as [number, number, number][];
  const labsB = paletteB.map(hexToLab).filter(Boolean) as [number, number, number][];
  if (labsA.length === 0 || labsB.length === 0) return Infinity;

  const distances: number[] = [];
  for (const la of labsA) {
    let minD = Infinity;
    for (const lb of labsB) {
      const d = deltaE(la, lb);
      if (d < minD) minD = d;
    }
    distances.push(minD);
  }
  return distances.reduce((a, b) => a + b, 0) / distances.length;
}

/** 风格匹配度 0-100% (基于色板距离倒数 + 构图分布 cos 相似度) */
export function styleMatchScore(
  imagePalette: string[],
  imageComposition: string,
  genome: { primaryPalette: string[]; compositionBias: Record<string, number> },
): { score: number; paletteScore: number; compositionScore: number } {
  // 色板: deltaE 0-30 是接近，30+ 是不像
  const dist = paletteDistance(imagePalette, genome.primaryPalette);
  const paletteScore = Math.max(0, Math.min(100, (1 - Math.min(dist, 60) / 60) * 100));

  // 构图: 当前图的主构图在 genome 里的占比 (0-1) → 0-100
  const compP = genome.compositionBias[imageComposition] ?? 0;
  const compositionScore = Math.min(100, compP * 100);

  // 加权: palette 70% + composition 30%
  const score = paletteScore * 0.7 + compositionScore * 0.3;
  return {
    score: Math.round(score),
    paletteScore: Math.round(paletteScore),
    compositionScore: Math.round(compositionScore),
  };
}
