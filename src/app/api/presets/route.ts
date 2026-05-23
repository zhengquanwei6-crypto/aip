/**
 * GET /api/presets · v0.11 B3
 *
 * Recon §六.A 标记为 404。已有 /api/image-presets 提供完整 CRUD；
 * 本路径作为统一 list 别名暴露给外部脚本/扩展，省去记忆 -presets vs -image-presets 的成本。
 *
 * 直接读 ImagePreset 表（与 /api/image-presets 完全等价的 GET），
 * 字段顺序：isDefault desc, createdAt desc。
 *
 * Query params:
 *   ?page=1
 *   ?pageSize=20
 *   ?imageType=封面图   (optional)
 *
 * Response: { ok:true, items, total, page, pageSize }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseIntSafe(v: string | null, fallback: number, min: number, max?: number): number {
  if (v === null) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  let r = Math.max(min, n);
  if (typeof max === 'number') r = Math.min(max, r);
  return r;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = parseIntSafe(sp.get('page'), 1, 1);
    const pageSize = parseIntSafe(sp.get('pageSize'), 20, 1, 100);
    const imageType = sp.get('imageType');

    const where: Record<string, unknown> = {};
    if (imageType) where.imageType = imageType;

    const [items, total] = await Promise.all([
      prisma.imagePreset.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.imagePreset.count({ where }),
    ]);

    return NextResponse.json(
      { ok: true, items, total, page, pageSize },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'presets list failed' },
      { status: 500 },
    );
  }
}
