import { prisma } from '@/lib/db';
import MScriptsClient from './MScriptsClient';

export const dynamic = 'force-dynamic';

export default async function MScriptsPage() {
  const list = await prisma.script.findMany({
    orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
  });
  return (
    <MScriptsClient
      initial={list.map((s) => ({
        id: s.id,
        type: s.type,
        title: s.title,
        content: s.content,
      }))}
    />
  );
}
