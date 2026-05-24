/**
 * /api/agents/photo-director/build
 *
 * v0.11 B7：body.imageOptions { size?, quality? } 仅回显
 * v0.11 B9：body.imageOptions 加 aspectRatio? mode? sourceImageUrl? sourceImageBase64?
 *   - 全部仅回显（前端二段调用 /api/image/generate 时透传）
 *   - 不动 LLM 输出（仍是 styleSummary/promptEn/negativeEn/recommendedSize/tips）
 *
 * v0.11 B15.4：recommendedSize 强约束 ENUM：
 *   '1024x1024' | '1024x1536' | '1536x1024' | 'auto'
 *   LLM 即便返回 '2048x2048' / '4K' / '3840x2160' 等历史 B7 老池字面量，
 *   也会被服务端 fallback 到 defaultSize(body)（不再 silent 透传）。
 *   配合 systemPrompt 里的【尺寸强约束 v0.11 B15.4】段，从 LLM 端 + API 端双重约束。
 */

import { NextRequest, NextResponse } from 'next/server';
import { findAgent } from '@/lib/agent-types';
import { generateText, type ChatMessage } from '@/lib/ai/text';
import { extractJSON } from '@/lib/ai/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface ImageOptionsLite {
  size?: string;
  quality?: string;
  aspectRatio?: string;
  mode?: 't2i' | 'i2i';
  /** v0.11 B9：源图（仅外链；base64 太大不在 echo 里回显） */
  sourceImageUrl?: string;
  /** 长度提示 */
  sourceImageBase64Len?: number;
}

interface BuildBody {
  platform?: string;
  category?: string;
  imageType?: string;
  notes?: {
    title?: string;
    body?: string;
    coverText?: string;
    tags?: string;
    description?: string;
    tiers?: { tier: string; name: string; priceRange: string }[];
  };
  styleSummaryHint?: string;
  styleKeywords?: string;
  imageOptions?: ImageOptionsLite & {
    sourceImageBase64?: string;
  };
}

/**
 * v0.11 B15.4：合法 size 枚举（与 OpenAI gpt-image-1 协议一致；'auto' 是上游官方支持的逃逸值）。
 * 与 src/lib/image-size.ts 的 gpt-image-2 池保持一致。
 */
const VALID_SIZES = ['1024x1024', '1024x1536', '1536x1024', 'auto'] as const;
type ValidSize = (typeof VALID_SIZES)[number];

interface BuildResult {
  styleSummary: string;
  promptEn: string;
  negativeEn: string;
  recommendedSize: ValidSize;
  tips?: string[];
}

function summarize(input: BuildBody): string {
  const parts: string[] = [];
  if (input.platform) parts.push(`平台：${input.platform}`);
  if (input.category) parts.push(`类目：${input.category}`);
  if (input.imageType) parts.push(`图片类型：${input.imageType}`);
  if (input.styleKeywords) parts.push(`已选风格关键词：${input.styleKeywords}`);
  if (input.styleSummaryHint) parts.push(`用户当前的中文风格描述（请尊重并细化）：${input.styleSummaryHint}`);

  const n = input.notes;
  if (n) {
    if (n.title) parts.push(`笔记标题：${n.title}`);
    if (n.body) parts.push(`笔记正文（前 600 字）：${n.body.slice(0, 600)}`);
    if (n.coverText) parts.push(`封面文字：${n.coverText}`);
    if (n.tags) parts.push(`tags：${n.tags}`);
    if (n.description) parts.push(`商品描述（前 600 字）：${n.description.slice(0, 600)}`);
    if (Array.isArray(n.tiers) && n.tiers.length > 0) {
      parts.push(`三档价位：${n.tiers.map((t) => `${t.tier}${t.priceRange}`).join(' / ')}`);
    }
  }
  // v0.11 B9：把图片选项注入 user prompt 的尾部（提示 LLM 更准确）
  const io = input.imageOptions;
  if (io) {
    const ioLines: string[] = [];
    if (io.aspectRatio) ioLines.push(`aspectRatio: ${io.aspectRatio}`);
    if (io.mode) ioLines.push(`mode: ${io.mode}（i2i 时请把 promptEn 写成"基于源图改..."的指令）`);
    if (ioLines.length > 0) parts.push(`【imageOptions】\n${ioLines.join('\n')}`);
  }
  // v0.11 B15.4：把"recommendedSize 必须 4 选 1"再 user 段重申一次（systemPrompt + user 双保险）
  parts.push(
    '【recommendedSize 强约束 v0.11 B15.4】\n' +
      '必须是以下四个字符串之一（严格大小写）：\n' +
      "  '1024x1024' / '1024x1536' / '1536x1024' / 'auto'\n" +
      "禁止返回 '2048x2048' / '3840x2160' / '4K' / '2K' / '4096' / '1792x1024' 等任何其他值。",
  );
  return parts.join('\n');
}

function defaultSize(input: BuildBody): ValidSize {
  if (input.platform === 'xianyu' || input.imageType === '商品首图') return '1024x1024';
  return '1024x1536';
}

/** v0.11 B15.4：把 LLM 输出的 recommendedSize 收紧到 4 元枚举，非法值 → defaultSize */
function normalizeRecommendedSize(raw: unknown, body: BuildBody): { value: ValidSize; fallback: boolean } {
  if (typeof raw === 'string' && (VALID_SIZES as readonly string[]).includes(raw)) {
    return { value: raw as ValidSize, fallback: false };
  }
  return { value: defaultSize(body), fallback: true };
}

export async function POST(req: NextRequest) {
  try {
    const agent = findAgent('photo-director');
    if (!agent) {
      return NextResponse.json({ ok: false, error: 'agent unavailable' }, { status: 500 });
    }

    const body = (await req.json()) as BuildBody;
    const userBlock = summarize(body);

    const messages: ChatMessage[] = [
      { role: 'system', content: agent.systemPrompt },
      {
        role: 'user',
        content:
          '请基于下面的信息，输出 JSON：\n\n' +
          userBlock +
          '\n\n再次提醒：只输出严格 JSON，promptEn / negativeEn 必须英文，styleSummary / tips 必须中文。' +
          "\nrecommendedSize 必须是 '1024x1024' / '1024x1536' / '1536x1024' / 'auto' 之一。",
      },
    ];

    const r = await generateText({
      messages,
      temperature: 0.5,
      maxTokens: 700,
      responseFormat: 'json',
    });
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: r.error || 'LLM 调用失败' },
        { status: 500 },
      );
    }

    const parsed = extractJSON<Partial<BuildResult> & { recommendedSize?: unknown }>(r.content);
    if (!parsed || typeof parsed.promptEn !== 'string' || typeof parsed.styleSummary !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'LLM 输出不是合法 JSON', raw: r.content },
        { status: 500 },
      );
    }

    // v0.11 B15.4：服务端兜底强约束 size enum
    const sizeNorm = normalizeRecommendedSize(parsed.recommendedSize, body);

    const result: BuildResult = {
      styleSummary: parsed.styleSummary,
      promptEn: parsed.promptEn,
      negativeEn: typeof parsed.negativeEn === 'string'
        ? parsed.negativeEn
        : 'low quality, blurry, watermark, text artifacts, cluttered, distorted',
      recommendedSize: sizeNorm.value,
      tips: Array.isArray(parsed.tips) ? parsed.tips.filter((x) => typeof x === 'string') : undefined,
    };

    // v0.11 B7 + B9：把用户选的 imageOptions 回显（前端二段调用 /api/image/generate 时透传）
    const echoImageOptions: ImageOptionsLite = {};
    const io = body.imageOptions;
    if (io) {
      if (typeof io.size === 'string' && io.size.trim()) echoImageOptions.size = io.size.trim();
      if (typeof io.quality === 'string' && io.quality.trim()) echoImageOptions.quality = io.quality.trim();
      if (typeof io.aspectRatio === 'string' && io.aspectRatio.trim()) echoImageOptions.aspectRatio = io.aspectRatio.trim();
      if (io.mode === 'i2i' || io.mode === 't2i') echoImageOptions.mode = io.mode;
      if (typeof io.sourceImageUrl === 'string' && io.sourceImageUrl.trim()) {
        echoImageOptions.sourceImageUrl = io.sourceImageUrl.trim();
      }
      if (typeof io.sourceImageBase64 === 'string') {
        echoImageOptions.sourceImageBase64Len = io.sourceImageBase64.length;
      }
    }

    return NextResponse.json({
      ok: true,
      result,
      model: r.model,
      // v0.11 B15.4：暴露兜底标记，便于 trace / 前端 toast / sqlite 复盘
      ...(sizeNorm.fallback
        ? { sizeFallback: true, sizeFallbackReason: `LLM 返回非法 recommendedSize="${String(parsed.recommendedSize)}"，已 fallback 到 ${sizeNorm.value}` }
        : {}),
      ...(Object.keys(echoImageOptions).length > 0 ? { imageOptions: echoImageOptions } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message || 'unknown error' },
      { status: 500 },
    );
  }
}
