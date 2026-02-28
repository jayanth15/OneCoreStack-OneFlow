import { AuthGuard } from "@/components/auth-guard";
import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex h-dvh bg-background">
        {/* Left sidebar — desktop only */}
        <DesktopSidebar />

        {/* Main content column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            {children}
          </main>
        </div>

        {/* Bottom nav — mobile only (fixed, outside scroll container) */}
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
