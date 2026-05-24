// v0.11 B10 · GET/POST /api/market/trends
//
// GET  ?platform=xiaohongshu|xianyu|qianniu&limit=N
//   → { ok, items: MarketSnapshot[] }
//   不带 platform 时返回所有平台的最近 N 条
// POST { platform, date?, dataPoints, source?, placeholder?, note? }
//   → { ok, snapshot: MarketSnapshot }
//   400 platform / dataPoints 缺失或非法
//
// 0 LLM/IMAGE 消耗。本批先 open（不校验 token），未来 v0.10 b1 上线后接 SyncToken。

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getMarketSnapshots,
  saveMarketSnapshot,
} from '@/lib/market/store';
import {
  PLATFORM_SLUGS,
  trendsPostBodySchema,
  type MarketPlatformSlug,
  type MarketSnapshot,
} from '@/lib/market/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function todayShanghaiISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parsePlatformQuery(raw: string | null): MarketPlatformSlug | null {
  if (!raw) return null;
  return PLATFORM_SLUGS.includes(raw as MarketPlatformSlug)
    ? (raw as MarketPlatformSlug)
    : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platformRaw = searchParams.get('platform');
  const limitRaw = searchParams.get('limit');

  // 校验 platform：传了但非合法 slug → 400
  if (platformRaw && !PLATFORM_SLUGS.includes(platformRaw as MarketPlatformSlug)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'platform 只接受 xiaohongshu / xianyu / qianniu',
      },
      { status: 400 },
    );
  }
  const platform = parsePlatformQuery(platformRaw);
  const limit = limitRaw ? Math.max(1, Math.min(parseInt(limitRaw, 10) || 30, 200)) : 30;

  try {
    const items = platform
      ? await getMarketSnapshots({ platform, limit })
      : await getMarketSnapshots({ limit });
    return NextResponse.json({ ok: true, platform, items, total: items.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: '请求体不是合法 JSON' },
      { status: 400 },
    );
  }

  // 平台缺失专门给一条更友好的错（避免被 zod 提示遮盖）
  if (
    body === null ||
    typeof body !== 'object' ||
    !('platform' in (body as Record<string, unknown>))
  ) {
    return NextResponse.json(
      { ok: false, error: 'platform 必填' },
      { status: 400 },
    );
  }

  const parsed = trendsPostBodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    const path = first?.path.join('.') || 'body';
    const reason = first?.message || '参数非法';
    return NextResponse.json(
      { ok: false, error: `${path}: ${reason}` },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const date = data.date ?? todayShanghaiISO();

  const snapshot: MarketSnapshot = {
    platform: data.platform,
    date,
    dataPoints: data.dataPoints,
    source: data.source ?? 'manual',
    placeholder: data.placeholder ?? false,
    note: data.note,
    capturedAt: new Date().toISOString(),
  };

  try {
    const saved = await saveMarketSnapshot(snapshot);
    return NextResponse.json({ ok: true, snapshot: saved }, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
