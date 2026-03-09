"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import {
  PlusIcon, Pencil, Trash2, AlertTriangle, Wrench, ChevronRight, ChevronDown,
  Search, PackagePlus, PackageMinus, ImageIcon, Layers,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpareCategory {
  id: number; name: string; description: string | null; is_active: boolean;
  sub_category_count: number; item_count: number; low_stock_count: number;
  created_at: string; updated_at: string;
}
interface SpareSubCategory {
  id: number; category_id: number; name: string; description: string | null;
  image_base64: string | null; is_active: boolean;
  item_count: number; low_stock_count: number;
  created_at: string; updated_at: string;
}
interface SpareItem {
  id: number; category_id: number; sub_category_id: number | null;
  name: string; part_number: string | null; part_description: string | null;
  variant_model: string | null; rate: number | null; unit: string;
  opening_qty: number; recorded_qty: number; reorder_level: number;
  storage_type: string | null; tags: string | null; image_base64: string | null;
  is_active: boolean; created_at: string; updated_at: string;
}

// ── Constants / helpers ───────────────────────────────────────────────────────

const STD_UNITS = ["pcs","kg","g","ltr","ml","mtr","cm","box","roll","set","pair"];
const STORAGE_TYPES = ["Shelf","Rack","Bin","Drawer","Tray","Cabinet","Box","Pallet","Floor"];
const BLANK_ITEM = {
  name:"", part_number:"", part_description:"", variant_model:"",
  rate:"", unit:"pcs", customUnit:"", opening_qty:"0",
  recorded_qty:"0", reorder_level:"0", storage_type:"", tags:"",
};
const BLANK_SUB = { name:"", description:"" };

function fmtQty(n: number) { return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2); }
function fmtRate(n: number | null) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits:0, maximumFractionDigits:2 })}`;
}
const isLow = (i: SpareItem) => i.reorder_level > 0 && i.recorded_qty <= i.reorder_level;

function TagBadges({ tags }: { tags: string | null }) {
  if (!tags?.trim()) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.split(",").map(t=>t.trim()).filter(Boolean).map(t=>(
        <Badge key={t} variant="secondary" className="text-xs px-1.5 py-0">{t}</Badge>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SparesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<SpareCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");

  // expand states
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<number>>(new Set());

  // lazy-loaded maps
  const [subsMap, setSubsMap]   = useState<Map<number, SpareSubCategory[]>>(new Map());
  const [itemsMap, setItemsMap] = useState<Map<number, SpareItem[]>>(new Map());
  const [subsLoading, setSubsLoading]   = useState<Set<number>>(new Set());
  const [itemsLoading, setItemsLoading] = useState<Set<number>>(new Set());

  // edit category sheet
  const [editCatSheet, setEditCatSheet] = useState(false);
  const [editingCat, setEditingCat]     = useState<SpareCategory | null>(null);
  const [catForm, setCatForm]           = useState({ name:"", description:"" });
  const [catSaving, setCatSaving]       = useState(false);
  const [catError, setCatError]         = useState<string | null>(null);

  // create/edit sub-category sheet
  const [subSheet, setSubSheet]           = useState<"create"|"edit"|null>(null);
  const [subSheetCatId, setSubSheetCatId] = useState<number>(0);
  const [editingSub, setEditingSub]       = useState<SpareSubCategory | null>(null);
  const [subForm, setSubForm]             = useState(BLANK_SUB);
  const [subImgPreview, setSubImgPreview] = useState<string | null>(null);
  const [subImgB64, setSubImgB64]         = useState<string | null>(null);
  const [subSaving, setSubSaving]         = useState(false);
  const [subError, setSubError]           = useState<string | null>(null);
  const subImgRef = useRef<HTMLInputElement>(null);

  // edit item sheet
  const [editItemSheet, setEditItemSheet] = useState(false);
  const [editingItem, setEditingItem]     = useState<SpareItem | null>(null);
  const [itemForm, setItemForm]           = useState<typeof BLANK_ITEM>({ ...BLANK_ITEM });
  const [itemCustomUnit, setItemCustomUnit] = useState(false);
  const [itemImgPreview, setItemImgPreview] = useState<string | null>(null);
  const [itemImgB64, setItemImgB64]         = useState<string | null>(null);
  const [itemSaving, setItemSaving]         = useState(false);
  const [itemError, setItemError]           = useState<string | null>(null);
  const itemImgRef = useRef<HTMLInputElement>(null);

  // adjust stock
  const [adjustItem, setAdjustItem]     = useState<SpareItem | null>(null);
  const [adjustType, setAdjustType]     = useState<"add"|"subtract"|"set">("add");
  const [adjustQty, setAdjustQty]       = useState("");
  const [adjustNote, setAdjustNote]     = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError]   = useState<string | null>(null);

  // deletes
  const [deleteCatId,  setDeleteCatId]  = useState<number | null>(null);
  const [deleteSubId,  setDeleteSubId]  = useState<{id:number; catId:number} | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<{id:number; subId:number} | null>(null);
  const [deleting, setDeleting]         = useState(false);

  useEffect(() => { setAdmin(isAdminOrAbove()); }, []);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchCategories = () => {
    setLoading(true);
    const p = new URLSearchParams({ include_inactive:"false" });
    if (search) p.set("search", search);
    apiFetchJson<SpareCategory[]>(`/api/v1/spares/categories?${p}`)
      .then(setCategories)
      .catch((e:unknown) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchCategories(); }, [search]); // eslint-disable-line

  async function toggleCat(catId: number) {
    if (expandedCats.has(catId)) {
      setExpandedCats(prev => { const s=new Set(prev); s.delete(catId); return s; });
      return;
    }
    setExpandedCats(prev => new Set(prev).add(catId));
    if (!subsMap.has(catId)) {
      setSubsLoading(prev => new Set(prev).add(catId));
      try {
        const subs = await apiFetchJson<SpareSubCategory[]>(
          `/api/v1/spares/categories/${catId}/sub-categories?include_inactive=false`
        );
        setSubsMap(prev => new Map(prev).set(catId, subs));
      } catch { /**/ }
      finally { setSubsLoading(prev => { const s=new Set(prev); s.delete(catId); return s; }); }
    }
  }

  async function refreshSubs(catId: number) {
    const subs = await apiFetchJson<SpareSubCategory[]>(
      `/api/v1/spares/categories/${catId}/sub-categories?include_inactive=false`
    ).catch(() => null);
    if (subs) setSubsMap(prev => new Map(prev).set(catId, subs));
    fetchCategories();
  }

  async function toggleSub(subId: number) {
    if (expandedSubs.has(subId)) {
      setExpandedSubs(prev => { const s=new Set(prev); s.delete(subId); return s; });
      return;
    }
    setExpandedSubs(prev => new Set(prev).add(subId));
    if (!itemsMap.has(subId)) {
      setItemsLoading(prev => new Set(prev).add(subId));
      try {
        const items = await apiFetchJson<SpareItem[]>(
          `/api/v1/spares/sub-categories/${subId}/items?include_inactive=false`
        );
        setItemsMap(prev => new Map(prev).set(subId, items));
      } catch { /**/ }
      finally { setItemsLoading(prev => { const s=new Set(prev); s.delete(subId); return s; }); }
    }
  }

  async function refreshItems(subId: number) {
    const items = await apiFetchJson<SpareItem[]>(
      `/api/v1/spares/sub-categories/${subId}/items?include_inactive=false`
    ).catch(() => null);
    if (items) setItemsMap(prev => new Map(prev).set(subId, items));
    // Also refresh sub counts
    const sub = [...subsMap.values()].flat().find(s => s.id === subId);
    if (sub) refreshSubs(sub.category_id);
  }

  // ── Category CRUD ───────────────────────────────────────────────────────────

  function openEditCat(cat: SpareCategory) {
    setEditingCat(cat);
    setCatForm({ name:cat.name, description:cat.description ?? "" });
    setCatError(null); setEditCatSheet(true);
  }
  async function saveCat() {
    if (!catForm.name.trim()) { setCatError("Name required"); return; }
    setCatSaving(true); setCatError(null);
    try {
      await apiFetchJson(`/api/v1/spares/categories/${editingCat!.id}`, {
        method:"PUT", body:JSON.stringify({ name:catForm.name.trim(), description:catForm.description||null }),
      });
      setEditCatSheet(false); fetchCategories();
    } catch(e:unknown) { setCatError(e instanceof Error ? e.message : "Save failed"); }
    finally { setCatSaving(false); }
  }
  async function deleteCat() {
    if (deleteCatId===null) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/spares/categories/${deleteCatId}`, { method:"DELETE" });
      setDeleteCatId(null); fetchCategories();
    } catch(e:unknown) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setDeleting(false); }
  }

  // ── Sub-category CRUD ────────────────────────────────────────────────────────

  function openCreateSub(catId: number) {
    setSubSheetCatId(catId); setEditingSub(null);
    setSubForm(BLANK_SUB); setSubImgPreview(null); setSubImgB64(null);
    setSubError(null); setSubSheet("create");
  }
  function openEditSub(sub: SpareSubCategory) {
    setSubSheetCatId(sub.category_id); setEditingSub(sub);
    setSubForm({ name:sub.name, description:sub.description ?? "" });
    setSubImgPreview(sub.image_base64 ? `data:image/jpeg;base64,${sub.image_base64}` : null);
    setSubImgB64(sub.image_base64 ?? null);
    setSubError(null); setSubSheet("edit");
  }
  function handleSubImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { const d=r.result as string; setSubImgPreview(d); setSubImgB64(d.split(",")[1]??null); };
    r.readAsDataURL(file);
  }
  async function saveSub() {
    if (!subForm.name.trim()) { setSubError("Name required"); return; }
    setSubSaving(true); setSubError(null);
    try {
      if (subSheet === "create") {
        await apiFetchJson(`/api/v1/spares/categories/${subSheetCatId}/sub-categories`, {
          method:"POST", body:JSON.stringify({ name:subForm.name.trim(), description:subForm.description||null, image_base64:subImgB64 }),
        });
      } else {
        await apiFetchJson(`/api/v1/spares/sub-categories/${editingSub!.id}`, {
          method:"PUT", body:JSON.stringify({ name:subForm.name.trim(), description:subForm.description||null, image_base64:subImgB64 }),
        });
      }
      setSubSheet(null);
      await refreshSubs(subSheetCatId);
    } catch(e:unknown) { setSubError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSubSaving(false); }
  }
  async function deleteSub() {
    if (!deleteSubId) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/spares/sub-categories/${deleteSubId.id}`, { method:"DELETE" });
      setDeleteSubId(null); await refreshSubs(deleteSubId.catId);
    } catch(e:unknown) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setDeleting(false); }
  }

  // ── Item CRUD ────────────────────────────────────────────────────────────────

  function openEditItem(item: SpareItem) {
    setEditingItem(item);
    const stdUnit = STD_UNITS.includes(item.unit);
    setItemCustomUnit(!stdUnit);
    setItemImgPreview(item.image_base64 ? `data:image/jpeg;base64,${item.image_base64}` : null);
    setItemImgB64(item.image_base64 ?? null);
    setItemForm({
      name:item.name, part_number:item.part_number??"",
      part_description:item.part_description??"", variant_model:item.variant_model??"",
      rate:item.rate!=null?String(item.rate):"",
      unit:stdUnit?item.unit:"__custom__", customUnit:stdUnit?"":item.unit,
      opening_qty:String(item.opening_qty), recorded_qty:String(item.recorded_qty),
      reorder_level:String(item.reorder_level), storage_type:item.storage_type??"", tags:item.tags??"",
    });
    setItemError(null); setEditItemSheet(true);
  }
  function handleItemImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { const d=r.result as string; setItemImgPreview(d); setItemImgB64(d.split(",")[1]??null); };
    r.readAsDataURL(file);
  }
  async function saveItem() {
    if (!itemForm.name.trim()) { setItemError("Name required"); return; }
    const unit = itemCustomUnit?(itemForm.customUnit.trim()||"pcs"):itemForm.unit;
    setItemSaving(true); setItemError(null);
    try {
      await apiFetchJson(`/api/v1/spares/items/${editingItem!.id}`, {
        method:"PUT", body:JSON.stringify({
          name:itemForm.name.trim(), part_number:itemForm.part_number||null,
          part_description:itemForm.part_description||null, variant_model:itemForm.variant_model||null,
          rate:itemForm.rate?parseFloat(itemForm.rate):null, unit,
          opening_qty:parseFloat(itemForm.opening_qty)||0,
          recorded_qty:parseFloat(itemForm.recorded_qty)||0,
          reorder_level:parseFloat(itemForm.reorder_level)||0,
          storage_type:itemForm.storage_type||null, tags:itemForm.tags||null,
          image_base64:itemImgB64,
        }),
      });
      setEditItemSheet(false);
      if (editingItem!.sub_category_id) await refreshItems(editingItem!.sub_category_id);
    } catch(e:unknown) { setItemError(e instanceof Error ? e.message : "Save failed"); }
    finally { setItemSaving(false); }
  }
  async function deleteItem() {
    if (!deleteItemId) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/spares/items/${deleteItemId.id}`, { method:"DELETE" });
      await refreshItems(deleteItemId.subId);
      setDeleteItemId(null);
    } catch(e:unknown) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setDeleting(false); }
  }

  // ── Adjust stock ─────────────────────────────────────────────────────────────

  function openAdjust(item: SpareItem, type: "add"|"subtract") {
    setAdjustItem(item); setAdjustType(type); setAdjustQty(""); setAdjustNote(""); setAdjustError(null);
  }
  async function submitAdjust() {
    if (!adjustItem) return;
    const qty = parseFloat(adjustQty);
    if (isNaN(qty)||qty<0) { setAdjustError("Enter a valid qty ≥ 0"); return; }
    setAdjustSaving(true); setAdjustError(null);
    try {
      await apiFetchJson(`/api/v1/spares/items/${adjustItem.id}/adjust`, {
        method:"POST", body:JSON.stringify({ adjustment_type:adjustType, quantity:qty, note:adjustNote||null }),
      });
      if (adjustItem.sub_category_id) await refreshItems(adjustItem.sub_category_id);
      setAdjustItem(null);
    } catch(e:unknown) { setAdjustError(e instanceof Error ? e.message : "Failed"); }
    finally { setAdjustSaving(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b px-6 gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link href="/dashboard/inventory" className="text-muted-foreground hover:text-foreground text-sm">Inventory</Link>
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
            <p className="text-sm text-muted-foreground mt-0.5">Category → Sub-category → Items</p>
          </div>
          <form onSubmit={e=>{e.preventDefault();setSearch(searchDraft.trim());}} className="flex gap-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" value={searchDraft} onChange={e=>setSearchDraft(e.target.value)}
                placeholder="Search categories…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-48" />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
            {search && <Button type="button" size="sm" variant="ghost" onClick={()=>{setSearch("");setSearchDraft("");}}>Clear</Button>}
          </form>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <div className="space-y-2">{Array.from({length:3}).map((_,i)=>(
            <div key={i} className="rounded-lg border p-4"><Skeleton className="h-8 w-full" /></div>
          ))}</div>
        ) : categories.length === 0 ? (
          <div className="rounded-xl border p-12 text-center space-y-2">
            <Wrench className="size-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{search?`No categories matching "${search}".`:"No spare categories yet."}</p>
            {admin && !search && (
              <Button size="sm" onClick={()=>router.push("/dashboard/inventory/spares/new")}>
                <PlusIcon className="size-4 mr-1" />Create First Category
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden divide-y">
            {categories.map(cat => {
              const catExpanded = expandedCats.has(cat.id);
              const subs = subsMap.get(cat.id) ?? [];
              const loadingSubs = subsLoading.has(cat.id);

              return (
                <div key={cat.id}>
                  {/* ── Category row ── */}
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer select-none transition-colors bg-background"
                    onClick={()=>toggleCat(cat.id)}>
                    <div className="flex size-8 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                      <Wrench className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm">{cat.name}</span>
                      {cat.description && <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">{cat.description}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                      <span>{cat.sub_category_count} sub</span>
                      <span>·</span>
                      <span>{cat.item_count} items</span>
                      {cat.low_stock_count > 0 && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          <AlertTriangle className="size-3 mr-1" />{cat.low_stock_count} low
                        </Badge>
                      )}
                      {admin && (
                        <span className="flex gap-0.5 ml-1" onClick={e=>e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-7" onClick={()=>openEditCat(cat)}><Pencil className="size-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={()=>setDeleteCatId(cat.id)}><Trash2 className="size-3.5" /></Button>
                        </span>
                      )}
                      {catExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </div>
                  </div>

                  {/* ── Sub-categories panel ── */}
                  {catExpanded && (
                    <div className="border-t bg-muted/5">
                      {loadingSubs ? (
                        <div className="px-8 py-4 space-y-2">{[1,2].map(i=><Skeleton key={i} className="h-8 w-full" />)}</div>
                      ) : subs.length === 0 ? (
                        <div className="px-8 py-5 text-center text-sm text-muted-foreground">
                          No sub-categories yet.
                          {admin && <Button size="sm" variant="link" className="ml-2 h-auto p-0" onClick={()=>openCreateSub(cat.id)}>Add first sub-category →</Button>}
                        </div>
                      ) : (
                        <div className="divide-y">
                          {subs.map(sub => {
                            const subExpanded = expandedSubs.has(sub.id);
                            const items = itemsMap.get(sub.id) ?? [];
                            const loadingItems = itemsLoading.has(sub.id);

                            return (
                              <div key={sub.id}>
                                {/* ── Sub-category row ── */}
                                <div className="flex items-center gap-3 pl-8 pr-4 py-2.5 hover:bg-muted/30 cursor-pointer select-none transition-colors"
                                  onClick={()=>toggleSub(sub.id)}>
                                  <div className="flex size-7 items-center justify-center rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">
                                    <Layers className="size-3.5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-sm">{sub.name}</span>
                                    {sub.description && <span className="ml-2 text-xs text-muted-foreground hidden sm:inline truncate max-w-[180px]">{sub.description}</span>}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                                    <span>{sub.item_count} items</span>
                                    {sub.low_stock_count > 0 && (
                                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                                        <AlertTriangle className="size-3 mr-1" />{sub.low_stock_count} low
                                      </Badge>
                                    )}
                                    {admin && (
                                      <span className="flex gap-0.5 ml-1" onClick={e=>e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="size-6" onClick={()=>openEditSub(sub)}><Pencil className="size-3" /></Button>
                                        <Button variant="ghost" size="icon" className="size-6 text-destructive hover:text-destructive" onClick={()=>setDeleteSubId({id:sub.id,catId:cat.id})}><Trash2 className="size-3" /></Button>
                                      </span>
                                    )}
                                    {subExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                  </div>
                                </div>

                                {/* ── Items panel ── */}
                                {subExpanded && (
                                  <div className="border-t bg-muted/10">
                                    {loadingItems ? (
                                      <div className="pl-12 pr-4 py-3 space-y-2">{[1,2].map(i=><Skeleton key={i} className="h-8 w-full" />)}</div>
                                    ) : items.length === 0 ? (
                                      <div className="pl-12 pr-4 py-4 text-center text-sm text-muted-foreground">
                                        No items yet.
                                        {admin && <Button size="sm" variant="link" className="ml-2 h-auto p-0"
                                          onClick={()=>router.push(`/dashboard/inventory/spares/${cat.id}/sub-categories/${sub.id}/items/new`)}>
                                          Add first item →
                                        </Button>}
                                      </div>
                                    ) : (
                                      <>
                                        {/* Desktop table */}
                                        <div className="hidden md:block overflow-x-auto">
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="border-b bg-muted/50">
                                                <th className="pl-12 pr-3 py-2 text-left font-medium text-muted-foreground w-6">#</th>
                                                <th className="px-3 py-2 text-left font-medium">Name / Part No.</th>
                                                <th className="px-3 py-2 text-left font-medium">Description</th>
                                                <th className="px-3 py-2 text-left font-medium">Variant/Model</th>
                                                <th className="px-3 py-2 text-right font-medium">Rate</th>
                                                <th className="px-3 py-2 text-center font-medium">UOM</th>
                                                <th className="px-3 py-2 text-right font-medium">Opening</th>
                                                <th className="px-3 py-2 text-right font-medium">Recorded</th>
                                                <th className="px-3 py-2 text-left font-medium">Storage</th>
                                                <th className="px-3 py-2 text-left font-medium">Tags</th>
                                                <th className="px-3 py-2 text-center font-medium">Img</th>
                                                <th className="px-3 py-2 text-right font-medium">Actions</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {items.map((item, ii) => {
                                                const low = isLow(item);
                                                return (
                                                  <tr key={item.id}
                                                    className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${!item.is_active?"opacity-50":""}`}>
                                                    <td className="pl-12 pr-3 py-2 text-muted-foreground">{ii+1}</td>
                                                    <td className="px-3 py-2">
                                                      <p className="font-medium">{item.name}</p>
                                                      {item.part_number && <p className="text-muted-foreground font-mono">{item.part_number}</p>}
                                                    </td>
                                                    <td className="px-3 py-2 text-muted-foreground max-w-[140px]"><p className="truncate">{item.part_description??"—"}</p></td>
                                                    <td className="px-3 py-2 text-muted-foreground">{item.variant_model??"—"}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{fmtRate(item.rate)}</td>
                                                    <td className="px-3 py-2 text-center">{item.unit}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{fmtQty(item.opening_qty)}</td>
                                                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${low?"text-amber-600":""}`}>
                                                      <span className="inline-flex items-center gap-1 justify-end">
                                                        {low && <AlertTriangle className="size-3" />}
                                                        {fmtQty(item.recorded_qty)}
                                                      </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-muted-foreground">{item.storage_type??"—"}</td>
                                                    <td className="px-3 py-2"><TagBadges tags={item.tags} /></td>
                                                    <td className="px-3 py-2 text-center">
                                                      {item.image_base64 ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={`data:image/jpeg;base64,${item.image_base64}`} alt={item.name}
                                                          className="size-8 rounded object-cover mx-auto" />
                                                      ) : <ImageIcon className="size-4 text-muted-foreground/30 mx-auto" />}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                      <div className="inline-flex gap-0.5">
                                                        <Button variant="ghost" size="icon" className="size-6" title="Add Stock" onClick={()=>openAdjust(item,"add")}><PackagePlus className="size-3 text-emerald-600" /></Button>
                                                        <Button variant="ghost" size="icon" className="size-6" title="Remove Stock" onClick={()=>openAdjust(item,"subtract")}><PackageMinus className="size-3 text-amber-600" /></Button>
                                                        {admin && <>
                                                          <Button variant="ghost" size="icon" className="size-6" onClick={()=>openEditItem(item)}><Pencil className="size-3" /></Button>
                                                          <Button variant="ghost" size="icon" className="size-6 text-destructive hover:text-destructive"
                                                            onClick={()=>setDeleteItemId({id:item.id,subId:sub.id})}><Trash2 className="size-3" /></Button>
                                                        </>}
                                                      </div>
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>

                                        {/* Mobile cards */}
                                        <div className="md:hidden space-y-2 p-3 pl-10">
                                          {items.map(item => {
                                            const low = isLow(item);
                                            return (
                                              <div key={item.id} className={`rounded-lg border bg-card p-3 space-y-2 ${!item.is_active?"opacity-50":""}`}>
                                                <div className="flex items-start gap-2 justify-between">
                                                  <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm">{item.name}</p>
                                                    {item.part_number && <p className="text-xs font-mono text-muted-foreground">{item.part_number}</p>}
                                                    {item.variant_model && <p className="text-xs text-muted-foreground">{item.variant_model}</p>}
                                                  </div>
                                                  {item.image_base64 && (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={`data:image/jpeg;base64,${item.image_base64}`} alt={item.name} className="size-10 rounded object-cover shrink-0" />
                                                  )}
                                                </div>
                                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                                  <div><span className="text-muted-foreground">Rate: </span>{fmtRate(item.rate)}</div>
                                                  <div><span className="text-muted-foreground">UOM: </span>{item.unit}</div>
                                                  <div><span className="text-muted-foreground">Opening: </span>{fmtQty(item.opening_qty)}</div>
                                                  <div className={low?"text-amber-600":""}>
                                                    <span className="text-muted-foreground">Recorded: </span>
                                                    {low && <AlertTriangle className="size-3 inline mr-0.5" />}
                                                    {fmtQty(item.recorded_qty)}
                                                  </div>
                                                  {item.storage_type && <div className="col-span-2"><span className="text-muted-foreground">Storage: </span>{item.storage_type}</div>}
                                                </div>
                                                <TagBadges tags={item.tags} />
                                                <div className="flex justify-end gap-0.5 pt-1 border-t">
                                                  <Button variant="ghost" size="icon" className="size-7" onClick={()=>openAdjust(item,"add")}><PackagePlus className="size-3.5 text-emerald-600" /></Button>
                                                  <Button variant="ghost" size="icon" className="size-7" onClick={()=>openAdjust(item,"subtract")}><PackageMinus className="size-3.5 text-amber-600" /></Button>
                                                  {admin && <>
                                                    <Button variant="ghost" size="icon" className="size-7" onClick={()=>openEditItem(item)}><Pencil className="size-3.5" /></Button>
                                                    <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                                                      onClick={()=>setDeleteItemId({id:item.id,subId:sub.id})}><Trash2 className="size-3.5" /></Button>
                                                  </>}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </>
                                    )}

                                    {admin && (
                                      <div className="flex justify-end pl-12 pr-4 py-2 border-t bg-muted/5">
                                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                                          onClick={()=>router.push(`/dashboard/inventory/spares/${cat.id}/sub-categories/${sub.id}/items/new`)}>
                                          <PlusIcon className="size-3" />Add Item
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

                      {admin && (
                        <div className="flex justify-end px-4 py-2 border-t bg-muted/5">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={()=>openCreateSub(cat.id)}>
                            <PlusIcon className="size-3" />Add Sub-category
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

      {/* ── Edit Category Dialog ─────────────────────────────────────── */}
      <Dialog open={editCatSheet} onOpenChange={o=>!o&&setEditCatSheet(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="mb-2"><DialogTitle>Edit Category</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ec-name">Name *</Label>
              <Input id="ec-name" value={catForm.name} onChange={e=>setCatForm(f=>({...f,name:e.target.value}))} disabled={catSaving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-desc">Description</Label>
              <textarea id="ec-desc" rows={3} value={catForm.description}
                onChange={e=>setCatForm(f=>({...f,description:e.target.value}))} disabled={catSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            {catError && <p className="text-sm text-destructive">{catError}</p>}
            <div className="flex gap-3 pt-2">
              <Button onClick={saveCat} disabled={catSaving} className="flex-1">{catSaving?"Saving…":"Save Changes"}</Button>
              <Button variant="outline" onClick={()=>setEditCatSheet(false)} disabled={catSaving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create / Edit Sub-category Dialog ───────────────────────── */}
      <Dialog open={subSheet!==null} onOpenChange={o=>!o&&setSubSheet(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="mb-2">
            <DialogTitle>{subSheet==="create"?"New Sub-category":"Edit Sub-category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sub-name">Name *</Label>
              <Input id="sub-name" placeholder="e.g. 168cc Vehicle" value={subForm.name}
                onChange={e=>setSubForm(f=>({...f,name:e.target.value}))} disabled={subSaving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-desc">Description</Label>
              <textarea id="sub-desc" rows={2} value={subForm.description}
                onChange={e=>setSubForm(f=>({...f,description:e.target.value}))} disabled={subSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label>Image <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <div className="flex items-center gap-3">
                {subImgPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={subImgPreview} alt="preview" className="size-14 rounded-lg object-cover border" />
                ) : (
                  <div className="size-14 rounded-lg border-2 border-dashed flex items-center justify-center">
                    <ImageIcon className="size-5 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={()=>subImgRef.current?.click()} disabled={subSaving}>{subImgPreview?"Change":"Upload"}</Button>
                  {subImgPreview && <Button type="button" size="sm" variant="ghost" onClick={()=>{setSubImgPreview(null);setSubImgB64(null);}} disabled={subSaving}>Remove</Button>}
                </div>
                <input ref={subImgRef} type="file" accept="image/*" className="hidden" onChange={handleSubImg} />
              </div>
            </div>
            {subError && <p className="text-sm text-destructive">{subError}</p>}
            <div className="flex gap-3 pt-2">
              <Button onClick={saveSub} disabled={subSaving} className="flex-1">{subSaving?"Saving…":subSheet==="create"?"Create":"Save Changes"}</Button>
              <Button variant="outline" onClick={()=>setSubSheet(null)} disabled={subSaving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Item Dialog ─────────────────────────────────────────── */}
      <Dialog open={editItemSheet} onOpenChange={o=>!o&&setEditItemSheet(false)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="mb-2"><DialogTitle>Edit — {editingItem?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ei-name">Name *</Label>
              <Input id="ei-name" value={itemForm.name} onChange={e=>setItemForm(f=>({...f,name:e.target.value}))} disabled={itemSaving} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ei-pn">Part No.</Label>
                <Input id="ei-pn" placeholder="ENG-068" value={itemForm.part_number} onChange={e=>setItemForm(f=>({...f,part_number:e.target.value}))} disabled={itemSaving} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ei-vm">Variant / Model</Label>
                <Input id="ei-vm" placeholder="168cc" value={itemForm.variant_model} onChange={e=>setItemForm(f=>({...f,variant_model:e.target.value}))} disabled={itemSaving} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ei-desc">Part Description</Label>
              <textarea id="ei-desc" rows={2} value={itemForm.part_description}
                onChange={e=>setItemForm(f=>({...f,part_description:e.target.value}))} disabled={itemSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ei-rate">Rate (₹)</Label>
                <Input id="ei-rate" type="number" min="0" step="any" placeholder="0.00" value={itemForm.rate} onChange={e=>setItemForm(f=>({...f,rate:e.target.value}))} disabled={itemSaving} />
              </div>
              <div className="space-y-1">
                <Label>Unit</Label>
                <select value={itemCustomUnit?"__custom__":itemForm.unit}
                  onChange={e=>{const v=e.target.value;if(v==="__custom__"){setItemCustomUnit(true);setItemForm(f=>({...f,unit:""}));}else{setItemCustomUnit(false);setItemForm(f=>({...f,unit:v,customUnit:""}));}}}
                  disabled={itemSaving}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {STD_UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                  <option value="__custom__">Other…</option>
                </select>
                {itemCustomUnit && <Input placeholder="Enter unit" value={itemForm.customUnit} onChange={e=>setItemForm(f=>({...f,customUnit:e.target.value}))} disabled={itemSaving} className="mt-1.5" />}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["opening_qty","recorded_qty","reorder_level"].map(k=>(
                <div key={k} className="space-y-1">
                  <Label htmlFor={`ei-${k}`}>{k==="opening_qty"?"Opening Qty":k==="recorded_qty"?"Recorded Qty":"Reorder Level"}</Label>
                  <Input id={`ei-${k}`} type="number" min="0" step="any" value={itemForm[k as keyof typeof itemForm]}
                    onChange={e=>setItemForm(f=>({...f,[k]:e.target.value}))} disabled={itemSaving} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Storage Type</Label>
                <select value={itemForm.storage_type} onChange={e=>setItemForm(f=>({...f,storage_type:e.target.value}))} disabled={itemSaving}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Select —</option>
                  {STORAGE_TYPES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ei-tags">Tags <span className="text-muted-foreground font-normal text-xs">(comma-sep.)</span></Label>
                <Input id="ei-tags" placeholder="Engine, Gear-box" value={itemForm.tags} onChange={e=>setItemForm(f=>({...f,tags:e.target.value}))} disabled={itemSaving} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Image</Label>
              <div className="flex items-center gap-3">
                {itemImgPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={itemImgPreview} alt="preview" className="size-14 rounded-lg object-cover border" />
                ) : <div className="size-14 rounded-lg border-2 border-dashed flex items-center justify-center"><ImageIcon className="size-5 text-muted-foreground/40" /></div>}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={()=>itemImgRef.current?.click()} disabled={itemSaving}>{itemImgPreview?"Change":"Upload"}</Button>
                  {itemImgPreview && <Button type="button" size="sm" variant="ghost" onClick={()=>{setItemImgPreview(null);setItemImgB64(null);}} disabled={itemSaving}>Remove</Button>}
                </div>
                <input ref={itemImgRef} type="file" accept="image/*" className="hidden" onChange={handleItemImg} />
              </div>
            </div>
            {itemError && <p className="text-sm text-destructive">{itemError}</p>}
            <div className="flex gap-3 pt-2">
              <Button onClick={saveItem} disabled={itemSaving} className="flex-1">{itemSaving?"Saving…":"Save Changes"}</Button>
              <Button variant="outline" onClick={()=>setEditItemSheet(false)} disabled={itemSaving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Adjust Stock Dialog ──────────────────────────────────────── */}
      <Dialog open={adjustItem!==null} onOpenChange={o=>!o&&setAdjustItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="mb-2">
            <DialogTitle>Adjust Stock — {adjustItem?.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">Recorded Qty: <strong>{adjustItem?fmtQty(adjustItem.recorded_qty):0} {adjustItem?.unit}</strong></p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              {(["add","subtract","set"] as const).map(t=>(
                <button key={t} onClick={()=>setAdjustType(t)}
                  className={["flex-1 py-2 rounded-md text-sm font-medium border transition-colors",
                    adjustType===t?"bg-primary text-primary-foreground border-primary":"border-input hover:bg-muted"].join(" ")}>
                  {t==="add"?"Add +":t==="subtract"?"Remove −":"Set ="}
                </button>
              ))}
            </div>
            <input type="number" min="0" step="any" value={adjustQty} onChange={e=>setAdjustQty(e.target.value)} placeholder="Quantity"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <textarea rows={2} value={adjustNote} onChange={e=>setAdjustNote(e.target.value)} placeholder="Reason (optional)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            {adjustError && <p className="text-sm text-destructive">{adjustError}</p>}
            <div className="flex gap-3">
              <Button onClick={submitAdjust} disabled={adjustSaving} className="flex-1">{adjustSaving?"Saving…":"Apply"}</Button>
              <Button variant="outline" onClick={()=>setAdjustItem(null)} disabled={adjustSaving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Category ─────────────────────────────────────────── */}
      <AlertDialog open={deleteCatId!==null} onOpenChange={o=>!o&&setDeleteCatId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>This deactivates the category and all its sub-categories.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCat} disabled={deleting}>{deleting?"Deleting…":"Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Sub-category ─────────────────────────────────────── */}
      <AlertDialog open={deleteSubId!==null} onOpenChange={o=>!o&&setDeleteSubId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete sub-category?</AlertDialogTitle>
            <AlertDialogDescription>This deactivates the sub-category and its items.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSub} disabled={deleting}>{deleting?"Deleting…":"Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Item ─────────────────────────────────────────────── */}
      <AlertDialog open={deleteItemId!==null} onOpenChange={o=>!o&&setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>This marks the item as inactive.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteItem} disabled={deleting}>{deleting?"Deleting…":"Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
