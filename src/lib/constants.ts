// 公共枚举与配置常量

export const PLATFORMS = [
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'xianyu', label: '闲鱼' },
] as const;

export const CATEGORIES = [
  'Logo',
  'VI品牌',
  '电商主图',
  '详情页',
  '海报',
  '菜单',
  'PPT',
  '作品集',
  '包装',
  '门店视觉',
  '包月合作',
] as const;

export const CONTENT_TYPES = [
  '案例型',
  '避坑型',
  '报价型',
  '流程型',
  '商品型',
  '包月型',
  '复盘型',
] as const;

export const TARGET_AUDIENCES = [
  '电商卖家',
  '餐饮门店',
  '创业者',
  '企业客户',
  '自媒体博主',
  '学生/求职者',
] as const;

export const TONES = ['专业', '亲和', '成交型', '干货型'] as const;

export const ASSET_TYPES = [
  '真实案例',
  'AI背景',
  '样机图',
  '封面模板',
  '闲鱼首图',
  '报价图',
  '流程图',
] as const;

export const TASK_STATUSES = [
  { value: 'pending', label: '未生成', badge: 'badge-gray' },
  { value: 'generated', label: '已生成', badge: 'badge-blue' },
  { value: 'published', label: '已发布', badge: 'badge-green' },
  { value: 'recapped', label: '已复盘', badge: 'badge-purple' },
] as const;

export const IMAGE_TYPES = [
  '封面图',
  '商品首图',
  '案例墙',
  '报价表',
  '流程图',
  '样机图',
  '背景图',
] as const;

export const SCRIPT_TYPES = [
  '小红书首轮咨询',
  '闲鱼咨询转拍',
  '客户犹豫',
  '客户压价',
  '急单报价',
  '包月转化',
  '交付说明',
  '索要好评',
  '修改范围说明',
  '源文件说明',
] as const;

export const PRICE_TIERS = ['引流款', '标准款', '利润款'] as const;

/**
 * 侧栏导航 (v0.11 B5: 22 → 14 整合 · B6: +/docs = 15 · B8: +/playground = 16).
 *
 * v0.12 B3.3：合并 /content + /image → /create（三 tab：content / image / publish）。
 *   NAV 项目 16 → 15（去掉「文案生成」+「图片生成」两项，加「创作」一项）。
 *   旧 URL /content + /image 由 middleware.ts 强制 307 redirect 到 /create?tab=*。
 *
 * v0.12 B3.2：把 15 项 NAV 分到 4 组（常用 / 资源 / 工具 / 系统），
 *   常用永远展开，其他三组 localStorage 记忆折叠状态。
 *
 * v0.12 B4.1：摆设功能前端 NAV 隐藏（hidden:true · URL 仍 200）。
 *   - /clients     → Client=0 / ClientNote=0 真实零数据，「客户管理」纯摆设（用户明示）
 *   - /clients?tab=pricing → 同 /clients，「报价方案」用户明示流程上不用
 *   - /scripts     → Script=11 全是内置（用户从未编辑过自定义话术），decorative
 *   - /suggestions → AIOutput suggestion=12 但 UI 只是只读列表，对真实流程无影响
 *   - /analytics   → Metric=1 placeholder，没真接入数据源（未来 v0.13+ 重做）
 *   sidebar NAV 4 分组下渲染时 .filter((it) => !it.hidden) 即可。
 *   /clients /scripts /suggestions /analytics 直接 GET 仍 HTTP 200（兼容书签 / 旧 deeplink），
 *   不动后端、不动 page.tsx、不动 middleware redirect。
 *
 * 合并策略 (B5):
 *   - /clients   含「客户列表 / 报价方案」tabs (吸收 /pricing)
 *   - /presets   含「图片 / 文案 / Agent」tabs   (吸收 /prompts)
 *   - /workspace 含「历史 / 素材」tabs            (合并 /history /assets, URL 保留)
 *   - /tools     含「周报 / 计算器」tabs           (合并 /weekly-report /calculator, URL 保留)
 *   - /contents 与 /suggestions 仅从 NAV 移除, URL 仍可访问
 *
 * 旧 URL 兼容:
 *   /pricing  → /clients?tab=pricing  (middleware 307 + page-level redirect)
 *   /prompts  → /presets?tab=content  (middleware 307 + page-level redirect)
 *   /content  → /create?tab=content   (middleware 307 · v0.12 B3.3)
 *   /image    → /create?tab=image     (middleware 307 · v0.12 B3.3)
 *   /history /assets /weekly-report /calculator /contents /suggestions
 *      —— URL 保留 (deeplink 多), 仅从 NAV 移除
 *
 * v0.11 B6 新增:
 *   /docs    内部使用手册（10 篇 markdown · B8 加 10-playground）
 *
 * v0.11 B8 新增:
 *   /playground 即时调用三 tab（LLM 对话 / 图片生成 / Agent 对话），
 *               复用 B1 池 + B7 sizes/qualities + 8 agents，0 schema 改
 *               位于 /image 后面，方便切换"任务式生成"和"即时调试"
 */
export const NAV_ITEMS: { href: string; label: string; hidden?: boolean }[] = [
  { href: '/dashboard', label: '首页看板' },
  { href: '/search', label: 'AI 搜' },
  { href: '/analysis', label: 'AI 分析' },
  { href: '/today', label: '今日任务' },
  { href: '/work/xiaohongshu', label: '小红书运营' },
  { href: '/work/xianyu', label: '闲鱼运营' },
  { href: '/work/qianniu', label: '千牛运营' },
  { href: '/workspace', label: '历史记录' },
  // v0.12 B4.1 hidden（用户明示 + 自动盘点 zero-data）
  { href: '/clients', label: '客户', hidden: true },
  { href: '/keywords', label: '关键词库' },
  // v0.12 B4.1 hidden（Script=11 全内置，无用户自定义）
  { href: '/scripts', label: '私信话术', hidden: true },
  // v0.12 B4.1 hidden（suggestion 列表对真实流程无 actionable 价值）
  { href: '/suggestions', label: '运营建议', hidden: true },
  // v0.12 B4.1 hidden（Metric=1 placeholder，数据源未接）
  { href: '/analytics', label: '数据复盘', hidden: true },
  { href: '/playground', label: 'AI 对话' },
  { href: '/calendar', label: '发布日历' },
  { href: '/adapters', label: 'API 适配器' },
  { href: '/presets', label: '模板' },
  { href: '/imgbed', label: '图床' },
  { href: '/docs', label: '使用手册' },
  { href: '/settings', label: '设置' },
];

/**
 * v0.12 B4.1 · NAV 隐藏 hrefs 集合（NavGroup 渲染时过滤用，单一数据源派生）。
 * 等价于 NAV_ITEMS.filter(i => i.hidden).map(i => i.href).
 * 公共契约：URL 仍 HTTP 200，仅 NAV 不显示。
 */
export const HIDDEN_NAV_HREFS = new Set<string>(
  NAV_ITEMS.filter((i) => i.hidden).map((i) => i.href),
);

/**
 * v0.12 B3.2 · NAV 分组（4 组）：
 *   - 常用：用户日常 90% 操作（仪表盘/今日/创作/工作区/客户）— 永远展开
 *   - 资源：周月级别（关键词/话术/建议/数据复盘）— 默认折叠，localStorage 记忆
 *   - 工具：偶尔用（AI 对话/日历/适配器/模板）— 默认折叠，localStorage 记忆
 *   - 系统：配置 + 文档（使用手册/设置）— 默认折叠，localStorage 记忆
 *
 * v0.12 B4.1：常用组从 [/dashboard /today /create /workspace /clients] →
 *   [/dashboard /today /create /workspace]（去掉 /clients · hidden=true）。
 *   NAV_GROUPS 的 hrefs 数组保留 hidden 项是为了兼容（NavGroup 自己 filter），
 *   但 core 组明确把 /clients 拿走避免空 group 视觉。
 *   resources 组保留全部（hidden 项会被 filter 掉，组本身能折叠不会空）。
 *
 * 桌面 + /m 共用同一份 NAV_GROUPS。slug 用作 localStorage 折叠 key 后缀。
 *
 * 注意：NAV_ITEMS 顺序保持不变（兼容 Breadcrumbs / iconFor 查找），
 * NAV_GROUPS 是渲染层重排，单一数据源仍是 NAV_ITEMS。
 */
export const NAV_GROUPS: {
  slug: 'core' | 'resources' | 'tools' | 'system';
  label: string;
  emoji: string;
  defaultCollapsed: boolean;
  hrefs: string[];
}[] = [
  {
    slug: 'core',
    label: '常用',
    emoji: '🚀',
    defaultCollapsed: false,
    hrefs: ['/dashboard', '/search', '/analysis', '/today', '/work/xiaohongshu', '/work/xianyu', '/work/qianniu', '/workspace'],
  },
  {
    slug: 'resources',
    label: '资源',
    emoji: '📦',
    defaultCollapsed: true,
    // /clients /scripts /suggestions /analytics 都 hidden=true（v0.12 B4.1），
    // NavGroup 自动 filter 掉，剩下 /keywords 一项可见。组保留以便后续恢复。
    hrefs: ['/keywords', '/scripts', '/suggestions', '/analytics', '/clients'],
  },
  {
    slug: 'tools',
    label: '工具',
    emoji: '🛠️',
    defaultCollapsed: true,
    hrefs: ['/playground', '/calendar', '/adapters', '/presets'],
  },
  {
    slug: 'system',
    label: '系统',
    emoji: '⚙️',
    defaultCollapsed: true,
    hrefs: ['/imgbed', '/docs', '/settings'],
  },
];

export const PLATFORM_LABEL: Record<string, string> = {
  xiaohongshu: '小红书',
  xianyu: '闲鱼',
};

export const PLATFORM_BADGE: Record<string, string> = {
  xiaohongshu: 'badge-red',
  xianyu: 'badge-yellow',
};
