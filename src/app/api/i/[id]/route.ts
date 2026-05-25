/**
 * v0.13 B3 · 图床短链 · GET /api/i/[id]
 *
 * 行为：
 *   - 用 Asset.id（cuid 25 字符）作短链 key
 *   - DB 查 Asset → 302 redirect 到真实 /uploads/<fileName>
 *   - Asset 不存在或 url 缺失 → 404
 *   - 不暴露磁盘真实文件名（用户看到的链接只到 /i/<id>）
 *
 * 0 schema 改 · 0 LLM/IMAGE 消耗
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = (params?.id ?? '').trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });
  }
  try {
    const a = await prisma.asset.findUnique({ where: { id } });
    if (!a || !a.url) {
      return NextResponse.json({ ok: false, error: 'asset not found' }, { status: 404 });
    }
    // 永远 302（temporary redirect），便于以后改成签名 url 或鉴权
    const target = a.url.startsWith('/') ? a.url : '/' + a.url;
    return NextResponse.redirect(new URL(target, _req.url), 302);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'short-link lookup failed' },
      { status: 500 },
    );
  }
}
