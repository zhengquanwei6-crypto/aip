import { prisma } from '@/lib/db';
import MSettingsClient from './MSettingsClient';

export const dynamic = 'force-dynamic';

const KEYS = [
  'LLM_API_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'IMAGE_API_BASE_URL',
  'IMAGE_API_KEY',
  'IMAGE_MODEL',
];

export default async function MSettingsPage() {
  const settings = await prisma.setting.findMany({
    where: { key: { in: KEYS } },
  });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  const hasEnvLLM = Boolean(process.env.LLM_API_KEY);
  const hasEnvImg = Boolean(process.env.IMAGE_API_KEY);

  return (
    <MSettingsClient
      initial={{
        LLM_API_BASE_URL:
          map.LLM_API_BASE_URL ?? process.env.LLM_API_BASE_URL ?? '',
        LLM_API_KEY: map.LLM_API_KEY ?? '',
        LLM_MODEL: map.LLM_MODEL ?? process.env.LLM_MODEL ?? 'gpt-4o-mini',
        IMAGE_API_BASE_URL:
          map.IMAGE_API_BASE_URL ?? process.env.IMAGE_API_BASE_URL ?? '',
        IMAGE_API_KEY: map.IMAGE_API_KEY ?? '',
        IMAGE_MODEL: map.IMAGE_MODEL ?? process.env.IMAGE_MODEL ?? 'gpt-img-2',
      }}
      hasEnvLLM={hasEnvLLM}
      hasEnvImg={hasEnvImg}
    />
  );
}
