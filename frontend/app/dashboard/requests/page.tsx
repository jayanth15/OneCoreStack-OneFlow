"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { isAdminOrAbove, getCurrentUser, canRequestInventory } from "@/lib/user";
import {
  PlusIcon, Search, ChevronLeft, ChevronRight, CheckCircle, XCircle,
  Clock, Ban, Eye, Pencil, History, AlertTriangle, ShoppingCart, X, PackageCheck, Package, Loader2, Trash2, Minus,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PurchaseRequest {
  id: number; sn_no: string;
  inventory_item_id: number | null; item_name: string | null;
  item_code: string | null; item_type: string | null;
  description: string | null; quantity: number;
  from_whom: string | null; timeline_days: number | null;
  notes: string | null; status: string;
  requested_by_user_id: number | null; requested_by_username: string | null; department: string | null;
  reviewed_by_username: string | null; reviewed_at: string | null;
  review_note: string | null; deadline_date: string | null;
  receipt_count: number; total_received: number;
  fulfilled_by_username: string | null; fulfillment_accepted_at: string | null; fulfillment_note: string | null;
  requested_by_dept_code: string | null; fulfilled_by_dept_code: string | null;
  created_at: string; updated_at: string;
}

interface HistoryEntry {
  id: number; request_id: number; changed_by_username: string | null;
  changed_at: string; change_type: string; field_name: string | null;
  old_value: string | null; new_value: string | null; note: string | null;
}

interface PaginatedResponse<T> { items: T[]; total: number; page: number; page_size: number; pages: number; }
interface DeptRef { id: number; code: string; name: string; }

interface InvItem { id: number; code: string; name: string; item_type: string; unit: string; timeline_days?: number | null; image_base64?: string | null; subtitle?: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  pending:          { label: "Pending",          color: "bg-amber-100 text-amber-700 border-amber-200",  Icon: Clock },
  approved:         { label: "Approved",         color: "bg-green-100 text-green-700 border-green-200",  Icon: CheckCircle },
  not_approved:     { label: "Not Approved",     color: "bg-red-100   text-red-700   border-red-200",    Icon: XCircle },
  cancelled:        { label: "Cancelled",        color: "bg-gray-100  text-gray-600  border-gray-200",   Icon: Ban },
  in_progress:      { label: "Being Arranged",             color: "bg-blue-100  text-blue-700  border-blue-200",   Icon: Loader2 },
  awaiting_signoff: { label: "Delivered – Confirm Receipt", color: "bg-orange-100 text-orange-700 border-orange-200", Icon: PackageCheck },
  received:         { label: "Received",         color: "bg-teal-100  text-teal-700  border-teal-200",   Icon: PackageCheck },
};

const STATUSES = ["all", "pending", "approved", "in_progress", "awaiting_signoff", "not_approved", "cancelled", "received"];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const { label, color, Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
      <Icon className="size-3" />{label}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
}

function DeadlineBadge({ deadlineDate }: { deadlineDate: string | null }) {
  if (!deadlineDate) return null;
  const daysLeft = Math.ceil((new Date(deadlineDate).getTime() - Date.now()) / 86400000);
  if (daysLeft > 0) return <span className="text-xs text-green-600 font-medium">{daysLeft}d left</span>;
  if (daysLeft === 0) return <span className="text-xs text-amber-600 font-medium">Due today</span>;
  return <span className="text-xs text-red-600 font-medium">{Math.abs(daysLeft)}d overdue</span>;
}

// ── Inventory type labels ─────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  raw_material: "Raw Material", finished_good: "Finished Good", semi_finished: "Semi Finished",
  spare: "Spare Part", consumable: "Consumable", attachment: "Attachment", weeder: "Weeder",
};
const ALL_INV_TYPES = ["raw_material", "finished_good", "semi_finished", "consumable", "attachment", "weeder", "spare"];

// ── SSR Combobox ──────────────────────────────────────────────────────────────

function InvCombobox({ value, onChange, invType }: {
  value: string;
  onChange: (item: InvItem) => void;
  invType?: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<InvItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value); }, [value]);
  useEffect(() => { setResults([]); setQuery(""); }, [invType]);

  const search = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const qs = q.trim() ? `&search=${encodeURIComponent(q)}` : "";
        let items: InvItem[] = [];
        if (!invType) {
          // no type selected — nothing to search
        } else if (invType === "raw_material" || invType === "finished_good" || invType === "semi_finished") {
          const d = await apiFetchJson<PaginatedResponse<{id:number;code:string;name:string;item_type:string;unit:string;timeline_days:number|null;image_base64:string|null}>>(`/api/v1/inventory?page_size=12&include_inactive=false&item_type=${invType}${qs}`);
          items = d.items.map(i => ({ id: i.id, code: i.code, name: i.name, item_type: i.item_type, unit: i.unit, timeline_days: i.timeline_days, image_base64: i.image_base64 }));
        } else if (invType === "consumable") {
          const d = await apiFetchJson<PaginatedResponse<{id:number;code:string|null;name:string;timeline_days:number|null;image_base64:string|null}>>(`/api/v1/consumables?page_size=12${qs}`);
          items = d.items.map(c => ({ id: c.id, code: c.code ?? "", name: c.name, item_type: "consumable", unit: "", timeline_days: c.timeline_days, image_base64: c.image_base64 }));
        } else if (invType === "attachment") {
          const d = await apiFetchJson<PaginatedResponse<{id:number;sn_no:string|null;description:string|null;timeline_days:number|null;image_base64:string|null}>>(`/api/v1/attachments?page_size=12${qs}`);
          items = d.items.map(a => ({ id: a.id, code: a.sn_no ?? "", name: a.description ?? a.sn_no ?? "—", item_type: "attachment", unit: "", timeline_days: a.timeline_days, image_base64: a.image_base64 }));
        } else if (invType === "weeder") {
          const d = await apiFetchJson<PaginatedResponse<{id:number;sn_no:string|null;name:string|null;timeline_days:number|null;image_base64:string|null}>>(`/api/v1/weeders?page_size=12${qs}`);
          items = d.items.map(w => ({ id: w.id, code: w.sn_no ?? "", name: w.name ?? w.sn_no ?? "—", item_type: "weeder", unit: "", timeline_days: w.timeline_days, image_base64: w.image_base64 }));
        } else if (invType === "spare") {
          const qParam = q.trim() ? `&q=${encodeURIComponent(q)}` : "";
          const variants = await apiFetchJson<{variant_id:number;serial_number:string|null;variant_color:string|null;image_base64:string|null;timeline_days:number|null;qty:number;item_id:number;item_name:string;part_number:string|null;category_name:string;sub_category_name:string|null}[]>(`/api/v1/spares/variants/search?limit=12${qParam}`);
          items = variants.map(v => {
            const variantLabel = [v.variant_color, v.serial_number].filter(Boolean).join(" / ");
            const displayName = variantLabel ? `${v.item_name} — ${variantLabel}` : v.item_name;
            const breadcrumb = [v.category_name, v.sub_category_name].filter(Boolean).join(" › ");
            return {
              id: v.variant_id,
              code: v.part_number ?? "",
              name: displayName,
              item_type: "spare",
              unit: "",
              timeline_days: v.timeline_days,
              image_base64: v.image_base64,
              subtitle: breadcrumb,
            };
          });
        }
        setResults(items);
      } catch { /* ignore */ }
      finally { setBusy(false); }
    }, q.trim() ? 300 : 0);
  }, [invType]);

  const imgSrc = (b64: string | null | undefined) =>
    b64 ? `data:image/jpeg;base64,${b64}` : null;

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-8 pr-8"
          placeholder={invType ? `Search ${TYPE_LABELS[invType] ?? invType} items…` : "Select inventory type first…"}
          value={query}
          disabled={!invType}
          onFocus={() => { setOpen(true); search(query); }}
          onChange={e => { setQuery(e.target.value); search(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {busy && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-[200] w-full rounded-md border bg-popover shadow-lg mt-1 max-h-64 overflow-y-auto">
          {results.map(item => {
            const src = imgSrc(item.image_base64);
            return (
              <button key={item.id} type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2.5 border-b border-border/40 last:border-0"
                onMouseDown={() => { onChange(item); setQuery(item.code ? `${item.code} — ${item.name}` : item.name); setOpen(false); }}>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium leading-tight">{item.name}</div>
                  {(item.code || item.subtitle) && (
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {item.subtitle ?? item.code}
                    </div>
                  )}
                </div>
                {src
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={src} alt="" className="size-9 rounded object-cover border shrink-0" />
                  : <div className="size-9 rounded border border-dashed bg-muted/50 shrink-0 flex items-center justify-center">
                      <ShoppingCart className="size-3.5 text-muted-foreground/40" />
                    </div>
                }
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── History Dialog ────────────────────────────────────────────────────────────

const CHANGE_COLORS: Record<string, string> = {
  created:      "text-blue-600",
  edited:       "text-amber-600",
  approved:     "text-green-600",
  rejected:     "text-red-600",
  cancelled:    "text-gray-500",
  responded:    "text-blue-700",
  receipt_created: "text-teal-600",
  receipt_acknowledged: "text-teal-700",
};

function HistoryDialog({ open, onClose, url, title }: { open: boolean; onClose: () => void; url: string; title: string }) {
  const [rows, setRows] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetchJson<HistoryEntry[]>(`${url}?limit=50&offset=0`)
      .then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, [open, url]);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><History className="size-4" /> History — {title}</DialogTitle></DialogHeader>
        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No history recorded yet.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Date</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Action</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Field</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Before</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">After</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(r.changed_at)}</td>
                    <td className={`px-3 py-2 text-xs font-semibold capitalize ${CHANGE_COLORS[r.change_type] ?? ""}`}>{r.change_type}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.field_name ?? (r.note ? <span className="italic">{r.note}</span> : "—")}</td>
                    <td className="px-3 py-2 text-xs">{r.old_value ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{r.new_value ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.changed_by_username ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Purchase / Production Tab ─────────────────────────────────────────────────

const P_BLANK = { item_name: "", item_code: "", item_type: "", description: "", quantity: "1", from_whom: "", timeline_days: "", notes: "", department: "" };

interface FormItemRow {
  _key: number;
  invType: string;
  invItemId: number | null;
  invLabel: string;
  item_name: string;
  item_code: string;
  description: string;
  quantity: string;
  timeline_days: string;
  showManual: boolean;
}

let _rowKey = 0;
function newRow(): FormItemRow {
  return { _key: ++_rowKey, invType: "", invItemId: null, invLabel: "", item_name: "", item_code: "", description: "", quantity: "1", timeline_days: "", showManual: false };
}

function PurchaseTab({ admin }: { admin: boolean }) {
  const [items, setItems] = useState<PurchaseRequest[]>([]);
  const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState(""); const [searchDraft, setSearchDraft] = useState("");

  const [dialog, setDialog] = useState<"create" | "edit" | "view" | null>(null);
  const [selected, setSelected] = useState<PurchaseRequest | null>(null);
  const [form, setForm] = useState({ ...P_BLANK });
  const [invItemId, setInvItemId] = useState<number | null>(null);
  const [invType, setInvType] = useState("");
  const allowedTypes = ALL_INV_TYPES.filter(canRequestInventory);
  const [invLabel, setInvLabel] = useState("");
  const [saving, setSaving] = useState(false); const [formErr, setFormErr] = useState<string | null>(null);
  const [showManualFields, setShowManualFields] = useState(false);
  const [formItems, setFormItems] = useState<FormItemRow[]>([newRow()]);
  // shared create-only fields
  const [sharedFromWhom, setSharedFromWhom] = useState("");
  const [sharedNotes, setSharedNotes] = useState("");

  const [reviewDialog, setReviewDialog] = useState<"approve" | "reject" | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelNote, setCancelNote] = useState(""); const [cancelling, setCancelling] = useState(false);

  const [histReq, setHistReq] = useState<PurchaseRequest | null>(null);

  const [receiptReq, setReceiptReq] = useState<PurchaseRequest | null>(null);
  const [receiptQty, setReceiptQty] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [receiptErr, setReceiptErr] = useState<string | null>(null);

  const [respondReq, setRespondReq] = useState<PurchaseRequest | null>(null);
  const [respondNote, setRespondNote] = useState("");
  const [respondSaving, setRespondSaving] = useState(false);
  const [respondErr, setRespondErr] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deletingSn, setDeletingSn] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const [depts, setDepts] = useState<DeptRef[]>([]);
  useEffect(() => {
    const user = getCurrentUser();
    const allowed: number[] = user?.request_departments ?? [];
    setCurrentUserId(user?.id ?? null);
    apiFetchJson<DeptRef[]>("/api/v1/departments")
      .then(all => setDepts(allowed.length && !isAdminOrAbove() ? all.filter(d => allowed.includes(d.id)) : all))
      .catch(() => {});
  }, []);

  const PAGE_SIZE = 10;

  const fetch = useCallback((p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    apiFetchJson<PaginatedResponse<PurchaseRequest>>(`/api/v1/purchase-requests?${params}`)
      .then(d => { setItems(d.items); setTotal(d.total); setPage(d.page); setPages(d.pages); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [statusFilter, search, page]); // eslint-disable-line

  useEffect(() => { fetch(1); }, [statusFilter, search]); // eslint-disable-line

  // Auto-refresh every 30s so status changes appear without manual reload
  useEffect(() => {
    const interval = setInterval(() => fetch(page), 30_000);
    return () => clearInterval(interval);
  }, [fetch, page]); // eslint-disable-line

  function openCreate() {
    const autoDept = depts.length === 1 ? depts[0].name : "";
    setSelected(null); setForm({ ...P_BLANK, department: autoDept }); setInvItemId(null); setInvLabel(""); setInvType(""); setFormErr(null); setShowManualFields(false);
    setFormItems([newRow()]); setSharedFromWhom(""); setSharedNotes("");
    setDialog("create");
  }
  function openEdit(r: PurchaseRequest) {
    setSelected(r);
    setForm({
      item_name: r.item_name ?? "", item_code: r.item_code ?? "", item_type: r.item_type ?? "",
      description: r.description ?? "", quantity: String(r.quantity),
      from_whom: r.from_whom ?? "", timeline_days: r.timeline_days != null ? String(r.timeline_days) : "",
      notes: r.notes ?? "", department: r.department ?? "",
    });
    setInvItemId(r.inventory_item_id);
    setInvLabel(r.item_code && r.item_name ? `${r.item_code} — ${r.item_name}` : r.item_name ?? "");
    setInvType(r.item_type ?? "");
    setFormErr(null); setShowManualFields(false); setDialog("edit");
  }

  async function save() {
    if (dialog === "create") {
      // Multi-item bulk create
      for (const row of formItems) {
        if (!row.item_name.trim() && !row.invItemId) { setFormErr("Every item must have a name or be selected from inventory"); return; }
        if (!parseFloat(row.quantity) || parseFloat(row.quantity) <= 0) { setFormErr("All quantities must be greater than 0"); return; }
      }
      setSaving(true); setFormErr(null);
      const bulkBody = {
        from_whom: sharedFromWhom || null,
        notes: sharedNotes || null,
        department: form.department || null,
        items: formItems.map(row => ({
          inventory_item_id: row.invItemId,
          item_name: row.item_name || null,
          item_code: row.item_code || null,
          item_type: row.invType || null,
          description: row.description || null,
          quantity: parseFloat(row.quantity) || 1,
          timeline_days: row.timeline_days ? parseInt(row.timeline_days) : null,
        })),
      };
      try {
        await apiFetchJson("/api/v1/purchase-requests/bulk", { method: "POST", body: JSON.stringify(bulkBody) });
        setDialog(null); fetch(1);
      } catch (e: unknown) { setFormErr(e instanceof Error ? e.message : "Save failed"); }
      finally { setSaving(false); }
    } else {
      // Single-item edit
      if (!form.item_name.trim() && !invItemId) { setFormErr("Please select or name an item"); return; }
      setSaving(true); setFormErr(null);
      const body = {
        inventory_item_id: invItemId, item_name: form.item_name || null,
        item_code: form.item_code || null, item_type: form.item_type || null,
        description: form.description || null, quantity: parseFloat(form.quantity) || 1,
        from_whom: form.from_whom || null, timeline_days: form.timeline_days ? parseInt(form.timeline_days) : null,
        notes: form.notes || null, department: form.department || null,
      };
      try {
        await apiFetchJson(`/api/v1/purchase-requests/${selected!.id}`, { method: "PUT", body: JSON.stringify(body) });
        setDialog(null); fetch(page);
      } catch (e: unknown) { setFormErr(e instanceof Error ? e.message : "Save failed"); }
      finally { setSaving(false); }
    }
  }

  async function doReview() {
    if (!selected || !reviewDialog) return;
    setReviewing(true);
    try {
      await apiFetchJson(`/api/v1/purchase-requests/${selected.id}/${reviewDialog}`, {
        method: "POST", body: JSON.stringify({ note: reviewNote || null }),
      });
      setReviewDialog(null); setReviewNote(""); fetch(page);
    } catch { /* ignore */ }
    finally { setReviewing(false); }
  }

  async function doCancel() {
    if (!cancelId) return;
    setCancelling(true);
    try {
      await apiFetchJson(`/api/v1/purchase-requests/${cancelId}/cancel`, {
        method: "POST", body: JSON.stringify({ note: cancelNote || null }),
      });
      setCancelId(null); fetch(page);
    } catch { /* ignore */ }
    finally { setCancelling(false); }
  }

  async function doCreateReceipt() {
    if (!receiptReq) return;
    const qty = parseFloat(receiptQty);
    if (!qty || qty <= 0) { setReceiptErr("Enter a valid quantity"); return; }
    setReceiptSaving(true); setReceiptErr(null);
    try {
      await apiFetchJson("/api/v1/receipts", {
        method: "POST",
        body: JSON.stringify({ request_id: receiptReq.id, quantity_received: qty, notes: receiptNotes || null }),
      });
      setReceiptReq(null); fetch(page);
    } catch (e: unknown) { setReceiptErr(e instanceof Error ? e.message : "Failed to create receipt"); }
    finally { setReceiptSaving(false); }
  }

  async function doRespond() {
    if (!respondReq) return;
    setRespondSaving(true); setRespondErr(null);
    try {
      await apiFetchJson(`/api/v1/purchase-requests/${respondReq.id}/respond`, {
        method: "POST",
        body: JSON.stringify({ note: respondNote || null }),
      });
      setRespondReq(null); fetch(page);
    } catch (e: unknown) { setRespondErr(e instanceof Error ? e.message : "Failed to respond"); }
    finally { setRespondSaving(false); }
  }

  async function doDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/purchase-requests/${deleteId}`, { method: "DELETE" });
      setDeleteId(null); fetch(page);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  }

  return (
    <div className="space-y-3">
      {/* Status filter + action row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {STATUSES.map(s => (
            <button key={s}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
              onClick={() => { setStatusFilter(s); setPage(1); }}>
              {s === "all" ? "All" : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <form onSubmit={e => { e.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }} className="flex gap-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input value={searchDraft} onChange={e => setSearchDraft(e.target.value)} placeholder="Search…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring w-44" />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
            {search && <Button type="button" size="sm" variant="ghost" onClick={() => { setSearch(""); setSearchDraft(""); }}><X className="size-3.5" /></Button>}
          </form>
          <Button size="sm" onClick={openCreate}><PlusIcon className="size-4 mr-1" />New Request</Button>
        </div>
      </div>

      {/* Table */}
      {loading ? <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
       : items.length === 0 ? (
        <div className="rounded-xl border p-12 text-center">
          <ShoppingCart className="size-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{search ? `No results for "${search}"` : "No purchase requests yet."}</p>
          {!search && <Button size="sm" className="mt-3" onClick={openCreate}><PlusIcon className="size-4 mr-1" />Create First Request</Button>}
        </div>
       ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead><tr className="border-b bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Request No.</th>
                  <th className="px-4 py-2.5 text-left font-medium">Item</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-4 py-2.5 text-left font-medium">Department</th>
                  <th className="px-4 py-2.5 text-left font-medium">People</th>
                  <th className="px-4 py-2.5 text-left font-medium">Timeline</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Date</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr></thead>
                <tbody className="divide-y">
                  {items.map(r => (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3"><Badge variant="secondary" className="font-mono text-xs">{r.sn_no}</Badge></td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="font-medium truncate">{r.item_name ?? "—"}</p>
                        {r.item_code && <p className="text-xs text-muted-foreground font-mono">{r.item_code}</p>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{r.quantity}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.department
                          ? <span className="font-medium text-foreground">{r.department}</span>
                          : <span className="text-muted-foreground">—</span>}
                        {r.from_whom && <p className="text-muted-foreground mt-0.5">→ {r.from_whom}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs space-y-0.5">
                        {r.requested_by_username && (
                          <p className="text-muted-foreground">
                            <span className="font-medium text-foreground">{r.requested_by_username}</span>
                            {r.requested_by_dept_code && <span className="ml-1 font-mono text-[10px] font-semibold text-blue-600">[{r.requested_by_dept_code}]</span>}
                            <span className="ml-1 text-[10px] text-muted-foreground/70">requested</span>
                          </p>
                        )}
                        {r.fulfilled_by_username && (
                          <p className="text-muted-foreground">
                            <span className="font-medium text-foreground">{r.fulfilled_by_username}</span>
                            {r.fulfilled_by_dept_code && <span className="ml-1 font-mono text-[10px] font-semibold text-blue-600">[{r.fulfilled_by_dept_code}]</span>}
                            <span className="ml-1 text-[10px] text-muted-foreground/70">fulfilling</span>
                          </p>
                        )}
                        {r.reviewed_by_username && (
                          <p>
                            <span className={`font-semibold ${r.status === "not_approved" ? "text-red-600" : "text-green-700"}`}>{r.reviewed_by_username}</span>
                            <span className={`ml-1 text-[10px] font-semibold ${r.status === "not_approved" ? "text-red-500" : "text-green-600"}`}>{r.status === "not_approved" ? "✗ rejected" : "✓ approved"}</span>
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.timeline_days ? (
                          <div className="text-xs">
                            <span className="text-muted-foreground">{r.timeline_days}d</span>
                            {r.deadline_date && <> · <DeadlineBadge deadlineDate={r.deadline_date} /></>}
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button variant="ghost" size="icon" className="size-7" title="View" onClick={() => { setSelected(r); setDialog("view"); }}><Eye className="size-3.5 text-blue-600" /></Button>
                          {r.status === "pending" && <Button variant="ghost" size="icon" className="size-7" title="Edit" onClick={() => openEdit(r)}><Pencil className="size-3.5" /></Button>}
                          {admin && r.status === "pending" && <>
                            <Button variant="ghost" size="icon" className="size-7" title="Approve" onClick={() => { setSelected(r); setReviewNote(""); setReviewDialog("approve"); }}><CheckCircle className="size-3.5 text-green-600" /></Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Reject" onClick={() => { setSelected(r); setReviewNote(""); setReviewDialog("reject"); }}><XCircle className="size-3.5 text-red-600" /></Button>
                          </>}
                          {r.status === "pending" && <Button variant="ghost" size="icon" className="size-7" title="Cancel" onClick={() => { setCancelId(r.id); setCancelNote(""); }}><Ban className="size-3.5 text-amber-600" /></Button>}
                          {/* Respond: non-admin, approved request, not the requester themselves */}
                          {!admin && r.status === "approved" && r.requested_by_user_id !== currentUserId && (
                            <Button variant="outline" size="sm" className="h-7 text-xs text-blue-600 border-blue-200" onClick={() => { setRespondReq(r); setRespondNote(""); setRespondErr(null); }}>Accept</Button>
                          )}
                          {(r.status === "approved" || r.status === "in_progress" || r.status === "awaiting_signoff") && r.requested_by_user_id !== currentUserId && (
                            <Button variant="outline" size="sm" className="h-7 text-xs text-teal-600 border-teal-200" onClick={() => { setReceiptReq(r); setReceiptQty(String(r.quantity)); setReceiptNotes(""); setReceiptErr(null); }}>Mark Delivered</Button>
                          )}
                          <Button variant="ghost" size="icon" className="size-7" title="History" onClick={() => setHistReq(r)}><History className="size-3.5 text-muted-foreground" /></Button>
                          {admin && <Button variant="ghost" size="icon" className="size-7" title="Delete" onClick={() => { setDeleteId(r.id); setDeletingSn(r.sn_no); }}><Trash2 className="size-3.5 text-red-500" /></Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">Page {page} of {pages} · {total} total</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => { const p = page-1; setPage(p); fetch(p); }}><ChevronLeft className="size-4 mr-1" />Prev</Button>
                <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => { const p = page+1; setPage(p); fetch(p); }}>Next<ChevronRight className="size-4 ml-1" /></Button>
              </div>
            </div>
          )}
        </>
       )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialog === "create" || dialog === "edit"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto overflow-x-visible">
          <DialogHeader><DialogTitle>{dialog === "create" ? "New Purchase Request" : `Edit — ${selected?.sn_no ?? ""}`}</DialogTitle></DialogHeader>

          {dialog === "create" ? (
            /* ── Multi-item create form ── */
            <div className="space-y-4 mt-1">
              {/* Item rows */}
              {formItems.map((row, idx) => (
                <div key={row._key} className="rounded-lg border p-3 space-y-3 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item {idx + 1}</span>
                    {formItems.length > 1 && (
                      <Button variant="ghost" size="icon" className="size-6 text-destructive hover:text-destructive" onClick={() => setFormItems(fi => fi.filter(r => r._key !== row._key))}>
                        <Minus className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  {/* Inventory type */}
                  <div className="space-y-1">
                    <Label className="text-xs">Inventory Type</Label>
                    <select value={row.invType} disabled={saving}
                      onChange={e => setFormItems(fi => fi.map(r => r._key === row._key ? { ...r, invType: e.target.value, invItemId: null, invLabel: "", item_name: "", item_code: "", timeline_days: "" } : r))}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                      <option value="">— Select type —</option>
                      {allowedTypes.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                  {/* Item search */}
                  <div className="space-y-1">
                    <Label className="text-xs">Item <span className="text-muted-foreground font-normal">(search or type manually)</span></Label>
                    <InvCombobox value={row.invLabel} invType={row.invType} onChange={item => {
                      const isReg = ["raw_material", "finished_good", "semi_finished"].includes(row.invType);
                      setFormItems(fi => fi.map(r => r._key === row._key ? {
                        ...r,
                        invItemId: isReg ? item.id : null,
                        invLabel: item.code ? `${item.code} — ${item.name}` : item.name,
                        item_name: item.name,
                        item_code: item.code,
                        timeline_days: item.timeline_days != null ? String(item.timeline_days) : "",
                        showManual: false,
                      } : r));
                    }} />
                    <button type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors mt-0.5"
                      onClick={() => setFormItems(fi => fi.map(r => r._key === row._key ? { ...r, showManual: !r.showManual } : r))}>
                      {row.showManual ? "Hide manual entry" : "Type item name manually instead"}
                    </button>
                    {row.showManual && (
                      <div className="grid grid-cols-2 gap-2 mt-1.5">
                        <Input placeholder="Item name" value={row.item_name} disabled={saving}
                          onChange={e => setFormItems(fi => fi.map(r => r._key === row._key ? { ...r, item_name: e.target.value } : r))} />
                        <Input placeholder="Code / SKU" value={row.item_code} disabled={saving}
                          onChange={e => setFormItems(fi => fi.map(r => r._key === row._key ? { ...r, item_code: e.target.value } : r))} />
                      </div>
                    )}
                  </div>
                  {/* Description + Qty */}
                  <div className="grid grid-cols-[1fr_7rem] gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Input placeholder="Spec / description…" value={row.description} disabled={saving}
                        onChange={e => setFormItems(fi => fi.map(r => r._key === row._key ? { ...r, description: e.target.value } : r))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Qty *</Label>
                      <Input type="number" min="0.001" step="any" value={row.quantity} disabled={saving}
                        onChange={e => setFormItems(fi => fi.map(r => r._key === row._key ? { ...r, quantity: e.target.value } : r))} />
                    </div>
                  </div>
                  {row.timeline_days && <p className="text-xs text-muted-foreground">Expected delivery: <span className="font-medium text-foreground">{row.timeline_days} day{Number(row.timeline_days) !== 1 ? "s" : ""}</span></p>}
                </div>
              ))}

              {/* Add Item button */}
              <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setFormItems(fi => [...fi, newRow()])} disabled={saving}>
                <PlusIcon className="size-3.5" />Add Another Item
              </Button>

              {/* Shared fields */}
              <div className="border-t pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Department</Label>
                    <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} disabled={saving}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                      <option value="">— select —</option>
                      {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Supplier / Source</Label>
                    <Input placeholder="Supplier name or source" value={sharedFromWhom} onChange={e => setSharedFromWhom(e.target.value)} disabled={saving} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <textarea rows={2} placeholder="Any additional notes…" value={sharedNotes}
                    onChange={e => setSharedNotes(e.target.value)} disabled={saving}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
              </div>

              {formErr && <p className="text-sm text-destructive">{formErr}</p>}
              <div className="flex gap-3 pt-1">
                <Button onClick={save} disabled={saving} className="flex-1">{saving ? "Saving…" : `Submit ${formItems.length > 1 ? `${formItems.length} Requests` : "Request"}`}</Button>
                <Button variant="outline" onClick={() => setDialog(null)} disabled={saving}>Cancel</Button>
              </div>
            </div>
          ) : (
            /* ── Single-item edit form (unchanged) ── */
            <div className="space-y-4 mt-1">
              <div className="space-y-1.5">
                <Label>Inventory Type *</Label>
                <select value={invType} onChange={e => { const t = e.target.value; setInvType(t); setInvItemId(null); setInvLabel(""); setForm(f => ({ ...f, item_name: "", item_code: "", item_type: t, timeline_days: "" })); }} disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                  <option value="">— Select type —</option>
                  {allowedTypes.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Inventory Item <span className="text-muted-foreground font-normal text-xs">(search to select, or type manually below)</span></Label>
                <InvCombobox value={invLabel} invType={invType} onChange={item => {
                  const isRegularInv = ["raw_material", "finished_good", "semi_finished"].includes(invType);
                  setInvItemId(isRegularInv ? item.id : null);
                  setInvLabel(item.code ? `${item.code} — ${item.name}` : item.name);
                  setForm(f => ({ ...f, item_name: item.name, item_code: item.code, item_type: invType || item.item_type, description: "", timeline_days: item.timeline_days != null ? String(item.timeline_days) : "" }));
                }} />
              </div>
              <div>
                <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors" onClick={() => setShowManualFields(v => !v)}>
                  {showManualFields ? "Hide manual entry" : "Type item name manually instead"}
                </button>
                {showManualFields && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="space-y-1.5">
                      <Label>Item Name</Label>
                      <Input placeholder="Item name" value={form.item_name} onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))} disabled={saving} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Item Code</Label>
                      <Input placeholder="Code / SKU" value={form.item_code} onChange={e => setForm(f => ({ ...f, item_code: e.target.value }))} disabled={saving} />
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <textarea rows={2} placeholder="Description or specification…" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Quantity *</Label>
                  <Input type="number" min="0.001" step="any" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} disabled={saving} />
                </div>
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} disabled={saving}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                    <option value="">— select —</option>
                    {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              {form.timeline_days && <p className="text-xs text-muted-foreground">Expected delivery: <span className="font-medium text-foreground">{form.timeline_days} day{Number(form.timeline_days) !== 1 ? "s" : ""}</span></p>}
              <div className="space-y-1.5">
                <Label>Supplier / Source</Label>
                <Input placeholder="Supplier name or source" value={form.from_whom} onChange={e => setForm(f => ({ ...f, from_whom: e.target.value }))} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <textarea rows={2} placeholder="Any additional notes…" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
              {formErr && <p className="text-sm text-destructive">{formErr}</p>}
              <div className="flex gap-3 pt-1">
                <Button onClick={save} disabled={saving} className="flex-1">{saving ? "Saving…" : "Save Changes"}</Button>
                <Button variant="outline" onClick={() => setDialog(null)} disabled={saving}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={dialog === "view"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{selected?.sn_no}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 mt-1 text-sm">
              <div className="flex items-center gap-2"><StatusBadge status={selected.status} />{selected.deadline_date && <DeadlineBadge deadlineDate={selected.deadline_date} />}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                {selected.item_name && <><dt className="text-muted-foreground">Item</dt><dd className="font-medium">{selected.item_name}{selected.item_code && <span className="ml-2 font-mono text-xs text-muted-foreground">{selected.item_code}</span>}</dd></>}
                {selected.description && <><dt className="text-muted-foreground">Description</dt><dd>{selected.description}</dd></>}
                <dt className="text-muted-foreground">Quantity</dt><dd className="font-semibold tabular-nums">{selected.quantity}</dd>
                {selected.from_whom && <><dt className="text-muted-foreground">Supplier / Source</dt><dd>{selected.from_whom}</dd></>}
                {selected.timeline_days && <><dt className="text-muted-foreground">Timeline</dt><dd>{selected.timeline_days} days{selected.deadline_date && ` (due ${fmtDate(selected.deadline_date)})`}</dd></>}
                {selected.department && <><dt className="text-muted-foreground">Department</dt><dd>{selected.department}</dd></>}
                {selected.notes && <><dt className="text-muted-foreground">Notes</dt><dd>{selected.notes}</dd></>}
                <dt className="text-muted-foreground">Requested By</dt><dd>{selected.requested_by_username ?? "—"}</dd>
                <dt className="text-muted-foreground">Date</dt><dd>{fmtDate(selected.created_at)}</dd>
                {selected.reviewed_by_username && <><dt className="text-muted-foreground">Reviewed By</dt><dd><span className={`font-semibold ${selected.status === "not_approved" ? "text-red-600" : "text-green-700"}`}>{selected.reviewed_by_username}</span><span className={`ml-2 text-xs font-semibold ${selected.status === "not_approved" ? "text-red-500" : "text-green-600"}`}>{selected.status === "not_approved" ? "✗ Rejected" : "✓ Approved"}</span>{selected.reviewed_at && <span className="text-muted-foreground ml-1">on {fmtDate(selected.reviewed_at)}</span>}</dd></>}
                {selected.review_note && <><dt className="text-muted-foreground">Review Note</dt><dd className="italic">{selected.review_note}</dd></>}
                {selected.fulfilled_by_username && <>
                  <dt className="text-muted-foreground">Responded By</dt>
                  <dd>{selected.fulfilled_by_username}{selected.fulfillment_accepted_at && ` on ${fmtDate(selected.fulfillment_accepted_at)}`}</dd>
                </>}
                {selected.fulfillment_note && <><dt className="text-muted-foreground">Response Note</dt><dd className="italic">{selected.fulfillment_note}</dd></>}
                {(selected.receipt_count > 0) && <>
                  <dt className="text-muted-foreground">Receipts</dt>
                  <dd className="font-medium">{selected.total_received} / {selected.quantity} received ({selected.receipt_count} {selected.receipt_count === 1 ? "entry" : "entries"})</dd>
                </> }
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve / Reject Dialog */}
      <Dialog open={reviewDialog !== null} onOpenChange={o => !o && setReviewDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reviewDialog === "approve" ? <CheckCircle className="size-4 text-green-600" /> : <XCircle className="size-4 text-red-600" />}
              {reviewDialog === "approve" ? "Approve" : "Reject"} Request — {selected?.sn_no}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="space-y-1.5">
              <Label>Note <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <textarea rows={3} placeholder="Leave a note…" value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="flex gap-3">
              <Button onClick={doReview} disabled={reviewing} className="flex-1"
                variant={reviewDialog === "reject" ? "destructive" : "default"}>
                {reviewing ? "Saving…" : reviewDialog === "approve" ? "Approve" : "Reject"}
              </Button>
              <Button variant="outline" onClick={() => setReviewDialog(null)} disabled={reviewing}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Alert */}
      <AlertDialog open={cancelId !== null} onOpenChange={o => !o && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2">
                <span>This will mark the request as cancelled. You can add a note below.</span>
                <Input placeholder="Reason (optional)" value={cancelNote} onChange={e => setCancelNote(e.target.value)} />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Back</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel} disabled={cancelling}>{cancelling ? "Cancelling…" : "Yes, Cancel"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* History Dialog */}
      {histReq && (
        <HistoryDialog open={!!histReq} onClose={() => setHistReq(null)}
          url={`/api/v1/purchase-requests/${histReq.id}/history`} title={histReq.sn_no} />
      )}

      {/* Delete Alert */}
      <AlertDialog open={deleteId !== null} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="size-4 text-red-500" /> Delete request {deletingSn}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the request and all its associated receipts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deleting ? "Deleting…" : "Yes, Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Respond Dialog */}
      <Dialog open={!!respondReq} onOpenChange={o => !o && setRespondReq(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="size-4 text-blue-600" /> Accept &amp; Respond — {respondReq?.sn_no}
            </DialogTitle>
          </DialogHeader>
          {respondReq && (
            <div className="space-y-3 mt-1">
              <p className="text-sm text-muted-foreground">
                Mark this request as <span className="font-semibold text-blue-700">In Progress</span>. This tells the requester that you have acknowledged the request and are working on it.
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Item</dt><dd className="font-medium">{respondReq.item_name ?? "—"}</dd>
                <dt className="text-muted-foreground">Qty</dt><dd>{respondReq.quantity}</dd>
                {respondReq.from_whom && <><dt className="text-muted-foreground">From</dt><dd>{respondReq.from_whom}</dd></>}
              </dl>
              <div className="space-y-1.5">
                <Label>Response Note <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <textarea rows={3} placeholder="e.g. Will arrange by Friday, checking stock…" value={respondNote}
                  onChange={e => setRespondNote(e.target.value)} disabled={respondSaving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
              {respondErr && <p className="text-sm text-destructive">{respondErr}</p>}
              <div className="flex gap-3">
                <Button onClick={doRespond} disabled={respondSaving} className="flex-1">{respondSaving ? "Saving…" : "Accept Request"}</Button>
                <Button variant="outline" onClick={() => setRespondReq(null)} disabled={respondSaving}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Receipt Dialog */}
      <Dialog open={!!receiptReq} onOpenChange={o => !o && setReceiptReq(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Package className="size-4 text-teal-600" /> Create Receipt — {receiptReq?.sn_no}</DialogTitle></DialogHeader>
          {receiptReq && (
            <div className="space-y-3 mt-1">
              <p className="text-sm text-muted-foreground">
                Item: <span className="font-medium text-foreground">{receiptReq.item_name ?? "—"}</span> · Ordered: <span className="font-semibold">{receiptReq.quantity}</span>
                {receiptReq.receipt_count > 0 && <span className="ml-1">(already received: {receiptReq.total_received})</span>}
              </p>
              <div className="space-y-1.5">
                <Label>Quantity to Deliver *</Label>
                <Input type="number" min="0.001" step="any" value={receiptQty} onChange={e => setReceiptQty(e.target.value)} disabled={receiptSaving} />
              </div>
              <div className="space-y-1.5">
                <Label>Delivery Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <textarea rows={2} placeholder="Packing slip, condition notes…" value={receiptNotes}
                  onChange={e => setReceiptNotes(e.target.value)} disabled={receiptSaving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
              {receiptErr && <p className="text-sm text-destructive">{receiptErr}</p>}
              <div className="flex gap-3">
                <Button onClick={doCreateReceipt} disabled={receiptSaving} className="flex-1">{receiptSaving ? "Saving…" : "Record Receipt"}</Button>
                <Button variant="outline" onClick={() => setReceiptReq(null)} disabled={receiptSaving}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const [admin, setAdmin] = useState(false);

  useEffect(() => { setAdmin(isAdminOrAbove()); }, []);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b px-6 gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbPage>Requests</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Requests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {admin ? "All requests from all users and departments." : "Your submitted requests and their status."}
          </p>
        </div>
        <PurchaseTab admin={admin} />
      </div>
    </>
  );
}
