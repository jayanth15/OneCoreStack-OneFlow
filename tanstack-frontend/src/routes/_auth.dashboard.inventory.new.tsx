import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { PageHeader } from "@/components/layout/page-header"
import { ItemForm, BLANK_ITEM_FORM, TYPE_LABELS } from "@/components/inventory/item-form"
import { apiFetchJson } from "@/lib/api"
import { isAdminOrAbove } from "@/lib/user"
import { AlertTriangle } from "lucide-react"

const VALID_TYPES = ["raw_material", "finished_good", "semi_finished"] as const
type ItemType = (typeof VALID_TYPES)[number]

const TYPE_PAGES: Record<ItemType, string> = {
  raw_material: "/dashboard/inventory/raw-materials",
  finished_good: "/dashboard/inventory/finished-goods",
  semi_finished: "/dashboard/inventory/semi-finished",
}

export const Route = createFileRoute("/_auth/dashboard/inventory/new")({
  validateSearch: z.object({
    type: z.string().optional(),
  }),
  component: NewInventoryPage,
})

function NewInventoryPage() {
  const navigate = Route.useNavigate()
  const { type: typeParam } = Route.useSearch()
  const lockedType: ItemType | null = VALID_TYPES.includes(typeParam as ItemType)
    ? (typeParam as ItemType)
    : null

  const [form, setForm] = useState(() => ({
    ...BLANK_ITEM_FORM,
    item_type: lockedType ?? BLANK_ITEM_FORM.item_type,
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [admin] = useState(() => isAdminOrAbove())

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

  function setField(key: string, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  async function handleSave(payload: { imageBase64: string | null; imageChanged: boolean }) {
    setSaving(true)
    setError(null)
    try {
      await apiFetchJson("/api/v1/inventory", {
        method: "POST",
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          item_type: form.item_type,
          unit_id: form.unit_id,
          quantity_on_hand: form.quantity_on_hand,
          reorder_level: form.reorder_level,
          storage_type: form.storage_type || null,
          storage_location: form.storage_location || null,
          rate: admin && form.rate !== "" ? parseFloat(form.rate) : null,
          timeline_days: form.timeline_days !== "" ? parseInt(form.timeline_days) : null,
          image_base64: payload.imageBase64,
          weight_value: form.weight_value !== "" ? parseFloat(form.weight_value) : null,
          weight_unit_id: form.weight_unit_id || null,
          vendor_name: form.vendor_name.trim() || null,
          is_active: form.is_active,
        }),
      })
      navigate({ href: lockedType ? TYPE_PAGES[lockedType] : "/dashboard/inventory" })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Add Inventory Item"
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          ...(lockedType ? [{ label: TYPE_LABELS[lockedType], href: TYPE_PAGES[lockedType] }] : []),
          { label: "New Item" },
        ]}
      />

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Add Inventory Item</h1>
        </div>
        {units.length === 0 ? (
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-6 text-center space-y-2">
            <AlertTriangle className="size-8 mx-auto text-warning" />
            <p className="text-sm font-medium">No units configured</p>
            <p className="text-xs text-muted-foreground">
              Please add units in{" "}
              <a href="/dashboard/admin/settings" className="text-primary underline">Settings → Units</a>{" "}
              before creating inventory items.
            </p>
          </div>
        ) : (
          <ItemForm
            form={form}
            setField={setField}
            lockedType={lockedType}
            units={units}
            vendors={vendors}
            admin={admin}
            saving={saving}
            error={error}
            setError={setError}
            autoFocusCode
            onSubmit={handleSave}
            onCancel={() => navigate({ href: lockedType ? TYPE_PAGES[lockedType] : "/dashboard/inventory" })}
          />
        )}
      </div>
    </>
  )
}
