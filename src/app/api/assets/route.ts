/**
 * GET /api/assets · v0.11 B3 list endpoint
 *
 * Recon §六.A 标记为 404。补齐为列表 GET，不动现有
 *   POST /api/assets/upload, GET/PUT/DELETE /api/assets/[id], /api/assets/[id]/favorite
 *
 * Query params:
 *   ?page=1               (default 1, min 1)
 *   ?pageSize=20          (default 20, min 1, max 100)
 *   ?type=封面图          (optional, exact match — Asset.type 中文枚举)
 *   ?platform=xiaohongshu (optional, exact match)
 *   ?source=ai_generated  (optional, ai_generated|manual_upload)
 *
 * 默认 desc by updatedAt。
 * Response: { ok:true, items, total, page, pageSize }
 *
 * 0 LLM/IMAGE 消耗。
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
    const type = sp.get('type');
    const platform = sp.get('platform');
    const source = sp.get('source');

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (platform) where.platform = platform;
    if (source) where.source = source;

    const [items, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.asset.count({ where }),
    ]);

    return NextResponse.json(
      { ok: true, items, total, page, pageSize },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'assets list failed' },
      { status: 500 },
    );
  }
}
