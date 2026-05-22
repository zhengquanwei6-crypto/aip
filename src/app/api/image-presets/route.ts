import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const list = await prisma.imagePreset.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ ok: true, list });
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    if (!data.name || !data.styleKeywords) {
      return NextResponse.json(
        { ok: false, error: '请填写名称和风格关键词' },
        { status: 400 },
      );
    }
    if (data.isDefault) {
      // 取消其他默认
      await prisma.imagePreset.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    const item = await prisma.imagePreset.create({
      data: {
        name: data.name,
        styleKeywords: data.styleKeywords,
        negativePrompt: data.negativePrompt || null,
        size: data.size || '1024x1536',
        imageType: data.imageType || '封面图',
        isDefault: !!data.isDefault,
      },
    });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
