"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  PlusIcon, Pencil, Trash2, Search, FlaskConical, ImageIcon, ChevronLeft, ChevronRight,
  PackagePlus, PackageMinus, History, Eye, AlertTriangle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Consumable {
  id: number;
  name: string;
  code: string | null;
  storage_type: string | null;
  storage_location: string | null;
  supplier_name: string | null;
  rate_per_unit: number | null;
  qty: number;
  reorder_level: number;
  total_price: number | null;
  image_base64: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Paginated {
  items: Consumable[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface ConsumableHistoryEntry {
  id: number;
  consumable_id: number;
  changed_by_username: string | null;
  changed_at: string;
  change_type: string;  // add | subtract | set
  qty_before: number;
  qty_after: number;
  qty_delta: number;
  note: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;
const STORAGE_TYPES = ["Shelf","Rack","Bin","Drawer","Tray","Cabinet","Box","Pallet","Floor"];

function fmtRate(n: number | null) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const BLANK = {
  name: "", code: "", storage_type: "", storage_location: "", supplier_name: "", rate_per_unit: "", qty: "0", reorder_level: "0",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConsumablesPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState(false);
  const [items, setItems] = useState<Consumable[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");

  // create / edit dialog
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Consumable | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [imgB64, setImgB64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formStorageCustom, setFormStorageCustom] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);

  // delete
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // adjust stock
  const [adjustItem, setAdjustItem] = useState<Consumable | null>(null);
  const [adjustType, setAdjustType] = useState<"add" | "subtract">("add");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // view detail
  const [viewItem, setViewItem] = useState<Consumable | null>(null);

  // history
  const [historyItem, setHistoryItem] = useState<Consumable | null>(null);
  const [historyRows, setHistoryRows] = useState<ConsumableHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => { setAdmin(isAdminOrAbove()); }, []);

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchItems = (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(p), page_size: String(PAGE_SIZE), include_inactive: "false",
    });
    if (search) params.set("search", search);
    apiFetchJson<Paginated>(`/api/v1/consumables?${params}`)
      .then(d => { setItems(d.items); setTotal(d.total); setPage(d.page); setPages(d.pages); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(1); }, [search]); // eslint-disable-line

  // ── Open dialog helpers ──────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null);
    setForm({ ...BLANK });
    setFormStorageCustom(false);
    setImgPreview(null); setImgB64(null);
    setFormError(null); setDialog("create");
  }
  function openEdit(item: Consumable) {
    setEditing(item);
    const isCustom = !!item.storage_type && !STORAGE_TYPES.includes(item.storage_type);
    setFormStorageCustom(isCustom);
    setForm({
      name: item.name, code: item.code ?? "",
      storage_type: item.storage_type ?? "",
      storage_location: item.storage_location ?? "",
      supplier_name: item.supplier_name ?? "",
      rate_per_unit: item.rate_per_unit != null ? String(item.rate_per_unit) : "",
      qty: String(item.qty),
      reorder_level: String(item.reorder_level ?? 0),
    });
    setImgPreview(item.image_base64 ? `data:image/jpeg;base64,${item.image_base64}` : null);
    setImgB64(item.image_base64 ?? null);
    setFormError(null); setDialog("edit");
  }

  function handleImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { const d = r.result as string; setImgPreview(d); setImgB64(d.split(",")[1] ?? null); };
    r.readAsDataURL(file);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function save() {
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    setSaving(true); setFormError(null);
    const body = {
      name: form.name.trim(),
      code: form.code || null,
      storage_type: form.storage_type || null,
      storage_location: form.storage_location || null,
      supplier_name: form.supplier_name || null,
      rate_per_unit: form.rate_per_unit ? parseFloat(form.rate_per_unit) : null,
      qty: parseFloat(form.qty) || 0,
      reorder_level: parseFloat(form.reorder_level) || 0,
      image_base64: imgB64,
    };
    try {
      if (dialog === "create") {
        await apiFetchJson("/api/v1/consumables", { method: "POST", body: JSON.stringify(body) });
      } else {
        await apiFetchJson(`/api/v1/consumables/${editing!.id}`, { method: "PUT", body: JSON.stringify(body) });
      }
      setDialog(null); fetchItems(dialog === "create" ? 1 : page);
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function doDelete() {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/consumables/${deleteId}`, { method: "DELETE" });
      setDeleteId(null); fetchItems(page);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setDeleting(false); }
  }

  // ── Adjust stock ─────────────────────────────────────────────────────────────

  function openAdjust(item: Consumable, type: "add" | "subtract") {
    setAdjustItem(item); setAdjustType(type);
    setAdjustQty(""); setAdjustNote(""); setAdjustError(null);
  }

  async function doAdjust() {
    if (!adjustItem) return;
    const qty = parseFloat(adjustQty);
    if (isNaN(qty) || qty <= 0) { setAdjustError("Enter a positive quantity"); return; }
    setAdjusting(true); setAdjustError(null);
    try {
      await apiFetchJson(`/api/v1/consumables/${adjustItem.id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ adjustment_type: adjustType, quantity: qty, note: adjustNote || null }),
      });
      setAdjustItem(null); fetchItems(page);
    } catch (e: unknown) { setAdjustError(e instanceof Error ? e.message : "Failed"); }
    finally { setAdjusting(false); }
  }

  // ── History ───────────────────────────────────────────────────────────────────

  async function openHistory(item: Consumable) {
    setHistoryItem(item); setHistoryRows([]); setHistoryLoading(true);
    try {
      const rows = await apiFetchJson<ConsumableHistoryEntry[]>(`/api/v1/consumables/${item.id}/history`);
      setHistoryRows(rows);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center border-b px-6 gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link href="/dashboard/inventory" className="text-muted-foreground hover:text-foreground text-sm">Inventory</Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Consumables</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {admin && (
          <Button size="sm" className="ml-auto" onClick={openCreate}>
            <PlusIcon className="size-4 mr-1" /> New Consumable
          </Button>
        )}
      </header>

      <div className="p-4 md:p-6 space-y-4">
        {/* Title + search */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Consumables</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {total > 0 ? `${total} item${total !== 1 ? "s" : ""}` : "Consumable stock items"}
            </p>
          </div>
          <form onSubmit={e => { e.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }} className="flex gap-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text" value={searchDraft} onChange={e => setSearchDraft(e.target.value)}
                placeholder="Search name / code / supplier…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-56"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
            {search && <Button type="button" size="sm" variant="ghost" onClick={() => { setSearch(""); setSearchDraft(""); }}>Clear</Button>}
          </form>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Table */}
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border p-14 text-center space-y-3">
            <FlaskConical className="size-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {search ? `No consumables matching "${search}".` : "No consumables yet."}
            </p>
            {admin && !search && (
              <Button size="sm" onClick={openCreate}>
                <PlusIcon className="size-4 mr-1" /> Add First Consumable
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1020px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-8">#</th>
                    <th className="px-4 py-2.5 text-left font-medium w-[190px]">Name</th>
                    <th className="px-4 py-2.5 text-left font-medium w-[110px]">Code</th>
                    <th className="px-4 py-2.5 text-left font-medium w-[120px]">Storage Type</th>
                    <th className="px-4 py-2.5 text-left font-medium w-[140px]">Storage Location</th>
                    <th className="px-4 py-2.5 text-left font-medium w-[140px]">Supplier</th>
                    {admin && <th className="px-4 py-2.5 text-right font-medium">Rate / Unit</th>}
                    <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                    {admin && <th className="px-4 py-2.5 text-right font-medium">Total Value</th>}
                    <th className="px-4 py-2.5 text-center font-medium">Image</th>
                    <th className="px-4 py-2.5 text-left font-medium">Updated</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, i) => (
                    <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground text-xs">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-4 py-3 font-medium max-w-[190px]"><span className="block truncate" title={item.name}>{item.name}</span></td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs max-w-[110px]">
                        {item.code ? <Badge variant="secondary" className="font-mono max-w-full truncate block">{item.code}</Badge> : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[120px]"><span className="block truncate" title={item.storage_type ?? ""}>{item.storage_type ?? "—"}</span></td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[140px]"><span className="block truncate" title={item.storage_location ?? ""}>{item.storage_location ?? "—"}</span></td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[140px]"><span className="block truncate" title={item.supplier_name ?? ""}>{item.supplier_name ?? "—"}</span></td>
                      {admin && <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtRate(item.rate_per_unit)}</td>}
                      <td className={`px-4 py-3 text-right tabular-nums ${item.reorder_level > 0 && item.qty <= item.reorder_level ? "text-amber-600 font-medium" : ""}`}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {item.reorder_level > 0 && item.qty <= item.reorder_level && <AlertTriangle className="size-3" />}
                          {item.qty % 1 === 0 ? item.qty.toFixed(0) : item.qty.toFixed(2)}
                          {item.reorder_level > 0 && <span className="text-muted-foreground text-[10px] font-normal"> /{item.reorder_level % 1 === 0 ? item.reorder_level.toFixed(0) : item.reorder_level.toFixed(2)}</span>}
                        </span>
                      </td>
                      {admin && <td className="px-4 py-3 text-right tabular-nums font-medium">{item.total_price != null ? fmtRate(item.total_price) : "—"}</td>}
                      {/* qty with low-stock indicator injected inline below */}
                      <td className="px-4 py-3 text-center">
                        {item.image_base64
                          ? <img src={`data:image/jpeg;base64,${item.image_base64}`} alt={item.name} className="size-9 rounded object-cover mx-auto" /> // eslint-disable-line @next/next/no-img-element
                          : <ImageIcon className="size-4 text-muted-foreground/30 mx-auto" />}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(item.updated_at)}</td>
                      <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <Button variant="ghost" size="icon" className="size-7" title="View details" onClick={() => setViewItem(item)}>
                              <Eye className="size-3.5 text-blue-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Add Stock" onClick={() => openAdjust(item, "add")}>
                              <PackagePlus className="size-3.5 text-emerald-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Remove Stock" onClick={() => openAdjust(item, "subtract")}>
                              <PackageMinus className="size-3.5 text-amber-600" />
                            </Button>
                            {admin && (
                              <Button variant="ghost" size="icon" className="size-7" title="History" onClick={() => openHistory(item)}>
                                <History className="size-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            {admin && (
                              <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(item)}>
                                <Pencil className="size-3.5" />
                              </Button>
                            )}
                            {admin && (
                              <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {items.map(item => (
                <div key={item.id} className="rounded-lg border p-3 bg-card">
                  <div className="flex items-start gap-3">
                    {item.image_base64
                      ? <img src={`data:image/jpeg;base64,${item.image_base64}`} alt={item.name} className="size-12 rounded-lg object-cover shrink-0" /> // eslint-disable-line @next/next/no-img-element
                      : <div className="size-12 rounded-lg bg-muted flex items-center justify-center shrink-0"><FlaskConical className="size-5 text-muted-foreground/40" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{item.name}</p>
                      {item.code && <p className="text-xs font-mono text-muted-foreground">{item.code}</p>}
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {item.storage_location && <span>📍 {item.storage_location}</span>}
                        {item.storage_type && <span>📦 {item.storage_type}</span>}
                        {item.supplier_name && <span>🏢 {item.supplier_name}</span>}
                        {admin && item.rate_per_unit != null && <span>{fmtRate(item.rate_per_unit)} / unit</span>}
                        <span className={`font-semibold ${item.reorder_level > 0 && item.qty <= item.reorder_level ? "text-amber-600" : "text-foreground"}`}>
                          {item.reorder_level > 0 && item.qty <= item.reorder_level && <AlertTriangle className="size-3 inline mr-0.5" />}Qty: {item.qty % 1 === 0 ? item.qty.toFixed(0) : item.qty.toFixed(2)}
                          {item.reorder_level > 0 && <span className="text-muted-foreground font-normal text-[10px]"> /{item.reorder_level % 1 === 0 ? item.reorder_level.toFixed(0) : item.reorder_level.toFixed(2)}</span>}
                        </span>
                        {admin && item.total_price != null && <span className="font-medium text-foreground">Total: {fmtRate(item.total_price)}</span>}
                        <span>{fmtDate(item.updated_at)}</span>
                      </div>
                    </div>
                    {admin && (
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="size-8" title="Add Stock" onClick={() => openAdjust(item, "add")}>
                          <PackagePlus className="size-3.5 text-emerald-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8" title="Remove Stock" onClick={() => openAdjust(item, "subtract")}>
                          <PackageMinus className="size-3.5 text-amber-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8" title="History" onClick={() => openHistory(item)}>
                          <History className="size-3.5 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">Page {page} of {pages} · {total} total</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); fetchItems(p); }}>
                    <ChevronLeft className="size-4 mr-1" />Prev
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); fetchItems(p); }}>
                    Next<ChevronRight className="size-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Create / Edit Dialog ────────────────────────────────────── */}
      <Dialog open={dialog !== null} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="mb-2">
            <DialogTitle>{dialog === "create" ? "New Consumable" : `Edit — ${editing?.name}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Name *</Label>
              <Input id="c-name" placeholder="e.g. Cutting Oil" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-code">Code <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input id="c-code" placeholder="e.g. CON-001" value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))} disabled={saving} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Storage Type</Label>
                <select
                  value={formStorageCustom ? "__custom__" : (form.storage_type || "")}
                  onChange={e => {
                    if (e.target.value === "__custom__") {
                      setFormStorageCustom(true);
                      setForm(f => ({ ...f, storage_type: "" }));
                    } else {
                      setFormStorageCustom(false);
                      setForm(f => ({ ...f, storage_type: e.target.value }));
                    }
                  }}
                  disabled={saving}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Select —</option>
                  {STORAGE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="__custom__">Other…</option>
                </select>
                {formStorageCustom && (
                  <Input placeholder="Enter storage type" value={form.storage_type}
                    onChange={e => setForm(f => ({ ...f, storage_type: e.target.value }))}
                    disabled={saving} className="mt-1.5" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-storage">Storage Location</Label>
                <Input id="c-storage" placeholder="e.g. Shelf A3" value={form.storage_location}
                  onChange={e => setForm(f => ({ ...f, storage_location: e.target.value }))} disabled={saving} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-supplier">Supplier Name</Label>
                <Input id="c-supplier" placeholder="e.g. Ravi Traders" value={form.supplier_name}
                  onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-rate">Rate / Unit (₹)</Label>
                <Input id="c-rate" type="number" min="0" step="any" placeholder="0.00" value={form.rate_per_unit}
                  onChange={e => setForm(f => ({ ...f, rate_per_unit: e.target.value }))} disabled={saving} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-qty">Quantity on Hand</Label>
                <Input id="c-qty" type="number" min="0" step="any" placeholder="0" value={form.qty}
                  onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-reorder">Reorder Level</Label>
                <Input id="c-reorder" type="number" min="0" step="any" placeholder="0" value={form.reorder_level}
                  onChange={e => setForm(f => ({ ...f, reorder_level: e.target.value }))} disabled={saving} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Picture <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <div className="flex items-center gap-3">
                {imgPreview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={imgPreview} alt="preview" className="size-14 rounded-lg object-cover border" />
                  : <div className="size-14 rounded-lg border-2 border-dashed flex items-center justify-center">
                      <ImageIcon className="size-5 text-muted-foreground/40" />
                    </div>}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => imgRef.current?.click()} disabled={saving}>
                    {imgPreview ? "Change" : "Upload"}
                  </Button>
                  {imgPreview && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setImgPreview(null); setImgB64(null); }} disabled={saving}>
                      Remove
                    </Button>
                  )}
                </div>
                <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleImg} />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex gap-3 pt-1">
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving ? "Saving…" : dialog === "create" ? "Create" : "Save Changes"}
              </Button>
              <Button variant="outline" onClick={() => setDialog(null)} disabled={saving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Adjust Stock Dialog ─────────────────────────────────────── */}
      <Dialog open={adjustItem !== null} onOpenChange={o => !o && setAdjustItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center gap-2">
              {adjustType === "add"
                ? <PackagePlus className="size-4 text-emerald-600" />
                : <PackageMinus className="size-4 text-amber-600" />}
              {adjustType === "add" ? "Add Stock" : "Remove Stock"} — {adjustItem?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              Current qty: <span className="font-semibold tabular-nums">
                {adjustItem ? (adjustItem.qty % 1 === 0 ? adjustItem.qty.toFixed(0) : adjustItem.qty.toFixed(2)) : ""}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-qty">Quantity *</Label>
              <Input id="adj-qty" type="number" min="0.001" step="any" placeholder="0"
                value={adjustQty} onChange={e => setAdjustQty(e.target.value)} disabled={adjusting}
                autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-note">Note <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input id="adj-note" placeholder="e.g. Monthly restock" value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)} disabled={adjusting} />
            </div>
            {adjustError && <p className="text-sm text-destructive">{adjustError}</p>}
            <div className="flex gap-3 pt-1">
              <Button onClick={doAdjust} disabled={adjusting} className="flex-1"
                variant={adjustType === "subtract" ? "destructive" : "default"}>
                {adjusting ? "Saving…" : adjustType === "add" ? "Add Stock" : "Remove Stock"}
              </Button>
              <Button variant="outline" onClick={() => setAdjustItem(null)} disabled={adjusting}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── View Detail Dialog ───────────────────────────────────────── */}
      <Dialog open={viewItem !== null} onOpenChange={o => !o && setViewItem(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader><DialogTitle className="break-words">{viewItem?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-1">
            {viewItem?.image_base64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/jpeg;base64,${viewItem.image_base64}`} alt={viewItem.name}
                className="w-full max-h-64 object-contain rounded-lg border bg-muted/20" />
            ) : (
              <div className="w-full h-28 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground/40">
                <FlaskConical className="size-10" />
              </div>
            )}
            <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {viewItem?.code && <><span className="text-muted-foreground whitespace-nowrap">Code</span><span className="font-mono font-medium break-all">{viewItem.code}</span></>}
              {viewItem?.supplier_name && <><span className="text-muted-foreground whitespace-nowrap">Supplier</span><span className="break-words">{viewItem.supplier_name}</span></>}
              {viewItem?.storage_type && <><span className="text-muted-foreground whitespace-nowrap">Storage Type</span><span className="break-words">{viewItem.storage_type}</span></>}
              {viewItem?.storage_location && <><span className="text-muted-foreground whitespace-nowrap">Location</span><span className="break-words">{viewItem.storage_location}</span></>}
              {admin && <><span className="text-muted-foreground whitespace-nowrap">Rate / Unit</span><span className="font-medium">{viewItem ? fmtRate(viewItem.rate_per_unit) : "—"}</span></>}
              {admin && viewItem?.total_price != null && <><span className="text-muted-foreground whitespace-nowrap">Total Value</span><span className="font-medium">{fmtRate(viewItem.total_price)}</span></>}
              <span className="text-muted-foreground">Qty</span>
              <span className={`font-medium ${viewItem && viewItem.reorder_level > 0 && viewItem.qty <= viewItem.reorder_level ? "text-amber-600" : ""}`}>
                {viewItem && (viewItem.qty % 1 === 0 ? viewItem.qty.toFixed(0) : viewItem.qty.toFixed(2))}
                {viewItem && viewItem.reorder_level > 0 && viewItem.qty <= viewItem.reorder_level && <AlertTriangle className="size-3 inline ml-1 mb-0.5" />}
              </span>
              {viewItem && viewItem.reorder_level > 0 && <>
                <span className="text-muted-foreground">Reorder Level</span>
                <span>{viewItem.reorder_level % 1 === 0 ? viewItem.reorder_level.toFixed(0) : viewItem.reorder_level.toFixed(2)}</span>
              </>}
              <span className="text-muted-foreground">Updated</span><span className="text-muted-foreground text-xs">{viewItem ? fmtDate(viewItem.updated_at) : ""}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── History Dialog ──────────────────────────────────────────── */}
      <Dialog open={historyItem !== null} onOpenChange={o => !o && setHistoryItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center gap-2">
              <History className="size-4" /> Stock History — {historyItem?.name}
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No history yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Before</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Change</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">After</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">By</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historyRows.map(r => (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.changed_at)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                          r.change_type === "add" ? "text-emerald-600" :
                          r.change_type === "subtract" ? "text-amber-600" : "text-blue-600"
                        }`}>
                          {r.change_type === "add" && <PackagePlus className="size-3" />}
                          {r.change_type === "subtract" && <PackageMinus className="size-3" />}
                          {r.change_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.qty_before % 1 === 0 ? r.qty_before.toFixed(0) : r.qty_before.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                        r.qty_delta > 0 ? "text-emerald-600" : r.qty_delta < 0 ? "text-amber-600" : ""
                      }`}>
                        {r.qty_delta > 0 ? "+" : ""}{r.qty_delta % 1 === 0 ? r.qty_delta.toFixed(0) : r.qty_delta.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.qty_after % 1 === 0 ? r.qty_after.toFixed(0) : r.qty_after.toFixed(2)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.changed_by_username ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ─────────────────────────────────────── */}
      <AlertDialog open={deleteId !== null} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete consumable?</AlertDialogTitle>
            <AlertDialogDescription>This will deactivate the item. It can be restored later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
