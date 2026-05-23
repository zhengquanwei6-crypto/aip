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

export default async function MCalendarDayPage({ params }: PageProps) {
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Link href="/m/calendar" className="text-sm text-brand-600">
          ← 全周
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/m/calendar/${prevDow}`}
            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
          >
            ← {DAY_LABELS[prevDow - 1]}
          </Link>
          <Link
            href={`/m/calendar/${nextDow}`}
            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
          >
            {DAY_LABELS[nextDow - 1]} →
          </Link>
        </div>
      </div>

      <div
        className={
          'rounded-xl border p-3 ' +
          (isToday
            ? 'border-brand-500 bg-brand-50'
            : 'border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800')
        }
      >
        <div className="flex items-center gap-2">
          <div className="font-semibold text-slate-800 dark:text-slate-100">
            {DAY_LABELS[dow - 1]}
          </div>
          {isToday && <span className="badge-blue">今日</span>}
          <div className="text-xs text-slate-500 truncate flex-1">
            {schedule?.theme ?? ''}
          </div>
          <div className="text-xs text-slate-400 shrink-0">{tasks.length} 条</div>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="text-sm text-slate-400 text-center py-12">
          本日暂无任务。
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const stripColor =
              t.platform === 'xiaohongshu'
                ? 'border-l-rose-500'
                : 'border-l-amber-500';
            return (
              <Link
                key={t.id}
                href={`/m/calendar/${dow}/task/${t.id}`}
                className={`block rounded-lg border-l-4 ${stripColor} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 active:bg-slate-50 dark:active:bg-slate-800`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-slate-500">
                    {t.publishTime}
                  </span>
                  <StatusBadge status={t.status} />
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {PLATFORM_LABEL[t.platform]}·{t.contentType}
                </div>
                <div className="text-sm text-slate-800 dark:text-slate-100 truncate">
                  {t.title}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const item = TASK_STATUSES.find((s) => s.value === status);
  return <span className={item?.badge ?? 'badge-gray'}>{item?.label ?? status}</span>;
}
