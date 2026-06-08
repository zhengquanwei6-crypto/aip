export const PLATFORMS = [
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'xianyu', label: '闲鱼' },
] as const;

export const CATEGORIES = [
  'Logo',
  '品牌系统',
  '电商主图',
  '详情页',
  '海报',
  '菜单',
  '提案',
  '作品集',
  '包装',
  '门店视觉',
  '长期服务',
] as const;

export const CONTENT_TYPES = [
  '案例',
  '异议处理',
  '报价',
  '流程',
  '产品',
  '长期服务',
  '复盘',
] as const;

export const TARGET_AUDIENCES = [
  '电商商家',
  '餐饮老板',
  '创业者',
  '企业采购',
  '内容创作者',
  '学生或求职者',
] as const;

export const TONES = ['专业', '温和', '销售导向', '直接'] as const;

export const ASSET_TYPES = [
  '案例图',
  'AI 背景',
  '样机',
  '封面模板',
  '商品主图',
  '报价视觉',
  '流程视觉',
] as const;

export const TASK_STATUSES = [
  { value: 'pending', label: '待处理', badge: 'badge-gray' },
  { value: 'generated', label: '已生成', badge: 'badge-blue' },
  { value: 'published', label: '已发布', badge: 'badge-green' },
  { value: 'recapped', label: '已复盘', badge: 'badge-purple' },
] as const;

export const IMAGE_TYPES = [
  '封面图',
  '商品主图',
  '案例图',
  '报价图',
  '流程图',
  '样机图',
  '背景图',
] as const;

export const SCRIPT_TYPES = [
  '小红书首轮回复',
  '闲鱼咨询',
  '客户犹豫',
  '客户议价',
  '紧急报价',
  '长期服务转化',
  '交付说明',
  '好评邀请',
  '修改边界',
  '源文件说明',
] as const;

export const PRICE_TIERS = ['入门', '标准', '利润'] as const;

export const NAV_ITEMS: { href: string; label: string; hidden?: boolean }[] = [
  { href: '/dashboard', label: '控制台' },
  { href: '/ai-tools', label: '创作' },
  { href: '/assets', label: '资产' },
  { href: '/discuss', label: '协作' },
  { href: '/settings', label: '设置' },

  { href: '/today', label: '今日任务', hidden: true },
  { href: '/income', label: '收入', hidden: true },
  { href: '/work/xiaohongshu', label: '小红书', hidden: true },
  { href: '/work/xianyu', label: '闲鱼', hidden: true },
  { href: '/work/qianniu', label: '千牛', hidden: true },
  { href: '/search', label: '搜索', hidden: true },
  { href: '/analysis', label: '分析', hidden: true },
  { href: '/analytics', label: '数据', hidden: true },
  { href: '/history', label: '历史', hidden: true },
  { href: '/workspace', label: '旧工作区', hidden: true },
  { href: '/contents', label: '内容', hidden: true },
  { href: '/clients', label: '客户', hidden: true },
  { href: '/scripts', label: '话术', hidden: true },
  { href: '/suggestions', label: '建议', hidden: true },
  { href: '/keywords', label: '关键词', hidden: true },
  { href: '/calendar', label: '日历', hidden: true },
  { href: '/style-genome', label: '风格基因', hidden: true },
  { href: '/agents/critic', label: '质检 Agent', hidden: true },
  { href: '/moodboard', label: '情绪板', hidden: true },
  { href: '/share', label: '分享', hidden: true },
  { href: '/playground', label: '模型测试', hidden: true },
  { href: '/adapters', label: '适配器', hidden: true },
  { href: '/presets', label: '预设', hidden: true },
  { href: '/imgbed', label: '图床', hidden: true },
  { href: '/docs', label: '文档', hidden: true },
  { href: '/tools', label: '工具', hidden: true },
];

export const HIDDEN_NAV_HREFS = new Set<string>(
  NAV_ITEMS.filter((i) => i.hidden).map((i) => i.href),
);

export const NAV_GROUPS: {
  slug: 'workspace';
  label: string;
  emoji: string;
  defaultCollapsed: boolean;
  hrefs: string[];
}[] = [
  {
    slug: 'workspace',
    label: '工作台',
    emoji: '',
    defaultCollapsed: false,
    hrefs: ['/dashboard', '/ai-tools', '/assets', '/discuss', '/settings'],
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
