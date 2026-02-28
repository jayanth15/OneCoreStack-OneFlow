"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  CalendarDays,
  Factory,
  Building2,
  Users,
  LogOut,
  ChevronRight,
  BookOpen,
  Contact,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/user";
import { apiLogout } from "@/lib/auth";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CORE_NAV: NavItem[] = [
  { label: "Dashboard",  href: "/dashboard",             icon: LayoutDashboard },
  { label: "Inventory",  href: "/dashboard/inventory",    icon: Package },
  { label: "Schedule",   href: "/dashboard/schedule",     icon: CalendarDays },
  { label: "Customers",  href: "/dashboard/customers",    icon: Contact },
  { label: "Production", href: "/dashboard/production",   icon: Factory },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Departments", href: "/dashboard/admin/departments", icon: Building2 },
  { label: "Users",       href: "/dashboard/admin/users",       icon: Users },
  { label: "BOM",         href: "/dashboard/admin/bom",         icon: BookOpen },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setIsAdmin(user.role === "admin" || user.role === "super_admin");
      setUsername(user.username);
    }
  }, []);

  async function handleSignOut() {
    await apiLogout();
    router.push("/login");
  }

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
                  {isActive(item.href) && (
                    <ChevronRight className="size-3.5 ml-auto opacity-60" />
                  )}
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
              {ADMIN_NAV.map((item) => (
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

      {/* Footer / user + sign out */}
      <div className="border-t px-3 py-3 shrink-0 space-y-1">
        {username && (
          <p className="px-3 py-1 text-xs text-muted-foreground truncate">
            {username}
          </p>
        )}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="size-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
