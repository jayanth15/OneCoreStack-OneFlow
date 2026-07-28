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
import { PackageCheck, Plus, Search, Pencil, Minus, Printer, Trash2 } from "lucide-react";
import { openPrintWindow } from "@/lib/print-report";

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
  request_id: number | null;
  request_sn_no: string | null;
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
  request_id: number | null;
  request_sn_no: string;
  receipt_id: number | null;
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
interface AvailableRequest { id: number; sn_no: string; request_type: string; status: string; requested_by_username: string | null; }
interface ReceiptOption { id: number; receipt_number: string; request_id: number; request_sn_no: string | null; status: string; }

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-warning/15 text-warning",
  dispatched: "bg-primary/10 text-primary",
  delivered:  "bg-success/10 text-success",
  cancelled:  "bg-destructive/10 text-destructive",
};
const STATUSES = ["pending", "dispatched", "delivered", "cancelled"];

const DISPATCH_INV_TYPES = [
  { value: "finished_good", label: "Finished Goods" },
  { value: "weeder",        label: "Weeder" },
  { value: "attachment",    label: "Attachment" },
  { value: "spare",         label: "Spares" },
  { value: "consumable",    label: "Consumable" },
];

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
    request_id: null,
    request_sn_no: "",
    receipt_id: null,
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
  const [receipts, setReceipts] = useState<ReceiptOption[]>([]);

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
  const [availableRequests, setAvailableRequests] = useState<AvailableRequest[]>([]);
  const adminUser = isAdminOrAbove();
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  function loadAvailableRequests(excludeDispatchId?: number) {
    const query = excludeDispatchId ? "?exclude_dispatch_id=" + excludeDispatchId : "";
    apiFetchJson<AvailableRequest[]>("/api/v1/dispatch/available-requests" + query)
      .then(setAvailableRequests)
      .catch(() => setAvailableRequests([]));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [search, statusFilter]);

  useEffect(() => {
    apiFetchJson<CompanyInfo>("/api/v1/settings/company").then(setCompanyInfo).catch(() => {});
    apiFetchJson<NameOption[]>("/api/v1/vendors/names").then(setVendors).catch(() => {});
    apiFetchJson<ReceiptOption[]>("/api/v1/receipts?limit=500").then(setReceipts).catch(() => setReceipts([]));
    loadAvailableRequests();
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
      request_id: form.request_id,
      request_sn_no: form.request_sn_no || null,
      receipt_id: form.party_type === "supplier" ? form.receipt_id : null,
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
      setShowCreate(false); setCreateForm(BLANK_FORM()); load(); loadAvailableRequests();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally { setCreateSaving(false); }
  }

  function openEdit(d: Dispatch) {
    loadAvailableRequests(d.id);
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
      request_id: d.request_id,
      request_sn_no: d.request_sn_no ?? "",
      receipt_id: d.receipt_id,
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
      setEditTarget(null); load(); loadAvailableRequests();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update");
    } finally { setEditSaving(false); }
  }

  async function handleStatusChange(dispatchId: number, newStatus: string) {
    setStatusUpdatingId(dispatchId);
    try {
      await apiFetchJson(`/api/v1/dispatch/${dispatchId}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      setItems(prev => prev.map(item =>
        item.id === dispatchId ? { ...item, status: newStatus } : item
      ));
    } catch {
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
            <Button size="sm" onClick={() => { loadAvailableRequests(); setCreateForm(BLANK_FORM()); setCreateError(null); setShowCreate(true); }}>
              <Plus className="size-4 mr-1.5" />New Dispatch
            </Button>
          </>
        }
      />

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Dispatch</DialogTitle></DialogHeader>
          <DispatchForm form={createForm} vendors={vendors} receipts={receipts} saving={createSaving}
            error={createError} onChange={setCreateForm} onSubmit={handleCreate} isCreate
            availableRequests={availableRequests} />
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
          <DispatchForm form={editForm} vendors={vendors} receipts={receipts} saving={editSaving}
            error={editError} onChange={setEditForm} onSubmit={handleEdit} isCreate={false}
            availableRequests={availableRequests} />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editSaving}>Cancel</Button>
            <Button disabled={editSaving} onClick={handleEdit}>
              {editSaving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="p-4 md:p-6 max-w-5xl mx-auto">
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
                        {STATUSES.map(s => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
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
                      {d.party_type === "vendor" && d.request_sn_no && <span>Request: {d.request_sn_no}</span>}
                      {d.party_type === "supplier" && d.receipt_number && <span>Receipt: {d.receipt_number}</span>}
                    </div>
                    {d.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{d.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => printDispatch(d)}>
                      <Printer className="size-3.5" />
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
  form, vendors, receipts, saving, error, onChange, onSubmit, isCreate, availableRequests,
}: {
  form: DispatchFormState;
  vendors: NameOption[];
  receipts: ReceiptOption[];
  saving: boolean;
  error: string | null;
  onChange: (f: DispatchFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  isCreate: boolean;
  availableRequests: AvailableRequest[];
}) {
  const requestItemsLocked = form.request_id !== null;

  function updateItem(key: string, patch: Partial<DispatchItemForm>) {
    onChange({ ...form, items: form.items.map(i => i._key === key ? { ...i, ...patch } : i) });
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
            onClick={addItem} disabled={saving || requestItemsLocked}>
            <Plus className="size-3" /> Add Item
          </Button>
        </div>
        {requestItemsLocked && (
          <p className="text-xs text-muted-foreground">
            Items are filled from the selected request and cannot be changed in dispatch.
          </p>
        )}
        {form.items.map((item, idx) => (
          <div key={item._key} className="rounded-lg border p-3 space-y-2 bg-muted/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
              {form.items.length > 1 && !requestItemsLocked && (
                <Button type="button" size="icon" variant="ghost"
                  className="size-6 text-destructive hover:text-destructive"
                  onClick={() => removeItem(item._key)} disabled={saving}>
                  <Minus className="size-3.5" />
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Inventory Type <span className="text-destructive">*</span></Label>
              <select value={item.inv_type}
                onChange={(e) => updateItem(item._key, { inv_type: e.target.value, inv_item_id: null, item_name: "" })}
                disabled={saving || requestItemsLocked}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                <option value="">— Select type —</option>
                {DISPATCH_INV_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {item.inv_type ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Item <span className="text-destructive">*</span></Label>
                <DispatchInvCombobox
                  invType={item.inv_type}
                  value={item.item_name}
                  disabled={saving || requestItemsLocked}
                  onSelect={(name, id) => updateItem(item._key, { item_name: name, inv_item_id: id })}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Item name</Label>
                <Input placeholder="Select type above to search items" value={item.item_name}
                  onChange={(e) => updateItem(item._key, { item_name: e.target.value })} disabled={saving || requestItemsLocked} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity</Label>
                <Input type="number" step="any" placeholder="0" value={item.quantity}
                  onChange={(e) => updateItem(item._key, { quantity: e.target.value })} disabled={saving || requestItemsLocked} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unit</Label>
                <Input placeholder="pcs / kg" value={item.unit}
                  onChange={(e) => updateItem(item._key, { unit: e.target.value })} disabled={saving || requestItemsLocked} />
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
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      )}
      {form.party_type === "supplier" && (
        <div className="space-y-1.5">
          <Label htmlFor="d-receipt">Receipt Number <span className="text-xs text-muted-foreground">(required to complete)</span></Label>
          <select id="d-receipt" value={form.receipt_id ?? ""}
            onChange={(e) => {
              const receipt = receipts.find(r => r.id === Number(e.target.value));
              onChange({ ...form, receipt_id: receipt?.id ?? null, request_id: receipt?.request_id ?? form.request_id, request_sn_no: receipt?.request_sn_no ?? form.request_sn_no });
            }}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
            <option value="">— Select receipt —</option>
            {receipts.map(r => <option key={r.id} value={r.id}>{r.receipt_number}{r.request_sn_no ? ` — ` : ""}</option>)}
          </select>
        </div>
      )}
            <div className="space-y-1.5">
        <Label htmlFor="d-request">Request <span className="text-xs text-muted-foreground">(optional)</span></Label>
        <select id="d-request" value={form.request_id ?? ""}
          onChange={async (e) => {
            const reqId = parseInt(e.target.value);
            if (!reqId) {
              onChange({ ...form, request_id: null, request_sn_no: "" });
              return;
            }
            try {
              const req = await apiFetchJson<{
                id: number; sn_no: string; request_type: string;
                items: { id: number; inventory_item_id: number | null; item_name: string | null; item_code: string | null; item_type: string | null; quantity: number }[];
                dispatch: { customer_name: string | null; inventory_type: string; item_id: number | null; item_sn_no: string | null; item_description: string | null; quantity: number } | null;
              }>(`/api/v1/requests/${reqId}`);
              const d = req.dispatch;
              if (d) {
                const items: DispatchItemForm[] = [{
                  _key: Math.random().toString(36).slice(2),
                  inv_type: d.inventory_type,
                  inv_item_id: d.item_id,
                  item_name: d.item_description || d.item_sn_no || "",
                  quantity: String(d.quantity),
                  unit: "",
                }];
                onChange({
                  ...form,
                  items,
                  notes: d.customer_name ? `Customer: ${d.customer_name}` : form.notes,
                  request_id: req.id,
                  request_sn_no: req.sn_no,
                });
              } else {
                const items: DispatchItemForm[] = req.items.map((item) => ({
                  _key: Math.random().toString(36).slice(2),
                  inv_type: item.item_type || "",
                  inv_item_id: item.inventory_item_id,
                  item_name: item.item_name || item.item_code || "",
                  quantity: String(item.quantity),
                  unit: "",
                }));
                onChange({
                  ...form,
                  items: items.length > 0 ? items : form.items,
                  request_id: req.id,
                  request_sn_no: req.sn_no,
                });
              }
            } catch { /* ignore */ }
          }}
          disabled={saving}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
          <option value="">— None —</option>
          {availableRequests.map(r => (
            <option key={r.id} value={r.id}>
              {r.sn_no} — {r.request_type.replaceAll("_", " ")} · {r.status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
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

  useEffect(() => { setQuery(value); }, [value]);
  useEffect(() => { setResults([]); setQuery(""); }, [invType]);

  const doSearch = useCallback((q: string) => {
    if (!invType) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const qs = q.trim() ? `&search=${encodeURIComponent(q)}` : "";
        let invItems: InvItem[] = [];
        if (invType === "finished_good") {
          const d = await apiFetchJson<{ items: { id: number; code: string; name: string }[] }>(
            `/api/v1/inventory?page_size=12&include_inactive=false&item_type=finished_good${qs}`
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
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-8"
          placeholder="Search items…"
          value={query}
          disabled={disabled}
          onFocus={() => { setOpen(true); doSearch(query); }}
          onChange={e => { setQuery(e.target.value); doSearch(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
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
