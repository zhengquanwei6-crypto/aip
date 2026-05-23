import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PLATFORM_LABEL, TASK_STATUSES } from '@/lib/constants';
import { todayDayOfWeek } from '@/lib/date';

export const dynamic = 'force-dynamic';

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

interface PageProps {
  params: { dow: string };
}

export default async function CalendarDayPage({ params }: PageProps) {
  const dow = Number(params.dow);
  if (!Number.isInteger(dow) || dow < 1 || dow > 7) {
    return notFound();
  }

  const schedule = await prisma.schedule.findUnique({
    where: { dayOfWeek: dow },
    include: { tasks: { orderBy: { publishTime: 'asc' } } },
  });
  const todayDow = todayDayOfWeek();

  const prevDow = dow === 1 ? 7 : dow - 1;
  const nextDow = dow === 7 ? 1 : dow + 1;
  const isToday = dow === todayDow;

  const tasks = schedule?.tasks ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href="/calendar" className="text-sm text-brand-600">
          ← 返回发布日历
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/calendar/${prevDow}`} className="btn-secondary text-xs px-2 py-1">
            ← {DAY_LABELS[prevDow - 1]}
          </Link>
          <Link href={`/calendar/${nextDow}`} className="btn-secondary text-xs px-2 py-1">
            {DAY_LABELS[nextDow - 1]} →
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold flex items-center gap-2">
            <span>{DAY_LABELS[dow - 1]}</span>
            {isToday && <span className="badge-blue">今日</span>}
            {schedule?.theme && (
              <span className="text-sm text-slate-500 font-normal">· {schedule.theme}</span>
            )}
          </h2>
          <span className="text-sm text-slate-500">{tasks.length} 条任务</span>
        </div>
        <div className="card-body">
          {tasks.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-12">
              本日暂无任务。可以前往 <Link href="/content" className="text-brand-600 hover:underline">/content</Link> 直接生成。
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/calendar/${dow}/task/${t.id}`}
                  className="block rounded-md border border-slate-200 hover:border-brand-400 dark:border-slate-700 dark:hover:border-brand-500 bg-white dark:bg-slate-900 p-3 transition-colors"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-slate-500">{t.publishTime}</span>
                      <span
                        className={
                          t.platform === 'xiaohongshu' ? 'badge-red' : 'badge-yellow'
                        }
                      >
                        {PLATFORM_LABEL[t.platform]}
                      </span>
                      <span className="badge-gray">{t.category}</span>
                      <span className="badge-gray">{t.contentType}</span>
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                    {t.title}
                  </div>
                  {t.coverText && (
                    <div className="mt-1 text-xs text-slate-500 truncate">
                      封面：{t.coverText}
                    </div>
                  )}
                  {t.body && (
                    <div className="mt-1 text-xs text-slate-500 line-clamp-2">
                      {t.body}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const item = TASK_STATUSES.find((s) => s.value === status);
  return <span className={item?.badge ?? 'badge-gray'}>{item?.label ?? status}</span>;
}
