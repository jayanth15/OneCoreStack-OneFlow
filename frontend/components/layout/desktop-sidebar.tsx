"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  CalendarDays,
  Factory,
  Building2,
  Users,
  ChevronRight,
  BookOpen,
  Contact,
  Truck,
  Settings,
  ClipboardList,
  PackageCheck,
  ClipboardCheck,
  History,
  PackagePlus,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentUser, isAdminOrAbove } from "@/lib/user";
import { apiFetchJson } from "@/lib/api";
import { requestsApi } from "@/lib/requests";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CORE_NAV: NavItem[] = [
  { label: "Dashboard",  href: "/dashboard",             icon: LayoutDashboard },
  { label: "Inventory",  href: "/dashboard/inventory",    icon: Package },
  { label: "Schedule",   href: "/dashboard/schedule",     icon: CalendarDays },
  { label: "Production", href: "/dashboard/production",   icon: Factory },
  { label: "Requests",   href: "/dashboard/requests",     icon: ClipboardList },
  { label: "Receipts",   href: "/dashboard/receipts",     icon: ClipboardCheck },
];

// Only shown to admin / super_admin (alongside Departments, Users, BOM)
const ADMIN_CORE_NAV: NavItem[] = [
  { label: "Vendors",    href: "/dashboard/vendors",      icon: Contact },
  { label: "Suppliers",  href: "/dashboard/suppliers",    icon: Truck },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Departments", href: "/dashboard/admin/departments", icon: Building2 },
  { label: "Users",       href: "/dashboard/admin/users",       icon: Users },
  { label: "BOM",         href: "/dashboard/admin/bom",         icon: BookOpen },
  { label: "History",     href: "/dashboard/history",           icon: History },
  { label: "Settings",   href: "/dashboard/admin/settings",    icon: Settings },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [grnAccess, setGrnAccess] = useState(false);
  const [dispatchAccess, setDispatchAccess] = useState(false);
  const [gatePassAccess, setGatePassAccess] = useState(false);
  const [purchaseAccess, setPurchaseAccess] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [requestCount, setRequestCount] = useState(0);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setIsAdmin(isAdminOrAbove());
      setGrnAccess(user.grn_access ?? false);
      setDispatchAccess(user.dispatch_access ?? false);
      setGatePassAccess(user.gate_pass_access ?? false);
      setPurchaseAccess(user.purchase_access ?? false);
    }
  }, [pathname]);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const [notif, reqs] = await Promise.all([
          apiFetchJson<{ count: number }>("/api/v1/notifications/unread-count"),
          requestsApi.inbox(),
        ]);
        setNotifCount(notif.count);
        setRequestCount(reqs.length);
      } catch { /* ignore */ }
    }
    fetchCounts();
    const interval = setInterval(fetchCounts, 30_000);
    return () => clearInterval(interval);
  }, []);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r bg-sidebar h-screen sticky top-0">
      {/* Logo / Brand */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b shrink-0">
        <div className="size-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm flex items-center justify-center">
          <Factory className="size-4 text-white" />
        </div>
        <span className="text-base font-bold tracking-tight text-sidebar-foreground">
          OneFlow
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Core */}
        <div>
          <p className="px-2 mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Core
          </p>
          <ul className="space-y-0.5">
            {[
              ...CORE_NAV,
              ...(grnAccess || isAdmin ? [{ label: "GRN", href: "/dashboard/grn", icon: ClipboardCheck }] : []),
              ...(dispatchAccess || isAdmin ? [{ label: "Dispatch", href: "/dashboard/dispatch", icon: PackageCheck }] : []),
              ...(gatePassAccess || isAdmin ? [{ label: "Gate Passes", href: "/dashboard/gate-passes", icon: PackagePlus }] : []),
              ...(purchaseAccess || isAdmin ? [{ label: "Purchase Orders", href: "/dashboard/purchase-orders", icon: ShoppingCart }] : []),
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 cursor-pointer",
                    isActive(item.href)
                      ? "bg-accent text-accent-foreground border-l-2 border-primary"
                      : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                  <span className="ml-auto flex items-center gap-1">
                    {item.href === "/dashboard/requests" && requestCount > 0 && (
                      <span className="bg-destructive text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                        {requestCount > 99 ? "99+" : requestCount}
                      </span>
                    )}
                    {item.href === "/dashboard" && notifCount > 0 && (
                      <span className="bg-primary text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                        {notifCount > 99 ? "99+" : notifCount}
                      </span>
                    )}
                    {isActive(item.href) && (
                      <ChevronRight className="size-3.5 opacity-60" />
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Admin */}
        {isAdmin && (
          <div>
            <p className="px-2 mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Admin
            </p>
            <ul className="space-y-0.5">
              {[...ADMIN_CORE_NAV, ...ADMIN_NAV].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 cursor-pointer",
                      isActive(item.href)
                        ? "bg-accent text-accent-foreground border-l-2 border-primary"
                        : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                    {isActive(item.href) && (
                      <ChevronRight className="size-3.5 ml-auto opacity-60" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>


    </aside>
  );
}
