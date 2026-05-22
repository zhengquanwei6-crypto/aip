import { prisma } from '@/lib/db';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

const KEYS = [
  'LLM_API_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'IMAGE_API_BASE_URL',
  'IMAGE_API_KEY',
  'IMAGE_MODEL',
];

export default async function SettingsPage() {
  const settings = await prisma.setting.findMany({
    where: { key: { in: KEYS } },
  });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  // 同时把 .env 中的默认值返给前端，但只显示 baseUrl/model；apiKey 不回填明文
  const envFallback = {
    LLM_API_BASE_URL: process.env.LLM_API_BASE_URL ?? '',
    LLM_MODEL: process.env.LLM_MODEL ?? 'gpt-4o-mini',
    IMAGE_API_BASE_URL: process.env.IMAGE_API_BASE_URL ?? '',
    IMAGE_MODEL: process.env.IMAGE_MODEL ?? 'gpt-img-2',
  };

  const hasEnvLLMKey = Boolean(process.env.LLM_API_KEY);
  const hasEnvImageKey = Boolean(process.env.IMAGE_API_KEY);

  return (
    <SettingsClient
      initial={{
        LLM_API_BASE_URL: map.LLM_API_BASE_URL ?? envFallback.LLM_API_BASE_URL,
        LLM_API_KEY: map.LLM_API_KEY ?? '',
        LLM_MODEL: map.LLM_MODEL ?? envFallback.LLM_MODEL,
        IMAGE_API_BASE_URL: map.IMAGE_API_BASE_URL ?? envFallback.IMAGE_API_BASE_URL,
        IMAGE_API_KEY: map.IMAGE_API_KEY ?? '',
        IMAGE_MODEL: map.IMAGE_MODEL ?? envFallback.IMAGE_MODEL,
      }}
      hasEnvLLMKey={hasEnvLLMKey}
      hasEnvImageKey={hasEnvImageKey}
    />
  );
}
