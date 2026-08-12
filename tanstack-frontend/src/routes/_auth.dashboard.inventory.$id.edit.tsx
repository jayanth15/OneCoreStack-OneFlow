import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { ItemForm, BLANK_ITEM_FORM } from "@/components/inventory/item-form"
import { apiFetchJson } from "@/lib/api"
import { isAdminOrAbove } from "@/lib/user"
import { AlertTriangle } from "lucide-react"

interface ItemDetail {
  id: number
  code: string
  name: string
  item_type: string
  unit_id: number | null
  quantity_on_hand: number
  reorder_level: number
  storage_type: string | null
  storage_location: string | null
  rate: number | null
  timeline_days: number | null
  image_base64: string | null
  vendor_name: string | null
  is_active: boolean
  weight_value: number | null
  weight_unit_id: number | null
}

export const Route = createFileRoute("/_auth/dashboard/inventory/$id/edit")({
  component: EditInventoryPage,
})

function EditInventoryPage() {
  const { id } = Route.useParams()
  const navigate = Route.useNavigate()

  const [form, setForm] = useState<typeof BLANK_ITEM_FORM>(BLANK_ITEM_FORM)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [admin] = useState(() => isAdminOrAbove())

  const detailQuery = useQuery({
    queryKey: [`/api/v1/inventory/${id}`],
    staleTime: 0,
  })

  const unitsQuery = useQuery({
    queryKey: ["/api/v1/units"],
    staleTime: 5 * 60_000,
  })
  const vendorsQuery = useQuery({
    queryKey: ["/api/v1/vendors/names"],
    staleTime: 5 * 60_000,
  })

  const units = (unitsQuery.data as { id: number; name: string }[] | undefined) ?? []
  const vendors = (vendorsQuery.data as { id: number | null; name: string }[] | undefined) ?? []
  const loading = detailQuery.isLoading || detailQuery.isFetching
  const d = detailQuery.data as ItemDetail | undefined

  // Initialise form from the loaded item (form mounts only once loaded)
  useEffect(() => {
    if (!d || form.code !== "") return
    setForm({
      code: d.code,
      name: d.name,
      item_type: d.item_type,
      unit_id: d.unit_id,
      quantity_on_hand: d.quantity_on_hand,
      reorder_level: d.reorder_level,
      storage_type: d.storage_type ?? "",
      storage_location: d.storage_location ?? "",
      rate: d.rate != null ? String(d.rate) : "",
      timeline_days: d.timeline_days != null ? String(d.timeline_days) : "",
      weight_value: d.weight_value != null ? String(d.weight_value) : "",
      weight_unit_id: d.weight_unit_id,
      vendor_name: d.vendor_name ?? "",
      is_active: d.is_active,
    })
  }, [d, form.code])

  useEffect(() => {
    if (detailQuery.error) {
      setLoadError(detailQuery.error instanceof Error ? detailQuery.error.message : "Not found")
    }
  }, [detailQuery.error])

  function setField(key: string, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  async function handleSave(payload: { imageBase64: string | null; imageChanged: boolean }) {
    setSaving(true)
    setSaveError(null)
    try {
      const body: Record<string, unknown> = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        item_type: form.item_type,
        unit_id: form.unit_id,
        quantity_on_hand: form.quantity_on_hand,
        reorder_level: form.reorder_level,
        storage_type: form.storage_type || null,
        storage_location: form.storage_location || null,
        is_active: form.is_active,
      }
      if (admin && form.rate !== "") body.rate = parseFloat(form.rate)
      if (form.timeline_days !== "") body.timeline_days = parseInt(form.timeline_days)
      body.weight_value = form.weight_value !== "" ? parseFloat(form.weight_value) : null
      body.weight_unit_id = form.weight_unit_id || null
      body.vendor_name = form.vendor_name.trim() || null
      if (payload.imageChanged) body.image_base64 = payload.imageBase64
      await apiFetchJson(`/api/v1/inventory/${id}`, { method: "PUT", body: JSON.stringify(body) })
      navigate({ href: "/dashboard/inventory" })
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Edit Inventory Item"
        description={!loading ? form.code : undefined}
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: loading ? "Edit…" : `Edit ${form.code}` },
        ]}
      />

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Edit Inventory Item</h1>
          {!loading && <p className="text-sm text-muted-foreground mt-1 font-mono">{form.code}</p>}
        </div>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : loading ? (
          <div className="space-y-5">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : units.length === 0 ? (
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-6 text-center space-y-2">
            <AlertTriangle className="size-8 mx-auto text-warning" />
            <p className="text-sm font-medium">No units configured</p>
            <p className="text-xs text-muted-foreground">
              Please add units in{" "}
              <a href="/dashboard/settings/units" className="text-primary underline">Settings → Units</a>{" "}
              before editing inventory items.
            </p>
          </div>
        ) : (
          <ItemForm
            form={form}
            setField={setField}
            lockedType={null}
            units={units}
            vendors={vendors}
            admin={admin}
            saving={saving}
            error={saveError}
            setError={setSaveError}
            initialImage={d?.image_base64 ?? null}
            onSubmit={handleSave}
            onCancel={() => navigate({ href: "/dashboard/inventory" })}
          />
        )}
      </div>
    </>
  )
}
