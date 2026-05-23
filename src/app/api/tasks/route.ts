/**
 * GET /api/tasks · v0.11 B3 list endpoint
 *
 * Recon §六.A 标记为 404，B3 补齐为列表 GET（不影响已有 /api/tasks/[id] 等子路由）。
 *
 * Query params:
 *   ?page=1               (default 1, min 1)
 *   ?pageSize=20          (default 20, min 1, max 100)
 *   ?platform=xiaohongshu (optional, exact match)
 *   ?status=pending       (optional, exact match)
 *   ?today=1              (optional, sort desc by createdAt; default desc by updatedAt)
 *
 * Response: { ok:true, items, total, page, pageSize }
 *
 * 0 LLM/IMAGE 消耗。不动现有 schema。
 * 不导出 POST/PUT —— 创建/编辑仍在 /api/tasks/[id] 路径中。
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
    const platform = sp.get('platform');
    const status = sp.get('status');
    const today = sp.get('today') === '1';

    const where: Record<string, unknown> = {};
    if (platform) where.platform = platform;
    if (status) where.status = status;

    const orderBy = today
      ? [{ createdAt: 'desc' as const }]
      : [{ updatedAt: 'desc' as const }];

    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json(
      { ok: true, items, total, page, pageSize },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'tasks list failed' },
      { status: 500 },
    );
  }
}
