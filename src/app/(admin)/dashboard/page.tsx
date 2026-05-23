/**
 * /dashboard · v0.11 B3 重构后的入口
 *
 * Server component：
 *   - 一次 SSR 直接调 buildDashboardSummary()（同进程函数调用，
 *     不走内部 HTTP，避免冷启动 + 跨连接成本）
 *   - 把数据通过 props 一次性交给 DashboardClient
 *
 * 客户端组件：DashboardClient.tsx（4 区布局）
 */
import DashboardClient from './DashboardClient';
import { buildDashboardSummary } from '@/app/api/dashboard/summary/aggregate';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const data = await buildDashboardSummary();
  return <DashboardClient data={data} />;
}
