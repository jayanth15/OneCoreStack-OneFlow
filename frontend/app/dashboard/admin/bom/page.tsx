"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
  notes: string | null;
  is_active: boolean;
}

export default function BomPage() {
  const router = useRouter();
  const [items, setItems] = useState<BomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchProduct, setSearchProduct] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      router.replace("/dashboard");
    }
  }, [router]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ include_inactive: String(showInactive) });
      if (searchProduct) p.set("product_name", searchProduct);
      const data = await apiFetchJson<BomItem[]>(`/api/v1/bom?${p}`);
      setItems(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [showInactive]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <header className="flex h-16 shrink-0 items-center border-b px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/admin/users">Admin</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem><BreadcrumbPage>Bill of Materials</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Bill of Materials (BOM)</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Define which raw materials are needed per unit of each product.
            </p>
          </div>
          <Button size="sm" onClick={() => router.push("/dashboard/admin/bom/new")}>
            <PlusIcon className="size-4 mr-1" />
            Add BOM Line
          </Button>
        </div>

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
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/10">
                      <th className="px-4 py-2 text-left font-medium text-xs">Raw Material</th>
                      <th className="px-4 py-2 text-right font-medium text-xs">Qty / Unit</th>
                      <th className="px-4 py-2 text-left font-medium text-xs hidden sm:table-cell">Notes</th>
                      <th className="px-4 py-2 text-right font-medium text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id} className={["border-b last:border-0 hover:bg-muted/20", !line.is_active ? "opacity-60" : ""].join(" ")}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{line.raw_material_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{line.raw_material_code}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {line.qty_per_unit} {line.raw_material_unit}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">
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
                    ))}
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
