import { redirect } from 'next/navigation';
import { Boxes, MessageSquareText, Timer, Users } from 'lucide-react';

import DiscussClient from './DiscussClient';
import { getCurrentUser } from '@/lib/auth/session';
import CommandHeader from '@/components/command/CommandHeader';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '协作指挥台 - AIP',
};

export default async function DiscussPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="page-shell">
      <CommandHeader
        eyebrow="Creative Command Center · Collaboration"
        title="协作指挥台"
        description="把审稿意见、生产决策、素材动作和客户跟进收束在同一个团队消息流里。"
        stats={[
          { label: '当前用户', value: user.username, tone: 'info' },
          { label: '身份', value: user.role, tone: user.role === 'admin' ? 'success' : 'ai' },
          { label: '同步', value: '实时轮询', tone: 'success' },
        ]}
        actions={[
          { href: '/assets', label: '资产库', icon: <Boxes className="h-4 w-4" /> },
          { href: '/today', label: '任务排程', icon: <Timer className="h-4 w-4" /> },
          { href: '/clients', label: '客户跟进', icon: <Users className="h-4 w-4" /> },
          { href: '/discuss', label: '协作流', primary: true, icon: <MessageSquareText className="h-4 w-4" /> },
        ]}
      />
      <DiscussClient currentUser={{ username: user.username, role: user.role }} />
    </div>
  );
}
