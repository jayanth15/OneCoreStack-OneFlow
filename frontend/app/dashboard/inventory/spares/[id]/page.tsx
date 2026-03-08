"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import {
  PlusIcon, Pencil, Trash2, AlertTriangle, PackagePlus,
  PackageMinus, Search,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpareCategory {
  id: number;
  name: string;
  description: string | null;
  item_count: number;
  low_stock_count: number;
}

interface SpareItem {
  id: number;
  category_id: number;
  name: string;
  part_number: string | null;
  description: string | null;
  quantity_on_hand: number;
  unit: string;
  reorder_level: number;
  storage_location: string | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtQty(n: number) {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}

const isLow = (i: SpareItem) => i.reorder_level > 0 && i.quantity_on_hand <= i.reorder_level;

const BLANK_FORM = {
  name: "", part_number: "", description: "",
  quantity_on_hand: "0", unit: "pcs",
  reorder_level: "0", storage_location: "", notes: "",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SpareCategoryPage() {
  const params = useParams();
  const catId = Number(params.id);

  const [category, setCategory] = useState<SpareCategory | null>(null);
  const [items, setItems] = useState<SpareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Create / Edit item sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SpareItem | null>(null);
  const [form, setForm] = useState<typeof BLANK_FORM>({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Stock adjust sheet
  const [adjustItem, setAdjustItem] = useState<SpareItem | null>(null);
  const [adjustType, setAdjustType] = useState<"add" | "subtract" | "set">("add");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setAdmin(isAdminOrAbove()); }, []);

  const fetchData = () => {
    setLoading(true);
    const params2 = new URLSearchParams({ include_inactive: String(showInactive) });
    if (search) params2.set("search", search);

    Promise.all([
      apiFetchJson<SpareCategory>(`/api/v1/spares/categories/${catId}`),
      apiFetchJson<SpareItem[]>(`/api/v1/spares/categories/${catId}/items?${params2}`),
    ])
      .then(([cat, its]) => { setCategory(cat); setItems(its); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [catId, search, showInactive]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(key: keyof typeof BLANK_FORM, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function openCreate() {
    setEditingItem(null);
    setForm({ ...BLANK_FORM });
    setFormError(null);
    setSheetOpen(true);
  }

  function openEdit(item: SpareItem) {
    setEditingItem(item);
    setForm({
      name: item.name,
      part_number: item.part_number ?? "",
      description: item.description ?? "",
      quantity_on_hand: String(item.quantity_on_hand),
      unit: item.unit,
      reorder_level: String(item.reorder_level),
      storage_location: item.storage_location ?? "",
      notes: item.notes ?? "",
    });
    setFormError(null);
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    setSaving(true);
    setFormError(null);
    const body = {
      name: form.name.trim(),
      part_number: form.part_number || null,
      description: form.description || null,
      quantity_on_hand: parseFloat(form.quantity_on_hand) || 0,
      unit: form.unit || "pcs",
      reorder_level: parseFloat(form.reorder_level) || 0,
      storage_location: form.storage_location || null,
      notes: form.notes || null,
    };
    try {
      if (editingItem) {
        await apiFetchJson(`/api/v1/spares/items/${editingItem.id}`, {
          method: "PUT", body: JSON.stringify(body),
        });
      } else {
        await apiFetchJson(`/api/v1/spares/categories/${catId}/items`, {
          method: "POST", body: JSON.stringify(body),
        });
      }
      setSheetOpen(false);
      fetchData();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function openAdjust(item: SpareItem, type: "add" | "subtract") {
    setAdjustItem(item);
    setAdjustType(type);
    setAdjustQty("");
    setAdjustNote("");
    setAdjustError(null);
  }

  async function submitAdjust() {
    if (!adjustItem) return;
    const qty = parseFloat(adjustQty);
    if (isNaN(qty) || qty < 0) { setAdjustError("Enter a valid quantity ≥ 0"); return; }
    setAdjustSaving(true);
    setAdjustError(null);
    try {
      await apiFetchJson(`/api/v1/spares/items/${adjustItem.id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ adjustment_type: adjustType, quantity: qty, note: adjustNote || null }),
      });
      setAdjustItem(null);
      fetchData();
    } catch (e: unknown) {
      setAdjustError(e instanceof Error ? e.message : "Adjust failed");
    } finally {
      setAdjustSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/spares/items/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      fetchData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const lowCount = items.filter(isLow).length;

  return (
    <>
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center border-b px-6 gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link href="/dashboard/inventory" className="text-muted-foreground hover:text-foreground text-sm">
                Inventory
              </Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Link href="/dashboard/inventory/spares" className="text-muted-foreground hover:text-foreground text-sm">
                Spares
              </Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{category?.name ?? "…"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {admin && (
          <Button size="sm" className="ml-auto" onClick={openCreate}>
            <PlusIcon className="size-4 mr-1" />
            Add Item
          </Button>
        )}
      </header>

      <div className="p-4 md:p-6 space-y-4">
        {/* Title */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">{category?.name ?? <Skeleton className="h-6 w-40 inline-block" />}</h1>
            {category?.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{category.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <form onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); }} className="flex gap-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Search items…"
                  className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-44"
                />
              </div>
              <Button type="submit" size="sm" variant="secondary">Search</Button>
              {search && (
                <Button type="button" size="sm" variant="ghost" onClick={() => { setSearch(""); setSearchDraft(""); }}>
                  Clear
                </Button>
              )}
            </form>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-3 rounded" />
              Show inactive
            </label>
          </div>
        </div>

        {/* Alerts */}
        {lowCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5 w-fit">
            <AlertTriangle className="size-3.5 shrink-0" />
            {lowCount} item{lowCount !== 1 ? "s" : ""} below reorder level
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4"><Skeleton className="h-24 w-full" /></div>
            ))
          ) : items.length === 0 ? (
            <div className="rounded-lg border px-4 py-12 text-center text-muted-foreground text-sm">
              {search ? `No items matching "${search}".` : "No items yet. Click \"Add Item\" to create one."}
            </div>
          ) : (
            items.map((item) => {
              const low = isLow(item);
              return (
                <div key={item.id} className={`rounded-lg border p-4 space-y-2 ${!item.is_active ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      {item.part_number && <p className="text-xs text-muted-foreground font-mono">{item.part_number}</p>}
                    </div>
                    {low && <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs shrink-0"><AlertTriangle className="size-3 mr-1" />Low</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">Qty: </span>
                      <span className={`font-medium ${low ? "text-amber-600" : ""}`}>{fmtQty(item.quantity_on_hand)} {item.unit}</span>
                    </div>
                    {item.reorder_level > 0 && (
                      <div><span className="text-muted-foreground">Reorder: </span>{fmtQty(item.reorder_level)} {item.unit}</div>
                    )}
                    {item.storage_location && (
                      <div className="col-span-2"><span className="text-muted-foreground">Location: </span>{item.storage_location}</div>
                    )}
                  </div>
                  {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                  <div className="flex justify-end gap-0.5 pt-1 border-t">
                    <Button variant="ghost" size="icon" className="size-7" title="Add Stock"
                      onClick={() => openAdjust(item, "add")}>
                      <PackagePlus className="size-3.5 text-emerald-600" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" title="Remove Stock"
                      onClick={() => openAdjust(item, "subtract")}>
                      <PackageMinus className="size-3.5 text-amber-600" />
                    </Button>
                    {admin && (
                      <>
                        <Button variant="ghost" size="icon" className="size-7" title="Edit" onClick={() => openEdit(item)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                          title="Delete" onClick={() => setDeleteId(item.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Part No.</th>
                  <th className="px-4 py-3 text-right font-medium">Qty on Hand</th>
                  <th className="px-4 py-3 text-right font-medium">Reorder Lvl</th>
                  <th className="px-4 py-3 text-left font-medium">Storage/Location</th>
                  <th className="px-4 py-3 text-left font-medium">Notes</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      {search ? `No items matching "${search}".` : "No items yet. Click \"Add Item\" to create one."}
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const low = isLow(item);
                    return (
                      <tr key={item.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${!item.is_active ? "opacity-60" : ""}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{item.name}</p>
                          {item.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                          {item.part_number ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          <div className={`flex items-center justify-end gap-1 ${low ? "text-amber-600" : ""}`}>
                            {low && <AlertTriangle className="size-3.5" />}
                            {fmtQty(item.quantity_on_hand)} {item.unit}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                          {item.reorder_level > 0 ? `${fmtQty(item.reorder_level)} ${item.unit}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {item.storage_location ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">
                          {item.notes ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-0.5">
                            <Button variant="ghost" size="icon" className="size-7" title="Add Stock"
                              onClick={() => openAdjust(item, "add")}>
                              <PackagePlus className="size-3.5 text-emerald-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Remove Stock"
                              onClick={() => openAdjust(item, "subtract")}>
                              <PackageMinus className="size-3.5 text-amber-600" />
                            </Button>
                            {admin && (
                              <>
                                <Button variant="ghost" size="icon" className="size-7" title="Edit"
                                  onClick={() => openEdit(item)}>
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon"
                                  className="size-7 text-destructive hover:text-destructive"
                                  title="Delete" onClick={() => setDeleteId(item.id)}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Create / Edit Item Sheet ──────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={(o) => !o && setSheetOpen(false)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{editingItem ? `Edit — ${editingItem.name}` : "Add Spare Item"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="i-name">Name *</Label>
              <Input id="i-name" placeholder="e.g. 168 Engine" value={form.name}
                onChange={(e) => set("name", e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-pn">Part Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="i-pn" placeholder="e.g. ENG-168" value={form.part_number}
                onChange={(e) => set("part_number", e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea id="i-desc" rows={2} placeholder="Brief description…"
                value={form.description} onChange={(e) => set("description", e.target.value)}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="i-qty">Qty on Hand</Label>
                <Input id="i-qty" type="number" min="0" step="any" value={form.quantity_on_hand}
                  onChange={(e) => set("quantity_on_hand", e.target.value)} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="i-unit">Unit</Label>
                <Input id="i-unit" placeholder="pcs" value={form.unit}
                  onChange={(e) => set("unit", e.target.value)} disabled={saving} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-reorder">Reorder Level</Label>
              <Input id="i-reorder" type="number" min="0" step="any" value={form.reorder_level}
                onChange={(e) => set("reorder_level", e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-loc">Storage/Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="i-loc" placeholder="e.g. Shelf B-2" value={form.storage_location}
                onChange={(e) => set("storage_location", e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea id="i-notes" rows={2} placeholder="Any additional notes…"
                value={form.notes} onChange={(e) => set("notes", e.target.value)}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? "Saving…" : editingItem ? "Save Changes" : "Add Item"}
              </Button>
              <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Adjust Stock Sheet ────────────────────────────────────────────── */}
      <Sheet open={adjustItem !== null} onOpenChange={(o) => !o && setAdjustItem(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Adjust Stock — {adjustItem?.name}</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Current: <strong>{adjustItem ? fmtQty(adjustItem.quantity_on_hand) : 0} {adjustItem?.unit}</strong>
            </p>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Adjustment Type</label>
              <div className="flex gap-2">
                {(["add", "subtract", "set"] as const).map((t) => (
                  <button key={t} onClick={() => setAdjustType(t)}
                    className={["flex-1 py-2 rounded-md text-sm font-medium border transition-colors capitalize",
                      adjustType === t ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted",
                    ].join(" ")}>{t === "add" ? "Add +" : t === "subtract" ? "Remove −" : "Set ="}</button>
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
              <label className="text-sm font-medium">Note <span className="text-xs text-muted-foreground font-normal">(optional)</span></label>
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
              <Button variant="outline" onClick={() => setAdjustItem(null)} disabled={adjustSaving}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Delete Alert ──────────────────────────────────────────────────── */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>This marks the item as inactive. It will be hidden from the list.</AlertDialogDescription>
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
