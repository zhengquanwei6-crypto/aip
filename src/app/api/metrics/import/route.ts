import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizePlatform } from '@/lib/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NUMERIC = new Set([
  'impressions',
  'clicks',
  'likes',
  'favorites',
  'comments',
  'messages',
  'views',
  'consultations',
  'orders',
  'revenue',
  'averageOrderValue',
  'subscriptionLeads',
]);

function num(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(String(v).replace(/[¥,，元\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function parseDate(v: any): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  // 接受 2025-01-01 / 2025/1/1 / 2025年1月1日
  const m = s.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (m) {
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      12,
      0,
      0,
    );
    return isNaN(+d) ? null : d;
  }
  const d = new Date(s);
  return isNaN(+d) ? null : d;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows: any[] = body.rows ?? [];
    const mapping: Record<string, string> = body.mapping ?? {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: '没有要导入的行' },
        { status: 400 },
      );
    }

    let success = 0;
    const errors: { line: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const data: any = {};
      // 把每个 csv 列按 mapping 映射进 data
      for (const csvCol of Object.keys(r)) {
        const dbField = mapping[csvCol];
        if (!dbField) continue;
        const val = r[csvCol];
        if (NUMERIC.has(dbField)) {
          const n = num(val);
          if (n !== undefined) data[dbField] = n;
        } else if (dbField === 'date') {
          const d = parseDate(val);
          if (d) data.date = d;
        } else if (dbField === 'platform') {
          data.platform = normalizePlatform(String(val));
        } else if (dbField === 'title' || dbField === 'category' || dbField === 'notes') {
          if (val) data[dbField] = String(val);
        }
      }
      // 必填检查
      if (!data.platform) data.platform = 'xiaohongshu';
      if (!data.date) {
        errors.push({ line: i + 2, reason: '缺少有效日期' });
        continue;
      }
      // 自动算客单价
      if (
        data.orders &&
        data.revenue &&
        (data.averageOrderValue === undefined || data.averageOrderValue === 0)
      ) {
        data.averageOrderValue =
          Math.round((data.revenue / data.orders) * 100) / 100;
      }

      try {
        await prisma.metric.create({ data });
        success++;
      } catch (e) {
        errors.push({ line: i + 2, reason: (e as Error).message });
      }
    }

    return NextResponse.json({
      ok: true,
      success,
      total: rows.length,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
