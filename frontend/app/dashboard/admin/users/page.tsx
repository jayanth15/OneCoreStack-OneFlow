"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbLink,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/user";
import { PlusIcon, Pencil, Trash2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeptRef {
  id: number;
  code: string;
  name: string;
}

interface User {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  departments: DeptRef[];
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  worker: "Worker",
};

const ROLE_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  super_admin: "default",
  admin: "default",
  manager: "secondary",
  worker: "outline",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) router.replace("/dashboard");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson<User[]>(
        `/api/v1/admin/users?include_inactive=${showInactive}`
      );
      setUsers(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  async function handleDelete() {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/admin/users/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/admin/departments">Admin</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Users</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Users</h1>
            <p className="text-sm text-muted-foreground">
              Manage system users and their department assignments.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="size-3.5 rounded"
              />
              Show inactive
            </label>
            <Button size="sm" onClick={() => router.push("/dashboard/admin/users/new")}>
              <PlusIcon className="size-4 mr-1" />
              Add User
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {/* ── Mobile cards ──────────────────────────────────────────────── */}
        <div className="md:hidden space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4"><Skeleton className="h-20 w-full" /></div>
            ))
          ) : users.length === 0 ? (
            <div className="rounded-lg border px-4 py-12 text-center text-muted-foreground text-sm">
              No users yet. Click &quot;Add User&quot; to create one.
            </div>
          ) : (
            users.map((user) => (
              <div key={user.id} className="rounded-lg border p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{user.username}</p>
                  <Badge variant={user.is_active ? "default" : "secondary"} className="shrink-0">
                    {user.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={ROLE_BADGE_VARIANT[user.role] ?? "outline"}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Badge>
                  {user.departments.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {user.departments.map((d) => (
                        <Badge key={d.id} variant="outline" className="font-mono text-xs px-1.5">{d.code}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-1 pt-1 border-t">
                  <Button variant="ghost" size="icon" className="size-8"
                    onClick={() => router.push(`/dashboard/admin/users/${user.id}/edit`)} title="Edit">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(user.id)} title="Deactivate">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Table (desktop) ────────────────────────────────────────────── */}
        <div className="hidden md:block rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium">Username</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Departments</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-7 w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No users yet. Click &quot;Add User&quot; to create one.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{user.username}</td>
                    <td className="px-4 py-3">
                      <Badge variant={ROLE_BADGE_VARIANT[user.role] ?? "outline"}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {user.departments.length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {user.departments.map((d) => (
                            <Badge key={d.id} variant="outline" className="font-mono text-xs px-1.5">
                              {d.code}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={user.is_active ? "default" : "secondary"}>
                        {user.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => router.push(`/dashboard/admin/users/${user.id}/edit`)}
                          title="Edit"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(user.id)}
                          title="Deactivate"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          {!loading && `${users.length} user${users.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the user as inactive. They will not be able to log in
              but their records are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deactivating…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
