import { PlatformWorkspaceClient } from '@/components/platform-workspace/PlatformWorkspaceClient';

export const dynamic = 'force-dynamic';

export default function XianyuWorkspace() {
  return (
    <PlatformWorkspaceClient
      slug="xianyu-operator"
      title="闲鱼运营"
      icon="🐟"
      placeholder="例如：二手 iPhone 14 Pro 256G 暗紫色 9 成新 4500 元"
      expectSize="1080×1080 方图"
    />
  );
}
