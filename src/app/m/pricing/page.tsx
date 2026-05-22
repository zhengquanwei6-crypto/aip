import { prisma } from '@/lib/db';
import MPricingClient from './MPricingClient';

export const dynamic = 'force-dynamic';

export default async function MPricingPage() {
  const list = await prisma.pricePackage.findMany({
    orderBy: [{ category: 'asc' }, { tier: 'asc' }],
  });
  return (
    <MPricingClient
      initial={list.map((p) => ({
        id: p.id,
        category: p.category,
        tier: p.tier,
        name: p.name,
        priceRange: p.priceRange,
        description: p.description ?? '',
      }))}
    />
  );
}
