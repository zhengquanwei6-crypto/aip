import { redirect } from 'next/navigation';

import MobileShell from '@/components/m/MobileShell';
import { getCurrentUser } from '@/lib/auth/session';
import { ensureAdminSeed } from '@/lib/auth/seed';

export const dynamic = 'force-dynamic';

export default async function MLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // v0.18-AUTH · 移动端也走同一套登录门禁
  await ensureAdminSeed();
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  return <MobileShell>{children}</MobileShell>;
}
