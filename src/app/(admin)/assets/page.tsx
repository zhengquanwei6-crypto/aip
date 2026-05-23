import { prisma } from '@/lib/db';
import AssetsClient from './AssetsClient';

export const dynamic = 'force-dynamic';

const FAV_PREFIX = 'asset:fav:';

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: { type?: string; source?: string };
}) {
  const where: any = {};
  if (searchParams.type) where.type = searchParams.type;
  if (searchParams.source) where.source = searchParams.source;
  const [assets, favRows] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.setting.findMany({
      where: { key: { startsWith: FAV_PREFIX } },
    }),
  ]);

  // 把 setting key 转成 { [assetId]: true }
  const favMap: Record<string, boolean> = {};
  for (const row of favRows) {
    if (row.value !== '1') continue;
    const id = row.key.slice(FAV_PREFIX.length);
    if (id) favMap[id] = true;
  }

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
      initialFavMap={favMap}
    />
  );
}
