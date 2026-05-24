// v0.11 B11 + B15.3 · 启动时 seed market platforms + today snapshots
// (B10 followup #7 闭环 / B13 self-check §十一 #3 闭合)
//
// 容器换 DB 卷或全新部署时,  Setting 表 market:platform:* / market:snapshot:* 行不存在 — 这里幂等写一次。
// 由 docker/entrypoint.sh 在 prisma db push 之后调用。
// 0 LLM/IMAGE 消耗。
//
// B15.3 新增：除 PlatformInfo 三行外，再为「今天」写一条 placeholder snapshot
//   key: market:snapshot:<slug>:<YYYY-MM-DD>（Asia/Shanghai 日期）
//   value: { platform, date, dataPoints: [...recommendedKpis 占位 0 值], source: 'placeholder', placeholder: true }
//   通过 marketSnapshotSchema 校验（src/lib/market/types.ts），保证读端解得开。
//
//   这样新部署冷启动后 /api/health.marketTrendsModule.snapshotCount = 3
//   （而不是 0），/market 页直接渲染「示例数据」徽章卡片。

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PLATFORMS = [
  {
    slug: 'xiaohongshu',
    name: '小红书',
    icon: '📕',
    tagline: '内容种草社区 · 女性用户为主 · 高客单价品类',
    description: [
      '小红书定位是「内容驱动的种草社区」，用户以一二线城市 18-35 岁女性为主，购买决策前习惯看笔记真实体验。',
      '设计接单的高密度品类：Logo、品牌 VI、自媒体封面、电商产品图、PPT 视觉、小红书笔记封面。',
      '客单价分布：30-200 元的零碎单（Logo / 头像）+ 500-2000 元的系列单（VI / 品牌册）+ 月度包养单。',
      '趋势数据从「创作中心」的笔记数据 / 关键词热榜 / 同行账号洞察来。当前 v0.11 B10 阶段是手填，未来 v0.10 Chrome 扩展 hook /data-center 接口自动喂。',
      '推荐工作流：每天看一次小红书爆款笔记 → 从封面字提取趋势词 → 反推今天的任务卡封面 → 🎯 全流程发布。',
    ],
    categories: ['Logo', '品牌 VI', '小红书封面', '自媒体头图', 'PPT 视觉', '电商主图'],
    dataSource: '当前手填（/api/market/trends POST）；未来 v0.10 Chrome 扩展 POST /api/market/trends/sync hook /data-center / 关键词搜索 / 笔记详情接口。',
    recommendedKpis: [
      { key: 'hotKeywords', label: '热门关键词数', unit: '个', hint: '今日笔记 TOP100 中出现 ≥3 次的关键词数' },
      { key: 'avgLikes', label: '爆款平均点赞', unit: '', hint: '近 7 天点赞 >1000 的笔记平均值' },
      { key: 'avgCollects', label: '爆款平均收藏', unit: '', hint: '近 7 天收藏 >500 的笔记平均值' },
      { key: 'orderQuoteAvg', label: '平均询单报价', unit: '元', hint: '私信里客户报的预算平均值（手动维护）' },
      { key: 'activeAccounts', label: '活跃账号数', unit: '个', hint: '近 7 天发过 ≥1 篇笔记的账号' },
      { key: 'newFans7d', label: '近 7 天新增粉丝', unit: '人', hint: '账号粉丝净增（创作中心 → 数据 → 粉丝）' },
    ],
    recommendedWorkflow: '早上 9:30 看一次创作中心 → 抄爆款封面字 → 进 /today 建任务（contentType=案例型 / category=封面图）→ 🎯 全流程发布抽屉 → 三步走 → /contents 复制 + 浏览器手动发。',
  },
  {
    slug: 'xianyu',
    name: '闲鱼',
    icon: '🐟',
    tagline: '二手交易平台 · 阿里系 · 标品 + 服务双跑道',
    description: [
      '闲鱼是阿里系二手交易平台，但实际跑量集中在「服务交易」（设计 / 教程 / 模板），不只是二手。',
      '设计接单的核心品类：成品 PSD / 模板 / 字体 / 教程视频 / 远程定制服务（Logo / 名片 / 海报）。',
      '客单价分布：9.9-39 元的引流款 + 99-499 元的标准款 + 999-3000 元的定制款；服务类常包月。',
      '趋势数据从「卖家中心」的商品数据 / 询单数 / 类目排名来。和小红书最大差别：流量靠「相关推荐 + 类目搜索」，不靠社交，所以标题关键词非常关键。',
      '推荐工作流：每天看一次卖家中心商品数据 → 给浏览高、询单低的商品换标题/封面 → 给浏览低的商品发到「想要」社区 → 🎯 全流程发布生成新封面。',
    ],
    categories: ['PSD 模板', '设计教程', '字体素材', 'Logo 定制', '海报设计', '远程服务'],
    dataSource: '当前手填；未来 v0.10 Chrome 扩展 hook 闲鱼卖家中心 m.tb.cn/idle / 2.taobao.com/idle 接口（PC + H5 两套接口都要 hook）。',
    recommendedKpis: [
      { key: 'liveProducts', label: '在售商品数', unit: '个', hint: '当前 status=on_sale 的商品总数' },
      { key: 'views7d', label: '近 7 天浏览量', unit: '', hint: '所有商品的 views 总和' },
      { key: 'wants7d', label: '近 7 天「想要」数', unit: '', hint: '所有商品的 wants 总和' },
      { key: 'consultRate', label: '询单转化率', unit: '%', hint: '私信会话数 / 浏览量 × 100' },
      { key: 'avgPrice', label: '平均成交价', unit: '元', hint: '近 30 天订单的均价' },
      { key: 'topCategory', label: '最热类目占比', unit: '%', hint: 'TOP1 类目浏览量占总浏览量的比例' },
    ],
    recommendedWorkflow: '中午 12:00 看一次卖家中心 → 找浏览高询单低的商品（标题或封面问题）→ 进 /today 建任务（contentType=商品型 / category=商品首图）→ 🎯 全流程发布换图 → 上传回闲鱼。',
  },
  {
    slug: 'qianniu',
    name: '千牛（淘宝/天猫）',
    icon: '🐂',
    tagline: '阿里电商卖家工作台 · 标品大盘 · 客服+订单+营销三合一',
    description: [
      '千牛是阿里给淘宝/天猫卖家的工作台 App + Web，集客服、订单、营销活动、店铺装修、生意参谋于一体。',
      '设计接单的品类相对集中：详情页设计、主图 / SKU 图、活动海报、店铺装修、店铺 logo / 通栏、视频封面。',
      '客单价分布：单图 50-200 元 + 套餐 800-3000 元（首页装修 + 5-10 张主图）+ 月度包养（中小卖家 1500-5000/月）。',
      '趋势数据从「生意参谋」的店铺概况 / 流量来源 / 类目热词来。趋势主要看「行业大盘热词」+「同行 TOP 店铺改图节奏」。',
      '推荐工作流：每周一上午看生意参谋热词榜 + 同行新主图 → 给固定客户的店铺出本周「换主图建议」 → 🎯 全流程发布出 5-10 张主图候选 → 客户选 3 张定稿。',
    ],
    categories: ['详情页', '主图', 'SKU 图', '活动海报', '店铺装修', '店铺 Logo'],
    dataSource: '当前手填；未来 v0.10 Chrome 扩展 hook 千牛工作台 / 生意参谋（sycm.taobao.com）接口。注意：千牛接口反爬比小红书严，建议主用「DOM scrape 兜底」+ hook response 双路径。',
    recommendedKpis: [
      { key: 'storeUv7d', label: '近 7 天店铺 UV', unit: '', hint: '生意参谋 → 流量 → 访客数' },
      { key: 'storePv7d', label: '近 7 天店铺 PV', unit: '', hint: '生意参谋 → 流量 → 浏览量' },
      { key: 'storeTransactions7d', label: '近 7 天成交笔数', unit: '笔', hint: '生意参谋 → 交易 → 支付订单' },
      { key: 'avgGmv', label: '平均客单价', unit: '元', hint: '支付金额 / 支付订单数' },
      { key: 'topKeywords', label: '行业热词数', unit: '个', hint: '生意参谋 → 市场 → 热搜词 TOP100' },
      { key: 'designPipeline', label: '在做设计单数', unit: '单', hint: '当前 status=进行中 的店铺设计单数（手动维护）' },
    ],
    recommendedWorkflow: '每周一 10:00 看生意参谋大盘 → 提炼下周 3 个热词 → 进 /today 给每个客户建一条任务（contentType=案例型 / category=主图）→ 🎯 全流程发布 → 主图候选发给客户选定稿 → 计入 /clients 该客户的月度交付。',
  },
];

// ─── B15.3: today 日期（Asia/Shanghai）──────────────────────────────
// 不引第三方 tz 库；直接用 +08:00 偏移把 UTC 当下时间换成本地日期串。
function todayShanghaiDate() {
  const nowUtc = Date.now();
  const shMs = nowUtc + 8 * 3600 * 1000; // shift to UTC+8
  const d = new Date(shMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 给每个 platform 拼一条 placeholder snapshot（dataPoints = recommendedKpis 占位 0 值）
function buildPlaceholderSnapshot(platform, date) {
  const dataPoints = (platform.recommendedKpis || []).map((k) => ({
    key: k.key,
    label: k.label,
    value: 0,
    unit: k.unit ?? '',
    trend: '示例',
    hint: k.hint,
  }));
  return {
    platform: platform.slug,
    date,
    dataPoints,
    source: 'placeholder',
    placeholder: true,
    note: 'v0.11 B15.3 启动时自动写入的占位 snapshot，POST /api/market/trends 后会被覆盖。',
    capturedAt: new Date().toISOString(),
  };
}

(async () => {
  // ① PlatformInfo（B11 行为，保持不变）
  let platformSeeded = 0, platformSkipped = 0;
  for (const p of PLATFORMS) {
    const key = `market:platform:${p.slug}`;
    const existing = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
    if (existing) {
      platformSkipped++;
      continue;
    }
    await prisma.setting.create({
      data: { key, value: JSON.stringify(p) },
    }).catch((e) => {
      console.error(`[market-seed] failed to create ${key}:`, e?.message ?? e);
    });
    platformSeeded++;
  }

  // ② B15.3: today snapshot（一平台一条 placeholder · 幂等）
  const today = todayShanghaiDate();
  let snapSeeded = 0, snapSkipped = 0;
  for (const p of PLATFORMS) {
    const key = `market:snapshot:${p.slug}:${today}`;
    const existing = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
    if (existing) {
      snapSkipped++;
      continue;
    }
    const snap = buildPlaceholderSnapshot(p, today);
    await prisma.setting.create({
      data: { key, value: JSON.stringify(snap) },
    }).catch((e) => {
      console.error(`[market-seed] failed to create ${key}:`, e?.message ?? e);
    });
    snapSeeded++;
  }

  console.log(
    `[market-seed] platforms seeded=${platformSeeded} skipped=${platformSkipped} ` +
      `(total ${PLATFORMS.length}); snapshots[${today}] seeded=${snapSeeded} skipped=${snapSkipped}`
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error('[market-seed] error:', e?.message ?? e);
  process.exit(0); // non-fatal
});
