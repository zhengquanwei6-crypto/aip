/**
 * lib/image-size.ts — 图片尺寸归一化
 *
 * 背景：OpenAI gpt-image-2 / DALL-E-3 / 大多数兼容中转站只接受少数固定尺寸：
 *   gpt-image-2: 1024x1024 / 1024x1536 / 1536x1024 / auto
 *   dall-e-3   : 1024x1024 / 1792x1024 / 1024x1792
 * 但用户/前端常传 1080x1440、960x720 这类自由尺寸。中转站（如 4router）
 * 看到非标准尺寸往往返回模糊错误，例如「分组 GptPro 下模型 gpt-image-2 的可用渠道不存在」，
 * 用户根本看不出是参数问题。
 *
 * 这里按宽高比映射到目标候选集中最近的一个，并记录 trace 供排错。
 */

export interface NormalizedSize {
  /** 实际发给 upstream 的尺寸 */
  size: string;
  /** 用户原始请求 */
  original?: string;
  /** 是否被改写过 */
  rewritten: boolean;
  /** 改写原因，便于在 trace / UI tooltip 中展示 */
  reason?: string;
}

/** OpenAI gpt-image-2 / 4router 兼容的离散尺寸集合 */
const GPT_IMAGE_2: { size: string; w: number; h: number }[] = [
  { size: '1024x1024', w: 1024, h: 1024 },
  { size: '1024x1536', w: 1024, h: 1536 },
  { size: '1536x1024', w: 1536, h: 1024 },
];

/** dall-e-3 的离散尺寸集合（保留兼容老 adapter） */
const DALLE_3: { size: string; w: number; h: number }[] = [
  { size: '1024x1024', w: 1024, h: 1024 },
  { size: '1024x1792', w: 1024, h: 1792 },
  { size: '1792x1024', w: 1792, h: 1024 },
];

function parseSize(s: string | undefined): { w: number; h: number } | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{2,5})\s*[xX×]\s*(\d{2,5})$/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

function pickByAspectRatio(
  parsed: { w: number; h: number },
  pool: { size: string; w: number; h: number }[],
): { size: string; w: number; h: number } {
  // 按宽高比的 |log(ratio_in / ratio_pool)| 找最近的；相等时取最大像素数
  const ratioIn = parsed.w / parsed.h;
  let best = pool[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const p of pool) {
    const ratioP = p.w / p.h;
    const score = Math.abs(Math.log(ratioIn) - Math.log(ratioP));
    if (
      score < bestScore - 1e-9 ||
      (Math.abs(score - bestScore) < 1e-9 && p.w * p.h > best.w * best.h)
    ) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

/** OpenAI gpt-image-2 / 任意 4router 路由的归一化 */
export function normalizeSizeForGptImage2(input?: string): NormalizedSize {
  if (!input || input === 'auto') {
    return { size: input ?? '1024x1024', original: input, rewritten: false };
  }
  // 已经是合法值
  if (GPT_IMAGE_2.some((p) => p.size === input)) {
    return { size: input, original: input, rewritten: false };
  }
  const parsed = parseSize(input);
  if (!parsed) {
    return {
      size: '1024x1024',
      original: input,
      rewritten: true,
      reason: `无法解析尺寸 "${input}"，回退到 1024x1024`,
    };
  }
  const best = pickByAspectRatio(parsed, GPT_IMAGE_2);
  return {
    size: best.size,
    original: input,
    rewritten: true,
    reason: `${input} → ${best.size}（按宽高比就近映射；上游只支持 ${GPT_IMAGE_2.map((p) => p.size).join(' / ')}）`,
  };
}

/** dall-e-3 的归一化（保留以备扩展） */
export function normalizeSizeForDalle3(input?: string): NormalizedSize {
  if (!input) return { size: '1024x1024', original: input, rewritten: false };
  if (DALLE_3.some((p) => p.size === input)) {
    return { size: input, original: input, rewritten: false };
  }
  const parsed = parseSize(input);
  if (!parsed) {
    return {
      size: '1024x1024',
      original: input,
      rewritten: true,
      reason: `无法解析尺寸 "${input}"，回退到 1024x1024`,
    };
  }
  const best = pickByAspectRatio(parsed, DALLE_3);
  return {
    size: best.size,
    original: input,
    rewritten: true,
    reason: `${input} → ${best.size}（按宽高比就近映射）`,
  };
}

/**
 * 根据 adapter 描述选择合适的归一化器。
 * 启发式：bodyTemplate 中模型名包含 gpt-image / gpt-img / dall-e-3 时分别匹配。
 * 找不到匹配时不归一化（透传）。
 */
export function normalizeSizeForAdapter(
  input: string | undefined,
  adapterModelHint?: string,
): NormalizedSize {
  const hint = (adapterModelHint || '').toLowerCase();
  if (hint.includes('gpt-image') || hint.includes('gpt-img')) {
    return normalizeSizeForGptImage2(input);
  }
  if (hint.includes('dall-e-3') || hint.includes('dalle-3')) {
    return normalizeSizeForDalle3(input);
  }
  return { size: input ?? '1024x1024', original: input, rewritten: false };
}
