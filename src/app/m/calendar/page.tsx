import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PLATFORM_LABEL, TASK_STATUSES } from '@/lib/constants';
import { todayDayOfWeek } from '@/lib/date';

export const dynamic = 'force-dynamic';

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export default async function MCalendarPage() {
  const schedules = await prisma.schedule.findMany({
    orderBy: { dayOfWeek: 'asc' },
    include: { tasks: { orderBy: { publishTime: 'asc' } } },
  });
  const todayDow = todayDayOfWeek();

  return (
    <div className="space-y-3">
      {schedules.map((s) => {
        const isToday = s.dayOfWeek === todayDow;
        return (
          <details
            key={s.id}
            open={isToday}
            className={
              'rounded-xl border ' +
              (isToday
                ? 'border-brand-500 bg-brand-50'
                : 'border-slate-200 bg-white')
            }
          >
            <summary className="px-3 py-3 flex items-center justify-between gap-2 list-none cursor-pointer [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2 min-w-0">
                <div className="font-semibold text-slate-800">
                  {DAY_LABELS[s.dayOfWeek - 1]}
                </div>
                {isToday && <span className="badge-blue">今日</span>}
                <div className="text-xs text-slate-500 truncate">
                  {s.theme}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-slate-400">
                  {s.tasks.length}
                </span>
                <svg
                  className="w-4 h-4 text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </summary>
            <div className="px-3 pb-3 space-y-1.5">
              {s.tasks.map((t) => {
                const stripColor =
                  t.platform === 'xiaohongshu' ? 'border-l-rose-500' : 'border-l-amber-500';
                return (
                  <Link
                    key={t.id}
                    href={`/m/calendar/${s.dayOfWeek}/task/${t.id}`}
                    className={`block rounded-lg border-l-4 ${stripColor} bg-white border border-slate-200 p-2.5 active:bg-slate-50`}
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
                    <div className="text-sm text-slate-800 truncate">{t.title}</div>
                  </Link>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const item = TASK_STATUSES.find((s) => s.value === status);
  return <span className={item?.badge ?? 'badge-gray'}>{item?.label ?? status}</span>;
}
