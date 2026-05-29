import { prisma } from '@/lib/db';
import StyleGenomeClient from './StyleGenomeClient';

export const dynamic = 'force-dynamic';

async function loadAssets() {
  return prisma.asset.findMany({
    where: { url: { startsWith: '/uploads/' } },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { id: true, url: true, prompt: true, type: true, platform: true, createdAt: true },
  });
}

async function loadCurrentGenome() {
  const r = await prisma.setting.findUnique({ where: { key: 'style:genome:current' } });
  if (!r?.value) return null;
  try { return JSON.parse(r.value); } catch { return null; }
}

async function loadHistory() {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: 'style:genome:history:' } },
    orderBy: { key: 'desc' },
    take: 6,
  });
  return rows.map((r) => {
    try {
      return { key: r.key, computedAt: r.key.replace('style:genome:history:', ''), genome: JSON.parse(r.value) };
    } catch { return null; }
  }).filter((x): x is { key: string; computedAt: string; genome: any } => x !== null);
}

export default async function StyleGenomePage() {
  const [assets, current, history] = await Promise.all([
    loadAssets(),
    loadCurrentGenome(),
    loadHistory(),
  ]);
  return <StyleGenomeClient
    assets={assets.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
    initialGenome={current}
    initialHistory={history}
  />;
}
