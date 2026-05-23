/**
 * v0.11 B1 · /api/settings/keys/[id]/promote
 *
 * POST：把这条 key 的 priority 设为同 provider 中最低的减 1，使其浮到队首。
 *
 * 注：选 key 算法是 ORDER BY priority ASC, createdAt ASC，所以 priority 越小越先用。
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = params.id;
    if (!id) return NextResponse.json({ ok: false, error: 'id 缺失' }, { status: 400 });

    const row = await prisma.apiKey.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ ok: false, error: 'key 不存在' }, { status: 404 });

    // 找同 provider 内最小 priority
    const head = await prisma.apiKey.findFirst({
      where: { provider: row.provider, id: { not: id } },
      orderBy: { priority: 'asc' },
      select: { priority: true },
    });

    let newPriority = 0;
    if (head) newPriority = head.priority - 1;
    else newPriority = -1; // 没有别的同 provider 行，给个负值确保仍排前

    const updated = await prisma.apiKey.update({
      where: { id },
      data: { priority: newPriority },
    });

    return NextResponse.json({
      ok: true,
      id: updated.id,
      provider: updated.provider,
      priority: updated.priority,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
