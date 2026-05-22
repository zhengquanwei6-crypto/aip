import { prisma } from '@/lib/db';
import ScriptsClient from './ScriptsClient';

export const dynamic = 'force-dynamic';

export default async function ScriptsPage() {
  const list = await prisma.script.findMany({
    orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
  });
  return (
    <ScriptsClient
      initial={list.map((s) => ({
        id: s.id,
        type: s.type,
        title: s.title,
        content: s.content,
      }))}
    />
  );
}
