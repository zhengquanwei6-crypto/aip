/**
 * GET /api/dashboard/summary · v0.11 B3
 *
 * 单 fetch 聚合所有 dashboard 数据，避免多次客户端调用。
 * 实际逻辑在 ./aggregate.ts，方便 SSR 同进程复用。
 *
 * 响应 schema 见 DashboardSummary 类型；0 LLM/IMAGE 消耗。
 */
import { NextResponse } from 'next/server';
import { buildDashboardSummary } from './aggregate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary = await buildDashboardSummary();
    return NextResponse.json(summary, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? 'dashboard-summary failed',
      },
      { status: 500 },
    );
  }
}
