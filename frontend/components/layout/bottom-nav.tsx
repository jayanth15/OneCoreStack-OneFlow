"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  CalendarDays,
  Factory,
  MoreHorizontal,
  Building2,
  Users,
  LogOut,
  X,
  BookOpen,
  Contact,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentUser, isAdminOrAbove } from "@/lib/user";
import { apiLogout } from "@/lib/auth";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_NAV: NavItem[] = [
  { label: "Home",       href: "/dashboard",           icon: LayoutDashboard },
  { label: "Inventory",  href: "/dashboard/inventory",  icon: Package },
  { label: "Schedule",   href: "/dashboard/schedule",   icon: CalendarDays },
  { label: "Production", href: "/dashboard/production", icon: Factory },
];

// Always shown to all users in the More drawer
const GENERAL_MORE_NAV: NavItem[] = [];

// Only shown to admin / super_admin in the More drawer
const ADMIN_MORE_NAV: NavItem[] = [
  { label: "Customers",   href: "/dashboard/customers",          icon: Contact },
  { label: "Departments", href: "/dashboard/admin/departments", icon: Building2 },
  { label: "Users",       href: "/dashboard/admin/users",       icon: Users },
  { label: "BOM",         href: "/dashboard/admin/bom",         icon: BookOpen },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(isAdminOrAbove());
  }, []);

  // close more menu on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    await apiLogout();
    router.push("/login");
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  const moreNavItems = isAdmin
    ? [...GENERAL_MORE_NAV, ...ADMIN_MORE_NAV]
    : GENERAL_MORE_NAV;

  // Is any "more" route currently active?
  const moreActive = moreNavItems.some((i) => isActive(i.href));

  return (
    <>
      {/* More menu overlay */}
      {moreOpen && (
        <div
          className="hidden max-md:block fixed inset-0 z-40 bg-black/40"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More drawer that slides from bottom */}
      <div
        className={cn(
          "hidden max-md:block fixed bottom-16 left-0 right-0 z-50 bg-background border-t rounded-t-2xl shadow-2xl transition-transform duration-300",
          moreOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
        )}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <span className="text-sm font-semibold">More</span>
          <button onClick={() => setMoreOpen(false)} className="p-1 rounded-md hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        <nav className="px-3 py-2 space-y-0.5">
          {moreNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <item.icon className="size-5 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-3 py-2 border-t">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="size-5 shrink-0" />
            Sign out
          </button>
        </div>
        <div className="h-safe-bottom pb-2" />
      </div>

      {/* Bottom tab bar */}
      <nav className="hidden max-md:flex fixed bottom-0 left-0 right-0 z-50 bg-background border-t h-16">
        {PRIMARY_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
              isActive(item.href)
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <item.icon
              className={cn(
                "size-5",
                isActive(item.href) && "stroke-[2.5]"
              )}
            />
            {item.label}
          </Link>
        ))}

        {/* More button — only shown when there are items (admins) */}
        {moreNavItems.length > 0 && (
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
              moreActive || moreOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MoreHorizontal
              className={cn(
                "size-5",
                (moreActive || moreOpen) && "stroke-[2.5]"
              )}
            />
            More
          </button>
        )}
      </nav>
    </>
  );
}
