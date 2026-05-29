/**
 * v0.16-H2.2 · Critic 批注框 overlay (jimp)
 *
 * 输入: 原图 dataUrl + comments[{x,y,w,h,severity,label}]
 * 输出: 带批注框的 dataUrl
 *
 * severity → 颜色:
 *   high   = red   (#E11D48)
 *   medium = amber (#F59E0B)
 *   low    = green (#10B981)
 */
import Jimp from 'jimp';

export type Severity = 'high' | 'medium' | 'low';

export interface Comment {
  x: number;        // 0-1 比例
  y: number;        // 0-1 比例
  w: number;        // 0-1 比例
  h: number;        // 0-1 比例
  severity: Severity;
  label?: string;   // 短英文标签 (中文用 jimp 易糊)
  index?: number;   // 编号
}

const COLORS: Record<Severity, number> = {
  high: 0xE11D48ff,
  medium: 0xF59E0Bff,
  low: 0x10B981ff,
};

function drawRect(img: Jimp, x: number, y: number, w: number, h: number, color: number, thickness = 4) {
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W - 1, Math.floor(x + w));
  const y1 = Math.min(H - 1, Math.floor(y + h));

  for (let t = 0; t < thickness; t++) {
    // top + bottom
    for (let xi = x0; xi <= x1; xi++) {
      if (y0 + t < H) img.setPixelColor(color, xi, y0 + t);
      if (y1 - t >= 0) img.setPixelColor(color, xi, y1 - t);
    }
    // left + right
    for (let yi = y0; yi <= y1; yi++) {
      if (x0 + t < W) img.setPixelColor(color, x0 + t, yi);
      if (x1 - t >= 0) img.setPixelColor(color, x1 - t, yi);
    }
  }
}

function drawCircleFilled(img: Jimp, cx: number, cy: number, radius: number, color: number) {
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) {
        const px = cx + dx, py = cy + dy;
        if (px >= 0 && px < W && py >= 0 && py < H) {
          img.setPixelColor(color, px, py);
        }
      }
    }
  }
}

/** 在图上画批注 + 编号圆角 */
export async function drawOverlay(
  sourceDataUrl: string,
  comments: Comment[],
): Promise<string> {
  // dataUrl → buffer
  const m = sourceDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!m) throw new Error('需要 data:image/...;base64,... 格式');
  const buf = Buffer.from(m[1], 'base64');
  const img = await Jimp.read(buf);

  // 限制最大尺寸 1024 (overlay 看清楚就行)
  if (img.bitmap.width > 1024 || img.bitmap.height > 1024) {
    img.scaleToFit(1024, 1024);
  }
  const W = img.bitmap.width;
  const H = img.bitmap.height;

  // 加载内置字体
  const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE).catch(() => null);

  comments.forEach((c, i) => {
    const x = c.x * W;
    const y = c.y * H;
    const w = c.w * W;
    const h = c.h * H;
    const color = COLORS[c.severity] || COLORS.medium;
    drawRect(img, x, y, w, h, color, Math.max(3, Math.round(W / 250)));

    // 编号圆角左上角
    const num = c.index ?? (i + 1);
    const radius = Math.max(14, Math.round(W / 60));
    drawCircleFilled(img, x + radius, y + radius, radius, color);
    if (font) {
      img.print(font, x + radius - 6, y + radius - 16, String(num));
    }
  });

  // 输出 PNG dataUrl
  const out = await img.getBufferAsync(Jimp.MIME_PNG);
  return `data:image/png;base64,${out.toString('base64')}`;
}

/** 把 dataUrl 缩到 max 边再返回 dataUrl (上传给 vision LLM 减少 token) */
export async function shrinkForVision(sourceDataUrl: string, maxDim = 1024): Promise<string> {
  const m = sourceDataUrl.match(/^data:image\/([^;]+);base64,(.+)$/);
  if (!m) return sourceDataUrl;
  const buf = Buffer.from(m[2], 'base64');
  const img = await Jimp.read(buf);
  if (img.bitmap.width > maxDim || img.bitmap.height > maxDim) {
    img.scaleToFit(maxDim, maxDim);
  }
  const out = await img.getBufferAsync(Jimp.MIME_JPEG);
  return `data:image/jpeg;base64,${out.toString('base64')}`;
}
