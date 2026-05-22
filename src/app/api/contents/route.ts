import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/contents
 * 列出所有 Post + Product，统一格式返回
 * query:
 *   ?platform=xiaohongshu|xianyu
 *   ?status=draft|reviewed|published
 *   ?q=keyword
 *   ?limit=50
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const platform = sp.get('platform');
  const status = sp.get('status');
  const q = sp.get('q');
  const limit = Math.min(Number(sp.get('limit') ?? 50), 200);

  const postWhere: any = {};
  const productWhere: any = {};
  if (platform === 'xiaohongshu') {
    postWhere.platform = 'xiaohongshu';
  } else if (platform === 'xianyu') {
    postWhere.id = '__never__'; // 排除 post
  }
  if (status) {
    postWhere.status = status;
    productWhere.status = status;
  }
  if (q) {
    postWhere.OR = [
      { title: { contains: q } },
      { body: { contains: q } },
    ];
    productWhere.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const [posts, products] = await Promise.all([
    platform === 'xianyu'
      ? Promise.resolve([])
      : prisma.post.findMany({
          where: postWhere,
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
    platform === 'xiaohongshu'
      ? Promise.resolve([])
      : prisma.product.findMany({
          where: productWhere,
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
  ]);

  type Item = {
    id: string;
    type: 'post' | 'product';
    platform: string;
    title: string;
    body: string;
    coverText?: string;
    tags?: string;
    cta?: string;
    priceTier?: string;
    deliveryScope?: string;
    revisionRule?: string;
    status: string;
    createdAt: string;
  };

  const items: Item[] = [
    ...(posts as any[]).map((p) => ({
      id: p.id,
      type: 'post' as const,
      platform: p.platform,
      title: p.title,
      body: p.body,
      coverText: p.coverText ?? undefined,
      tags: p.tags ?? undefined,
      cta: p.cta ?? undefined,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    })),
    ...(products as any[]).map((p) => ({
      id: p.id,
      type: 'product' as const,
      platform: 'xianyu',
      title: p.title,
      body: p.description,
      coverText: p.coverText ?? undefined,
      priceTier: p.priceTier ?? undefined,
      deliveryScope: p.deliveryScope ?? undefined,
      revisionRule: p.revisionRule ?? undefined,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ ok: true, items: items.slice(0, limit) });
}
