/**
 * /api/image/generate · 图片生成（重构）
 *
 * 改动：
 *   - 走 lib/image-runner 统一入口（先 adapter，回退 legacy）
 *   - 返回结构与旧版兼容（asset、ok、error）
 *   - 多图：legacy 默认 1 张；adapter 可由用户在 extra.n 指定
 *
 * v0.8 Batch 5：trace 字段在 success/fail 都返回（精简版，无 API key）
 *   - success：{ ok, asset, assets, via, adapterSlug, durationMs, trace }
 *   - fail   ：{ ok:false, error, via, adapterSlug, trace }
 *
 * v0.11 B7：尺寸 / 质量预设
 *   - body 接收 size?: string · quality?: string（来自 ImageStudio 选择器）
 *   - 透传给 runImageGenerate；不在此层做合法性校验（runImageGenerate 内 resolveSize 已 fallback）
 *   - 老调用（无 size/quality）→ runImageGenerate 自动用每 adapter 的 sizes[0]/qualities[0]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runImageGenerate } from '@/lib/image-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
    // v0.11 B7：size 现在按 adapter 池决定缺省（runImageGenerate 内 resolveSize），不再硬写 1024xN
    const size: string | undefined =
      typeof body.size === 'string' && body.size.trim()
        ? body.size.trim()
        : undefined;
    // v0.11 B7：quality 同上
    const quality: string | undefined =
      typeof body.quality === 'string' && body.quality.trim()
        ? body.quality.trim()
        : undefined;
    const n: number = Math.min(Math.max(Number(body.n) || 1, 1), 4);

    const r = await runImageGenerate({
      prompt,
      ...(size !== undefined ? { size } : {}),
      ...(quality !== undefined ? { quality } : {}),
      n,
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

    // 写入素材库（每张一条）+ AIOutput 单条记录
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
        input: JSON.stringify({ prompt, size, quality, platform, category, imageType, n }),
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
