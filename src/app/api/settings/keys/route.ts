/**
 * v0.11 B1 · /api/settings/keys
 *   GET ?provider=llm|image  → 列表（按 priority asc, createdAt asc），apiKey 字段脱敏（仅返回 isSet/length）
 *   POST                     → 创建（明文 body 提交，store 明文，符合用户「不考虑安全性」）
 *
 * 注意：
 *   - GET 永远不返回明文 apiKey（避免 SSR/HTML 出现明文）
 *   - 用户在 UI 编辑时输入新值才提交，否则 PUT 不带 apiKey 字段保留原值
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ensureApiKeysSeeded } from '@/lib/seed-api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDERS = new Set(['llm', 'image']);

function maskRow(row: any) {
  const len = (row.apiKey ?? '').length;
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    baseUrl: row.baseUrl,
    apiKey: '',
    isSet: len > 0,
    length: len,
    model: row.model,
    active: row.active,
    priority: row.priority,
    lastUsedAt: row.lastUsedAt,
    lastError: row.lastError,
    consecutiveErrors: row.consecutiveErrors,
    totalRequests: row.totalRequests,
    totalErrors: row.totalErrors,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  try {
    await ensureApiKeysSeeded();
    const provider = req.nextUrl.searchParams.get('provider');
    const where: any = {};
    if (provider) {
      if (!PROVIDERS.has(provider)) {
        return NextResponse.json({ ok: false, error: `provider 必须为 llm 或 image` }, { status: 400 });
      }
      where.provider = provider;
    }
    const rows = await prisma.apiKey.findMany({
      where,
      orderBy: [
        { provider: 'asc' },
        { priority: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    return NextResponse.json({ ok: true, items: rows.map(maskRow) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const provider = String(body.provider || '').trim();
    const label = String(body.label || '').trim();
    const baseUrl = String(body.baseUrl || '').trim();
    const apiKey = String(body.apiKey || '').trim();
    const model = String(body.model || '').trim();
    const active = body.active === undefined ? true : Boolean(body.active);
    const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0;
    const notes = body.notes ? String(body.notes) : undefined;

    if (!PROVIDERS.has(provider)) {
      return NextResponse.json({ ok: false, error: 'provider 必须为 llm 或 image' }, { status: 400 });
    }
    if (!label) return NextResponse.json({ ok: false, error: 'label 不能为空' }, { status: 400 });
    if (!baseUrl) return NextResponse.json({ ok: false, error: 'baseUrl 不能为空' }, { status: 400 });
    if (!apiKey) return NextResponse.json({ ok: false, error: 'apiKey 不能为空' }, { status: 400 });
    if (!model) return NextResponse.json({ ok: false, error: 'model 不能为空' }, { status: 400 });

    const created = await prisma.apiKey.create({
      data: {
        provider,
        label,
        baseUrl,
        apiKey,
        model,
        active,
        priority,
        ...(notes !== undefined ? { notes } : {}),
      },
    });
    return NextResponse.json({ ok: true, item: maskRow(created) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
