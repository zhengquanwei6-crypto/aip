/**
 * v0.15 · /api/ai-tools/[slug] · 4 个 AI 工具的统一后端
 *
 * 工具：upscale / erase / recolor / retouch
 * 统一走 image-runner.runImageGenerate 的 i2i 路径，每个工具有专属 prompt 模板。
 *
 * 入参：{ sourceDataUrl: 'data:image/png;base64,...', instruction?: string }
 * 出参：{ ok: true, url: string } | { ok: false, error: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { runImageGenerate } from '@/lib/image-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const PROMPT_TEMPLATE: Record<string, (instruction: string) => string> = {
  upscale: (i) =>
    `Upscale this image to high resolution with enhanced detail and sharpness. Preserve composition, color, and content unchanged. ${i ? 'Additional notes: ' + i : ''}`,
  erase: (i) =>
    `Carefully remove the following element from this image and seamlessly fill the area with matching background: ${i || 'unwanted objects'}. Keep all other parts of the image identical. Output a clean photorealistic result.`,
  recolor: (i) =>
    `Recolor this image as instructed: ${i || 'change the main color'}. Preserve the original shape, material, lighting, shadows, and texture. Only the color should change.`,
  retouch: (i) =>
    `Professionally retouch this product photo for e-commerce: clean up dust and scratches, balance lighting, refine highlights and shadows, ensure clean background, keep colors natural. ${i ? 'Style preference: ' + i : ''}`,
};

export async function POST(
  req: NextRequest,
  ctx: { params: { slug: string } },
) {
  const slug = ctx.params.slug;
  const builder = PROMPT_TEMPLATE[slug];
  if (!builder) {
    return NextResponse.json(
      { ok: false, error: `unknown tool: ${slug}` },
      { status: 404 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const sourceDataUrl: string = String(body?.sourceDataUrl || '').trim();
  const instruction: string = String(body?.instruction || '').trim();
  // v0.14-z48: size + quality (透传 runImageGenerate)
  const size: string | undefined =
    typeof body?.size === 'string' && body.size.trim() ? body.size.trim() : undefined;
  const quality: string | undefined =
    typeof body?.quality === 'string' && body.quality.trim() ? body.quality.trim() : undefined;
  if (!sourceDataUrl || !sourceDataUrl.startsWith('data:image/')) {
    return NextResponse.json(
      { ok: false, error: '需要上传图片' },
      { status: 400 },
    );
  }

  // 拆 base64
  const m = sourceDataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) {
    return NextResponse.json(
      { ok: false, error: 'dataURL 格式不识别' },
      { status: 400 },
    );
  }
  const base64 = m[2];

  const prompt = builder(instruction);

  try {
    const r = await runImageGenerate({
      prompt,
      mode: 'i2i',
      n: 1,
      size: size ?? '1024x1024',
      ...(quality !== undefined ? { quality } : {}),
      sourceImageBase64: base64,
      sourceImageUrl: sourceDataUrl,
    });
    if (!r.ok || r.savedUrls.length === 0) {
      return NextResponse.json(
        { ok: false, error: r.error || '生图失败' },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, url: r.savedUrls[0] });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
