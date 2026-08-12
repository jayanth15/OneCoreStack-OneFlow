import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { AuthGuard } from "@/components/layout/auth-guard"
import { DesktopSidebar } from "@/components/layout/desktop-sidebar"
import { BottomNav } from "@/components/layout/bottom-nav"
import { TopBar } from "@/components/layout/top-bar"
import { isAuthenticated } from "@/lib/auth"

export const Route = createFileRoute("/_auth")({
  beforeLoad: () => {
    // Access token lives in sessionStorage → only checkable on the client.
    // Covers client-side navigations; the AuthGuard component covers the
    // initial (SSR) render.
    if (typeof window !== "undefined" && !isAuthenticated()) {
      throw redirect({ href: "/login" })
    }
  },
  component: DashboardLayout,
})

function DashboardLayout() {
  return (
    <AuthGuard>
      <div className="flex h-dvh bg-background">
        {/* Left sidebar — desktop only */}
        <DesktopSidebar />

        {/* Main content column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            <Outlet />
          </main>
        </div>

        {/* Top bar — fixed overlay for bell + user icon (desktop only) */}
        <TopBar />

        {/* Bottom nav — mobile only (fixed, outside scroll container) */}
        <BottomNav />
      </div>
    </AuthGuard>
  )
}
