import { prisma } from '@/lib/db';
import ContentsClient from './ContentsClient';

export const dynamic = 'force-dynamic';

export default async function ContentsPage() {
  const [posts, products] = await Promise.all([
    prisma.post.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.product.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);

  const items = [
    ...posts.map((p) => ({
      id: p.id,
      type: 'post' as const,
      platform: p.platform,
      title: p.title,
      body: p.body,
      coverText: p.coverText ?? '',
      tags: p.tags ?? '',
      cta: p.cta ?? '',
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    })),
    ...products.map((p) => ({
      id: p.id,
      type: 'product' as const,
      platform: 'xianyu',
      title: p.title,
      body: p.description,
      coverText: p.coverText ?? '',
      priceTier: p.priceTier ?? '',
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return <ContentsClient initial={items} />;
}
