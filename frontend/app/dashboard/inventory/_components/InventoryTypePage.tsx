"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove, canAccessInventory } from "@/lib/user";
import {
  PlusIcon, Pencil, Trash2, AlertTriangle, PackagePlus,
  PackageMinus, History, TrendingDown, Eye, Search, ChevronLeft, ChevronRight, Printer,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: number;
  code: string;
  name: string;
  item_type: string;
  unit_name: string | null;
  quantity_on_hand: number;
  reorder_level: number;
  storage_type: string | null;
  storage_location: string | null;
  is_active: boolean;
  updated_at: string;
  linked_schedule_count: number;
  customer_names: string | null;
  required_qty: number | null;
  rate: number | null;
  vendor_name: string | null;
}

interface PaginatedInventory {
  items: InventoryItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface HistoryEntry {
  id: number;
  changed_at: string;
  change_type: string;
  changed_by_username: string | null;
  quantity_before: number | null;
  quantity_after: number | null;
  quantity_delta: number | null;
  schedule_number: string | null;
  notes: string | null;
}

interface ScheduleItem {
  id: number;
  schedule_number: string;
  description: string;
  customer_name: string;
}

interface PaginatedSchedules {
  items: ScheduleItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHANGE_LABELS: Record<string, string> = {
  create:   "Created",
  add:      "Stock Added",
  subtract: "Stock Removed",
  set:      "Stock Set",
  edit:     "Edited",
};

function fmtQty(n: number | null | undefined) {
  if (n == null) return "—";
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "2-digit",
  });
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

const isLow = (item: InventoryItem) =>
  item.reorder_level > 0 && item.quantity_on_hand <= item.reorder_level;

const isShortfall = (item: InventoryItem) =>
  item.item_type === "raw_material" &&
  item.required_qty != null &&
  item.required_qty > 0 &&
  item.quantity_on_hand < item.required_qty;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** The fixed item_type for this page — drives filtering and the new-item preset */
  itemType: "finished_good" | "raw_material" | "semi_finished" | "scrap";
  /** Human-readable label, e.g. "Finished Goods" */
  label: string;
  /** Short description shown below the heading */
  description: string;
  /** Absolute path of this page, e.g. "/dashboard/inventory/finished-goods" */
  basePath: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InventoryTypePage({ itemType, label, description, basePath }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page         = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const showInactive = searchParams.get("inactive") === "1";
  const search       = searchParams.get("search") ?? "";
  const vendorFilter = searchParams.get("vendor") ?? "";

  const [data, setData]       = useState<PaginatedInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [admin, setAdmin]     = useState(false);
  const [searchDraft, setSearchDraft] = useState(search);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [adjustItem, setAdjustItem]             = useState<InventoryItem | null>(null);
  const [adjustType, setAdjustType]             = useState<"add" | "subtract" | "set">("add");
  const [adjustQty, setAdjustQty]               = useState("");
  const [adjustScheduleId, setAdjustScheduleId] = useState<string>("");
  const [adjustNote, setAdjustNote]             = useState("");
  const [adjustSchedules, setAdjustSchedules]   = useState<ScheduleItem[]>([]);
  const [adjustSaving, setAdjustSaving]         = useState(false);
  const [adjustError, setAdjustError]           = useState<string | null>(null);

  const [historyItem, setHistoryItem]       = useState<InventoryItem | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage]       = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);

  // Vendor filter (finished goods / semi-finished only)

  const [allVendors, setAllVendors] = useState<string[]>([]);

  useEffect(() => {
    if (!canAccessInventory(itemType)) {
      router.replace("/dashboard/inventory");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemType]);

  // Fetch all vendors for the filter dropdown (FG/semi-finished pages only)
  useEffect(() => {
    if (itemType !== "finished_good" && itemType !== "semi_finished") return;
    apiFetchJson<{ id: number | null; name: string }[]>("/api/v1/vendors/names")
      .then((list) => setAllVendors(list.map((v) => v.name)))
      .catch(() => {});
  }, [itemType]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSearchDraft(search); }, [search]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      item_type:        itemType,
      page:             String(page),
      page_size:        "20",
      include_inactive: String(showInactive),
    });
    if (search)       params.set("search", search);
    if (vendorFilter) params.set("vendor_name", vendorFilter);
    apiFetchJson<PaginatedInventory>(`/api/v1/inventory?${params}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [itemType, page, showInactive, search, vendorFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ─────────────────────────────────────────────────────────────
  function nav(updates: Record<string, string>) {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === "") p.delete(k); else p.set(k, v);
    });
    router.push(`${basePath}?${p.toString()}`);
  }

  function setPage(n: number)          { nav({ page: String(n) }); }
  function toggleInactive(v: boolean)  { nav({ inactive: v ? "1" : "", page: "1" }); }
  function submitSearch()              { nav({ search: searchDraft.trim(), page: "1" }); }
  function setVendorFilter(v: string)  { nav({ vendor: v, page: "1" }); }

  // ── Adjust stock ───────────────────────────────────────────────────────────
  function openAdjust(item: InventoryItem) {
    setAdjustItem(item);
    setAdjustType("add");
    setAdjustQty("");
    setAdjustScheduleId("");
    setAdjustNote("");
    setAdjustError(null);
    apiFetchJson<PaginatedSchedules>("/api/v1/schedules?include_inactive=false&page_size=500")
      .then((d) => setAdjustSchedules(d.items))
      .catch(() => setAdjustSchedules([]));
  }

  async function submitAdjust() {
    if (!adjustItem) return;
    const qty = parseFloat(adjustQty);
    if (isNaN(qty) || qty < 0) { setAdjustError("Enter a valid quantity ≥ 0"); return; }
    setAdjustSaving(true);
    setAdjustError(null);
    try {
      const updated = await apiFetchJson<InventoryItem>(`/api/v1/inventory/${adjustItem.id}/adjust`, {
        method: "POST",
        body: JSON.stringify({
          adjustment_type: adjustType,
          quantity:        qty,
          schedule_id:     adjustScheduleId ? parseInt(adjustScheduleId) : null,
          note:            adjustNote || null,
        }),
      });
      setAdjustItem(null);
      // Update only the affected row in-place — avoids re-sort by updated_at
      setData((prev) =>
        prev
          ? { ...prev, items: prev.items.map((it) => (it.id === updated.id ? updated : it)) }
          : prev
      );
    } catch (e: unknown) {
      setAdjustError(e instanceof Error ? e.message : "Adjust failed");
    } finally {
      setAdjustSaving(false);
    }
  }

  // ── History ────────────────────────────────────────────────────────────────
  async function openHistory(item: InventoryItem) {
    setHistoryItem(item);
    setHistoryEntries([]);
    setHistoryPage(1);
    setHistoryHasMore(false);
    setHistoryLoading(true);
    try {
      const d = await apiFetchJson<HistoryEntry[]>(`/api/v1/inventory/${item.id}/history?limit=10&offset=0`);
      setHistoryEntries(d);
      setHistoryHasMore(d.length === 10);
    } catch { /* silent */ } finally {
      setHistoryLoading(false);
    }
  }

  async function changeHistoryPage(newPage: number) {
    if (!historyItem) return;
    setHistoryEntries([]);
    setHistoryLoading(true);
    try {
      const d = await apiFetchJson<HistoryEntry[]>(`/api/v1/inventory/${historyItem.id}/history?limit=10&offset=${(newPage - 1) * 10}`);
      setHistoryEntries(d);
      setHistoryPage(newPage);
      setHistoryHasMore(d.length === 10);
    } catch { /* silent */ } finally {
      setHistoryLoading(false);
    }
  }

  async function printHistory() {
    if (!historyItem) return;
    const { fetchAllPages, openPrintWindow } = await import("@/lib/print-report");
    const all = await fetchAllPages(async (printPage, pageSize) => {
      const rows = await apiFetchJson<HistoryEntry[]>(
        `/api/v1/inventory/${historyItem.id}/history?limit=${pageSize}&offset=${(printPage - 1) * pageSize}`
      );
      return { items: rows, total: 0, page: printPage, page_size: pageSize, pages: 0 };
    });
    openPrintWindow({
      title: `${label} History — ${historyItem.name}`,
      mode: "audit-history",
      columns: ["Date", "Action", "Before", "Change", "After", "User", "Schedule", "Notes"],
      rows: all.map(row => ({
        "Date": new Date(row.changed_at).toLocaleString(),
        "Action": CHANGE_LABELS[row.change_type] ?? row.change_type,
        "Before": row.quantity_before ?? "",
        "Change": row.quantity_delta ?? "",
        "After": row.quantity_after ?? "",
        "User": row.changed_by_username ?? "System",
        "Schedule": row.schedule_number ?? "",
        "Notes": row.notes ?? "",
      })),
    });
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/inventory/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      setData(current => {
        if (!current) return current;
        const nextTotal = Math.max(0, current.total - 1);
        return { ...current, items: current.items.filter(item => item.id !== deleteId),
          total: nextTotal, pages: Math.max(1, Math.ceil(nextTotal / current.page_size)) };
      });
      window.dispatchEvent(new Event("inventory-updated"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const items      = data?.items ?? [];
  const totalPages = data?.pages ?? 1;
  const total      = data?.total ?? 0;
  const pageStart  = ((page - 1) * 20) + 1;
  const pageEnd    = Math.min(page * 20, total);
  const lowCount   = items.filter(isLow).length;
  const shortfall  = items.filter(isShortfall).length;

  const showRMCols = itemType === "raw_material";
  const showFGCols = itemType === "finished_good" || itemType === "semi_finished";

  // Build vendor options list from the API-fetched vendors list
  const customerOptions: { name: string }[] = (() => {
    if (!showFGCols) return [];
    const vendorSet = new Set(allVendors ?? []);
    return Array.from(vendorSet)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name }));
  })();

  // Items after vendor filter are now returned server-side; alias for clarity
  const filteredItems = items;

  async function printInventory() {
    const { fetchAllPages, openPrintWindow } = await import("@/lib/print-report");
    const all = await fetchAllPages(async (page, pageSize) => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search) params.set("search", search);
      const data = await apiFetchJson<PaginatedInventory>(`/api/v1/inventory?item_type=&`);
      return { items: data.items, total: data.total, page: data.page, page_size: data.page_size, pages: data.pages };
    });
    openPrintWindow({
      title: `${label} Inventory`,
      companyName: "OneFlow",
      mode: "cycle-count",
      columns: ["Code", "Name", "Unit", "System Qty", "Physical Count", "Variance", "Location", "Counter Initials", "Notes"],
      rows: all.map(item => ({
        Code: item.code ?? "—",
        Name: item.name ?? "—",
        Unit: item.unit_name ?? "—",
        "System Qty": item.quantity_on_hand,
        "Physical Count": "",
        Variance: "",
        Location: item.storage_location ?? "—",
        "Counter Initials": "",
        Notes: "",
      })),
    });
  }

  return (
    <>
      {/* Header */}
      <PageHeader
        title={label}
        description={description}
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label },
        ]}
        actions={
          <Button size="sm" variant="outline" onClick={printInventory}>
            <Printer className="size-3.5 mr-1.5" />Print
          </Button>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Heading */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">{label}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          </div>
          {admin && (
            <Button size="sm" onClick={() => router.push(`/dashboard/inventory/new?type=${itemType}`)}>
              <PlusIcon className="size-4 mr-1" />
              Add Item
            </Button>
          )}
        </div>

        {/* Alerts */}
        {(lowCount > 0 || shortfall > 0) && (
          <div className="flex flex-wrap gap-2">
            {lowCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-warning bg-warning/15 border border-warning/20 rounded-md px-3 py-1.5">
                <AlertTriangle className="size-3.5 shrink-0" />
                {lowCount} item{lowCount !== 1 ? "s" : ""} below reorder level
              </div>
            )}
            {shortfall > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-1.5">
                <TrendingDown className="size-3.5 shrink-0" />
                {shortfall} raw material{shortfall !== 1 ? "s" : ""} have shortfall vs schedule
              </div>
            )}
          </div>
        )}

        {/* Search + filter row */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-3 ml-auto flex-wrap">
            {showFGCols && (
              <select
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All vendors ({total})</option>
                {customerOptions.map(opt => (
                  <option key={opt.name} value={opt.name}>
                    {opt.name}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={showInactive}
                onChange={(e) => toggleInactive(e.target.checked)} className="size-3 rounded" />
              Show inactive
            </label>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); submitSearch(); }} className="flex gap-1.5 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search name / code…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-44"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
            {search && (
              <Button type="button" size="sm" variant="ghost"
                onClick={() => nav({ search: "", page: "1" })}>
                Clear
              </Button>
            )}
          </form>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* ── Vendor filter banner (when a vendor is selected) ──── */}
        {showFGCols && vendorFilter && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border rounded-md px-3 py-1.5">
            <span>Showing items for <strong className="text-foreground">{vendorFilter}</strong></span>
            <span>·</span>
            <span>{total} item{total !== 1 ? "s" : ""}</span>
            <button
              className="ml-auto text-xs underline hover:text-foreground"
              onClick={() => setVendorFilter("")}
            >
              Clear
            </button>
          </div>
        )}

        {/* ── Standard views (mobile cards + desktop table) ─────────────── */}
        <>
        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4"><Skeleton className="h-28 w-full" /></div>
            ))
          ) : filteredItems.length === 0 ? (
            <div className="rounded-lg border px-4 py-12 text-center text-muted-foreground text-sm">
              {search ? `No items matching "${search}".` : "No items found."}
            </div>
          ) : (
            filteredItems.map((item) => {
              const low   = isLow(item);
              const short = isShortfall(item);
              return (
                <div key={item.id}
                  className={`rounded-lg border p-4 space-y-2.5 ${!item.is_active ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/dashboard/inventory/${item.id}`}
                        className="font-medium text-sm hover:underline">{item.name}</Link>
                      <div className="text-xs text-muted-foreground font-mono">{item.code}</div>
                      {!item.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Available:</span>
                      <span className={`font-medium ${low ? "text-warning" : short ? "text-destructive" : ""}`}>
                        {(low || short) && <AlertTriangle className="size-3 inline mr-0.5" />}
                        {fmtQty(item.quantity_on_hand)} {item.unit_name}
                      </span>
                    </div>
                    {showRMCols && item.required_qty != null && item.required_qty > 0 && (
                      <div>
                        <span className="text-muted-foreground">Required:</span>{" "}
                        <span className={item.required_qty > item.quantity_on_hand ? "text-destructive font-medium" : ""}>
                          {fmtQty(item.required_qty)} {item.unit_name}
                        </span>
                      </div>
                    )}
                    {item.linked_schedule_count > 0 && (
                      <div>
                        <span className="text-muted-foreground">Schedules:</span>{" "}
                        <Badge variant="secondary" className="text-xs">{item.linked_schedule_count}</Badge>
                      </div>
                    )}
                    {admin && item.rate != null && (
                      <div><span className="text-muted-foreground">Rate:</span> ₹{item.rate.toFixed(2)}</div>
                    )}
                    <div className="text-muted-foreground">{fmtDate(item.updated_at)}</div>
                  </div>
                  {showFGCols && (item.vendor_name || item.customer_names) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {item.vendor_name
                        ? <><span className="font-medium text-foreground">{item.vendor_name}</span>{item.customer_names ? ` · ${item.customer_names}` : ""}</>
                        : item.customer_names
                      }
                    </p>
                  )}
                  <div className="flex justify-end gap-0.5 pt-1 border-t">
                    <Button variant="ghost" size="icon" className="size-7" title="View Details"
                      onClick={() => router.push(`/dashboard/inventory/${item.id}`)}>
                      <Eye className="size-3.5 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" title="Add Stock"
                      onClick={() => { setAdjustType("add"); openAdjust(item); }}>
                      <PackagePlus className="size-3.5 text-success" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" title="Remove Stock"
                      onClick={() => { setAdjustType("subtract"); openAdjust(item); }}>
                      <PackageMinus className="size-3.5 text-warning" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" title="Edit"
                      onClick={() => router.push(`/dashboard/inventory/${item.id}/edit`)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    {admin && (
                      <Button variant="ghost" size="icon" className="size-7" title="History"
                        onClick={() => openHistory(item)}>
                        <History className="size-3.5 text-primary" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      title="Deactivate" onClick={() => setDeleteId(item.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Table (desktop) */}
        <div className="hidden md:block rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium w-24">Updated</th>
                  <th className="px-4 py-3 text-left font-medium">Name / Code</th>
                  <th className="px-4 py-3 text-right font-medium">Available</th>
                  {showRMCols && <th className="px-4 py-3 text-right font-medium">Required</th>}
                  {showFGCols && <th className="px-4 py-3 text-left font-medium">Vendors</th>}
                  <th className="px-4 py-3 text-left font-medium">Storage / Location</th>
                  <th className="px-4 py-3 text-center font-medium w-16">Sched.</th>
                  {admin && <th className="px-4 py-3 text-right font-medium w-24">Rate</th>}
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      {search ? `No items matching "${search}". Try a different search.` : "No items found."}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const low   = isLow(item);
                    const short = isShortfall(item);
                    return (
                      <tr key={item.id}
                        className={["border-b last:border-0 hover:bg-muted/30 transition-colors",
                          !item.is_active ? "opacity-60" : ""].join(" ")}>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(item.updated_at)}
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <Link href={`/dashboard/inventory/${item.id}`}
                            className="font-medium text-sm hover:underline truncate block"
                            title={item.name}>{item.name}</Link>
                          <div className="text-xs text-muted-foreground font-mono truncate">{item.code}</div>
                          {!item.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                        </td>
                        <td className={["px-4 py-3 text-right tabular-nums font-medium",
                          low ? "text-warning" : short ? "text-destructive" : ""].join(" ")}>
                          <div className="flex items-center justify-end gap-1">
                            {(low || short) && <AlertTriangle className="size-3 shrink-0" />}
                            {fmtQty(item.quantity_on_hand)} {item.unit_name}
                          </div>
                        </td>
                        {showRMCols && (
                          <td className="px-4 py-3 text-right tabular-nums text-xs">
                            {item.required_qty != null && item.required_qty > 0 ? (
                              <span className={item.required_qty > item.quantity_on_hand
                                ? "text-destructive font-medium" : "text-muted-foreground"}>
                                {fmtQty(item.required_qty)} {item.unit_name}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        )}
                        {showFGCols && (
                          <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate"
                            title={[item.vendor_name, item.customer_names].filter(Boolean).join(" · ") || ""}>
                            {item.vendor_name
                              ? <><span className="font-medium text-foreground/80">{item.vendor_name}</span>{item.customer_names ? <span className="ml-1">· {item.customer_names}</span> : null}</>
                              : (item.customer_names ?? "—")
                            }
                          </td>
                        )}
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px]">
                          {item.storage_type     && <div className="truncate" title={item.storage_type}>{item.storage_type}</div>}
                          {item.storage_location && <div className="truncate" title={item.storage_location}>{item.storage_location}</div>}
                          {!item.storage_type && !item.storage_location && "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.linked_schedule_count > 0 ? (
                            <Badge variant="secondary" className="text-xs">{item.linked_schedule_count}</Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        {admin && (
                          <td className="px-4 py-3 text-right text-xs tabular-nums">
                            {item.rate != null
                              ? `₹${item.rate.toFixed(2)}`
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-0.5">
                            <Button variant="ghost" size="icon" className="size-7" title="View Details"
                              onClick={() => router.push(`/dashboard/inventory/${item.id}`)}>
                              <Eye className="size-3.5 text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Add Stock"
                              onClick={() => { setAdjustType("add"); openAdjust(item); }}>
                              <PackagePlus className="size-3.5 text-success" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Remove Stock"
                              onClick={() => { setAdjustType("subtract"); openAdjust(item); }}>
                              <PackageMinus className="size-3.5 text-warning" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Edit"
                              onClick={() => router.push(`/dashboard/inventory/${item.id}/edit`)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            {admin && (
                              <Button variant="ghost" size="icon" className="size-7" title="History"
                                onClick={() => openHistory(item)}>
                                <History className="size-3.5 text-primary" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon"
                              className="size-7 text-destructive hover:text-destructive"
                              title="Deactivate" onClick={() => setDeleteId(item.id)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {!loading && items.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td colSpan={2} className="px-4 py-2 text-xs text-muted-foreground">
                      Showing {pageStart}–{pageEnd} of {total}
                    </td>
                    <td colSpan={admin ? 6 : 5} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} &mdash; {total} item{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-8"
                disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`e${i}`} className="px-1 text-muted-foreground text-sm">…</span>
                  ) : (
                    <Button key={p} variant={p === page ? "default" : "outline"} size="icon" className="size-8"
                      onClick={() => setPage(p as number)}>{p}</Button>
                  )
                )}
              <Button variant="outline" size="icon" className="size-8"
                disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
        </>
      </div>

      {/* ── Adjust Stock Dialog ────────────────────────────────────────────── */}
      <Dialog open={adjustItem !== null} onOpenChange={(o) => !o && setAdjustItem(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="mb-4">
            <DialogTitle>Adjust Stock — {adjustItem?.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {adjustItem?.code} · Current: <strong>{fmtQty(adjustItem?.quantity_on_hand)} {adjustItem?.unit_name}</strong>
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Adjustment Type</label>
              <div className="flex gap-2">
                {(["add", "subtract", "set"] as const).map((t) => (
                  <button key={t} onClick={() => setAdjustType(t)}
                    className={["flex-1 py-2 rounded-md text-sm font-medium border transition-colors capitalize",
                      adjustType === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input hover:bg-muted",
                    ].join(" ")}
                  >
                    {t === "add" ? "Add +" : t === "subtract" ? "Remove −" : "Set ="}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quantity</label>
              <input type="number" min="0" step="any" value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)} placeholder="Enter quantity"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Linked Schedule{" "}
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </label>
              <select value={adjustScheduleId} onChange={(e) => setAdjustScheduleId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— None —</option>
                {adjustSchedules.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.schedule_number} · {s.description} ({s.customer_name})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Note{" "}
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea rows={2} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="Reason for adjustment…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            {adjustError && <p className="text-sm text-destructive">{adjustError}</p>}
            <div className="flex gap-3 pt-2">
              <Button onClick={submitAdjust} disabled={adjustSaving} className="flex-1">
                {adjustSaving ? "Saving…" : "Apply Adjustment"}
              </Button>
              <Button variant="outline" onClick={() => setAdjustItem(null)} disabled={adjustSaving}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── History Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={historyItem !== null} onOpenChange={(o) => !o && setHistoryItem(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>History — {historyItem?.name}</span>
              <Button size="sm" variant="outline" onClick={printHistory}>
                <Printer className="size-3.5 mr-1" />Print
              </Button>
            </DialogTitle>
            <p className="text-sm text-muted-foreground">{historyItem?.code}</p>
          </DialogHeader>
          {historyLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : historyEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history found.</p>
          ) : (
            <div className="space-y-2">
              {historyEntries.map((e) => (
                <div key={e.id} className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant={e.change_type === "add" ? "default"
                        : e.change_type === "subtract" ? "destructive" : "secondary"}
                      className="text-xs">
                      {CHANGE_LABELS[e.change_type] ?? e.change_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{fmtDateTime(e.changed_at)}</span>
                  </div>
                  {(e.quantity_before != null || e.quantity_after != null) && (
                    <p className="text-xs text-muted-foreground">
                      {e.quantity_before != null ? `Before: ${fmtQty(e.quantity_before)}` : ""}
                      {e.quantity_after  != null ? ` → After: ${fmtQty(e.quantity_after)}` : ""}
                      {e.quantity_delta  != null
                        ? ` (${e.quantity_delta >= 0 ? "+" : ""}${fmtQty(e.quantity_delta)})`
                        : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {e.changed_by_username && <span>By: {e.changed_by_username}</span>}
                    {e.schedule_number     && <span>Schedule: {e.schedule_number}</span>}
                    {e.notes               && <span className="italic">{e.notes}</span>}
                  </div>
                </div>
              ))}
              {(historyPage > 1 || historyHasMore) && (
                <div className="flex items-center justify-between pt-3">
                  <Button size="sm" variant="outline" disabled={historyPage <= 1 || historyLoading} onClick={() => changeHistoryPage(historyPage - 1)}>← Prev</Button>
                  <span className="text-sm text-muted-foreground">Page {historyPage}</span>
                  <Button size="sm" variant="outline" disabled={!historyHasMore || historyLoading} onClick={() => changeHistoryPage(historyPage + 1)}>Next →</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Deactivate AlertDialog ─────────────────────────────────────────── */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate item?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the item as inactive. It can be restored via Edit.
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
