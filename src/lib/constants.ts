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
 * 侧栏导航 (v0.11 B5: 22 → 14 整合 · B6: +/docs = 15).
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
 *   /history /assets /weekly-report /calculator /contents /suggestions
 *      —— URL 保留 (deeplink 多), 仅从 NAV 移除
 *
 * v0.11 B6 新增:
 *   /docs    内部使用手册（9 篇 markdown），AdminShell 底部「?」图标快速跳转
 */
export const NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/dashboard', label: '首页看板' },
  { href: '/today', label: '今日任务' },
  { href: '/calendar', label: '发布日历' },
  { href: '/content', label: '文案生成' },
  { href: '/image', label: '图片生成' },
  { href: '/workspace', label: '工作区' },
  { href: '/clients', label: '客户' },
  { href: '/keywords', label: '关键词库' },
  { href: '/scripts', label: '私信话术' },
  { href: '/presets', label: '模板' },
  { href: '/adapters', label: 'API 适配器' },
  { href: '/analytics', label: '数据复盘' },
  { href: '/tools', label: '综合工具' },
  { href: '/docs', label: '使用手册' },
  { href: '/settings', label: '设置' },
];

export const PLATFORM_LABEL: Record<string, string> = {
  xiaohongshu: '小红书',
  xianyu: '闲鱼',
};

export const PLATFORM_BADGE: Record<string, string> = {
  xiaohongshu: 'badge-red',
  xianyu: 'badge-yellow',
};
