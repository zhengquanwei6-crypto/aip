import { prisma } from '@/lib/db';
import HistoryClient from '../history/HistoryClient';
import AssetsClient from '../assets/AssetsClient';
import WorkspaceTabsShell, { type WorkspaceTab } from './WorkspaceTabsShell';

export const dynamic = 'force-dynamic';

const FAV_PREFIX = 'asset:fav:';

/**
 * v0.11 B5 · /workspace = AI 输出历史 + 素材库（合并 /history + /assets）。
 *   - tab=history (默认) 渲染 HistoryClient
 *   - tab=assets          渲染 AssetsClient
 *
 * 旧 URL /history /assets 仍可访问（NAV 移除但不强 redirect，保护 deeplink）。
 *
 * Server-side 一次拉两个数据源（history 500 条 + assets 200 条 + asset:fav 收藏 map），
 * 切换 tab 时不重新 fetch（已经 hidden/show 切换两个面板）。
 */
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams?: { tab?: string; type?: string; source?: string };
}) {
  const tab: WorkspaceTab = searchParams?.tab === 'assets' ? 'assets' : 'history';

  // assets 子页支持的 ?type / ?source 筛选 —— /workspace?tab=assets&type=xxx 也能直接走
  const assetWhere: Record<string, unknown> = {};
  if (searchParams?.type) assetWhere.type = searchParams.type;
  if (searchParams?.source) assetWhere.source = searchParams.source;

  const [history, assets, favRows] = await Promise.all([
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

  return (
    <WorkspaceTabsShell active={tab} history={historyNode} assets={assetsNode} />
  );
}
