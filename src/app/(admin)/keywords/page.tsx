import { prisma } from '@/lib/db';
import KeywordsClient from './KeywordsClient';

export const dynamic = 'force-dynamic';

export default async function KeywordsPage() {
  const list = await prisma.keyword.findMany({
    orderBy: [{ category: 'asc' }, { platform: 'asc' }, { keyword: 'asc' }],
  });
  return (
    <KeywordsClient
      initial={list.map((k) => ({
        id: k.id,
        category: k.category,
        platform: k.platform,
        keyword: k.keyword,
      }))}
    />
  );
}
