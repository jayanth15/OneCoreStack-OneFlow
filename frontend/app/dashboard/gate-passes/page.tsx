"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser, isAdminOrAbove } from "@/lib/user";
import { ClipboardList, Plus, Search, Eye, MoreVertical, X, Minus, Printer, Link2, Pencil } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GatePassAPIItem {
  id: number;
  item_name: string;
  inv_type: string | null;
  inv_item_id: number | null;
  quantity: number;
  unit: string | null;
}

interface GatePass {
  id: number;
  gate_pass_number: string;
  pass_type: string;
  vendor_name: string | null;
  supplier_name: string | null;
  material: string;
  quantity: number;
  unit: string | null;
  purpose: string | null;
  vehicle_number: string | null;
  date: string | null;
  notes: string | null;
  status: string;
  created_by: string | null;
  created_at: string | null;
  items: GatePassAPIItem[];
  purchase_request_id: number | null;
  purchase_request_number: string | null;
}

interface GPItemForm {
  _key: string;
  inv_type: string;
  inv_item_id: number | null;
  item_name: string;
  quantity: string;
  unit: string;
}

interface GPFormState {
  pass_type: "in" | "out";
  party_type: "vendor" | "supplier";
  vendor_name: string;
  supplier_name: string;
  items: GPItemForm[];
  purpose: string;
  vehicle_number: string;
  date: string;
  notes: string;
  status: string;
  purchase_request_id: number | null;
  purchase_request_number: string;
}

interface NameOption { id: number; name: string; }

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open:   "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-100 text-slate-500",
};

const PASS_TYPE_COLORS: Record<string, string> = {
  out: "bg-amber-100 text-amber-700",
  in:  "bg-blue-100 text-blue-700",
};

const GP_INV_TYPES = [
  { value: "finished_good", label: "Finished Goods" },
  { value: "weeder",        label: "Weeder" },
  { value: "attachment",    label: "Attachment" },
  { value: "spare",         label: "Spares" },
  { value: "consumable",    label: "Consumable" },
  { value: "raw_material",  label: "Raw Material" },
];

function blankGPItem(): GPItemForm {
  return {
    _key: Math.random().toString(36).slice(2),
    inv_type: "", inv_item_id: null, item_name: "", quantity: "", unit: "",
  };
}

function BLANK_FORM(): GPFormState {
  return {
    pass_type: "out",
    party_type: "vendor",
    vendor_name: "", supplier_name: "",
    items: [blankGPItem()],
    purpose: "", vehicle_number: "", date: "", notes: "", status: "open",
    purchase_request_id: null,
    purchase_request_number: "",
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GatePassesPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.replace("/login"); return; }
    if (!isAdminOrAbove() && !user.gate_pass_access) router.replace("/dashboard");
  }, [router]);

  const [passes, setPasses] = useState<GatePass[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [passTypeFilter, setPassTypeFilter] = useState("");
  const [vendors, setVendors] = useState<NameOption[]>([]);
  const [suppliers, setSuppliers] = useState<NameOption[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<GPFormState>(BLANK_FORM());
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<GatePass | null>(null);
  const [editForm, setEditForm] = useState<GPFormState>(BLANK_FORM());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [viewTarget, setViewTarget] = useState<GatePass | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);

  const [purchaseRequests, setPurchaseRequests] = useState<{ id: number; sn_no: string; item_name: string | null }[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (passTypeFilter) params.set("pass_type", passTypeFilter);
    params.set("page_size", "100");
    apiFetchJson<{ items: GatePass[]; total: number }>(`/api/v1/gate-passes?${params}`)
      .then(r => { setPasses(r.items); setTotal(r.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [search, passTypeFilter]);

  useEffect(() => {
    apiFetchJson<NameOption[]>("/api/v1/vendors/names").then(setVendors).catch(() => {});
    apiFetchJson<NameOption[]>("/api/v1/suppliers/names").then(setSuppliers).catch(() => {});
    apiFetchJson<{ items: { id: number; sn_no: string; item_name: string | null }[] }>(
      "/api/v1/purchase-requests?status_filter=approved&page_size=100"
    ).then(r => setPurchaseRequests(r.items)).catch(() => {});
  }, []);

  function buildPayload(form: GPFormState) {
    const vendor = vendors.find(v => v.name === form.vendor_name);
    const supplier = suppliers.find(s => s.name === form.supplier_name);
    const validItems = form.items.filter(it => it.item_name.trim());
    const first = validItems[0];
    return {
      pass_type: form.pass_type,
      vendor_id: form.party_type === "vendor" ? (vendor?.id ?? null) : null,
      vendor_name: form.party_type === "vendor" ? form.vendor_name || null : null,
      supplier_id: form.party_type === "supplier" ? (supplier?.id ?? null) : null,
      supplier_name: form.party_type === "supplier" ? form.supplier_name || null : null,
      material: first?.item_name ?? "",
      quantity: parseFloat(first?.quantity ?? "0") || 0,
      unit: first?.unit || null,
      purpose: form.purpose || null,
      vehicle_number: form.vehicle_number || null,
      date: form.date || null,
      notes: form.notes || null,
      status: form.status,
      purchase_request_id: form.purchase_request_id,
      purchase_request_number: form.purchase_request_number || null,
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
      await apiFetchJson("/api/v1/gate-passes", {
        method: "POST",
        body: JSON.stringify(buildPayload(createForm)),
      });
      setShowCreate(false); setCreateForm(BLANK_FORM()); load();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally { setCreateSaving(false); }
  }

  function openEdit(gp: GatePass) {
    setEditTarget(gp);
    const partyType: "vendor" | "supplier" = gp.supplier_name ? "supplier" : "vendor";
    const formItems: GPItemForm[] =
      gp.items && gp.items.length > 0
        ? gp.items.map(i => ({
            _key: Math.random().toString(36).slice(2),
            inv_type: i.inv_type ?? "",
            inv_item_id: i.inv_item_id,
            item_name: i.item_name,
            quantity: String(i.quantity),
            unit: i.unit ?? "",
          }))
        : [{ ...blankGPItem(), item_name: gp.material || "", quantity: String(gp.quantity), unit: gp.unit ?? "" }];
    setEditForm({
      pass_type: (gp.pass_type as "in" | "out") ?? "out",
      party_type: partyType,
      vendor_name: gp.vendor_name ?? "",
      supplier_name: gp.supplier_name ?? "",
      items: formItems,
      purpose: gp.purpose ?? "",
      vehicle_number: gp.vehicle_number ?? "",
      date: gp.date ?? "",
      notes: gp.notes ?? "",
      status: gp.status,
      purchase_request_id: gp.purchase_request_id,
      purchase_request_number: gp.purchase_request_number ?? "",
    });
    setEditError(null);
    setViewTarget(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const validItems = editForm.items.filter(it => it.item_name.trim());
    if (validItems.length === 0) { setEditError("At least one item is required"); return; }
    setEditSaving(true); setEditError(null);
    try {
      await apiFetchJson(`/api/v1/gate-passes/${editTarget.id}`, {
        method: "PUT",
        body: JSON.stringify(buildPayload(editForm)),
      });
      setEditTarget(null); load();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update");
    } finally { setEditSaving(false); }
  }

  async function closeGatePass(id: number) {
    setClosingId(id);
    try {
      await apiFetchJson(`/api/v1/gate-passes/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "closed" }),
      });
      setViewTarget(null);
      load();
    } catch { /* ignore */ } finally { setClosingId(null); }
  }

  function printGatePass(gp: GatePass) {
    const items = gp.items && gp.items.length > 0 ? gp.items : [{ item_name: gp.material, quantity: gp.quantity, unit: gp.unit, inv_type: null }];
    const partyName = gp.vendor_name ?? gp.supplier_name ?? "—";
    const partyLabel = gp.supplier_name ? "Supplier" : "Vendor";
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Gate Pass — ${gp.gate_pass_number}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; margin: 24px; color: #111; }
  h2 { margin: 0 0 4px; font-size: 18px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .row { display: flex; gap: 32px; margin-bottom: 8px; }
  .lbl { color: #666; font-size: 11px; }
  @media print { body { margin: 0; } }
</style></head><body>
<h2>Gate Pass — ${gp.gate_pass_number}</h2>
<p class="meta">Generated on ${new Date().toLocaleString("en-IN")}</p>
<div class="row">
  <div><div class="lbl">Type</div><div>${gp.pass_type === "out" ? "Outward" : "Inward"}</div></div>
  <div><div class="lbl">Status</div><div>${gp.status}</div></div>
  ${gp.date ? `<div><div class="lbl">Date</div><div>${gp.date}</div></div>` : ""}
</div>
<div class="row">
  <div><div class="lbl">${partyLabel}</div><div>${partyName}</div></div>
  ${gp.purpose ? `<div><div class="lbl">Purpose</div><div>${gp.purpose}</div></div>` : ""}
  ${gp.vehicle_number ? `<div><div class="lbl">Vehicle</div><div>${gp.vehicle_number}</div></div>` : ""}
  ${gp.purchase_request_number ? `<div><div class="lbl">Linked PR</div><div>${gp.purchase_request_number}</div></div>` : ""}
</div>
<table>
  <thead><tr><th>#</th><th>Item</th><th>Quantity</th><th>Unit</th></tr></thead>
  <tbody>
    ${items.map((it, i) => `<tr><td>${i + 1}</td><td>${it.item_name ?? ""}</td><td>${it.quantity}</td><td>${it.unit ?? ""}</td></tr>`).join("")}
  </tbody>
</table>
${gp.notes ? `<p style="margin-top:12px"><strong>Notes:</strong> ${gp.notes}</p>` : ""}
<p style="margin-top:16px;font-size:11px;color:#666">Created by: ${gp.created_by ?? "—"}</p>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  function printAllGatePasses() {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Gate Passes History</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; }
  h2 { margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  @media print { body { margin: 0; } }
</style></head><body>
<h2>Gate Passes History</h2>
<p style="color:#666;font-size:11px">Printed on ${new Date().toLocaleString("en-IN")} &mdash; ${passes.length} record${passes.length !== 1 ? "s" : ""}</p>
<table>
  <thead><tr><th>GP No.</th><th>Type</th><th>Party</th><th>Items</th><th>Date</th><th>Vehicle</th><th>Purpose</th><th>Status</th><th>Linked PR</th></tr></thead>
  <tbody>
    ${passes.map(gp => {
      const partyName = gp.vendor_name ?? gp.supplier_name ?? "—";
      const itemSummary = gp.items && gp.items.length > 0 ? (gp.items.length === 1 ? gp.items[0].item_name : `${gp.items.length} items`) : gp.material;
      return `<tr>
        <td>${gp.gate_pass_number}</td>
        <td>${gp.pass_type === "out" ? "Outward" : "Inward"}</td>
        <td>${partyName}</td>
        <td>${itemSummary}</td>
        <td>${gp.date ?? ""}</td>
        <td>${gp.vehicle_number ?? ""}</td>
        <td>${gp.purpose ?? ""}</td>
        <td>${gp.status}</td>
        <td>${gp.purchase_request_number ?? ""}</td>
      </tr>`;
    }).join("")}
  </tbody>
</table>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  const adminUser = isAdminOrAbove();

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:pr-64">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbPage>Gate Passes</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input ref={searchRef} className="pl-8 h-8 w-40 text-sm" placeholder="Search…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={passTypeFilter} onChange={(e) => setPassTypeFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All types</option>
            <option value="out">Outward</option>
            <option value="in">Inward</option>
          </select>
          <Button size="sm" onClick={() => { setCreateForm(BLANK_FORM()); setCreateError(null); setShowCreate(true); }}>
            <Plus className="size-4 mr-1.5" />New Gate Pass
          </Button>
          <Button size="sm" variant="outline" onClick={printAllGatePasses} title="Print all gate passes">
            <Printer className="size-4" />
          </Button>
        </div>
      </header>

      {/* ── Create Dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Gate Pass</DialogTitle></DialogHeader>
          <GPForm form={createForm} vendors={vendors} suppliers={suppliers}
            saving={createSaving} error={createError} onChange={setCreateForm}
            onSubmit={handleCreate} isCreate purchaseRequests={purchaseRequests} />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={createSaving}>Cancel</Button>
            <Button disabled={createSaving} onClick={handleCreate}>
              {createSaving ? "Creating…" : "Create Gate Pass"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Dialog ── */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => { if (!o) setViewTarget(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="size-4 text-emerald-600" />
              {viewTarget?.gate_pass_number}
            </DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="px-4 pb-2 space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[viewTarget.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {viewTarget.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PASS_TYPE_COLORS[viewTarget.pass_type] ?? "bg-slate-100 text-slate-600"}`}>
                    {viewTarget.pass_type === "out" ? "Outward" : "Inward"}
                  </span>
                </div>
                {(viewTarget.vendor_name || viewTarget.supplier_name) && (
                  <div>
                    <p className="text-xs text-muted-foreground">{viewTarget.supplier_name ? "Supplier" : "Vendor"}</p>
                    <p className="font-medium">{viewTarget.vendor_name ?? viewTarget.supplier_name}</p>
                  </div>
                )}
                {viewTarget.purpose && (
                  <div>
                    <p className="text-xs text-muted-foreground">Purpose</p>
                    <p className="font-medium">{viewTarget.purpose}</p>
                  </div>
                )}
                {viewTarget.date && (
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="font-medium">{viewTarget.date}</p>
                  </div>
                )}
                {viewTarget.vehicle_number && (
                  <div>
                    <p className="text-xs text-muted-foreground">Vehicle</p>
                    <p className="font-medium">{viewTarget.vehicle_number}</p>
                  </div>
                )}
                {viewTarget.purchase_request_number && (
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Link2 className="size-3" />Linked Purchase Request
                    </p>
                    <p className="font-medium text-blue-600">{viewTarget.purchase_request_number}</p>
                  </div>
                )}
                {viewTarget.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="font-medium">{viewTarget.notes}</p>
                  </div>
                )}
              </div>

              {/* Items */}
              {viewTarget.items && viewTarget.items.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Items ({viewTarget.items.length})
                  </p>
                  <div className="space-y-2">
                    {viewTarget.items.map((item, idx) => (
                      <div key={idx} className="rounded-lg border bg-muted/40 p-3">
                        <p className="text-sm font-medium">{item.item_name}</p>
                        <div className="flex gap-4 text-xs text-muted-foreground mt-0.5">
                          <span>Qty: {item.quantity}{item.unit ? ` ${item.unit}` : ""}</span>
                          {item.inv_type && <span className="capitalize">{item.inv_type.replace("_", " ")}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : viewTarget.material ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Material</p>
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-sm font-medium">{viewTarget.material}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Qty: {viewTarget.quantity}{viewTarget.unit ? ` ${viewTarget.unit}` : ""}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          <DialogFooter className="gap-2">
            {adminUser && viewTarget?.status !== "closed" && (
              <Button variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50"
                disabled={closingId === viewTarget?.id}
                onClick={() => viewTarget && closeGatePass(viewTarget.id)}>
                <X className="size-3.5 mr-1.5" />
                {closingId === viewTarget?.id ? "Closing…" : "Close Gate Pass"}
              </Button>
            )}
            {adminUser && (
              <Button variant="outline" onClick={() => viewTarget && openEdit(viewTarget)}>Edit</Button>
            )}
            <Button variant="outline" onClick={() => viewTarget && printGatePass(viewTarget)}>
              <Printer className="size-3.5 mr-1.5" />Print
            </Button>
            <Button onClick={() => setViewTarget(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Gate Pass</DialogTitle></DialogHeader>
          <GPForm form={editForm} vendors={vendors} suppliers={suppliers}
            saving={editSaving} error={editError} onChange={setEditForm}
            onSubmit={handleEdit} isCreate={false} purchaseRequests={purchaseRequests} />
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
            <strong className="text-foreground">{total}</strong> gate pass{total !== 1 ? "es" : ""}
          </p>
        )}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        )}
        {!loading && passes.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardList className="size-12 mx-auto mb-3 opacity-20" />
            <p className="mb-4">No gate passes found.</p>
            <Button size="sm" onClick={() => { setCreateForm(BLANK_FORM()); setCreateError(null); setShowCreate(true); }}>
              <Plus className="size-4 mr-1.5" />Create First Gate Pass
            </Button>
          </div>
        )}
        {!loading && passes.length > 0 && (
          <div className="space-y-3">
            {passes.map((gp) => {
              const partyName = gp.vendor_name ?? gp.supplier_name;
              const partyLabel = gp.supplier_name ? "Supplier" : "Vendor";
              const itemSummary =
                gp.items && gp.items.length > 0
                  ? gp.items.length === 1
                    ? gp.items[0].item_name
                    : `${gp.items.length} items`
                  : gp.material;
              return (
                <div key={gp.id} className="rounded-xl border bg-card p-4 flex items-start gap-4">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                    <ClipboardList className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm">{gp.gate_pass_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PASS_TYPE_COLORS[gp.pass_type] ?? "bg-slate-100 text-slate-600"}`}>
                        {gp.pass_type === "out" ? "Outward" : "Inward"}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[gp.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {gp.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium mt-0.5">{itemSummary}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0 text-xs text-muted-foreground mt-1">
                      {partyName && <span>{partyLabel}: {partyName}</span>}
                      {gp.items && gp.items.length === 1 && (
                        <span>Qty: {gp.items[0].quantity}{gp.items[0].unit ? ` ${gp.items[0].unit}` : ""}</span>
                      )}
                      {gp.items && gp.items.length > 1 && (
                        <span className="line-clamp-1">
                          {gp.items.map(i => `${i.quantity}${i.unit ? ` ${i.unit}` : ""} ${i.item_name}`).join(" · ")}
                        </span>
                      )}
                      {(!gp.items || gp.items.length === 0) && (
                        <span>Qty: {gp.quantity}{gp.unit ? ` ${gp.unit}` : ""}</span>
                      )}
                      {gp.date && <span>{gp.date}</span>}
                      {gp.vehicle_number && <span>Vehicle: {gp.vehicle_number}</span>}
                      {gp.purpose && <span>{gp.purpose}</span>}
                    </div>
                    {gp.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{gp.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="size-8" title="Print" onClick={() => printGatePass(gp)}>
                      <Printer className="size-3.5" />
                    </Button>
                    {adminUser && gp.status !== "closed" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-orange-600 hover:text-orange-600 hover:bg-orange-50"
                        title="Close Gate Pass"
                        disabled={closingId === gp.id}
                        onClick={() => closeGatePass(gp.id)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-8">
                          <MoreVertical className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewTarget(gp)}>
                          <Eye className="size-3.5 mr-2" />View Details
                        </DropdownMenuItem>
                        {adminUser && (
                          <DropdownMenuItem onClick={() => openEdit(gp)}>
                            <Pencil className="size-3.5 mr-2" />Edit
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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

function GPForm({
  form, vendors, suppliers, saving, error, onChange, onSubmit, isCreate, purchaseRequests,
}: {
  form: GPFormState;
  vendors: NameOption[];
  suppliers: NameOption[];
  saving: boolean;
  error: string | null;
  onChange: (f: GPFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  isCreate: boolean;
  purchaseRequests: { id: number; sn_no: string; item_name: string | null }[];
}) {
  function updateItem(key: string, patch: Partial<GPItemForm>) {
    onChange({ ...form, items: form.items.map(i => i._key === key ? { ...i, ...patch } : i) });
  }
  function addItem() {
    onChange({ ...form, items: [...form.items, blankGPItem()] });
  }
  function removeItem(key: string) {
    if (form.items.length === 1) return;
    onChange({ ...form, items: form.items.filter(i => i._key !== key) });
  }

  return (
    <form onSubmit={onSubmit} className="px-4 space-y-4">
      {/* Pass Type */}
      <div className="space-y-1.5">
        <Label>Pass Type</Label>
        <div className="flex gap-2">
          <button type="button"
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              form.pass_type === "out"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-input hover:bg-muted"
            }`}
            onClick={() => onChange({ ...form, pass_type: "out" })} disabled={saving}>
            Outward
          </button>
          <button type="button"
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              form.pass_type === "in"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-input hover:bg-muted"
            }`}
            onClick={() => onChange({ ...form, pass_type: "in" })} disabled={saving}>
            Inward
          </button>
        </div>
      </div>

      {/* Party Type */}
      <div className="space-y-1.5">
        <Label>Party</Label>
        <div className="flex gap-2">
          <button type="button"
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              form.party_type === "vendor"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-input hover:bg-muted"
            }`}
            onClick={() => onChange({ ...form, party_type: "vendor", supplier_name: "" })}
            disabled={saving}>
            Vendor
          </button>
          <button type="button"
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              form.party_type === "supplier"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-input hover:bg-muted"
            }`}
            onClick={() => onChange({ ...form, party_type: "supplier", vendor_name: "" })}
            disabled={saving}>
            Supplier
          </button>
        </div>
      </div>

      {/* Party selector */}
      {form.party_type === "vendor" ? (
        <div className="space-y-1.5">
          <Label htmlFor="gp-vendor">Vendor</Label>
          <select id="gp-vendor" value={form.vendor_name}
            onChange={(e) => onChange({ ...form, vendor_name: e.target.value })}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
            <option value="">— Select vendor —</option>
            {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
          </select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="gp-supplier">Supplier</Label>
          <select id="gp-supplier" value={form.supplier_name}
            onChange={(e) => onChange({ ...form, supplier_name: e.target.value })}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
            <option value="">— Select supplier —</option>
            {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
      )}

      {/* Items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Items <span className="text-destructive">*</span></Label>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={addItem} disabled={saving}>
            <Plus className="size-3" /> Add Item
          </Button>
        </div>
        {form.items.map((item, idx) => (
          <div key={item._key} className="rounded-lg border p-3 space-y-2 bg-muted/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
              {form.items.length > 1 && (
                <Button type="button" size="icon" variant="ghost"
                  className="size-6 text-destructive hover:text-destructive"
                  onClick={() => removeItem(item._key)} disabled={saving}>
                  <Minus className="size-3.5" />
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Inventory Type</Label>
              <select value={item.inv_type}
                onChange={(e) => updateItem(item._key, { inv_type: e.target.value, inv_item_id: null, item_name: "" })}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                <option value="">— Select type —</option>
                {GP_INV_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {item.inv_type ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Item <span className="text-destructive">*</span></Label>
                <GPInvCombobox
                  invType={item.inv_type}
                  value={item.item_name}
                  disabled={saving}
                  onSelect={(name, id) => updateItem(item._key, { item_name: name, inv_item_id: id })}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Item name <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. Steel rods, Motor part…" value={item.item_name}
                  onChange={(e) => updateItem(item._key, { item_name: e.target.value })} disabled={saving} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity</Label>
                <Input type="number" step="any" placeholder="0" value={item.quantity}
                  onChange={(e) => updateItem(item._key, { quantity: e.target.value })} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unit</Label>
                <Input placeholder="pcs / kg" value={item.unit}
                  onChange={(e) => updateItem(item._key, { unit: e.target.value })} disabled={saving} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gp-purpose">Purpose</Label>
        <Input id="gp-purpose" placeholder="Reason for gate pass" value={form.purpose}
          onChange={(e) => onChange({ ...form, purpose: e.target.value })} disabled={saving} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="gp-date">Date</Label>
          <Input id="gp-date" type="date" value={form.date}
            onChange={(e) => onChange({ ...form, date: e.target.value })} disabled={saving} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gp-vehicle">Vehicle No.</Label>
          <Input id="gp-vehicle" placeholder="e.g. MH12AB1234" value={form.vehicle_number}
            onChange={(e) => onChange({ ...form, vehicle_number: e.target.value })} disabled={saving} />
        </div>
      </div>
      {!isCreate && (
        <div className="space-y-1.5">
          <Label htmlFor="gp-status">Status</Label>
          <select id="gp-status" value={form.status}
            onChange={(e) => onChange({ ...form, status: e.target.value })}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="gp-notes">Notes</Label>
        <textarea id="gp-notes" rows={2} placeholder="Remarks…" value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })} disabled={saving}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gp-pr">Linked Purchase Request <span className="text-xs text-muted-foreground">(optional)</span></Label>
        <select id="gp-pr" value={form.purchase_request_id ?? ""}
          onChange={(e) => {
            const pr = purchaseRequests.find(p => p.id === parseInt(e.target.value));
            onChange({ ...form, purchase_request_id: pr?.id ?? null, purchase_request_number: pr?.sn_no ?? "" });
          }}
          disabled={saving}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
          <option value="">— None —</option>
          {purchaseRequests.map(pr => (
            <option key={pr.id} value={pr.id}>
              {pr.sn_no}{pr.item_name ? ` — ${pr.item_name}` : ""}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

// ── Inventory Combobox ────────────────────────────────────────────────────────

type InvItem = { id: number; name: string; code: string };

function GPInvCombobox({ invType, value, disabled, onSelect }: {
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
        } else if (invType === "raw_material") {
          const d = await apiFetchJson<{ items: { id: number; code: string; name: string }[] }>(
            `/api/v1/inventory?page_size=12&include_inactive=false&item_type=raw_material${qs}`
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
          const d = await apiFetchJson<{ items: { id: number; part_number: string | null; name: string }[] }>(
            `/api/v1/spares?page_size=12${qs}`
          );
          invItems = d.items.map(s => ({ id: s.id, code: s.part_number ?? "", name: s.name }));
        }
        setResults(invItems);
        setOpen(invItems.length > 0);
      } catch {
        setResults([]);
      } finally { setBusy(false); }
    }, 250);
  }, [invType]);

  return (
    <div className="relative">
      <Input
        placeholder={`Search ${invType.replace("_", " ")}…`}
        value={query}
        disabled={disabled}
        onChange={(e) => { setQuery(e.target.value); doSearch(e.target.value); }}
        onFocus={() => { if (!query) doSearch(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="text-sm"
      />
      {busy && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">…</span>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
          {results.map(item => (
            <button
              key={item.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
              onMouseDown={() => { onSelect(item.name, item.id); setOpen(false); }}
            >
              {item.code && <span className="text-xs font-mono text-muted-foreground shrink-0">{item.code}</span>}
              <span className="truncate">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
