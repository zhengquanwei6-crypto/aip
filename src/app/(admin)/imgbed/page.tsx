/**
 * v0.13 B3 · 图床（imgbed）独立页面
 *
 * 同时承载：
 *   - 手动上传（拖拽 / 选择文件 / 多文件 · ≤10MB · PNG/JPG/WebP/GIF）
 *   - 列表：所有 Asset (ai_generated + manual_upload) 网格 + 分页（25/页）
 *   - 每项：缩略图 + 短链 /i/<id> + 一键复制 + 删除
 *   - 三 tab 过滤：全部 / AI 生成 / 手动上传
 *
 * /workspace?tab=assets 是 v0.11 B5 已有的素材库视图（保留），
 * /imgbed 是更轻量的图床面板（专注短链 + 上传）。两者读同一张 Asset 表，
 * 列表数据互相可见。
 */

import { prisma } from '@/lib/db';
import ImgbedClient from './ImgbedClient';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: { tab?: string; page?: string };
}

function parsePage(v: string | undefined): number {
  const n = Number.parseInt(v || '1', 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 1000) return 1000;
  return n;
}

function tabToSource(tab: string | undefined): string | undefined {
  if (tab === 'ai') return 'ai_generated';
  if (tab === 'manual') return 'manual_upload';
  return undefined;
}

export default async function ImgbedPage({ searchParams }: PageProps) {
  const tab = (searchParams.tab as 'all' | 'ai' | 'manual' | undefined) ?? 'all';
  const page = parsePage(searchParams.page);
  const source = tabToSource(tab);

  const where: Record<string, unknown> = {};
  if (source) where.source = source;

  const [items, total, countAi, countManual] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.asset.count({ where }),
    prisma.asset.count({ where: { source: 'ai_generated' } }),
    prisma.asset.count({ where: { source: 'manual_upload' } }),
  ]);

  return (
    <ImgbedClient
      initialItems={items.map((a) => ({
        id: a.id,
        type: a.type,
        source: a.source,
        platform: a.platform ?? '',
        category: a.category ?? '',
        url: a.url,
        prompt: a.prompt ?? '',
        fileName: a.fileName ?? '',
        createdAt: a.createdAt.toISOString(),
      }))}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      tab={tab}
      stats={{
        all: countAi + countManual,
        ai: countAi,
        manual: countManual,
      }}
    />
  );
}
