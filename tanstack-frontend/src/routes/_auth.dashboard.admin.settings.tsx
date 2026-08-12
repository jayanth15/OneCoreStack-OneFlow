import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiFetchJson } from "@/lib/api"
import { getAccessToken } from "@/lib/auth"
import { getCurrentUser } from "@/lib/user"
import {
  Building2, Download, Save, CheckCircle2, AlertCircle,
  Pencil, Trash2, Loader2, Plus, X, Check,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompanyInfo {
  company_name: string
  company_address: string
  company_phone: string
  company_email: string
  company_gstin: string
  company_website: string
  company_logo_url: string
  company_city: string
  company_state: string
  company_country: string
  company_pincode: string
}

interface UnitItem {
  id: number
  name: string
  is_active: boolean
  created_at: string
}

const BLANK: CompanyInfo = {
  company_name: "",
  company_address: "",
  company_phone: "",
  company_email: "",
  company_gstin: "",
  company_website: "",
  company_logo_url: "",
  company_city: "",
  company_state: "",
  company_country: "",
  company_pincode: "",
}

export const Route = createFileRoute("/_auth/dashboard/admin/settings")({
  component: SettingsPage,
})

// ── Page ──────────────────────────────────────────────────────────────────────

function SettingsPage() {
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    const user = getCurrentUser()
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      navigate({ href: "/dashboard", replace: true })
    }
  }, [navigate])

  // ── Tabs ────────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState("company")

  // ── Company Info ─────────────────────────────────────────────────────────

  const [form, setForm] = useState<CompanyInfo>(BLANK)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "error">("idle")
  const [saveError, setSaveError] = useState<string | null>(null)

  const companyQuery = useQuery({
    queryKey: ["/api/v1/settings/company"],
    staleTime: 0,
  })

  const d = companyQuery.data as CompanyInfo | undefined
  const loading = companyQuery.isLoading || companyQuery.isFetching

  // Initialise form from the loaded settings (form mounts only once loaded)
  useEffect(() => {
    if (!d || form.company_name !== "") return
    setForm(d)
  }, [d, form.company_name])

  useEffect(() => {
    if (companyQuery.error) {
      setLoadError(companyQuery.error instanceof Error ? companyQuery.error.message : "Failed to load settings")
    }
  }, [companyQuery.error])

  function set(key: keyof CompanyInfo, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaveStatus("idle")
  }

  const saveMutation = useMutation({
    mutationFn: () => apiFetchJson<CompanyInfo>("/api/v1/settings/company", {
      method: "PUT",
      body: JSON.stringify(form),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/settings"] })
      setSaveStatus("ok")
    },
    onError: (err: unknown) => {
      setSaveStatus("error")
      setSaveError(err instanceof Error ? err.message : "Save failed")
    },
  })

  const saving = saveMutation.isPending

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveStatus("idle")
    setSaveError(null)
    saveMutation.mutate()
  }

  // ── Backup ───────────────────────────────────────────────────────────────

  const [backingUp, setBackingUp] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)

  async function handleBackup() {
    setBackingUp(true)
    setBackupError(null)
    try {
      const token = getAccessToken()
      const res = await fetch("/api/v1/settings/backup", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { detail?: string })?.detail ?? "Backup failed")
      }
      const disposition = res.headers.get("Content-Disposition") ?? ""
      const match = disposition.match(/filename="?([^";\n]+)"?/)
      const filename = match?.[1] ?? "oneflow_backup.db"

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setBackupError(err instanceof Error ? err.message : "Backup failed")
    } finally {
      setBackingUp(false)
    }
  }

  // ── Units ────────────────────────────────────────────────────────────────

  const unitsQuery = useQuery({
    queryKey: ["/api/v1/units?include_inactive=true"],
    staleTime: 0,
  })
  const [newUnitName, setNewUnitName] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const [usageData, setUsageData] = useState<Record<number, { total: number; by_table: Record<string, number> }>>({})
  const [deleteError, setDeleteError] = useState("")

  const units = (unitsQuery.data as UnitItem[] | undefined) ?? []
  const unitsLoading = unitsQuery.isLoading || unitsQuery.isFetching

  const addUnitMutation = useMutation({
    mutationFn: (name: string) => apiFetchJson("/api/v1/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
    onSuccess: () => {
      setNewUnitName("")
      queryClient.invalidateQueries({ queryKey: ["/api/v1/units"] })
    },
    onError: (e: unknown) => {
      setDeleteError(e instanceof Error ? e.message : "Failed to add unit")
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => apiFetchJson(`/api/v1/units/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
    onSuccess: () => {
      setEditingId(null)
      queryClient.invalidateQueries({ queryKey: ["/api/v1/units"] })
    },
    onError: (e: unknown) => {
      setDeleteError(e instanceof Error ? e.message : "Rename failed")
    },
  })

  const deleteUnitMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/v1/units/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/units"] })
    },
    onError: (e: unknown) => {
      setDeleteError(e instanceof Error ? e.message : "Delete failed")
    },
  })

  const usageMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson<{ total: number; by_table: Record<string, number> }>(
      `/api/v1/units/${id}/usage-count`
    ),
    onSuccess: (data, id) => {
      setUsageData((prev) => ({ ...prev, [id]: data }))
    },
  })

  function handleAddUnit() {
    if (!newUnitName.trim()) return
    setDeleteError("")
    addUnitMutation.mutate(newUnitName.trim())
  }

  function handleRename(id: number) {
    if (!editName.trim()) return
    setDeleteError("")
    renameMutation.mutate({ id, name: editName.trim() })
  }

  async function checkUsage(id: number) {
    try {
      await usageMutation.mutateAsync(id)
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Usage check failed")
    }
  }

  async function handleDelete(id: number, name: string) {
    setDeleteError("")
    try {
      const usage = await usageMutation.mutateAsync(id)
      if (usage.total > 0) {
        setDeleteError(`Cannot delete "${name}" — in use by ${usage.total} items. Rename it instead.`)
        return
      }
      if (!confirm(`Delete unit "${name}"?`)) return
      deleteUnitMutation.mutate(id)
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed")
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title="Settings"
        description="System-wide configuration for your OneFlow installation."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings" },
        ]}
      />

      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-10">

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="company">Company Information</TabsTrigger>
            <TabsTrigger value="units">Units</TabsTrigger>
          </TabsList>

          {/* ── Company Information Tab ──────────────────────────────────── */}
          <TabsContent value="company" className="space-y-10">
            <section className="space-y-5">
              <div className="flex items-center gap-2 border-b pb-2">
                <Building2 className="size-5 text-muted-foreground" />
                <h2 className="text-base font-semibold">Company Information</h2>
              </div>

              {loadError && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  {loadError}
                </div>
              )}

              {loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : (
                <form onSubmit={handleSave} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="c-name">Company Name</Label>
                    <Input
                      id="c-name"
                      placeholder="Acme Manufacturing Pvt. Ltd."
                      value={form.company_name}
                      onChange={(e) => set("company_name", e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="c-address">Address</Label>
                    <Input
                      id="c-address"
                      placeholder="123, Industrial Area, Phase 1"
                      value={form.company_address}
                      onChange={(e) => set("company_address", e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="c-city">City</Label>
                      <Input
                        id="c-city"
                        placeholder="Pune"
                        value={form.company_city}
                        onChange={(e) => set("company_city", e.target.value)}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="c-state">State</Label>
                      <Input
                        id="c-state"
                        placeholder="Maharashtra"
                        value={form.company_state}
                        onChange={(e) => set("company_state", e.target.value)}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="c-country">Country</Label>
                      <Input
                        id="c-country"
                        placeholder="India"
                        value={form.company_country}
                        onChange={(e) => set("company_country", e.target.value)}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="c-pin">Pincode</Label>
                      <Input
                        id="c-pin"
                        placeholder="411001"
                        value={form.company_pincode}
                        onChange={(e) => set("company_pincode", e.target.value)}
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="c-phone">Phone</Label>
                      <Input
                        id="c-phone"
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={form.company_phone}
                        onChange={(e) => set("company_phone", e.target.value)}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="c-email">Email</Label>
                      <Input
                        id="c-email"
                        type="email"
                        placeholder="info@acme.com"
                        value={form.company_email}
                        onChange={(e) => set("company_email", e.target.value)}
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="c-website">Website</Label>
                      <Input
                        id="c-website"
                        type="url"
                        placeholder="https://acme.com"
                        value={form.company_website}
                        onChange={(e) => set("company_website", e.target.value)}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="c-gstin">GSTIN</Label>
                      <Input
                        id="c-gstin"
                        placeholder="27AAAAA0000A1Z5"
                        value={form.company_gstin}
                        onChange={(e) => set("company_gstin", e.target.value)}
                        disabled={saving}
                        className="font-mono uppercase"
                        maxLength={15}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="c-logo">Logo URL</Label>
                    <Input
                      id="c-logo"
                      type="url"
                      placeholder="https://acme.com/logo.png"
                      value={form.company_logo_url}
                      onChange={(e) => set("company_logo_url", e.target.value)}
                      disabled={saving}
                    />
                    {form.company_logo_url && (
                      <img
                        src={form.company_logo_url}
                        alt="Logo preview"
                        className="mt-2 h-16 object-contain rounded border p-1"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                      />
                    )}
                  </div>

                  {saveStatus === "ok" && (
                    <div className="flex items-center gap-2 text-sm text-success">
                      <CheckCircle2 className="size-4" />
                      Company information saved successfully.
                    </div>
                  )}
                  {saveStatus === "error" && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="size-4" />
                      {saveError ?? "Failed to save settings."}
                    </div>
                  )}

                  <Button type="submit" disabled={saving} className="gap-2">
                    <Save className="size-4" />
                    {saving ? "Saving…" : "Save Company Info"}
                  </Button>
                </form>
              )}
            </section>

            {/* ── Database Backup ────────────────────────────────────────── */}
            <section className="space-y-5">
              <div className="flex items-center gap-2 border-b pb-2">
                <Download className="size-5 text-muted-foreground" />
                <h2 className="text-base font-semibold">Database Backup</h2>
              </div>

              <div className="rounded-lg border p-5 space-y-4 bg-muted/30">
                <div>
                  <p className="text-sm font-medium">Download a backup copy of the database</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Creates a hot backup of the live SQLite database file using
                    the built-in SQLite backup API (safe on both Linux &amp; Windows
                    even while the app is running). The backup is downloaded directly
                    to your computer as a <code className="font-mono text-xs">.db</code> file.
                  </p>
                </div>
                {backupError && (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <AlertCircle className="size-4 shrink-0" />
                    {backupError}
                  </div>
                )}
                <Button
                  variant="outline"
                  disabled={backingUp}
                  onClick={handleBackup}
                  className="gap-2"
                >
                  <Download className="size-4" />
                  {backingUp ? "Creating backup…" : "Download Backup"}
                </Button>
              </div>
            </section>
          </TabsContent>

          {/* ── Units Tab ────────────────────────────────────────────────── */}
          <TabsContent value="units" className="space-y-5">
            <div className="flex items-center gap-2 border-b pb-2">
              <h2 className="text-base font-semibold">Units of Measurement</h2>
            </div>

            {deleteError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                {deleteError}
              </div>
            )}

            {/* Add Unit row */}
            <div className="flex items-center gap-3">
              <Input
                placeholder="e.g. kg, pcs, meters, liters"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddUnit() } }}
                className="max-w-xs"
              />
              <Button onClick={handleAddUnit} disabled={!newUnitName.trim()} className="gap-2">
                <Plus className="size-4" />
                Add Unit
              </Button>
            </div>

            {/* Units table */}
            {unitsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : units.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No units have been created yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">
                        {editingId === unit.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); handleRename(unit.id) }
                                if (e.key === "Escape") setEditingId(null)
                              }}
                              className="h-8 max-w-40"
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleRename(unit.id)}
                              disabled={!editName.trim()}
                            >
                              <Check className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        ) : (
                          <span>{unit.name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground cursor-pointer"
                          onClick={() => checkUsage(unit.id)}
                        >
                          {usageData[unit.id] !== undefined
                            ? `${usageData[unit.id].total} reference${usageData[unit.id].total === 1 ? "" : "s"}`
                            : "Check usage"}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(unit.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(unit.id)
                              setEditName(unit.name)
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(unit.id, unit.name)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
