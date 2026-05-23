/**
 * v0.11 B1 · /api/settings/keys/[id]
 *   PUT    → 编辑（apiKey 字段缺省=保留原值；提交字符串=覆盖；提交空字符串='' = 清空）
 *   DELETE → 删除
 *
 * 这里允许编辑 active 字段（用户手动停用/启用某条 key）。
 * priority 直接编辑也支持，但常用的「提到顶部」走 [id]/promote 端点。
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = params.id;
    if (!id) return NextResponse.json({ ok: false, error: 'id 缺失' }, { status: 400 });
    const exists = await prisma.apiKey.findUnique({ where: { id } });
    if (!exists) return NextResponse.json({ ok: false, error: 'key 不存在' }, { status: 404 });

    const body = await req.json();
    const data: Record<string, any> = {};

    if (body.provider !== undefined) {
      const p = String(body.provider).trim();
      if (!PROVIDERS.has(p)) {
        return NextResponse.json({ ok: false, error: 'provider 必须为 llm 或 image' }, { status: 400 });
      }
      data.provider = p;
    }
    if (body.label !== undefined) data.label = String(body.label).trim();
    if (body.baseUrl !== undefined) data.baseUrl = String(body.baseUrl).trim();
    if (body.model !== undefined) data.model = String(body.model).trim();
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.priority !== undefined && Number.isFinite(Number(body.priority))) {
      data.priority = Number(body.priority);
    }
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;
    // apiKey：仅当 body 显式带 apiKey 字段（非 undefined）才更新；避免 PUT 缺省导致清空
    if (body.apiKey !== undefined) {
      data.apiKey = String(body.apiKey ?? '');
    }
    // 编辑后若用户改 active=true / 修了配置，重置 consecutiveErrors=0 & lastError 清空
    if (body.resetErrors === true || body.active === true) {
      data.consecutiveErrors = 0;
      data.lastError = null;
    }

    const updated = await prisma.apiKey.update({ where: { id }, data });
    return NextResponse.json({ ok: true, item: maskRow(updated) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = params.id;
    if (!id) return NextResponse.json({ ok: false, error: 'id 缺失' }, { status: 400 });
    const exists = await prisma.apiKey.findUnique({ where: { id } });
    if (!exists) return NextResponse.json({ ok: false, error: 'key 不存在' }, { status: 404 });
    await prisma.apiKey.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
