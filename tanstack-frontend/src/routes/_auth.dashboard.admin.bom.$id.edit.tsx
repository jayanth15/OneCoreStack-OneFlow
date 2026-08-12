import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetchJson } from "@/lib/api"
import { getCurrentUser } from "@/lib/user"

interface InventoryItem { id: number; code: string; name: string; unit: string; item_type?: string }
interface PaginatedInventory { items: InventoryItem[] }
interface BomDetail {
  id: number; product_name: string; raw_material_id: number
  qty_per_unit: number; material_used: number | null; scrap: number | null; material_unit_id: number | null; notes: string | null; is_active: boolean
}

export const Route = createFileRoute("/_auth/dashboard/admin/bom/$id/edit")({
  component: EditBomPage,
})

// Widens a literal path to `string` for routes not yet registered in the tree.
const dynTo = (s: string) => s

const FG_URL = "/api/v1/inventory?item_type=finished_good&page_size=500&include_inactive=false"
const RM_URL = "/api/v1/inventory?item_type=raw_material&page_size=500&include_inactive=false"
const SFG_URL = "/api/v1/inventory?item_type=semi_finished&page_size=500&include_inactive=false"

interface BomFormState {
  product_name: string
  raw_material_id: string
  qty_per_unit: number
  material_used: string
  scrap: string
  material_unit_id: string
  notes: string
  is_active: boolean
}

function EditBomPage() {
  const { id } = Route.useParams()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<BomFormState>({
    product_name: "", raw_material_id: "", qty_per_unit: 1, material_used: "", scrap: "", material_unit_id: "", notes: "", is_active: true,
  })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const user = getCurrentUser()
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      navigate({ href: "/dashboard", replace: true })
    }
  }, [navigate])

  const detailQuery = useQuery({
    queryKey: [`/api/v1/bom/${id}`],
    staleTime: 0,
  })
  const finishedGoodsQuery = useQuery({
    queryKey: [FG_URL],
    staleTime: 5 * 60_000,
  })
  const rawMaterialsQuery = useQuery({
    queryKey: [RM_URL],
    staleTime: 5 * 60_000,
  })
  const semiFinishedQuery = useQuery({
    queryKey: [SFG_URL],
    staleTime: 5 * 60_000,
  })
  const unitsQuery = useQuery({
    queryKey: ["/api/v1/units"],
    staleTime: 5 * 60_000,
  })

  const finishedGoods = (finishedGoodsQuery.data as PaginatedInventory | undefined)?.items ?? []
  const rawMaterials = (rawMaterialsQuery.data as PaginatedInventory | undefined)?.items ?? []
  const semiFinished = (semiFinishedQuery.data as PaginatedInventory | undefined)?.items ?? []
  const allRawMaterials = [...rawMaterials, ...semiFinished]
  const units = (unitsQuery.data as { id: number; name: string }[] | undefined) ?? []
  const loading = detailQuery.isLoading || detailQuery.isFetching
  const d = detailQuery.data as BomDetail | undefined

  // Initialise form from the loaded line (form mounts only once loaded)
  useEffect(() => {
    if (!d || form.product_name !== "") return
    setForm({
      product_name: d.product_name,
      raw_material_id: String(d.raw_material_id),
      qty_per_unit: d.qty_per_unit,
      material_used: d.material_used != null ? String(d.material_used) : "",
      scrap: d.scrap != null ? String(d.scrap) : "",
      material_unit_id: d.material_unit_id != null ? String(d.material_unit_id) : "",
      notes: d.notes ?? "",
      is_active: d.is_active,
    })
  }, [d, form.product_name])

  useEffect(() => {
    if (detailQuery.error) {
      setLoadError(detailQuery.error instanceof Error ? detailQuery.error.message : "Not found")
    }
  }, [detailQuery.error])

  function set(key: keyof BomFormState, val: string | number | boolean) { setForm((f) => ({ ...f, [key]: val })) }

  const saveMutation = useMutation({
    mutationFn: () => apiFetchJson(`/api/v1/bom/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        product_name: form.product_name.trim(),
        raw_material_id: parseInt(form.raw_material_id),
        qty_per_unit: form.qty_per_unit,
        material_used: form.material_used !== "" ? parseFloat(String(form.material_used)) : null,
        scrap: form.scrap !== "" ? parseFloat(String(form.scrap)) : null,
        material_unit_id: form.material_unit_id ? parseInt(form.material_unit_id) : null,
        notes: form.notes || null,
        is_active: form.is_active,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/bom"] })
      navigate({ href: dynTo("/dashboard/admin/bom") })
    },
    onError: (e: unknown) => {
      setSaveError(e instanceof Error ? e.message : "Save failed")
    },
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.product_name.trim()) { setSaveError("Product name is required"); return }
    if (!form.raw_material_id) { setSaveError("Select a raw material"); return }
    if (form.qty_per_unit <= 0) { setSaveError("Qty per unit must be > 0"); return }
    setSaveError(null)
    saveMutation.mutate()
  }

  const saving = saveMutation.isPending
  const selectedRM = allRawMaterials.find((r) => String(r.id) === form.raw_material_id)

  return (
    <>
      <PageHeader
        title="Edit BOM Line"
        breadcrumbs={[
          { label: "BOM", href: dynTo("/dashboard/admin/bom") },
          { label: "Edit BOM Line" },
        ]}
      />
      <div className="p-4 md:p-8 max-w-lg mx-auto">
        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : loading ? (
          <div className="space-y-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="product_name">Finished Good (Product) <span className="text-destructive">*</span></Label>
              <select
                id="product_name"
                value={form.product_name}
                onChange={(e) => set("product_name", e.target.value)}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select finished good —</option>
                {/* Keep current value selectable even if not in FG list */}
                {form.product_name && !finishedGoods.some((fg) => fg.name === form.product_name) && (
                  <option value={form.product_name}>{form.product_name} (current)</option>
                )}
                {finishedGoods.map((fg) => (
                  <option key={fg.id} value={fg.name}>{fg.name} ({fg.code})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raw_material_id">Raw Material / Semi-finished <span className="text-destructive">*</span></Label>
              <select id="raw_material_id" value={form.raw_material_id} onChange={(e) => set("raw_material_id", e.target.value)} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select —</option>
                {allRawMaterials.map((rm) => (
                  <option key={rm.id} value={String(rm.id)}>
                    {rm.name} ({rm.code}) [{rm.item_type === "raw_material" ? "RM" : "SFG"}]
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qty_per_unit">
                Qty per Unit{selectedRM ? ` (${selectedRM.unit})` : ""} <span className="text-destructive">*</span>
              </Label>
              <Input id="qty_per_unit" type="number" inputMode="decimal" min="0.001" step="any"
                value={form.qty_per_unit}
                onChange={(e) => set("qty_per_unit", parseFloat(e.target.value) || 0)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="material_used">
                Material Used per Unit{selectedRM ? ` (${selectedRM.unit})` : ""} <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input id="material_used" type="number" inputMode="decimal" min="0" step="any" placeholder="e.g. 1.05"
                value={form.material_used}
                onChange={(e) => set("material_used", e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scrap">
                Scrap per Unit{selectedRM ? ` (${selectedRM.unit})` : ""} <span className="text-xs text-muted-foreground">(optional — auto-recorded to Scraps inventory)</span>
              </Label>
              <Input id="scrap" type="number" inputMode="decimal" min="0" step="any" placeholder="e.g. 0.05"
                value={form.scrap}
                onChange={(e) => set("scrap", e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="material_unit_id">Unit for Material Used / Scrap <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <select id="material_unit_id" value={form.material_unit_id} onChange={(e) => set("material_unit_id", e.target.value)} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select unit —</option>
                {units.map((u) => (
                  <option key={u.id} value={String(u.id)}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="is_active">Status</Label>
              <select id="is_active" value={form.is_active ? "true" : "false"}
                onChange={(e) => set("is_active", e.target.value === "true")} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate({ href: dynTo("/dashboard/admin/bom") })} disabled={saving}>Cancel</Button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
