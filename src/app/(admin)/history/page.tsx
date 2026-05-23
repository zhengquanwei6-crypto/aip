import { prisma } from '@/lib/db';
import HistoryClient from './HistoryClient';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const list = await prisma.aIOutput.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  return (
    <HistoryClient
      initial={list.map((it) => ({
        id: it.id,
        type: it.type,
        input: it.input,
        output: it.output,
        model: it.model ?? '',
        createdAt: it.createdAt.toISOString(),
      }))}
    />
  );
}
