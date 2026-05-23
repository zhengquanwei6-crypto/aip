import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText, extractJSON } from '@/lib/ai/text';
import { buildImagePromptMessagesAsync } from '@/lib/ai/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/image/prompt
 *
 * v0.11 B7 fix #1: 加 platform validation —— 之前 empty body 会带 undefined platform 进 LLM call
 * 消耗 token (Phase 1 scan 抓到), 与 /api/content/generate 的"平台不正确" 400 一致.
 *
 * body: {
 *   platform: 'xiaohongshu' | 'xianyu'  (required)
 *   imageType?: string  (default '封面图')
 *   coverTitle?: string
 *   styleKeywords?: string
 *   category?: string
 *   ratio?: '3:4' | '1:1'  (默认按 platform 推断)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const platform = body?.platform as 'xiaohongshu' | 'xianyu' | undefined;
    if (!platform || !['xiaohongshu', 'xianyu'].includes(platform)) {
      return NextResponse.json(
        { ok: false, error: '平台不正确（xiaohongshu/xianyu）' },
        { status: 400 },
      );
    }
    const ratio = (body.ratio as '3:4' | '1:1') ?? (platform === 'xiaohongshu' ? '3:4' : '1:1');
    // v0.9.2 b1：async builder 接通模板编辑器
    const messages = await buildImagePromptMessagesAsync({
      platform,
      imageType: body.imageType || '封面图',
      coverTitle: body.coverTitle,
      styleKeywords: body.styleKeywords,
      category: body.category,
      ratio,
    });
    const r = await generateText({
      messages,
      responseFormat: 'json',
      temperature: 0.8,
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
    }
    const parsed = extractJSON<any>(r.content);
    if (!parsed?.prompt) {
      return NextResponse.json(
        { ok: false, error: '提示词解析失败', raw: r.content },
        { status: 500 },
      );
    }
    await prisma.aIOutput.create({
      data: {
        type: 'image_prompt',
        input: JSON.stringify(body),
        output: JSON.stringify(parsed),
        model: r.model,
      },
    });
    return NextResponse.json({ ok: true, ...parsed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
