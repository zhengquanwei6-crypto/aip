import { prisma } from '@/lib/db';
import MobileNavGroups from '@/components/m/MobileNavGroups';

export const dynamic = 'force-dynamic';

/**
 * v0.11 B7 fix #3 · /m/me 加全部功能列表
 * v0.12 B4.2 · 头部品牌重写（GUODONG / 果冻的AI · 工作台）
 * v0.12 B5.1 · 移动端 NAV 4 分组适配（桌面 v0.12-b3.2 落地的 NAV_GROUPS 同源化）
 *
 * 桌面端 sidebar v0.12-b3.2 起把 14 项 NAV 分到 4 组（常用/资源/工具/系统）+ B4.1 隐藏摆设
 * 4 项（/clients /scripts /suggestions /analytics），但移动端 /m/me 一直停在 v0.11 B7 写死的
 * 8 组（日常 / 生成 / 工作区 / 客户与报价 / 数据 / 资料库 / 综合工具 / 系统），与桌面对不齐：
 *   - 桌面 hidden 的 4 项在移动端仍然显示
 *   - 桌面新增 / 重组的项（/create / /workspace / /presets）在移动端缺失或重复出现
 *   - 用户在 desktop 折叠了「资源」组，切到手机仍要从 8 组里找 → 折叠偏好不共享
 *
 * b5.1 直接把 NAV_GROUPS / NAV_ITEMS / HIDDEN_NAV_HREFS 同一份数据搬到移动端，渲染由
 * `MobileNavGroups`（client component）负责。folded 状态走 localStorage `nav-collapsed-<slug>`，
 * 与桌面 AdminShell 完全相同的 key（同一台设备 / 同一个浏览器），所以折叠偏好跨视图共享。
 *
 * /m 没有 sidebar/drawer 架构（MobileShell 顶栏 + 底部 5 tab），所以这个完整 NAV 视图就放在
 * /m/me 里作为「快速跳转」section，沿袭 v0.11 B7 的「我的」位置不变。
 */

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
    <div className="space-y-3" data-v012-b5-m-me-rebuilt>
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

      {/* v0.12 B5.1 · 4 分组 NAV（与桌面同源 NAV_GROUPS + HIDDEN_NAV_HREFS + localStorage 共享） */}
      <MobileNavGroups />

      {/* 切到桌面（保留入口 · 由 MobileShell 顶栏「桌面版」按钮也能完成） */}
      <div>
        <div className="text-xs text-slate-500 px-1 mb-1.5 flex items-center gap-1">
          <span aria-hidden>🖥</span>
          <span>切换</span>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
          <a href="?desktop=1" className="block">
            <div className="flex items-center justify-between px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800">
              <span className="text-sm text-slate-800 dark:text-slate-100">
                切换到桌面版
              </span>
              <span className="text-xs text-slate-400">middleware 写 cookie</span>
            </div>
          </a>
        </div>
      </div>
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
