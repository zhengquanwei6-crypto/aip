import { listPromptTemplates } from '@/lib/ai/prompts';
import PromptsClient from './PromptsClient';

export const dynamic = 'force-dynamic';

export default async function PromptsPage() {
  const list = await listPromptTemplates();
  return (
    <PromptsClient
      initial={list.map(({ key, source, tpl }) => ({
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
}
