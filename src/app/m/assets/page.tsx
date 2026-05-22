import { prisma } from '@/lib/db';
import MAssetsClient from './MAssetsClient';

export const dynamic = 'force-dynamic';

export default async function MAssetsPage() {
  const assets = await prisma.asset.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return (
    <MAssetsClient
      initial={assets.map((a) => ({
        id: a.id,
        type: a.type,
        source: a.source,
        platform: a.platform ?? '',
        category: a.category ?? '',
        url: a.url,
        prompt: a.prompt ?? '',
        fileName: a.fileName ?? '',
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  );
}
