"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser, isAdminOrAbove, refreshCurrentUser } from "@/lib/user";
import { PackageCheck, Plus, Search, Pencil, Minus, Printer, Trash2, X, History, AlertTriangle } from "lucide-react";
import { openPrintWindow } from "@/lib/print-report";
import { SearchCombobox } from "@/components/ui/search-combobox";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DispatchAPIItem {
  id: number;
  item_name: string;
  inv_type: string | null;
  inv_item_id: number | null;
  quantity: number;
  unit: string | null;
}

interface Dispatch {
  id: number;
  dispatch_number: string;
  party_type: string;
  vendor_name: string | null;
  supplier_name: string | null;
  schedule_id: number | null;
  schedule_number: string | null;
  receipt_id: number | null;
  receipt_number: string | null;
  product_name: string;
  quantity: number;
  unit: string | null;
  dispatch_date: string | null;
  vehicle_number: string | null;
  driver_name: string | null;
  notes: string | null;
  status: string;
  created_by: string | null;
  created_at: string | null;
  items: DispatchAPIItem[];
}

interface DispatchItemForm {
  _key: string;
  inv_type: string;
  inv_item_id: number | null;
  item_name: string;
  quantity: string;
  unit: string;
}

interface DispatchFormState {
  party_type: "vendor" | "supplier";
  vendor_name: string;
  supplier_name: string;
  items: DispatchItemForm[];
  dispatch_date: string;
  vehicle_number: string;
  driver_name: string;
  notes: string;
  status: string;
  receipt_id: number | null;
  receipt_number: string;
}

interface CompanyInfo {
  company_name: string;
  company_address: string;
  company_city: string;
  company_state: string;
  company_country: string;
  company_pincode: string;
  company_phone: string;
  company_email: string;
  company_gstin: string;
}

interface NameOption { id: number; name: string; }
interface ReceiptOption {
  id: number;
  receipt_number: string;
  status: string;
  request_sn_no?: string | null;
  items?: Array<{
    item_name: string | null; item_code: string | null; item_type: string | null;
    inventory_item_id: number | null; unit_id: number | null; unit_name: string | null;
    quantity_delivered: number; quantity_signed_off: number | null;
  }>;
}
interface DispatchHistoryEntry {
  id: number;
  dispatch_id: number;
  changed_by_username: string | null;
  changed_at: string;
  change_type: string;
  old_status: string | null;
  new_status: string | null;
  notes: string | null;
}

const HISTORY_PAGE_SIZE = 10;

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-warning/15 text-warning",
  ready:      "bg-primary/10 text-primary",
  dispatched: "bg-primary/10 text-primary",
  delivered:  "bg-success/10 text-success",
  cancelled:  "bg-destructive/10 text-destructive",
};
const STATUSES = ["pending", "ready", "dispatched", "delivered", "cancelled"];
// Allowed transitions mirror backend DISPATCH_TRANSITIONS.
const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["ready", "dispatched", "delivered", "cancelled"],
  ready: ["dispatched", "cancelled"],
  dispatched: ["delivered"],
  delivered: [],
  cancelled: [],
};

// Transitions that can never succeed for this dispatch, filtered out of the
// dropdown so the user is not offered moves that the backend will 409.
//
// Backend rule (dispatch.py): a SUPPLIER dispatch requires a linked receipt
// for dispatched/delivered ONLY when it carries NO inventory items. Item-based
// supplier dispatches (inv_type + inv_item_id set) complete like vendors — so
// we must not hide delivered/dispatched for them.
function availableStatuses(d: Dispatch): string[] {
  const base = STATUS_TRANSITIONS[d.status] ?? [];
  const hasInventoryItems = (d.items ?? []).some(
    i => !!i.inv_type && i.inv_item_id != null,
  );
  if (d.party_type === "supplier" && !hasInventoryItems) {
    return base.filter(s => (s === "dispatched" || s === "delivered") ? !!d.receipt_id : true);
  }
  return base;
}

// Options for a status <select>: the current status (shown but disabled so the
// box never renders an option list that omits the present state) followed by
// the valid next statuses. Used by both the list row and the edit dialog so
// they always agree.
function statusOptions(current: string, d?: Dispatch): string[] {
  const opts = d ? availableStatuses(d) : (STATUS_TRANSITIONS[current] ?? []);
  return opts.includes(current) ? opts : [current, ...opts];
}

const DISPATCH_INV_TYPES = [
  { value: "raw_material",  label: "Raw Material" },
  { value: "finished_good", label: "Finished Goods" },
  { value: "semi_finished", label: "Semi-Finished" },
  { value: "scrap",         label: "Scrap" },
  { value: "weeder",        label: "Weeder" },
  { value: "attachment",    label: "Attachment" },
  { value: "spare",         label: "Spares" },
  { value: "consumable",    label: "Consumable" },
];

function inventoryTypeLabel(value: string): string {
  if (!value) return "Not specified";
  return DISPATCH_INV_TYPES.find((type) => type.value === value)?.label
    ?? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function blankDispatchItem(): DispatchItemForm {
  return {
    _key: Math.random().toString(36).slice(2),
    inv_type: "", inv_item_id: null, item_name: "", quantity: "", unit: "",
  };
}

function BLANK_FORM(): DispatchFormState {
  return {
    party_type: "vendor",
    vendor_name: "", supplier_name: "",
    items: [blankDispatchItem()],
    dispatch_date: "",
    vehicle_number: "", driver_name: "", notes: "", status: "pending",
    receipt_id: null,
    receipt_number: "",
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DispatchPage() {
  const router = useRouter();

  useEffect(() => {
    async function verifyAccess() {
      const cached = getCurrentUser();
      if (!cached) { router.replace("/login"); return; }
      const user = await refreshCurrentUser() ?? cached;
      const admin = user.role === "admin" || user.role === "super_admin";
      if (!admin && !user.dispatch_access) router.replace("/dashboard");
    }
    verifyAccess();
  }, [router]);

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [items, setItems] = useState<Dispatch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [vendors, setVendors] = useState<NameOption[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<DispatchFormState>(BLANK_FORM());
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<Dispatch | null>(null);
  const [editForm, setEditForm] = useState<DispatchFormState>(BLANK_FORM());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const adminUser = isAdminOrAbove();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Dispatch | null>(null);
  const [historyRows, setHistoryRows] = useState<DispatchHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status_filter", statusFilter);
    params.set("page_size", "100");
    apiFetchJson<{ items: Dispatch[]; total: number }>(`/api/v1/dispatch?${params}`)
      .then(r => { setItems(r.items); setTotal(r.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [search, statusFilter]);

  useEffect(() => {
    apiFetchJson<CompanyInfo>("/api/v1/settings/company").then(setCompanyInfo).catch(() => {});
    apiFetchJson<NameOption[]>("/api/v1/vendors/names").then(setVendors).catch(() => {});
  }, []);

  function buildPayload(form: DispatchFormState) {
    const vendor = vendors.find(v => v.name === form.vendor_name);
    const validItems = form.items.filter(it => it.item_name.trim());
    const first = validItems[0];
    return {
      party_type: form.party_type,
      vendor_id: form.party_type === "vendor" ? (vendor?.id ?? null) : null,
      vendor_name: form.party_type === "vendor" ? form.vendor_name || null : null,
      supplier_id: null,
      supplier_name: form.party_type === "supplier" ? form.supplier_name || null : null,
      schedule_id: null,
      schedule_number: null,
      receipt_id: form.receipt_id,
      product_name: first?.item_name ?? "",
      quantity: parseFloat(first?.quantity ?? "0") || 0,
      unit: first?.unit || null,
      dispatch_date: form.dispatch_date || null,
      vehicle_number: form.vehicle_number || null,
      driver_name: form.driver_name || null,
      notes: form.notes || null,
      status: form.status,
      items: validItems.map(it => ({
        item_name: it.item_name.trim(),
        inv_type: it.inv_type || null,
        inv_item_id: it.inv_item_id,
        quantity: parseFloat(it.quantity) || 0,
        unit: it.unit || null,
      })),
    };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const validItems = createForm.items.filter(it => it.item_name.trim());
    if (validItems.length === 0) { setCreateError("At least one item is required"); return; }
    setCreateSaving(true); setCreateError(null);
    try {
      await apiFetchJson("/api/v1/dispatch", {
        method: "POST",
        body: JSON.stringify(buildPayload(createForm)),
      });
      setShowCreate(false); setCreateForm(BLANK_FORM()); load();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally { setCreateSaving(false); }
  }

  function openEdit(d: Dispatch) {
    setEditTarget(d);
    const partyType = (d.party_type as "vendor" | "supplier") ?? (d.supplier_name ? "supplier" : "vendor");
    const formItems: DispatchItemForm[] =
      d.items && d.items.length > 0
        ? d.items.map(i => ({
            _key: Math.random().toString(36).slice(2),
            inv_type: i.inv_type ?? "",
            inv_item_id: i.inv_item_id,
            item_name: i.item_name,
            quantity: String(i.quantity),
            unit: i.unit ?? "",
          }))
        : [{ ...blankDispatchItem(), item_name: d.product_name || "", quantity: String(d.quantity), unit: d.unit ?? "" }];
    setEditForm({
      party_type: partyType,
      vendor_name: d.vendor_name ?? "",
      supplier_name: d.supplier_name ?? "",
      items: formItems,
      dispatch_date: d.dispatch_date ?? "",
      vehicle_number: d.vehicle_number ?? "",
      driver_name: d.driver_name ?? "",
      notes: d.notes ?? "",
      status: d.status,
      receipt_id: d.receipt_id,
      receipt_number: d.receipt_number ?? "",
    });
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const validItems = editForm.items.filter(it => it.item_name.trim());
    if (validItems.length === 0) { setEditError("At least one item is required"); return; }
    setEditSaving(true); setEditError(null);
    try {
      await apiFetchJson(`/api/v1/dispatch/${editTarget.id}`, {
        method: "PUT",
        body: JSON.stringify(buildPayload(editForm)),
      });
      setEditTarget(null); load();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update");
    } finally { setEditSaving(false); }
  }

  async function handleStatusChange(dispatchId: number, newStatus: string) {
    setStatusUpdatingId(dispatchId);
    setStatusError(null);
    try {
      await apiFetchJson(`/api/v1/dispatch/${dispatchId}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      setStatusError(null);
      setItems(prev => prev.map(item =>
        item.id === dispatchId ? { ...item, status: newStatus } : item
      ));
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : "Failed to update dispatch status");
      load();
    } finally {
      setStatusUpdatingId(null);
    }
  }

  async function deleteDispatch(dispatch: Dispatch) {
    if (!window.confirm(`Delete dispatch ${dispatch.dispatch_number}? This action is restricted to admins.`)) return;
    setDeletingId(dispatch.id);
    try {
      await apiFetchJson(`/api/v1/dispatch/${dispatch.id}`, { method: "DELETE" });
      load();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to delete dispatch");
    } finally {
      setDeletingId(null);
    }
  }

  async function openHistory(d: Dispatch, page = 1) {
    setHistoryTarget(d);
    setHistoryPage(page);
    setHistoryLoading(true);
    try {
      const rows = await apiFetchJson<DispatchHistoryEntry[]>(
        `/api/v1/dispatch/${d.id}/history?limit=${HISTORY_PAGE_SIZE}&offset=${(page - 1) * HISTORY_PAGE_SIZE}`,
      );
      setHistoryRows(rows);
      setHistoryHasMore(rows.length === HISTORY_PAGE_SIZE);
    } catch {
      setHistoryRows([]);
      setHistoryHasMore(false);
    } finally {
      setHistoryLoading(false);
    }
  }

  function changeHistoryPage(newPage: number) {
    if (!historyTarget) return;
    void openHistory(historyTarget, newPage);
  }

  function printDispatchHistory() {
    if (!historyTarget) return;
    openPrintWindow({
      title: `Dispatch History — ${historyTarget.dispatch_number}`,
      subtitle: `${historyRows.length} audit events · Page ${historyPage}`,
      companyName: companyInfo?.company_name,
      mode: "audit-history",
      columns: ["Action", "Timestamp", "User", "Status Change", "Notes"],
      rows: historyRows.map(row => ({
        "Action": row.change_type.replaceAll("_", " "),
        "Timestamp": new Date(row.changed_at).toLocaleString("en-IN"),
        "User": row.changed_by_username ?? "System",
        "Status Change": row.old_status || row.new_status ? (row.old_status ?? "—") + " → " + (row.new_status ?? "—") : "",
        "Notes": row.notes ?? "",
      })),
    });
  }

  function printDispatch(d: Dispatch) {
    const items = d.items && d.items.length > 0
      ? d.items
      : [{ item_name: d.product_name, quantity: d.quantity, unit: d.unit, inv_type: null }];
    const partyName = d.party_type === "supplier" ? d.supplier_name : d.vendor_name;
    const partyLabel = d.party_type === "vendor" ? "Vendor" : "Supplier";
    const receiptRef = d.receipt_number ? `Receipt: ${d.receipt_number}` : "";
    const extraRefs = [receiptRef].filter(Boolean).join(" | ");
    openPrintWindow({
      title: `Dispatch — ${d.dispatch_number}`,
      subtitle: `${partyLabel}: ${partyName ?? "—"}`,
      companyName: companyInfo?.company_name,
      companyAddress: [companyInfo?.company_address, companyInfo?.company_city, companyInfo?.company_state].filter(Boolean).join(", "),
      mode: "audit-snapshot",
      documentLabel: "Dispatch",
      metadata: [
        { label: "Status", value: d.status.replaceAll("_", " ") },
        { label: partyLabel, value: partyName ?? "—" },
        { label: "Receipt", value: d.receipt_number ?? "—" },
        { label: "Dispatch date", value: d.dispatch_date ?? "—" },
        { label: "Vehicle", value: d.vehicle_number ?? "—" },
        { label: "Driver", value: d.driver_name ?? "—" },
        { label: "Created by", value: d.created_by ?? "—" },
        { label: "Created at", value: d.created_at ? new Date(d.created_at).toLocaleString("en-IN") : "—" },
        { label: "Notes", value: d.notes ?? "—" },
      ],
      columns: ["#", "Item", "Type", "Qty", "Unit"],
      rows: items.map((it, i) => ({
        "#": String(i + 1),
        "Item": it.item_name ?? "",
        "Type": it.inv_type ?? "—",
        "Qty": String(it.quantity),
        "Unit": it.unit ?? "",
      })),
      extraHeader: extraRefs || undefined,
    });
  }

  return (
    <>
      <PageHeader
        title="Dispatch"
        breadcrumbs={[{ label: "Dispatch" }]}
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input ref={searchRef} className="pl-8 h-8 w-40 text-sm" placeholder="Search…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">All statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <Button size="sm" onClick={() => { setCreateForm(BLANK_FORM()); setCreateError(null); setShowCreate(true); }}>
              <Plus className="size-4 mr-1.5" />New Dispatch
            </Button>
          </>
        }
      />

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Dispatch</DialogTitle></DialogHeader>
          <DispatchForm form={createForm} vendors={vendors} saving={createSaving}
            error={createError} onChange={setCreateForm} onSubmit={handleCreate} isCreate />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={createSaving}>Cancel</Button>
            <Button disabled={createSaving} onClick={handleCreate}>
              {createSaving ? "Creating…" : "Create Dispatch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Dispatch</DialogTitle></DialogHeader>
          <DispatchForm form={editForm} vendors={vendors} saving={editSaving}
            error={editError} onChange={setEditForm} onSubmit={handleEdit} isCreate={false}
            currentStatus={editTarget?.status} dispatch={editTarget ?? undefined} />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editSaving}>Cancel</Button>
            <Button disabled={editSaving} onClick={handleEdit}>
              {editSaving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyTarget !== null} onOpenChange={(o) => { if (!o) setHistoryTarget(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>History — {historyTarget?.dispatch_number}</span>
              <Button size="sm" variant="outline" onClick={printDispatchHistory} disabled={historyRows.length === 0}>
                <Printer className="size-3.5 mr-1" />Print
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-2 space-y-2">
            {historyLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : historyRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No history recorded.</p>
            ) : (
              historyRows.map(row => (
                <div key={row.id} className="rounded-lg border bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {row.change_type.replaceAll("_", " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.changed_at).toLocaleString("en-IN")}
                    </span>
                  </div>
                  {(row.old_status || row.new_status) && (
                    <p className="mt-1 text-sm font-medium">
                      {(row.old_status ?? "—")} → {row.new_status}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    by {row.changed_by_username ?? "System"}
                    {row.notes ? ` · ${row.notes}` : ""}
                  </p>
                </div>
              ))
            )}
            {(historyPage > 1 || historyHasMore) && (
              <div className="flex items-center justify-between gap-3 pt-2">
                <Button size="sm" variant="outline" disabled={historyPage <= 1 || historyLoading}
                  onClick={() => changeHistoryPage(historyPage - 1)}>← Prev</Button>
                <span className="text-sm text-muted-foreground">Page {historyPage}</span>
                <Button size="sm" variant="outline" disabled={!historyHasMore || historyLoading}
                  onClick={() => changeHistoryPage(historyPage + 1)}>Next →</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {statusError && (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <span>{statusError}</span>
          </div>
        )}
        {!loading && (
          <p className="mb-4 text-sm text-muted-foreground">
            <strong className="text-foreground">{total}</strong> dispatch{total !== 1 ? "es" : ""}
          </p>
        )}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <PackageCheck className="size-12 mx-auto mb-3 opacity-20" />
            <p className="mb-4">No dispatches found.</p>
            <Button size="sm" onClick={() => { setCreateForm(BLANK_FORM()); setCreateError(null); setShowCreate(true); }}>
              <Plus className="size-4 mr-1.5" />Create First Dispatch
            </Button>
          </div>
        )}
        {!loading && items.length > 0 && (
          <div className="space-y-3">
            {items.map((d) => {
              const partyName = d.party_type === "supplier" ? d.supplier_name : d.vendor_name;
              const partyLabel = d.party_type === "vendor" ? "Vendor" : "Supplier";
              const itemSummary =
                d.items && d.items.length > 0
                  ? d.items.length === 1
                    ? d.items[0].item_name
                    : `${d.items.length} items`
                  : d.product_name;
              return (
                <div key={d.id} className="rounded-xl border bg-card p-4 flex items-start gap-4">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <PackageCheck className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm">{d.dispatch_number}</span>
                      <select
                        value={d.status}
                        onChange={(e) => handleStatusChange(d.id, e.target.value)}
                        disabled={statusUpdatingId === d.id}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${STATUS_COLORS[d.status] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {statusOptions(d.status, d).map(s => (
                          <option key={s} value={s} disabled={s === d.status}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-sm font-medium mt-0.5">{itemSummary}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0 text-xs text-muted-foreground mt-1">
                      {partyName && <span>{partyLabel}: {partyName}</span>}
                      {d.items && d.items.length === 1 && (
                        <span>Qty: {d.items[0].quantity}{d.items[0].unit ? ` ${d.items[0].unit}` : ""}</span>
                      )}
                      {d.items && d.items.length > 1 && (
                        <span className="line-clamp-1">
                          {d.items.map(i => `${i.quantity}${i.unit ? ` ${i.unit}` : ""} ${i.item_name}`).join(" · ")}
                        </span>
                      )}
                      {(!d.items || d.items.length === 0) && (
                        <span>Qty: {d.quantity}{d.unit ? ` ${d.unit}` : ""}</span>
                      )}
                      {d.dispatch_date && <span>Date: {d.dispatch_date}</span>}
                      {d.vehicle_number && <span>Vehicle: {d.vehicle_number}</span>}
                      {d.driver_name && <span>Driver: {d.driver_name}</span>}
                      {d.schedule_number && <span>Schedule: {d.schedule_number}</span>}
                      {d.receipt_number && <span>Receipt: {d.receipt_number}</span>}
                    </div>
                    {d.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{d.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => printDispatch(d)} title="Print dispatch">
                      <Printer className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => openHistory(d)} title="History">
                      <History className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => openEdit(d)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    {adminUser && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        aria-label={`Delete dispatch ${d.dispatch_number}`}
                        disabled={deletingId === d.id}
                        onClick={() => deleteDispatch(d)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

function DispatchForm({
  form, vendors, saving, error, onChange, onSubmit, isCreate, currentStatus, dispatch,
}: {
  form: DispatchFormState;
  vendors: NameOption[];
  saving: boolean;
  error: string | null;
  onChange: (f: DispatchFormState | ((prev: DispatchFormState) => DispatchFormState)) => void;
  onSubmit: (e: React.FormEvent) => void;
  isCreate: boolean;
  currentStatus?: string;
  dispatch?: Dispatch;
}) {
  const receiptItemsLocked = form.receipt_id !== null;

  function updateItem(key: string, patch: Partial<DispatchItemForm>) {
    onChange({ ...form, items: form.items.map(i => i._key === key ? { ...i, ...patch } : i) });
  }

  async function applyReceipt(receiptOption: ReceiptOption) {
    try {
      const receipt = receiptOption.items
        ? receiptOption
        : await apiFetchJson<ReceiptOption>(`/api/v1/receipts/${receiptOption.id}`);
      const items: DispatchItemForm[] = (receipt.items ?? []).map(it => ({
        _key: Math.random().toString(36).slice(2),
        inv_type: it.item_type || "",
        inv_item_id: it.inventory_item_id,
        item_name: it.item_name || it.item_code || "",
        quantity: String(it.quantity_signed_off ?? it.quantity_delivered ?? ""),
        unit: it.unit_name ?? "",
      }));
      if (items.length === 0) throw new Error("Selected receipt has no items to dispatch");
      onChange(current => ({
        ...current,
        receipt_id: receipt.id,
        receipt_number: receipt.receipt_number,
        items,
      }));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to prefill from receipt");
    }
  }
  function addItem() {
    onChange({ ...form, items: [...form.items, blankDispatchItem()] });
  }
  function removeItem(key: string) {
    if (form.items.length === 1) return;
    onChange({ ...form, items: form.items.filter(i => i._key !== key) });
  }

  return (
    <form onSubmit={onSubmit} className="px-4 space-y-4">
      {/* Party Type toggle */}
      <div className="space-y-1.5">
        <Label>Party Type</Label>
        <div className="flex gap-2">
          <button type="button"
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              form.party_type === "vendor"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-input hover:bg-muted"
            }`}
            onClick={() => onChange({ ...form, party_type: "vendor", supplier_name: "", receipt_id: null })}
            disabled={saving}>
            Vendor (OEM)
          </button>
          <button type="button"
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              form.party_type === "supplier"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-input hover:bg-muted"
            }`}
            onClick={() => onChange({ ...form, party_type: "supplier", vendor_name: "" })}
            disabled={saving}>
            Dealer / Supplier
          </button>
        </div>
      </div>

      {/* Party selector */}
      {form.party_type === "vendor" ? (
        <div className="space-y-1.5">
          <Label htmlFor="d-vendor">Vendor (OEM Client)</Label>
          <select id="d-vendor" value={form.vendor_name}
            onChange={(e) => onChange({ ...form, vendor_name: e.target.value })}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
            <option value="">— Select vendor —</option>
            {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
          </select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="d-customer-type">Dealer / Supplier</Label>
          <select id="d-customer-type" value={form.supplier_name}
            onChange={(e) => onChange({ ...form, supplier_name: e.target.value })}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
            <option value="">— Select customer type —</option>
            <option value="Dealer">Dealer</option>
            <option value="Distributors">Distributors</option>
            <option value="Walk-in customers">Walk-in customers</option>
          </select>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Items <span className="text-destructive">*</span></Label>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={addItem} disabled={saving || receiptItemsLocked}>
            <Plus className="size-3" /> Add Item
          </Button>
        </div>
        {receiptItemsLocked && (
          <p className="text-xs text-muted-foreground">
            Items are filled from the selected receipt and cannot be changed in dispatch.
          </p>
        )}
        {form.items.map((item, idx) => (
          <div key={item._key} className="rounded-lg border p-3 space-y-2 bg-muted/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
              {form.items.length > 1 && !receiptItemsLocked && (
                <Button type="button" size="icon" variant="ghost"
                  className="size-6 text-destructive hover:text-destructive"
                  onClick={() => removeItem(item._key)} disabled={saving}>
                  <Minus className="size-3.5" />
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Inventory Type <span className="text-destructive">*</span></Label>
              {receiptItemsLocked ? (
                <div className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm font-medium">
                  {inventoryTypeLabel(item.inv_type)}
                </div>
              ) : (
                <select value={item.inv_type}
                  onChange={(e) => updateItem(item._key, { inv_type: e.target.value, inv_item_id: null, item_name: "" })}
                  disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                  <option value="">— Select type —</option>
                  {DISPATCH_INV_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              )}
            </div>
            {item.inv_type ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Item <span className="text-destructive">*</span></Label>
                <DispatchInvCombobox
                  invType={item.inv_type}
                  value={item.item_name}
                  disabled={saving || receiptItemsLocked}
                  onSelect={(name, id) => updateItem(item._key, { item_name: name, inv_item_id: id })}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Item name</Label>
                <Input placeholder="Select type above to search items" value={item.item_name}
                  onChange={(e) => updateItem(item._key, { item_name: e.target.value })} disabled={saving || receiptItemsLocked} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity</Label>
                <Input type="number" step="any" placeholder="0" value={item.quantity}
                  onChange={(e) => updateItem(item._key, { quantity: e.target.value })} disabled={saving || receiptItemsLocked} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unit</Label>
                <Input placeholder="pcs / kg" value={item.unit}
                  onChange={(e) => updateItem(item._key, { unit: e.target.value })} disabled={saving || receiptItemsLocked} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="d-date">Dispatch Date</Label>
        <Input id="d-date" type="date" value={form.dispatch_date}
          onChange={(e) => onChange({ ...form, dispatch_date: e.target.value })} disabled={saving} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="d-vehicle">Vehicle No.</Label>
          <Input id="d-vehicle" placeholder="e.g. MH12AB1234" value={form.vehicle_number}
            onChange={(e) => onChange({ ...form, vehicle_number: e.target.value })} disabled={saving} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-driver">Driver Name</Label>
          <Input id="d-driver" placeholder="Driver name" value={form.driver_name}
            onChange={(e) => onChange({ ...form, driver_name: e.target.value })} disabled={saving} />
        </div>
      </div>
      {!isCreate && (
        <div className="space-y-1.5">
          <Label htmlFor="d-status">Status</Label>
          <select id="d-status" value={form.status}
            onChange={(e) => onChange({ ...form, status: e.target.value })}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
            {(dispatch ? statusOptions(currentStatus ?? dispatch.status, dispatch) : [currentStatus ?? form.status]).map(s => (
              <option key={s} value={s} disabled={s === (currentStatus ?? dispatch?.status)}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          {currentStatus && (
            <p className="text-[11px] text-muted-foreground">Only valid status changes from <strong>{currentStatus}</strong> are listed.</p>
          )}
        </div>
      )}
      {/* Receipt linkage */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="d-receipt">Receipt <span className="text-xs text-muted-foreground">(required to complete)</span></Label>
          {form.receipt_id && (
            <button type="button"
              className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50 flex items-center gap-0.5"
              onClick={() => onChange({ ...form, receipt_id: null, receipt_number: "" })}
              disabled={saving}>
              <X className="size-3" /> Clear
            </button>
          )}
        </div>
        <SearchCombobox<ReceiptOption>
          value={form.receipt_number}
          placeholder="Search receipt (RCP-…)…"
          disabled={saving}
          fetcher={async (q) => {
            const search = q.trim() ? `&search=${encodeURIComponent(q.trim())}` : "";
            return apiFetchJson<ReceiptOption[]>(`/api/v1/receipts/dispatchable?limit=50${search}`);
          }}
          getItemKey={(r) => r.id}
          getItemLabel={(r) => r.receipt_number}
          onSelect={(r) => { void applyReceipt(r); }}
          emptyText="No dispatchable receipts found"
          renderItem={(r) => (
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-mono text-sm font-medium">{r.receipt_number}</span>
              {r.request_sn_no && (
                <span className="truncate text-xs text-muted-foreground">{r.request_sn_no}</span>
              )}
            </div>
          )}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="d-notes">Notes</Label>
        <textarea id="d-notes" rows={2} placeholder="Remarks…" value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })} disabled={saving}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

// ── Inventory Combobox ────────────────────────────────────────────────────────

type InvItem = { id: number; name: string; code: string };

function DispatchInvCombobox({ invType, value, disabled, onSelect }: {
  invType: string;
  value: string;
  disabled: boolean;
  onSelect: (name: string, id: number) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<InvItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handler(e: PointerEvent) {
      const target = e.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setQuery(value); }, [value]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setResults([]); }, [invType]);

  const doSearch = useCallback((q: string) => {
    if (!invType) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const qs = q.trim() ? `&search=${encodeURIComponent(q)}` : "";
        let invItems: InvItem[] = [];
        if (["raw_material", "finished_good", "semi_finished", "scrap"].includes(invType)) {
          const d = await apiFetchJson<{ items: { id: number; code: string; name: string }[] }>(
            `/api/v1/inventory?page_size=12&include_inactive=false&item_type=${encodeURIComponent(invType)}${qs}`
          );
          invItems = d.items.map(i => ({ id: i.id, code: i.code, name: i.name }));
        } else if (invType === "weeder") {
          const d = await apiFetchJson<{ items: { id: number; sn_no: string | null; name: string | null }[] }>(
            `/api/v1/weeders?page_size=12${qs}`
          );
          invItems = d.items.map(w => ({ id: w.id, code: w.sn_no ?? "", name: w.name ?? w.sn_no ?? "—" }));
        } else if (invType === "attachment") {
          const d = await apiFetchJson<{ items: { id: number; sn_no: string | null; description: string | null }[] }>(
            `/api/v1/attachments?page_size=12${qs}`
          );
          invItems = d.items.map(a => ({ id: a.id, code: a.sn_no ?? "", name: a.description ?? a.sn_no ?? "—" }));
        } else if (invType === "consumable") {
          const d = await apiFetchJson<{ items: { id: number; code: string | null; name: string }[] }>(
            `/api/v1/consumables?page_size=12${qs}`
          );
          invItems = d.items.map(c => ({ id: c.id, code: c.code ?? "", name: c.name }));
        } else if (invType === "spare") {
          const qParam = q.trim() ? `&q=${encodeURIComponent(q)}` : "";
          const variants = await apiFetchJson<{
            variant_id: number; item_name: string;
            variant_color: string | null; serial_number: string | null; part_number: string | null;
          }[]>(`/api/v1/spares/variants/search?limit=12${qParam}`);
          invItems = variants.map(v => {
            const label = [v.variant_color, v.serial_number].filter(Boolean).join(" / ");
            return { id: v.variant_id, code: v.part_number ?? "", name: label ? `${v.item_name} — ${label}` : v.item_name };
          });
        }
        setResults(invItems);
      } catch { /* ignore */ }
      finally { setBusy(false); }
    }, q.trim() ? 300 : 0);
  }, [invType]);

  return (
    <div className="relative" ref={rootRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-8"
          placeholder="Search items…"
          value={query}
          disabled={disabled}
          onFocus={() => { setOpen(true); doSearch(query); }}
          onChange={e => { setQuery(e.target.value); doSearch(e.target.value); setOpen(true); }}
        />
        {busy && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-[200] w-full rounded-md border bg-popover shadow-lg mt-1 max-h-48 overflow-y-auto">
          {results.map(item => (
            <button key={item.id} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
              onMouseDown={() => { onSelect(item.name, item.id); setQuery(item.name); setOpen(false); }}>
              <span className="flex-1 truncate">{item.name}</span>
              {item.code && <span className="text-xs text-muted-foreground shrink-0">{item.code}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
