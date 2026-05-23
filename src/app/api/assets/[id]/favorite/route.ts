/**
 * /api/assets/[id]/favorite · 切换素材收藏状态
 *
 * v0.8 Batch 5：用 Setting 表存收藏标记，避免动 schema
 *   - key: `asset:fav:<assetId>`
 *   - value: `'1'` 表示已收藏
 *   - 取消收藏：删除 row
 *
 * POST body: { favorite: boolean }
 * 返回 { ok, favorite }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FAV_PREFIX = 'asset:fav:';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = params.id;
    if (!id || !/^[a-zA-Z0-9_-]{6,50}$/.test(id)) {
      return NextResponse.json({ ok: false, error: 'invalid asset id' }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const fav = body?.favorite;
    if (typeof fav !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'favorite must be boolean' }, { status: 400 });
    }

    // 校验 asset 存在
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) {
      return NextResponse.json({ ok: false, error: 'asset not found' }, { status: 404 });
    }

    const key = FAV_PREFIX + id;
    if (fav) {
      await prisma.setting.upsert({
        where: { key },
        create: { key, value: '1' },
        update: { value: '1' },
      });
    } else {
      await prisma.setting.deleteMany({ where: { key } });
    }
    return NextResponse.json({ ok: true, favorite: fav });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
