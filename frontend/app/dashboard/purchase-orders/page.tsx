"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchCombobox } from "@/components/ui/search-combobox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiFetchJson } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { getCurrentUser, isAdminOrAbove, setCurrentUser } from "@/lib/user";
import { ShoppingCart, Plus, Trash2, PlusCircle, CheckCircle2, Printer, Link2, ClipboardCopy, Pencil } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface POItem {
  id?: number;
  item_name: string;
  quantity: number;
  unit: string;
  rate: number;
  notes: string;
  inventory_type?: string;
  inventory_item_id?: number | null;
}

interface PurchaseOrder {
  id: number;
  po_number: string;
  party_type: string;
  supplier_id: number | null;
  supplier_name: string | null;
  vendor_id: number | null;
  vendor_name: string | null;
  po_date: string | null;
  expected_delivery: string | null;
  notes: string | null;
  status: string;
  total_value: number;
  items: POItem[];
  created_by: string | null;
  created_at: string | null;
  purchase_request_id: number | null;
  purchase_request_number: string | null;
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

interface InventoryItem {
  id: number;
  code: string;
  name: string;
}

type ApiRecord = Record<string, unknown>;

interface PurchaseRequestDetail {
  id: number;
  sn_no: string;
  items?: { item_name?: string | null; quantity: number; unit?: string | null }[];
}

const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-muted text-muted-foreground",
  approved:  "bg-primary/10 text-primary",
  received:  "bg-success/10 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};
const STATUSES = ["draft", "approved", "received", "cancelled"];

const INVENTORY_TYPES = [
  "raw_material",
  "finished_good",
  "semi_finished",
  "spare",
  "consumable",
  "attachment",
  "weeder",
] as const;

const INVENTORY_LABELS: Record<string, string> = {
  raw_material: "Raw materials",
  finished_good: "Finished goods",
  semi_finished: "Semi-finished",
  spare: "Spares",
  consumable: "Consumables",
  attachment: "Attachments",
  weeder: "Weeders",
};

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0;
}

function itemRows(data: unknown): ApiRecord[] {
  if (!data || typeof data !== "object" || !("items" in data)) return [];
  const rows = (data as { items?: unknown }).items;
  return Array.isArray(rows) ? rows.filter((row): row is ApiRecord => !!row && typeof row === "object") : [];
}

function permittedInventoryTypes() {
  const user = getCurrentUser();
  if (!user || user.role === "admin" || user.role === "super_admin") return [...INVENTORY_TYPES];
  if (!user.inventory_access || user.inventory_access.length === 0) return [...INVENTORY_TYPES];
  return INVENTORY_TYPES.filter((type) => user.inventory_access.includes(type));
}

async function fetchInventoryItems(type: string, q: string): Promise<InventoryItem[]> {
  const searchParam = q.trim() ? `&search=${encodeURIComponent(q.trim())}` : "";
  const qParam = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";

  switch (type) {
    case "raw_material":
    case "finished_good":
    case "semi_finished": {
      const data = await apiFetchJson<unknown>(
        `/api/v1/inventory?item_type=${type}&page_size=50&include_inactive=false${searchParam}`,
      );
      return itemRows(data).map((i) => ({ id: numberValue(i.id), code: textValue(i.code), name: textValue(i.name) }));
    }
    case "spare": {
      const data = await apiFetchJson<ApiRecord[]>(`/api/v1/spares/variants/search?limit=50${qParam}`);
      return (data || []).map((v) => ({
        id: numberValue(v.variant_id),
        code: textValue(v.part_number) || textValue(v.serial_number),
        name: textValue(v.item_name),
      }));
    }
    case "consumable": {
      const data = await apiFetchJson<unknown>(`/api/v1/consumables?page_size=50${searchParam}`);
      return itemRows(data).map((i) => ({ id: numberValue(i.id), code: textValue(i.code), name: textValue(i.name) }));
    }
    case "attachment": {
      const data = await apiFetchJson<unknown>(`/api/v1/attachments?page_size=50${searchParam}`);
      return itemRows(data).map((i) => ({
        id: numberValue(i.id),
        code: textValue(i.sn_no),
        name: textValue(i.description) || textValue(i.sn_no),
      }));
    }
    case "weeder": {
      const data = await apiFetchJson<unknown>(`/api/v1/weeders?page_size=50${searchParam}`);
      return itemRows(data).map((i) => ({
        id: numberValue(i.id),
        code: textValue(i.sn_no),
        name: textValue(i.name) || textValue(i.sn_no),
      }));
    }
    default:
      return [];
  }
}

const BLANK_ITEM = (): POItem => ({
  item_name: "",
  quantity: 1,
  unit: "",
  rate: 0,
  notes: "",
  inventory_type: permittedInventoryTypes()[0] ?? "raw_material",
  inventory_item_id: null,
});
const BLANK_FORM = () => ({
  po_number: "",
  party_type: "supplier" as "supplier" | "vendor",
  supplier_name: "", vendor_name: "",
  po_date: "", expected_delivery: "", notes: "", status: "draft",
  items: [BLANK_ITEM()],
  purchase_request_id: null as number | null,
  purchase_request_number: "",
});

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    Promise.resolve().then(async () => {
      const user = getCurrentUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      if (isAdminOrAbove() || user.purchase_access) return;

      const token = getAccessToken();
      if (!token) {
        router.replace("/login");
        return;
      }
      const meRes = await fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!meRes.ok) {
        router.replace("/dashboard");
        return;
      }
      const me = await meRes.json();
      setCurrentUser({
        id: me.id,
        username: me.username,
        role: me.role,
        inventory_access: me.inventory_access ?? [],
        inventory_edit: me.inventory_edit ?? [],
        request_departments: me.request_departments ?? [],
        request_inventory: me.request_inventory ?? [],
        grn_access: me.grn_access ?? false,
        dispatch_access: me.dispatch_access ?? false,
        gate_pass_access: me.gate_pass_access ?? false,
        purchase_access: me.purchase_access ?? false,
        photo_base64: me.photo_base64 ?? null,
        department_codes: me.department_codes ?? [],
        department_names: me.department_names ?? [],
      });
      if (me.role !== "admin" && me.role !== "super_admin" && !me.purchase_access) {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [suppliers, setSuppliers] = useState<NameOption[]>([]);
  const [vendors, setVendors] = useState<NameOption[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(BLANK_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [viewTarget, setViewTarget] = useState<PurchaseOrder | null>(null);
  const [editTarget, setEditTarget] = useState<PurchaseOrder | null>(null);
  const [editForm, setEditForm] = useState(BLANK_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [statusChangingId, setStatusChangingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const adminUser = isAdminOrAbove();

  const [purchaseRequests, setPurchaseRequests] = useState<{
    id: number; sn_no: string; item_name: string | null;
    items: { item_name: string | null; quantity: number; }[];
  }[]>([]);
  const [showFromRequest, setShowFromRequest] = useState(false);
  const [selectedPR, setSelectedPR] = useState<string>("");
  const [loadingPR, setLoadingPR] = useState(false);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status_filter", statusFilter);
    params.set("page_size", "100");
    apiFetchJson<{ items: PurchaseOrder[]; total: number }>(`/api/v1/purchase-orders?${params}`)
      .then(r => { setOrders(r.items); setTotal(r.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    Promise.resolve().then(() => load());
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiFetchJson<CompanyInfo>("/api/v1/settings/company").then(setCompanyInfo).catch(() => {});
    apiFetchJson<NameOption[]>("/api/v1/suppliers/names").then(setSuppliers).catch(() => {});
    apiFetchJson<NameOption[]>("/api/v1/vendors/names").then(setVendors).catch(() => {});
    apiFetchJson<{ id: number; sn_no: string; item_name: string | null; items: { item_name: string | null; quantity: number }[] }[]>(
      "/api/v1/requests?request_type=vendor_purchase&status=approved&limit=100"
    ).then(setPurchaseRequests).catch(() => {});
  }, []);

  function buildPayload(form: ReturnType<typeof BLANK_FORM>) {
    const supplier = suppliers.find(s => s.name === form.supplier_name);
    const vendor = vendors.find(v => v.name === form.vendor_name);
    return {
      po_number: form.po_number || null,
      party_type: form.party_type,
      supplier_id: form.party_type === "supplier" ? (supplier?.id ?? null) : null,
      supplier_name: form.party_type === "supplier" ? form.supplier_name || null : null,
      vendor_id: form.party_type === "vendor" ? (vendor?.id ?? null) : null,
      vendor_name: form.party_type === "vendor" ? form.vendor_name || null : null,
      po_date: form.po_date || null,
      expected_delivery: form.expected_delivery || null,
      notes: form.notes || null,
      status: form.status,
      purchase_request_id: form.purchase_request_id,
      purchase_request_number: form.purchase_request_number || null,
      items: form.items.map(it => ({
        item_name: it.item_name,
        quantity: Number(it.quantity) || 0,
        unit: it.unit || null,
        rate: Number(it.rate) || 0,
        notes: it.notes || null,
      })),
    };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const invalid = createForm.items.some(it => !it.item_name.trim());
    if (invalid) { setCreateError("All items must have a name"); return; }
    setCreateSaving(true); setCreateError(null);
    try {
      await apiFetchJson("/api/v1/purchase-orders", { method: "POST", body: JSON.stringify(buildPayload(createForm)) });
      setShowCreate(false); setCreateForm(BLANK_FORM()); load();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally { setCreateSaving(false); }
  }

  function openEdit(po: PurchaseOrder) {
    setEditTarget(po);
    setEditForm({
      po_number: po.po_number ?? "",
      party_type: (po.party_type as "supplier" | "vendor") ?? (po.vendor_name ? "vendor" : "supplier"),
      supplier_name: po.supplier_name ?? "",
      vendor_name: po.vendor_name ?? "",
      po_date: po.po_date ?? "",
      expected_delivery: po.expected_delivery ?? "",
      notes: po.notes ?? "",
      status: po.status,
      items: po.items.length > 0 ? po.items.map(i => ({
        item_name: i.item_name,
        quantity: i.quantity,
        unit: i.unit ?? "",
        rate: i.rate ?? 0,
        notes: i.notes ?? "",
        inventory_type: permittedInventoryTypes()[0] ?? "raw_material",
        inventory_item_id: null,
      })) : [BLANK_ITEM()],
      purchase_request_id: po.purchase_request_id,
      purchase_request_number: po.purchase_request_number ?? "",
    });
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const invalid = editForm.items.some(it => !it.item_name.trim());
    if (invalid) { setEditError("All items must have a name"); return; }
    setEditSaving(true); setEditError(null);
    try {
      await apiFetchJson(`/api/v1/purchase-orders/${editTarget.id}`, { method: "PUT", body: JSON.stringify(buildPayload(editForm)) });
      setEditTarget(null); load();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update");
    } finally { setEditSaving(false); }
  }

  async function changeStatus(id: number, newStatus: string) {
    setStatusChangingId(id);
    try {
      const updated = await apiFetchJson<PurchaseOrder>(`/api/v1/purchase-orders/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      setViewTarget((current) => (current?.id === id ? updated : current));
      load();
    } catch {
      // silent
    } finally { setStatusChangingId(null); }
  }

  async function seedFromPR(prId: number) {
    setLoadingPR(true);
    try {
      const prDetail = await apiFetchJson<PurchaseRequestDetail>(`/api/v1/purchase-requests/${prId}`);
      const prItems = (prDetail.items || []).map((i) => ({
        item_name: i.item_name ?? "",
        quantity: i.quantity,
        unit: i.unit ?? "",
        rate: 0,
        notes: "",
        inventory_type: permittedInventoryTypes()[0] ?? "raw_material",
        inventory_item_id: null,
      }));
      setCreateForm(f => ({
        ...f,
        items: prItems.length > 0 ? prItems : [{ item_name: "", quantity: 1, unit: "", rate: 0, notes: "" }],
        purchase_request_id: prDetail.id,
        purchase_request_number: prDetail.sn_no,
      }));
      setShowCreate(true);
    } catch {
      setCreateForm(f => ({ ...f, items: [{ item_name: "", quantity: 1, unit: "", rate: 0, notes: "" }] }));
      setShowCreate(true);
    } finally {
      setLoadingPR(false);
    }
  }

  async function applyFromRequest() {
    const prId = parseInt(selectedPR);
    if (!prId) return;
    await seedFromPR(prId);
    setShowFromRequest(false);
    setSelectedPR("");
  }

  // Auto-open create dialog when arriving from a PR's "Create PO" button
  useEffect(() => {
    const fromPr = searchParams.get("from_pr");
    if (!fromPr) return;
    const prId = parseInt(fromPr);
    if (!prId) return;
    (async () => {
      await seedFromPR(prId);
      router.replace("/dashboard/purchase-orders");
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function deletePurchaseOrder(po: PurchaseOrder) {
    if (!window.confirm(`Delete purchase order ${po.po_number}? This action is restricted to admins.`)) return;
    setDeletingId(po.id);
    try {
      await apiFetchJson(`/api/v1/purchase-orders/${po.id}`, { method: "DELETE" });
      setViewTarget(null);
      load();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to delete purchase order");
    } finally {
      setDeletingId(null);
    }
  }

  function printPurchaseOrder(po: PurchaseOrder) {
    const partyName = po.party_type === "vendor" ? po.vendor_name : po.supplier_name;
    const partyLabel = po.party_type === "vendor" ? "Vendor" : "Supplier";
    const win = window.open("", "_blank", "width=800,height=700");
    if (!win) return;
    const co = companyInfo;
    const coHtml = (co && co.company_name) ? `
      <div style="text-align:center;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #333;">
        <h1 style="margin:0;font-size:20px;font-weight:bold;">${co.company_name}</h1>
        <p style="margin:4px 0;">${[co.company_address, co.company_city, co.company_state].filter(Boolean).join(', ')}${co.company_pincode ? ' - ' + co.company_pincode : ''}</p>
        <p style="margin:2px 0;font-size:12px;">
          ${[co.company_phone ? `Phone: ${co.company_phone}` : '', co.company_email ? `Email: ${co.company_email}` : '', co.company_gstin ? `GST: ${co.company_gstin}` : ''].filter(Boolean).join(' | ')}
        </p>
      </div>` : '';
    win.document.write(`<!DOCTYPE html><html><head><title>Purchase Order — ${po.po_number}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; margin: 24px; color: #111; }
  h2 { margin: 0 0 4px; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  .row { display: flex; gap: 32px; margin-bottom: 8px; }
  .lbl { color: #666; font-size: 11px; }
  tfoot td { font-weight: 600; background: #f9f9f9; }
  @media print { body { margin: 0; } }
</style></head><body>
${coHtml}
<h2>Purchase Order — ${po.po_number}</h2>
<p style="color:#666;font-size:11px">Generated on ${new Date().toLocaleString("en-IN")}</p>
<div class="row">
  <div><div class="lbl">${partyLabel}</div><div>${partyName ?? "—"}</div></div>
  <div><div class="lbl">Status</div><div>${po.status}</div></div>
  ${po.po_date ? `<div><div class="lbl">PO Date</div><div>${po.po_date}</div></div>` : ""}
  ${po.expected_delivery ? `<div><div class="lbl">Expected Delivery</div><div>${po.expected_delivery}</div></div>` : ""}
  ${po.purchase_request_number ? `<div><div class="lbl">Linked PR</div><div>${po.purchase_request_number}</div></div>` : ""}
</div>
<table>
  <thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Unit</th><th>Rate (₹)</th><th>Amount (₹)</th><th>Notes</th></tr></thead>
  <tbody>
    ${po.items.map((it, i) => `<tr>
      <td>${i + 1}</td><td>${it.item_name}</td><td>${it.quantity}</td><td>${it.unit ?? ""}</td>
      <td>${it.rate > 0 ? it.rate.toFixed(2) : "—"}</td>
      <td>${it.rate > 0 ? (it.quantity * it.rate).toLocaleString("en-IN") : "—"}</td>
      <td>${it.notes ?? ""}</td>
    </tr>`).join("")}
  </tbody>
  ${po.total_value > 0 ? `<tfoot><tr><td colspan="5" style="text-align:right">Total</td><td>₹${po.total_value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td><td></td></tr></tfoot>` : ""}
</table>
${po.notes ? `<p style="margin-top:12px"><strong>Notes:</strong> ${po.notes}</p>` : ""}
<p style="margin-top:16px;font-size:11px;color:#666">Created by: ${po.created_by ?? "—"}</p>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        breadcrumbs={[{ label: "Purchase Orders" }]}
        actions={
          <>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">All statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={() => { setSelectedPR(""); setShowFromRequest(true); }}>
              <ClipboardCopy className="size-4 mr-1.5" />From Request
            </Button>
            <Button size="sm" onClick={() => { setCreateForm(BLANK_FORM()); setCreateError(null); setShowCreate(true); }}>
              <Plus className="size-4 mr-1.5" />New PO
            </Button>
          </>
        }
      />

      {/* From Request Dialog */}
      <Dialog open={showFromRequest} onOpenChange={setShowFromRequest}>
        <DialogContent className="w-full sm:max-w-sm">
          <DialogHeader><DialogTitle>Create PO from Purchase Request</DialogTitle></DialogHeader>
          <div className="px-4 pb-2 space-y-3">
            <div className="space-y-1.5">
              <Label>Select Approved Purchase Request</Label>
              <select value={selectedPR}
                onChange={(e) => setSelectedPR(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">— Select request —</option>
                {(purchaseRequests ?? []).map(pr => (
                  <option key={pr.id} value={pr.id}>
                    {pr.sn_no}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="px-4 gap-2">
            <Button variant="outline" onClick={() => setShowFromRequest(false)}>Cancel</Button>
            <Button disabled={!selectedPR || loadingPR} onClick={applyFromRequest}>
              {loadingPR ? "Loading…" : "Use Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <POForm form={createForm} suppliers={suppliers} vendors={vendors} saving={createSaving} error={createError}
            onChange={setCreateForm} onSubmit={handleCreate} isCreate purchaseRequests={purchaseRequests}
            onPurchaseRequestSelect={seedFromPR} />
          <DialogFooter className="px-4 gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={createSaving}>Cancel</Button>
            <Button disabled={createSaving} onClick={handleCreate}>
              {createSaving ? "Creating…" : "Create Purchase Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => { if (!o) setViewTarget(null); }}>
        <DialogContent className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-violet-600" />
              {viewTarget?.po_number}
            </DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="px-4 pb-2 space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><p className="text-xs text-muted-foreground">Status</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[viewTarget.status] ?? "bg-muted text-muted-foreground"}`}>{viewTarget.status}</span>
                </div>
                {(viewTarget.supplier_name || viewTarget.vendor_name) && (
                  <div><p className="text-xs text-muted-foreground">{viewTarget.party_type === "vendor" ? "Vendor" : "Supplier"}</p>
                    <p className="font-medium">{viewTarget.party_type === "vendor" ? viewTarget.vendor_name : viewTarget.supplier_name}</p>
                  </div>
                )}
                {viewTarget.po_date && <div><p className="text-xs text-muted-foreground">PO Date</p><p className="font-medium">{viewTarget.po_date}</p></div>}
                {viewTarget.expected_delivery && <div><p className="text-xs text-muted-foreground">Expected Delivery</p><p className="font-medium">{viewTarget.expected_delivery}</p></div>}
                {viewTarget.total_value > 0 && <div><p className="text-xs text-muted-foreground">Total Value</p><p className="font-semibold text-tone-violet">₹{viewTarget.total_value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p></div>}
                {viewTarget.purchase_request_number && (
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Link2 className="size-3" />Linked PR</p>
                    <p className="font-medium text-primary">{viewTarget.purchase_request_number}</p>
                  </div>
                )}
                {viewTarget.notes && <div className="col-span-2"><p className="text-xs text-muted-foreground">Notes</p><p className="font-medium">{viewTarget.notes}</p></div>}
              </div>
              {viewTarget.items.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Items ({viewTarget.items.length})</p>
                  <div className="space-y-2">
                    {viewTarget.items.map((item, idx) => (
                      <div key={idx} className="rounded-lg border bg-muted/40 p-3">
                        <p className="text-sm font-medium">{item.item_name}</p>
                        <div className="flex gap-4 text-xs text-muted-foreground mt-0.5">
                          <span>Qty: {item.quantity}{item.unit ? ` ${item.unit}` : ""}</span>
                          {item.rate > 0 && <span>Rate: ₹{item.rate}</span>}
                          {item.rate > 0 && <span>= ₹{(item.quantity * item.rate).toLocaleString("en-IN")}</span>}
                        </div>
                        {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Update status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((status) => (
                    <Button
                      key={status}
                      type="button"
                      size="sm"
                      variant={viewTarget.status === status ? "default" : "outline"}
                      disabled={statusChangingId === viewTarget.id || viewTarget.status === status}
                      onClick={() => changeStatus(viewTarget.id, status)}
                    >
                      <CheckCircle2 className="size-3.5 mr-1.5" />
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Button>
                  ))}
                </div>
                {viewTarget.purchase_request_number && viewTarget.status === "received" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Linked purchase request {viewTarget.purchase_request_number} is marked received when this PO is received.
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="px-4 gap-2">
            <Button variant="outline" onClick={() => { if (viewTarget) { openEdit(viewTarget); setViewTarget(null); } }}>
              <Pencil className="size-3.5 mr-1.5" />Edit
            </Button>
            <Button variant="outline" onClick={() => viewTarget && printPurchaseOrder(viewTarget)}>
              <Printer className="size-3.5 mr-1.5" />Print
            </Button>
            {adminUser && viewTarget && (
              <Button
                variant="destructive"
                onClick={() => deletePurchaseOrder(viewTarget)}
                disabled={deletingId === viewTarget.id}
              >
                <Trash2 className="size-3.5 mr-1.5" />Delete
              </Button>
            )}
            <Button onClick={() => setViewTarget(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Purchase Order</DialogTitle></DialogHeader>
          <POForm form={editForm} suppliers={suppliers} vendors={vendors} saving={editSaving} error={editError}
            onChange={setEditForm} onSubmit={handleEdit} isCreate={false} purchaseRequests={purchaseRequests} />
          <DialogFooter className="px-4 gap-2">
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
            <strong className="text-foreground">{total}</strong> order{total !== 1 ? "s" : ""}
          </p>
        )}
        {loading && <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>}
        {!loading && orders.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <ShoppingCart className="size-12 mx-auto mb-3 opacity-20" />
            <p className="mb-4">No purchase orders found.</p>
            <Button size="sm" onClick={() => { setCreateForm(BLANK_FORM()); setCreateError(null); setShowCreate(true); }}>
              <Plus className="size-4 mr-1.5" />Create First PO
            </Button>
          </div>
        )}
        {!loading && orders.length > 0 && (
          <div className="space-y-3">
            {orders.map((po) => (
              <button
                key={po.id}
                type="button"
                onClick={() => setViewTarget(po)}
                className="w-full rounded-xl border bg-card p-4 flex items-start gap-4 text-left transition-colors hover:bg-muted"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-tone-violet/10 text-tone-violet shrink-0">
                  <ShoppingCart className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-sm">{po.po_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[po.status] ?? "bg-muted text-muted-foreground"}`}>
                      {po.status}
                    </span>
                  </div>
                  {(po.supplier_name || po.vendor_name) && (
                    <p className="text-sm font-medium mt-0.5">
                      {po.party_type === "vendor" ? `Vendor: ${po.vendor_name}` : `Supplier: ${po.supplier_name}`}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-0 text-xs text-muted-foreground mt-1">
                    <span>{po.items.length} item{po.items.length !== 1 ? "s" : ""}</span>
                    {po.total_value > 0 && <span>Total: ₹{po.total_value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>}
                    {po.po_date && <span>PO Date: {po.po_date}</span>}
                    {po.expected_delivery && <span>Delivery: {po.expected_delivery}</span>}
                  </div>
                  {po.items.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {po.items.map(i => i.item_name).join(", ")}
                    </p>
                  )}
                  {po.purchase_request_number && (
                    <p className="text-xs text-primary mt-0.5">PR: {po.purchase_request_number}</p>
                  )}
                  {po.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{po.notes}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

function POForm({ form, suppliers, vendors, saving, error, onChange, onSubmit, isCreate, purchaseRequests, onPurchaseRequestSelect }: {
  form: ReturnType<typeof BLANK_FORM>;
  suppliers: NameOption[];
  vendors: NameOption[];
  saving: boolean;
  error: string | null;
  onChange: (f: ReturnType<typeof BLANK_FORM>) => void;
  onSubmit: (e: React.FormEvent) => void;
  isCreate: boolean;
  purchaseRequests?: { id: number; sn_no: string; item_name: string | null }[];
  onPurchaseRequestSelect?: (id: number) => Promise<void>;
}) {
  function updateItem(idx: number, field: keyof POItem, value: string | number) {
    const newItems = form.items.map((it, i) => i === idx ? { ...it, [field]: value } : it);
    onChange({ ...form, items: newItems });
  }
  const inventoryTypes = permittedInventoryTypes();
  const itemsLockedByPurchaseRequest = Boolean(form.purchase_request_id);
  function addItem() { onChange({ ...form, items: [...form.items, BLANK_ITEM()] }); }
  function removeItem(idx: number) {
    if (form.items.length === 1) return;
    onChange({ ...form, items: form.items.filter((_, i) => i !== idx) });
  }

  const total = form.items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0);

  return (
    <form onSubmit={onSubmit} className="px-4 space-y-4">
      <div className="space-y-1.5">
        <Label>Party Type</Label>
        <div className="flex gap-2">
          <button type="button"
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${form.party_type === "supplier" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-input hover:bg-muted"}`}
            onClick={() => onChange({ ...form, party_type: "supplier", vendor_name: "" })}
            disabled={saving}>
            Supplier
          </button>
          <button type="button"
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${form.party_type === "vendor" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-input hover:bg-muted"}`}
            onClick={() => onChange({ ...form, party_type: "vendor", supplier_name: "" })}
            disabled={saving}>
            Vendor (OEM)
          </button>
        </div>
      </div>
      {form.party_type === "supplier" ? (
        <div className="space-y-1.5">
          <Label htmlFor="po-supplier">Supplier</Label>
          <select id="po-supplier" value={form.supplier_name}
            onChange={(e) => onChange({ ...form, supplier_name: e.target.value })} disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
            <option value="">— Select supplier —</option>
            {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="po-vendor">Vendor (OEM)</Label>
          <select id="po-vendor" value={form.vendor_name}
            onChange={(e) => onChange({ ...form, vendor_name: e.target.value })} disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
            <option value="">— Select vendor —</option>
            {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="po-number">PO Number <span className="text-xs text-muted-foreground">(optional)</span></Label>
        <Input
          id="po-number"
          value={form.po_number}
          placeholder="Leave blank to auto-generate"
          onChange={(e) => onChange({ ...form, po_number: e.target.value })}
          disabled={saving}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="po-date">PO Date</Label>
          <Input id="po-date" type="date" value={form.po_date}
            onChange={(e) => onChange({ ...form, po_date: e.target.value })} disabled={saving} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-delivery">Expected Delivery</Label>
          <Input id="po-delivery" type="date" value={form.expected_delivery}
            onChange={(e) => onChange({ ...form, expected_delivery: e.target.value })} disabled={saving} />
        </div>
      </div>
      {!isCreate && (
        <div className="space-y-1.5">
          <Label htmlFor="po-status">Status</Label>
          <select id="po-status" value={form.status}
            onChange={(e) => onChange({ ...form, status: e.target.value })} disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
            {["draft","approved","received","cancelled"].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      )}

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Items <span className="text-destructive">*</span></Label>
          {total > 0 && (
            <span className="text-xs font-semibold text-muted-foreground">
              Total: ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
        <div className="space-y-3">
          {form.items.map((item, idx) => (
            <div key={idx} className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                {form.items.length > 1 && !itemsLockedByPurchaseRequest && (
                  <button type="button" onClick={() => removeItem(idx)} disabled={saving}
                    className="text-destructive hover:text-destructive/80 disabled:opacity-50">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              {!itemsLockedByPurchaseRequest && (
                <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <select
                    value={item.inventory_type ?? inventoryTypes[0] ?? "raw_material"}
                    onChange={(e) => {
                      const newItems = form.items.map((it, i) => (
                        i === idx
                          ? { ...it, inventory_type: e.target.value, inventory_item_id: null, item_name: "" }
                          : it
                      ));
                      onChange({ ...form, items: newItems });
                    }}
                    disabled={saving}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  >
                    {inventoryTypes.map((type) => (
                      <option key={type} value={type}>{INVENTORY_LABELS[type]}</option>
                    ))}
                  </select>
                  <SearchCombobox<InventoryItem>
                    value={item.item_name}
                    placeholder={`Search ${INVENTORY_LABELS[item.inventory_type ?? inventoryTypes[0] ?? "raw_material"].toLowerCase()}...`}
                    fetcher={(q) => fetchInventoryItems(item.inventory_type ?? inventoryTypes[0] ?? "raw_material", q)}
                    getItemKey={(inv) => inv.id}
                    getItemLabel={(inv) => inv.name}
                    onSelect={(inv) => {
                      const newItems = form.items.map((it, i) => (
                        i === idx
                          ? { ...it, item_name: inv.name, inventory_item_id: inv.id, notes: it.notes || inv.code }
                          : it
                      ));
                      onChange({ ...form, items: newItems });
                    }}
                    disabled={saving}
                    emptyText="No matching inventory"
                    renderItem={(inv) => (
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{inv.name}</span>
                        <span className="truncate font-mono text-xs text-muted-foreground">{inv.code || "No code"}</span>
                      </div>
                    )}
                  />
                </div>
              )}
              <Input placeholder="Item name *" value={item.item_name}
                onChange={(e) => updateItem(idx, "item_name", e.target.value)} disabled={saving || itemsLockedByPurchaseRequest} />
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Qty" type="number" step="any" value={item.quantity}
                  onChange={(e) => updateItem(idx, "quantity", e.target.value)} disabled={saving || itemsLockedByPurchaseRequest} />
                <Input placeholder="Unit" value={item.unit}
                  onChange={(e) => updateItem(idx, "unit", e.target.value)} disabled={saving || itemsLockedByPurchaseRequest} />
                <Input placeholder="Rate ₹" type="number" step="any" value={item.rate || ""}
                  onChange={(e) => updateItem(idx, "rate", e.target.value)} disabled={saving} />
              </div>
              <Input placeholder="Notes (optional)" value={item.notes}
                onChange={(e) => updateItem(idx, "notes", e.target.value)} disabled={saving} />
            </div>
          ))}
        </div>
        {!itemsLockedByPurchaseRequest && (
          <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={addItem} disabled={saving}>
            <PlusCircle className="size-3.5 mr-1.5" />Add Item
          </Button>
        )}
        {itemsLockedByPurchaseRequest && (
          <p className="mt-2 text-xs text-muted-foreground">
            Items are locked because this PO is linked to purchase request {form.purchase_request_number}.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="po-notes">Notes</Label>
        <textarea id="po-notes" rows={2} placeholder="Remarks…" value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })} disabled={saving}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
      </div>
      {purchaseRequests && purchaseRequests.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="po-pr">Linked Purchase Request <span className="text-xs text-muted-foreground">(optional)</span></Label>
          <select id="po-pr" value={form.purchase_request_id ?? ""}
            onChange={(e) => {
              const pr = purchaseRequests.find(p => p.id === parseInt(e.target.value));
              if (pr && onPurchaseRequestSelect) {
                void onPurchaseRequestSelect(pr.id);
                return;
              }
              onChange({
                ...form,
                purchase_request_id: null,
                purchase_request_number: "",
                items: [BLANK_ITEM()],
              });
            }}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
            <option value="">— None —</option>
            {(purchaseRequests ?? []).map(pr => (
              <option key={pr.id} value={pr.id}>
                {pr.sn_no}{pr.item_name ? ` — ${pr.item_name}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
