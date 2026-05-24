/**
 * /api/agents/photo-director/build
 *
 * v0.11 B7：body.imageOptions { size?, quality? } 仅回显
 * v0.11 B9：body.imageOptions 加 aspectRatio? mode? sourceImageUrl? sourceImageBase64?
 *   - 全部仅回显（前端二段调用 /api/image/generate 时透传）
 *   - 不动 LLM 输出（仍是 styleSummary/promptEn/negativeEn/recommendedSize/tips）
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

interface BuildResult {
  styleSummary: string;
  promptEn: string;
  negativeEn: string;
  recommendedSize: '1024x1024' | '1024x1536' | '1536x1024';
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
  return parts.join('\n');
}

function defaultSize(input: BuildBody): BuildResult['recommendedSize'] {
  if (input.platform === 'xianyu' || input.imageType === '商品首图') return '1024x1024';
  return '1024x1536';
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
          '\n\n再次提醒：只输出严格 JSON，promptEn / negativeEn 必须英文，styleSummary / tips 必须中文。',
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

    const parsed = extractJSON<Partial<BuildResult>>(r.content);
    if (!parsed || typeof parsed.promptEn !== 'string' || typeof parsed.styleSummary !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'LLM 输出不是合法 JSON', raw: r.content },
        { status: 500 },
      );
    }

    const result: BuildResult = {
      styleSummary: parsed.styleSummary,
      promptEn: parsed.promptEn,
      negativeEn: typeof parsed.negativeEn === 'string'
        ? parsed.negativeEn
        : 'low quality, blurry, watermark, text artifacts, cluttered, distorted',
      recommendedSize: ['1024x1024', '1024x1536', '1536x1024'].includes(String(parsed.recommendedSize))
        ? (parsed.recommendedSize as BuildResult['recommendedSize'])
        : defaultSize(body),
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
      ...(Object.keys(echoImageOptions).length > 0 ? { imageOptions: echoImageOptions } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message || 'unknown error' },
      { status: 500 },
    );
  }
}
