/**
 * GET /api/tasks · v0.11 B3 list endpoint · v0.12 B3.4 BUG-M11 字段补全 + ?q= 支持
 *
 * Recon §六.A 标记为 404，B3 补齐为列表 GET（不影响已有 /api/tasks/[id] 等子路由）。
 *
 * Query params:
 *   ?page=1               (default 1, min 1)
 *   ?pageSize=20          (default 20, min 1, max 100)
 *   ?platform=xiaohongshu (optional, exact match)
 *   ?status=pending       (optional, exact match)
 *   ?today=1              (optional, sort desc by createdAt; default desc by updatedAt)
 *   ?q=keyword            (optional · v0.12 B3.4 · 在 title / body / coverText 模糊匹配)
 *                          // CommandPalette.tsx 早就在用 ?q= 了，B3 list 没接，B3.4 补
 *
 * Response:
 *   { ok:true, items, total, page, pageSize, schedule? }
 *
 * v0.12 B3.4 字段补全（BUG-M11）：
 *   - 加 ?q= 支持（OR 模糊匹配 title / body / coverText · 大小写不敏感）
 *   - response 增加 schedule 字段（关联 Schedule.theme + dayOfWeek，方便 CommandPalette
 *     一次性展示「周X · 主题」上下文，少做一次 join 调用）
 *   - item 字段保持向后兼容（14 字段全保留），仅 prisma.task.findMany 加 include schedule
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
    const q = (sp.get('q') ?? '').trim();

    const where: Record<string, unknown> = {};
    if (platform) where.platform = platform;
    if (status) where.status = status;
    if (q) {
      // v0.12 B3.4：q 模糊匹配 title / body / coverText
      // SQLite 大小写不敏感（默认 NOCASE collation）—— prisma 不带 mode:'insensitive'，
      // SQLite 不支持该 mode 参数（仅 PG 有）。LIKE 默认 NOCASE，足以满足设计接单类目搜索。
      where.OR = [
        { title: { contains: q } },
        { body: { contains: q } },
        { coverText: { contains: q } },
      ];
    }

    const orderBy = today
      ? [{ createdAt: 'desc' as const }]
      : [{ updatedAt: 'desc' as const }];

    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          schedule: {
            select: { dayOfWeek: true, theme: true },
          },
        },
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
