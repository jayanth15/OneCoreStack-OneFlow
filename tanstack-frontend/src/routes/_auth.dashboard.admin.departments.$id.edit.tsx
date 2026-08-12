import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetchJson } from "@/lib/api"
import { getCurrentUser } from "@/lib/user"

export const Route = createFileRoute("/_auth/dashboard/admin/departments/$id/edit")({
  component: EditDepartmentPage,
})

interface DeptForm {
  code: string
  name: string
  description: string
  is_active: boolean
  handles_customer_dispatch: boolean
}

function EditDepartmentPage() {
  const navigate = Route.useNavigate()
  const { id } = Route.useParams()

  useEffect(() => {
    const user = getCurrentUser()
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      navigate({ href: "/dashboard", replace: true })
    }
     
  }, [])

  const [form, setForm] = useState<DeptForm>({
    code: "",
    name: "",
    description: "",
    is_active: true,
    handles_customer_dispatch: false,
  })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: [`/api/v1/admin/departments/${id}`],
    staleTime: 0,
    retry: false,
  })

  useEffect(() => {
    if (detailQuery.isLoading) return
    if (detailQuery.error) {
      setLoadError(detailQuery.error instanceof Error ? detailQuery.error.message : "Not found")
      setLoading(false)
      return
    }
    const data = detailQuery.data as (DeptForm & { id: number; description: string | null }) | undefined
    if (!data) return
    setForm({
      code: data.code,
      name: data.name,
      description: data.description ?? "",
      is_active: data.is_active,
      handles_customer_dispatch: data.handles_customer_dispatch ?? false,
    })
    setLoading(false)
  }, [detailQuery.data, detailQuery.error, detailQuery.isLoading])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.code.trim() || !form.name.trim()) {
      setSaveError("Code and Name are required")
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await apiFetchJson(`/api/v1/admin/departments/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          description: form.description.trim() || null,
        }),
      })
      navigate({ href: "/dashboard/admin/departments" })
    } catch (err: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Edit Department"
        description={!loading ? `Editing ${form.code}` : undefined}
        breadcrumbs={[
          { label: "Departments", href: "/dashboard/admin/departments" },
          { label: loading ? "Edit…" : `Edit ${form.code}` },
        ]}
      />

      <div className="p-4 md:p-8 max-w-lg mx-auto">

        {loadError ? (
          <p className="text-sm text-destructive" role="alert">{loadError}</p>
        ) : loading ? (
          <div className="space-y-5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-1/2" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="dept-code">Code</Label>
              <Input
                id="dept-code"
                placeholder="e.g. PROD"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                disabled={saving}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">Auto-uppercased.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dept-name">Name</Label>
              <Input
                id="dept-name"
                placeholder="e.g. Production"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dept-desc">Description</Label>
              <Input
                id="dept-desc"
                placeholder="e.g. Handles all manufacturing operations"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">Optional — brief purpose of this department.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dept-status">Status</Label>
              <select
                id="dept-status"
                value={form.is_active ? "active" : "inactive"}
                onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.handles_customer_dispatch}
                  onChange={(e) => setForm({ ...form, handles_customer_dispatch: e.target.checked })}
                  disabled={saving}
                  className="mt-0.5 size-4 rounded"
                />
                <span>
                  <span className="text-sm font-medium leading-none">Handles customer dispatch requests</span>
                  <span className="block text-xs text-muted-foreground mt-1">
                    Users in this department can view and fulfil customer dispatch requests.
                  </span>
                </span>
              </label>
            </div>

            {saveError && (
              <p className="text-sm text-destructive" role="alert">{saveError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ href: "/dashboard/admin/departments" })}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
