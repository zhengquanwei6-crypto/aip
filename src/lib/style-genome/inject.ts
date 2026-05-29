/**
 * v0.16-H1 · Style Genome 注入到生图调用
 *
 * 设计原则:
 *   - 软提示 (soft guidance, not hard constraint)
 *   - 失败静默降级 (genome 缺失 → 不注入，调用照常)
 *   - 用户可关 (传 useStyleGenome: false)
 */
import { prisma } from '@/lib/db';
import type { StyleGenome } from './extractor';

let cache: { genome: StyleGenome | null; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 分钟

export async function getCurrentGenome(): Promise<StyleGenome | null> {
  if (cache && cache.expiresAt > Date.now()) return cache.genome;
  try {
    const r = await prisma.setting.findUnique({ where: { key: 'style:genome:current' } });
    if (!r?.value) {
      cache = { genome: null, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }
    const g = JSON.parse(r.value) as StyleGenome;
    cache = { genome: g, expiresAt: Date.now() + CACHE_TTL_MS };
    return g;
  } catch {
    return null;
  }
}

export function invalidateGenomeCache(): void {
  cache = null;
}

/** 生成可注入到 LLM system prompt 的英文软提示段 */
export function genomeToPromptHint(g: StyleGenome): string {
  const palette = g.primaryPalette.slice(0, 5).join(', ');
  const topComp = Object.entries(g.compositionBias)
    .sort((a, b) => b[1] - a[1])[0];
  const compHint = topComp ? `prefer ${topComp[0]} composition (${(topComp[1] * 100).toFixed(0)}% of past works)` : '';
  return [
    '## Brand style preferences (use as soft guidance, not hard constraint):',
    `- Color palette: ${palette}`,
    `- Saturation: ${g.saturationProfile}`,
    `- Warmth: ${g.warmthBias}`,
    `- Whitespace ratio target: ${(g.whitespaceRatio * 100).toFixed(0)}%`,
    compHint && `- Composition: ${compHint}`,
  ].filter(Boolean).join('\n');
}

/** 把 genome 提示拼到 messages[] 末尾的 system 消息 */
export async function injectGenomeIntoMessages<T extends { role: string; content: string }>(
  messages: T[],
  options?: { skip?: boolean },
): Promise<{ messages: T[]; applied: boolean; genome?: StyleGenome }> {
  if (options?.skip) return { messages, applied: false };
  const g = await getCurrentGenome();
  if (!g) return { messages, applied: false };
  const hint = genomeToPromptHint(g);
  // 如果有 system 消息，append；否则插一条
  const out = [...messages];
  const sysIdx = out.findIndex((m) => m.role === 'system');
  if (sysIdx >= 0) {
    out[sysIdx] = { ...out[sysIdx], content: out[sysIdx].content + '\n\n' + hint } as T;
  } else {
    out.unshift({ role: 'system', content: hint } as unknown as T);
  }
  return { messages: out, applied: true, genome: g };
}
