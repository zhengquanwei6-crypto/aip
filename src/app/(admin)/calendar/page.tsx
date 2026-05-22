import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PLATFORM_LABEL, TASK_STATUSES } from '@/lib/constants';
import { todayDayOfWeek } from '@/lib/date';

export const dynamic = 'force-dynamic';

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export default async function CalendarPage() {
  const schedules = await prisma.schedule.findMany({
    orderBy: { dayOfWeek: 'asc' },
    include: { tasks: { orderBy: { publishTime: 'asc' } } },
  });
  const todayDow = todayDayOfWeek();

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">本周发布计划</h2>
          <span className="text-sm text-slate-500">
            每天 6 条小红书 + 4 条闲鱼
          </span>
        </div>
        <div className="card-body grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {schedules.map((s) => {
            const isToday = s.dayOfWeek === todayDow;
            return (
              <div
                key={s.id}
                className={`rounded-md border p-3 ${
                  isToday ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-800">
                    {DAY_LABELS[s.dayOfWeek - 1]}
                  </div>
                  {isToday && <span className="badge-blue">今日</span>}
                </div>
                <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {s.theme}
                </div>
                <div className="mt-3 space-y-1.5">
                  {s.tasks.map((t) => (
                    <Link
                      key={t.id}
                      href={`/calendar/${s.dayOfWeek}/task/${t.id}`}
                      className="block text-xs rounded border border-slate-200 hover:border-brand-400 bg-white p-2 leading-relaxed"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-mono">
                          {t.publishTime}
                        </span>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="mt-1 text-slate-700 truncate">
                        {PLATFORM_LABEL[t.platform]}·{t.contentType}
                      </div>
                      <div className="text-slate-500 truncate">{t.title}</div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const item = TASK_STATUSES.find((s) => s.value === status);
  return <span className={item?.badge ?? 'badge-gray'}>{item?.label ?? status}</span>;
}
