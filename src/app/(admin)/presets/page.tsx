import { prisma } from '@/lib/db';
import { listPromptTemplates } from '@/lib/ai/prompts';
import { AGENTS } from '@/lib/agent-types';
import { listAgentCustomPrompts } from '@/lib/agents/system-prompt';
import PresetsClient from './PresetsClient';
import PromptsClient from '../prompts/PromptsClient';
import AgentSystemSection, { type AgentRow } from './AgentSystemSection';
import PresetsTabsShell, { type PresetsTab } from './PresetsTabsShell';

export const dynamic = 'force-dynamic';

/**
 * v0.11 B5 · /presets 三 tab 整合：
 *   - tab=image   (默认) PresetsClient — 图片预设
 *   - tab=content         PromptsClient — 文案模板（吸收 /prompts）
 *   - tab=agent           AgentSystemSection — Agent System Prompt 编辑器（v0.12 B2 落地）
 *
 * v0.12 B2：tab=agent 从 v0.11 B5 占位升级为真编辑器。
 *   server 一次性拉 AGENTS 数组（8 内置 fallback）+ Setting `prompt:agent:*:system` 覆盖，
 *   组装成 AgentRow[] 传给 client。
 */
export default async function PresetsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const raw = searchParams?.tab;
  const tab: PresetsTab =
    raw === 'content' ? 'content' : raw === 'agent' ? 'agent' : 'image';

  const [presets, prompts, agentCustomMap] = await Promise.all([
    prisma.imagePreset.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    }),
    listPromptTemplates(),
    listAgentCustomPrompts(),
  ]);

  const imageNode = (
    <PresetsClient
      initial={presets.map((p) => ({
        id: p.id,
        name: p.name,
        styleKeywords: p.styleKeywords,
        negativePrompt: p.negativePrompt ?? '',
        size: p.size,
        imageType: p.imageType,
        isDefault: p.isDefault,
      }))}
    />
  );

  const contentNode = (
    <PromptsClient
      initial={prompts.map(({ key, source, tpl }) => ({
        key,
        source,
        name: tpl.name,
        description: tpl.description,
        system: tpl.system,
        user: tpl.user,
        vars: tpl.vars,
      }))}
    />
  );

  // v0.12 B2：组装 AgentRow[]（8 个 agent · 各自的内置 fallback + Setting 覆盖）
  const agentRows: AgentRow[] = AGENTS.map((a) => ({
    slug: a.slug,
    name: a.name,
    description: a.description,
    icon: a.icon,
    builtin: a.systemPrompt,
    custom: agentCustomMap.get(a.slug)?.system ?? null,
  }));

  const agentNode = <AgentSystemSection initial={agentRows} />;

  return (
    <PresetsTabsShell
      active={tab}
      image={imageNode}
      content={contentNode}
      agent={agentNode}
    />
  );
}
