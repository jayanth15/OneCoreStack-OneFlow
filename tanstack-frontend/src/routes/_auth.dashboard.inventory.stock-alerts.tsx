import { useEffect, useRef, useState } from "react"
import type { ElementType } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetchJson } from "@/lib/api"
import { openPrintWindow } from "@/lib/print-report"
import {
  AlertTriangle, Printer, Package, Wrench, RefreshCw, Box, Layers, FlaskConical, Paperclip, Scissors, List,
} from "lucide-react"

export const Route = createFileRoute("/_auth/dashboard/inventory/stock-alerts")({
  component: StockAlertsPage,
})

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "all",           label: "All",           Icon: List },
  { key: "raw_material",  label: "Raw Materials",  Icon: Box },
  { key: "finished_good", label: "Finished Goods", Icon: Package },
  { key: "semi_finished", label: "Semi Finished",  Icon: Layers },
  { key: "spare",         label: "Spares",         Icon: Wrench },
  { key: "consumable",    label: "Consumables",    Icon: FlaskConical },
  { key: "attachment",    label: "Attachments",    Icon: Paperclip },
  { key: "weeder",        label: "Weeders",        Icon: Scissors },
] as const
type TabKey = typeof TABS[number]["key"]

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpareLowStockItem {
  item_id: number
  variant_id: number
  item_name: string
  variant_name: string
  part_number: string | null
  category_name: string
  sub_category_name: string
  recorded_qty: number
  reorder_level: number
  unit: string
}

interface ConsumableLowStockItem {
  item_id: number
  name: string
  code: string | null
  qty: number
  reorder_level: number
}

interface AttachmentLowStockItem {
  item_id: number
  sn_no: string | null
  description: string | null
  qty: number
  reorder_level: number
}

interface WeederLowStockItem {
  item_id: number
  sn_no: string | null
  description: string | null
  qty: number
  reorder_level: number
}

interface InventoryLowItem {
  id: number
  code: string
  name: string
  item_type: "raw_material" | "finished_good" | "semi_finished"
  unit: string
  quantity_on_hand: number
  reorder_level: number
}

interface PaginatedInventory {
  items: InventoryLowItem[]
  total: number
  pages: number
}

interface LowStockPayload {
  spares: SpareLowStockItem[]
  consumables: ConsumableLowStockItem[]
  attachments?: AttachmentLowStockItem[]
  weeders?: WeederLowStockItem[]
}

interface CompanyInfo {
  company_name: string
  company_address: string
  company_phone: string
  company_email: string
  company_gstin: string
  company_city: string
  company_state: string
  company_country: string
  company_pincode: string
}

interface UnifiedRow {
  key: string
  type: "spare" | "consumable" | "attachment" | "weeder" | "raw_material" | "finished_good" | "semi_finished"
  name: string
  variant_name?: string
  code: string | null
  category: string
  qty: number
  reorder_level: number
  unit: string
}

// ── TypeBadge ─────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<UnifiedRow["type"], { label: string; bg: string; text: string; Icon: ElementType }> = {
  spare:        { label: "Spare",         bg: "bg-tone-violet/10", text: "text-tone-violet", Icon: Wrench },
  consumable:   { label: "Consumable",    bg: "bg-primary/10",   text: "text-primary",   Icon: FlaskConical },
  attachment:   { label: "Attachment",    bg: "bg-primary/10",    text: "text-primary",    Icon: Paperclip },
  weeder:       { label: "Weeder",        bg: "bg-success/10",  text: "text-success",  Icon: Scissors },
  raw_material:  { label: "Raw Material", bg: "bg-tone-amber/15", text: "text-tone-amber", Icon: Box },
  finished_good: { label: "Finished Good", bg: "bg-tone-emerald/10",  text: "text-tone-emerald",   Icon: Package },
  semi_finished: { label: "Semi Finished", bg: "bg-tone-violet/10", text: "text-tone-violet", Icon: Layers },
}

function TypeBadge({ type, small }: { type: UnifiedRow["type"]; small?: boolean }) {
  const { label, bg, text, Icon } = TYPE_CONFIG[type]
  const sz = small ? "size-2.5" : "size-3"
  const cls = small
    ? `inline-flex items-center gap-1 text-[10px] rounded-full px-1.5 py-0.5 font-medium ${bg} ${text}`
    : `inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 font-medium ${bg} ${text}`
  return (
    <span className={cls}>
      <Icon className={sz} />
      {label}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function StockAlertsPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [qtyNeeded, setQtyNeeded] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const printRef = useRef<HTMLDivElement>(null)

  const CATEGORY_LABELS: Record<string, string> = {
    raw_material:  "Raw Materials",
    finished_good: "Finished Goods",
    semi_finished: "Semi Finished",
  }

  // Company info (best-effort, admin only)
  const companyQuery = useQuery({
    queryKey: ["/api/v1/settings/company"],
    staleTime: 0,
  })
  const companyInfo = (companyQuery.data as CompanyInfo | undefined) ?? null

  // Low-stock + inventory (with page loop for large inventories)
  const lowStockQuery = useQuery({
    queryKey: ["/api/v1/dashboard/low-stock", "/api/v1/inventory?include_inactive=false&page_size=500"],
    staleTime: 0,
    queryFn: async () => {
      const [lowStock, invPage] = await Promise.all([
        apiFetchJson<LowStockPayload>("/api/v1/dashboard/low-stock"),
        apiFetchJson<PaginatedInventory>("/api/v1/inventory?include_inactive=false&page_size=500"),
      ])

      // Fetch remaining inventory pages if needed
      let invItems = invPage.items
      for (let p = 2; p <= invPage.pages; p++) {
        const extra = await apiFetchJson<PaginatedInventory>(
          `/api/v1/inventory?include_inactive=false&page_size=500&page=${p}`
        )
        invItems = [...invItems, ...extra.items]
      }

      const lowInv = invItems.filter(
        (i) => i.reorder_level > 0 && i.quantity_on_hand <= i.reorder_level
      )

      return [
        ...lowInv.map((i): UnifiedRow => ({
          key: `inv-${i.id}`,
          type: i.item_type,
          name: i.name,
          code: i.code,
          category: CATEGORY_LABELS[i.item_type] ?? i.item_type,
          qty: i.quantity_on_hand,
          reorder_level: i.reorder_level,
          unit: i.unit,
        })),
        ...lowStock.spares.map((s): UnifiedRow => ({
          key: `spare-v-${s.variant_id}`,
          type: "spare",
          name: s.item_name,
          variant_name: s.variant_name,
          code: s.part_number,
          category: s.sub_category_name ? `${s.category_name} / ${s.sub_category_name}` : s.category_name,
          qty: s.recorded_qty,
          reorder_level: s.reorder_level,
          unit: s.unit,
        })),
        ...lowStock.consumables.map((c): UnifiedRow => ({
          key: `con-${c.item_id}`,
          type: "consumable",
          name: c.name,
          code: c.code,
          category: "Consumables",
          qty: c.qty,
          reorder_level: c.reorder_level,
          unit: "",
        })),
        ...(lowStock.attachments ?? []).map((a): UnifiedRow => ({
          key: `att-${a.item_id}`,
          type: "attachment",
          name: a.sn_no || a.description || `Item #${a.item_id}`,
          code: a.sn_no,
          category: "Attachments",
          qty: a.qty,
          reorder_level: a.reorder_level,
          unit: "",
        })),
        ...(lowStock.weeders ?? []).map((w): UnifiedRow => ({
          key: `weed-${w.item_id}`,
          type: "weeder",
          name: w.sn_no || w.description || `Item #${w.item_id}`,
          code: w.sn_no,
          category: "Weeders",
          qty: w.qty,
          reorder_level: w.reorder_level,
          unit: "",
        })),
      ] as UnifiedRow[]
    },
  })

  const rows = lowStockQuery.data ?? []
  const loading = lowStockQuery.isLoading || lowStockQuery.isFetching
  const error = lowStockQuery.error instanceof Error ? lowStockQuery.error.message : null

  // Reset selection to all rows whenever fresh data arrives (parity with original)
  useEffect(() => {
    if (lowStockQuery.data) {
      setSelected(new Set(rows.map(r => r.key)))
    }
  }, [lowStockQuery.data])

  // ── Selection helpers ─────────────────────────────────────────────────────
  const displayRows = activeTab === "all"
    ? rows
    : rows.filter(r => r.type === activeTab)

  const tabCounts: Partial<Record<TabKey, number>> = {
    all:           rows.length,
    raw_material:  rows.filter(r => r.type === "raw_material").length,
    finished_good: rows.filter(r => r.type === "finished_good").length,
    semi_finished: rows.filter(r => r.type === "semi_finished").length,
    spare:         rows.filter(r => r.type === "spare").length,
    consumable:    rows.filter(r => r.type === "consumable").length,
    attachment:    rows.filter(r => r.type === "attachment").length,
    weeder:        rows.filter(r => r.type === "weeder").length,
  }

  const allSelected = displayRows.length > 0 && displayRows.every(r => selected.has(r.key))
  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); displayRows.forEach(r => n.delete(r.key)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); displayRows.forEach(r => n.add(r.key)); return n })
    }
  }
  const toggle = (key: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  const selectedRows = rows.filter(r => selected.has(r.key))

  function refresh() {
    lowStockQuery.refetch()
    companyQuery.refetch()
  }

  function handlePrint() {
    const co = companyInfo
    openPrintWindow({
      title: "Stock Alert / Purchase Request",
      subtitle: `Generated on ${new Date().toLocaleString("en-IN")}  |  ${selectedRows.length} item${selectedRows.length !== 1 ? "s" : ""}`,
      companyName: co?.company_name || undefined,
      companyAddress: [co?.company_address, co?.company_city, co?.company_state, co?.company_pincode].filter(Boolean).join(", ") || undefined,
      mode: "audit-snapshot",
      documentLabel: "Stock Alert",
      columns: ["#", "Type", "Name", "Variant", "Code", "Category", "Current Qty", "Reorder Level", "Qty Needed"],
      rows: selectedRows.map((r, i) => ({
        "#": i + 1,
        "Type": TYPE_CONFIG[r.type].label,
        "Name": r.name,
        "Variant": r.variant_name ?? "",
        "Code": r.code ?? "",
        "Category": r.category,
        "Current Qty": `${r.qty % 1 === 0 ? r.qty.toFixed(0) : r.qty.toFixed(2)}${r.unit ? " " + r.unit : ""}`,
        "Reorder Level": `${r.reorder_level}${r.unit ? " " + r.unit : ""}`,
        "Qty Needed": qtyNeeded[r.key] || "—",
      })),
    })
  }

  const fmtQty = (n: number, unit?: string) => {
    const s = n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)
    return unit ? `${s} ${unit}` : s
  }

  return (
    <>
      {/* Header */}
      <PageHeader
        title="Stock Alerts"
        description="All inventory items below their reorder level. Select items and enter quantity needed to print a purchase request."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Stock Alerts" },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`size-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            {selectedRows.length > 0 && (
              <Button size="sm" onClick={handlePrint}>
                <Printer className="size-3.5 mr-1.5" />Print / Purchase Request
              </Button>
            )}
          </>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Title */}
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <AlertTriangle className="size-5 text-warning" />
            Stock Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All inventory items below their reorder level.
            Select items and enter quantity needed to print a purchase request.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b pb-1">
          {TABS.map(({ key, label, Icon }) => {
            const count = tabCounts[key] ?? 0
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-sm font-medium transition-colors ${
                  activeTab === key
                    ? "bg-background border border-b-background -mb-px text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="size-3.5" />
                {label}
                {!loading && count > 0 && (
                  <span className="ml-1 text-[10px] font-semibold bg-warning/15 text-warning rounded-full px-1.5 py-0.5">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border p-14 text-center space-y-3">
            <div className="size-14 rounded-full bg-success/10 flex items-center justify-center mx-auto">
              <Package className="size-7 text-success" />
            </div>
            <p className="text-sm font-medium">All stock levels are healthy!</p>
            <p className="text-xs text-muted-foreground">No inventory items are below their reorder level.</p>
          </div>
        ) : displayRows.length === 0 ? (
          <div className="rounded-xl border p-14 text-center space-y-3">
            <div className="size-14 rounded-full bg-success/10 flex items-center justify-center mx-auto">
              <Package className="size-7 text-success" />
            </div>
            <p className="text-sm font-medium">No low-stock items in this category!</p>
          </div>
        ) : (
          <>
            {/* Actions bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="size-4 rounded border-input accent-primary" />
                  <span>{allSelected ? "Deselect all" : "Select all"}</span>
                </label>
                {selected.size > 0 && (
                  <span className="text-xs text-muted-foreground">{selected.size} of {rows.length} selected</span>
                )}
              </div>
              {selectedRows.length > 0 && (
                <Button size="sm" onClick={handlePrint} className="gap-1.5">
                  <Printer className="size-3.5" />Print Purchase Request ({selectedRows.length})
                </Button>
              )}
            </div>

            {/* Desktop table (hidden on mobile) */}
            <div className="hidden md:block rounded-lg border overflow-hidden" ref={printRef}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="w-10 px-3 py-2.5"></th>
                    <th className="px-4 py-2.5 text-left font-medium">Type</th>
                    <th className="px-4 py-2.5 text-left font-medium">Name / Code</th>
                    <th className="px-4 py-2.5 text-left font-medium">Category</th>
                    <th className="px-4 py-2.5 text-right font-medium">Current Qty</th>
                    <th className="px-4 py-2.5 text-right font-medium">Reorder Level</th>
                    <th className="px-4 py-2.5 text-right font-medium w-36">Qty Needed</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayRows.map(r => (
                    <tr key={r.key} className={`transition-colors ${selected.has(r.key) ? "bg-warning/15" : "hover:bg-muted/20"}`}>
                      <td className="px-3 py-3 text-center">
                        <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)}
                          className="size-4 rounded border-input accent-primary" />
                      </td>
                      <td className="px-4 py-3">
                        <TypeBadge type={r.type} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.name}</p>
                        {r.variant_name && <p className="text-xs text-violet-600 font-medium">{r.variant_name}</p>}
                        {r.code && <p className="text-xs font-mono text-muted-foreground">{r.code}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{r.category}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-warning font-medium inline-flex items-center gap-1 justify-end">
                          <AlertTriangle className="size-3" />{fmtQty(r.qty, r.unit)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-sm">
                        {fmtQty(r.reorder_level, r.unit)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Input
                          type="number" min="0" step="any" placeholder="0"
                          value={qtyNeeded[r.key] ?? ""}
                          onChange={e => setQtyNeeded(prev => ({ ...prev, [r.key]: e.target.value }))}
                          className="h-7 w-28 text-right text-sm ml-auto"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {displayRows.map(r => (
                <div key={r.key} className={`rounded-lg border p-3 space-y-2 ${selected.has(r.key) ? "border-amber-300 bg-warning/15" : "bg-card"}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)}
                      className="mt-0.5 size-4 rounded border-input accent-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <TypeBadge type={r.type} small />
                        <p className="font-medium text-sm">{r.name}</p>
                      </div>
                      {r.variant_name && <p className="text-xs text-violet-600 font-medium mt-0.5">{r.variant_name}</p>}
                      {r.code && <p className="text-xs font-mono text-muted-foreground mt-0.5">{r.code}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{r.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 pl-6">
                    <div className="space-y-0.5 text-xs">
                      <span className="text-warning font-medium inline-flex items-center gap-1">
                        <AlertTriangle className="size-3" />Current: {fmtQty(r.qty, r.unit)}
                      </span>
                      <div className="text-muted-foreground">Reorder: {fmtQty(r.reorder_level, r.unit)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Need:</span>
                      <Input
                        type="number" min="0" step="any" placeholder="0"
                        value={qtyNeeded[r.key] ?? ""}
                        onChange={e => setQtyNeeded(prev => ({ ...prev, [r.key]: e.target.value }))}
                        className="h-7 w-24 text-right text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary footer */}
            {selectedRows.length > 0 && (
              <div className="rounded-lg border border-warning/20 bg-warning/15 p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm">
                  <span className="font-medium">{selectedRows.length} item{selectedRows.length !== 1 ? "s" : ""} selected</span>
                  <span className="text-muted-foreground ml-2">
                    ({selectedRows.filter(r => qtyNeeded[r.key]).length} with qty entered)
                  </span>
                </div>
                <Button onClick={handlePrint} className="gap-1.5">
                  <Printer className="size-4" />Print Purchase Request
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
