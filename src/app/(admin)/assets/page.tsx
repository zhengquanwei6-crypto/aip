import { prisma } from '@/lib/db';
import AssetsClient from './AssetsClient';

export const dynamic = 'force-dynamic';

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: { type?: string; source?: string };
}) {
  const where: any = {};
  if (searchParams.type) where.type = searchParams.type;
  if (searchParams.source) where.source = searchParams.source;
  const assets = await prisma.asset.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return (
    <AssetsClient
      initialAssets={assets.map((a) => ({
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
      filters={{
        type: searchParams.type ?? '',
        source: searchParams.source ?? '',
      }}
    />
  );
}
