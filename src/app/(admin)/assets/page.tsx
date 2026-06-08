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

  const favMap: Record<string, boolean> = {};
  for (const row of favRows) {
    if (row.value !== '1') continue;
    const id = row.key.slice(FAV_PREFIX.length);
    if (id) favMap[id] = true;
  }

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div className="page-kicker">资产模块</div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="page-title">资产库</h1>
            <p className="page-subtitle">
              统一查看生成图片、上传素材、收藏、分享文件和源提示词。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="metric-tile px-3 py-2 text-center">
              <div className="text-lg font-semibold tabular-nums">{assets.length}</div>
              <div className="text-slate-500">已载入</div>
            </div>
            <div className="metric-tile px-3 py-2 text-center">
              <div className="text-lg font-semibold tabular-nums">{Object.keys(favMap).length}</div>
              <div className="text-slate-500">已收藏</div>
            </div>
            <div className="metric-tile px-3 py-2 text-center">
              <div className="text-lg font-semibold">200</div>
              <div className="text-slate-500">展示上限</div>
            </div>
          </div>
        </div>
      </section>
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
    </div>
  );
}
