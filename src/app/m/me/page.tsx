import Link from 'next/link';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function MMePage() {
  const [postCount, productCount, assetCount, metricCount] = await Promise.all([
    prisma.post.count(),
    prisma.product.count(),
    prisma.asset.count(),
    prisma.metric.count(),
  ]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white p-4 shadow">
        <div className="text-xs opacity-70">design-ai-ops</div>
        <div className="mt-1 font-semibold">个人运营工作台</div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          <Stat label="笔记" value={postCount} />
          <Stat label="商品" value={productCount} />
          <Stat label="素材" value={assetCount} />
          <Stat label="数据" value={metricCount} />
        </div>
      </div>

      <Group title="内容">
        <Item href="/m/contents" label="📚 内容仓库" hint="生成历史" />
        <Item href="/m/calendar" label="📅 发布日历" hint="一周计划" />
        <Item href="/m/assets" label="🖼 素材库" hint="图片管理" />
      </Group>

      <Group title="数据">
        <Item href="/m/analytics" label="📊 数据复盘" hint="录入与统计" />
        <Item href="/m/suggestions" label="🤖 AI 建议" hint="基于数据" />
      </Group>

      <Group title="资料库">
        <Item href="/m/keywords" label="🔑 关键词库" />
        <Item href="/m/pricing" label="💰 价格套餐" />
        <Item href="/m/scripts" label="💬 私信话术" />
      </Group>

      <Group title="系统">
        <Item href="/m/settings" label="⚙️ 设置" hint="API 配置" />
        <Item href="?desktop=1" label="🖥 切换到桌面版" external />
      </Group>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="opacity-70">{label}</div>
      <div className="text-base font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-slate-500 px-1 mb-1.5">{title}</div>
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden divide-y divide-slate-100">
        {children}
      </div>
    </div>
  );
}

function Item({
  href,
  label,
  hint,
  external,
}: {
  href: string;
  label: string;
  hint?: string;
  external?: boolean;
}) {
  const inner = (
    <div className="flex items-center justify-between px-4 py-3 active:bg-slate-50">
      <span className="text-sm text-slate-800">{label}</span>
      <div className="flex items-center gap-2">
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-400"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
  );
  if (external) {
    return <a href={href}>{inner}</a>;
  }
  return <Link href={href}>{inner}</Link>;
}
