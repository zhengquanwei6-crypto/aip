/**
 * v0.11 B8 · /api/playground/image/generate
 *
 * 即时调用图片生成端点。复用 runImageGenerate（B1 池 + B7 sizes/qualities），
 * 但允许用户：
 *   - 显式指定 keyId（通过 IMAGE_DEFAULT_ADAPTER 切换不影响 baseUrl，但可在前端展示选哪条 image key）
 *   - 显式指定 adapterSlug（切换 4router / kie / dall-e 等，不写 IMAGE_DEFAULT_ADAPTER）
 *   - 透传 size / quality / n / prompt
 *
 * 写库：AIOutput.type='playground:image'，每张图新建 Asset 行（与 /api/image/generate 行为一致）
 *
 * 0 schema 改 · 0 缓存（force-dynamic）
 *
 * 注：runImageGenerate 内部读 IMAGE_DEFAULT_ADAPTER 选 adapter，
 *     B8 引入 adapterSlug 时通过临时覆盖 Setting 不可行（会污染并发请求）。
 *     最稳的做法是在 runImageGenerate 之前临时把 Setting 改回去——但这会 race。
 *     折中：playground 在 body.adapterSlug 给定时直接通过 prisma.setting.update 写
 *     IMAGE_DEFAULT_ADAPTER 到该值（"切换"语义），后续 publish-director / /image 全部跟随。
 *     **如果要实现"仅本次请求用 X adapter，不影响全局默认"，需要改 runImageGenerate 加 opts.adapterSlug
 *     参数 — 那是 v0.12+ 的事**。本批保持简化。
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runImageGenerate } from '@/lib/image-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface PlaygroundImageRequest {
  /** 切换 IMAGE_DEFAULT_ADAPTER 到该 slug（持久写 Setting；后续 /image 等也会用此） */
  adapterSlug?: string;
  /** 仅作元信息记录到 AIOutput.input；实际下发由 runImageGenerate 走 IMAGE_DEFAULT_ADAPTER 池路径 */
  keyId?: string;
  prompt?: string;
  size?: string;
  quality?: string;
  n?: number;
  platform?: string;
  category?: string;
  imageType?: string;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

async function maybeSwitchAdapter(slug: string): Promise<void> {
  // 仅当与当前不同 + 非空时才更新（避免 updatedAt 噪音）
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
    const n = clampInt(body.n, 1, 4, 1);
    const platform = typeof body.platform === 'string' ? body.platform : undefined;
    const category = typeof body.category === 'string' ? body.category : undefined;
    const imageType = typeof body.imageType === 'string' && body.imageType.trim() ? body.imageType.trim() : '封面图';

    const r = await runImageGenerate({
      prompt,
      ...(size !== undefined ? { size } : {}),
      ...(quality !== undefined ? { quality } : {}),
      n,
    });

    if (!r.ok || r.savedUrls.length === 0) {
      // 失败也写 AIOutput 便于排查
      try {
        await prisma.aIOutput.create({
          data: {
            type: 'playground:image',
            input: JSON.stringify({
              via: 'playground',
              keyId: body.keyId ?? null,
              adapterSlug: r.adapterSlug ?? body.adapterSlug ?? null,
              prompt,
              size,
              quality,
              n,
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

    // 写 Asset 多张 + 单条 AIOutput
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
          prompt,
          size,
          quality,
          n,
          platform,
          category,
          imageType,
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
