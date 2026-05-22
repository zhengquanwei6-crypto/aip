import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import MTaskEditClient from './MTaskEditClient';

export const dynamic = 'force-dynamic';

export default async function MTaskEditPage({
  params,
}: {
  params: { dow: string; taskId: string };
}) {
  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: { schedule: true },
  });
  if (!task) return notFound();

  return (
    <div className="space-y-3">
      <Link href="/m/calendar" className="text-sm text-brand-600 inline-block">
        ← 返回日历
      </Link>
      <MTaskEditClient
        task={{
          id: task.id,
          platform: task.platform,
          publishTime: task.publishTime,
          category: task.category,
          contentType: task.contentType,
          title: task.title,
          body: task.body ?? '',
          coverText: task.coverText ?? '',
          imageUrl: task.imageUrl ?? '',
          status: task.status,
        }}
      />
    </div>
  );
}
