// /m/history · v0.9 b3 移动端 AI 输出历史
import { prisma } from '@/lib/db';
import MHistoryClient from './MHistoryClient';

export const dynamic = 'force-dynamic';

export default async function MHistoryPage() {
  const list = await prisma.aIOutput.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <MHistoryClient
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
