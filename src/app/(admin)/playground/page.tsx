// v0.11 B8 + B9 · /playground · server component
//
// v0.11 B9：loadAdapterPool 一并读 aspectRatios + supportsImg2Img

import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { AGENTS } from '@/lib/agent-types';
import {
  adapterConfigSchema,
  ADAPTER_SETTING_PREFIX,
  type SizePreset,
  type QualityPreset,
  type AspectRatioPreset,
} from '@/lib/adapter-types';
import PlaygroundClient, {
  type ApiKeyRow,
  type AdapterPoolItem,
  type AgentSummary,
} from './PlaygroundClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI 对话 · Playground',
  description: 'B8 + B9 即时调用工作台：LLM 对话 / 图片生成（t2i + i2i） / Agent 对话三 tab',
};

async function loadKeys(provider: 'llm' | 'image'): Promise<ApiKeyRow[]> {
  try {
    const rows = await prisma.apiKey.findMany({
      where: { provider },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider as 'llm' | 'image',
      label: r.label,
      baseUrl: r.baseUrl,
      model: r.model,
      active: r.active,
      priority: r.priority,
      consecutiveErrors: r.consecutiveErrors,
      totalRequests: r.totalRequests,
    }));
  } catch {
    return [];
  }
}

async function loadAdapterPool(): Promise<AdapterPoolItem[]> {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: ADAPTER_SETTING_PREFIX } },
    });
    const out: AdapterPoolItem[] = [];
    for (const r of rows) {
      const slug = r.key.slice(ADAPTER_SETTING_PREFIX.length);
      try {
        const parsed = adapterConfigSchema.safeParse(JSON.parse(r.value));
        if (!parsed.success) continue;
        const a = parsed.data;
        const sizes: SizePreset[] = Array.isArray(a.sizes) ? a.sizes : [];
        const qualities: QualityPreset[] = Array.isArray(a.qualities) ? a.qualities : [];
        const aspectRatios: AspectRatioPreset[] = Array.isArray(a.aspectRatios) ? a.aspectRatios : [];
        out.push({
          slug,
          name: a.name ?? slug,
          enabled: a.enabled !== false,
          sizes,
          qualities,
          aspectRatios,
          supportsImg2Img: a.supportsImg2Img === true,
        });
      } catch {
        /* skip */
      }
    }
    return out.sort((x, y) => x.slug.localeCompare(y.slug));
  } catch {
    return [];
  }
}

async function loadDefaultAdapter(): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'IMAGE_DEFAULT_ADAPTER' } });
    return row?.value?.trim() || null;
  } catch {
    return null;
  }
}

export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const [llmKeys, imageKeys, adapters, defaultAdapter] = await Promise.all([
    loadKeys('llm'),
    loadKeys('image'),
    loadAdapterPool(),
    loadDefaultAdapter(),
  ]);

  const agents: AgentSummary[] = AGENTS.map((a) => ({
    slug: a.slug,
    name: a.name,
    description: a.description,
    icon: a.icon,
    systemPrompt: a.systemPrompt,
  }));

  const initTab = (() => {
    const t = searchParams?.tab;
    if (t === 'image' || t === 'agent' || t === 'llm') return t;
    return 'llm';
  })();

  return (
    <PlaygroundClient
      llmKeys={llmKeys}
      imageKeys={imageKeys}
      adapters={adapters}
      defaultAdapter={defaultAdapter}
      agents={agents}
      initTab={initTab}
    />
  );
}
