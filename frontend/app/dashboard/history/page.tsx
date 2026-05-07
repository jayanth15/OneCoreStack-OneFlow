"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import {
  Package, ShoppingCart, Megaphone, ClipboardList, Calendar,
  FlaskConical, Wrench, Scissors, Paperclip, History, ChevronDown,
  RotateCcw,
} from "lucide-react";

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
  { key: "inventory",          label: "Inventory",          Icon: Package },
  { key: "purchase-requests",  label: "Purchase Requests",  Icon: ShoppingCart },
  { key: "marketing-requests", label: "Marketing Requests", Icon: Megaphone },
  { key: "job-cards",          label: "Job Cards",          Icon: ClipboardList },
  { key: "schedules",          label: "Schedules",          Icon: Calendar },
  { key: "consumables",        label: "Consumables",        Icon: FlaskConical },
  { key: "spares",             label: "Spare Items",        Icon: Wrench },
  { key: "weeders",            label: "Weeders",            Icon: Scissors },
  { key: "attachments",        label: "Attachments",        Icon: Paperclip },
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
    type === "created"   ? "bg-green-100 text-green-700 border-green-200" :
    type === "deleted"   ? "bg-red-100 text-red-700 border-red-200" :
    type === "updated"   ? "bg-blue-100 text-blue-700 border-blue-200" :
    type === "approved"  ? "bg-teal-100 text-teal-700 border-teal-200" :
    type === "rejected"  ? "bg-orange-100 text-orange-700 border-orange-200" :
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
    <span className={`font-semibold tabular-nums ${pos ? "text-green-600" : "text-red-600"}`}>
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
  "inventory":          ["Item", "By", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
  "purchase-requests":  ["Request (SN)", "By", "Type", "Field", "Before", "After", "Note", "Date"],
  "marketing-requests": ["Request (SN)", "By", "Type", "Field", "Before", "After", "Note", "Date"],
  "job-cards":          ["Job Card", "By", "Type", "Field", "Before", "After", "Note", "Date"],
  "schedules":          ["Schedule", "By", "Type", "Old Status", "New Status", "Note", "Date"],
  "consumables":        ["Item", "By", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
  "spares":             ["Item", "By", "Variant", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
  "weeders":            ["Item", "By", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
  "attachments":        ["Item", "By", "Type", "Qty Before", "Qty After", "Delta", "Note", "Date"],
};

function RowCells({ tab, h }: { tab: TabKey; h: HistoryItem }) {
  if (tab === "inventory")          return <InventoryColumns h={h} />;
  if (tab === "purchase-requests")  return <RequestColumns h={h} />;
  if (tab === "marketing-requests") return <RequestColumns h={h} />;
  if (tab === "job-cards")          return <RequestColumns h={h} />;
  if (tab === "schedules")          return <ScheduleColumns h={h} />;
  if (tab === "consumables")        return <QtyColumns h={h} />;
  if (tab === "spares")             return <QtyColumns h={h} showVariant />;
  if (tab === "weeders")            return <QtyColumns h={h} />;
  if (tab === "attachments")        return <QtyColumns h={h} />;
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

// ── Main Component ─────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter();

  // Admin guard
  useEffect(() => {
    if (!isAdminOrAbove()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const [activeTab, setActiveTab] = useState<TabKey>("inventory");
  const [tabState, setTabState] = useState<Record<TabKey, TabState>>(
    () => Object.fromEntries(TABS.map(t => [t.key, { ...INITIAL_TAB_STATE }])) as Record<TabKey, TabState>
  );

  // Filters (shared across tabs — changing filter resets all tabs)
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");
  const [changedBy, setChangedBy] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildQuery = useCallback((page: number) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (startDate) params.set("start_date", startDate);
    if (endDate)   params.set("end_date",   endDate);
    if (changedBy) params.set("changed_by", changedBy);
    return params.toString();
  }, [startDate, endDate, changedBy]);

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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(applyFilters, 0);
  }

  const st = tabState[activeTab];
  const headers = HEADERS[activeTab];

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6 max-w-[1400px] mx-auto w-full">

      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbPage className="flex items-center gap-1.5"><History className="size-4" />History</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Audit log of all changes across the system. Admin only.</p>
      </div>

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
        {(startDate || endDate || changedBy) && (
          <Button size="sm" variant="ghost" className="gap-1.5 self-end h-8" onClick={resetFilters}>
            <RotateCcw className="size-3.5" />Reset
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5 border-b pb-1">
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

      {/* Table */}
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

    </div>
  );
}
