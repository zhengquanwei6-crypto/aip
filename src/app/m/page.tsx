import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  formatDateCN,
  todayDayOfWeek,
  daysAgo,
  startOfDay,
  endOfDay,
} from '@/lib/date';

export const dynamic = 'force-dynamic';

export default async function MHomePage() {
  const today = new Date();
  const dow = todayDayOfWeek(today);
  const schedule = await prisma.schedule.findUnique({
    where: { dayOfWeek: dow },
    include: { tasks: { orderBy: { publishTime: 'asc' } } },
  });
  const tasks = schedule?.tasks ?? [];
  const xhsCount = tasks.filter((t) => t.platform === 'xiaohongshu').length;
  const xyCount = tasks.filter((t) => t.platform === 'xianyu').length;
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const publishedCount = tasks.filter((t) => t.status === 'published').length;

  const since = daysAgo(6);
  const metrics = await prisma.metric.findMany({
    where: { date: { gte: startOfDay(since), lte: endOfDay(today) } },
  });
  const totalRevenue = metrics.reduce((s, m) => s + m.revenue, 0);
  const totalMessages = metrics.reduce((s, m) => s + m.messages, 0);
  const totalOrders = metrics.reduce((s, m) => s + m.orders, 0);

  const lastSuggestion = await prisma.aIOutput.findFirst({
    where: { type: 'suggestion' },
    orderBy: { createdAt: 'desc' },
  });
  let suggestionText = '尚未生成 AI 建议，前往「AI 建议」页面生成。';
  if (lastSuggestion) {
    try {
      const parsed = JSON.parse(lastSuggestion.output);
      suggestionText = parsed.summary ?? lastSuggestion.output.slice(0, 200);
    } catch {
      suggestionText = lastSuggestion.output.slice(0, 200);
    }
  }

  return (
    <div className="space-y-3">
      {/* 今日 */}
      <div className="rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white p-4 shadow">
        <div className="text-xs opacity-80">{formatDateCN(today)}</div>
        <div className="mt-1 font-semibold leading-snug">
          {schedule?.theme ?? '未配置'}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <Stat label="待处理" value={pendingCount} />
          <Stat label="已发布" value={publishedCount} />
          <Stat label="本周成交" value={Math.round(totalRevenue)} suffix="元" />
        </div>
      </div>

      {/* 主要操作 */}
      <div className="grid grid-cols-2 gap-3">
        <ActionCard
          href="/m/today"
          title="今日任务"
          desc={`${tasks.length} 条 · 小红书${xhsCount} · 闲鱼${xyCount}`}
          color="bg-rose-50 text-rose-700 border-rose-200"
        />
        <ActionCard
          href="/m/content"
          title="生成文案"
          desc="小红书/闲鱼一键出稿"
          color="bg-blue-50 text-blue-700 border-blue-200"
        />
        <ActionCard
          href="/m/image"
          title="生成图片"
          desc="GPT IMG 2 出图"
          color="bg-emerald-50 text-emerald-700 border-emerald-200"
        />
        <ActionCard
          href="/m/analytics"
          title="录入数据"
          desc="发布后回填指标"
          color="bg-amber-50 text-amber-700 border-amber-200"
        />
      </div>

      {/* AI 建议 */}
      <div className="rounded-xl bg-white border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">今日 AI 建议</h3>
          <Link
            href="/m/suggestions"
            className="text-xs text-brand-600"
          >
            更多 →
          </Link>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed mt-2 whitespace-pre-wrap line-clamp-5">
          {suggestionText}
        </p>
      </div>

      {/* 7 天概览 */}
      <div className="rounded-xl bg-white border border-slate-200 p-4">
        <h3 className="font-semibold mb-3">最近 7 天</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <SimpleStat label="私信" value={totalMessages} />
          <SimpleStat label="成交" value={totalOrders} />
          <SimpleStat
            label="金额"
            value={Math.round(totalRevenue)}
            suffix="元"
          />
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="rounded-xl bg-white border border-slate-200 p-4">
        <h3 className="font-semibold mb-3">更多入口</h3>
        <div className="grid grid-cols-4 gap-3 text-center text-xs">
          <Quick href="/m/calendar" label="日历" />
          <Quick href="/m/contents" label="内容仓库" />
          <Quick href="/m/assets" label="素材" />
          <Quick href="/m/keywords" label="关键词" />
          <Quick href="/m/pricing" label="价格" />
          <Quick href="/m/scripts" label="话术" />
          <Quick href="/m/suggestions" label="AI 建议" />
          <Quick href="/m/settings" label="设置" />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-lg font-semibold mt-0.5">
        {value}
        {suffix && <span className="text-xs ml-0.5">{suffix}</span>}
      </div>
    </div>
  );
}

function ActionCard({
  href,
  title,
  desc,
  color,
}: {
  href: string;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-xl border p-3 ${color} active:scale-[0.98] transition-transform`}
    >
      <div className="font-semibold">{title}</div>
      <div className="text-xs opacity-80 mt-0.5">{desc}</div>
    </Link>
  );
}

function SimpleStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-base font-semibold text-slate-800 mt-0.5">
        {value}
        {suffix && <span className="text-xs text-slate-400 ml-0.5">{suffix}</span>}
      </div>
    </div>
  );
}

function Quick({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 p-2 rounded-lg active:bg-slate-100"
    >
      <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center">
        {label[0]}
      </div>
      <span className="text-slate-600">{label}</span>
    </Link>
  );
}
