import Sidebar from '@/components/Sidebar';
import PageTitleSetter from '@/components/PageTitleSetter';

export const dynamic = 'force-dynamic';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <PageTitleSetter />
        <main className="p-6 flex-1">{children}</main>
      </div>
    </div>
  );
}
