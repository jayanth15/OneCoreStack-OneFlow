import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SearchCombobox } from "@/components/ui/search-combobox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type {
  CreateRequestPayload, RequestType, RequestItem,
} from "@/lib/requests"
import { apiFetchJson } from "@/lib/api"
import { getCurrentUser } from "@/lib/user"
import {
  Plus,
  Trash2,
  Package,
  Building2,
  StickyNote,
  ShieldAlert,
  Minus,
  Search,
  Boxes,
} from "lucide-react"

interface DeptRef {
  id: number
  code: string
  name: string
  handles_customer_dispatch?: boolean
  can_create_purchase_request?: boolean
}

interface InventoryItem {
  id: number
  code: string
  name: string
  unit_id?: number | null
  unit_name?: string | null
}

type ApiRecord = Record<string, unknown>

function textValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0
}

function itemRows(data: unknown): ApiRecord[] {
  if (!data || typeof data !== "object" || !("items" in data)) return []
  const rows = (data as { items?: unknown }).items
  return Array.isArray(rows) ? rows.filter((row): row is ApiRecord => !!row && typeof row === "object") : []
}

const SUPPORTED_REQUESTABLE_TYPES = [
  "raw_material",
  "finished_good",
  "semi_finished",
  "spare",
  "consumable",
  "attachment",
  "weeder",
] as const

type RequestableItemType = (typeof SUPPORTED_REQUESTABLE_TYPES)[number]

const ITEM_TYPE_LABELS: Record<RequestableItemType, string> = {
  raw_material: "Raw materials",
  finished_good: "Finished goods",
  semi_finished: "Semi-finished",
  spare: "Spares",
  consumable: "Consumables",
  attachment: "Attachments",
  weeder: "Weeders",
}

async function fetchInventoryItems(type: RequestableItemType, q: string): Promise<InventoryItem[]> {
  const searchParam = q.trim() ? `&search=${encodeURIComponent(q.trim())}` : ''
  const qParam = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''

  switch (type) {
    case "raw_material":
    case "finished_good":
    case "semi_finished": {
      const data = await apiFetchJson<unknown>(
        `/api/v1/inventory?item_type=${type}&page_size=500&include_inactive=false${searchParam}`,
      )
      return itemRows(data).map((i) => ({ id: numberValue(i.id), code: textValue(i.code), name: textValue(i.name), unit_id: numberValue(i.unit_id) || null, unit_name: textValue(i.unit_name) || null }))
    }
    case "spare": {
      const data = await apiFetchJson<ApiRecord[]>(
        `/api/v1/spares/variants/search?limit=50${qParam}`,
      )
      return (data || []).map((v) => ({
        id: numberValue(v.variant_id),
        code: textValue(v.part_number) || textValue(v.serial_number),
        name: textValue(v.item_name),
        unit_id: numberValue(v.unit_id) || null,
        unit_name: textValue(v.unit_name) || null,
      }))
    }
    case "consumable": {
      const data = await apiFetchJson<unknown>(
        `/api/v1/consumables?page_size=50${searchParam}`,
      )
      return itemRows(data).map((i) => ({ id: numberValue(i.id), code: textValue(i.code), name: textValue(i.name), unit_id: numberValue(i.unit_id) || null, unit_name: textValue(i.unit_name) || null }))
    }
    case "attachment": {
      const data = await apiFetchJson<unknown>(
        `/api/v1/attachments?page_size=50${searchParam}`,
      )
      return itemRows(data).map((i) => ({
        id: numberValue(i.id),
        code: textValue(i.sn_no),
        name: textValue(i.description) || textValue(i.sn_no),
      }))
    }
    case "weeder": {
      const data = await apiFetchJson<unknown>(
        `/api/v1/weeders?page_size=50${searchParam}`,
      )
      return itemRows(data).map((i) => ({
        id: numberValue(i.id),
        code: textValue(i.sn_no),
        name: textValue(i.name) || textValue(i.sn_no),
      }))
    }
  }
}

const DEFAULT_ITEM: RequestItem = { item_name: "", quantity: 1 }

export interface RequestFormProps {
  defaultType?: RequestType
  defaultValues?: Partial<CreateRequestPayload>
  onSubmit: (payload: CreateRequestPayload) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
}

function getPermittedTypes(): RequestableItemType[] {
  const user = getCurrentUser()
  if (!user) return []
  if (user.role === "admin" || user.role === "super_admin") {
    return [...SUPPORTED_REQUESTABLE_TYPES]
  }
  return SUPPORTED_REQUESTABLE_TYPES.filter((t) => {
    const hasInventoryAccess = !user.inventory_access || user.inventory_access.length === 0
      || user.inventory_access.includes(t)
    const hasRequestAccess = !user.request_inventory || user.request_inventory.length === 0
      || user.request_inventory.includes(t)
    return hasInventoryAccess && hasRequestAccess
  })
}

function normalizeItemType(
  item: RequestItem,
  permittedTypes: RequestableItemType[],
  fallbackItemType: RequestableItemType,
): RequestItem {
  if (permittedTypes.includes(item.item_type as RequestableItemType)) {
    return item
  }
  return {
    ...item,
    item_type: fallbackItemType,
    item_name: "",
    item_code: "",
    inventory_item_id: null,
  }
}

export function RequestForm({
  defaultType = "internal_transfer",
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = "Create request",
}: RequestFormProps) {
  const requestType = defaultValues?.request_type ?? defaultType
  const isPurchaseRequest = requestType === "vendor_purchase"
  const permittedTypes = useMemo<RequestableItemType[]>(() => getPermittedTypes(), [])
  const noAccess = permittedTypes.length === 0
  const fallbackItemType: RequestableItemType = permittedTypes[0] ?? "raw_material"

  const [notes, setNotes] = useState(defaultValues?.notes ?? "")
  const [items, setItems] = useState<RequestItem[]>(() => {
    const initialItems = defaultValues?.items?.length
      ? defaultValues.items
      : [{ ...DEFAULT_ITEM, item_type: fallbackItemType }]
    return initialItems.map((item) => normalizeItemType(item, permittedTypes, fallbackItemType))
  })
  const [busy, setBusy] = useState(false)

  const [depts, setDepts] = useState<DeptRef[]>([])
  const [deptsLoadFailed, setDeptsLoadFailed] = useState(false)
  const [fromDept, setFromDept] = useState<string>(defaultValues?.from_department ?? "")

  const fromDeptOptions = useMemo(() => {
    const user = getCurrentUser()
    if (!user) return []
    if (user.role === "admin" || user.role === "super_admin") return depts
    const userCodes = user.department_codes ?? []
    return depts.filter(
      (d) => userCodes.includes(d.code) && (user.purchase_access || d.can_create_purchase_request),
    )
  }, [depts])

  const effectiveFromDept = fromDept || (fromDeptOptions.length > 0 ? fromDeptOptions[0].code : "")

  useEffect(() => {
    apiFetchJson<DeptRef[]>("/api/v1/departments")
      .then((all) => {
        const user = getCurrentUser()
        const isAdmin = user?.role === "admin" || user?.role === "super_admin"
        const allowed = user?.request_departments
        if (isAdmin || !allowed || allowed.length === 0) {
          setDepts(all)
        } else {
          setDepts(all.filter((d) => allowed.includes(d.id)))
        }
      })
      .catch(() => setDeptsLoadFailed(true))
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (noAccess) return

    const filledItems = items
      .map((item) => normalizeItemType(item, permittedTypes, fallbackItemType))
      .filter((i) => i.item_name)
    if (filledItems.length === 0) {
      if (items.length > 0) {
        alert("No items to submit — each item needs a name.")
      }
      return
    }
    if (!isPurchaseRequest && filledItems.some((i) => !i.department)) {
      alert("Select a destination department for each item.")
      return
    }
    const requestItems = isPurchaseRequest
      ? filledItems.map((item) => ({ ...item, department: null }))
      : filledItems

    setBusy(true)
    try {
      const payload: CreateRequestPayload = {
        request_type: requestType,
        from_department: isPurchaseRequest ? (effectiveFromDept || undefined) : undefined,
        notes: notes || undefined,
        items: requestItems,
      }
      await onSubmit(payload)
    } finally {
      setBusy(false)
    }
  }

  const updateItem = (i: number, patch: Partial<RequestItem>) => {
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  }

  const incrementItem = (i: number, delta: number) => {
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, (x.quantity || 1) + delta) } : x)))
  }

  const removeItem = (i: number) => {
    setItems((prev) => prev.filter((_, j) => j !== i))
  }

  const itemTypeFor = (item: RequestItem): RequestableItemType => {
    return permittedTypes.includes(item.item_type as RequestableItemType)
      ? item.item_type as RequestableItemType
      : fallbackItemType
  }

  if (noAccess) {
    return (
      <div className="px-2 py-6">
        <Card className="ring-1 ring-foreground/5">
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-warning/15 text-warning">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">No inventory access</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                You don&apos;t have permission to request any inventory types. This form supports raw materials, finished goods, and semi-finished goods — your account may need additional permissions for these types. Please contact your administrator.
              </p>
            </div>
          </CardContent>
        </Card>
        {onCancel && (
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
              Close
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <div className="space-y-4 px-1">
        {isPurchaseRequest && fromDeptOptions.length > 1 && (
          <Card size="sm" className="ring-1 ring-foreground/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                  <Building2 className="size-3.5" />
                </div>
                <div>
                  <CardTitle className="text-xs">Requesting department</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Select the department raising this purchase request.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Select value={effectiveFromDept} onValueChange={(v) => v && setFromDept(v)}>
                <SelectTrigger className="h-9 w-full sm:max-w-xs">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {fromDeptOptions.map((d) => (
                    <SelectItem key={d.id} value={d.code}>
                      {d.code} — {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}
        <Card size="sm" className="ring-1 ring-foreground/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <Package className="size-3.5" />
              </div>
              <div>
                <CardTitle className="text-xs">Request items</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isPurchaseRequest
                    ? "Pick the items that need to be purchased for the company."
                    : "Pick inventory and route each line to the department that will receive it."}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((it, i) => {
              const rowType = itemTypeFor(it)
              return (
                <div
                  key={i}
                  className={`grid gap-3 rounded-md border bg-background p-3 xl:items-end ${
                    isPurchaseRequest
                      ? "xl:grid-cols-[180px_minmax(0,1fr)_auto]"
                      : "xl:grid-cols-[180px_minmax(0,1fr)_220px_auto]"
                  }`}
                >
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Boxes className="size-3" />
                      Inventory
                    </label>
                    <Select
                      value={rowType}
                      onValueChange={(v) => updateItem(i, {
                        item_type: v,
                        item_name: "",
                        item_code: "",
                        inventory_item_id: null,
                      })}
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {permittedTypes.map((t) => (
                          <SelectItem key={t} value={t}>
                            {ITEM_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Search className="size-3" />
                      Item
                    </label>
                    <SearchCombobox<InventoryItem>
                      variant="list"
                      value={it.inventory_item_id ? String(it.inventory_item_id) : ""}
                      placeholder={`Search ${ITEM_TYPE_LABELS[rowType].toLowerCase()}...`}
                      fetcher={async (q) => fetchInventoryItems(rowType, q)}
                      getItemKey={(inv) => inv.id}
                      getItemLabel={(inv) => `${inv.code} · ${inv.name}`}
                      itemIdOf={(inv) => inv.id}
                      onSelect={(inv) => updateItem(i, {
                        item_name: inv.name,
                        item_code: inv.code,
                        item_type: rowType,
                        inventory_item_id: inv.id,
                        unit_id: inv.unit_id ?? null,
                        unit_name: inv.unit_name ?? null,
                      })}
                      emptyText="No matching items"
                      renderItem={(inv) => (
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">{inv.name}</span>
                          <span className="truncate font-mono text-xs text-muted-foreground">{inv.code || "No code"}</span>
                        </div>
                      )}
                    />
                    {it.item_name && (
                      <p className="truncate text-xs text-muted-foreground">
                        Selected: <span className="font-medium text-foreground">{it.item_name}</span>
                        {it.item_code && <span className="font-mono"> · {it.item_code}</span>}
                        {it.unit_name && <span> · Unit: {it.unit_name}</span>}
                      </p>
                    )}
                  </div>

                  {!isPurchaseRequest && (
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Building2 className="size-3" />
                        To department
                      </label>
                      {deptsLoadFailed ? (
                        <Input
                          value={it.department || ""}
                          onChange={(e) => updateItem(i, { department: e.target.value })}
                          placeholder="Department"
                          className="h-9"
                        />
                      ) : (
                        <Select
                          value={it.department || undefined}
                          onValueChange={(v) => updateItem(i, { department: v })}
                        >
                          <SelectTrigger className="h-9 w-full">
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            {depts.map((d) => (
                              <SelectItem key={d.id} value={d.code}>
                                {d.code} — {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}

                  <div className="flex items-end justify-between gap-2 sm:justify-end">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Qty
                      </label>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => incrementItem(i, -1)}
                          disabled={it.quantity <= 1}
                          aria-label="Decrease quantity"
                        >
                          <Minus className="size-3" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          className="h-9 w-20 text-center tabular-nums"
                          value={it.quantity}
                          onChange={(e) => updateItem(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => incrementItem(i, 1)}
                          aria-label="Increase quantity"
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeItem(i)}
                      disabled={items.length === 1}
                      className="mb-0.5 text-muted-foreground hover:text-destructive"
                      aria-label="Remove item"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems([...items, { ...DEFAULT_ITEM, item_type: fallbackItemType }])}
              className="mt-1"
            >
              <Plus className="size-3.5" />
              Add item
            </Button>
          </CardContent>
        </Card>

        <Card size="sm" className="ring-1 ring-foreground/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <StickyNote className="size-3.5" />
              </div>
              <CardTitle className="text-xs">Notes</CardTitle>
              <Badge variant="ghost" className="text-[10px]">Optional</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else the fulfiller should know…"
            />
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t bg-popover/95 backdrop-blur supports-backdrop-filter:bg-popover/80 px-6 py-3 flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  )
}
