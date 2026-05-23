import { prisma } from '@/lib/db';
import ClientsClient from './ClientsClient';
import PricingClient from '../pricing/PricingClient';
import { AgentLauncher } from '@/components/agents/AgentDrawer';
import ClientsTabsShell, { type ClientsTab } from './ClientsTabsShell';

export const dynamic = 'force-dynamic';

/**
 * v0.11 B5 · /clients 页加 Tabs，吸收 /pricing 内容（tab=list / tab=pricing）。
 *
 * 数据策略：两个 tab 的数据都在 server 一次性拉好，传给 client tabs shell。
 * 这样首次进入 /clients?tab=pricing 也是 SSR 渲染，no extra fetch.
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const tab: ClientsTab = searchParams?.tab === 'pricing' ? 'pricing' : 'list';

  const [clientList, pricingList] = await Promise.all([
    prisma.client.findMany({
      orderBy: [{ lastContact: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: { _count: { select: { notes: true } } },
    }),
    prisma.pricePackage.findMany({
      orderBy: [{ category: 'asc' }, { tier: 'asc' }],
    }),
  ]);

  const listNode = (
    <ClientsClient
      initial={clientList.map((c) => ({
        id: c.id,
        nickname: c.nickname,
        platform: c.platform,
        category: c.category ?? '',
        tags: c.tags ?? '',
        status: c.status,
        totalOrders: c.totalOrders,
        totalRevenue: c.totalRevenue,
        lastContact: c.lastContact?.toISOString() ?? null,
        noteCount: c._count.notes,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );

  const pricingNode = (
    <>
      <PricingClient
        initial={pricingList.map((p) => ({
          id: p.id,
          category: p.category,
          tier: p.tier,
          name: p.name,
          priceRange: p.priceRange,
          description: p.description ?? '',
        }))}
      />
      <AgentLauncher slug="price-quoter" />
    </>
  );

  return (
    <ClientsTabsShell active={tab} list={listNode} pricing={pricingNode} />
  );
}
