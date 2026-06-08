import { prisma } from '@/lib/db';
import {
  adapterConfigSchema,
  ADAPTER_SETTING_PREFIX,
} from '@/lib/adapter-types';
import SettingsClient from './SettingsClient';
import { AgentLauncher } from '@/components/agents/AgentDrawer';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '设置 - AIP',
};

const KEYS = [
  'LLM_API_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'IMAGE_API_BASE_URL',
  'IMAGE_API_KEY',
  'IMAGE_MODEL',
  'IMAGE_DEFAULT_ADAPTER',
] as const;

const SECRET_KEY_NAMES = ['LLM_API_KEY', 'IMAGE_API_KEY'] as const;

async function loadAdapters(): Promise<{ slug: string; name: string; type: string; enabled: boolean }[]> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: ADAPTER_SETTING_PREFIX } },
    orderBy: { updatedAt: 'desc' },
  });
  const out: { slug: string; name: string; type: string; enabled: boolean }[] = [];
  for (const row of rows) {
    try {
      const parsed = adapterConfigSchema.safeParse(JSON.parse(row.value));
      if (parsed.success) {
        out.push({
          slug: parsed.data.slug,
          name: parsed.data.name,
          type: parsed.data.flow.type,
          enabled: parsed.data.enabled,
        });
      }
    } catch {
      /* skip invalid adapter rows */
    }
  }
  return out;
}

export default async function SettingsPage() {
  const settings = await prisma.setting.findMany({
    where: { key: { in: [...KEYS] } },
  });
  const map: Record<string, string> = {};
  for (const setting of settings) map[setting.key] = setting.value;

  const initial = {
    LLM_API_BASE_URL: map.LLM_API_BASE_URL || '',
    LLM_API_KEY: map.LLM_API_KEY || '',
    LLM_MODEL: map.LLM_MODEL || '',
    IMAGE_API_BASE_URL: map.IMAGE_API_BASE_URL || '',
    IMAGE_API_KEY: map.IMAGE_API_KEY || '',
    IMAGE_MODEL: map.IMAGE_MODEL || '',
    IMAGE_DEFAULT_ADAPTER: map.IMAGE_DEFAULT_ADAPTER || '',
  };

  const secretMeta: Record<string, { isSet: boolean; length: number }> = {};
  for (const key of SECRET_KEY_NAMES) {
    const value = map[key] ?? '';
    secretMeta[key] = { isSet: value.length > 0, length: value.length };
  }

  const adapters = await loadAdapters();

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div className="page-kicker">设置模块</div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="page-title">系统设置</h1>
            <p className="page-subtitle">
              统一管理模型端点、API Key 池、图片适配器、向量检索和平台默认参数。
            </p>
          </div>
          <div className="metric-tile px-3 py-2 text-xs text-slate-500">
            {adapters.length} 个适配器已配置
          </div>
        </div>
      </section>
      <SettingsClient
        initial={initial}
        hasEnvLLMKey={Boolean(process.env.LLM_API_KEY)}
        hasEnvImageKey={Boolean(process.env.IMAGE_API_KEY)}
        adapters={adapters}
        secretMeta={secretMeta}
      />
      <AgentLauncher slug="api-doctor" />
    </div>
  );
}
