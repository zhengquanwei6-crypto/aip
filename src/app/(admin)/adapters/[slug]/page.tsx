// /adapters/[slug] - 编辑（slug='new' 时是新建）
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { adapterConfigSchema, adapterKey, type AdapterConfig } from '@/lib/adapter-types';
import AdapterEditorClient from './AdapterEditorClient';

export const dynamic = 'force-dynamic';

interface Ctx { params: { slug: string } }

async function loadOne(slug: string): Promise<AdapterConfig | null> {
  if (slug === 'new') return null;
  const row = await prisma.setting.findUnique({ where: { key: adapterKey(slug) } });
  if (!row) return null;
  try {
    const parsed = adapterConfigSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default async function AdapterEditorPage({ params }: Ctx) {
  const initial = await loadOne(params.slug);
  if (params.slug !== 'new' && !initial) notFound();
  return <AdapterEditorClient initial={initial} slug={params.slug} />;
}
