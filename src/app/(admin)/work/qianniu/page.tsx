import { PlatformWorkspaceClient } from '@/components/platform-workspace/PlatformWorkspaceClient';

export const dynamic = 'force-dynamic';

export default function QianniuWorkspace() {
  return (
    <PlatformWorkspaceClient
      slug="qianniu-operator"
      title="千牛运营"
      icon="🐂"
      placeholder="例如：夏季纯棉短袖 T 恤男 199 元包邮"
      expectSize="800×800 方图"
    />
  );
}
