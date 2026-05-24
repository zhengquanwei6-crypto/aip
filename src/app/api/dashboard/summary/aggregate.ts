/**
 * v0.11 B3 · /dashboard 单 fetch 聚合器（共享 SSR 与 HTTP 路由）
 * v0.11 B10 · 加 marketTrends 字段（小红书 / 闲鱼 / 千牛 三平台介绍 + 最近一条 snapshot）
 * v0.11 B15.7 · 加 diskUsage 字段（root % / uploads bytes / count · BUG-L12）
 *
 * 同一份逻辑被 /api/dashboard/summary 路由 + (admin)/dashboard/page.tsx (server component) 共用：
 *   - SSR 时直接 await buildDashboardSummary()，避免内部 HTTP 自调用
 *   - HTTP 路由薄封装一层，给 Chrome 扩展 / 外部脚本 / 未来 Agent 用
 *
 * 0 LLM/IMAGE 消耗：仅 prisma 计数 + AIOutput 历史扫描 + 文件 stat。
 * 不修改任何已有 schema / setting / route 行为。
 */

import { prisma } from '@/lib/db';
import { summarizePool } from '@/lib/ai/keys';
import { stat, statfs, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AGENTS } from '@/lib/agent-types';
import {
  getAllPlatformInfo,
  getPlatformLatestSnapshot,
} from '@/lib/market/store';
import {
  PLATFORM_SLUGS,
  type MarketPlatformSlug,
  type MarketSnapshot,
  type PlatformInfo,
} from '@/lib/market/types';

export interface DashboardSummaryToday {
  /** YYYY-MM-DD（Asia/Shanghai） */
  date: string;
  /** 周X（中文短写，如 "周六"） */
  weekday: string;
  /** 1..7（周一=1，与 Schedule.dayOfWeek 一致） */
  dayOfWeek: number;
  /** 今日待办（schedule.tasks where status=pending）的数量 */
  pendingTasksCount: number;
}

export interface DashboardSummaryKpi {
  pendingTasks: number;
  generatedTasks: number;
  publishedTasks: number;
  aioutputs: number;
  assets: number;
  clients: number;
}

export interface TodayTaskItem {
  id: string;
  title: string;
  platform: string;
  status: string;
  publishTime: string;
  contentType: string;
  category: string;
}

export interface RecentAIOutputItem {
  id: string;
  type: string;
  platform: string | null;
  summary: string;
  createdAt: string;
}

export interface DashboardSummarySystem {
  uptimeMs: number;
  version: string;
  containerStatus: 'running' | 'unknown';
  /** SQLite 文件大小（字节）；读不到时 null */
  dbSize: number | null;
  apiKeyPool: {
    llm: { total: number; active: number; lastError: string | null };
    image: { total: number; active: number; lastError: string | null };
  };
  agentRoutes: number;
  publishDirectorStats: { total: number; success: number; fail: number };
  recentFailures: { llm: string | null; image: string | null };
}

export type DashboardSummaryMarketTrends = Record<
  MarketPlatformSlug,
  { latest: MarketSnapshot | null; info: PlatformInfo }
>;

/**
 * v0.11 B15.7 · 磁盘 + uploads 用量
 *
 * 任一字段读不到 fallback null（不阻塞 SSR）。
 * Dashboard DiskWarningCard 在 rootPercent ≥ 85 时显示「磁盘紧张」+ /docs/08 链接。
 */
export interface DashboardSummaryDiskUsage {
  rootPercent: number | null;
  rootBytes: number | null;
  rootUsedBytes: number | null;
  uploadsBytes: number | null;
  uploadsCount: number | null;
}

export interface DashboardSummary {
  ok: true;
  today: DashboardSummaryToday;
  kpi: DashboardSummaryKpi;
  todayTasks: TodayTaskItem[];
  recentAIOutputs: RecentAIOutputItem[];
  system: DashboardSummarySystem;
  /** v0.11 B10：三平台市场趋势（介绍 + 最近一条 snapshot） */
  marketTrends: DashboardSummaryMarketTrends;
  /** v0.11 B15.7：磁盘 + uploads 用量（BUG-L12 闭环） */
  diskUsage: DashboardSummaryDiskUsage;
}

const APP_VERSION = process.env.APP_VERSION || 'v0.12';
const DB_PATH =
  (process.env.DATABASE_URL || '').replace(/^file:/, '').trim() || '/data/dev.db';
const UPLOADS_DIR = '/app/public/uploads';

/** Asia/Shanghai 今日信息（容器一般跑 UTC，按用户实际时区显示） */
function getShanghaiTodayInfo(): {
  date: string;
  weekday: string;
  dayOfWeek: number;
} {
  const now = new Date();
  // YYYY-MM-DD（en-CA 输出 ISO 格式）
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  // 周X（中文短）
  const longWk = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    weekday: 'long',
  }).format(now);
  const weekday = longWk.replace(/^星期/, '周');

  // dayOfWeek 1..7（周一=1）
  const enWk = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
  }).format(now);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const dayOfWeek = map[enWk] ?? 1;

  return { date, weekday, dayOfWeek };
}

function shortFailure(
  input: string | null | undefined,
  output: string | null | undefined,
): string | null {
  if (!output) return null;
  const merged = (output || input || '').slice(0, 240);
  return merged.replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-***').slice(0, 120);
}

async function readRecentFailures(): Promise<{
  llm: string | null;
  image: string | null;
}> {
  const out = { llm: null as string | null, image: null as string | null };
  try {
    const rows = await prisma.aIOutput.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    for (const r of rows) {
      try {
        const o = JSON.parse(r.output);
        const looksFail =
          !!o?.error || (Array.isArray(o?.urls) && o.urls.length === 0);
        if (!looksFail) continue;
        if (r.type === 'text' && !out.llm) out.llm = shortFailure(r.input, r.output);
        else if (r.type === 'image' && !out.image)
          out.image = shortFailure(r.input, r.output);
        if (out.llm && out.image) break;
      } catch {
        // not JSON → treat as success
      }
    }
  } catch {
    // ignore
  }
  return out;
}

async function readPublishDirectorStats(): Promise<{
  total: number;
  success: number;
  fail: number;
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const out = { total: 0, success: 0, fail: 0 };
  try {
    const rows = await prisma.aIOutput.findMany({
      where: { createdAt: { gte: since } },
      select: { input: true, output: true },
      take: 500,
    });
    for (const r of rows) {
      if (!r.input || !r.input.includes('"via":"publish-director"')) continue;
      out.total++;
      let isFail = false;
      try {
        const o = JSON.parse(r.output);
        if (o?.error) isFail = true;
        if (
          Array.isArray(o?.imageErrors) &&
          o.imageErrors.length > 0 &&
          (!Array.isArray(o?.assets) || o.assets.every((a: any) => !a?.url))
        ) {
          isFail = true;
        }
      } catch {
        isFail = true;
      }
      if (isFail) out.fail++;
      else out.success++;
    }
  } catch {
    // ignore
  }
  return out;
}

async function readDbSize(): Promise<number | null> {
  try {
    const s = await stat(DB_PATH);
    return s.size;
  } catch {
    return null;
  }
}

/**
 * v0.11 B15.7 · 读 root 磁盘 % + uploads 累计字节 / 文件数
 * 任一字段读不到 → null。
 */
async function readDiskUsage(): Promise<DashboardSummaryDiskUsage> {
  const out: DashboardSummaryDiskUsage = {
    rootPercent: null,
    rootBytes: null,
    rootUsedBytes: null,
    uploadsBytes: null,
    uploadsCount: null,
  };
  try {
    const s: any = await (statfs as any)('/');
    const blockSize = Number(s.bsize) || 0;
    const total = Number(s.blocks) * blockSize;
    const free = Number(s.bfree) * blockSize;
    const used = total - free;
    if (total > 0) {
      out.rootBytes = total;
      out.rootUsedBytes = used;
      out.rootPercent = Math.round((used / total) * 100);
    }
  } catch {
    /* ignore */
  }
  try {
    const entries = await readdir(UPLOADS_DIR);
    let bytes = 0;
    let count = 0;
    for (const name of entries) {
      try {
        const st = await stat(join(UPLOADS_DIR, name));
        if (st.isFile()) {
          bytes += st.size;
          count++;
        }
      } catch {
        /* skip unreadable */
      }
    }
    out.uploadsBytes = bytes;
    out.uploadsCount = count;
  } catch {
    /* ignore */
  }
  return out;
}

/** 把 AIOutput 一行变成卡片用的 platform + summary（兼容多种历史 output 形态） */
function summarizeAIOutput(aio: {
  type: string;
  input: string | null;
  output: string | null;
}): { platform: string | null; summary: string } {
  let platform: string | null = null;
  let summary = '';
  try {
    const inp = JSON.parse(aio.input ?? '');
    if (typeof inp?.platform === 'string') platform = inp.platform;
  } catch {
    /* ignore */
  }
  try {
    const out = JSON.parse(aio.output ?? '');
    if (typeof out?.summary === 'string') summary = out.summary;
    else if (Array.isArray(out?.titles) && typeof out.titles[0] === 'string')
      summary = out.titles[0];
    else if (typeof out?.coverText === 'string') summary = out.coverText;
    else if (typeof out?.body === 'string') summary = out.body.slice(0, 80);
    else if (typeof out?.prompt === 'string') summary = out.prompt;
    else if (Array.isArray(out?.urls) && typeof out.urls[0] === 'string')
      summary = `🖼️ ${out.urls.length} 张图片`;
  } catch {
    summary = (aio.output ?? '').slice(0, 80);
  }
  if (!summary) summary = `${aio.type} 输出`;
  return { platform, summary: summary.slice(0, 120) };
}

async function buildMarketTrends(): Promise<DashboardSummaryMarketTrends> {
  const platforms = await getAllPlatformInfo();
  const infoBySlug = new Map<MarketPlatformSlug, PlatformInfo>();
  for (const p of platforms) infoBySlug.set(p.slug, p);

  const out = {} as DashboardSummaryMarketTrends;
  for (const slug of PLATFORM_SLUGS) {
    const info = infoBySlug.get(slug);
    if (!info) continue;
    let latest: MarketSnapshot | null = null;
    try {
      latest = await getPlatformLatestSnapshot(slug);
    } catch {
      latest = null;
    }
    out[slug] = { latest, info };
  }
  return out;
}

export async function buildDashboardSummary(): Promise<DashboardSummary> {
  const todayInfo = getShanghaiTodayInfo();

  // schedule.tasks（按 publishTime asc）→ 今日待办
  const schedule = await prisma.schedule.findUnique({
    where: { dayOfWeek: todayInfo.dayOfWeek },
    include: { tasks: { orderBy: { publishTime: 'asc' } } },
  });
  const todayTasksAll = schedule?.tasks ?? [];
  const todayPendingCount = todayTasksAll.filter((t) => t.status === 'pending')
    .length;

  const [
    pendingTasks,
    generatedTasks,
    publishedTasks,
    aioutputs,
    assets,
    clients,
    recentAioRows,
    apiKeyPoolLlm,
    apiKeyPoolImage,
    publishDirectorStats,
    recentFailures,
    dbSize,
    marketTrends,
    diskUsage,
  ] = await Promise.all([
    prisma.task.count({ where: { status: 'pending' } }),
    prisma.task.count({ where: { status: 'generated' } }),
    prisma.task.count({ where: { status: 'published' } }),
    prisma.aIOutput.count(),
    prisma.asset.count(),
    prisma.client.count(),
    prisma.aIOutput.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    summarizePool('llm'),
    summarizePool('image'),
    readPublishDirectorStats(),
    readRecentFailures(),
    readDbSize(),
    buildMarketTrends(),
    readDiskUsage(),
  ]);

  const todayTasks: TodayTaskItem[] = todayTasksAll.slice(0, 5).map((t) => ({
    id: t.id,
    title: t.title,
    platform: t.platform,
    status: t.status,
    publishTime: t.publishTime,
    contentType: t.contentType,
    category: t.category,
  }));

  const recentAIOutputs: RecentAIOutputItem[] = recentAioRows.map((r) => {
    const s = summarizeAIOutput({
      type: r.type,
      input: r.input ?? null,
      output: r.output ?? null,
    });
    return {
      id: r.id,
      type: r.type,
      platform: s.platform,
      summary: s.summary,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return {
    ok: true,
    today: {
      date: todayInfo.date,
      weekday: todayInfo.weekday,
      dayOfWeek: todayInfo.dayOfWeek,
      pendingTasksCount: todayPendingCount,
    },
    kpi: {
      pendingTasks,
      generatedTasks,
      publishedTasks,
      aioutputs,
      assets,
      clients,
    },
    todayTasks,
    recentAIOutputs,
    system: {
      uptimeMs: Math.round(process.uptime() * 1000),
      version: APP_VERSION,
      containerStatus: 'running',
      dbSize,
      apiKeyPool: { llm: apiKeyPoolLlm, image: apiKeyPoolImage },
      agentRoutes: AGENTS.length,
      publishDirectorStats,
      recentFailures,
    },
    marketTrends,
    diskUsage,
  };
}
