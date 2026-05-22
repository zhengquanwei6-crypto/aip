import { prisma } from '@/lib/db';
import MKeywordsClient from './MKeywordsClient';

export const dynamic = 'force-dynamic';

export default async function MKeywordsPage() {
  const list = await prisma.keyword.findMany({
    orderBy: [{ category: 'asc' }, { platform: 'asc' }],
  });
  return (
    <MKeywordsClient
      initial={list.map((k) => ({
        id: k.id,
        category: k.category,
        platform: k.platform,
        keyword: k.keyword,
      }))}
    />
  );
}
