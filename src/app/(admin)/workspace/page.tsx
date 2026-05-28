import { prisma } from '@/lib/db';
import HistoryClient from './HistoryClient';
import AssetsClient from './AssetsClient';
import ImgbedClient from './ImgbedClient';
import WorkspaceTabsShell, { type WorkspaceTab } from './WorkspaceTabsShell';

export const dynamic = 'force-dynamic';

const FAV_PREFIX = 'asset:fav:';
const IMGBED_PAGE_SIZE = 25;

/**
 * v0.14-z55 · /workspace 三 tab 整合：
 *   - tab=history (默认) 渲染 HistoryClient（500 条 AIOutput）
 *   - tab=assets         渲染 AssetsClient（200 条 Asset，含收藏）
 *   - tab=imgbed         渲染 ImgbedClient（图床上传 + 短链 + 25/页分页）
 *
 * 旧 URL /imgbed /history /assets 仍可访问（NAV 仅留 /workspace 一站式入口）。
 *
 * Server-side 一次拉三个数据源（history + assets + imgbed），切换 tab 不重 fetch。
 */
function parseImgbedPage(v: string | undefined): number {
  const n = Number.parseInt(v || '1', 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 1000) return 1000;
  return n;
}

function imgbedTabToSource(tab: string | undefined): string | undefined {
  if (tab === 'ai') return 'ai_generated';
  if (tab === 'manual') return 'manual_upload';
  return undefined;
}

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams?: {
    tab?: string;
    type?: string;
    source?: string;
    // imgbed 子参数（避开和上面冲突，用 ib 前缀）
    ibTab?: string;
    ibPage?: string;
  };
}) {
  const rawTab = searchParams?.tab;
  const tab: WorkspaceTab =
    rawTab === 'assets' ? 'assets'
    : rawTab === 'imgbed' ? 'imgbed'
    : 'history';

  // assets 筛选
  const assetWhere: Record<string, unknown> = {};
  if (searchParams?.type) assetWhere.type = searchParams.type;
  if (searchParams?.source) assetWhere.source = searchParams.source;

  // imgbed 参数
  const ibTab = (searchParams?.ibTab as 'all' | 'ai' | 'manual' | undefined) ?? 'all';
  const ibPage = parseImgbedPage(searchParams?.ibPage);
  const ibSource = imgbedTabToSource(ibTab);
  const ibWhere: Record<string, unknown> = {};
  if (ibSource) ibWhere.source = ibSource;

  const [history, assets, favRows, imgbedItems, ibTotal, ibCountAi, ibCountManual] =
    await Promise.all([
      prisma.aIOutput.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.asset.findMany({
        where: assetWhere,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.setting.findMany({
        where: { key: { startsWith: FAV_PREFIX } },
      }),
      prisma.asset.findMany({
        where: ibWhere,
        orderBy: { createdAt: 'desc' },
        skip: (ibPage - 1) * IMGBED_PAGE_SIZE,
        take: IMGBED_PAGE_SIZE,
      }),
      prisma.asset.count({ where: ibWhere }),
      prisma.asset.count({ where: { source: 'ai_generated' } }),
      prisma.asset.count({ where: { source: 'manual_upload' } }),
    ]);

  const favMap: Record<string, boolean> = {};
  for (const row of favRows) {
    if (row.value !== '1') continue;
    const id = row.key.slice(FAV_PREFIX.length);
    if (id) favMap[id] = true;
  }

  const historyNode = (
    <HistoryClient
      initial={history.map((it) => ({
        id: it.id,
        type: it.type,
        input: it.input,
        output: it.output,
        model: it.model ?? '',
        createdAt: it.createdAt.toISOString(),
      }))}
    />
  );

  const assetsNode = (
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
        type: searchParams?.type ?? '',
        source: searchParams?.source ?? '',
      }}
      initialFavMap={favMap}
    />
  );

  const imgbedNode = (
    <ImgbedClient
      initialItems={imgbedItems.map((a) => ({
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
      total={ibTotal}
      page={ibPage}
      pageSize={IMGBED_PAGE_SIZE}
      tab={ibTab}
      stats={{
        all: ibCountAi + ibCountManual,
        ai: ibCountAi,
        manual: ibCountManual,
      }}
    />
  );

  return (
    <WorkspaceTabsShell
      active={tab}
      history={historyNode}
      assets={assetsNode}
      imgbed={imgbedNode}
    />
  );
}
