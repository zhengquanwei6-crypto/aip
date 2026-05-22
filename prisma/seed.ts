import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// =========== 周计划 ===========
const schedules = [
  { dayOfWeek: 1, theme: 'Logo / 品牌识别 / 门店视觉基础', description: '周一主推：Logo 与基础品牌识别' },
  { dayOfWeek: 2, theme: '电商主图 / 详情页 / 卖点排布', description: '周二主推：电商视觉' },
  { dayOfWeek: 3, theme: '餐饮菜单 / 门店价目表 / 本地生活视觉', description: '周三主推：本地生活视觉' },
  { dayOfWeek: 4, theme: 'PPT / 简历 / 作品集 / 路演视觉', description: '周四主推：商务视觉' },
  { dayOfWeek: 5, theme: '活动海报 / 招聘海报 / 展架 / 邀请函', description: '周五主推：活动物料' },
  { dayOfWeek: 6, theme: '包装 / 贴纸 / 标签 / 新消费视觉', description: '周六主推：包装与新消费' },
  { dayOfWeek: 7, theme: '客户反馈 / 报价公开 / 包月合作 / 复盘', description: '周日主推：信任与复盘' },
];

// =========== 每日 10 条任务模板 ===========
const dailyTaskTemplate = [
  { time: '09:20', platform: 'xiaohongshu', contentType: '案例型', title: '案例前后对比' },
  { time: '11:50', platform: 'xiaohongshu', contentType: '避坑型', title: '避坑/知识型笔记' },
  { time: '13:10', platform: 'xianyu',      contentType: '商品型', title: '引流款商品刷新' },
  { time: '15:00', platform: 'xiaohongshu', contentType: '报价型', title: '报价/流程清单' },
  { time: '17:20', platform: 'xianyu',      contentType: '商品型', title: '标准款商品刷新' },
  { time: '19:10', platform: 'xiaohongshu', contentType: '案例型', title: '案例墙/作品合集' },
  { time: '20:20', platform: 'xiaohongshu', contentType: '案例型', title: '客户反馈/成交故事' },
  { time: '21:10', platform: 'xianyu',      contentType: '商品型', title: '利润款商品刷新' },
  { time: '22:00', platform: 'xiaohongshu', contentType: '流程型', title: '生活化/热点挂钩笔记' },
  { time: '22:40', platform: 'xianyu',      contentType: '包月型', title: '通用款/包月款刷新' },
];

// =========== 类目 ===========
const categories = [
  { name: 'Logo', description: 'Logo 与品牌识别' },
  { name: 'VI品牌', description: 'VI 品牌视觉系统' },
  { name: '电商主图', description: '淘宝/拼多多/小红书主图' },
  { name: '详情页', description: '商品详情页设计' },
  { name: '海报', description: '活动/招聘/招生海报' },
  { name: '菜单', description: '餐饮菜单与价目表' },
  { name: 'PPT', description: 'PPT 美化与路演' },
  { name: '作品集', description: '作品集与简历' },
  { name: '包装', description: '包装/贴纸/标签' },
  { name: '门店视觉', description: '门头/物料/门店全套' },
  { name: '包月合作', description: '包月外包合作' },
];

// =========== 关键词 ===========
const keywords: { category: string; platform: string; keyword: string }[] = [
  ...['logo设计', '品牌logo', '门店logo', 'logo避坑', 'logo升级'].map((k) => ({ category: 'Logo', platform: 'xiaohongshu', keyword: k })),
  ...['logo设计', 'logo包改', 'logo源文件', 'logo急单'].map((k) => ({ category: 'Logo', platform: 'xianyu', keyword: k })),
  ...['品牌视觉', 'VI设计', '品牌升级', '门店视觉', '品牌调性'].map((k) => ({ category: 'VI品牌', platform: 'xiaohongshu', keyword: k })),
  ...['VI设计套餐', '门店视觉全套', 'logo名片门头'].map((k) => ({ category: 'VI品牌', platform: 'xianyu', keyword: k })),
  ...['主图设计', '点击率主图', '淘宝主图', '拼多多主图', '小红书封面设计'].map((k) => ({ category: '电商主图', platform: 'xiaohongshu', keyword: k })),
  ...['主图设计5张', '主图包月', '主图急单', '主图详情页套装'].map((k) => ({ category: '电商主图', platform: 'xianyu', keyword: k })),
  ...['详情页优化', '详情页排版', '详情页首屏', '卖点梳理'].map((k) => ({ category: '详情页', platform: 'xiaohongshu', keyword: k })),
  ...['详情页设计', '详情页首屏', '详情页包改', '详情页整店'].map((k) => ({ category: '详情页', platform: 'xianyu', keyword: k })),
  ...['活动海报', '宣传海报', '招聘海报', '招生海报', 'ins风海报'].map((k) => ({ category: '海报', platform: 'xiaohongshu', keyword: k })),
  ...['海报设计当天交', '海报设计A4', '海报急单'].map((k) => ({ category: '海报', platform: 'xianyu', keyword: k })),
  ...['餐饮菜单', '奶茶店菜单', '价目表设计', '点单优化'].map((k) => ({ category: '菜单', platform: 'xiaohongshu', keyword: k })),
  ...['菜单设计电子版', '菜单排版', '菜单改版', '门店价目表'].map((k) => ({ category: '菜单', platform: 'xianyu', keyword: k })),
  ...['PPT美化', '答辩PPT', '路演PPT', '汇报PPT'].map((k) => ({ category: 'PPT', platform: 'xiaohongshu', keyword: k })),
  ...['PPT美化10页', 'PPT急救', 'PPT排版包改'].map((k) => ({ category: 'PPT', platform: 'xianyu', keyword: k })),
  ...['包装设计', '食品包装', '新消费包装', '贴标升级'].map((k) => ({ category: '包装', platform: 'xiaohongshu', keyword: k })),
  ...['包装贴纸设计', '包装盒设计', '标签设计'].map((k) => ({ category: '包装', platform: 'xianyu', keyword: k })),
];

// =========== 价格套餐 ===========
const pricePackages = [
  { category: 'Logo', tier: '引流款', name: 'Logo需求诊断/风格建议', priceRange: '9.9元', description: '快速诊断，给出方向建议' },
  { category: 'Logo', tier: '标准款', name: '基础Logo设计', priceRange: '199-399元', description: '基础logo设计，含3稿' },
  { category: 'Logo', tier: '利润款', name: '品牌视觉套装', priceRange: '699-1999元', description: 'Logo+VI基础物料' },

  { category: '海报', tier: '引流款', name: '单张简单海报', priceRange: '9.9-29元', description: '单张快速海报' },
  { category: '海报', tier: '标准款', name: '商业海报', priceRange: '69-199元', description: '商业级海报' },
  { category: '海报', tier: '利润款', name: '活动全套物料', priceRange: '299-799元', description: '海报+展架+邀请函' },

  { category: '电商主图', tier: '引流款', name: '单张诊断', priceRange: '9.9元', description: '主图问题诊断' },
  { category: '电商主图', tier: '标准款', name: '5张主图', priceRange: '59-199元', description: '5张主图设计' },
  { category: '电商主图', tier: '利润款', name: '主图+详情页', priceRange: '299-999元', description: '主图加详情页套装' },

  { category: '详情页', tier: '引流款', name: '首屏诊断', priceRange: '29元', description: '详情页首屏诊断' },
  { category: '详情页', tier: '标准款', name: '详情页单款', priceRange: '199-499元', description: '单款详情页设计' },
  { category: '详情页', tier: '利润款', name: '整店视觉', priceRange: '699-1999元', description: '整店视觉升级' },

  { category: '菜单', tier: '引流款', name: '单页改版', priceRange: '19-39元', description: '单页菜单改版' },
  { category: '菜单', tier: '标准款', name: '菜单设计', priceRange: '129-299元', description: '完整菜单设计' },
  { category: '菜单', tier: '利润款', name: '门店菜单+海报', priceRange: '399-999元', description: '门店菜单与海报套装' },

  { category: 'PPT', tier: '引流款', name: '封面/首页急救', priceRange: '29元', description: '封面或首页改版' },
  { category: 'PPT', tier: '标准款', name: '10页内', priceRange: '199-499元', description: '10页以内PPT美化' },
  { category: 'PPT', tier: '利润款', name: '路演/提案整套', priceRange: '699-1999元', description: '路演或提案整套' },

  { category: '包装', tier: '引流款', name: '贴纸/标签', priceRange: '39元', description: '单个贴纸或标签' },
  { category: '包装', tier: '标准款', name: '单品包装', priceRange: '299-699元', description: '单品包装设计' },
  { category: '包装', tier: '利润款', name: '系列包装', priceRange: '999-3000元', description: '系列包装设计' },

  { category: '门店视觉', tier: '引流款', name: '门头字样诊断', priceRange: '29元', description: '门头字样诊断' },
  { category: '门店视觉', tier: '标准款', name: '单类物料', priceRange: '199-499元', description: '单类门店物料' },
  { category: '门店视觉', tier: '利润款', name: '开业视觉全套', priceRange: '999-2999元', description: '开业视觉全套' },

  { category: '包月合作', tier: '标准款', name: '基础包月', priceRange: '999-2999元', description: '基础包月外包' },
  { category: '包月合作', tier: '利润款', name: '月度外包', priceRange: '3999-12000元', description: '月度全包外包' },
];

// =========== 私信话术 ===========
const scripts = [
  {
    type: '小红书首轮咨询',
    title: '小红书首轮咨询',
    content:
      '你好，我看了你的需求，先别急着定。你现在最关键的是先确认用途、交期、预算、风格这四项。你把这四点发我，我按你实际情况给你建议，不合适的我也会直接说。',
  },
  {
    type: '闲鱼咨询转拍',
    title: '闲鱼咨询转拍',
    content:
      '这个项目我能做。为了不让你反复解释，你直接把用途、参考图、尺寸、交期发我，我先给你确认方案。没问题的话你拍这个链接，我按排期开始。',
  },
  {
    type: '客户犹豫',
    title: '客户犹豫处理',
    content:
      '不着急下单，先确认两件事：1) 这个图你是马上要用还是后续用？2) 你最在意的是出图速度、还是风格匹配？你回我之后我再决定要不要建议你下单。',
  },
  {
    type: '客户压价',
    title: '客户压价应对',
    content:
      '价格可以稍微调整，但需要在范围之内同步缩减交付项。比如减少修改次数或不出源文件。你看你更愿意接受哪种方式？',
  },
  {
    type: '急单报价',
    title: '急单报价',
    content:
      '可以做急单，不过急单会按加急费另计 30%-50%。你给我具体交期，我按时间评估能不能接，做不到我会直接说。',
  },
  {
    type: '包月转化',
    title: '包月转化',
    content:
      '你这个量级建议直接走包月。每个月固定一个时间内交付若干稿，价格比单做便宜，沟通也更顺。你要不要先看一下我的包月范围？',
  },
  {
    type: '交付说明',
    title: '交付范围说明',
    content:
      '这单的交付范围包含：成品图（JPG/PNG）+ 一次免费调整。源文件、二次商用授权需要额外付费。你确认后我就开始。',
  },
  {
    type: '索要好评',
    title: '索要好评',
    content:
      '如果这次出图你满意，可以麻烦你截图发一句反馈给我吗？我后续会持续优化。',
  },
  {
    type: '修改范围说明',
    title: '修改范围说明',
    content:
      '这次报价里包含 N 次修改，超出会按修改条数加收。重要的是先确认风格再深化，避免后期返工。',
  },
  {
    type: '源文件说明',
    title: '源文件说明',
    content:
      '源文件不在默认交付范围内。如需要 PSD/AI 源文件，需要额外加 X 元。源文件给出后不再支持二次免费修改。',
  },
];

async function main() {
  console.log('🌱 开始 seed...');

  // 类目
  for (const c of categories) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: { description: c.description },
      create: c,
    });
  }
  console.log(`✅ 类目 ${categories.length} 条`);

  // 周计划
  const scheduleMap: Record<number, string> = {};
  for (const s of schedules) {
    const created = await prisma.schedule.upsert({
      where: { dayOfWeek: s.dayOfWeek },
      update: { theme: s.theme, description: s.description },
      create: s,
    });
    scheduleMap[s.dayOfWeek] = created.id;
  }
  console.log(`✅ 周计划 ${schedules.length} 天`);

  // 任务（每天 10 条）
  await prisma.task.deleteMany({});
  for (const s of schedules) {
    for (let i = 0; i < dailyTaskTemplate.length; i++) {
      const t = dailyTaskTemplate[i];
      const themeKeyword = s.theme.split('/')[0].trim();
      await prisma.task.create({
        data: {
          scheduleId: scheduleMap[s.dayOfWeek],
          platform: t.platform,
          publishTime: t.time,
          category: themeKeyword,
          contentType: t.contentType,
          title: `${themeKeyword} - ${t.title}`,
          status: 'pending',
          priority: i,
        },
      });
    }
  }
  console.log(`✅ 任务 ${schedules.length * dailyTaskTemplate.length} 条`);

  // 关键词
  await prisma.keyword.deleteMany({});
  for (const k of keywords) await prisma.keyword.create({ data: k });
  console.log(`✅ 关键词 ${keywords.length} 条`);

  // 价格套餐
  await prisma.pricePackage.deleteMany({});
  for (const p of pricePackages) await prisma.pricePackage.create({ data: p });
  console.log(`✅ 价格套餐 ${pricePackages.length} 条`);

  // 私信话术
  await prisma.script.deleteMany({});
  for (const s of scripts) await prisma.script.create({ data: s });
  console.log(`✅ 私信话术 ${scripts.length} 条`);

  // 图片样式预设
  const imagePresets = [
    {
      name: '小红书简约白底',
      styleKeywords: '简约现代、高级感、清爽白底、留白构图、莫兰迪色、专业排版',
      negativePrompt: 'low quality, blurry, watermark, text logo, cluttered',
      size: '1024x1536',
      imageType: '封面图',
      isDefault: true,
    },
    {
      name: '多巴胺色',
      styleKeywords: '多巴胺色、年轻活力、新消费、马卡龙渐变、ins风、可爱治愈',
      negativePrompt: 'dark, dull, low quality',
      size: '1024x1536',
      imageType: '封面图',
      isDefault: false,
    },
    {
      name: '商务专业',
      styleKeywords: '商务专业、稳重、深蓝灰、几何排版、金色点缀、知性',
      negativePrompt: 'cute, childish, cartoon',
      size: '1024x1536',
      imageType: '封面图',
      isDefault: false,
    },
    {
      name: '闲鱼商品方图',
      styleKeywords: '电商主图、白底突出、产品居中、卖点文字清晰、转化率高',
      negativePrompt: 'low quality, blurry, text overflow',
      size: '1024x1024',
      imageType: '商品首图',
      isDefault: false,
    },
    {
      name: '复古中式',
      styleKeywords: '复古中式、东方美学、留白、墨色、宣纸纹理、古风字体',
      negativePrompt: 'modern, neon, western',
      size: '1024x1536',
      imageType: '封面图',
      isDefault: false,
    },
  ];
  await prisma.imagePreset.deleteMany({});
  for (const p of imagePresets) await prisma.imagePreset.create({ data: p });
  console.log(`✅ 图片预设 ${imagePresets.length} 条`);

  console.log('🎉 Seed 完成');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
