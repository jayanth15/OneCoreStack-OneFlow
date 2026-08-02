"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck, LogOut } from "lucide-react";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser, ALL_INVENTORY_TYPES } from "@/lib/user";
import type { CurrentUser } from "@/lib/user";
import { apiLogout } from "@/lib/auth";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  request_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function roleLabel(role: string): string {
  return role.replace(/_/g, " ").toUpperCase();
}

// ── UserAvatar ────────────────────────────────────────────────────────────────

export function UserAvatar({
  username,
  photoBase64,
  size = "sm",
}: {
  username: string;
  photoBase64?: string | null;
  size?: "sm" | "lg";
}) {
  const dim = size === "lg" ? "size-14" : "size-8";
  const text = size === "lg" ? "text-xl" : "text-xs";
  if (photoBase64) {
    return (
      <img
        src={photoBase64}
        alt={username}
        className={`${dim} rounded-full object-cover ring-2 ring-primary/20 shrink-0`}
      />
    );
  }
  const initials = username.slice(0, 2).toUpperCase();
  return (
    <div className={`${dim} rounded-full bg-primary flex items-center justify-center ring-2 ring-primary/20 shrink-0`}>
      <span className={`${text} font-semibold text-primary-foreground`}>{initials}</span>
    </div>
  );
}

// ── NotificationBell ──────────────────────────────────────────────────────────

function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function fetchNotifications() {
    try {
      const data = await apiFetchJson<Notification[]>("/api/v1/notifications");
      setNotifications(data);
    } catch {
      // silently ignore — not a critical failure
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function markRead(id: number) {
    try {
      await apiFetchJson(`/api/v1/notifications/${id}/read`, { method: "POST" });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to mark notification as read");
    }
  }

  async function markAllRead() {
    try {
      await apiFetchJson("/api/v1/notifications/read-all", { method: "POST" });
      setNotifications([]);
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to mark all notifications as read");
    }
  }

  async function handleNotifClick(n: Notification) {
    if (!n.is_read) await markRead(n.id);
    setOpen(false);
    if (n.request_id) router.push(`/dashboard/requests?highlight=${n.request_id}`);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center size-9 rounded-full hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        {unreadCount > 0 ? (
          <Bell className="size-4.5" />
        ) : (
          <Bell className="size-4.5 text-muted-foreground" />
        )}
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 max-h-[70vh] flex flex-col rounded-xl border bg-popover shadow-md z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <span className="text-sm font-semibold">
              Notifications {unreadCount > 0 && <span className="text-destructive">({unreadCount})</span>}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <BellOff className="size-8 opacity-30" />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b last:border-0 hover:bg-muted/60 transition-colors",
                    !n.is_read && "bg-accent"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("text-sm leading-snug", !n.is_read && "font-semibold")}>{n.title}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{fmtAge(n.created_at)}</span>
                  </div>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                  {!n.is_read && <span className="inline-block mt-1 size-1.5 rounded-full bg-primary" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── UserMenu ──────────────────────────────────────────────────────────────────

function UserMenu({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const deptCodes = user.department_codes ?? [];
  const deptNames = user.department_names ?? [];
  const isAdminRole = user.role === "admin" || user.role === "super_admin";
  const deptDisplay = deptCodes.length > 0
    ? deptCodes.map((code, i) => deptNames[i] ? `${code} — ${deptNames[i]}` : code).join(", ")
    : isAdminRole ? roleLabel(user.role) : "—";
  const invCount =
    user.inventory_access.length === 0
      ? ALL_INVENTORY_TYPES.length
      : user.inventory_access.length;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function handleSignOut() {
    await apiLogout();
    router.push("/login");
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
        aria-label="User menu"
      >
        <UserAvatar username={user.username} photoBase64={user.photo_base64} />
        <span className="text-sm font-medium max-w-[120px] truncate">{user.username}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border bg-popover shadow-md z-50 overflow-hidden">
          {/* Profile header */}
          <div className="flex flex-col items-center gap-3 px-4 py-4 border-b bg-muted/30">
            <UserAvatar username={user.username} photoBase64={user.photo_base64} size="lg" />
            <div className="text-center">
              <p className="text-sm font-semibold leading-tight">{user.username}</p>
              <p className="text-xs font-bold text-primary mt-1 tracking-wide">
                {roleLabel(user.role)}
              </p>
            </div>
            <div className="w-full rounded-lg bg-background/70 border divide-y text-xs">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-muted-foreground">Department</span>
                <span className="font-mono font-semibold text-foreground">
                  {deptDisplay}
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-muted-foreground">Inventory access</span>
                <span className="font-semibold text-foreground">{invCount}</span>
              </div>
            </div>
          </div>
          {/* Sign out */}
          <div className="py-1">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────

export function TopBar() {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(getCurrentUser());
  }, []);

  // Fixed overlay — no separate bar row; sits visually on the same h-16 line
  // as each page's own header without consuming layout space.
  return (
    <div className="hidden md:flex fixed top-0 right-0 h-16 items-center gap-2 px-4 z-20 pointer-events-none">
      <div className="flex items-center gap-2 pointer-events-auto">
        <NotificationBell />
        {user && <UserMenu user={user} />}
      </div>
    </div>
  );
}

