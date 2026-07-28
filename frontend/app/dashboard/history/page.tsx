"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import {
  Package, ShoppingCart, Megaphone, ClipboardList, Calendar,
  FlaskConical, Wrench, Scissors, Paperclip, ChevronDown,
  RotateCcw, Box, PackageCheck, Layers, Recycle, PackageSearch, Truck,
  LayoutGrid, Rows3, ArrowRight, User, Printer,
} from "lucide-react";
import { fetchAllPages, openPrintWindow } from "@/lib/print-report";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HistoryItem {
  id: number;
  entity_id: number;
  entity_name: string | null;
  changed_by_username: string | null;
  changed_at: string;
  change_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  qty_before: number | null;
  qty_after: number | null;
  qty_delta: number | null;
  variant_label: string | null;
}

interface HistoryPage {
  items: HistoryItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface TabState {
  items: HistoryItem[];
  total: number;
  page: number;
  total_pages: number;
  loaded: boolean;
  loading: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: "raw-materials",      label: "Raw Materials",      Icon: Package },
  { key: "finished-goods",     label: "Finished Goods",     Icon: PackageCheck },
  { key: "semi-finished",      label: "Semi-Finished",      Icon: Layers },
  { key: "scraps",             label: "Scraps",             Icon: Recycle },
  { key: "consumables",        label: "Consumables",        Icon: FlaskConical },
  { key: "spares",             label: "Spare Items",        Icon: Wrench },
  { key: "weeders",            label: "Weeders",            Icon: Scissors },
  { key: "attachments",        label: "Attachments",        Icon: Paperclip },
  { key: "purchase-requests",  label: "Purchase Requests",  Icon: ShoppingCart },
  { key: "marketing-requests", label: "Marketing Requests", Icon: Megaphone },
  { key: "job-cards",          label: "Job Cards",          Icon: ClipboardList },
  { key: "schedules",          label: "Schedules",          Icon: Calendar },
  { key: "dispatches",         label: "Dispatches",         Icon: Truck },
  { key: "gate-passes",        label: "Gate Passes",        Icon: PackageSearch },
] as const;

type TabKey = typeof TABS[number]["key"];

const PAGE_SIZE = 100;

const INITIAL_TAB_STATE: TabState = {
  items: [],
  total: 0,
  page: 1,
  total_pages: 1,
  loaded: false,
  loading: false,
};

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function ChangeTypeBadge({ type }: { type: string }) {
  const color =
    type === "created"   ? "bg-success/10 text-success border-success/20" :
    type === "deleted"   ? "bg-destructive/10 text-destructive border-destructive/20" :
    type === "updated"   ? "bg-primary/10 text-primary border-primary/20" :
    type === "approved"  ? "bg-tone-emerald/10 text-tone-emerald border-teal-200" :
    type === "rejected"  ? "bg-tone-amber/15 text-tone-amber border-orange-200" :
    type === "received"  ? "bg-purple-100 text-purple-700 border-purple-200" :
                           "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-muted-foreground">—</span>;
  const pos = delta > 0;
  return (
    <span className={`font-semibold tabular-nums ${pos ? "text-success" : "text-destructive"}`}>
      {pos ? "+" : ""}{delta}
    </span>
  );
}

// ── Column renderers per category ─────────────────────────────────────────────

function InventoryColumns({ h }: { h: HistoryItem }) {
  return (
    <>
      <td className="px-3 py-2">{h.entity_name ?? "—"}</td>
      <td className="px-3 py-2 text-xs font-medium">{h.changed_by_username ?? "—"}</td>
      <td className="px-3 py-2"><ChangeTypeBadge type={h.change_type} /></td>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">{h.qty_before ?? "—"}</td>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">{h.qty_after ?? "—"}</td>
      <td className="px-3 py-2"><DeltaBadge delta={h.qty_delta} /></td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{h.note ?? "—"}</td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(h.changed_at)}</td>
    </>
  );
}

function RequestColumns({ h }: { h: HistoryItem }) {
  return (
    <>
      <td className="px-3 py-2 font-mono text-xs">{h.entity_name ?? "—"}</td>
      <td className="px-3 py-2 text-xs font-medium">{h.changed_by_username ?? "—"}</td>
      <td className="px-3 py-2"><ChangeTypeBadge type={h.change_type} /></td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{h.field_name ?? "—"}</td>
      <td className="px-3 py-2 text-xs max-w-[10rem] truncate" title={h.old_value ?? undefined}>{h.old_value ?? "—"}</td>
      <td className="px-3 py-2 text-xs max-w-[10rem] truncate" title={h.new_value ?? undefined}>{h.new_value ?? "—"}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{h.note ?? "—"}</td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(h.changed_at)}</td>
    </>
  );
}

function ScheduleColumns({ h }: { h: HistoryItem }) {
  return (
    <>
      <td className="px-3 py-2">{h.entity_name ?? "—"}</td>
      <td className="px-3 py-2 text-xs font-medium">{h.changed_by_username ?? "—"}</td>
      <td className="px-3 py-2"><ChangeTypeBadge type={h.change_type} /></td>
      <td className="px-3 py-2 text-xs max-w-[8rem] truncate" title={h.old_value ?? undefined}>{h.old_value ?? "—"}</td>
      <td className="px-3 py-2 text-xs max-w-[8rem] truncate" title={h.new_value ?? undefined}>{h.new_value ?? "—"}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{h.note ?? "—"}</td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(h.changed_at)}</td>
    </>
  );
}

function QtyColumns({ h, showVariant }: { h: HistoryItem; showVariant?: boolean }) {
  return (
    <>
      <td className="px-3 py-2">{h.entity_name ?? "—"}</td>
      <td className="px-3 py-2 text-xs font-medium">{h.changed_by_username ?? "—"}</td>
      {showVariant && <td className="px-3 py-2 text-xs text-muted-foreground">{h.variant_label ?? "—"}</td>}
      <td className="px-3 py-2"><ChangeTypeBadge type={h.change_type} /></td>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">{h.qty_before ?? "—"}</td>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">{h.qty_after ?? "—"}</td>
      <td className="px-3 py-2"><DeltaBadge delta={h.qty_delta} /></td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{h.note ?? "—"}</td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(h.changed_at)}</td>
    </>
  );
}

// ── Header definitions ─────────────────────────────────────────────────────────

const HEADERS: Record<TabKey, string[]> = {
  "raw-materials":      ["Item", "By", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
  "finished-goods":     ["Item", "By", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
  "semi-finished":      ["Item", "By", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
  "scraps":             ["Item", "By", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
  "purchase-requests":  ["Request (SN)", "By", "Type", "Field", "Before", "After", "Note", "Date"],
  "marketing-requests": ["Request (SN)", "By", "Type", "Field", "Before", "After", "Note", "Date"],
  "job-cards":          ["Job Card", "By", "Type", "Field", "Before", "After", "Note", "Date"],
  "schedules":          ["Schedule", "By", "Type", "Old Status", "New Status", "Note", "Date"],
  "consumables":        ["Item", "By", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
  "spares":             ["Item", "By", "Variant", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
  "weeders":            ["Item", "By", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
  "attachments":        ["Item", "By", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
  "dispatches":         ["Dispatch #", "By", "Type", "Old Status", "New Status", "Note", "Date"],
  "gate-passes":        ["Gate Pass #", "By", "Type", "Old Status", "New Status", "Note", "Date"],
};

function RowCells({ tab, h }: { tab: TabKey; h: HistoryItem }) {
  if (tab === "raw-materials")      return <InventoryColumns h={h} />;
  if (tab === "finished-goods")     return <InventoryColumns h={h} />;
  if (tab === "semi-finished")      return <InventoryColumns h={h} />;
  if (tab === "scraps")             return <InventoryColumns h={h} />;
  if (tab === "purchase-requests")  return <RequestColumns h={h} />;
  if (tab === "marketing-requests") return <RequestColumns h={h} />;
  if (tab === "job-cards")          return <RequestColumns h={h} />;
  if (tab === "schedules")          return <ScheduleColumns h={h} />;
  if (tab === "consumables")        return <QtyColumns h={h} />;
  if (tab === "spares")             return <QtyColumns h={h} showVariant />;
  if (tab === "weeders")            return <QtyColumns h={h} />;
  if (tab === "attachments")        return <QtyColumns h={h} />;
  if (tab === "dispatches")         return <ScheduleColumns h={h} />;
  if (tab === "gate-passes")        return <ScheduleColumns h={h} />;
  return null;
}

// ── Skeleton rows ──────────────────────────────────────────────────────────────

function SkeletonRows({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-3 py-2.5">
              <Skeleton className="h-4 w-full rounded" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── History Card (card-view renderer) ─────────────────────────────────────────

function HistoryCard({ tab, h }: { tab: TabKey; h: HistoryItem }) {
  const isQty = tab === "raw-materials" || tab === "finished-goods" ||
                tab === "semi-finished" || tab === "scraps" ||
                tab === "consumables" || tab === "spares" ||
                tab === "weeders" || tab === "attachments";
  const isStatus = tab === "schedules" || tab === "dispatches" || tab === "gate-passes";

  return (
    <div className="rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow">
      {/* Top row: entity name + change type badge */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{h.entity_name ?? "—"}</p>
          {h.variant_label && (
            <p className="text-xs text-muted-foreground truncate">{h.variant_label}</p>
          )}
        </div>
        <ChangeTypeBadge type={h.change_type} />
      </div>

      {/* Middle: change detail */}
      <div className="text-xs space-y-1.5">
        {isQty && h.qty_before != null && h.qty_after != null ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-muted-foreground tabular-nums">{h.qty_before}</span>
            <ArrowRight className="size-3 text-muted-foreground" />
            <span className="font-mono font-semibold text-foreground tabular-nums">{h.qty_after}</span>
            <DeltaBadge delta={h.qty_delta} />
          </div>
        ) : isStatus && (h.old_value || h.new_value) ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            {h.old_value && (
              <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground line-through text-[10px]">
                {h.old_value}
              </span>
            )}
            {h.old_value && h.new_value && <ArrowRight className="size-3 text-muted-foreground" />}
            {h.new_value && (
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                {h.new_value}
              </span>
            )}
          </div>
        ) : (h.old_value || h.new_value) ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            {h.field_name && <span className="text-muted-foreground">{h.field_name}:</span>}
            {h.old_value && (
              <span className="font-mono text-muted-foreground line-through">{h.old_value}</span>
            )}
            {h.old_value && h.new_value && <ArrowRight className="size-3 text-muted-foreground" />}
            {h.new_value && <span className="font-mono font-semibold">{h.new_value}</span>}
          </div>
        ) : null}
        {h.note && <p className="text-muted-foreground italic truncate" title={h.note}>"{h.note}"</p>}
      </div>

      {/* Bottom: by user + date */}
      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1 truncate">
          <User className="size-3" />
          {h.changed_by_username ?? "—"}
        </span>
        <span className="whitespace-nowrap">{fmtDate(h.changed_at)}</span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter();

  // Admin guard
  useEffect(() => {
    if (!isAdminOrAbove()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const [activeTab, setActiveTab] = useState<TabKey>("raw-materials");
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [tabState, setTabState] = useState<Record<TabKey, TabState>>(
    () => Object.fromEntries(TABS.map(t => [t.key, { ...INITIAL_TAB_STATE }])) as Record<TabKey, TabState>
  );

  // Filters (shared across tabs — changing filter resets all tabs)
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");
  const [changedBy, setChangedBy] = useState("");
  const [entityName, setEntityName] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildQuery = useCallback((page: number) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (startDate) params.set("start_date", startDate);
    if (endDate)   params.set("end_date",   endDate);
    if (changedBy) params.set("changed_by", changedBy);
    if (entityName) params.set("entity_name", entityName);
    return params.toString();
  }, [startDate, endDate, changedBy, entityName]);

  const loadTab = useCallback(async (tab: TabKey, page: number, append: boolean) => {
    setTabState(prev => ({
      ...prev,
      [tab]: { ...prev[tab], loading: true },
    }));
    try {
      const data: HistoryPage = await apiFetchJson(`/api/v1/history/${tab}?${buildQuery(page)}`);
      setTabState(prev => ({
        ...prev,
        [tab]: {
          items: append ? [...prev[tab].items, ...data.items] : data.items,
          total: data.total,
          page: data.page,
          total_pages: data.total_pages,
          loaded: true,
          loading: false,
        },
      }));
    } catch {
      setTabState(prev => ({
        ...prev,
        [tab]: { ...prev[tab], loading: false, loaded: true },
      }));
    }
  }, [buildQuery]);

  // Load active tab on mount / tab switch (only if not already loaded)
  useEffect(() => {
    const st = tabState[activeTab];
    if (!st.loaded && !st.loading) {
      loadTab(activeTab, 1, false);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // On filter change: debounce 400 ms, reset + reload active tab; clear loaded on all others
  const applyFilters = useCallback(() => {
    setTabState(
      Object.fromEntries(TABS.map(t => [t.key, { ...INITIAL_TAB_STATE }])) as Record<TabKey, TabState>
    );
    // loadTab will be triggered by the useEffect above when tabState[activeTab].loaded becomes false
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When tabState is reset, the activeTab will have loaded=false, triggering a reload
  useEffect(() => {
    const st = tabState[activeTab];
    if (!st.loaded && !st.loading) {
      loadTab(activeTab, 1, false);
    }
  }, [tabState, activeTab, loadTab]);

  function handleFilterChange(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(applyFilters, 400);
    };
  }

  function resetFilters() {
    setStartDate("");
    setEndDate("");
    setChangedBy("");
    setEntityName("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(applyFilters, 0);
  }

  async function printHistory() {
    const label = TABS.find(t => t.key === activeTab)?.label ?? activeTab;
    const allItems = await fetchAllPages(async (page, pageSize) => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      if (changedBy) params.set("changed_by", changedBy);
      if (entityName) params.set("entity_name", entityName);
      const data = await apiFetchJson<HistoryPage>(`/api/v1/history/${activeTab}?${params}`);
      return { items: data.items, total: data.total, page: data.page, page_size: data.page_size, pages: data.total_pages };
    });
    openPrintWindow({
      title: `History — ${label}`,
      subtitle: `${allItems.length} record${allItems.length !== 1 ? "s" : ""}`,
      mode: "audit-snapshot",
      columns: HEADERS[activeTab],
      rows: allItems.map(h => {
        const inventory = ["raw-materials", "finished-goods", "semi-finished", "scraps", "consumables", "weeders", "attachments"];
        const requests = ["purchase-requests", "marketing-requests", "job-cards"];
        const status = ["schedules", "dispatches", "gate-passes"];
        if (inventory.includes(activeTab)) {
          return { "Item": h.entity_name ?? "—", "By": h.changed_by_username ?? "—", "Type": h.change_type, "Qty Before": h.qty_before ?? "—", "Qty After": h.qty_after ?? "—", "Delta": h.qty_delta ?? "—", "Note": h.note ?? "—", "Date": fmtDate(h.changed_at) };
        }
        if (requests.includes(activeTab)) {
          return { "Request": h.entity_name ?? "—", "By": h.changed_by_username ?? "—", "Type": h.change_type, "Field": h.field_name ?? "—", "Before": h.old_value ?? "—", "After": h.new_value ?? "—", "Note": h.note ?? "—", "Date": fmtDate(h.changed_at) };
        }
        if (status.includes(activeTab)) {
          return { "Entity": h.entity_name ?? "—", "By": h.changed_by_username ?? "—", "Type": h.change_type, "Old": h.old_value ?? "—", "New": h.new_value ?? "—", "Note": h.note ?? "—", "Date": fmtDate(h.changed_at) };
        }
        if (activeTab === "spares") {
          return { "Item": h.entity_name ?? "—", "By": h.changed_by_username ?? "—", "Variant": h.variant_label ?? "—", "Type": h.change_type, "Qty Before": h.qty_before ?? "—", "Qty After": h.qty_after ?? "—", "Delta": h.qty_delta ?? "—", "Note": h.note ?? "—", "Date": fmtDate(h.changed_at) };
        }
        return {};
      }),
    });
  }

  const st = tabState[activeTab];
  const headers = HEADERS[activeTab];

  return (
    <>
      <PageHeader
        title="History"
        description="Audit log of all changes across the system. Admin only."
        breadcrumbs={[{ label: "History" }]}
      />

      <div className="flex flex-1 flex-col gap-5 p-4 md:p-6 max-w-[1400px] mx-auto w-full">

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="space-y-1 min-w-[10rem]">
          <Label className="text-xs">From</Label>
          <Input type="date" value={startDate} onChange={e => handleFilterChange(setStartDate)(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1 min-w-[10rem]">
          <Label className="text-xs">To</Label>
          <Input type="date" value={endDate} onChange={e => handleFilterChange(setEndDate)(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1 min-w-[12rem]">
          <Label className="text-xs">Changed by</Label>
          <Input placeholder="Username…" value={changedBy} onChange={e => handleFilterChange(setChangedBy)(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1 min-w-[14rem]">
          <Label className="text-xs">Item / Entity name</Label>
          <Input placeholder="Search…" value={entityName} onChange={e => handleFilterChange(setEntityName)(e.target.value)} className="h-8 text-sm" />
        </div>
        {(startDate || endDate || changedBy || entityName) && (
          <Button size="sm" variant="ghost" className="gap-1.5 self-end h-8" onClick={resetFilters}>
            <RotateCcw className="size-3.5" />Reset
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap items-end gap-1.5 border-b pb-1">
        <div className="flex flex-wrap gap-1.5 flex-1">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-sm font-medium transition-colors
                ${activeTab === key
                  ? "bg-background border border-b-background border-b-white -mb-px text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
        {/* View mode toggle */}
        <div className="flex rounded-md border bg-card p-0.5 ml-auto">
          <button
            onClick={() => setViewMode("cards")}
            title="Card view"
            className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
              viewMode === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="size-3.5" />Cards
          </button>
          <button
            onClick={() => setViewMode("table")}
            title="Table view"
            className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
              viewMode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Rows3 className="size-3.5" />Table
          </button>
          <button
            onClick={printHistory}
            title="Print"
            className="px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors text-muted-foreground hover:text-foreground"
          >
            <Printer className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "cards" ? (
        <div className="rounded-lg border bg-card p-3">
          {st.loading && st.items.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : st.items.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-12">No history found.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {st.items.map(h => <HistoryCard key={h.id} tab={activeTab} h={h} />)}
              </div>
              {st.loading && st.items.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
                </div>
              )}
            </>
          )}
          {st.loaded && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs text-muted-foreground">
              <span>Showing {st.items.length} of {st.total} records</span>
              {st.page < st.total_pages && (
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                  disabled={st.loading} onClick={() => loadTab(activeTab, st.page + 1, true)}>
                  <ChevronDown className="size-3.5" />Load more
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b text-left">
                {headers.map(h => (
                  <th key={h} className="px-3 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {st.loading && st.items.length === 0 ? (
                <SkeletonRows cols={headers.length} />
              ) : st.items.length === 0 ? (
                <tr>
                  <td colSpan={headers.length} className="px-3 py-12 text-center text-muted-foreground text-sm">
                    No history found.
                  </td>
                </tr>
              ) : (
                st.items.map(h => (
                  <tr key={h.id} className="border-b hover:bg-muted/30 transition-colors">
                    <RowCells tab={activeTab} h={h} />
                  </tr>
                ))
              )}
              {/* Inline load-more skeleton */}
              {st.loading && st.items.length > 0 && (
                <SkeletonRows cols={headers.length} rows={4} />
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: count + load more */}
        {st.loaded && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
            <span>
              Showing {st.items.length} of {st.total} records
            </span>
            {st.page < st.total_pages && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs"
                disabled={st.loading}
                onClick={() => loadTab(activeTab, st.page + 1, true)}
              >
                <ChevronDown className="size-3.5" />Load more
              </Button>
            )}
          </div>
        )}
      </div>
      )}

    </div>
    </>
  );
}
