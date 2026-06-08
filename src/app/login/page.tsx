import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import AuthClient from './AuthClient';
import { getCurrentUser } from '@/lib/auth/session';
import { ensureAdminSeed } from '@/lib/auth/seed';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '登录 - AIP',
};

export default async function LoginPage() {
  await ensureAdminSeed();
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  return (
    <Suspense fallback={null}>
      <AuthClient mode="login" />
    </Suspense>
  );
}
