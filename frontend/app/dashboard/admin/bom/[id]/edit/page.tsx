"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/user";

interface InventoryItem { id: number; code: string; name: string; unit: string; item_type?: string; }
interface PaginatedInventory { items: InventoryItem[]; }
interface BomDetail {
  id: number; product_name: string; raw_material_id: number;
  qty_per_unit: number; material_used: number | null; scrap: number | null; material_unit: string | null; notes: string | null; is_active: boolean;
}

export default function EditBomPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState({
    product_name: "", raw_material_id: "", qty_per_unit: 1, material_used: "", scrap: "", material_unit: "", notes: "", is_active: true,
  });
  const [finishedGoods, setFinishedGoods] = useState<InventoryItem[]>([]);
  const [rawMaterials, setRawMaterials] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u || (u.role !== "admin" && u.role !== "super_admin")) { router.replace("/dashboard"); return; }
    apiFetchJson<PaginatedInventory>("/api/v1/inventory?item_type=finished_good&page_size=500")
      .then((r) => setFinishedGoods(r.items)).catch(() => {});
    Promise.all([
      apiFetchJson<PaginatedInventory>("/api/v1/inventory?item_type=raw_material&page_size=500"),
      apiFetchJson<PaginatedInventory>("/api/v1/inventory?item_type=semi_finished&page_size=500"),
    ]).then(([rm, sfg]) => setRawMaterials([...rm.items, ...sfg.items])).catch(() => {});
    if (id) {
      apiFetchJson<BomDetail>(`/api/v1/bom/${id}`)
        .then((d) => {
          setForm({
            product_name: d.product_name,
            raw_material_id: String(d.raw_material_id),
            qty_per_unit: d.qty_per_unit,
            material_used: d.material_used != null ? String(d.material_used) : "",
            scrap: d.scrap != null ? String(d.scrap) : "",
            material_unit: d.material_unit ?? "",
            notes: d.notes ?? "",
            is_active: d.is_active,
          });
        })
        .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Not found"))
        .finally(() => setLoading(false));
    }
  }, [id, router]);

  function set(key: string, val: unknown) { setForm((f) => ({ ...f, [key]: val })); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.product_name.trim()) { setSaveError("Product name is required"); return; }
    if (!form.raw_material_id) { setSaveError("Select a raw material"); return; }
    if (form.qty_per_unit <= 0) { setSaveError("Qty per unit must be > 0"); return; }
    setSaving(true); setSaveError(null);
    try {
      await apiFetchJson(`/api/v1/bom/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          product_name: form.product_name.trim(),
          raw_material_id: parseInt(form.raw_material_id),
          qty_per_unit: form.qty_per_unit,
          material_used: form.material_used !== "" ? parseFloat(String(form.material_used)) : null,
          scrap: form.scrap !== "" ? parseFloat(String(form.scrap)) : null,
          material_unit: form.material_unit.trim() || null,
          notes: form.notes || null,
          is_active: form.is_active,
        }),
      });
      router.push("/dashboard/admin/bom");
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const selectedRM = rawMaterials.find((r) => String(r.id) === form.raw_material_id);

  return (
    <>
      <PageHeader
        title="Edit BOM Line"
        breadcrumbs={[
          { label: "BOM", href: "/dashboard/admin/bom" },
          { label: "Edit BOM Line" },
        ]}
      />
      <div className="p-4 md:p-8 max-w-lg mx-auto">
        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : loading ? (
          <div className="space-y-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="product_name">Finished Good (Product) <span className="text-destructive">*</span></Label>
              <select
                id="product_name"
                value={form.product_name}
                onChange={(e) => set("product_name", e.target.value)}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select finished good —</option>
                {/* Keep current value selectable even if not in FG list */}
                {form.product_name && !finishedGoods.some((fg) => fg.name === form.product_name) && (
                  <option value={form.product_name}>{form.product_name} (current)</option>
                )}
                {finishedGoods.map((fg) => (
                  <option key={fg.id} value={fg.name}>{fg.name} ({fg.code})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raw_material_id">Raw Material / Semi-finished <span className="text-destructive">*</span></Label>
              <select id="raw_material_id" value={form.raw_material_id} onChange={(e) => set("raw_material_id", e.target.value)} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select —</option>
                {rawMaterials.map((rm) => (
                  <option key={rm.id} value={String(rm.id)}>
                    {rm.name} ({rm.code}) [{rm.item_type === "raw_material" ? "RM" : "SFG"}]
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qty_per_unit">
                Qty per Unit{selectedRM ? ` (${selectedRM.unit})` : ""} <span className="text-destructive">*</span>
              </Label>
              <Input id="qty_per_unit" type="number" inputMode="decimal" min="0.001" step="any"
                value={form.qty_per_unit}
                onChange={(e) => set("qty_per_unit", parseFloat(e.target.value) || 0)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="material_used">
                Material Used per Unit{selectedRM ? ` (${selectedRM.unit})` : ""} <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input id="material_used" type="number" inputMode="decimal" min="0" step="any" placeholder="e.g. 1.05"
                value={form.material_used}
                onChange={(e) => set("material_used", e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scrap">
                Scrap per Unit{selectedRM ? ` (${selectedRM.unit})` : ""} <span className="text-xs text-muted-foreground">(optional — auto-recorded to Scraps inventory)</span>
              </Label>
              <Input id="scrap" type="number" inputMode="decimal" min="0" step="any" placeholder="e.g. 0.05"
                value={form.scrap}
                onChange={(e) => set("scrap", e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="material_unit">Unit for Material Used / Scrap <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <select id="material_unit" value={form.material_unit} onChange={(e) => set("material_unit", e.target.value)} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select unit —</option>
                <option value="kg">kg — Kilograms</option>
                <option value="g">g — Grams</option>
                <option value="MT">MT — Metric Tonne</option>
                <option value="L">L — Litres</option>
                <option value="mL">mL — Millilitres</option>
                <option value="m">m — Metres</option>
                <option value="mm">mm — Millimetres</option>
                <option value="m²">m² — Square Metres</option>
                <option value="m³">m³ — Cubic Metres</option>
                <option value="pcs">pcs — Pieces</option>
                <option value="nos">nos — Numbers</option>
                <option value="rolls">rolls</option>
                <option value="sheets">sheets</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="is_active">Status</Label>
              <select id="is_active" value={form.is_active ? "true" : "false"}
                onChange={(e) => set("is_active", e.target.value === "true")} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/dashboard/admin/bom")} disabled={saving}>Cancel</Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
