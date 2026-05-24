// v0.11 B8 · /playground · server component
//
// 一次性拉：
//   - LLM keys 池（provider='llm', active 优先）
//   - IMAGE keys 池（provider='image', active 优先）
//   - 6 个 adapter 的 sizes/qualities（B7 已落地，从 Setting 表 adapter:* 行 JSON 读）
//   - 8 个 agents 列表（agent-types AGENTS）
//
// 全部传给 PlaygroundClient（client）一次渲染，三 tab 切换 0 网络请求。

import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { AGENTS } from '@/lib/agent-types';
import {
  adapterConfigSchema,
  ADAPTER_SETTING_PREFIX,
  type SizePreset,
  type QualityPreset,
} from '@/lib/adapter-types';
import PlaygroundClient, {
  type ApiKeyRow,
  type AdapterPoolItem,
  type AgentSummary,
} from './PlaygroundClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI 对话 · Playground',
  description: 'B8 即时调用工作台：LLM 对话 / 图片生成 / Agent 对话三 tab，复用 B1 池 + B7 sizes/qualities + 8 agents',
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
        out.push({
          slug,
          name: a.name ?? slug,
          enabled: a.enabled !== false,
          sizes,
          qualities,
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
