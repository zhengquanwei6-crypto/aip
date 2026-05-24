// v0.11 B10 · GET /api/market/platforms
//
// 返回 PlatformInfo[]（含三平台介绍 + 推荐 KPI + 推荐工作流）
// 0 LLM/IMAGE 消耗 · 纯 Setting 表读取 + seed fallback。

import { NextResponse } from 'next/server';
import { getAllPlatformInfo } from '@/lib/market/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const platforms = await getAllPlatformInfo();
    return NextResponse.json({ ok: true, platforms, total: platforms.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
