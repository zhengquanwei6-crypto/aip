import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText, extractJSON } from '@/lib/ai/text';
import { buildImagePromptMessagesAsync } from '@/lib/ai/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const platform = body.platform as 'xiaohongshu' | 'xianyu';
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
