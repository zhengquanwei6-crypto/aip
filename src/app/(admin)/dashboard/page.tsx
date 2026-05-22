import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  formatDateCN,
  todayDayOfWeek,
  daysAgo,
  startOfDay,
  endOfDay,
} from '@/lib/date';
import { PLATFORM_LABEL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const today = new Date();
  const dow = todayDayOfWeek(today);

  const schedule = await prisma.schedule.findUnique({
    where: { dayOfWeek: dow },
    include: {
      tasks: { orderBy: { publishTime: 'asc' } },
    },
  });
  const tasks = schedule?.tasks ?? [];

  const xhsCount = tasks.filter((t) => t.platform === 'xiaohongshu').length;
  const xyCount = tasks.filter((t) => t.platform === 'xianyu').length;
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const generatedCount = tasks.filter((t) => t.status === 'generated').length;
  const publishedCount = tasks.filter((t) => t.status === 'published').length;

  // 最近7天指标
  const since = daysAgo(6);
  const metrics = await prisma.metric.findMany({
    where: { date: { gte: startOfDay(since), lte: endOfDay(today) } },
    orderBy: { date: 'asc' },
  });

  const totalImpressions = metrics.reduce((s, m) => s + m.impressions, 0);
  const totalMessages = metrics.reduce((s, m) => s + m.messages, 0);
  const totalConsult = metrics.reduce((s, m) => s + m.consultations, 0);
  const totalOrders = metrics.reduce((s, m) => s + m.orders, 0);
  const totalRevenue = metrics.reduce((s, m) => s + m.revenue, 0);

  // 最近的一条 AI 建议
  const lastSuggestion = await prisma.aIOutput.findFirst({
    where: { type: 'suggestion' },
    orderBy: { createdAt: 'desc' },
  });
  let suggestionText = '尚未生成 AI 建议。前往「AI 建议」页面生成第一份运营建议。';
  if (lastSuggestion) {
    try {
      const parsed = JSON.parse(lastSuggestion.output);
      suggestionText = parsed.summary ?? lastSuggestion.output.slice(0, 200);
    } catch {
      suggestionText = lastSuggestion.output.slice(0, 200);
    }
  }

  return (
    <div className="space-y-6">
      {/* 顶部信息 */}
      <div className="card">
        <div className="card-body flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm text-slate-500">今日日期</div>
            <div className="text-lg font-semibold mt-0.5">
              {formatDateCN(today)}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500">今日主推类目</div>
            <div className="text-lg font-semibold text-brand-700 mt-0.5">
              {schedule?.theme ?? '未配置'}
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/today" className="btn-primary">
              查看今日任务
            </Link>
            <Link href="/calendar" className="btn-secondary">
              发布日历
            </Link>
          </div>
        </div>
      </div>

      {/* 数据卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="今日小红书" value={xhsCount} suffix="条" tone="red" />
        <StatCard label="今日闲鱼" value={xyCount} suffix="条" tone="yellow" />
        <StatCard label="待生成" value={pendingCount} suffix="条" tone="gray" />
        <StatCard label="已生成" value={generatedCount} suffix="条" tone="blue" />
        <StatCard label="已发布" value={publishedCount} suffix="条" tone="green" />
        <StatCard
          label="本周成交金额"
          value={Math.round(totalRevenue)}
          suffix="元"
          tone="brand"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 快捷按钮 */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">快捷操作</h2>
          </div>
          <div className="card-body grid grid-cols-2 gap-3">
            <Link href="/content" className="btn-secondary justify-center">
              生成今日文案
            </Link>
            <Link href="/image" className="btn-secondary justify-center">
              生成今日图片
            </Link>
            <Link href="/compliance" className="btn-secondary justify-center">
              执行合规检查
            </Link>
            <Link href="/analytics" className="btn-secondary justify-center">
              记录今日数据
            </Link>
          </div>
        </div>

        {/* AI 建议 */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">今日 AI 运营建议</h2>
            <Link href="/suggestions" className="text-sm text-brand-600">
              更多 →
            </Link>
          </div>
          <div className="card-body text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {suggestionText}
          </div>
        </div>
      </div>

      {/* 最近 7 天 */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">最近 7 天数据概览</h2>
        </div>
        <div className="card-body grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="总曝光" value={totalImpressions} tone="gray" />
          <StatCard label="私信" value={totalMessages} tone="gray" />
          <StatCard label="咨询" value={totalConsult} tone="gray" />
          <StatCard label="成交" value={totalOrders} tone="gray" />
          <StatCard
            label="成交金额"
            value={Math.round(totalRevenue)}
            suffix="元"
            tone="green"
          />
        </div>
      </div>

      {/* 今日任务速览 */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">今日发布计划速览</h2>
          <Link href="/today" className="text-sm text-brand-600">
            进入今日任务 →
          </Link>
        </div>
        <div className="card-body">
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>平台</th>
                <th>类目</th>
                <th>类型</th>
                <th>标题</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.publishTime}</td>
                  <td>{PLATFORM_LABEL[t.platform] ?? t.platform}</td>
                  <td>{t.category}</td>
                  <td>{t.contentType}</td>
                  <td>{t.title}</td>
                  <td>{t.status}</td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-400 py-6">
                    暂无任务，请运行 prisma:seed
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  tone = 'gray',
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'brand';
}) {
  const toneCls: Record<string, string> = {
    gray: 'text-slate-700',
    blue: 'text-blue-600',
    green: 'text-emerald-600',
    yellow: 'text-amber-600',
    red: 'text-red-600',
    brand: 'text-brand-700',
  };
  return (
    <div className="rounded-md bg-white border border-slate-200 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneCls[tone]}`}>
        {value}
        {suffix && <span className="text-sm ml-1">{suffix}</span>}
      </div>
    </div>
  );
}
