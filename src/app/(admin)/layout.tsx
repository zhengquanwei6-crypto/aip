import AdminShell from '@/components/AdminShell';
import { ToastProvider } from '@/components/Toast';
import CommandPalette from '@/components/CommandPalette';

export const dynamic = 'force-dynamic';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <CommandPalette />
      <AdminShell>{children}</AdminShell>
    </ToastProvider>
  );
}
