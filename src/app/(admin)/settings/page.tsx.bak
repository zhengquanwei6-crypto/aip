/**
 * /settings - 服务端 page，负责加载初始数据后传给 Client
 *
 * v0.8 Batch 1（B1.7）：传递 secretMeta（KEY 字段是否已配置 + 长度）
 *   - GET /api/settings 已脱敏，但 page 是 server 组件可直接读 prisma
 *   - 这里 KEY 字段不会传明文给 Client（initial 中 LLM_API_KEY/IMAGE_API_KEY 强制空）
 *   - 仅元信息（isSet/length）传入，用于 UI 渲染遮罩
 */

import { prisma } from '@/lib/db';
import {
  adapterConfigSchema,
  ADAPTER_SETTING_PREFIX,
} from '@/lib/adapter-types';
import SettingsClient from './SettingsClient';
import { AgentLauncher } from '@/components/agents/AgentDrawer';

export const dynamic = 'force-dynamic';

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
  for (const r of rows) {
    try {
      const parsed = adapterConfigSchema.safeParse(JSON.parse(r.value));
      if (parsed.success) {
        out.push({
          slug: parsed.data.slug,
          name: parsed.data.name,
          type: parsed.data.flow.type,
          enabled: parsed.data.enabled,
        });
      }
    } catch {/* skip */}
  }
  return out;
}

export default async function SettingsPage() {
  const settings = await prisma.setting.findMany({
    where: { key: { in: [...KEYS] } },
  });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  // 注意：KEY 字段在 initial 中不传明文（避免 SSR 出现到 HTML 的明文）
  const initial = {
    LLM_API_BASE_URL: map.LLM_API_BASE_URL || '',
    LLM_API_KEY: '',
    LLM_MODEL: map.LLM_MODEL || '',
    IMAGE_API_BASE_URL: map.IMAGE_API_BASE_URL || '',
    IMAGE_API_KEY: '',
    IMAGE_MODEL: map.IMAGE_MODEL || '',
    IMAGE_DEFAULT_ADAPTER: map.IMAGE_DEFAULT_ADAPTER || '',
  };

  const secretMeta: Record<string, { isSet: boolean; length: number }> = {};
  for (const k of SECRET_KEY_NAMES) {
    const v = map[k] ?? '';
    secretMeta[k] = { isSet: v.length > 0, length: v.length };
  }

  const adapters = await loadAdapters();

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-semibold">设置</h1>
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
