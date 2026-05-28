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
    <>
      <header className="page-hero"><h1>API 适配器</h1><p>上游 LLM / 图像服务 endpoint 的配置与切换。</p></header>
      <div className="space-y-4">
      <AdaptersClient initialAdapters={adapters} />
      <AgentLauncher slug="api-doctor" />
    </div>
    </>
  );
}
