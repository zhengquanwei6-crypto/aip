import MobileShell from '@/components/m/MobileShell';

export const dynamic = 'force-dynamic';

export default function MLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MobileShell>{children}</MobileShell>;
}
