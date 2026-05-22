import Sidebar from '@/components/layout/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden pt-16 md:ml-56 md:pt-0">
        <main className="flex-1 overflow-hidden pb-14 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  );
}
