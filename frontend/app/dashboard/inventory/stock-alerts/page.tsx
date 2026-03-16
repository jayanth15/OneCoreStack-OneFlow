"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { AlertTriangle, Printer, Package, Wrench, RefreshCw } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpareLowStockItem {
  item_id: number;
  item_name: string;
  part_number: string | null;
  category_name: string;
  sub_category_name: string;
  recorded_qty: number;
  reorder_level: number;
  unit: string;
}

interface ConsumableLowStockItem {
  item_id: number;
  name: string;
  code: string | null;
  qty: number;
  reorder_level: number;
}

interface UnifiedRow {
  key: string;
  type: "spare" | "consumable";
  name: string;
  code: string | null;
  category: string;
  qty: number;
  reorder_level: number;
  unit: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StockAlertsPage() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qtyNeeded, setQtyNeeded] = useState<Record<string, string>>({});
  const printRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiFetchJson<{ spares: SpareLowStockItem[]; consumables: ConsumableLowStockItem[] }>(
        "/api/v1/dashboard/low-stock"
      );
      const unified: UnifiedRow[] = [
        ...d.spares.map((s): UnifiedRow => ({
          key: `spare-${s.item_id}`,
          type: "spare",
          name: s.item_name,
          code: s.part_number,
          category: `${s.category_name} / ${s.sub_category_name}`,
          qty: s.recorded_qty,
          reorder_level: s.reorder_level,
          unit: s.unit,
        })),
        ...d.consumables.map((c): UnifiedRow => ({
          key: `con-${c.item_id}`,
          type: "consumable",
          name: c.name,
          code: c.code,
          category: "Consumables",
          qty: c.qty,
          reorder_level: c.reorder_level,
          unit: "",
        })),
      ];
      setRows(unified);
      setSelected(new Set(unified.map(r => r.key)));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line

  // ── Selection helpers ─────────────────────────────────────────────────────
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.key)));
  const toggle = (key: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  // ── Print ─────────────────────────────────────────────────────────────────
  const selectedRows = rows.filter(r => selected.has(r.key));

  function handlePrint() {
    const style = `
      <style>
        body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; color: #111; }
        h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
        .sub { font-size: 12px; color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f4f4f5; text-align: left; padding: 8px 10px; border: 1px solid #e4e4e7; font-weight: 600; }
        td { padding: 7px 10px; border: 1px solid #e4e4e7; }
        .type-spare { color: #7c3aed; font-weight: 600; }
        .type-consumable { color: #1d4ed8; font-weight: 600; }
        .low { color: #b45309; font-weight: 600; }
        .qty-needed { color: #15803d; font-weight: 600; }
        @media print { @page { margin: 20mm; } }
      </style>`;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">${style}</head><body>
      <h1>&#9888; Stock Alert / Purchase Request</h1>
      <div class="sub">Generated on ${new Date().toLocaleString("en-IN")} &nbsp;|&nbsp; ${selectedRows.length} item${selectedRows.length !== 1 ? "s" : ""}</div>
      <table>
        <thead><tr>
          <th>#</th><th>Type</th><th>Name / Code</th><th>Category</th>
          <th style="text-align:right">Current Qty</th>
          <th style="text-align:right">Reorder Level</th>
          <th style="text-align:right">Qty Needed</th>
        </tr></thead>
        <tbody>
          ${selectedRows.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="${r.type === "spare" ? "type-spare" : "type-consumable"}">${r.type === "spare" ? "Spare" : "Consumable"}</td>
              <td><strong>${r.name}</strong>${r.code ? `<br><span style="color:#666;font-family:monospace">${r.code}</span>` : ""}</td>
              <td style="color:#666">${r.category}</td>
              <td style="text-align:right" class="low">${r.qty % 1 === 0 ? r.qty.toFixed(0) : r.qty.toFixed(2)}${r.unit ? " " + r.unit : ""}</td>
              <td style="text-align:right;color:#666">${r.reorder_level}${r.unit ? " " + r.unit : ""}</td>
              <td style="text-align:right" class="qty-needed">${qtyNeeded[r.key] || "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
  }

  const fmtQty = (n: number, unit?: string) => {
    const s = n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
    return unit ? `${s} ${unit}` : s;
  };

  return (
    <>
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center border-b px-6 gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link href="/dashboard" className="text-muted-foreground hover:text-foreground text-sm">Dashboard</Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Link href="/dashboard/inventory" className="text-muted-foreground hover:text-foreground text-sm">Inventory</Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Stock Alerts</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`size-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
          {selectedRows.length > 0 && (
            <Button size="sm" onClick={handlePrint}>
              <Printer className="size-3.5 mr-1.5" />Print / Purchase Request
            </Button>
          )}
        </div>
      </header>

      <div className="p-4 md:p-6 space-y-4">
        {/* Title */}
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            Stock Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Items below their reorder level in Spares and Consumables.
            Select items and enter quantity needed to print a purchase request.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border p-14 text-center space-y-3">
            <div className="size-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <Package className="size-7 text-emerald-600" />
            </div>
            <p className="text-sm font-medium">All stock levels are healthy!</p>
            <p className="text-xs text-muted-foreground">No spares or consumables are below their reorder level.</p>
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
                  {rows.map(r => (
                    <tr key={r.key} className={`transition-colors ${selected.has(r.key) ? "bg-amber-50/50 dark:bg-amber-950/10" : "hover:bg-muted/20"}`}>
                      <td className="px-3 py-3 text-center">
                        <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)}
                          className="size-4 rounded border-input accent-primary" />
                      </td>
                      <td className="px-4 py-3">
                        {r.type === "spare" ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-700 rounded-full px-2 py-0.5 font-medium">
                            <Wrench className="size-3" />Spare
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">
                            <Package className="size-3" />Consumable
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.name}</p>
                        {r.code && <p className="text-xs font-mono text-muted-foreground">{r.code}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{r.category}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-amber-600 font-medium inline-flex items-center gap-1 justify-end">
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
              {rows.map(r => (
                <div key={r.key} className={`rounded-lg border p-3 space-y-2 ${selected.has(r.key) ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10" : "bg-card"}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)}
                      className="mt-0.5 size-4 rounded border-input accent-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {r.type === "spare" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5 font-medium">
                            <Wrench className="size-2.5" />Spare
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-medium">
                            <Package className="size-2.5" />Consumable
                          </span>
                        )}
                        <p className="font-medium text-sm">{r.name}</p>
                      </div>
                      {r.code && <p className="text-xs font-mono text-muted-foreground mt-0.5">{r.code}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{r.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 pl-6">
                    <div className="space-y-0.5 text-xs">
                      <span className="text-amber-600 font-medium inline-flex items-center gap-1">
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
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-center justify-between gap-4 flex-wrap">
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
  );
}
