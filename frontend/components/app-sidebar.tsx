"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Package,
  Briefcase,
  Factory,
  Users,
  Building2,
  LogOut,
  Settings,
  ClipboardList,
  ClipboardCheck,
  PackageCheck,
  History,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { apiLogout } from "@/lib/auth";
import { getCurrentUser } from "@/lib/user";

const coreNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Masters", url: "/dashboard/masters", icon: BookOpen },
  { title: "Inventory", url: "/dashboard/inventory", icon: Package },
  { title: "Jobs", url: "/dashboard/jobs", icon: Briefcase },
  { title: "Production", url: "/dashboard/production", icon: Factory },
  { title: "Requests", url: "/dashboard/requests", icon: ClipboardList },
  { title: "Receipts", url: "/dashboard/receipts", icon: PackageCheck },
];

const adminNav = [
  { title: "Departments", url: "/dashboard/admin/departments", icon: Building2 },
  { title: "Users", url: "/dashboard/admin/users", icon: Users },
  { title: "Bill of Materials", url: "/dashboard/admin/bom", icon: BookOpen },
  { title: "History", url: "/dashboard/history", icon: History },
  { title: "Settings", url: "/dashboard/admin/settings", icon: Settings },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = React.useState<string | null>(null);
  const [grnAccess, setGrnAccess] = React.useState(false);

  React.useEffect(() => {
    const user = getCurrentUser();
    setRole(user?.role ?? null);
    setGrnAccess(user?.grn_access ?? false);
  }, [pathname]);

  async function handleLogout() {
    await apiLogout();
    router.replace("/login");
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader className="px-4 py-4">
        <div>
          <p className="font-bold text-base leading-tight">OneFlow</p>
          <p className="text-xs text-muted-foreground">Manufacturing ERP</p>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Core modules */}
        <SidebarGroup>
          <SidebarGroupLabel>Core</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {[...coreNav, ...(grnAccess ? [{ title: "GRN", url: "/dashboard/grn", icon: ClipboardCheck }] : [])].map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.url === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(item.url)
                    }
                  >
                    <Link href={item.url}>
                      <item.icon className="size-4" />
                      {item.title}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin section — only visible to admin / super_admin */}
        {(role === "admin" || role === "super_admin") && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith(item.url)}
                    >
                      <Link href={item.url}>
                        <item.icon className="size-4" />
                        {item.title}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              className="text-muted-foreground"
            >
              <LogOut className="size-4" />
              Sign out
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
