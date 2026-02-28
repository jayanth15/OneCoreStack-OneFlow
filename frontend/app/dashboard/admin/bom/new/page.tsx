"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/user";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────────────────

interface InventoryItem { id: number; code: string; name: string; unit: string; item_type: string; }
interface PaginatedInventory { items: InventoryItem[]; }

interface RMRow {
  key: number;
  raw_material_id: string;
  qty_per_unit: number;
  notes: string;
}

// ── Inner component (needs useSearchParams) ──────────────────────────────────────────────────

function NewBomForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextKey = useRef(1);

  const [productName, setProductName] = useState(searchParams.get("product") ?? "");
  const [finishedGoods, setFinishedGoods] = useState<InventoryItem[]>([]);
  const [rawMaterials, setRawMaterials] = useState<InventoryItem[]>([]);
  const [rows, setRows] = useState<RMRow[]>([{ key: nextKey.current++, raw_material_id: "", qty_per_unit: 1, notes: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u || (u.role !== "admin" && u.role !== "super_admin")) { router.replace("/dashboard"); return; }

    // Load FG items for product dropdown
    apiFetchJson<PaginatedInventory>("/api/v1/inventory?item_type=finished_good&page_size=500&include_inactive=false")
      .then((r) => setFinishedGoods(r.items)).catch(() => {});

    // Load raw materials + semi-finished for RM rows
    Promise.all([
      apiFetchJson<PaginatedInventory>("/api/v1/inventory?item_type=raw_material&page_size=500"),
      apiFetchJson<PaginatedInventory>("/api/v1/inventory?item_type=semi_finished&page_size=500"),
    ]).then(([rm, sfg]) => setRawMaterials([...rm.items, ...sfg.items])).catch(() => {});
  }, [router]);

  // ── Row helpers ─────────────────────────────────────────────────────────────────────────────

  function addRow() {
    setRows((r) => [...r, { key: nextKey.current++, raw_material_id: "", qty_per_unit: 1, notes: "" }]);
  }

  function removeRow(key: number) {
    setRows((r) => r.filter((x) => x.key !== key));
  }

  function updateRow(key: number, field: keyof Omit<RMRow, "key">, val: string | number) {
    setRows((r) => r.map((x) => x.key === key ? { ...x, [field]: val } : x));
  }

  // ── Save ──────────────────────────────────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!productName.trim()) { setError("Select a product"); return; }
    const validRows = rows.filter((r) => r.raw_material_id);
    if (validRows.length === 0) { setError("Add at least one raw material"); return; }
    const badQty = validRows.find((r) => r.qty_per_unit <= 0);
    if (badQty) { setError("All qty per unit values must be > 0"); return; }

    setSaving(true);
    setError(null);
    try {
      await Promise.all(
        validRows.map((r) =>
          apiFetchJson("/api/v1/bom", {
            method: "POST",
            body: JSON.stringify({
              product_name: productName.trim(),
              raw_material_id: parseInt(r.raw_material_id),
              qty_per_unit: r.qty_per_unit,
              notes: r.notes.trim() || null,
              is_active: true,
            }),
          })
        )
      );
      router.push("/dashboard/admin/bom");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link href="/dashboard/admin/bom" className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
          <ArrowLeft className="size-4" />
        </Link>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/admin/bom">BOM</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem><BreadcrumbPage>Add BOM</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Add Bill of Materials</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select a finished good and define all the raw materials needed to produce one unit.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">

          {/* ── Finished Good ──────────────────────────────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="product_name">
              Finished Good (Product) <span className="text-destructive">*</span>
            </Label>
            <select
              id="product_name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="">— Select finished good —</option>
              {finishedGoods.map((fg) => (
                <option key={fg.id} value={fg.name}>
                  {fg.name} ({fg.code})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              This must match the Schedule description exactly so material requirements auto-calculate in Production Planning.
            </p>
          </div>

          {/* ── Raw Material Rows ───────────────────────────────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Raw Materials <span className="text-destructive">*</span></Label>
              <span className="text-xs text-muted-foreground">{rows.length} material{rows.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="rounded-lg border divide-y overflow-hidden">
              {/* Header */}
              <div className="hidden sm:grid grid-cols-[1fr_120px_120px_32px] gap-2 items-center bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Raw Material / Semi-finished</span>
                <span>Qty per Unit</span>
                <span>Notes</span>
                <span></span>
              </div>

              {rows.map((row, idx) => {
                const rm = rawMaterials.find((r) => String(r.id) === row.raw_material_id);
                return (
                  <div key={row.key} className="grid grid-cols-[1fr_32px] sm:grid-cols-[1fr_120px_120px_32px] gap-2 items-center px-3 py-2.5">
                    {/* Material select */}
                    <div className="space-y-1 sm:space-y-0">
                      <p className="text-xs text-muted-foreground sm:hidden">Material</p>
                      <select
                        value={row.raw_material_id}
                        onChange={(e) => updateRow(row.key, "raw_material_id", e.target.value)}
                        disabled={saving}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                      >
                        <option value="">— Select —</option>
                        {rawMaterials.map((r) => (
                          <option key={r.id} value={String(r.id)}>
                            {r.name} ({r.code}) [{r.item_type === "raw_material" ? "RM" : "SFG"}]
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Qty */}
                    <div className="space-y-1 sm:space-y-0">
                      <p className="text-xs text-muted-foreground sm:hidden">
                        Qty per unit{rm ? ` (${rm.unit})` : ""}
                      </p>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0.001"
                        step="any"
                        value={row.qty_per_unit}
                        onChange={(e) => updateRow(row.key, "qty_per_unit", parseFloat(e.target.value) || 0)}
                        disabled={saving}
                        className="h-8 text-sm"
                        title={rm ? `${rm.unit} per finished unit` : ""}
                      />
                    </div>

                    {/* Notes */}
                    <div className="hidden sm:block">
                      <Input
                        placeholder="Optional"
                        value={row.notes}
                        onChange={(e) => updateRow(row.key, "notes", e.target.value)}
                        disabled={saving}
                        className="h-8 text-sm"
                      />
                    </div>

                    {/* Delete */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.key)}
                      disabled={saving || rows.length === 1}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={saving} className="w-full">
              <Plus className="size-4 mr-1.5" />
              Add another raw material
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
              {saving ? "Creating…" : `Create BOM (${rows.filter((r) => r.raw_material_id).length} line${rows.filter((r) => r.raw_material_id).length !== 1 ? "s" : ""})`}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/admin/bom")} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

export default function NewBomPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <NewBomForm />
    </Suspense>
  );
}
