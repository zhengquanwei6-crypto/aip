import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { saveUploadedFile } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: '未上传文件' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveUploadedFile(buffer, file.name);
    const type = (form.get('type') as string) || '封面图';
    const platform = (form.get('platform') as string) || null;
    const category = (form.get('category') as string) || null;
    const asset = await prisma.asset.create({
      data: {
        type,
        source: 'manual_upload',
        platform,
        category,
        url: saved.url,
        fileName: saved.fileName,
      },
    });
    return NextResponse.json({
      ok: true,
      asset: {
        id: asset.id,
        type: asset.type,
        source: asset.source,
        platform: asset.platform ?? '',
        category: asset.category ?? '',
        url: asset.url,
        prompt: asset.prompt ?? '',
        fileName: asset.fileName ?? '',
        createdAt: asset.createdAt.toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
