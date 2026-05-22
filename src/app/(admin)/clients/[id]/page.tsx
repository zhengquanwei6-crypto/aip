import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import ClientDetailClient from './ClientDetailClient';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const c = await prisma.client.findUnique({
    where: { id: params.id },
    include: { notes: { orderBy: { createdAt: 'desc' } } },
  });
  if (!c) return notFound();

  return (
    <div className="space-y-4">
      <Link href="/clients" className="text-sm text-brand-600">
        ← 返回客户列表
      </Link>
      <ClientDetailClient
        client={{
          id: c.id,
          nickname: c.nickname,
          platform: c.platform,
          category: c.category ?? '',
          tags: c.tags ?? '',
          status: c.status,
          totalOrders: c.totalOrders,
          totalRevenue: c.totalRevenue,
          lastContact: c.lastContact?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
          notes: c.notes.map((n) => ({
            id: n.id,
            type: n.type,
            content: n.content,
            amount: n.amount,
            createdAt: n.createdAt.toISOString(),
          })),
        }}
      />
    </div>
  );
}
