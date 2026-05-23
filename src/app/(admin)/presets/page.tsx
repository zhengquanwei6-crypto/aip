import { prisma } from '@/lib/db';
import { listPromptTemplates } from '@/lib/ai/prompts';
import PresetsClient from './PresetsClient';
import PromptsClient from '../prompts/PromptsClient';
import AgentSystemSection from './AgentSystemSection';
import PresetsTabsShell, { type PresetsTab } from './PresetsTabsShell';

export const dynamic = 'force-dynamic';

/**
 * v0.11 B5 · /presets 三 tab 整合：
 *   - tab=image   (默认) PresetsClient — 图片预设
 *   - tab=content         PromptsClient — 文案模板（吸收 /prompts）
 *   - tab=agent           AgentSystemSection 占位（v0.9.2 b2 待真实施）
 *
 * 数据策略：image / content 两边在 server 一次拉好；agent tab 是占位文案，无数据获取。
 */
export default async function PresetsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const raw = searchParams?.tab;
  const tab: PresetsTab =
    raw === 'content' ? 'content' : raw === 'agent' ? 'agent' : 'image';

  const [presets, prompts] = await Promise.all([
    prisma.imagePreset.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    }),
    listPromptTemplates(),
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

  const agentNode = <AgentSystemSection />;

  return (
    <PresetsTabsShell
      active={tab}
      image={imageNode}
      content={contentNode}
      agent={agentNode}
    />
  );
}
