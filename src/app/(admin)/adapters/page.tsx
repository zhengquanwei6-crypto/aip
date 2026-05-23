// /adapters - 适配器列表页
import { prisma } from '@/lib/db';
import { adapterConfigSchema, ADAPTER_SETTING_PREFIX, type AdapterConfig } from '@/lib/adapter-types';
import AdaptersClient from './AdaptersClient';
import { AgentLauncher } from '@/components/agents/AgentDrawer';

export const dynamic = 'force-dynamic';

async function loadAdapters(): Promise<AdapterConfig[]> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: ADAPTER_SETTING_PREFIX } },
    orderBy: { updatedAt: 'desc' },
  });
  const adapters: AdapterConfig[] = [];
  for (const row of rows) {
    try {
      const parsed = adapterConfigSchema.safeParse(JSON.parse(row.value));
      if (parsed.success) adapters.push(parsed.data);
    } catch {/* skip */}
  }
  return adapters;
}

export default async function AdaptersPage() {
  const adapters = await loadAdapters();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">API 适配器</h1>
        <p className="text-sm text-slate-500 mt-1">
          粘贴中转站文档 → LLM 自动生成可执行配置 → 干跑验证 → 保存使用。
        </p>
      </div>
      <AdaptersClient initialAdapters={adapters} />
      <AgentLauncher slug="api-doctor" />
    </div>
  );
}
