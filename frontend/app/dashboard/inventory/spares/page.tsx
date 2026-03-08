"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import {
  PlusIcon, Pencil, Trash2, AlertTriangle, Wrench, ChevronRight, ChevronDown,
  Search, PackagePlus, PackageMinus, ImageIcon,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpareCategory {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  item_count: number;
  low_stock_count: number;
  created_at: string;
  updated_at: string;
}

interface SpareItem {
  id: number;
  category_id: number;
  name: string;
  part_number: string | null;
  part_description: string | null;
  variant_model: string | null;
  rate: number | null;
  unit: string;
  opening_qty: number;
  recorded_qty: number;
  reorder_level: number;
  storage_type: string | null;
  tags: string | null;
  image_base64: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtQty(n: number) {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}
function fmtRate(n: number | null) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
const isLow = (i: SpareItem) => i.reorder_level > 0 && i.recorded_qty <= i.reorder_level;

function TagBadges({ tags }: { tags: string | null }) {
  if (!tags?.trim()) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
        <Badge key={t} variant="secondary" className="text-xs px-1.5 py-0">{t}</Badge>
      ))}
    </div>
  );
}

const STD_UNITS = ["pcs", "kg", "g", "ltr", "ml", "mtr", "cm", "box", "roll", "set", "pair"];
const STORAGE_TYPES = ["Shelf", "Rack", "Bin", "Drawer", "Tray", "Cabinet", "Box", "Pallet", "Floor"];
const BLANK_ITEM = {
  name: "", part_number: "", part_description: "", variant_model: "",
  rate: "", unit: "pcs", customUnit: "", opening_qty: "0",
  recorded_qty: "0", reorder_level: "0", storage_type: "", tags: "",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SparesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<SpareCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [itemsMap, setItemsMap] = useState<Map<number, SpareItem[]>>(new Map());
  const [itemsLoading, setItemsLoading] = useState<Set<number>>(new Set());

  const [editCatSheet, setEditCatSheet] = useState(false);
  const [editingCat, setEditingCat] = useState<SpareCategory | null>(null);
  const [catForm, setCatForm] = useState({ name: "", description: "" });
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  const [editItemSheet, setEditItemSheet] = useState(false);
  const [editingItem, setEditingItem] = useState<SpareItem | null>(null);
  const [itemForm, setItemForm] = useState<typeof BLANK_ITEM>({ ...BLANK_ITEM });
  const [itemCustomUnit, setItemCustomUnit] = useState(false);
  const [itemImagePreview, setItemImagePreview] = useState<string | null>(null);
  const [itemImageB64, setItemImageB64] = useState<string | null>(null);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [adjustItem, setAdjustItem] = useState<SpareItem | null>(null);
  const [adjustType, setAdjustType] = useState<"add" | "subtract" | "set">("add");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const [deleteCatId, setDeleteCatId] = useState<number | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<{ id: number; catId: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setAdmin(isAdminOrAbove()); }, []);

  const fetchCategories = () => {
    setLoading(true);
    const params = new URLSearchParams({ include_inactive: "false" });
    if (search) params.set("search", search);
    apiFetchJson<SpareCategory[]>(`/api/v1/spares/categories?${params}`)
      .then(setCategories)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCategories(); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleExpand(catId: number) {
    if (expanded.has(catId)) {
      setExpanded((prev) => { const s = new Set(prev); s.delete(catId); return s; });
      return;
    }
    setExpanded((prev) => new Set(prev).add(catId));
    if (!itemsMap.has(catId)) {
      setItemsLoading((prev) => new Set(prev).add(catId));
      try {
        const items = await apiFetchJson<SpareItem[]>(
          `/api/v1/spares/categories/${catId}/items?include_inactive=false`
        );
        setItemsMap((prev) => new Map(prev).set(catId, items));
      } catch { /* leave empty */ }
      finally {
        setItemsLoading((prev) => { const s = new Set(prev); s.delete(catId); return s; });
      }
    }
  }

  async function refreshItems(catId: number) {
    try {
      const items = await apiFetchJson<SpareItem[]>(
        `/api/v1/spares/categories/${catId}/items?include_inactive=false`
      );
      setItemsMap((prev) => new Map(prev).set(catId, items));
    } catch { /* ignore */ }
  }

  // ── Category CRUD ──────────────────────────────────────────────────────────

  function openEditCat(cat: SpareCategory) {
    setEditingCat(cat);
    setCatForm({ name: cat.name, description: cat.description ?? "" });
    setCatError(null);
    setEditCatSheet(true);
  }
  async function saveCat() {
    if (!catForm.name.trim()) { setCatError("Name is required"); return; }
    setCatSaving(true); setCatError(null);
    try {
      await apiFetchJson(`/api/v1/spares/categories/${editingCat!.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: catForm.name.trim(), description: catForm.description || null }),
      });
      setEditCatSheet(false);
      fetchCategories();
    } catch (e: unknown) { setCatError(e instanceof Error ? e.message : "Save failed"); }
    finally { setCatSaving(false); }
  }
  async function deleteCat() {
    if (deleteCatId === null) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/spares/categories/${deleteCatId}`, { method: "DELETE" });
      setDeleteCatId(null); fetchCategories();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setDeleting(false); }
  }

  // ── Item CRUD ──────────────────────────────────────────────────────────────

  function openEditItem(item: SpareItem) {
    setEditingItem(item);
    const stdUnit = STD_UNITS.includes(item.unit);
    setItemCustomUnit(!stdUnit);
    setItemImagePreview(item.image_base64 ? `data:image/jpeg;base64,${item.image_base64}` : null);
    setItemImageB64(item.image_base64 ?? null);
    setItemForm({
      name: item.name,
      part_number: item.part_number ?? "",
      part_description: item.part_description ?? "",
      variant_model: item.variant_model ?? "",
      rate: item.rate != null ? String(item.rate) : "",
      unit: stdUnit ? item.unit : "__custom__",
      customUnit: stdUnit ? "" : item.unit,
      opening_qty: String(item.opening_qty),
      recorded_qty: String(item.recorded_qty),
      reorder_level: String(item.reorder_level),
      storage_type: item.storage_type ?? "",
      tags: item.tags ?? "",
    });
    setItemError(null);
    setEditItemSheet(true);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setItemImagePreview(dataUrl);
      setItemImageB64(dataUrl.split(",")[1] ?? null);
    };
    reader.readAsDataURL(file);
  }

  async function saveItem() {
    if (!itemForm.name.trim()) { setItemError("Name is required"); return; }
    const unit = itemCustomUnit ? (itemForm.customUnit.trim() || "pcs") : itemForm.unit;
    setItemSaving(true); setItemError(null);
    const body = {
      name: itemForm.name.trim(),
      part_number: itemForm.part_number || null,
      part_description: itemForm.part_description || null,
      variant_model: itemForm.variant_model || null,
      rate: itemForm.rate ? parseFloat(itemForm.rate) : null,
      unit,
      opening_qty: parseFloat(itemForm.opening_qty) || 0,
      recorded_qty: parseFloat(itemForm.recorded_qty) || 0,
      reorder_level: parseFloat(itemForm.reorder_level) || 0,
      storage_type: itemForm.storage_type || null,
      tags: itemForm.tags || null,
      image_base64: itemImageB64,
    };
    try {
      await apiFetchJson(`/api/v1/spares/items/${editingItem!.id}`, {
        method: "PUT", body: JSON.stringify(body),
      });
      setEditItemSheet(false);
      await refreshItems(editingItem!.category_id);
      fetchCategories();
    } catch (e: unknown) { setItemError(e instanceof Error ? e.message : "Save failed"); }
    finally { setItemSaving(false); }
  }

  async function deleteItem() {
    if (!deleteItemId) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/spares/items/${deleteItemId.id}`, { method: "DELETE" });
      setDeleteItemId(null);
      await refreshItems(deleteItemId.catId);
      fetchCategories();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setDeleting(false); }
  }

  // ── Adjust stock ───────────────────────────────────────────────────────────

  function openAdjust(item: SpareItem, type: "add" | "subtract") {
    setAdjustItem(item); setAdjustType(type);
    setAdjustQty(""); setAdjustNote(""); setAdjustError(null);
  }
  async function submitAdjust() {
    if (!adjustItem) return;
    const qty = parseFloat(adjustQty);
    if (isNaN(qty) || qty < 0) { setAdjustError("Enter a valid quantity ≥ 0"); return; }
    setAdjustSaving(true); setAdjustError(null);
    try {
      await apiFetchJson(`/api/v1/spares/items/${adjustItem.id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ adjustment_type: adjustType, quantity: qty, note: adjustNote || null }),
      });
      await refreshItems(adjustItem.category_id);
      fetchCategories();
      setAdjustItem(null);
    } catch (e: unknown) { setAdjustError(e instanceof Error ? e.message : "Failed"); }
    finally { setAdjustSaving(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b px-6 gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link href="/dashboard/inventory" className="text-muted-foreground hover:text-foreground text-sm">
                Inventory
              </Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Spares</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {admin && (
          <Button size="sm" className="ml-auto" onClick={() => router.push("/dashboard/inventory/spares/new")}>
            <PlusIcon className="size-4 mr-1" />New Category
          </Button>
        )}
      </header>

      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Spares</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Click a category row to expand and view items.</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); }} className="flex gap-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search categories…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-48" />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
            {search && (
              <Button type="button" size="sm" variant="ghost" onClick={() => { setSearch(""); setSearchDraft(""); }}>Clear</Button>
            )}
          </form>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4"><Skeleton className="h-8 w-full" /></div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="rounded-xl border p-12 text-center space-y-2">
            <Wrench className="size-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search ? `No categories matching "${search}".` : "No spare categories yet."}
            </p>
            {admin && !search && (
              <Button size="sm" onClick={() => router.push("/dashboard/inventory/spares/new")}>
                <PlusIcon className="size-4 mr-1" /> Create First Category
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            {categories.map((cat, idx) => {
              const isExpanded = expanded.has(cat.id);
              const items = itemsMap.get(cat.id) ?? [];
              const isLoadingItems = itemsLoading.has(cat.id);

              return (
                <div key={cat.id} className={idx > 0 ? "border-t" : ""}>
                  {/* Category row */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer select-none transition-colors"
                    onClick={() => toggleExpand(cat.id)}
                  >
                    <div className="flex size-8 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                      <Wrench className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{cat.name}</span>
                        {cat.description && (
                          <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[240px]">
                            {cat.description}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{cat.item_count} items</span>
                      {cat.low_stock_count > 0 && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                          <AlertTriangle className="size-3 mr-1" />{cat.low_stock_count} low
                        </Badge>
                      )}
                      {admin && (
                        <span className="flex gap-0.5 ml-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-7" title="Edit"
                            onClick={() => openEditCat(cat)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                            title="Delete" onClick={() => setDeleteCatId(cat.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </span>
                      )}
                      {isExpanded
                        ? <ChevronDown className="size-4 text-muted-foreground" />
                        : <ChevronRight className="size-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Items panel */}
                  {isExpanded && (
                    <div className="border-t bg-muted/10">
                      {isLoadingItems ? (
                        <div className="px-6 py-4 space-y-2">
                          {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                        </div>
                      ) : items.length === 0 ? (
                        <div className="px-6 py-6 text-center text-sm text-muted-foreground">
                          No items yet.
                          {admin && (
                            <Button size="sm" variant="link" className="ml-2 h-auto p-0"
                              onClick={() => router.push(`/dashboard/inventory/spares/${cat.id}/items/new`)}>
                              Add first item →
                            </Button>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* Desktop table */}
                          <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b bg-muted/50">
                                  <th className="px-3 py-2 text-left font-medium w-6 text-muted-foreground">#</th>
                                  <th className="px-3 py-2 text-left font-medium">Name / Part No.</th>
                                  <th className="px-3 py-2 text-left font-medium">Description</th>
                                  <th className="px-3 py-2 text-left font-medium">Variant/Model</th>
                                  <th className="px-3 py-2 text-right font-medium">Rate</th>
                                  <th className="px-3 py-2 text-center font-medium">UOM</th>
                                  <th className="px-3 py-2 text-right font-medium">Opening Qty</th>
                                  <th className="px-3 py-2 text-right font-medium">Recorded Qty</th>
                                  <th className="px-3 py-2 text-left font-medium">Storage</th>
                                  <th className="px-3 py-2 text-left font-medium">Tags</th>
                                  <th className="px-3 py-2 text-center font-medium">Image</th>
                                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item, ii) => {
                                  const low = isLow(item);
                                  return (
                                    <tr key={item.id}
                                      className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${!item.is_active ? "opacity-50" : ""}`}>
                                      <td className="px-3 py-2 text-muted-foreground">{ii + 1}</td>
                                      <td className="px-3 py-2">
                                        <p className="font-medium">{item.name}</p>
                                        {item.part_number && (
                                          <p className="text-muted-foreground font-mono">{item.part_number}</p>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-muted-foreground max-w-[160px]">
                                        <p className="truncate">{item.part_description ?? "—"}</p>
                                      </td>
                                      <td className="px-3 py-2 text-muted-foreground">{item.variant_model ?? "—"}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{fmtRate(item.rate)}</td>
                                      <td className="px-3 py-2 text-center">{item.unit}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{fmtQty(item.opening_qty)}</td>
                                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${low ? "text-amber-600" : ""}`}>
                                        <span className="inline-flex items-center gap-1 justify-end">
                                          {low && <AlertTriangle className="size-3" />}
                                          {fmtQty(item.recorded_qty)}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-muted-foreground">{item.storage_type ?? "—"}</td>
                                      <td className="px-3 py-2"><TagBadges tags={item.tags} /></td>
                                      <td className="px-3 py-2 text-center">
                                        {item.image_base64 ? (
                                          /* eslint-disable-next-line @next/next/no-img-element */
                                          <img
                                            src={`data:image/jpeg;base64,${item.image_base64}`}
                                            alt={item.name}
                                            className="size-8 rounded object-cover mx-auto cursor-pointer"
                                            onClick={() => window.open(`data:image/jpeg;base64,${item.image_base64}`)}
                                          />
                                        ) : (
                                          <ImageIcon className="size-4 text-muted-foreground/30 mx-auto" />
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <div className="inline-flex gap-0.5">
                                          <Button variant="ghost" size="icon" className="size-6" title="Add Stock"
                                            onClick={() => openAdjust(item, "add")}>
                                            <PackagePlus className="size-3 text-emerald-600" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="size-6" title="Remove Stock"
                                            onClick={() => openAdjust(item, "subtract")}>
                                            <PackageMinus className="size-3 text-amber-600" />
                                          </Button>
                                          {admin && (
                                            <>
                                              <Button variant="ghost" size="icon" className="size-6" title="Edit"
                                                onClick={() => openEditItem(item)}>
                                                <Pencil className="size-3" />
                                              </Button>
                                              <Button variant="ghost" size="icon"
                                                className="size-6 text-destructive hover:text-destructive" title="Delete"
                                                onClick={() => setDeleteItemId({ id: item.id, catId: cat.id })}>
                                                <Trash2 className="size-3" />
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Mobile item cards */}
                          <div className="md:hidden space-y-2 p-3">
                            {items.map((item) => {
                              const low = isLow(item);
                              return (
                                <div key={item.id}
                                  className={`rounded-lg border bg-card p-3 space-y-2 ${!item.is_active ? "opacity-50" : ""}`}>
                                  <div className="flex items-start gap-2 justify-between">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm">{item.name}</p>
                                      {item.part_number && <p className="text-xs font-mono text-muted-foreground">{item.part_number}</p>}
                                      {item.variant_model && <p className="text-xs text-muted-foreground">{item.variant_model}</p>}
                                    </div>
                                    {item.image_base64 && (
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      <img src={`data:image/jpeg;base64,${item.image_base64}`} alt={item.name}
                                        className="size-10 rounded object-cover shrink-0" />
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                    <div><span className="text-muted-foreground">Rate: </span>{fmtRate(item.rate)}</div>
                                    <div><span className="text-muted-foreground">UOM: </span>{item.unit}</div>
                                    <div><span className="text-muted-foreground">Opening: </span>{fmtQty(item.opening_qty)}</div>
                                    <div className={low ? "text-amber-600" : ""}>
                                      <span className="text-muted-foreground">Recorded: </span>
                                      {low && <AlertTriangle className="size-3 inline mr-0.5" />}
                                      {fmtQty(item.recorded_qty)}
                                    </div>
                                    {item.storage_type && <div className="col-span-2"><span className="text-muted-foreground">Storage: </span>{item.storage_type}</div>}
                                    {item.part_description && <div className="col-span-2 text-muted-foreground truncate">{item.part_description}</div>}
                                  </div>
                                  <TagBadges tags={item.tags} />
                                  <div className="flex justify-end gap-0.5 pt-1 border-t">
                                    <Button variant="ghost" size="icon" className="size-7" onClick={() => openAdjust(item, "add")}><PackagePlus className="size-3.5 text-emerald-600" /></Button>
                                    <Button variant="ghost" size="icon" className="size-7" onClick={() => openAdjust(item, "subtract")}><PackageMinus className="size-3.5 text-amber-600" /></Button>
                                    {admin && (
                                      <>
                                        <Button variant="ghost" size="icon" className="size-7" onClick={() => openEditItem(item)}><Pencil className="size-3.5" /></Button>
                                        <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                                          onClick={() => setDeleteItemId({ id: item.id, catId: cat.id })}><Trash2 className="size-3.5" /></Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}

                      {admin && (
                        <div className="flex justify-end px-4 py-2 border-t bg-muted/5">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                            onClick={() => router.push(`/dashboard/inventory/spares/${cat.id}/items/new`)}>
                            <PlusIcon className="size-3" /> Add Item
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Edit Category Sheet ────────────────────────────────────────────────── */}
      <Sheet open={editCatSheet} onOpenChange={(o) => !o && setEditCatSheet(false)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6"><SheetTitle>Edit Category</SheetTitle></SheetHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ec-name">Name *</Label>
              <Input id="ec-name" value={catForm.name}
                onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))} disabled={catSaving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-desc">Description</Label>
              <textarea id="ec-desc" rows={3} value={catForm.description}
                onChange={(e) => setCatForm((f) => ({ ...f, description: e.target.value }))}
                disabled={catSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            {catError && <p className="text-sm text-destructive">{catError}</p>}
            <div className="flex gap-3 pt-2">
              <Button onClick={saveCat} disabled={catSaving} className="flex-1">{catSaving ? "Saving…" : "Save Changes"}</Button>
              <Button variant="outline" onClick={() => setEditCatSheet(false)} disabled={catSaving}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Edit Item Sheet ────────────────────────────────────────────────────── */}
      <Sheet open={editItemSheet} onOpenChange={(o) => !o && setEditItemSheet(false)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4"><SheetTitle>Edit — {editingItem?.name}</SheetTitle></SheetHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ei-name">Name *</Label>
              <Input id="ei-name" value={itemForm.name}
                onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} disabled={itemSaving} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ei-pn">Part No.</Label>
                <Input id="ei-pn" placeholder="ENG-068" value={itemForm.part_number}
                  onChange={(e) => setItemForm((f) => ({ ...f, part_number: e.target.value }))} disabled={itemSaving} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ei-vm">Variant / Model</Label>
                <Input id="ei-vm" placeholder="168cc" value={itemForm.variant_model}
                  onChange={(e) => setItemForm((f) => ({ ...f, variant_model: e.target.value }))} disabled={itemSaving} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ei-desc">Part Description</Label>
              <textarea id="ei-desc" rows={2} value={itemForm.part_description}
                onChange={(e) => setItemForm((f) => ({ ...f, part_description: e.target.value }))}
                disabled={itemSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ei-rate">Rate per Unit (₹)</Label>
                <Input id="ei-rate" type="number" min="0" step="any" placeholder="0.00" value={itemForm.rate}
                  onChange={(e) => setItemForm((f) => ({ ...f, rate: e.target.value }))} disabled={itemSaving} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ei-unit">Unit of Measure</Label>
                <select id="ei-unit" value={itemCustomUnit ? "__custom__" : itemForm.unit}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__custom__") { setItemCustomUnit(true); setItemForm((f) => ({ ...f, unit: "" })); }
                    else { setItemCustomUnit(false); setItemForm((f) => ({ ...f, unit: v, customUnit: "" })); }
                  }} disabled={itemSaving}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {STD_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  <option value="__custom__">Other…</option>
                </select>
                {itemCustomUnit && (
                  <Input placeholder="Enter unit" value={itemForm.customUnit}
                    onChange={(e) => setItemForm((f) => ({ ...f, customUnit: e.target.value }))}
                    disabled={itemSaving} className="mt-1.5" />
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ei-oq">Opening Qty</Label>
                <Input id="ei-oq" type="number" min="0" step="any" value={itemForm.opening_qty}
                  onChange={(e) => setItemForm((f) => ({ ...f, opening_qty: e.target.value }))} disabled={itemSaving} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ei-rq">Recorded Qty</Label>
                <Input id="ei-rq" type="number" min="0" step="any" value={itemForm.recorded_qty}
                  onChange={(e) => setItemForm((f) => ({ ...f, recorded_qty: e.target.value }))} disabled={itemSaving} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ei-rl">Reorder Level</Label>
                <Input id="ei-rl" type="number" min="0" step="any" value={itemForm.reorder_level}
                  onChange={(e) => setItemForm((f) => ({ ...f, reorder_level: e.target.value }))} disabled={itemSaving} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ei-st">Storage Type</Label>
                <select id="ei-st" value={itemForm.storage_type}
                  onChange={(e) => setItemForm((f) => ({ ...f, storage_type: e.target.value }))}
                  disabled={itemSaving}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Select —</option>
                  {STORAGE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ei-tags">Tags <span className="text-muted-foreground font-normal text-xs">(comma-sep.)</span></Label>
                <Input id="ei-tags" placeholder="Engines, Gear-box" value={itemForm.tags}
                  onChange={(e) => setItemForm((f) => ({ ...f, tags: e.target.value }))} disabled={itemSaving} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Image <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <div className="flex items-center gap-3">
                {itemImagePreview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={itemImagePreview} alt="preview" className="size-14 rounded-lg object-cover border" />
                ) : (
                  <div className="size-14 rounded-lg border-2 border-dashed flex items-center justify-center">
                    <ImageIcon className="size-5 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => imageInputRef.current?.click()} disabled={itemSaving}>
                    {itemImagePreview ? "Change" : "Upload"}
                  </Button>
                  {itemImagePreview && (
                    <Button type="button" size="sm" variant="ghost"
                      onClick={() => { setItemImagePreview(null); setItemImageB64(null); }} disabled={itemSaving}>
                      Remove
                    </Button>
                  )}
                </div>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </div>
            </div>
            {itemError && <p className="text-sm text-destructive">{itemError}</p>}
            <div className="flex gap-3 pt-2">
              <Button onClick={saveItem} disabled={itemSaving} className="flex-1">{itemSaving ? "Saving…" : "Save Changes"}</Button>
              <Button variant="outline" onClick={() => setEditItemSheet(false)} disabled={itemSaving}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Adjust Stock Sheet ─────────────────────────────────────────────────── */}
      <Sheet open={adjustItem !== null} onOpenChange={(o) => !o && setAdjustItem(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Adjust Stock — {adjustItem?.name}</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Recorded Qty: <strong>{adjustItem ? fmtQty(adjustItem.recorded_qty) : 0} {adjustItem?.unit}</strong>
            </p>
          </SheetHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              {(["add", "subtract", "set"] as const).map((t) => (
                <button key={t} onClick={() => setAdjustType(t)}
                  className={["flex-1 py-2 rounded-md text-sm font-medium border transition-colors",
                    adjustType === t ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted",
                  ].join(" ")}>{t === "add" ? "Add +" : t === "subtract" ? "Remove −" : "Set ="}</button>
              ))}
            </div>
            <input type="number" min="0" step="any" value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)} placeholder="Quantity"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <textarea rows={2} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Reason (optional)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            {adjustError && <p className="text-sm text-destructive">{adjustError}</p>}
            <div className="flex gap-3">
              <Button onClick={submitAdjust} disabled={adjustSaving} className="flex-1">{adjustSaving ? "Saving…" : "Apply"}</Button>
              <Button variant="outline" onClick={() => setAdjustItem(null)} disabled={adjustSaving}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Delete Category Alert ──────────────────────────────────────────────── */}
      <AlertDialog open={deleteCatId !== null} onOpenChange={(o) => !o && setDeleteCatId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>This deactivates the category. Items inside are not deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCat} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Item Alert ──────────────────────────────────────────────────── */}
      <AlertDialog open={deleteItemId !== null} onOpenChange={(o) => !o && setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>This marks the item as inactive.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteItem} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
