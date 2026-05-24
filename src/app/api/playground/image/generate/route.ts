/**
 * v0.11 B8 + B9 · /api/playground/image/generate
 *
 * v0.11 B9：body 加 mode? sourceImageUrl? sourceImageBase64? aspectRatio?
 *   - i2i 校验：与 /api/image/generate 一致
 *   - 单独 endpoint，AIOutput.type='playground:image'
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runImageGenerate, type ImageMode } from '@/lib/image-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BASE64_BYTES = 5 * 1024 * 1024 * 4 / 3;

interface PlaygroundImageRequest {
  adapterSlug?: string;
  keyId?: string;
  prompt?: string;
  size?: string;
  quality?: string;
  aspectRatio?: string;
  n?: number;
  platform?: string;
  category?: string;
  imageType?: string;
  // v0.11 B9
  mode?: 't2i' | 'i2i';
  sourceImageUrl?: string;
  sourceImageBase64?: string;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function readMode(v: unknown): ImageMode {
  return v === 'i2i' ? 'i2i' : 't2i';
}

async function maybeSwitchAdapter(slug: string): Promise<void> {
  const cur = await prisma.setting.findUnique({ where: { key: 'IMAGE_DEFAULT_ADAPTER' } });
  if ((cur?.value ?? '').trim() === slug) return;
  await prisma.setting.upsert({
    where: { key: 'IMAGE_DEFAULT_ADAPTER' },
    update: { value: slug },
    create: { key: 'IMAGE_DEFAULT_ADAPTER', value: slug },
  });
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    let body: PlaygroundImageRequest = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return NextResponse.json({ ok: false, error: 'prompt 不能为空' }, { status: 400 });
    }

    if (typeof body.adapterSlug === 'string' && body.adapterSlug.trim()) {
      await maybeSwitchAdapter(body.adapterSlug.trim());
    }

    const size: string | undefined =
      typeof body.size === 'string' && body.size.trim() ? body.size.trim() : undefined;
    const quality: string | undefined =
      typeof body.quality === 'string' && body.quality.trim() ? body.quality.trim() : undefined;
    const aspectRatio: string | undefined =
      typeof body.aspectRatio === 'string' && body.aspectRatio.trim() ? body.aspectRatio.trim() : undefined;
    const n = clampInt(body.n, 1, 4, 1);
    const platform = typeof body.platform === 'string' ? body.platform : undefined;
    const category = typeof body.category === 'string' ? body.category : undefined;
    const imageType = typeof body.imageType === 'string' && body.imageType.trim() ? body.imageType.trim() : '封面图';
    const mode = readMode(body.mode);
    const sourceImageUrl =
      typeof body.sourceImageUrl === 'string' && body.sourceImageUrl.trim() ? body.sourceImageUrl.trim() : undefined;
    const sourceImageBase64 =
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
    });

    if (!r.ok || r.savedUrls.length === 0) {
      try {
        await prisma.aIOutput.create({
          data: {
            type: 'playground:image',
            input: JSON.stringify({
              via: 'playground',
              keyId: body.keyId ?? null,
              adapterSlug: r.adapterSlug ?? body.adapterSlug ?? null,
              prompt, size, quality, aspectRatio, n, mode,
              sourceImageUrl: sourceImageUrl ? sourceImageUrl.slice(0, 200) : null,
              sourceImageBase64Len: sourceImageBase64?.length ?? 0,
            }),
            output: JSON.stringify({ error: r.error || '未返回图片', via: r.via, trace: r.trace }),
            model: r.via === 'adapter' ? `adapter:${r.adapterSlug}` : (r.model ?? 'unknown'),
          },
        });
      } catch {
        /* ignore */
      }
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
    const latencyMs = Date.now() - t0;
    await prisma.aIOutput.create({
      data: {
        type: 'playground:image',
        input: JSON.stringify({
          via: 'playground',
          keyId: body.keyId ?? null,
          adapterSlug: r.adapterSlug ?? body.adapterSlug ?? null,
          prompt, size, quality, aspectRatio, n, mode,
          sourceImageUrl: sourceImageUrl ? sourceImageUrl.slice(0, 200) : null,
          sourceImageBase64Len: sourceImageBase64?.length ?? 0,
          platform, category, imageType,
        }),
        output: JSON.stringify({
          urls: r.savedUrls,
          via: r.via,
          adapterSlug: r.adapterSlug,
          latencyMs,
        }),
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
      latencyMs,
      trace: r.trace,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message || 'unknown error' },
      { status: 500 },
    );
  }
}
