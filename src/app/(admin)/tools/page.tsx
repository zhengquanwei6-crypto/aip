import { prisma } from '@/lib/db';
import { generateWeeklyReport } from '@/lib/weekly';
import { extractMidPrice } from '@/lib/calculator';
import WeeklyReportClient from './WeeklyReportClient';
import CalculatorClient from './CalculatorClient';
import ToolsTabsShell, { type ToolsTab } from './ToolsTabsShell';

export const dynamic = 'force-dynamic';

/**
 * v0.11 B5 · /tools = 综合工具（合并 /weekly-report + /calculator）。
 *   - tab=weekly (默认) 渲染 WeeklyReportClient
 *   - tab=calc           渲染 CalculatorClient
 *
 * 旧 URL /weekly-report /calculator 保留可访问（NAV 移除但不强 redirect）。
 */
export default async function ToolsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const tab: ToolsTab = searchParams?.tab === 'calc' ? 'calc' : 'weekly';

  const [report, packages] = await Promise.all([
    generateWeeklyReport(),
    prisma.pricePackage.findMany({
      orderBy: [{ category: 'asc' }, { tier: 'asc' }],
    }),
  ]);

  const weeklyNode = <WeeklyReportClient initial={report} />;

  const calcNode = (
    <CalculatorClient
      packages={packages.map((p) => ({
        id: p.id,
        category: p.category,
        tier: p.tier,
        name: p.name,
        priceRange: p.priceRange,
        midPrice: extractMidPrice(p.priceRange),
        description: p.description ?? '',
      }))}
    />
  );

  return <ToolsTabsShell active={tab} weekly={weeklyNode} calc={calcNode} />;
}
