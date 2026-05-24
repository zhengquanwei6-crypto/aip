// v0.11 B10 · 市场趋势模块类型 + zod schema
//
// 三平台：xiaohongshu / xianyu / qianniu（淘宝卖家中心）。
// 数据来源：当前阶段是 Setting 表手填，未来 v0.10 Chrome 扩展 POST /api/market/trends/sync 喂真数据。
// 0 schema 改动；所有数据通过 Setting 表 prefix `market:` 存。

import { z } from 'zod';

/** 三平台 slug 定枚举 */
export const PLATFORM_SLUGS = ['xiaohongshu', 'xianyu', 'qianniu'] as const;
export type MarketPlatformSlug = (typeof PLATFORM_SLUGS)[number];

/** 一条数据点（KPI），可表达「热门关键词数 / GMV / 平均客单价 / 活跃账号数」等任意指标 */
export const trendDataPointSchema = z.object({
  /** KPI 内部 key，如 hotKeywords / gmv7d / avgPrice / activeAccounts */
  key: z.string().min(1).max(64),
  /** 中文展示名，如「热门关键词数」 */
  label: z.string().min(1).max(40),
  /** 数值（前端按 unit 渲染） */
  value: z.number().finite(),
  /** 单位，例 "个" / "元" / "%" / ""(无单位) */
  unit: z.string().max(8).default(''),
  /** 趋势提示，例 "+12% 周环比"，留空表示无对比 */
  trend: z.string().max(40).optional(),
  /** 简短解释（hover tooltip） */
  hint: z.string().max(120).optional(),
});
export type TrendDataPoint = z.infer<typeof trendDataPointSchema>;

/** 平台介绍卡 — 内置说明，用户可读不可改（在 seed.ts 维护） */
export const platformInfoSchema = z.object({
  slug: z.enum(PLATFORM_SLUGS),
  /** 中文名，例「小红书」 */
  name: z.string().min(1).max(20),
  /** emoji icon，渲染在 tab 上 */
  icon: z.string().max(4),
  /** 一句话定位，例「内容种草社区，女性用户为主」 */
  tagline: z.string().min(1).max(80),
  /** 4-6 句话的说明（用户画像 / 适合品类 / 趋势提示 / 推荐工作流） */
  description: z.array(z.string().min(1).max(220)).min(3).max(8),
  /** 适合品类，渲染为 tag chip */
  categories: z.array(z.string().min(1).max(20)).min(1).max(10),
  /** 数据来源说明，例「v0.10 Chrome 扩展 hook 创作中心 /data-center 接口」 */
  dataSource: z.string().min(1).max(200),
  /** 推荐 KPI key 列表（前端无数据时也按这个顺序渲染占位） */
  recommendedKpis: z.array(
    z.object({
      key: z.string().min(1).max(64),
      label: z.string().min(1).max(40),
      unit: z.string().max(8).default(''),
      hint: z.string().max(120).optional(),
    }),
  ).min(2).max(8),
  /** 推荐工作流（一段简短文字 + 例子） */
  recommendedWorkflow: z.string().min(1).max(400),
});
export type PlatformInfo = z.infer<typeof platformInfoSchema>;

/** 一条市场快照 — 某平台某天的 KPI 集合 */
export const marketSnapshotSchema = z.object({
  /** 平台 slug */
  platform: z.enum(PLATFORM_SLUGS),
  /** ISO 日期（YYYY-MM-DD，按 Asia/Shanghai） */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD'),
  /** KPI 数据点（顺序就是渲染顺序） */
  dataPoints: z.array(trendDataPointSchema).min(1).max(12),
  /** 来源标识：manual / extension / placeholder */
  source: z.enum(['manual', 'extension', 'placeholder']).default('manual'),
  /** placeholder=true 时前端会打「示例数据」徽章 */
  placeholder: z.boolean().default(false),
  /** 备注（可选） */
  note: z.string().max(400).optional(),
  /** 写入时间（ISO） */
  capturedAt: z.string().datetime().optional(),
});
export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>;

/** POST /api/market/trends 的请求体 schema */
export const trendsPostBodySchema = z.object({
  platform: z.enum(PLATFORM_SLUGS, {
    errorMap: () => ({ message: 'platform 必填且只接受 xiaohongshu / xianyu / qianniu' }),
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataPoints: z.array(trendDataPointSchema).min(1).max(12),
  source: z.enum(['manual', 'extension', 'placeholder']).default('manual').optional(),
  placeholder: z.boolean().optional(),
  note: z.string().max(400).optional(),
});
export type TrendsPostBody = z.infer<typeof trendsPostBodySchema>;

/** Setting 表 key 前缀 */
export const MARKET_SETTING_PREFIX = 'market:';
export const SNAPSHOT_KEY_PREFIX = 'market:snapshot:';
export const PLATFORM_KEY_PREFIX = 'market:platform:';

/** 给定 platform + date 拼 Setting key */
export function snapshotSettingKey(platform: MarketPlatformSlug, date: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${platform}:${date}`;
}
/** 给定 platform 拼 Setting key（PlatformInfo） */
export function platformSettingKey(platform: MarketPlatformSlug): string {
  return `${PLATFORM_KEY_PREFIX}${platform}`;
}
