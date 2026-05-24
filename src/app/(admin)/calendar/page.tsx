/**
 * /calendar · 本周发布计划（7 天 details · 今日 open · 其它 closed）
 *
 * v0.12 B3.4 BUG-M16：自适应断点修复
 *   - 旧版 grid: 1 → sm:2 → lg:4 → xl:7（漏掉 md:768~1024 区间，
 *     md 下还是 2 col，与 sticky 头部 + sidebar 收窄之后内容相比，
 *     单卡宽度 ~280px 已偏窄，标题截断 + 时间换行错位）
 *   - 新版 grid: 1 → sm:2 → md:3 → lg:4 → xl:7（md 加一档 3 col）
 *   - h2 + DayCard summary 文字字号收紧到 sm，避免 md 下二行换行
 */
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
    <div className="space-y-4 sm:space-y-6" data-v012-b3-calendar>
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">本周发布计划</h2>
          <span className="hidden sm:inline text-sm text-slate-500">
            每天 6 条小红书 + 4 条闲鱼
          </span>
        </div>
        {/* v0.12 B3.4 BUG-M16: 加 md:grid-cols-3 中间档，避免 md 范围（768~1024）卡片过窄 */}
        <div className="card-body grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
          {schedules.map((s) => {
            const isToday = s.dayOfWeek === todayDow;
            return (
              <DayCard
                key={s.id}
                schedule={s}
                isToday={isToday}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayCard({
  schedule,
  isToday,
}: {
  schedule: any;
  isToday: boolean;
}) {
  return (
    <details
      open={isToday}
      data-force-open
      className={`calendar-day-card group rounded-md border ${
        isToday ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'
      }`}
    >
      <summary className="p-3 flex items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-semibold text-slate-800">
            {DAY_LABELS[schedule.dayOfWeek - 1]}
          </div>
          {isToday && <span className="badge-blue">今日</span>}
          {/* v0.12 B3.4 BUG-M16: md 下也显示 theme（之前 hidden sm:block 在 md~lg 偏紧凑） */}
          <div className="hidden md:block text-xs text-slate-500 truncate">
            {schedule.theme}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400">
            {schedule.tasks.length} 条
          </span>
          <svg
            className="calendar-chevron w-4 h-4 text-slate-400 transition-transform group-open:rotate-180"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </summary>
      <div className="calendar-day-body px-3 pb-3">
        {/* v0.12 B3.4 BUG-M16: sm + md 下显示完整 theme（lg 起 summary 已显示，body 隐藏避免重复） */}
        <div className="md:hidden text-xs text-slate-500 leading-relaxed mb-2">
          {schedule.theme}
        </div>
        <div className="space-y-1.5">
          {schedule.tasks.map((t: any) => (
            <Link
              key={t.id}
              href={`/calendar/${schedule.dayOfWeek}/task/${t.id}`}
              className="block text-xs rounded border border-slate-200 hover:border-brand-400 active:border-brand-500 bg-white p-2 leading-relaxed"
            >
              <div className="flex items-center justify-between gap-2">
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
    </details>
  );
}

function StatusBadge({ status }: { status: string }) {
  const item = TASK_STATUSES.find((s) => s.value === status);
  return <span className={item?.badge ?? 'badge-gray'}>{item?.label ?? status}</span>;
}
