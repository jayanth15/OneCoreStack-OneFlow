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
import { isAdminOrAbove, canAccessInventory } from "@/lib/user";
import {
  PlusIcon, Pencil, Trash2, AlertTriangle, Wrench, ChevronRight, ChevronDown,
  Search, PackagePlus, PackageMinus, ImageIcon, Layers, Eye, History, ChevronsDown,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpareCategory {
  id: number; name: string; description: string | null; is_active: boolean;
  sub_category_count: number; item_count: number; low_stock_count: number;
  total_value: number | null;
  created_at: string; updated_at: string;
}
interface SpareSubCategory {
  id: number; category_id: number; name: string; description: string | null;
  image_base64: string | null; is_active: boolean;
  item_count: number; low_stock_count: number;
  total_value: number | null;
  created_at: string; updated_at: string;
}
interface SpareItem {
  id: number; category_id: number; sub_category_id: number | null;
  name: string; part_number: string | null; part_description: string | null;
  variant_model: string | null; rate: number | null; unit: string;
  opening_qty: number; recorded_qty: number; reorder_level: number;
  storage_type: string | null; storage_location: string | null; image_base64: string | null;
  total_value: number | null;
  is_active: boolean; created_at: string; updated_at: string;
}
interface SpareItemHistoryEntry {
  id: number; spare_item_id: number; changed_by_username: string | null;
  changed_at: string; change_type: string;
  qty_before: number; qty_after: number; qty_delta: number; note: string | null;
}
interface SpareVariant {
  id: number; spare_item_id: number; serial_number: string | null;
  variant_color: string | null; image_base64: string | null; qty: number;
  storage_location: string | null; storage_type: string | null; rate: number | null;
  is_active: boolean; created_at: string; updated_at: string;
}

// ── Constants / helpers ───────────────────────────────────────────────────────

const STD_UNITS = ["pcs","kg","g","ltr","ml","mtr","cm","box","roll","set","pair"];
const STORAGE_TYPES = ["Shelf","Rack","Bin","Drawer","Tray","Cabinet","Box","Pallet","Floor"];
const BLANK_ITEM = {
  name:"", part_number:"", part_description:"", variant_model:"",
  rate:"", unit:"pcs", customUnit:"", opening_qty:"0",
  recorded_qty:"0", reorder_level:"0", storage_type:"", storage_location:"",
};
const BLANK_SUB = { name:"", description:"" };

function fmtQty(n: number) { return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2); }
function fmtRate(n: number | null) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function isLow(item: SpareItem) { return item.reorder_level > 0 && item.recorded_qty <= item.reorder_level; }

const ITEMS_PAGE_SIZE = 50;

interface ItemsPage {
  items: SpareItem[];
  total: number;
  page: number;
  pages: number;
}

function highlight(text: string | null | undefined, q: string): React.ReactNode {
  if (!q || !text) return text ?? "";
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return <>{text.slice(0, idx)}<mark className="bg-yellow-200 dark:bg-yellow-800/60 rounded-sm px-0.5 not-italic">{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>;
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
  const [itemsMeta, setItemsMeta] = useState<Map<number, { total: number; page: number; pages: number }>>(new Map());
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
  const [itemForm, setItemForm]           = useState({ name:"", part_number:"", part_description:"", reorder_level:"0" });
  // history (admin-only)
  const [historyItem, setHistoryItem] = useState<SpareItem | null>(null);
  const [historyRows, setHistoryRows] = useState<SpareItemHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  // variants popup dialog
  const [variantsDialogItem, setVariantsDialogItem] = useState<SpareItem | null>(null);
  const [variantsRows, setVariantsRows] = useState<SpareVariant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantForm, setVariantForm] = useState({serial_number:"",variant_color:"",qty:"0",unit:"pcs",customUnit:"",storage_type:"",storage_location:"",rate:"",image_base64: null as string | null});
  const [variantCustomStorage, setVariantCustomStorage] = useState(false);
  const [variantCustomUnit, setVariantCustomUnit] = useState(false);
  const [variantSaving, setVariantSaving] = useState(false);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [variantImgPreview, setVariantImgPreview] = useState<string | null>(null);
  const variantImgRef = useRef<HTMLInputElement>(null);
  // variant dialogs
  const [addVariantDialog, setAddVariantDialog] = useState(false);
  const [editVariantDialog, setEditVariantDialog] = useState(false);
  const [editVariantId, setEditVariantId] = useState<number | null>(null);
  const [editVForm, setEditVForm] = useState({serial_number:"",variant_color:"",qty:"0",unit:"pcs",customUnit:"",storage_type:"",storage_location:"",rate:"",image_base64:null as string|null});
  const [editVCustomStorage, setEditVCustomStorage] = useState(false);
  const [editVCustomUnit, setEditVCustomUnit] = useState(false);
  const [editVSaving, setEditVSaving] = useState(false);
  const [editVError, setEditVError] = useState<string|null>(null);
  const [editVImgPreview, setEditVImgPreview] = useState<string|null>(null);
  const editVImgRef = useRef<HTMLInputElement>(null);
  const [itemSaving, setItemSaving]         = useState(false);
  const [itemError, setItemError]           = useState<string | null>(null);

  // adjust stock (item-level)
  const [adjustItem, setAdjustItem]     = useState<SpareItem | null>(null);
  const [adjustType, setAdjustType]     = useState<"add"|"subtract"|"set">("add");
  const [adjustQty, setAdjustQty]       = useState("");
  const [adjustNote, setAdjustNote]     = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError]   = useState<string | null>(null);
  const [adjustItemVariants, setAdjustItemVariants]       = useState<SpareVariant[]>([]);
  const [adjustSelectedVarId, setAdjustSelectedVarId]     = useState<number | "">("")
  const [adjustVariantsLoading, setAdjustVariantsLoading] = useState(false);
  // adjust stock (variant-level)
  const [adjustVariant, setAdjustVariant]   = useState<SpareVariant | null>(null);
  const [adjustVType, setAdjustVType]       = useState<"add"|"subtract"|"set">("add");
  const [adjustVQty, setAdjustVQty]         = useState("");
  const [adjustVNote, setAdjustVNote]       = useState("");
  const [adjustVSaving, setAdjustVSaving]   = useState(false);
  const [adjustVError, setAdjustVError]     = useState<string | null>(null);

  // deletes
  const [deleteCatId,  setDeleteCatId]  = useState<number | null>(null);
  const [deleteSubId,  setDeleteSubId]  = useState<{id:number; catId:number} | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<{id:number; subId:number} | null>(null);
  const [deleting, setDeleting]         = useState(false);

  useEffect(() => {
    setAdmin(isAdminOrAbove());
    if (!canAccessInventory("spare")) {
      router.replace("/dashboard/inventory");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchCategories = async () => {
    setLoading(true);
    setExpandedCats(new Set());
    setExpandedSubs(new Set());
    const p = new URLSearchParams({ include_inactive:"false" });
    if (search) p.set("search", search);
    try {
      const cats = await apiFetchJson<SpareCategory[]>(`/api/v1/spares/categories?${p}`);
      setCategories(cats);
      if (search && cats.length > 0) {
        // Auto-expand all matching categories, subs and items so search results are visible
        setExpandedCats(new Set(cats.map(c => c.id)));
        const subsResults = await Promise.all(
          cats.map(c =>
            apiFetchJson<SpareSubCategory[]>(
              `/api/v1/spares/categories/${c.id}/sub-categories?include_inactive=false`
            ).catch(() => [] as SpareSubCategory[])
          )
        );
        const newSubsMap = new Map<number, SpareSubCategory[]>();
        const allSubs: SpareSubCategory[] = [];
        subsResults.forEach((subs, i) => { newSubsMap.set(cats[i].id, subs); allSubs.push(...subs); });
        setSubsMap(newSubsMap);
        setExpandedSubs(new Set(allSubs.map(s => s.id)));
        const itemPageResults = await Promise.all(
          allSubs.map(sub => {
            const p = new URLSearchParams({ include_inactive: "false", page: "1", page_size: String(ITEMS_PAGE_SIZE) });
            if (search) p.set("search", search);
            return apiFetchJson<ItemsPage>(`/api/v1/spares/sub-categories/${sub.id}/items?${p}`)
              .catch(() => ({ items: [], total: 0, page: 1, pages: 1 } as ItemsPage));
          })
        );
        const newItemsMap = new Map<number, SpareItem[]>();
        const newItemsMeta = new Map<number, { total: number; page: number; pages: number }>();
        itemPageResults.forEach((result, i) => {
          newItemsMap.set(allSubs[i].id, result.items);
          newItemsMeta.set(allSubs[i].id, { total: result.total, page: result.page, pages: result.pages });
        });
        setItemsMap(newItemsMap);
        setItemsMeta(newItemsMeta);
      }
    } catch(e:unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
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

  async function refreshCatCounts() {
    // Refresh category counters without resetting expand states
    try {
      const cats = await apiFetchJson<SpareCategory[]>(`/api/v1/spares/categories?include_inactive=false`);
      setCategories(cats);
    } catch { /**/ }
  }

  async function refreshSubs(catId: number) {
    const subs = await apiFetchJson<SpareSubCategory[]>(
      `/api/v1/spares/categories/${catId}/sub-categories?include_inactive=false`
    ).catch(() => null);
    if (subs) setSubsMap(prev => new Map(prev).set(catId, subs));
    await refreshCatCounts();
  }

  async function loadItemsPage(subId: number, page: number, append = false, searchTerm?: string) {
    setItemsLoading(prev => new Set(prev).add(subId));
    try {
      const p = new URLSearchParams({ include_inactive: "false", page: String(page), page_size: String(ITEMS_PAGE_SIZE) });
      if (searchTerm) p.set("search", searchTerm);
      const result = await apiFetchJson<ItemsPage>(`/api/v1/spares/sub-categories/${subId}/items?${p}`);
      setItemsMap(prev => {
        const n = new Map(prev);
        n.set(subId, append ? [...(prev.get(subId) ?? []), ...result.items] : result.items);
        return n;
      });
      setItemsMeta(prev => new Map(prev).set(subId, { total: result.total, page: result.page, pages: result.pages }));
    } catch { /**/ }
    finally { setItemsLoading(prev => { const s = new Set(prev); s.delete(subId); return s; }); }
  }

  async function toggleSub(subId: number) {
    if (expandedSubs.has(subId)) {
      setExpandedSubs(prev => { const s=new Set(prev); s.delete(subId); return s; });
      return;
    }
    setExpandedSubs(prev => new Set(prev).add(subId));
    if (!itemsMap.has(subId)) {
      await loadItemsPage(subId, 1);
    }
  }

  async function refreshItems(subId: number) {
    await loadItemsPage(subId, 1, false);
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
    setItemForm({ name:item.name, part_number:item.part_number??"", part_description:item.part_description??"", reorder_level:String(item.reorder_level ?? 0) });
    setItemError(null); setEditItemSheet(true);
  }
  async function saveItem() {
    if (!itemForm.name.trim()) { setItemError("Name required"); return; }
    setItemSaving(true); setItemError(null);
    try {
      await apiFetchJson(`/api/v1/spares/items/${editingItem!.id}`, {
        method:"PUT", body:JSON.stringify({
          name:itemForm.name.trim(),
          part_number:itemForm.part_number||null,
          part_description:itemForm.part_description||null,
          reorder_level:parseFloat(itemForm.reorder_level) || 0,
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

  async function openAdjust(item: SpareItem, type: "add"|"subtract") {
    setAdjustItem(item); setAdjustType(type); setAdjustQty(""); setAdjustNote(""); setAdjustError(null);
    setAdjustItemVariants([]); setAdjustSelectedVarId(""); setAdjustVariantsLoading(true);
    try {
      const variants = await apiFetchJson<SpareVariant[]>(`/api/v1/spares/items/${item.id}/variants`);
      setAdjustItemVariants(variants);
      if (variants.length === 1) setAdjustSelectedVarId(variants[0].id);
    } catch { /**/ }
    finally { setAdjustVariantsLoading(false); }
  }
  async function submitAdjust() {
    if (!adjustItem) return;
    const qty = parseFloat(adjustQty);
    if (isNaN(qty)||qty<0) { setAdjustError("Enter a valid qty ≥ 0"); return; }
    setAdjustSaving(true); setAdjustError(null);
    const itemId = adjustItem.id;
    const subId = adjustItem.sub_category_id;
    const popupOpenForThis = variantsDialogItem?.id === itemId;
    // If a specific variant is selected, adjust that variant directly
    const selectedVariant = adjustSelectedVarId !== "" ? adjustItemVariants.find(v => v.id === adjustSelectedVarId) : undefined;
    try {
      if (selectedVariant) {
        let newQty: number;
        if (adjustType === "add")           newQty = selectedVariant.qty + qty;
        else if (adjustType === "subtract") newQty = Math.max(0, selectedVariant.qty - qty);
        else                               newQty = qty;
        await apiFetchJson(`/api/v1/spares/variants/${selectedVariant.id}`, {
          method: "PUT", body: JSON.stringify({ qty: newQty }),
        });
      } else {
        await apiFetchJson(`/api/v1/spares/items/${itemId}/adjust`, {
          method:"POST", body:JSON.stringify({ adjustment_type:adjustType, quantity:qty, note:adjustNote||null }),
        });
      }
      const [freshItem, freshVariants] = await Promise.all([
        apiFetchJson<SpareItem>(`/api/v1/spares/items/${itemId}`),
        popupOpenForThis
          ? apiFetchJson<SpareVariant[]>(`/api/v1/spares/items/${itemId}/variants`)
          : Promise.resolve(null as SpareVariant[] | null),
      ]);
      if (subId) await refreshItems(subId);
      if (popupOpenForThis && freshVariants) {
        setVariantsRows(freshVariants);
        setVariantsDialogItem(freshItem);
      }
      setAdjustItem(null);
    } catch(e:unknown) { setAdjustError(e instanceof Error ? e.message : "Failed"); }
    finally { setAdjustSaving(false); }
  }
  async function submitVariantAdjust() {
    if (!adjustVariant || !variantsDialogItem) return;
    const qty = parseFloat(adjustVQty);
    if (isNaN(qty) || qty < 0) { setAdjustVError("Enter a valid qty ≥ 0"); return; }
    setAdjustVSaving(true); setAdjustVError(null);
    const varId = adjustVariant.id;
    const currentQty = adjustVariant.qty;
    const parentId = variantsDialogItem.id;
    const subId = variantsDialogItem.sub_category_id;
    let newQty: number;
    if (adjustVType === "add")           newQty = currentQty + qty;
    else if (adjustVType === "subtract") newQty = Math.max(0, currentQty - qty);
    else                                 newQty = qty;
    try {
      await apiFetchJson(`/api/v1/spares/variants/${varId}`, {
        method: "PUT", body: JSON.stringify({ qty: newQty }),
      });
      const [freshRows, freshItem] = await Promise.all([
        apiFetchJson<SpareVariant[]>(`/api/v1/spares/items/${parentId}/variants`),
        apiFetchJson<SpareItem>(`/api/v1/spares/items/${parentId}`),
      ]);
      setVariantsRows(freshRows);
      setVariantsDialogItem(freshItem);
      if (subId) await refreshItems(subId);
      setAdjustVariant(null);
      setAdjustVQty(""); setAdjustVNote("");
    } catch(e: unknown) { setAdjustVError(e instanceof Error ? e.message : "Failed"); }
    finally { setAdjustVSaving(false); }
  }

  // ── History / Variants helpers ───────────────────────────────────────────────

  async function openHistory(item: SpareItem) {
    setHistoryItem(item); setHistoryRows([]); setHistoryPage(1); setHistoryHasMore(false); setHistoryLoading(true);
    try {
      const rows = await apiFetchJson<SpareItemHistoryEntry[]>(`/api/v1/spares/items/${item.id}/history?limit=10&offset=0`);
      setHistoryRows(rows);
      setHistoryHasMore(rows.length === 10);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }

  async function changeHistoryPage(newPage: number) {
    if (!historyItem) return;
    setHistoryRows([]); setHistoryLoading(true);
    try {
      const rows = await apiFetchJson<SpareItemHistoryEntry[]>(`/api/v1/spares/items/${historyItem.id}/history?limit=10&offset=${(newPage - 1) * 10}`);
      setHistoryRows(rows);
      setHistoryPage(newPage);
      setHistoryHasMore(rows.length === 10);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }

  function resetVariantForm() {
    setVariantForm({serial_number:"",variant_color:"",qty:"0",unit:"pcs",customUnit:"",storage_type:"",storage_location:"",rate:"",image_base64:null});
    setVariantCustomStorage(false); setVariantCustomUnit(false);
    setVariantImgPreview(null); setVariantError(null);
  }
  function handleVariantImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { const d=r.result as string; setVariantImgPreview(d); setVariantForm(f=>({...f,image_base64:d.split(",")[1]??null})); };
    r.readAsDataURL(file);
  }

  async function openVariantsDialog(item: SpareItem) {
    setVariantsDialogItem(item); setVariantsRows([]); setVariantsLoading(true);
    resetVariantForm();
    try {
      const [rows, freshItem] = await Promise.all([
        apiFetchJson<SpareVariant[]>(`/api/v1/spares/items/${item.id}/variants`),
        apiFetchJson<SpareItem>(`/api/v1/spares/items/${item.id}`),
      ]);
      setVariantsRows(rows);
      setVariantsDialogItem(freshItem);
    } catch { /**/ }
    finally { setVariantsLoading(false); }
  }

  async function refreshDialogItem(itemId: number, subId: number | null) {
    if (!subId) return;
    const items = await apiFetchJson<SpareItem[]>(
      `/api/v1/spares/sub-categories/${subId}/items?include_inactive=false`
    ).catch(() => null);
    if (items) {
      const fresh = items.find(i => i.id === itemId);
      if (fresh) setVariantsDialogItem(fresh);
    }
  }

  async function saveVariant() {
    if (!variantsDialogItem) return;
    setVariantSaving(true); setVariantError(null);
    const unit = variantCustomUnit ? (variantForm.customUnit.trim() || "pcs") : variantForm.unit;
    try {
      const body = {
        serial_number: variantForm.serial_number || null,
        variant_color: variantForm.variant_color || null,
        qty: parseFloat(variantForm.qty) || 0,
        unit,
        storage_type: variantForm.storage_type || null,
        storage_location: variantForm.storage_location || null,
        rate: variantForm.rate ? parseFloat(variantForm.rate) : null,
        image_base64: variantForm.image_base64,
      };
      await apiFetchJson(`/api/v1/spares/items/${variantsDialogItem.id}/variants`, { method:"POST", body:JSON.stringify(body) });
      const [rows, freshItem] = await Promise.all([
        apiFetchJson<SpareVariant[]>(`/api/v1/spares/items/${variantsDialogItem.id}/variants`),
        apiFetchJson<SpareItem>(`/api/v1/spares/items/${variantsDialogItem.id}`),
      ]);
      setVariantsRows(rows);
      setVariantsDialogItem(freshItem);
      setAddVariantDialog(false);
      resetVariantForm();
      if (variantsDialogItem.sub_category_id) {
        await refreshItems(variantsDialogItem.sub_category_id);
      }
    } catch(e:unknown) { setVariantError(e instanceof Error ? e.message : "Failed"); }
    finally { setVariantSaving(false); }
  }

  async function deleteVariant(varId: number) {
    if (!variantsDialogItem) return;
    const { id: itemId, sub_category_id: subId } = variantsDialogItem;
    try {
      await apiFetchJson(`/api/v1/spares/variants/${varId}`, { method:"DELETE" });
      setVariantsRows(prev => prev.filter(v => v.id !== varId));
      const freshItem = await apiFetchJson<SpareItem>(`/api/v1/spares/items/${itemId}`).catch(() => null);
      if (freshItem) setVariantsDialogItem(freshItem);
      if (subId) await refreshItems(subId);
    } catch { /**/ }
  }

  function startEditVariant(v: SpareVariant) {
    setEditVariantId(v.id);
    const isCustomSt = !!v.storage_type && !STORAGE_TYPES.includes(v.storage_type);
    setEditVForm({
      serial_number: v.serial_number ?? "",
      variant_color: v.variant_color ?? "",
      qty: String(v.qty),
      unit: variantsDialogItem?.unit ?? "pcs",
      customUnit: "",
      storage_type: isCustomSt ? "" : (v.storage_type ?? ""),
      storage_location: v.storage_location ?? "",
      rate: v.rate != null ? String(v.rate) : "",
      image_base64: v.image_base64 ?? null,
    });
    setEditVCustomStorage(isCustomSt);
    setEditVCustomUnit(false);
    setEditVImgPreview(v.image_base64 ? `data:image/jpeg;base64,${v.image_base64}` : null);
    setEditVError(null);
    setEditVariantDialog(true);
  }

  async function saveEditVariant() {
    if (!variantsDialogItem || editVariantId === null) return;
    const qty = parseFloat(editVForm.qty);
    if (isNaN(qty) || qty < 0) return;
    setEditVSaving(true); setEditVError(null);
    const unit = editVCustomUnit ? (editVForm.customUnit.trim() || "pcs") : editVForm.unit;
    const storageType = editVCustomStorage ? (editVForm.storage_type.trim() || null) : (editVForm.storage_type || null);
    try {
      await apiFetchJson(`/api/v1/spares/variants/${editVariantId}`, {
        method: "PUT",
        body: JSON.stringify({
          serial_number: editVForm.serial_number || null,
          variant_color: editVForm.variant_color || null,
          qty,
          unit,
          storage_type: storageType,
          storage_location: editVForm.storage_location || null,
          rate: editVForm.rate ? parseFloat(editVForm.rate) : null,
          image_base64: editVForm.image_base64,
        }),
      });
      const [rows, freshItem] = await Promise.all([
        apiFetchJson<SpareVariant[]>(`/api/v1/spares/items/${variantsDialogItem.id}/variants`),
        apiFetchJson<SpareItem>(`/api/v1/spares/items/${variantsDialogItem.id}`),
      ]);
      setVariantsRows(rows);
      setVariantsDialogItem(freshItem);
      setEditVariantDialog(false);
      if (variantsDialogItem.sub_category_id) {
        await refreshItems(variantsDialogItem.sub_category_id);
      }
    } catch(e:unknown) { setEditVError(e instanceof Error ? e.message : "Failed"); }
    finally { setEditVSaving(false); }
  }

  function handleEditVImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { const d=r.result as string; setEditVImgPreview(d); setEditVForm(f=>({...f,image_base64:d.split(",")[1]??null})); };
    r.readAsDataURL(file);
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
                      {admin && cat.total_value != null && (
                        <span className="font-medium text-foreground">{fmtRate(cat.total_value)}</span>
                      )}
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
                            const meta = itemsMeta.get(sub.id);

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
                                    {admin && sub.total_value != null && (
                                      <span className="font-medium text-foreground">{fmtRate(sub.total_value)}</span>
                                    )}
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
                                        <div className="divide-y">
                                          {items.map((item, ii) => {
                                          const low = isLow(item);
                                          return (
                                            <div key={item.id}
                                              className={`flex items-start gap-2 pl-12 pr-3 py-2.5 hover:bg-muted/20 cursor-pointer select-none transition-colors ${!item.is_active ? "opacity-50" : ""}`}
                                              onClick={() => openVariantsDialog(item)}>
                                              <span className="text-xs text-muted-foreground w-5 shrink-0 mt-0.5">{ii+1}</span>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                                  <span className="font-medium text-sm">{highlight(item.name, search)}</span>
                                                  {item.part_number && <span className="text-xs font-mono text-muted-foreground">{item.part_number}</span>}
                                                </div>
                                                {item.part_description && <p className="text-xs text-muted-foreground truncate mt-0.5">{item.part_description}</p>}
                                              </div>
                                              <div className="flex items-center gap-2.5 shrink-0 text-xs" onClick={e => e.stopPropagation()}>
                                                <span className={`tabular-nums ${low ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                                                  {low && <AlertTriangle className="size-3 inline mr-0.5 mb-0.5" />}
                                                  {fmtQty(item.recorded_qty)} {item.unit}
                                                </span>
                                                {admin && item.total_value != null && (
                                                  <span className="font-medium text-foreground hidden md:inline">{fmtRate(item.total_value)}</span>
                                                )}
                                                <span className="flex gap-0.5">
                                                  {admin && <Button variant="ghost" size="icon" className="size-6" title="Stock history" onClick={()=>openHistory(item)}><History className="size-3 text-slate-500" /></Button>}
                                                  <Button variant="ghost" size="icon" className="size-6" title="Add Stock" onClick={()=>openAdjust(item,"add")}><PackagePlus className="size-3 text-emerald-600" /></Button>
                                                  <Button variant="ghost" size="icon" className="size-6" title="Remove Stock" onClick={()=>openAdjust(item,"subtract")}><PackageMinus className="size-3 text-amber-600" /></Button>
                                                  {admin && <>
                                                    <Button variant="ghost" size="icon" className="size-6" onClick={()=>openEditItem(item)}><Pencil className="size-3" /></Button>
                                                    <Button variant="ghost" size="icon" className="size-6 text-destructive hover:text-destructive"
                                                      onClick={()=>setDeleteItemId({id:item.id,subId:sub.id})}><Trash2 className="size-3" /></Button>
                                                  </>}
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                        </div>
                                        {meta && (
                                          <div className="flex items-center justify-between pl-12 pr-4 py-1.5 border-t bg-muted/5 text-xs text-muted-foreground">
                                            <span className="tabular-nums">{items.length} of {meta.total} items</span>
                                            {items.length < meta.total && (
                                              <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 -mr-1"
                                                onClick={e => { e.stopPropagation(); loadItemsPage(sub.id, meta.page + 1, true); }}>
                                                <ChevronsDown className="size-3" />Load more ({meta.total - items.length})
                                              </Button>
                                            )}
                                          </div>
                                        )}
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

      {/* ── Variants Popup Dialog ────────────────────────────────────── */}
      <Dialog open={variantsDialogItem !== null} onOpenChange={o=>{ if(!o){ setVariantsDialogItem(null); resetVariantForm(); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="size-4 text-violet-500" />
              Variants — {variantsDialogItem?.name}
              {variantsDialogItem?.part_number && <span className="font-mono text-sm text-muted-foreground font-normal">{variantsDialogItem.part_number}</span>}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Total qty: <strong>{fmtQty(variantsDialogItem?.recorded_qty ?? 0)} {variantsDialogItem?.unit}</strong>
              {admin && variantsDialogItem?.total_value != null && <> · Total value: <strong>{fmtRate(variantsDialogItem.total_value)}</strong></>}
            </p>
          </DialogHeader>

          {/* Variant Cards */}
          <div className="mt-2">
            {variantsLoading ? (
              <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i=><div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />)}</div>
            ) : variantsRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No variants yet. Click &quot;Add Variant&quot; to create one.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {variantsRows.map(v => (
                  <div key={v.id} className="rounded-lg border bg-card p-3 flex gap-3">
                    {/* Image */}
                    <div className="shrink-0">
                      {v.image_base64
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={`data:image/jpeg;base64,${v.image_base64}`} alt="" className="size-16 rounded-md object-cover border" />
                        : <div className="size-16 rounded-md border-2 border-dashed flex items-center justify-center bg-muted/30">
                            <ImageIcon className="size-5 text-muted-foreground/30" />
                          </div>}
                    </div>
                    {/* Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-1">
                        <div>
                          <p className="font-medium text-sm leading-tight">{v.variant_color || "—"}</p>
                          {v.serial_number && <p className="text-xs font-mono text-muted-foreground">{v.serial_number}</p>}
                        </div>
                        {admin && (
                          <span className="flex gap-0.5 shrink-0 -mt-0.5">
                            <Button variant="ghost" size="icon" className="size-6" title="Edit variant"
                              onClick={()=>startEditVariant(v)}>
                              <Pencil className="size-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-6 text-destructive hover:text-destructive" onClick={()=>deleteVariant(v.id)}><Trash2 className="size-3" /></Button>
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 text-xs">
                          <span className="text-muted-foreground">Qty</span>
                          <span className="font-medium tabular-nums">{fmtQty(v.qty)} {variantsDialogItem?.unit}</span>
                          {admin && v.rate != null && <>
                            <span className="text-muted-foreground">Rate</span>
                            <span className="tabular-nums">{fmtRate(v.rate)}</span>
                          </>}
                          {v.storage_type && <>
                            <span className="text-muted-foreground">Storage</span>
                            <span className="truncate">{v.storage_type}</span>
                          </>}
                          {v.storage_location && <>
                            <span className="text-muted-foreground">Location</span>
                            <span className="truncate">{v.storage_location}</span>
                          </>}
                        </div>
                        <div className="flex gap-1 mt-1.5 pt-1.5 border-t">
                          <Button variant="ghost" size="sm" className="flex-1 h-6 text-xs gap-1"
                            onClick={()=>{ setAdjustVariant(v); setAdjustVType("add"); setAdjustVQty(""); setAdjustVNote(""); setAdjustVError(null); }}>
                            <PackagePlus className="size-3 text-emerald-600" />Add
                          </Button>
                          <Button variant="ghost" size="sm" className="flex-1 h-6 text-xs gap-1"
                            onClick={()=>{ setAdjustVariant(v); setAdjustVType("subtract"); setAdjustVQty(""); setAdjustVNote(""); setAdjustVError(null); }}>
                            <PackageMinus className="size-3 text-amber-600" />Remove
                          </Button>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="mt-4 pt-4 border-t flex justify-between items-center gap-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={()=>openAdjust(variantsDialogItem!, "add")}>
                <PackagePlus className="size-3.5 mr-1.5 text-emerald-600" />Add Stock
              </Button>
              <Button size="sm" variant="outline" onClick={()=>openAdjust(variantsDialogItem!, "subtract")}>
                <PackageMinus className="size-3.5 mr-1.5 text-amber-600" />Remove Stock
              </Button>
            </div>
            {admin && (
              <Button size="sm" onClick={()=>setAddVariantDialog(true)}>
                <PlusIcon className="size-4 mr-1.5" />Add Variant
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Variant Dialog ───────────────────────────────────── */}
      <Dialog open={addVariantDialog} onOpenChange={o=>{ if(!o){ setAddVariantDialog(false); resetVariantForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusIcon className="size-4 text-primary" />
              Add Variant — {variantsDialogItem?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Image upload */}
            <div className="flex items-center gap-3">
              {variantImgPreview
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={variantImgPreview} alt="preview" className="size-14 rounded-md object-cover border" />
                : <div className="size-14 rounded-md border-2 border-dashed flex items-center justify-center bg-muted/20">
                    <ImageIcon className="size-5 text-muted-foreground/30" />
                  </div>}
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={()=>variantImgRef.current?.click()} disabled={variantSaving}>
                  {variantImgPreview ? "Change" : "Upload Image"}
                </Button>
                {variantImgPreview && <Button type="button" size="sm" variant="ghost" onClick={()=>{setVariantImgPreview(null);setVariantForm(f=>({...f,image_base64:null}));}} disabled={variantSaving}>Remove</Button>}
              </div>
              <input ref={variantImgRef} type="file" accept="image/*" className="hidden" onChange={handleVariantImg} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Variant / Colour</Label>
                <Input placeholder="e.g. Red, Large" value={variantForm.variant_color}
                  onChange={e=>setVariantForm(f=>({...f,variant_color:e.target.value}))} disabled={variantSaving} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Serial No.</Label>
                <Input placeholder="SN-001" value={variantForm.serial_number}
                  onChange={e=>setVariantForm(f=>({...f,serial_number:e.target.value}))} disabled={variantSaving} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input type="number" min="0" step="any" placeholder="0" value={variantForm.qty}
                  onChange={e=>setVariantForm(f=>({...f,qty:e.target.value}))} disabled={variantSaving} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit of Measure</Label>
                <select value={variantCustomUnit?"__custom__":(variantForm.unit||"pcs")}
                  onChange={e=>{if(e.target.value==="__custom__"){setVariantCustomUnit(true);setVariantForm(f=>({...f,unit:""}));}
                    else{setVariantCustomUnit(false);setVariantForm(f=>({...f,unit:e.target.value,customUnit:""}));}}}
                  disabled={variantSaving}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {STD_UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                  <option value="__custom__">Other…</option>
                </select>
                {variantCustomUnit && <Input placeholder="Enter unit" value={variantForm.customUnit}
                  onChange={e=>setVariantForm(f=>({...f,customUnit:e.target.value}))} disabled={variantSaving} className="mt-1 h-8 text-sm" />}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rate (₹)</Label>
                <Input type="number" min="0" step="any" placeholder="0.00" value={variantForm.rate}
                  onChange={e=>setVariantForm(f=>({...f,rate:e.target.value}))} disabled={variantSaving} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Storage Type</Label>
                <select value={variantCustomStorage?"__custom__":(variantForm.storage_type||"")}
                  onChange={e=>{if(e.target.value==="__custom__"){setVariantCustomStorage(true);setVariantForm(f=>({...f,storage_type:""}));}
                    else{setVariantCustomStorage(false);setVariantForm(f=>({...f,storage_type:e.target.value}));}}}
                  disabled={variantSaving}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Select —</option>
                  {STORAGE_TYPES.map(s=><option key={s} value={s}>{s}</option>)}
                  <option value="__custom__">Other…</option>
                </select>
                {variantCustomStorage && <Input placeholder="Enter type" value={variantForm.storage_type}
                  onChange={e=>setVariantForm(f=>({...f,storage_type:e.target.value}))} disabled={variantSaving} className="mt-1 h-8 text-sm" />}
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Storage Location</Label>
                <Input placeholder="Rack A-2" value={variantForm.storage_location}
                  onChange={e=>setVariantForm(f=>({...f,storage_location:e.target.value}))} disabled={variantSaving} className="h-8 text-sm" />
              </div>
            </div>
            {variantError && <p className="text-xs text-destructive">{variantError}</p>}
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={saveVariant} disabled={variantSaving} className="flex-1">{variantSaving?"Saving…":"Add Variant"}</Button>
              <Button size="sm" variant="outline" onClick={()=>{setAddVariantDialog(false);resetVariantForm();}} disabled={variantSaving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Variant Dialog ──────────────────────────────────── */}
      <Dialog open={editVariantDialog} onOpenChange={o=>{ if(!o){ setEditVariantDialog(false); setEditVariantId(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-4 text-primary" />
              Edit Variant
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Image upload */}
            <div className="flex items-center gap-3">
              {editVImgPreview
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={editVImgPreview} alt="preview" className="size-14 rounded-md object-cover border" />
                : <div className="size-14 rounded-md border-2 border-dashed flex items-center justify-center bg-muted/20">
                    <ImageIcon className="size-5 text-muted-foreground/30" />
                  </div>}
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={()=>editVImgRef.current?.click()} disabled={editVSaving}>
                  {editVImgPreview ? "Change" : "Upload Image"}
                </Button>
                {editVImgPreview && <Button type="button" size="sm" variant="ghost" onClick={()=>{setEditVImgPreview(null);setEditVForm(f=>({...f,image_base64:null}));}} disabled={editVSaving}>Remove</Button>}
              </div>
              <input ref={editVImgRef} type="file" accept="image/*" className="hidden" onChange={handleEditVImg} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Variant / Colour</Label>
                <Input placeholder="e.g. Red, Large" value={editVForm.variant_color}
                  onChange={e=>setEditVForm(f=>({...f,variant_color:e.target.value}))} disabled={editVSaving} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Serial No.</Label>
                <Input placeholder="SN-001" value={editVForm.serial_number}
                  onChange={e=>setEditVForm(f=>({...f,serial_number:e.target.value}))} disabled={editVSaving} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input type="number" min="0" step="any" placeholder="0" value={editVForm.qty}
                  onChange={e=>setEditVForm(f=>({...f,qty:e.target.value}))} disabled={editVSaving} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit of Measure</Label>
                <select value={editVCustomUnit?"__custom__":(editVForm.unit||"pcs")}
                  onChange={e=>{if(e.target.value==="__custom__"){setEditVCustomUnit(true);setEditVForm(f=>({...f,unit:""}));}
                    else{setEditVCustomUnit(false);setEditVForm(f=>({...f,unit:e.target.value,customUnit:""}));}}}
                  disabled={editVSaving}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {STD_UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                  <option value="__custom__">Other…</option>
                </select>
                {editVCustomUnit && <Input placeholder="Enter unit" value={editVForm.customUnit}
                  onChange={e=>setEditVForm(f=>({...f,customUnit:e.target.value}))} disabled={editVSaving} className="mt-1 h-8 text-sm" />}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rate (₹)</Label>
                <Input type="number" min="0" step="any" placeholder="0.00" value={editVForm.rate}
                  onChange={e=>setEditVForm(f=>({...f,rate:e.target.value}))} disabled={editVSaving} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Storage Type</Label>
                <select value={editVCustomStorage?"__custom__":(editVForm.storage_type||"")}
                  onChange={e=>{if(e.target.value==="__custom__"){setEditVCustomStorage(true);setEditVForm(f=>({...f,storage_type:""}));}
                    else{setEditVCustomStorage(false);setEditVForm(f=>({...f,storage_type:e.target.value}));}}}
                  disabled={editVSaving}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Select —</option>
                  {STORAGE_TYPES.map(s=><option key={s} value={s}>{s}</option>)}
                  <option value="__custom__">Other…</option>
                </select>
                {editVCustomStorage && <Input placeholder="Enter type" value={editVForm.storage_type}
                  onChange={e=>setEditVForm(f=>({...f,storage_type:e.target.value}))} disabled={editVSaving} className="mt-1 h-8 text-sm" />}
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Storage Location</Label>
                <Input placeholder="Rack A-2" value={editVForm.storage_location}
                  onChange={e=>setEditVForm(f=>({...f,storage_location:e.target.value}))} disabled={editVSaving} className="h-8 text-sm" />
              </div>
            </div>
            {editVError && <p className="text-xs text-destructive">{editVError}</p>}
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={saveEditVariant} disabled={editVSaving} className="flex-1">{editVSaving?"Saving…":"Save Changes"}</Button>
              <Button size="sm" variant="outline" onClick={()=>setEditVariantDialog(false)} disabled={editVSaving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Item Dialog ─────────────────────────────────────────── */}
      <Dialog open={editItemSheet} onOpenChange={o=>!o&&setEditItemSheet(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="mb-2"><DialogTitle>Edit — {editingItem?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ei-name">Name *</Label>
              <Input id="ei-name" value={itemForm.name} onChange={e=>setItemForm(f=>({...f,name:e.target.value}))} disabled={itemSaving} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ei-pn">Part No.</Label>
              <Input id="ei-pn" placeholder="ENG-068" value={itemForm.part_number} onChange={e=>setItemForm(f=>({...f,part_number:e.target.value}))} disabled={itemSaving} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ei-desc">Part Description</Label>
              <textarea id="ei-desc" rows={2} value={itemForm.part_description}
                onChange={e=>setItemForm(f=>({...f,part_description:e.target.value}))} disabled={itemSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ei-rl">Reorder Level</Label>
              <Input id="ei-rl" type="number" min="0" step="any" placeholder="0"
                value={itemForm.reorder_level} onChange={e=>setItemForm(f=>({...f,reorder_level:e.target.value}))} disabled={itemSaving} />
            </div>
            {itemError && <p className="text-sm text-destructive">{itemError}</p>}
            <div className="flex gap-3 pt-2">
              <Button onClick={saveItem} disabled={itemSaving} className="flex-1">{itemSaving?"Saving…":"Save Changes"}</Button>
              <Button variant="outline" onClick={()=>setEditItemSheet(false)} disabled={itemSaving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── History Dialog (admin-only) ───────────────────────────────── */}
      <Dialog open={historyItem !== null} onOpenChange={o=>!o&&setHistoryItem(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Stock History — {historyItem?.name}</DialogTitle></DialogHeader>
          {historyLoading ? (
            <div className="space-y-2 mt-2">{[1,2,3].map(i=><div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No stock changes recorded yet.</p>
          ) : (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead><tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Who</th>
                  <th className="px-3 py-2 text-center">Type</th>
                  <th className="px-3 py-2 text-right">Before</th>
                  <th className="px-3 py-2 text-right">Change</th>
                  <th className="px-3 py-2 text-right">After</th>
                  <th className="px-3 py-2 text-left">Note</th>
                </tr></thead>
                <tbody className="divide-y">
                  {historyRows.map(r => (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(r.changed_at).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
                      </td>
                      <td className="px-3 py-2">{r.changed_by_username ?? "—"}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          r.change_type==="add"?"bg-emerald-100 text-emerald-700":
                          r.change_type==="subtract"?"bg-amber-100 text-amber-700":"bg-blue-100 text-blue-700"}`}>
                          {r.change_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtQty(r.qty_before)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.qty_delta>0?"text-emerald-600":r.qty_delta<0?"text-red-600":""}`}>
                        {r.qty_delta > 0 ? "+" : ""}{fmtQty(r.qty_delta)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtQty(r.qty_after)}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">{r.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(historyPage > 1 || historyHasMore) && (
                <div className="flex items-center justify-between pt-3 pb-1">
                  <Button size="sm" variant="outline" disabled={historyPage <= 1 || historyLoading} onClick={() => changeHistoryPage(historyPage - 1)}>← Prev</Button>
                  <span className="text-sm text-muted-foreground">Page {historyPage}</span>
                  <Button size="sm" variant="outline" disabled={!historyHasMore || historyLoading} onClick={() => changeHistoryPage(historyPage + 1)}>Next →</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Adjust Stock Dialog ──────────────────────────────────────── */}
      <Dialog open={adjustItem!==null} onOpenChange={o=>!o&&setAdjustItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="mb-2">
            <DialogTitle>Adjust Stock — {adjustItem?.name}</DialogTitle>
            {(() => {
              const selV = adjustSelectedVarId !== "" ? adjustItemVariants.find(v => v.id === adjustSelectedVarId) : undefined;
              const displayQty = selV ? fmtQty(selV.qty) : (adjustItem ? fmtQty(adjustItem.recorded_qty) : 0);
              const label = selV ? (selV.variant_color || selV.serial_number || `Variant ${selV.id}`) : "Total";
              return <p className="text-sm text-muted-foreground">Current Qty ({label}): <strong>{displayQty} {adjustItem?.unit}</strong></p>;
            })()}
          </DialogHeader>
          <div className="space-y-4">
            {adjustVariantsLoading ? (
              <div className="h-9 rounded-md bg-muted animate-pulse" />
            ) : adjustItemVariants.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Variant</label>
                <select
                  value={adjustSelectedVarId}
                  onChange={e => setAdjustSelectedVarId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {adjustItemVariants.length > 1 && <option value="">All variants (no specific)</option>}
                  {adjustItemVariants.map(v => (
                    <option key={v.id} value={v.id}>
                      {[v.variant_color, v.serial_number].filter(Boolean).join(" / ") || `Variant ${v.id}`}
                      {" — "}{fmtQty(v.qty)} {adjustItem?.unit}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
            {adjustType==="subtract" && adjustItem && (()=>{
              const entered = parseFloat(adjustQty);
              const selVar = adjustSelectedVarId !== "" ? adjustItemVariants.find(v=>v.id===adjustSelectedVarId) : undefined;
              const avail = selVar ? selVar.qty : adjustItem.recorded_qty;
              if (!isNaN(entered) && entered > avail) {
                return (
                  <div className="flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>Only <strong>{avail%1===0?avail.toFixed(0):avail.toFixed(2)} {adjustItem.unit}</strong> available — stock will be reduced to 0.</span>
                  </div>
                );
              }
              return null;
            })()}
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

      {/* ── Variant Adjust Dialog ────────────────────────────────────── */}
      <Dialog open={adjustVariant !== null} onOpenChange={o=>!o&&setAdjustVariant(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="mb-2">
            <DialogTitle>
              Adjust Stock — {variantsDialogItem?.name}
              {adjustVariant?.variant_color && <span className="ml-1.5 text-base font-normal text-muted-foreground">({adjustVariant.variant_color})</span>}
              {adjustVariant?.serial_number && !adjustVariant?.variant_color && <span className="ml-1.5 text-base font-normal text-muted-foreground">({adjustVariant.serial_number})</span>}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">Current Qty: <strong>{adjustVariant ? fmtQty(adjustVariant.qty) : 0} {variantsDialogItem?.unit}</strong></p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              {(["add","subtract","set"] as const).map(t=>(
                <button key={t} onClick={()=>setAdjustVType(t)}
                  className={["flex-1 py-2 rounded-md text-sm font-medium border transition-colors",
                    adjustVType===t?"bg-primary text-primary-foreground border-primary":"border-input hover:bg-muted"].join(" ")}>
                  {t==="add"?"Add +":t==="subtract"?"Remove −":"Set ="}
                </button>
              ))}
            </div>
            <input type="number" min="0" step="any" value={adjustVQty} onChange={e=>setAdjustVQty(e.target.value)} placeholder="Quantity"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            {adjustVType==="subtract" && adjustVariant && (()=>{
              const entered = parseFloat(adjustVQty);
              if (!isNaN(entered) && entered > adjustVariant.qty) {
                return (
                  <div className="flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>Only <strong>{adjustVariant.qty%1===0?adjustVariant.qty.toFixed(0):adjustVariant.qty.toFixed(2)} {variantsDialogItem?.unit}</strong> available — stock will be reduced to 0.</span>
                  </div>
                );
              }
              return null;
            })()}
            <textarea rows={2} value={adjustVNote} onChange={e=>setAdjustVNote(e.target.value)} placeholder="Reason (optional)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            {adjustVError && <p className="text-sm text-destructive">{adjustVError}</p>}
            <div className="flex gap-3">
              <Button onClick={submitVariantAdjust} disabled={adjustVSaving} className="flex-1">{adjustVSaving?"Saving…":"Apply"}</Button>
              <Button variant="outline" onClick={()=>setAdjustVariant(null)} disabled={adjustVSaving}>Cancel</Button>
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
