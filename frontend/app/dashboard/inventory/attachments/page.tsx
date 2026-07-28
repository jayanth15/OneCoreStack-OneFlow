"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
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
import { apiFetch, apiFetchJson } from "@/lib/api";
import { isAdminOrAbove, canAccessInventory } from "@/lib/user";
import {
  PlusIcon, Pencil, Trash2, Search, ImageIcon, ChevronLeft, ChevronRight,
  PackagePlus, PackageMinus, History, Eye, AlertTriangle, Paperclip, Printer, FileText, Upload, Download,
} from "lucide-react";
import { fetchAllPages, openPrintWindow } from "@/lib/print-report";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttachmentItem {
  id: number;
  sn_no: string | null;
  description: string | null;
  qty: number;
  reorder_level: number;
  rate_per_unit: number | null;
  total_rate: number | null;
  storage_location: string | null;
  timeline_days: number | null;
  image_base64: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Paginated {
  items: AttachmentItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface AttachmentDocument {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string | null;
  uploaded_by_username: string | null;
  uploaded_at: string | null;
}

interface HistoryEntry {
  id: number;
  attachment_id: number;
  changed_by_username: string | null;
  changed_at: string;
  change_type: string;
  qty_before: number;
  qty_after: number;
  qty_delta: number;
  note: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

function fmtRate(n: number | null) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const BLANK = { sn_no: "", description: "", qty: "0", reorder_level: "0", rate_per_unit: "", storage_location: "", timeline_days: "" };

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AttachmentsPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState(false);
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");

  // create / edit dialog
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<AttachmentItem | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [imgB64, setImgB64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  // delete
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // adjust stock
  const [adjustItem, setAdjustItem] = useState<AttachmentItem | null>(null);
  const [adjustType, setAdjustType] = useState<"add" | "subtract">("add");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // view detail
  const [viewItem, setViewItem] = useState<AttachmentItem | null>(null);
  const [documents, setDocuments] = useState<AttachmentDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const documentRef = useRef<HTMLInputElement>(null);

  // history
  const [historyItem, setHistoryItem] = useState<AttachmentItem | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);

  useEffect(() => {
    setAdmin(isAdminOrAbove());
    if (!canAccessInventory("attachment")) {
      router.replace("/dashboard/inventory");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchItems = (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(p), page_size: String(PAGE_SIZE), include_inactive: "false",
    });
    if (search) params.set("search", search);
    apiFetchJson<Paginated>(`/api/v1/attachments?${params}`)
      .then(d => { setItems(d.items); setTotal(d.total); setPage(d.page); setPages(d.pages); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(1); }, [search]); // eslint-disable-line

  // ── Open dialog helpers ──────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null);
    setForm({ ...BLANK });
    setImgPreview(null); setImgB64(null);
    setFormError(null); setDialog("create");
  }
  function openEdit(item: AttachmentItem) {
    setEditing(item);
    setForm({
      sn_no: item.sn_no ?? "",
      description: item.description ?? "",
      qty: String(item.qty),
      reorder_level: String(item.reorder_level ?? 0),
      rate_per_unit: item.rate_per_unit != null ? String(item.rate_per_unit) : "",
      storage_location: item.storage_location ?? "",
      timeline_days: item.timeline_days != null ? String(item.timeline_days) : "",
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
    if (!form.sn_no.trim() && !form.description.trim()) { setFormError("SN No. or Description is required"); return; }
    setSaving(true); setFormError(null);
    const body = {
      sn_no: form.sn_no || null,
      description: form.description || null,
      qty: parseFloat(form.qty) || 0,
      reorder_level: parseFloat(form.reorder_level) || 0,
      rate_per_unit: form.rate_per_unit ? parseFloat(form.rate_per_unit) : null,
      storage_location: form.storage_location || null,
      timeline_days: form.timeline_days ? parseInt(form.timeline_days) : null,
      image_base64: imgB64,
    };
    try {
      if (dialog === "create") {
        await apiFetchJson("/api/v1/attachments", { method: "POST", body: JSON.stringify(body) });
      } else {
        await apiFetchJson(`/api/v1/attachments/${editing!.id}`, { method: "PUT", body: JSON.stringify(body) });
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
      await apiFetchJson(`/api/v1/attachments/${deleteId}`, { method: "DELETE" });
      setDeleteId(null); fetchItems(page);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setDeleting(false); }
  }

  // ── Adjust stock ─────────────────────────────────────────────────────────────

  function openAdjust(item: AttachmentItem, type: "add" | "subtract") {
    setAdjustItem(item); setAdjustType(type);
    setAdjustQty(""); setAdjustNote(""); setAdjustError(null);
  }

  async function doAdjust() {
    if (!adjustItem) return;
    const qty = parseFloat(adjustQty);
    if (isNaN(qty) || qty <= 0) { setAdjustError("Enter a positive quantity"); return; }
    setAdjusting(true); setAdjustError(null);
    try {
      await apiFetchJson(`/api/v1/attachments/${adjustItem.id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ adjustment_type: adjustType, quantity: qty, note: adjustNote || null }),
      });
      setAdjustItem(null); fetchItems(page);
    } catch (e: unknown) { setAdjustError(e instanceof Error ? e.message : "Failed"); }
    finally { setAdjusting(false); }
  }

  async function printInventory() {
    const all = await fetchAllPages(async (printPage, pageSize) => {
      const params = new URLSearchParams({ page: String(printPage), page_size: String(pageSize), include_inactive: "false" });
      if (search) params.set("search", search);
      return apiFetchJson<Paginated>("/api/v1/attachments?" + params);
    });
    openPrintWindow({
      title: "Attachment Inventory",
      subtitle: all.length + " items",
      mode: "cycle-count",
      columns: ["SN No.", "Description", "System Qty", "Physical Count", "Variance", "Location", "Counter Initials", "Notes"],
      rows: all.map(item => ({
        "SN No.": item.sn_no ?? "",
        "Description": item.description ?? "",
        "System Qty": String(item.qty),
        "Physical Count": "",
        "Variance": "",
        "Location": item.storage_location ?? "",
        "Counter Initials": "",
        "Notes": "",
      })),
    });
  }

  async function printHistory() {
    if (!historyItem) return;
    const all = await fetchAllPages(async (page, pageSize) => {
      const rows = await apiFetchJson<HistoryEntry[]>(`/api/v1/attachments/${historyItem.id}/history?limit=${pageSize}&offset=${(page - 1) * pageSize}`);
      return { items: rows, total: 0, page, page_size: pageSize, pages: 0 };
    });
    openPrintWindow({
      title: `Stock History — ${displayName(historyItem)}`,
      mode: "audit-snapshot",
      columns: ["Date", "Type", "Before", "Change", "After", "By", "Note"],
      rows: all.map(r => ({
        Date: fmtDate(r.changed_at),
        Type: r.change_type,
        Before: String(r.qty_before),
        Change: `${r.qty_delta > 0 ? "+" : ""}${r.qty_delta}`,
        After: String(r.qty_after),
        By: r.changed_by_username ?? "—",
        Note: r.note ?? "—",
      })),
    });
  }

  async function loadDocuments(itemId: number) {
    setDocumentsLoading(true);
    setDocumentError(null);
    try {
      setDocuments(await apiFetchJson<AttachmentDocument[]>("/api/v1/attachments/" + itemId + "/documents"));
    } catch (e: unknown) {
      setDocuments([]);
      setDocumentError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setDocumentsLoading(false);
    }
  }

  useEffect(() => {
    if (viewItem) loadDocuments(viewItem.id);
    else setDocuments([]);
  }, [viewItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!viewItem || !file) return;
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      setDocumentError("Only PDF files are allowed");
      e.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setDocumentError("File too large (max 10 MB)");
      e.target.value = "";
      return;
    }
    setDocumentBusy(true);
    setDocumentError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await apiFetch("/api/v1/attachments/" + viewItem.id + "/documents", { method: "POST", body });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || "Upload failed");
      }
      await loadDocuments(viewItem.id);
      fetchItems(page);
    } catch (err: unknown) {
      setDocumentError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setDocumentBusy(false);
      e.target.value = "";
    }
  }

  async function openDocument(document: AttachmentDocument) {
    if (!viewItem) return;
    setDocumentError(null);
    try {
      const response = await apiFetch("/api/v1/attachments/" + viewItem.id + "/documents/" + document.id + "/content");
      if (!response.ok) throw new Error("Unable to open document");
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: unknown) {
      setDocumentError(err instanceof Error ? err.message : "Unable to open document");
    }
  }

  async function deleteDocument(document: AttachmentDocument) {
    if (!viewItem || !window.confirm("Delete " + document.filename + "?")) return;
    setDocumentBusy(true);
    try {
      await apiFetchJson("/api/v1/attachments/" + viewItem.id + "/documents/" + document.id, { method: "DELETE" });
      await loadDocuments(viewItem.id);
      fetchItems(page);
    } catch (err: unknown) {
      setDocumentError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDocumentBusy(false);
    }
  }

  // ── History ───────────────────────────────────────────────────────────

  async function openHistory(item: AttachmentItem) {
    setHistoryItem(item); setHistoryRows([]); setHistoryPage(1); setHistoryHasMore(false); setHistoryLoading(true);
    try {
      const rows = await apiFetchJson<HistoryEntry[]>(`/api/v1/attachments/${item.id}/history?limit=10&offset=0`);
      setHistoryRows(rows); setHistoryHasMore(rows.length === 10);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }

  async function changeHistoryPage(newPage: number) {
    if (!historyItem) return;
    setHistoryRows([]); setHistoryLoading(true);
    try {
      const rows = await apiFetchJson<HistoryEntry[]>(`/api/v1/attachments/${historyItem.id}/history?limit=10&offset=${(newPage - 1) * 10}`);
      setHistoryRows(rows); setHistoryPage(newPage); setHistoryHasMore(rows.length === 10);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }

  const displayName = (item: AttachmentItem) => item.sn_no || item.description || `Item #${item.id}`;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <PageHeader
        title="Attachments"
        description={total > 0 ? `${total} item${total !== 1 ? "s" : ""}` : "Attachment inventory items"}
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Attachments" },
        ]}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={printInventory}><Printer className="size-4 mr-1" />Print</Button>
            {admin && <Button size="sm" onClick={openCreate}><PlusIcon className="size-4 mr-1" /> New Attachment</Button>}
          </>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Title + search */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Attachments</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {total > 0 ? `${total} item${total !== 1 ? "s" : ""}` : "Attachment inventory items"}
            </p>
          </div>
          <form onSubmit={e => { e.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }} className="flex gap-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text" value={searchDraft} onChange={e => setSearchDraft(e.target.value)}
                placeholder="Search SN No. / description…"
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
            <Paperclip className="size-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {search ? `No attachments matching "${search}".` : "No attachments yet."}
            </p>
            {admin && !search && (
              <Button size="sm" onClick={openCreate}>
                <PlusIcon className="size-4 mr-1" /> Add First Attachment
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-8">#</th>
                      <th className="px-4 py-2.5 text-left font-medium w-[130px]">SN No.</th>
                      <th className="px-4 py-2.5 text-left font-medium">Description</th>
                      <th className="px-4 py-2.5 text-left font-medium w-[150px]">Storage Location</th>
                      {admin && <th className="px-4 py-2.5 text-right font-medium">Rate / Unit</th>}
                      <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                      {admin && <th className="px-4 py-2.5 text-right font-medium">Total Rate</th>}
                      <th className="px-4 py-2.5 text-center font-medium">Image</th>
                      <th className="px-4 py-2.5 text-left font-medium">Updated</th>
                      <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, i) => (
                      <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground text-xs">{(page - 1) * PAGE_SIZE + i + 1}</td>
                        <td className="px-4 py-3 max-w-[130px]">
                          {item.sn_no
                            ? <Badge variant="secondary" className="font-mono max-w-full truncate block">{item.sn_no}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 max-w-xs"><span className="block truncate" title={item.description ?? ""}>{item.description ?? "—"}</span></td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[150px]"><span className="block truncate">{item.storage_location ?? "—"}</span></td>
                        {admin && <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtRate(item.rate_per_unit)}</td>}
                        <td className={`px-4 py-3 text-right tabular-nums ${item.reorder_level > 0 && item.qty <= item.reorder_level ? "text-warning font-medium" : ""}`}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {item.reorder_level > 0 && item.qty <= item.reorder_level && <AlertTriangle className="size-3" />}
                            {item.qty % 1 === 0 ? item.qty.toFixed(0) : item.qty.toFixed(2)}
                            {item.reorder_level > 0 && <span className="text-muted-foreground text-[10px] font-normal"> /{item.reorder_level % 1 === 0 ? item.reorder_level.toFixed(0) : item.reorder_level.toFixed(2)}</span>}
                          </span>
                        </td>
                        {admin && <td className="px-4 py-3 text-right tabular-nums font-medium">{item.total_rate != null ? fmtRate(item.total_rate) : "—"}</td>}
                        <td className="px-4 py-3 text-center">
                          {item.image_base64
                            ? <img src={`data:image/jpeg;base64,${item.image_base64}`} alt="att" className="size-9 rounded object-cover mx-auto" /> // eslint-disable-line @next/next/no-img-element
                            : <ImageIcon className="size-4 text-muted-foreground/30 mx-auto" />}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(item.updated_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <Button variant="ghost" size="icon" className="size-7" title="View details" onClick={() => setViewItem(item)}>
                              <Eye className="size-3.5 text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Add Stock" onClick={() => openAdjust(item, "add")}>
                              <PackagePlus className="size-3.5 text-success" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Remove Stock" onClick={() => openAdjust(item, "subtract")}>
                              <PackageMinus className="size-3.5 text-warning" />
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
                      ? <img src={`data:image/jpeg;base64,${item.image_base64}`} alt="att" className="size-12 rounded-lg object-cover shrink-0" /> // eslint-disable-line @next/next/no-img-element
                      : <div className="size-12 rounded-lg bg-muted flex items-center justify-center shrink-0"><Paperclip className="size-5 text-muted-foreground/40" /></div>}
                    <div className="flex-1 min-w-0">
                      {item.sn_no && <p className="font-semibold text-sm font-mono">{item.sn_no}</p>}
                      {item.description && <p className="text-sm text-muted-foreground truncate">{item.description}</p>}
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {item.storage_location && <span>📍 {item.storage_location}</span>}
                        {admin && item.rate_per_unit != null && <span>{fmtRate(item.rate_per_unit)} / unit</span>}
                        <span className={`font-semibold ${item.reorder_level > 0 && item.qty <= item.reorder_level ? "text-warning" : "text-foreground"}`}>
                          {item.reorder_level > 0 && item.qty <= item.reorder_level && <AlertTriangle className="size-3 inline mr-0.5" />}
                          Qty: {item.qty % 1 === 0 ? item.qty.toFixed(0) : item.qty.toFixed(2)}
                          {item.reorder_level > 0 && <span className="text-muted-foreground font-normal text-[10px]"> /{item.reorder_level % 1 === 0 ? item.reorder_level.toFixed(0) : item.reorder_level.toFixed(2)}</span>}
                        </span>
                        {admin && item.total_rate != null && <span className="font-medium text-foreground">Total: {fmtRate(item.total_rate)}</span>}
                        <span>{fmtDate(item.updated_at)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="size-8" title="Add Stock" onClick={() => openAdjust(item, "add")}>
                        <PackagePlus className="size-3.5 text-success" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8" title="Remove Stock" onClick={() => openAdjust(item, "subtract")}>
                        <PackageMinus className="size-3.5 text-warning" />
                      </Button>
                      {admin && (
                        <Button variant="ghost" size="icon" className="size-8" title="History" onClick={() => openHistory(item)}>
                          <History className="size-3.5 text-muted-foreground" />
                        </Button>
                      )}
                      {admin && (
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}>
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {admin && (
                        <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
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
            <DialogTitle>{dialog === "create" ? "New Attachment" : `Edit — ${editing ? displayName(editing) : ""}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="a-sn">SN No. <span className="text-muted-foreground font-normal text-xs">(required or description)</span></Label>
                <Input id="a-sn" placeholder="e.g. ATT-001" value={form.sn_no}
                  onChange={e => setForm(f => ({ ...f, sn_no: e.target.value }))} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-loc">Storage Location</Label>
                <Input id="a-loc" placeholder="e.g. Rack B2" value={form.storage_location}
                  onChange={e => setForm(f => ({ ...f, storage_location: e.target.value }))} disabled={saving} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-desc">Description</Label>
              <textarea id="a-desc" rows={2} placeholder="Describe the attachment item…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="a-qty">Total Qty</Label>
                <Input id="a-qty" type="number" min="0" step="any" placeholder="0" value={form.qty}
                  onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-rl">Reorder Level</Label>
                <Input id="a-rl" type="number" min="0" step="any" placeholder="0" value={form.reorder_level}
                  onChange={e => setForm(f => ({ ...f, reorder_level: e.target.value }))} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-rate">Rate / Unit (₹)</Label>
                <Input id="a-rate" type="number" min="0" step="any" placeholder="0.00" value={form.rate_per_unit}
                  onChange={e => setForm(f => ({ ...f, rate_per_unit: e.target.value }))} disabled={saving} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-timeline">Timeline (days)</Label>
              <Input id="a-timeline" type="number" inputMode="numeric" min="1" step="1" placeholder="e.g. 7" value={form.timeline_days}
                onChange={e => setForm(f => ({ ...f, timeline_days: e.target.value }))} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label>Image <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
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
                ? <PackagePlus className="size-4 text-success" />
                : <PackageMinus className="size-4 text-warning" />}
              {adjustType === "add" ? "Add Stock" : "Remove Stock"} — {adjustItem ? displayName(adjustItem) : ""}
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
                value={adjustQty} onChange={e => setAdjustQty(e.target.value)} disabled={adjusting} autoFocus />
            </div>
            {adjustType === "subtract" && adjustItem && (() => {
              const entered = parseFloat(adjustQty);
              if (!isNaN(entered) && entered > adjustItem.qty) {
                return (
                  <div className="flex items-start gap-1.5 rounded-md bg-warning/15 border border-warning/20 px-3 py-2 text-sm text-warning">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>Only <strong>{adjustItem.qty % 1 === 0 ? adjustItem.qty.toFixed(0) : adjustItem.qty.toFixed(2)}</strong> available — stock will be reduced to 0.</span>
                  </div>
                );
              }
              return null;
            })()}
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="break-words pr-6">{viewItem ? displayName(viewItem) : ""}</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-4 mt-1">
              {/* Image */}
              {viewItem.image_base64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:image/jpeg;base64,${viewItem.image_base64}`} alt="attachment"
                  className="w-full max-h-56 object-contain rounded-lg border bg-muted/20" />
              ) : (
                <div className="w-full h-24 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground/30">
                  <Paperclip className="size-10" />
                </div>
              )}

              {/* Status badges */}
              <div className="flex flex-wrap gap-1.5">
                {!viewItem.is_active && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded border bg-destructive/10 text-destructive border-destructive/20">Inactive</span>
                )}
                {viewItem.reorder_level > 0 && viewItem.qty <= viewItem.reorder_level && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border bg-warning/15 text-amber-800 border-warning/20">
                    <AlertTriangle className="size-3" /> Low Stock
                  </span>
                )}
              </div>

              {/* Details grid */}
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Details</p>
                <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                  {viewItem.sn_no && <><span className="text-muted-foreground whitespace-nowrap">SN No.</span><span className="font-mono font-medium break-all">{viewItem.sn_no}</span></>}
                  {viewItem.description && <><span className="text-muted-foreground whitespace-nowrap">Description</span><span className="break-words">{viewItem.description}</span></>}
                  {viewItem.storage_location && (
                    <><span className="text-muted-foreground whitespace-nowrap">Location</span><span className="break-words">{viewItem.storage_location}</span></>
                  )}
                  {viewItem.timeline_days != null && (
                    <><span className="text-muted-foreground whitespace-nowrap">Lead Time</span><span>{viewItem.timeline_days} day{viewItem.timeline_days !== 1 ? "s" : ""}</span></>
                  )}
                  <span className="text-muted-foreground whitespace-nowrap">Updated</span>
                  <span className="text-muted-foreground text-xs">{fmtDate(viewItem.updated_at)}</span>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PDF Attachments</p>
                  {admin && (
                    <>
                      <input ref={documentRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={uploadDocument} />
                      <Button size="sm" variant="outline" disabled={documentBusy} onClick={() => documentRef.current?.click()}>
                        <Upload className="size-3.5 mr-1" />{documentBusy ? "Working…" : "Upload PDF"}
                      </Button>
                    </>
                  )}
                </div>
                {documentError && <p className="text-xs text-destructive">{documentError}</p>}
                {documentsLoading ? <Skeleton className="h-12 w-full" /> : documents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No PDF documents uploaded.</p>
                ) : (
                  <div className="space-y-2">
                    {documents.map(document => (
                      <div key={document.id} className="flex items-center gap-2 rounded-md border bg-background p-2">
                        <FileText className="size-4 text-destructive shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{document.filename}</p>
                          <p className="text-xs text-muted-foreground">{(document.size_bytes / 1024).toFixed(1)} KB{document.uploaded_by_username ? " · " + document.uploaded_by_username : ""}{document.uploaded_at ? " · " + fmtDate(document.uploaded_at) : ""}</p>
                        </div>
                        <Button size="icon" variant="ghost" className="size-8" title="Open PDF" onClick={() => openDocument(document)}><Download className="size-3.5" /></Button>
                        {admin && <Button size="icon" variant="ghost" className="size-8 text-destructive" title="Delete PDF" disabled={documentBusy} onClick={() => deleteDocument(document)}><Trash2 className="size-3.5" /></Button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stock overview */}
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Stock Overview</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">On Hand</p>
                    <p className={`text-lg font-semibold tabular-nums ${viewItem.reorder_level > 0 && viewItem.qty <= viewItem.reorder_level ? "text-warning" : ""}`}>
                      {viewItem.qty % 1 === 0 ? viewItem.qty.toFixed(0) : viewItem.qty.toFixed(2)}
                    </p>
                  </div>
                  {viewItem.reorder_level > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Reorder Level</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {viewItem.reorder_level % 1 === 0 ? viewItem.reorder_level.toFixed(0) : viewItem.reorder_level.toFixed(2)}
                      </p>
                    </div>
                  )}
                  {admin && viewItem.rate_per_unit != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Rate / Unit</p>
                      <p className="text-lg font-semibold">{fmtRate(viewItem.rate_per_unit)}</p>
                    </div>
                  )}
                  {admin && viewItem.total_rate != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Total Value</p>
                      <p className="text-lg font-semibold">{fmtRate(viewItem.total_rate)}</p>
                    </div>
                  )}
                </div>
                {/* Stock bar */}
                {viewItem.reorder_level > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0</span>
                      <span>Reorder: {viewItem.reorder_level % 1 === 0 ? viewItem.reorder_level.toFixed(0) : viewItem.reorder_level.toFixed(2)}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${viewItem.qty <= viewItem.reorder_level ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${Math.min(100, (viewItem.qty / (viewItem.reorder_level * 2)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── History Dialog ──────────────────────────────────────────── */}
      <Dialog open={historyItem !== null} onOpenChange={o => !o && setHistoryItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2"><History className="size-4" /> Stock History — {historyItem ? displayName(historyItem) : ""}</span>
              <Button size="sm" variant="outline" onClick={printHistory}><Printer className="size-3.5 mr-1" />Print</Button>
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
                          r.change_type === "add" ? "text-success" :
                          r.change_type === "subtract" ? "text-warning" : "text-primary"
                        }`}>
                          {r.change_type === "add" && <PackagePlus className="size-3" />}
                          {r.change_type === "subtract" && <PackageMinus className="size-3" />}
                          {r.change_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.qty_before % 1 === 0 ? r.qty_before.toFixed(0) : r.qty_before.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.qty_delta > 0 ? "text-success" : r.qty_delta < 0 ? "text-warning" : ""}`}>
                        {r.qty_delta > 0 ? "+" : ""}{r.qty_delta % 1 === 0 ? r.qty_delta.toFixed(0) : r.qty_delta.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.qty_after % 1 === 0 ? r.qty_after.toFixed(0) : r.qty_after.toFixed(2)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.changed_by_username ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.note ?? "—"}</td>
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

      {/* ── Delete Confirmation ─────────────────────────────────────── */}
      <AlertDialog open={deleteId !== null} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete attachment item?</AlertDialogTitle>
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
