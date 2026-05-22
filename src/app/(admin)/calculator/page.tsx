import { prisma } from '@/lib/db';
import { extractMidPrice } from '@/lib/calculator';
import CalculatorClient from './CalculatorClient';

export const dynamic = 'force-dynamic';

export default async function CalculatorPage() {
  const packages = await prisma.pricePackage.findMany({
    orderBy: [{ category: 'asc' }, { tier: 'asc' }],
  });
  return (
    <CalculatorClient
      packages={packages.map((p) => ({
        id: p.id,
        category: p.category,
        tier: p.tier,
        name: p.name,
        priceRange: p.priceRange,
        midPrice: extractMidPrice(p.priceRange),
        description: p.description ?? '',
      }))}
    />
  );
}
