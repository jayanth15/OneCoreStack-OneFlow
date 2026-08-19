import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetchJson } from "@/lib/api"
import { getCurrentUser } from "@/lib/user"
import { PlusIcon, Pencil, Trash2, Users } from "lucide-react"

export const Route = createFileRoute("/_auth/dashboard/admin/departments/")({
  component: DepartmentsPage,
})

// Widens a literal path to `string` for routes not yet registered in the tree.
const dynTo = (s: string) => s

interface Department {
  id: number
  code: string
  name: string
  description: string | null
  is_active: boolean
  handles_customer_dispatch: boolean
  user_count: number
}

function DepartmentsPage() {
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    const user = getCurrentUser()
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      navigate({ href: "/dashboard", replace: true })
    }
     
  }, [])

  const [showInactive, setShowInactive] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const listUrl = `/api/v1/admin/departments?include_inactive=${showInactive}`

  const listQuery = useQuery({
    queryKey: [listUrl],
    staleTime: 0,
  })

  const depts = (listQuery.data as Department[] | undefined) ?? []
  const loading = listQuery.isLoading || listQuery.isFetching
  const error = listQuery.error instanceof Error ? listQuery.error.message : null

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/v1/admin/departments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ["/api/v1/admin/departments"] })
    },
    onError: (e: unknown) => {
      setErrorMsg(e instanceof Error ? e.message : "Delete failed")
    },
  })

  const displayError = error ?? errorMsg

  const deleteDept = depts.find((d) => d.id === deleteId)
  const activeDepts = depts.filter((d) => d.is_active).length
  const totalUsers = depts.reduce((sum, d) => sum + d.user_count, 0)

  return (
    <>
      <PageHeader
        title="Departments"
        description="Manage organizational departments. Users can belong to multiple departments."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Departments" },
        ]}
        actions={
          <>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="size-3.5 rounded"
              />
              Show inactive
            </label>
            <Button size="sm" onClick={() => navigate({ href: "/dashboard/admin/departments/new" })}>
              <PlusIcon className="size-4 mr-1" />
              Add Department
            </Button>
          </>
        }
      />

      <div className="p-4 md:p-6 space-y-4">

        {/* ── Summary Cards ──────────────────────────────────────────────── */}
        {!loading && depts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Total Departments</p>
              <p className="text-lg font-semibold">{depts.length}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-lg font-semibold text-success">{activeDepts}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Total Users Assigned</p>
              <p className="text-lg font-semibold">{totalUsers}</p>
            </div>
          </div>
        )}

        {displayError && <p className="text-sm text-destructive" role="alert">{displayError}</p>}

        {/* ── Mobile cards ──────────────────────────────────────────────── */}
        <div className="md:hidden space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4"><Skeleton className="h-20 w-full" /></div>
            ))
          ) : depts.length === 0 ? (
            <div className="rounded-lg border px-4 py-12 text-center text-muted-foreground text-sm">
              No departments yet. Click &quot;Add Department&quot; to create one.
            </div>
          ) : (
            depts.map((dept) => (
              <div key={dept.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{dept.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{dept.code}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {dept.handles_customer_dispatch && (
                      <Badge variant="default">Dispatch</Badge>
                    )}
                    <Badge variant={dept.is_active ? "default" : "secondary"}>
                      {dept.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
                {dept.description && <p className="text-xs text-muted-foreground line-clamp-2">{dept.description}</p>}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />{dept.user_count} user{dept.user_count !== 1 ? "s" : ""}
                  </span>
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="icon" className="size-8"
                      onClick={() => navigate({ href: dynTo(`/dashboard/admin/departments/${dept.id}/edit`) })} title="Edit">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(dept.id)} title="Deactivate" disabled={!dept.is_active}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
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
                <th className="px-4 py-3 text-left font-medium">Code</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Description</th>
                <th className="px-4 py-3 text-center font-medium">Users</th>
                <th className="px-4 py-3 text-left font-medium">Customer Dispatch</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-36" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-44" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-8 mx-auto" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-7 w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : depts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No departments yet. Click &quot;Add Department&quot; to create one.
                  </td>
                </tr>
              ) : (
                depts.map((dept) => (
                  <tr key={dept.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-xs">
                      {dept.code}
                    </td>
                    <td className="px-4 py-3 font-medium">{dept.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">
                      {dept.description || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="size-3" />
                        {dept.user_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={dept.handles_customer_dispatch ? "default" : "secondary"}>
                        {dept.handles_customer_dispatch ? "Handles" : "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={dept.is_active ? "default" : "secondary"}>
                        {dept.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => navigate({ href: dynTo(`/dashboard/admin/departments/${dept.id}/edit`) })}
                          title="Edit"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(dept.id)}
                          title="Deactivate"
                          disabled={!dept.is_active}
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
          {!loading && `${depts.length} department${depts.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* ── Delete Confirmation Dialog ─────────────────────────────────── */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate department?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark <strong>{deleteDept?.name ?? "this department"}</strong> as inactive.
              It will no longer appear in lists but existing records are kept.
              {(deleteDept?.user_count ?? 0) > 0 && (
                <span className="block mt-1 text-warning">
                  This department has {deleteDept?.user_count} user{deleteDept?.user_count !== 1 ? "s" : ""} assigned.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteId!)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deactivating…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
