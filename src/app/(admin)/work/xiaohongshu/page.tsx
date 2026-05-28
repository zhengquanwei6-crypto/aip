/**
 * v0.15 · /work/xiaohongshu · 小红书运营
 *
 * 统一使用 PlatformWorkspaceClient（与闲鱼/千牛一致），删掉旧的 XhsOperatorClient
 * 巨型客户端组件（800+ 行 / 多个堆积的智能体定义）。
 */
import { PlatformWorkspaceClient } from '@/components/platform-workspace/PlatformWorkspaceClient';

export const dynamic = 'force-dynamic';

export default function XiaohongshuWorkspace() {
  return (
    <PlatformWorkspaceClient
      slug="xiaohongshu-operator"
      title="小红书运营"
      icon="📕"
      placeholder="例如：奶茶店开业，3 款主推 + 满减活动 + 周年庆插画风"
      expectSize="1024×1536 竖图"
    />
  );
}
