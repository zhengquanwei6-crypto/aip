import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import AuthClient from '../login/AuthClient';
import { getCurrentUser } from '@/lib/auth/session';
import { ensureAdminSeed } from '@/lib/auth/seed';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '注册 - AIP',
};

export default async function RegisterPage() {
  await ensureAdminSeed();
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  return (
    <Suspense fallback={null}>
      <AuthClient mode="register" />
    </Suspense>
  );
}
