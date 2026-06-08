import { redirect } from 'next/navigation';

import AdminShell from '@/components/AdminShell';
import CommandPalette from '@/components/CommandPalette';
import { getCurrentUser } from '@/lib/auth/session';
import { ensureAdminSeed } from '@/lib/auth/seed';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // v0.18-AUTH · 受保护区域的真实 HMAC 校验（middleware 只查 cookie 存在性）。
  await ensureAdminSeed();
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <>
      <CommandPalette />
      <AdminShell currentUser={{ username: user.username, role: user.role }}>
        {children}
      </AdminShell>
    </>
  );
}
