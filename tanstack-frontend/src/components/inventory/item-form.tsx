import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ImagePlus, X } from "lucide-react"

const STORAGE_TYPES = ["Bin", "Tray", "Barrel", "Rack", "Shelf", "Box", "Pallet"]
const SFG_STORAGE_TYPES = ["Ganny Bag", "Barrel (Big)", "Barrel (Small)", "Floor", "Trolley", "Black Bin", "Small Bin", "Big Bin"]

export const TYPE_LABELS: Record<string, string> = {
  raw_material: "Raw Material",
  finished_good: "Finished Good",
  semi_finished: "Semi Finished",
}

export interface ItemFormState {
  code: string
  name: string
  item_type: string
  unit_id: number | null
  quantity_on_hand: number
  reorder_level: number
  storage_type: string
  storage_location: string
  rate: string
  timeline_days: string
  vendor_name: string
  is_active: boolean
  weight_value: string
  weight_unit_id: number | null
}

export const BLANK_ITEM_FORM: ItemFormState = {
  code: "",
  name: "",
  item_type: "raw_material",
  unit_id: null,
  quantity_on_hand: 0,
  reorder_level: 0,
  storage_type: "",
  storage_location: "",
  rate: "",
  timeline_days: "",
  vendor_name: "",
  is_active: true,
  weight_value: "",
  weight_unit_id: null,
}

interface ItemFormProps {
  form: ItemFormState
  setField: (key: string, val: unknown) => void
  lockedType: string | null
  units: { id: number; name: string }[]
  vendors: { id: number | null; name: string }[]
  admin: boolean
  saving: boolean
  error: string | null
  setError: (msg: string | null) => void
  autoFocusCode?: boolean
  /** Existing image to show on load (edit mode). */
  initialImage?: string | null
  /** Parent performs validation of the same fields and the API call. */
  onSubmit: (payload: { imageBase64: string | null; imageChanged: boolean }) => void
  onCancel: () => void
}

export function ItemForm({
  form,
  setField,
  lockedType,
  units,
  vendors,
  admin,
  saving,
  error,
  setError,
  autoFocusCode,
  initialImage,
  onSubmit,
  onCancel,
}: ItemFormProps) {
  const [isCustomStorage, setIsCustomStorage] = useState(false)
  const [imageBase64, setImageBase64] = useState<string | null>(() => initialImage ?? null)
  const [imagePreview, setImagePreview] = useState<string | null>(() => initialImage ?? null)
  const [imageChanged, setImageChanged] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocusCode) codeRef.current?.focus()
  }, [autoFocusCode])

  function set(key: string, val: unknown) {
    setField(key, val)
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setImageBase64(result)
      setImagePreview(result)
      setImageChanged(true)
    }
    reader.readAsDataURL(file)
  }

  function clearImage() {
    setImageBase64(null)
    setImagePreview(null)
    setImageChanged(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.code.trim()) { setError("Code is required"); return }
    if (!form.name.trim()) { setError("Name is required"); return }
    if (!form.unit_id) { setError("Unit is required"); return }
    setError(null)
    onSubmit({ imageBase64, imageChanged })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Code */}
      <div className="space-y-1.5">
        <Label htmlFor="code">Item Code <span className="text-destructive">*</span></Label>
        <Input id="code" ref={codeRef} placeholder="e.g. RM-001"
          value={form.code}
          onChange={(e) => set("code", e.target.value.toUpperCase())}
          disabled={saving}
        />
      </div>
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name">Name / Description <span className="text-destructive">*</span></Label>
        <Input id="name" placeholder="e.g. Steel Sheet 2mm"
          value={form.name} onChange={(e) => set("name", e.target.value)} disabled={saving}
        />
      </div>
      {/* Type */}
      {lockedType ? (
        <div className="space-y-1.5">
          <Label>Item Type</Label>
          <div className="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {TYPE_LABELS[lockedType]}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="item_type">Item Type</Label>
          <select id="item_type" value={form.item_type} onChange={(e) => set("item_type", e.target.value)} disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            <option value="raw_material">Raw Material</option>
            <option value="finished_good">Finished Good</option>
            <option value="semi_finished">Semi Finished</option>
          </select>
        </div>
      )}
      {/* Unit */}
      <div className="space-y-1.5">
        <Label htmlFor="unit_id">Unit of Measure <span className="text-destructive">*</span></Label>
        <select id="unit_id"
          value={form.unit_id ?? ""}
          onChange={(e) => set("unit_id", e.target.value ? Number(e.target.value) : null)}
          disabled={saving}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          <option value="">— Select —</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      {/* Weight */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="weight_value">Weight per unit</Label>
          <Input id="weight_value" type="number" inputMode="decimal" min="0" step="0.001"
            value={form.weight_value}
            onChange={(e) => set("weight_value", e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="weight_unit_id">Weight unit</Label>
          <select id="weight_unit_id" value={form.weight_unit_id ?? ""}
            onChange={(e) => set("weight_unit_id", e.target.value ? Number(e.target.value) : null)}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            <option value="">— None —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>
      {/* Qty + Reorder */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="qty">Opening Qty</Label>
          <Input id="qty" type="number" inputMode="decimal" min="0" step="any"
            value={form.quantity_on_hand}
            onChange={(e) => set("quantity_on_hand", parseFloat(e.target.value) || 0)}
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reorder">Reorder Level</Label>
          <Input id="reorder" type="number" inputMode="decimal" min="0" step="any"
            value={form.reorder_level}
            onChange={(e) => set("reorder_level", parseFloat(e.target.value) || 0)}
            disabled={saving}
          />
        </div>
      </div>
      {/* Storage */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="storage_type">Storage Type</Label>
          <select id="storage_type"
            value={isCustomStorage ? "__custom__" : form.storage_type}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setIsCustomStorage(true)
                set("storage_type", "")
              } else {
                setIsCustomStorage(false)
                set("storage_type", e.target.value)
              }
            }}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            <option value="">— None —</option>
            {(form.item_type === "semi_finished" ? SFG_STORAGE_TYPES : STORAGE_TYPES).map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="__custom__">Other…</option>
          </select>
          {isCustomStorage && (
            <Input placeholder="Enter storage type" value={form.storage_type}
              onChange={(e) => set("storage_type", e.target.value)} disabled={saving} className="mt-1.5" />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="storage_location">Storage Location</Label>
          <Input id="storage_location" placeholder="e.g. Shelf A-3"
            value={form.storage_location} onChange={(e) => set("storage_location", e.target.value)} disabled={saving}
          />
        </div>
      </div>
      {/* Rate (admin only) */}
      {admin && (
        <div className="space-y-1.5">
          <Label htmlFor="rate">Rate (₹ per unit)</Label>
          <Input id="rate" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
            value={form.rate} onChange={(e) => set("rate", e.target.value)} disabled={saving}
          />
        </div>
      )}
      {/* Timeline */}
      <div className="space-y-1.5">
        <Label htmlFor="timeline_days">Timeline (days)</Label>
        <Input id="timeline_days" type="number" inputMode="numeric" min="1" step="1" placeholder="e.g. 7"
          value={form.timeline_days}
          onChange={(e) => set("timeline_days", e.target.value)}
          disabled={saving}
        />
      </div>
      {/* Vendor (finished goods / semi-finished only) */}
      {(form.item_type === "finished_good" || form.item_type === "semi_finished") && (
        <div className="space-y-1.5">
          <Label htmlFor="vendor_name">Vendor</Label>
          <select
            id="vendor_name"
            value={form.vendor_name}
            onChange={(e) => set("vendor_name", e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            <option value="">— Select vendor —</option>
            {vendors.map((v) => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
        </div>
      )}
      {/* Item Photo */}
      <div className="space-y-1.5">
        <Label>Item Photo</Label>
        {imagePreview ? (
          <div className="relative w-32">
            <img src={imagePreview} alt="preview" className="w-32 h-32 object-cover rounded-md border" />
            <button type="button" onClick={clearImage}
              className="absolute -top-2 -right-2 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-muted rounded-md cursor-pointer hover:bg-muted/40 transition-colors">
            <ImagePlus className="size-6 text-muted-foreground mb-1" />
            <span className="text-xs text-muted-foreground">Upload</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} disabled={saving} />
          </label>
        )}
      </div>
      {/* Status */}
      <div className="space-y-1.5">
        <Label htmlFor="is_active">Status</Label>
        <select id="is_active" value={form.is_active ? "true" : "false"}
          onChange={(e) => set("is_active", e.target.value === "true")}
          disabled={saving}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
