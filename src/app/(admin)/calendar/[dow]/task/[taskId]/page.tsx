import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import TaskEditForm from './TaskEditForm';

export const dynamic = 'force-dynamic';

export default async function TaskEditPage({
  params,
}: {
  params: { dow: string; taskId: string };
}) {
  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: {
      schedule: true,
      posts: { orderBy: { createdAt: 'desc' }, take: 5 },
      products: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  if (!task) return notFound();

  return (
    <div className="space-y-4">
      <Link href="/calendar" className="text-sm text-brand-600">
        ← 返回发布日历
      </Link>
      <TaskEditForm
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
        scheduleTheme={task.schedule?.theme ?? ''}
      />

      {task.posts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">关联小红书笔记</h2>
          </div>
          <div className="card-body space-y-3">
            {task.posts.map((p) => (
              <div key={p.id} className="border-l-2 border-brand-200 pl-3">
                <div className="text-sm font-medium">{p.title}</div>
                <div className="text-xs text-slate-500 whitespace-pre-wrap mt-1">
                  {p.body.slice(0, 200)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {task.products.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">关联闲鱼商品</h2>
          </div>
          <div className="card-body space-y-3">
            {task.products.map((p) => (
              <div key={p.id} className="border-l-2 border-amber-200 pl-3">
                <div className="text-sm font-medium">{p.title}</div>
                <div className="text-xs text-slate-500 whitespace-pre-wrap mt-1">
                  {p.description.slice(0, 200)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
