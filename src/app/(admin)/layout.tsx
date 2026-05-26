import AdminShell from '@/components/AdminShell';
import CommandPalette from '@/components/CommandPalette';

export const dynamic = 'force-dynamic';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <CommandPalette />
      <AdminShell>{children}</AdminShell>
    </>
  );
}
