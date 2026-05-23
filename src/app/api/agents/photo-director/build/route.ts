/**
 * /api/agents/photo-director/build
 *
 * 给定笔记/商品信息（中文），返回结构化 prompt JSON：
 *   { styleSummary, promptEn, negativeEn, recommendedSize, tips }
 *
 * 不返回普通对话文本；专门给 /content 页生图按钮用。
 */

import { NextRequest, NextResponse } from 'next/server';
import { findAgent } from '@/lib/agent-types';
import { generateText, type ChatMessage } from '@/lib/ai/text';
import { extractJSON } from '@/lib/ai/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface BuildBody {
  /** 平台：xiaohongshu | xianyu */
  platform?: string;
  /** 类目，如 Logo / 案例图 / 商品图 */
  category?: string;
  /** 图片用途，如 封面图 / 商品首图 / 案例图 */
  imageType?: string;
  /** 笔记内容（标题/正文/封面文/tags 任选）或商品信息 */
  notes?: {
    title?: string;
    body?: string;
    coverText?: string;
    tags?: string;
    /** 闲鱼商品 */
    description?: string;
    tiers?: { tier: string; name: string; priceRange: string }[];
  };
  /** 用户额外的中文风格描述（重生成时把上次 styleSummary 改了再传回来） */
  styleSummaryHint?: string;
  /** 已选 ImagePreset 的 styleKeywords，作为锚点 */
  styleKeywords?: string;
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
  return parts.join('\n');
}

function defaultSize(input: BuildBody): BuildResult['recommendedSize'] {
  // 闲鱼商品图默认 1:1，其它默认 3:4 竖图
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

    return NextResponse.json({ ok: true, result, model: r.model });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message || 'unknown error' },
      { status: 500 },
    );
  }
}
