import { prisma } from '@/lib/db';
import MClientsClient from './MClientsClient';

export const dynamic = 'force-dynamic';

export default async function MClientsPage() {
  const list = await prisma.client.findMany({
    orderBy: [{ lastContact: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: { _count: { select: { notes: true } } },
  });
  return (
    <MClientsClient
      initial={list.map((c) => ({
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
}
