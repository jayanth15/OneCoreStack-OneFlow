"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/user";
import { PlusIcon, Pencil, Trash2 } from "lucide-react";

interface BomItem {
  id: number;
  product_name: string;
  raw_material_id: number;
  raw_material_code: string | null;
  raw_material_name: string | null;
  raw_material_unit: string | null;
  qty_per_unit: number;
  material_used: number | null;
  scrap: number | null;
  material_unit: string | null;
  notes: string | null;
  is_active: boolean;
}

export default function BomPage() {
  const router = useRouter();
  const [items, setItems] = useState<BomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchProduct, setSearchProduct] = useState("");
  const [vendor, setVendor] = useState("");
  const [vendors, setVendors] = useState<{ id: number | null; name: string }[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      router.replace("/dashboard");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiFetchJson<{ id: number | null; name: string }[]>("/api/v1/vendors/names")
      .then(setVendors)
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ include_inactive: String(showInactive) });
      if (searchProduct) p.set("product_name", searchProduct);
      if (vendor) p.set("vendor", vendor);
      const data = await apiFetchJson<BomItem[]>(`/api/v1/bom?${p}`);
      setItems(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [showInactive, vendor]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete() {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/bom/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  // Group by product name for display
  const grouped: Record<string, BomItem[]> = {};
  for (const item of items) {
    if (!grouped[item.product_name]) grouped[item.product_name] = [];
    grouped[item.product_name].push(item);
  }

  return (
    <>
      <PageHeader
        title="Bill of Materials (BOM)"
        description="Define which raw materials are needed per unit of each product."
        breadcrumbs={[
          { label: "Admin", href: "/dashboard/admin/users" },
          { label: "Bill of Materials" },
        ]}
        actions={
          <Button size="sm" onClick={() => router.push("/dashboard/admin/bom/new")}>
            <PlusIcon className="size-4 mr-1" />
            Add BOM Line
          </Button>
        }
      />

      <div className="p-4 md:p-6 space-y-4">

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Filter by product name…"
            value={searchProduct}
            onChange={(e) => setSearchProduct(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-64"
          />
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id ?? v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={load}>Search</Button>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none ml-auto">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-3 rounded" />
            Show inactive
          </label>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="rounded-lg border px-4 py-12 text-center text-muted-foreground text-sm">
            No BOM entries. Click &quot;Add BOM Line&quot; to define raw material requirements for a product.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([productName, lines]) => (
              <div key={productName} className="rounded-lg border overflow-hidden">
                <div className="bg-muted/40 px-4 py-2.5 flex items-center justify-between">
                  <h3 className="font-medium text-sm">{productName}</h3>
                  <span className="text-xs text-muted-foreground">{lines.length} material{lines.length !== 1 ? "s" : ""}</span>
                </div>
                {/* Mobile cards */}
                <div className="md:hidden divide-y">
                  {lines.map((line) => {
                    const usedUnit = line.material_unit ?? line.raw_material_unit;
                    return (
                    <div key={line.id} className={`px-4 py-3 space-y-1.5 ${!line.is_active ? "opacity-60" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{line.raw_material_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{line.raw_material_code}</p>
                        </div>
                        <div className="inline-flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="size-7"
                            onClick={() => router.push(`/dashboard/admin/bom/${line.id}/edit`)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(line.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
                        <div className="truncate"><span className="text-muted-foreground">Qty / Unit:</span> <span className="font-medium">{line.qty_per_unit} {line.raw_material_unit ?? ""}</span></div>
                        <div className="truncate"><span className="text-muted-foreground">Mat. Used:</span> <span className="font-medium">{line.material_used != null ? `${line.material_used} ${usedUnit ?? ""}` : "—"}</span></div>
                        <div className="truncate"><span className="text-muted-foreground">Scrap:</span> <span className="font-medium">{line.scrap != null ? `${line.scrap} ${usedUnit ?? ""}` : "Computed"}</span></div>
                        <div className="truncate"><span className="text-muted-foreground">Unit:</span> <span className="font-medium">{line.material_unit ?? "inherits RM"}</span></div>
                      </div>
                      {line.notes && <p className="text-xs text-muted-foreground">{line.notes}</p>}
                    </div>
                    );
                  })}
                </div>
                {/* Desktop table */}
                <table className="hidden md:table w-full text-sm table-fixed">
                  <thead>
                    <tr className="border-b bg-muted/10">
                      <th className="px-4 py-2 text-left font-medium text-xs w-[28%]">Raw Material</th>
                      <th className="px-4 py-2 text-right font-medium text-xs w-[12%]">Qty / Unit</th>
                      <th className="px-4 py-2 text-right font-medium text-xs w-[14%]">Material Used / Unit</th>
                      <th className="px-4 py-2 text-right font-medium text-xs w-[13%]">Scrap / Unit</th>
                      <th className="px-4 py-2 text-left font-medium text-xs w-[11%]">Unit (Used/Scrap)</th>
                      <th className="px-4 py-2 text-left font-medium text-xs">Notes</th>
                      <th className="px-4 py-2 text-right font-medium text-xs w-[10%]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const usedUnit = line.material_unit ?? line.raw_material_unit;
                      return (
                      <tr key={line.id} className={["border-b last:border-0 hover:bg-muted/20", !line.is_active ? "opacity-60" : ""].join(" ")}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium truncate max-w-[200px] whitespace-nowrap block">{line.raw_material_name}</div>
                          <div className="text-xs text-muted-foreground font-mono truncate">{line.raw_material_code}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {line.qty_per_unit} {line.raw_material_unit}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {line.material_used != null ? `${line.material_used} ${usedUnit ?? ""}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {line.scrap != null ? `${line.scrap} ${usedUnit ?? ""}` : <span className="text-muted-foreground italic">Computed</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {line.material_unit ?? <span className="text-muted-foreground">inherits RM unit</span>}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs truncate">
                          {line.notes ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex gap-1">
                            <Button variant="ghost" size="icon" className="size-7"
                              onClick={() => router.push(`/dashboard/admin/bom/${line.id}/edit`)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(line.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete BOM line?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this raw material requirement from the BOM.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
