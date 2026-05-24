/**
 * /api/tasks/[id]/generate-image · 任务一键生成图片
 *
 * v0.11 B7 加 size? / quality?
 * v0.11 B9 加 mode? sourceImageUrl? sourceImageBase64? aspectRatio?
 *   - i2i 模式仅在 adapter 支持时可用，否则 image-runner 报错（不偷偷降级 t2i）
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText, extractJSON } from '@/lib/ai/text';
import { buildImagePromptMessagesAsync } from '@/lib/ai/prompts';
import { runImageGenerate, type ImageMode } from '@/lib/image-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BASE64_BYTES = 5 * 1024 * 1024 * 4 / 3;

function readMode(v: unknown): ImageMode {
  return v === 'i2i' ? 'i2i' : 't2i';
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const task = await prisma.task.findUnique({ where: { id: params.id } });
    if (!task) {
      return NextResponse.json({ ok: false, error: '任务不存在' }, { status: 404 });
    }

    let bodySize: string | undefined;
    let bodyQuality: string | undefined;
    let bodyAspectRatio: string | undefined;
    let bodyMode: ImageMode = 't2i';
    let bodySourceImageUrl: string | undefined;
    let bodySourceImageBase64: string | undefined;
    try {
      const b = await req.json().catch(() => null);
      if (b && typeof b === 'object') {
        if (typeof b.size === 'string' && b.size.trim()) bodySize = b.size.trim();
        if (typeof b.quality === 'string' && b.quality.trim()) bodyQuality = b.quality.trim();
        if (typeof b.aspectRatio === 'string' && b.aspectRatio.trim()) bodyAspectRatio = b.aspectRatio.trim();
        bodyMode = readMode(b.mode);
        if (typeof b.sourceImageUrl === 'string' && b.sourceImageUrl.trim()) bodySourceImageUrl = b.sourceImageUrl.trim();
        if (typeof b.sourceImageBase64 === 'string' && b.sourceImageBase64.trim()) bodySourceImageBase64 = b.sourceImageBase64.trim();
      }
    } catch {
      /* ignore */
    }

    if (bodyMode === 'i2i' && !bodySourceImageUrl && !bodySourceImageBase64) {
      return NextResponse.json(
        { ok: false, error: 'i2i 模式需提供 sourceImageUrl 或 sourceImageBase64' },
        { status: 400 },
      );
    }
    if (bodySourceImageBase64 && bodySourceImageBase64.length > MAX_BASE64_BYTES) {
      return NextResponse.json(
        { ok: false, error: '源图过大（>5MB）' },
        { status: 413 },
      );
    }

    const platform = task.platform as 'xiaohongshu' | 'xianyu';
    const ratio = platform === 'xiaohongshu' ? '3:4' : '1:1';
    const fallbackSize = platform === 'xiaohongshu' ? '1024x1536' : '1024x1024';

    // 1) LLM 生 prompt
    const messages = await buildImagePromptMessagesAsync({
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
    const finalSize = bodySize ?? parsed.size ?? fallbackSize;
    const finalAspectRatio = bodyAspectRatio ?? ratio;
    const r = await runImageGenerate({
      prompt: parsed.prompt,
      size: finalSize,
      ...(bodyQuality !== undefined ? { quality: bodyQuality } : {}),
      aspectRatio: finalAspectRatio,
      n: 1,
      mode: bodyMode,
      ...(bodySourceImageUrl !== undefined ? { sourceImageUrl: bodySourceImageUrl } : {}),
      ...(bodySourceImageBase64 !== undefined ? { sourceImageBase64: bodySourceImageBase64 } : {}),
      extra: { aspectRatio: finalAspectRatio },
    });
    if (!r.ok || r.savedUrls.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: r.error || '未返回图片',
          via: r.via,
          adapterSlug: r.adapterSlug,
          durationMs: r.durationMs,
          trace: r.trace,
        },
        { status: 500 },
      );
    }
    const url = r.savedUrls[0];
    const fileName = url.split('/').pop() || '';

    await prisma.asset.create({
      data: {
        type: platform === 'xiaohongshu' ? '封面图' : '商品首图',
        source: 'ai_generated',
        platform,
        category: task.category,
        url,
        prompt: parsed.prompt,
        fileName,
      },
    });
    await prisma.aIOutput.create({
      data: {
        type: 'image',
        input: JSON.stringify({
          taskId: task.id,
          prompt: parsed.prompt,
          size: finalSize,
          quality: bodyQuality,
          aspectRatio: finalAspectRatio,
          mode: bodyMode,
          sourceImageUrl: bodySourceImageUrl ? bodySourceImageUrl.slice(0, 200) : null,
          sourceImageBase64Len: bodySourceImageBase64?.length ?? 0,
        }),
        output: JSON.stringify({ url, via: r.via, adapterSlug: r.adapterSlug }),
        model: r.via === 'adapter' ? `adapter:${r.adapterSlug}` : (r.model ?? 'unknown'),
      },
    });

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { imageUrl: url },
    });
    return NextResponse.json({
      ok: true,
      task: updated,
      prompt: parsed.prompt,
      via: r.via,
      adapterSlug: r.adapterSlug,
      durationMs: r.durationMs,
      trace: r.trace,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
