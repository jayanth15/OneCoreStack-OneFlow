"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { canAccessInventory, ALL_INVENTORY_TYPES } from "@/lib/user";
import { Printer, Search, ClipboardCheck, PackageSearch } from "lucide-react";
import { openPrintWindow } from "@/lib/print-report";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CycleRow {
  key: string;
  type: string;
  code: string;
  name: string;
  unit: string;
  qty: number;
  location: string;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface InventoryListItem {
  id: number;
  code: string;
  name: string;
  item_type: string;
  unit_name: string | null;
  quantity_on_hand: number;
  storage_type: string | null;
  storage_location: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SECTIONS: { type: string; label: string }[] = [
  { type: "finished_good", label: "Finished Goods" },
  { type: "raw_material",  label: "Raw Materials" },
  { type: "semi_finished", label: "Semi Finished" },
  { type: "scrap",         label: "Scraps" },
  { type: "spare",         label: "Spares" },
  { type: "consumable",    label: "Consumables" },
  { type: "attachment",    label: "Attachments" },
  { type: "weeder",        label: "Weeders" },
];

const SECTION_LABEL: Record<string, string> = Object.fromEntries(
  SECTIONS.map((s) => [s.type, s.label])
);

const TYPE_BADGE: Record<string, string> = {
  finished_good: "bg-tone-emerald/10 text-tone-emerald",
  raw_material:  "bg-tone-amber/15 text-tone-amber",
  semi_finished: "bg-tone-violet/10 text-tone-violet",
  scrap:         "bg-rose-100 text-rose-700",
  spare:         "bg-warning/15 text-warning",
  consumable:    "bg-tone-violet/10 text-tone-violet",
  attachment:    "bg-primary/10 text-primary",
  weeder:        "bg-success/10 text-success",
};

const DEFAULT_TYPE = "finished_good";

function fmtQty(n: number | null | undefined) {
  if (n == null) return "—";
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}

function fmtLocation(...parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(" · ") || "—";
}

const EMPTY_PAGE: Paginated<never> = { items: [], total: 0, page: 1, page_size: 500, pages: 1 };

// ── Per-type loaders (only the selected type is fetched) ─────────────────────

async function loadMainInventoryType(itemType: string): Promise<CycleRow[]> {
  const inv = await apiFetchJson<Paginated<InventoryListItem>>(
    `/api/v1/inventory?item_type=${itemType}&page_size=500&include_inactive=false`
  ).catch(() => EMPTY_PAGE);
  return (inv.items ?? []).map((item) => ({
    key: `inv-${item.id}`,
    type: item.item_type,
    code: item.code,
    name: item.name,
    unit: item.unit_name ?? "—",
    qty: item.quantity_on_hand,
    location: fmtLocation(item.storage_type, item.storage_location),
  }));
}

async function loadConsumables(): Promise<CycleRow[]> {
  const con = await apiFetchJson<Paginated<{
    id: number; name: string; code: string | null;
    qty: number; storage_type: string | null; storage_location: string | null;
  }>>("/api/v1/consumables?page_size=500&include_inactive=false").catch(() => EMPTY_PAGE);
  return (con.items ?? []).map((c) => ({
    key: `con-${c.id}`,
    type: "consumable",
    code: c.code ?? "—",
    name: c.name,
    unit: "—",
    qty: c.qty,
    location: fmtLocation(c.storage_type, c.storage_location),
  }));
}

async function loadAttachments(): Promise<CycleRow[]> {
  const att = await apiFetchJson<Paginated<{
    id: number; sn_no: string | null; description: string | null;
    qty: number; storage_location: string | null;
  }>>("/api/v1/attachments?page_size=500&include_inactive=false").catch(() => EMPTY_PAGE);
  return (att.items ?? []).map((a) => ({
    key: `att-${a.id}`,
    type: "attachment",
    code: a.sn_no ?? "—",
    name: a.description ?? "—",
    unit: "—",
    qty: a.qty,
    location: fmtLocation(a.storage_location),
  }));
}

async function loadWeeders(): Promise<CycleRow[]> {
  const wee = await apiFetchJson<Paginated<{
    id: number; name: string | null; sn_no: string | null;
    qty: number; storage_location: string | null;
  }>>("/api/v1/weeders?page_size=500&include_inactive=false").catch(() => EMPTY_PAGE);
  return (wee.items ?? []).map((w) => ({
    key: `wee-${w.id}`,
    type: "weeder",
    code: w.sn_no ?? "—",
    name: w.name ?? w.sn_no ?? "—",
    unit: "—",
    qty: w.qty,
    location: fmtLocation(w.storage_location),
  }));
}

async function loadSpares(): Promise<CycleRow[]> {
  const rows: CycleRow[] = [];
  const cats = await apiFetchJson<{ items: { id: number; name: string }[] }>(
    "/api/v1/spares/categories?page_size=200&include_inactive=false"
  ).catch(() => ({ items: [] }));
  for (const cat of cats.items ?? []) {
    const subs = await apiFetchJson<{ id: number; name: string }[]>(
      `/api/v1/spares/categories/${cat.id}/sub-categories?page_size=200`
    ).catch(() => []);
    for (const sub of Array.isArray(subs) ? subs : []) {
      const items = await apiFetchJson<Paginated<{
        id: number; name: string; part_number: string | null;
        unit_name: string | null; recorded_qty: number; storage_location: string | null;
      }>>(`/api/v1/spares/sub-categories/${sub.id}/items?page_size=200&include_inactive=false`)
        .catch(() => ({ ...EMPTY_PAGE, page_size: 200 }));
      for (const item of items.items ?? []) {
        const variants = await apiFetchJson<{
          id: number; variant_color: string | null; serial_number: string | null;
          qty: number; storage_location: string | null;
        }[]>(`/api/v1/spares/items/${item.id}/variants`).catch(() => []);
        const vlist = Array.isArray(variants) ? variants : [];
        if (vlist.length > 0) {
          vlist.forEach((v) => {
            const label = [v.variant_color, v.serial_number].filter(Boolean).join(" / ");
            rows.push({
              key: `spa-${item.id}-v${v.id}`,
              type: "spare",
              code: item.part_number ?? "—",
              name: label ? `${item.name} — ${label}` : item.name,
              unit: item.unit_name ?? "—",
              qty: v.qty,
              location: fmtLocation(v.storage_location),
            });
          });
        } else {
          rows.push({
            key: `spa-${item.id}`,
            type: "spare",
            code: item.part_number ?? "—",
            name: item.name,
            unit: item.unit_name ?? "—",
            qty: item.recorded_qty,
            location: fmtLocation(item.storage_location),
          });
        }
      }
    }
  }
  return rows;
}

function loadRowsForType(type: string): Promise<CycleRow[]> {
  switch (type) {
    case "consumable": return loadConsumables();
    case "attachment": return loadAttachments();
    case "weeder":     return loadWeeders();
    case "spare":      return loadSpares();
    default:           return loadMainInventoryType(type);
  }
}

// ── Lightweight counts (one small request per type, for the chips) ───────────

async function fetchCount(url: string): Promise<number | null> {
  try {
    const d = await apiFetchJson<{ total: number }>(url);
    return typeof d.total === "number" ? d.total : null;
  } catch { return null; }
}

async function loadChipCounts(): Promise<Record<string, number | null>> {
  const [fg, rm, sf, scrap, con, att, wee] = await Promise.all([
    fetchCount("/api/v1/inventory?item_type=finished_good&page_size=1&include_inactive=false"),
    fetchCount("/api/v1/inventory?item_type=raw_material&page_size=1&include_inactive=false"),
    fetchCount("/api/v1/inventory?item_type=semi_finished&page_size=1&include_inactive=false"),
    fetchCount("/api/v1/inventory?item_type=scrap&page_size=1&include_inactive=false"),
    fetchCount("/api/v1/consumables?page_size=1&include_inactive=false"),
    fetchCount("/api/v1/attachments?page_size=1&include_inactive=false"),
    fetchCount("/api/v1/weeders?page_size=1&include_inactive=false"),
  ]);
  let spareCount: number | null = null;
  const cats = await apiFetchJson<{ items: { item_count: number }[] }>(
    "/api/v1/spares/categories?page_size=200&include_inactive=false"
  ).catch(() => ({ items: [] }));
  if (Array.isArray(cats.items)) {
    spareCount = cats.items.reduce((sum, c) => sum + (c.item_count ?? 0), 0);
  }
  return { finished_good: fg, raw_material: rm, semi_finished: sf, scrap, consumable: con, attachment: att, weeder: wee, spare: spareCount };
}

// ── Main component ────────────────────────────────────────────────────────────

function CycleCountPage() {
  const router = useRouter();

  const [typeFilter, setTypeFilter] = useState(DEFAULT_TYPE);
  const [view, setView] = useState<{ type: string; rows: CycleRow[] | null; error: string | null }>({
    type: DEFAULT_TYPE,
    rows: null,
    error: null,
  });
  const [chipCounts, setChipCounts] = useState<Record<string, number | null>>({});
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");

  // If the user has no inventory access at all, bail out to the landing page.
  useEffect(() => {
    if (!ALL_INVENTORY_TYPES.some((t) => canAccessInventory(t))) {
      router.replace("/dashboard/inventory");
    }
  }, [router]);

  const accessibleTypes = useMemo(
    () => new Set(SECTIONS.map((s) => s.type).filter((t) => canAccessInventory(t))),
    []
  );

  const sections = useMemo(
    () => SECTIONS.filter((s) => accessibleTypes.has(s.type)),
    [accessibleTypes]
  );

  // If the requested type isn't accessible, fall back to the first accessible one.
  const effectiveType = accessibleTypes.has(typeFilter)
    ? typeFilter
    : (sections[0]?.type ?? DEFAULT_TYPE);

  // Lightweight per-type counts for the chips (fetched once).
  useEffect(() => {
    let cancelled = false;
    loadChipCounts().then((c) => { if (!cancelled) setChipCounts(c); });
    return () => { cancelled = true; };
  }, []);

  // Fetch rows — only the selected type is loaded, on every type change.
  useEffect(() => {
    let cancelled = false;
    loadRowsForType(effectiveType)
      .then((r) => {
        if (!cancelled) {
          setView({ type: effectiveType, rows: r, error: null });
          setSearch("");
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setView({
            type: effectiveType,
            rows: null,
            error: e instanceof Error ? e.message : "Failed to load inventory",
          });
        }
      });
    return () => { cancelled = true; };
  }, [effectiveType]);

  const loading = view.rows === null || view.type !== effectiveType;
  const error = loading ? null : view.error;
  const rows = view.rows;

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (term) {
        const hay = `${r.code} ${r.name} ${r.location}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, search]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) =>
      (a.code ?? "").localeCompare(b.code ?? "") || a.name.localeCompare(b.name)
    ),
    [filtered]
  );

  function selectType(t: string) {
    setTypeFilter(t);
  }

  function printSheet() {
    if (sorted.length === 0) return;
    const rowsForPrint = sorted.map((r) => ({
      Type: SECTION_LABEL[r.type] ?? r.type,
      Code: r.code,
      Name: r.name,
      Unit: r.unit,
      "System Qty": String(r.qty),
      "Physical Count": "",
      Variance: "",
      Location: r.location,
      "Counter Initials": "",
      Notes: "",
    }));
    openPrintWindow({
      title: "Inventory Cycle Count",
      mode: "cycle-count",
      columns: ["Type", "Code", "Name", "Unit", "System Qty", "Physical Count", "Variance", "Location", "Counter Initials", "Notes"],
      rows: rowsForPrint,
      extraHeader: `Type: ${SECTION_LABEL[effectiveType]}`,
    });
  }

  return (
    <>
      <PageHeader
        title="Cycle Count"
        description="Count one inventory type at a time — pick a type below."
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Cycle Count" },
        ]}
        actions={
          <Button size="sm" variant="outline" onClick={printSheet} disabled={loading || sorted.length === 0}>
            <Printer className="size-4 mr-1" />Print
          </Button>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Cycle Count</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Every item of the selected inventory type on one sheet — print it and record physical counts.
          </p>
        </div>

        {/* Type chips */}
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => {
            const count = chipCounts[s.type];
            const active = effectiveType === s.type;
            return (
              <button
                key={s.type}
                onClick={() => selectType(s.type)}
                className={`flex items-center gap-1.5 text-xs rounded-md border px-3 py-1.5 transition-colors cursor-pointer ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-input bg-card hover:bg-muted"
                }`}
                title={`Count ${s.label}`}
              >
                {s.label}
                <span className={active ? "" : "text-muted-foreground"}>
                  ({count === null || count === undefined ? "…" : count})
                </span>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <select
            value={effectiveType}
            onChange={(e) => selectType(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring w-44"
            disabled={loading}
          >
            {sections.map((s) => (
              <option key={s.type} value={s.type}>{s.label}</option>
            ))}
          </select>
          <form
            key={effectiveType}
            onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); }}
            className="flex gap-1.5 shrink-0"
          >
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search code / name / location…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-56"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
            {search && (
              <Button type="button" size="sm" variant="ghost" onClick={() => { setSearch(""); setSearchDraft(""); }}>
                Clear
              </Button>
            )}
          </form>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Table */}
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium w-32">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Code</th>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium w-20">Unit</th>
                  <th className="px-4 py-3 text-right font-medium w-28">System Qty</th>
                  <th className="px-4 py-3 text-left font-medium">Storage / Location</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                    </tr>
                  ))
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <PackageSearch className="size-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {search
                          ? `No items matching "${search}" in ${SECTION_LABEL[effectiveType]}.`
                          : `No ${SECTION_LABEL[effectiveType]} to count yet.`}
                      </p>
                    </td>
                  </tr>
                ) : (
                  sorted.map((r) => (
                    <tr key={r.key} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`text-xs ${TYPE_BADGE[r.type] ?? ""}`}>
                          {SECTION_LABEL[r.type] ?? r.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{r.code}</td>
                      <td className="px-4 py-2.5 max-w-[280px] truncate" title={r.name}>{r.name}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.unit}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmtQty(r.qty)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate" title={r.location}>{r.location}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {!loading && sorted.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td colSpan={6} className="px-4 py-2 text-xs text-muted-foreground">
                      <ClipboardCheck className="size-3.5 inline mr-1 -mt-0.5" />
                      {sorted.length} item{sorted.length !== 1 ? "s" : ""} on this sheet · {SECTION_LABEL[effectiveType]}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function CycleCountPageWrapper() {
  return (
    <Suspense fallback={
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    }>
      <CycleCountPage />
    </Suspense>
  );
}
