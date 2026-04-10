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
  Settings,
  ClipboardList,
  PackageCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentUser, isAdminOrAbove } from "@/lib/user";
import { apiFetchJson } from "@/lib/api";

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
  { label: "Requests",   href: "/dashboard/requests",     icon: ClipboardList },  { label: "Receipts",  href: "/dashboard/receipts",     icon: PackageCheck },];

// Only shown to admin / super_admin (alongside Departments, Users, BOM)
const ADMIN_CORE_NAV: NavItem[] = [
  { label: "Customers",  href: "/dashboard/customers",    icon: Contact },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Departments", href: "/dashboard/admin/departments", icon: Building2 },
  { label: "Users",       href: "/dashboard/admin/users",       icon: Users },
  { label: "BOM",         href: "/dashboard/admin/bom",         icon: BookOpen },
  { label: "Settings",   href: "/dashboard/admin/settings",    icon: Settings },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [requestCount, setRequestCount] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setIsAdmin(isAdminOrAbove());
    }
  }, []);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const [notif, req, rcpt] = await Promise.all([
          apiFetchJson<{ count: number }>("/api/v1/notifications/unread-count"),
          apiFetchJson<{ count: number }>("/api/v1/purchase-requests/active-count"),
          apiFetchJson<{ count: number }>("/api/v1/receipts/pending-count"),
        ]);
        setNotifCount(notif.count);
        setRequestCount(req.count);
        setReceiptCount(rcpt.count);
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
        <div className="size-7 rounded-lg bg-primary flex items-center justify-center">
          <Factory className="size-4 text-primary-foreground" />
        </div>
        <span className="text-base font-bold tracking-tight text-sidebar-foreground">
          OneFlow
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Core */}
        <div>
          <p className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Core
          </p>
          <ul className="space-y-0.5">
            {CORE_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                  <span className="ml-auto flex items-center gap-1">
                    {item.href === "/dashboard/requests" && requestCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                        {requestCount > 99 ? "99+" : requestCount}
                      </span>
                    )}
                    {item.href === "/dashboard/receipts" && receiptCount > 0 && (
                      <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                        {receiptCount > 99 ? "99+" : receiptCount}
                      </span>
                    )}
                    {item.href === "/dashboard" && notifCount > 0 && (
                      <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
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
            <p className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Admin
            </p>
            <ul className="space-y-0.5">
              {[...ADMIN_CORE_NAV, ...ADMIN_NAV].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive(item.href)
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
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
