/**
 * GET /api/suggestions · v0.11 B3
 *
 * Recon §六.A 标记为 404。本项目没有独立 AISuggestion 表（schema 已侦察确认），
 * 实际"运营建议"数据落在 AIOutput.type='suggestion'。本路径列这些行。
 *
 * Query params:
 *   ?page=1
 *   ?pageSize=20
 *
 * Response: { ok:true, items, total, page, pageSize }
 *   items[i] = {
 *     id, type:'suggestion', input:string, output:string, model, createdAt,
 *     summary?: string  // 从 output JSON 中提取的摘要（容错）
 *   }
 *
 * 若未来增加独立 AISuggestion 表，可在此切换数据源（保持响应 schema）。
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

function safeSummary(output: string | null | undefined): string {
  if (!output) return '';
  try {
    const o = JSON.parse(output);
    if (typeof o?.summary === 'string') return o.summary.slice(0, 200);
    if (typeof o?.body === 'string') return o.body.slice(0, 200);
  } catch {
    // ignore
  }
  return output.slice(0, 200);
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = parseIntSafe(sp.get('page'), 1, 1);
    const pageSize = parseIntSafe(sp.get('pageSize'), 20, 1, 100);

    const where = { type: 'suggestion' as const };

    const [rows, total] = await Promise.all([
      prisma.aIOutput.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.aIOutput.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      type: r.type,
      input: r.input,
      output: r.output,
      model: r.model ?? null,
      createdAt: r.createdAt,
      summary: safeSummary(r.output),
    }));

    return NextResponse.json(
      { ok: true, items, total, page, pageSize },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'suggestions list failed' },
      { status: 500 },
    );
  }
}
