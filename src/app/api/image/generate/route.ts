import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateImage } from '@/lib/ai/image';
import { saveImageFromBase64, saveImageFromUrl } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt: string = body.prompt;
    if (!prompt) {
      return NextResponse.json({ ok: false, error: 'prompt 不能为空' }, { status: 400 });
    }
    const platform: string | undefined = body.platform;
    const category: string | undefined = body.category;
    const imageType: string = body.imageType || '封面图';
    const size: string =
      body.size || (platform === 'xiaohongshu' ? '1024x1536' : '1024x1024');

    const img = await generateImage({ prompt, size });
    if (!img.ok || img.images.length === 0) {
      return NextResponse.json(
        { ok: false, error: img.error || '未返回图片' },
        { status: 500 },
      );
    }

    const it = img.images[0];
    let saved;
    if (it.b64) saved = await saveImageFromBase64(it.b64);
    else if (it.url) saved = await saveImageFromUrl(it.url);
    else {
      return NextResponse.json({ ok: false, error: '图片返回为空' }, { status: 500 });
    }

    const asset = await prisma.asset.create({
      data: {
        type: imageType,
        source: 'ai_generated',
        platform: platform ?? null,
        category: category ?? null,
        url: saved.url,
        prompt,
        fileName: saved.fileName,
      },
    });
    await prisma.aIOutput.create({
      data: {
        type: 'image',
        input: JSON.stringify({ prompt, size, platform, category, imageType }),
        output: JSON.stringify({ url: saved.url }),
        model: img.model,
      },
    });

    return NextResponse.json({ ok: true, asset });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
