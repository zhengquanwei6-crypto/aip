// 公共枚举与配置常量
//
// v0.15 · 一次性整改：
//   1. NAV 删除 /keywords / /calendar（用户明示不再使用）
//   2. NAV 删除 /workspace 双重入口（合并到 /history 单一入口）
//   3. 资源组只剩 keyword/scripts/suggestions/analytics/clients 全部 hidden → 整组从 NAV_GROUPS 移除
//   4. 三个运营智能体页（小红书/闲鱼/千牛）保留在常用组

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
 * v0.15 NAV 整改：
 *   - 删除 /keywords（用户明示直接删）
 *   - 删除 /calendar（用户明示删除发布日历）
 *   - 删除 /workspace 入口（用户原话「历史记录」一处即可，统一走 /history）
 *   - /clients /scripts /suggestions /analytics 沿用 hidden:true（旧 deeplink 仍 200）
 */
export const NAV_ITEMS: { href: string; label: string; hidden?: boolean }[] = [
  { href: '/dashboard', label: '首页看板' },
  { href: '/search', label: '语义搜索' }, // v0.14-z78: 真做了
  { href: '/analysis', label: 'AI 分析', hidden: true }, // v0.14-z59: 空壳 wrapper
  { href: '/today', label: '今日任务' },
  { href: '/income', label: '💰 接单收入' },
  { href: '/work/xiaohongshu', label: '小红书运营' },
  { href: '/work/xianyu', label: '闲鱼运营' },
  { href: '/work/qianniu', label: '千牛运营' },
  { href: '/history', label: '历史记录' },
  { href: '/clients', label: '客户', hidden: true },
  { href: '/scripts', label: '私信话术', hidden: true },
  { href: '/suggestions', label: '运营建议', hidden: true },
  { href: '/analytics', label: '数据复盘', hidden: true },
  { href: '/keywords', label: '关键词库', hidden: true },
  { href: '/workspace', label: '工作区', hidden: true },
  { href: '/calendar', label: '发布日历', hidden: true },
  { href: '/style-genome', label: '🧬 风格基因' },
  { href: '/agents/critic', label: '🩺 作品诊断' },
  { href: '/ai-tools', label: 'AI 工具' },
  { href: '/playground', label: 'AI 对话' },
  { href: '/adapters', label: 'API 适配器', hidden: true }, // v0.14-z57: 整合到 /settings 底部 section
  { href: '/presets', label: '模板' },
  { href: '/imgbed', label: '图床', hidden: true }, // v0.14-z55: 整合到 /workspace?tab=imgbed
  { href: '/docs', label: '使用手册' },
  { href: '/settings', label: '设置' },
];

export const HIDDEN_NAV_HREFS = new Set<string>(
  NAV_ITEMS.filter((i) => i.hidden).map((i) => i.href),
);

/**
 * v0.15 NAV 分组：
 *   常用：仪表盘 / 今日 / 历史 / 三平台运营 / AI 搜分析
 *   工具：AI 工具 / AI 对话 / 适配器 / 模板 / 图床
 *   系统：使用手册 / 设置
 *   资源组（关键词/客户/话术等全部 hidden）整组移除
 */
export const NAV_GROUPS: {
  slug: 'core' | 'tools' | 'system';
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
    hrefs: [
      '/dashboard',
      '/today',
      '/income',
      '/history',
      '/work/xiaohongshu',
      '/work/xianyu',
      '/work/qianniu',
      '/search',
      '/analysis',
    ],
  },
  {
    slug: 'tools',
    label: '工具',
    emoji: '🛠️',
    defaultCollapsed: false,
    hrefs: ['/style-genome', '/agents/critic', '/ai-tools', '/playground', '/adapters', '/presets', '/imgbed'],
  },
  {
    slug: 'system',
    label: '系统',
    emoji: '⚙️',
    defaultCollapsed: false,
    hrefs: ['/docs', '/settings'],
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
