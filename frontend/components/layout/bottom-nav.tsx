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
  Truck,
  Settings,
  Download,
  Share,
  ShieldAlert,
  MonitorSmartphone,
  ClipboardList,
  PackageCheck,
  ClipboardCheck,
  PackagePlus,
  ShoppingCart,
} from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { cn } from "@/lib/utils";
import { getCurrentUser, isAdminOrAbove, ALL_INVENTORY_TYPES } from "@/lib/user";
import type { CurrentUser } from "@/lib/user";
import { apiLogout } from "@/lib/auth";
import { requestsApi } from "@/lib/requests";
import { requestReceiptsApi } from "@/lib/request-receipts";
import { UserAvatar } from "@/components/layout/top-bar";

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
const GENERAL_MORE_NAV: NavItem[] = [
  { label: "Requests", href: "/dashboard/requests", icon: ClipboardList },
  { label: "Receipts", href: "/dashboard/receipts", icon: PackageCheck },
];

// Only shown to admin / super_admin in the More drawer
const ADMIN_MORE_NAV: NavItem[] = [
  { label: "Vendors",     href: "/dashboard/vendors",            icon: Contact },
  { label: "Suppliers",   href: "/dashboard/suppliers",          icon: Truck },
  { label: "Departments", href: "/dashboard/admin/departments", icon: Building2 },
  { label: "Users",       href: "/dashboard/admin/users",       icon: Users },
  { label: "BOM",         href: "/dashboard/admin/bom",         icon: BookOpen },
  { label: "Settings",    href: "/dashboard/admin/settings",    icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [grnAccess, setGrnAccess] = useState(false);
  const [dispatchAccess, setDispatchAccess] = useState(false);
  const [gatePassAccess, setGatePassAccess] = useState(false);
  const [purchaseAccess, setPurchaseAccess] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);
  const { canInstall, canPrompt, isIOS, isAndroidHTTP, needsCert, isManual, install } = usePwaInstall();

  useEffect(() => {
    async function fetchCounts() {
      try {
        const [reqs, rcpts] = await Promise.all([
          requestsApi.list({ status: "pending" }),
          requestReceiptsApi.list({ status: "pending_ack" }),
        ]);
        setRequestCount(reqs.length);
        setReceiptCount(rcpts.length);
      } catch { /* ignore */ }
    }
    fetchCounts();
    const interval = setInterval(fetchCounts, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setIsAdmin(isAdminOrAbove());
    const u = getCurrentUser();
    setUser(u);
    setGrnAccess(u?.grn_access ?? false);
    setDispatchAccess(u?.dispatch_access ?? false);
    setGatePassAccess(u?.gate_pass_access ?? false);
    setPurchaseAccess(u?.purchase_access ?? false);
  }, [pathname]);

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

  const moreNavItems = [
    ...GENERAL_MORE_NAV,
    ...(grnAccess || isAdmin ? [{ label: "GRN", href: "/dashboard/grn", icon: ClipboardCheck }] : []),
    ...(dispatchAccess || isAdmin ? [{ label: "Dispatch", href: "/dashboard/dispatch", icon: PackageCheck }] : []),
    ...(gatePassAccess || isAdmin ? [{ label: "Gate Passes", href: "/dashboard/gate-passes", icon: PackagePlus }] : []),
    ...(purchaseAccess || isAdmin ? [{ label: "Purchase Orders", href: "/dashboard/purchase-orders", icon: ShoppingCart }] : []),
    ...(isAdmin ? ADMIN_MORE_NAV : []),
  ];

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
        {/* Profile strip */}
        {user && (
          <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
            <UserAvatar username={user.username} photoBase64={user.photo_base64} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user.username}</p>
              <p className="text-[10px] font-bold text-primary tracking-wide">
                {user.role.replace(/_/g, " ").toUpperCase()}
              </p>
              <div className="flex items-center gap-3 mt-0.5">
                {(() => {
                  const codes = user.department_codes ?? [];
                  const names = user.department_names ?? [];
                  const isAdminRole = user.role === "admin" || user.role === "super_admin";
                  if (codes.length > 0) {
                    return (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {codes.map((c, i) => names[i] ? `${c} \u2014 ${names[i]}` : c).join(", ")}
                      </span>
                    );
                  }
                  if (isAdminRole) {
                    return (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {user.role.replace(/_/g, " ").toUpperCase()}
                      </span>
                    );
                  }
                  return null;
                })()}
                <span className="text-[10px] text-muted-foreground">
                  Inv:&nbsp;
                  <span className="font-semibold text-foreground">
                    {user.inventory_access.length === 0
                      ? ALL_INVENTORY_TYPES.length
                      : user.inventory_access.length}
                  </span>
                </span>
              </div>
            </div>
            <button onClick={() => setMoreOpen(false)} className="p-1 rounded-md hover:bg-muted shrink-0">
              <X className="size-4" />
            </button>
          </div>
        )}
        {!user && (
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <span className="text-sm font-semibold">More</span>
            <button onClick={() => setMoreOpen(false)} className="p-1 rounded-md hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>
        )}
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
              {item.href === "/dashboard/requests" && requestCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                  {requestCount > 99 ? "99+" : requestCount}
                </span>
              )}
              {item.href === "/dashboard/receipts" && receiptCount > 0 && (
                <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                  {receiptCount > 99 ? "99+" : receiptCount}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="px-3 py-2 border-t space-y-1">
          {canPrompt && (
            <button
              onClick={() => { install(); setMoreOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <Download className="size-5 shrink-0" />
              Install App
            </button>
          )}
          {isIOS && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-primary/5 text-xs text-foreground">
              <Share className="size-4 shrink-0 mt-0.5 text-primary" />
              <span>Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> to install.</span>
            </div>
          )}
          {(isAndroidHTTP || needsCert) && (
            <a
              href={
                isAndroidHTTP
                  ? `https://${window.location.hostname}/dashboard`
                  : `http://${window.location.hostname}:3000/setup`
              }
              className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              <ShieldAlert className="size-5 shrink-0 mt-0.5" />
              <span className="text-xs leading-snug">
                {isAndroidHTTP ? (
                  <><strong>Wrong URL</strong><br />Open <strong>https://{window.location.hostname}</strong> (no port) to install the app.</>
                ) : (
                  <><strong>Certificate setup required</strong><br />Android 7+ needs a System cert. As a workaround, use Chrome menu ⋮ → <strong>Add to Home Screen</strong>.</>
                )}
              </span>
            </a>
          )}
          {isManual && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-primary/5 text-xs text-foreground">
              <MonitorSmartphone className="size-4 shrink-0 mt-0.5 text-primary" />
              <span>Tap browser menu <strong>⋮</strong> → <strong>Add to Home Screen</strong> or <strong>Install App</strong> to install OneFlow.</span>
            </div>
          )}
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

        {/* More button — shown when there are nav items OR when PWA can be installed */}
        {(moreNavItems.length > 0 || canInstall) && (
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
