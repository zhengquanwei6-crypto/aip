/**
 * /api/image/generate · 图片生成（v0.11 B9 加 mode/sourceImageUrl/sourceImageBase64/aspectRatio）
 *
 * v0.11 B7：body 接 size? / quality?
 * v0.11 B9：body 加
 *   - mode?: 't2i' | 'i2i'（默认 't2i'）
 *   - sourceImageUrl?: string（外链或 /uploads/... 相对路径）
 *   - sourceImageBase64?: string（裸 base64，超过 5MB 拒绝）
 *   - aspectRatio?: string（"1:1" / "16:9" 等）
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runImageGenerate, type ImageMode } from '@/lib/image-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BASE64_BYTES = 5 * 1024 * 1024 * 4 / 3; // ≈ 6.67MB base64 = 5MB binary 上限

function readMode(v: unknown): ImageMode {
  return v === 'i2i' ? 'i2i' : 't2i';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt: string = body.prompt;
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ ok: false, error: 'prompt 不能为空' }, { status: 400 });
    }
    const platform: string | undefined = body.platform;
    const category: string | undefined = body.category;
    const imageType: string = body.imageType || '封面图';
    const size: string | undefined =
      typeof body.size === 'string' && body.size.trim() ? body.size.trim() : undefined;
    const quality: string | undefined =
      typeof body.quality === 'string' && body.quality.trim() ? body.quality.trim() : undefined;
    const aspectRatio: string | undefined =
      typeof body.aspectRatio === 'string' && body.aspectRatio.trim() ? body.aspectRatio.trim() : undefined;
    const n: number = Math.min(Math.max(Number(body.n) || 1, 1), 4);
    const mode = readMode(body.mode);
    const sourceImageUrl: string | undefined =
      typeof body.sourceImageUrl === 'string' && body.sourceImageUrl.trim()
        ? body.sourceImageUrl.trim()
        : undefined;
    const sourceImageBase64: string | undefined =
      typeof body.sourceImageBase64 === 'string' && body.sourceImageBase64.trim()
        ? body.sourceImageBase64.trim()
        : undefined;

    if (mode === 'i2i' && !sourceImageUrl && !sourceImageBase64) {
      return NextResponse.json(
        { ok: false, error: 'i2i 模式需提供 sourceImageUrl 或 sourceImageBase64' },
        { status: 400 },
      );
    }
    if (sourceImageBase64 && sourceImageBase64.length > MAX_BASE64_BYTES) {
      return NextResponse.json(
        { ok: false, error: `源图过大（>5MB）：base64 长度 ${sourceImageBase64.length}` },
        { status: 413 },
      );
    }

    const r = await runImageGenerate({
      prompt,
      ...(size !== undefined ? { size } : {}),
      ...(quality !== undefined ? { quality } : {}),
      ...(aspectRatio !== undefined ? { aspectRatio } : {}),
      n,
      mode,
      ...(sourceImageUrl !== undefined ? { sourceImageUrl } : {}),
      ...(sourceImageBase64 !== undefined ? { sourceImageBase64 } : {}),
      extra: body.extra ?? {},
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

    const assets = [];
    for (const url of r.savedUrls) {
      const fileName = url.split('/').pop() || '';
      const a = await prisma.asset.create({
        data: {
          type: imageType,
          source: 'ai_generated',
          platform: platform ?? null,
          category: category ?? null,
          url,
          prompt,
          fileName,
        },
      });
      assets.push(a);
    }
    await prisma.aIOutput.create({
      data: {
        type: 'image',
        input: JSON.stringify({
          prompt, size, quality, aspectRatio, mode,
          sourceImageUrl: sourceImageUrl ? sourceImageUrl.slice(0, 200) : null,
          sourceImageBase64Len: sourceImageBase64?.length ?? 0,
          platform, category, imageType, n,
        }),
        output: JSON.stringify({ urls: r.savedUrls, via: r.via, adapterSlug: r.adapterSlug }),
        model: r.via === 'adapter' ? `adapter:${r.adapterSlug}` : (r.model ?? 'unknown'),
      },
    });

    return NextResponse.json({
      ok: true,
      asset: assets[0],
      assets,
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
