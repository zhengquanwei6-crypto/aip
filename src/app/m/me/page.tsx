import Link from 'next/link';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * v0.11 B7 fix #3 · /m/me 加全部功能列表
 *
 * 背景：MobileShell 只暴露 5 个 Tab（首页/任务/文案/图片/我的），
 *   /m 18 个子页其它入口全部塞在 /m/me（"我的"）里。recon §九 #6 标记 medium：
 *   "/m 18 个子页发现性差: ... 完全靠 cookie 切到桌面或 router.back()，新手摸不到"。
 *
 * v0.11 B5 / B6 桌面 NAV 上线后, /m/me 仍然停在 v0.8 / v0.9 的入口集合, 缺：
 *   - 首页看板 /m  (虽然底部 tab 有, 但没在分组里强调)
 *   - 工作区 /m/workspace? 暂无 → 走 桌面版 (deeplink 提示)
 *   - 综合工具 /m/tools?  暂无 → 桌面版
 *   - 使用手册 /m/docs?   暂无 → 桌面版
 *   - 多 API key 池, prompt 模板编辑器, photo-director / publish-director 全部桌面专享
 *
 * 本批改：把"分组"清单按桌面 NAV 14 项重排, 并把没有 m 子页的功能用"⤴ 桌面"badge 标出来,
 *   保持 cookie + 跳转一致性 (不写 cookie, 直接 ?desktop=1 由 middleware 处理).
 */

const POOL_SETTING_KEY = 'IMAGE_DEFAULT_ADAPTER';

export default async function MMePage() {
  const [postCount, productCount, assetCount, metricCount, taskCount, apiKeyCount] =
    await Promise.all([
      prisma.post.count(),
      prisma.product.count(),
      prisma.asset.count(),
      prisma.metric.count(),
      prisma.task.count(),
      // v0.11 B1 起 ApiKey 表存多 key 池；总数对用户有体感意义
      prisma.apiKey.count().catch(() => 0),
    ]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white p-4 shadow">
        {/* V012_B4_M_ME_REBRAND */}
        <div className="text-[10px] opacity-70 tracking-[0.32em] uppercase">GUODONG</div>
        <div className="mt-1 font-semibold">果冻的AI · 工作台</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <Stat label="任务" value={taskCount} />
          <Stat label="笔记" value={postCount} />
          <Stat label="商品" value={productCount} />
          <Stat label="素材" value={assetCount} />
          <Stat label="数据" value={metricCount} />
          <Stat label="API 池" value={apiKeyCount} />
        </div>
      </div>

      {/* v0.11 B7: 主入口分组按桌面 NAV 排列 */}
      <Group title="日常">
        <Item href="/m" label="🏠 首页看板" hint="今日 KPI" />
        <Item href="/m/today" label="✅ 今日任务" hint="新建/进行中" />
        <Item href="/m/calendar" label="📅 发布日历" hint="一周计划" />
      </Group>

      <Group title="生成">
        <Item href="/m/content" label="✏️ 文案生成" hint="纯文案模式" />
        <Item href="/m/image" label="🖼 图片生成" hint="纯出图模式" />
        <Item
          href="?desktop=1"
          label="🎯 全流程发布（桌面）"
          hint="publish-director"
          desktopOnly
          external
        />
      </Group>

      {/* v0.11 B5: /workspace 把 history + assets 合并；移动端没 /m/workspace, 走桌面版 */}
      <Group title="工作区">
        <Item href="/m/contents" label="📚 内容仓库" hint="Post + Product 列表" />
        <Item href="/m/assets" label="🎨 素材库" hint="图片管理" />
        <Item href="/m/history" label="🗂 AI 输出历史" hint="近 500 条" />
      </Group>

      <Group title="客户与报价">
        <Item href="/m/clients" label="👥 客户档案" hint="跟进记录" />
        <Item href="/m/calculator" label="💰 报价计算器" hint="一键报价话术" />
        <Item href="/m/pricing" label="💵 价格套餐" hint="27 档" />
      </Group>

      <Group title="数据">
        <Item href="/m/analytics" label="📊 数据复盘" hint="录入与统计" />
        <Item href="/m/weekly-report" label="📈 周复盘报告" hint="一键 AI 总结" />
        <Item href="/m/suggestions" label="🤖 AI 建议" hint="基于数据" />
      </Group>

      <Group title="资料库">
        <Item href="/m/keywords" label="🔑 关键词库" />
        <Item href="/m/scripts" label="💬 私信话术" />
        <Item href="/m/presets" label="🎨 图片预设" hint="风格模板" />
        <Item href="/m/prompts" label="📝 prompt 模板" hint="只读" />
      </Group>

      {/* v0.11 B7: B5/B6 新增桌面入口, 移动端没对应子页, 全部 ⤴ 桌面版 */}
      <Group title="综合工具">
        <Item
          href="?desktop=1"
          label="🧰 综合工具"
          hint="周报 + 计算器"
          desktopOnly
          external
        />
        <Item
          href="?desktop=1"
          label="📖 使用手册"
          hint="9 篇 markdown"
          desktopOnly
          external
        />
        <Item
          href="?desktop=1"
          label="🔌 API 适配器"
          hint="adapter 配置"
          desktopOnly
          external
        />
      </Group>

      <Group title="系统">
        <Item href="/m/settings" label="⚙️ 设置" hint="API Keys 池 + LLM/IMAGE" />
        <Item
          href="?desktop=1"
          label="🖥 切换到桌面版"
          hint="middleware 写 cookie"
          external
        />
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
      <div className="rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
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
  desktopOnly,
}: {
  href: string;
  label: string;
  hint?: string;
  external?: boolean;
  desktopOnly?: boolean;
}) {
  const inner = (
    <div className="flex items-center justify-between px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800">
      <span className="text-sm text-slate-800 dark:text-slate-100">{label}</span>
      <div className="flex items-center gap-2">
        {desktopOnly && (
          <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/40">
            ⤴ 桌面
          </span>
        )}
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-400"
          aria-hidden="true"
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
