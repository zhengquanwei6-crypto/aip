import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText, extractJSON } from '@/lib/ai/text';
import { buildImagePromptMessages } from '@/lib/ai/prompts';
import { generateImage } from '@/lib/ai/image';
import { saveImageFromBase64, saveImageFromUrl } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const task = await prisma.task.findUnique({ where: { id: params.id } });
    if (!task) {
      return NextResponse.json({ ok: false, error: '任务不存在' }, { status: 404 });
    }

    const platform = task.platform as 'xiaohongshu' | 'xianyu';
    const ratio = platform === 'xiaohongshu' ? '3:4' : '1:1';
    const size = platform === 'xiaohongshu' ? '1024x1536' : '1024x1024';

    // 1) 让 LLM 生成图片提示词
    const messages = buildImagePromptMessages({
      platform,
      imageType: platform === 'xiaohongshu' ? '封面图' : '商品首图',
      coverTitle: task.coverText || task.title,
      category: task.category,
      ratio,
    });

    const t = await generateText({
      messages,
      temperature: 0.8,
      responseFormat: 'json',
    });
    if (!t.ok) {
      return NextResponse.json({ ok: false, error: t.error }, { status: 500 });
    }
    const parsed = extractJSON<{ prompt: string; size?: string }>(t.content);
    if (!parsed?.prompt) {
      return NextResponse.json(
        { ok: false, error: '提示词解析失败', raw: t.content },
        { status: 500 },
      );
    }

    // 2) 调图片 API
    const img = await generateImage({ prompt: parsed.prompt, size: parsed.size || size });
    if (!img.ok || img.images.length === 0) {
      return NextResponse.json({ ok: false, error: img.error || '未返回图片' }, { status: 500 });
    }

    const it = img.images[0];
    let saved;
    try {
      if (it.b64) {
        saved = await saveImageFromBase64(it.b64);
      } else if (it.url) {
        saved = await saveImageFromUrl(it.url);
      } else {
        return NextResponse.json({ ok: false, error: '图片返回为空' }, { status: 500 });
      }
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }

    // 3) 写入素材库 + 任务
    await prisma.asset.create({
      data: {
        type: platform === 'xiaohongshu' ? '封面图' : '商品首图',
        source: 'ai_generated',
        platform,
        category: task.category,
        url: saved.url,
        prompt: parsed.prompt,
        fileName: saved.fileName,
      },
    });
    await prisma.aIOutput.create({
      data: {
        type: 'image',
        input: JSON.stringify({ taskId: task.id, prompt: parsed.prompt }),
        output: JSON.stringify({ url: saved.url }),
        model: img.model,
      },
    });

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { imageUrl: saved.url },
    });
    return NextResponse.json({ ok: true, task: updated, prompt: parsed.prompt });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
