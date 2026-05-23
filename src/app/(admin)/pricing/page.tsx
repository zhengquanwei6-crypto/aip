import { prisma } from '@/lib/db';
import PricingClient from './PricingClient';
import { AgentLauncher } from '@/components/agents/AgentDrawer';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const list = await prisma.pricePackage.findMany({
    orderBy: [{ category: 'asc' }, { tier: 'asc' }],
  });
  return (
    <>
      <PricingClient
        initial={list.map((p) => ({
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
}
