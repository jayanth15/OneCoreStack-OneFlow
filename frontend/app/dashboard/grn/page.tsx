"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/user";
import {
  PlusIcon,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Package,
  Truck,
  Car,
  CheckCircle,
  Clock,
  Loader2,
  RotateCcw,
  Pencil,
  Printer,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InvItem {
  id: number;
  code: string;
  name: string;
  item_type: string;
  unit: string;
}

interface GRNItem {
  id: number;
  grn_id: number;
  inventory_item_id: number | null;
  item_name: string | null;
  item_code: string | null;
  item_type: string | null;
  unit: string | null;
  quantity_received: number;
  quantity_pr_requested: number | null;
  quantity_filled: number;
  quantity_returned: number;
}

interface GRNRecord {
  id: number;
  grn_number: string;
  transport_type: string;
  vehicle_number: string | null;
  received_by_user_id: number | null;
  received_by_username: string | null;
  inspected_by_user_id: number | null;
  inspected_by_username: string | null;
  notes: string | null;
  status: string; // draft | partially_filled | stock_filled
  stock_filled_by_username: string | null;
  stock_filled_at: string | null;
  created_at: string;
  purchase_request_id: number | null;
  purchase_request_sn_no: string | null;
  po_number: string | null;
  dc_number: string | null;
  items: GRNItem[];
}

interface PaginatedGRN {
  items: GRNRecord[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface PaginatedInv {
  items: { id: number; code: string; name: string; item_type: string; unit: string }[];
  total: number;
}

interface PRItem {
  id: number;
  sn_no: string;
  item_name: string | null;
  item_code: string | null;
  item_type: string | null;
  unit: string | null;
  inventory_item_id: number | null;
  quantity: number;
  status: string;
}

interface UserItem {
  id: number;
  username: string;
}

// ── Form row type ─────────────────────────────────────────────────────────────

interface FormItemRow {
  _key: number;
  inventory_item_id: number | null;
  item_name: string;
  item_code: string;
  item_type: string;
  unit: string;
  quantity_received: string;
  quantity_pr_requested: string; // hint from linked PR
  invTypeFilter: string;
}

let _rowKey = 0;
function newRow(): FormItemRow {
  return {
    _key: ++_rowKey,
    inventory_item_id: null,
    item_name: "",
    item_code: "",
    item_type: "raw_material",
    unit: "",
    quantity_received: "",
    quantity_pr_requested: "",
    invTypeFilter: "",
  };
}

function grnItemToFormRow(item: GRNItem): FormItemRow {
  return {
    _key: ++_rowKey,
    inventory_item_id: item.inventory_item_id,
    item_name: item.item_name ?? "",
    item_code: item.item_code ?? "",
    item_type: item.item_type ?? "raw_material",
    unit: item.unit ?? "",
    quantity_received: String(item.quantity_received),
    quantity_pr_requested: item.quantity_pr_requested != null ? String(item.quantity_pr_requested) : "",
    invTypeFilter: "",
  };
}

function prToFormRow(pr: PRItem): FormItemRow {
  return {
    _key: ++_rowKey,
    inventory_item_id: pr.inventory_item_id,
    item_name: pr.item_name ?? "",
    item_code: pr.item_code ?? "",
    item_type: pr.item_type ?? "raw_material",
    unit: pr.unit ?? "",
    quantity_received: String(pr.quantity),
    quantity_pr_requested: String(pr.quantity),
    invTypeFilter: "",
  };
}

// ── PR combobox ───────────────────────────────────────────────────────────────

function PrCombobox({
  value,
  onSelect,
  disabled,
}: {
  value: string;
  onSelect: (pr: PRItem) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<PRItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const search = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const qs = q.trim() ? `?search=${encodeURIComponent(q)}` : "";
        setResults(await apiFetchJson<PRItem[]>(`/api/v1/grn/linkable-prs${qs}`));
      } catch { /* ignore */ } finally { setBusy(false); }
    }, q.trim() ? 300 : 0);
  }, []);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder="Search purchase request…"
        className="w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); search(e.target.value); }}
        onFocus={() => { setOpen(true); if (!query) search(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (results.length > 0 || busy) && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md overflow-hidden">
          {busy && results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> Searching…
            </div>
          ) : (
            results.map((pr) => (
              <button key={pr.id} type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                onMouseDown={() => { onSelect(pr); setQuery(`${pr.sn_no} · ${pr.item_name ?? ""}`); setOpen(false); }}>
                <span className="font-mono font-medium text-xs">{pr.sn_no}</span>
                <span className="text-sm ml-2">{pr.item_name ?? "—"}</span>
                <span className="text-xs text-muted-foreground ml-1.5">
                  qty {pr.quantity} · {pr.status}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── User combobox ─────────────────────────────────────────────────────────────

function UserCombobox({
  value,
  onSelect,
  disabled,
}: {
  value: string;
  onSelect: (u: UserItem) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<UserItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const search = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const d = await apiFetchJson<UserItem[]>(`/api/v1/admin/users?include_inactive=false`);
        setResults((q.trim() ? d.filter((u) => u.username.toLowerCase().includes(q.toLowerCase())) : d).slice(0, 20));
      } catch { /* ignore */ } finally { setBusy(false); }
    }, q.trim() ? 200 : 0);
  }, []);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder="Search user…"
        className="w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); search(e.target.value); }}
        onFocus={() => { setOpen(true); if (!query) search(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (results.length > 0 || busy) && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md overflow-hidden">
          {busy && results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> Searching…
            </div>
          ) : (
            results.map((u) => (
              <button key={u.id} type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                onMouseDown={() => { onSelect(u); setQuery(u.username); setOpen(false); }}>
                {u.username}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "stock_filled")
    return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20"><CheckCircle className="size-3" /> Stock Filled</span>;
  if (status === "partially_filled")
    return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-tone-violet/10 text-tone-violet border border-indigo-200"><Package className="size-3" /> Partial</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/20"><Clock className="size-3" /> In Lobby</span>;
}

const INV_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "raw_material", label: "Raw Material" },
  { value: "finished_good", label: "Finished Good" },
  { value: "semi_finished", label: "Semi-Finished" },
  { value: "spare", label: "Spare" },
  { value: "consumable", label: "Consumable" },
  { value: "attachment", label: "Attachment" },
  { value: "weeder", label: "Weeder" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GRNPage() {
  const [data, setData] = useState<PaginatedGRN | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [canManage, setCanManage] = useState(false);

  // ── Add / Edit dialog (shared form state) ─────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingGrn, setEditingGrn] = useState<GRNRecord | null>(null); // null = add mode
  const [transportType, setTransportType] = useState<"own" | "company">("own");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [grnNotes, setGrnNotes] = useState("");
  const [linkedPrId, setLinkedPrId] = useState<number | null>(null);
  const [linkedPrLabel, setLinkedPrLabel] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [dcNumber, setDcNumber] = useState("");
  const [inspectedByUserId, setInspectedByUserId] = useState<number | null>(null);
  const [inspectedByUsername, setInspectedByUsername] = useState("");
  const [formItems, setFormItems] = useState<FormItemRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  // View detail dialog
  const [viewGrn, setViewGrn] = useState<GRNRecord | null>(null);

  // Fill Items dialog
  const [fillGrn, setFillGrn] = useState<GRNRecord | null>(null);
  const [fillQtys, setFillQtys] = useState<Record<number, string>>({});
  const [filling, setFilling] = useState(false);
  const [fillErr, setFillErr] = useState<string | null>(null);

  // Return Items dialog
  const [returnGrn, setReturnGrn] = useState<GRNRecord | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<number, string>>({});
  const [returning, setReturning] = useState(false);
  const [returnErr, setReturnErr] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) setCanManage(user.grn_access === true);
  }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (statusFilter !== "all") params.set("status_filter", statusFilter);
    apiFetchJson<PaginatedGRN>(`/api/v1/grn?${params}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function resetForm() {
    setTransportType("own");
    setVehicleNumber("");
    setGrnNotes("");
    setLinkedPrId(null);
    setLinkedPrLabel("");
    setPoNumber("");
    setDcNumber("");
    setInspectedByUserId(null);
    setInspectedByUsername("");
    setFormItems([newRow()]);
    setFormErr(null);
  }

  function openAdd() {
    setEditingGrn(null);
    resetForm();
    setFormOpen(true);
  }

  function openEdit(grn: GRNRecord) {
    setEditingGrn(grn);
    setTransportType(grn.transport_type as "own" | "company");
    setVehicleNumber(grn.vehicle_number ?? "");
    setGrnNotes(grn.notes ?? "");
    setLinkedPrId(grn.purchase_request_id);
    setLinkedPrLabel(grn.purchase_request_sn_no ?? "");
    setPoNumber(grn.po_number ?? "");
    setDcNumber(grn.dc_number ?? "");
    setInspectedByUserId(grn.inspected_by_user_id);
    setInspectedByUsername(grn.inspected_by_username ?? "");
    setFormItems(grn.items.map(grnItemToFormRow));
    setFormErr(null);
    setFormOpen(true);
  }

  function updateRow(key: number, patch: Partial<FormItemRow>) {
    setFormItems((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: number) {
    setFormItems((prev) => prev.filter((r) => r._key !== key));
  }

  // Whether items are editable in the current form context
  const canEditFormItems = !editingGrn || editingGrn.status === "draft";

  function handlePrSelect(pr: PRItem) {
    setLinkedPrId(pr.id);
    setLinkedPrLabel(`${pr.sn_no} · ${pr.item_name ?? ""}`);
    // Auto-fill item row from PR
    if (canEditFormItems && (pr.item_name || pr.inventory_item_id)) {
      const prRow = prToFormRow(pr);
      setFormItems((prev) => {
        const hasEmpty = prev.length === 1 && !prev[0].item_name && !prev[0].inventory_item_id;
        return hasEmpty ? [prRow] : [...prev, prRow];
      });
    }
  }

  async function handleSave() {
    setFormErr(null);
    if (canEditFormItems && formItems.length === 0) {
      setFormErr("Add at least one item");
      return;
    }
    if (canEditFormItems) {
      for (const r of formItems) {
        if (!r.item_name.trim() && !r.inventory_item_id) {
          setFormErr("Each item must have a name or be selected from inventory");
          return;
        }
        const qty = parseFloat(r.quantity_received);
        if (isNaN(qty) || qty <= 0) {
          setFormErr("Each item must have a quantity greater than 0");
          return;
        }
      }
    }
    if (transportType === "company" && !vehicleNumber.trim()) {
      setFormErr("Vehicle number is required for Company Transport");
      return;
    }

    const payload = {
      transport_type: transportType,
      vehicle_number: transportType === "company" ? vehicleNumber.trim() : null,
      notes: grnNotes.trim() || null,
      purchase_request_id: linkedPrId,
      po_number: poNumber.trim() || null,
      dc_number: dcNumber.trim() || null,
      inspected_by_user_id: inspectedByUserId,
      inspected_by_username: inspectedByUsername || null,
      ...(canEditFormItems
        ? {
            items: formItems.map((r) => ({
              inventory_item_id: r.inventory_item_id,
              item_name: r.item_name.trim() || null,
              item_code: r.item_code.trim() || null,
              item_type: r.item_type || null,
              unit: r.unit.trim() || null,
              quantity_received: parseFloat(r.quantity_received),
              quantity_pr_requested: r.quantity_pr_requested ? parseFloat(r.quantity_pr_requested) : null,
            })),
          }
        : {}),
    };

    setSaving(true);
    try {
      if (editingGrn) {
        await apiFetchJson(`/api/v1/grn/${editingGrn.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetchJson("/api/v1/grn", { method: "POST", body: JSON.stringify(payload) });
      }
      setFormOpen(false);
      fetchData();
    } catch (e: unknown) {
      setFormErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function initFillQtys(grn: GRNRecord) {
    const init: Record<number, string> = {};
    for (const item of grn.items) {
      const remaining = item.quantity_received - item.quantity_filled - item.quantity_returned;
      if (remaining > 1e-9) init[item.id] = String(Math.round(remaining * 1000) / 1000);
    }
    setFillQtys(init);
    setFillErr(null);
  }

  function initReturnQtys(grn: GRNRecord) {
    const init: Record<number, string> = {};
    for (const item of grn.items) {
      if (item.quantity_filled > 1e-9) init[item.id] = "";
    }
    setReturnQtys(init);
    setReturnErr(null);
  }

  async function handleFillItems() {
    if (!fillGrn) return;
    setFillErr(null);
    const entries = Object.entries(fillQtys)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([id, v]) => ({ grn_item_id: Number(id), quantity_to_fill: parseFloat(v) }));
    if (entries.length === 0) { setFillErr("Enter a quantity greater than 0 for at least one item"); return; }
    setFilling(true);
    try {
      await apiFetchJson(`/api/v1/grn/${fillGrn.id}/fill-items`, { method: "POST", body: JSON.stringify({ items: entries }) });
      setFillGrn(null);
      fetchData();
    } catch (e: unknown) {
      setFillErr(e instanceof Error ? e.message : "Fill failed");
    } finally { setFilling(false); }
  }

  function printGRN(grn: GRNRecord) {
    const win = window.open("", "_blank", "width=800,height=700");
    if (!win) return;
    const totalReceived = grn.items.reduce((s, it) => s + it.quantity_received, 0);
    const totalFilled = grn.items.reduce((s, it) => s + it.quantity_filled, 0);
    const totalReturned = grn.items.reduce((s, it) => s + it.quantity_returned, 0);
    win.document.write(`<!DOCTYPE html><html><head><title>GRN — ${grn.grn_number}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; margin: 24px; color: #111; }
  h2 { margin: 0 0 4px; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  .row { display: flex; gap: 32px; margin-bottom: 8px; flex-wrap: wrap; }
  .lbl { color: #666; font-size: 11px; }
  tfoot td { font-weight: 600; background: #f9f9f9; }
  .text-right { text-align: right; }
  @media print { body { margin: 0; } }
</style></head><body>
<h2>Goods Received Note — ${grn.grn_number}</h2>
<p style="color:#666;font-size:11px">Generated on ${new Date().toLocaleString("en-IN")}</p>
<div class="row">
  <div><div class="lbl">Received By</div><div>${grn.received_by_username ?? "—"}</div></div>
  <div><div class="lbl">Date</div><div>${grn.created_at?.slice(0, 10) ?? "—"}</div></div>
  <div><div class="lbl">Status</div><div>${grn.status}</div></div>
  ${grn.transport_type ? `<div><div class="lbl">Transport</div><div>${grn.transport_type === "company" ? "Company Transport" : "Own Transport"}${grn.vehicle_number ? ` (${grn.vehicle_number})` : ""}</div></div>` : ""}
  ${grn.inspected_by_username ? `<div><div class="lbl">Inspected By</div><div>${grn.inspected_by_username}</div></div>` : ""}
  ${grn.purchase_request_sn_no ? `<div><div class="lbl">Linked PR</div><div>${grn.purchase_request_sn_no}</div></div>` : ""}
  ${grn.po_number ? `<div><div class="lbl">PO Number</div><div>${grn.po_number}</div></div>` : ""}
  ${grn.dc_number ? `<div><div class="lbl">DC Number</div><div>${grn.dc_number}</div></div>` : ""}
</div>
<table>
  <thead><tr>
    <th>#</th><th>Item</th><th>Code</th>
    <th class="text-right">PR Qty</th>
    <th class="text-right">Received</th>
    <th class="text-right">Filled</th>
    <th class="text-right">Returned</th>
    <th class="text-right">Remaining</th>
    <th>Unit</th>
  </tr></thead>
  <tbody>
    ${grn.items.map((it, i) => {
      const remaining = it.quantity_received - it.quantity_filled - it.quantity_returned;
      return `<tr>
        <td>${i + 1}</td>
        <td>${it.item_name ?? "—"}</td>
        <td style="font-family:monospace">${it.item_code ?? "—"}</td>
        <td class="text-right">${it.quantity_pr_requested != null ? it.quantity_pr_requested : "—"}</td>
        <td class="text-right">${it.quantity_received}</td>
        <td class="text-right">${it.quantity_filled}</td>
        <td class="text-right">${it.quantity_returned}</td>
        <td class="text-right">${(Math.round(remaining * 1000) / 1000).toLocaleString("en-IN")}</td>
        <td>${it.unit ?? ""}</td>
      </tr>`;
    }).join("")}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="3" style="text-align:right">Totals</td>
      <td class="text-right">—</td>
      <td class="text-right">${totalReceived.toLocaleString("en-IN")}</td>
      <td class="text-right">${totalFilled.toLocaleString("en-IN")}</td>
      <td class="text-right">${totalReturned.toLocaleString("en-IN")}</td>
      <td class="text-right">${(totalReceived - totalFilled - totalReturned).toLocaleString("en-IN")}</td>
      <td></td>
    </tr>
  </tfoot>
</table>
${grn.notes ? `<p style="margin-top:12px"><strong>Notes:</strong> ${grn.notes}</p>` : ""}
<p style="margin-top:24px;font-size:11px;color:#666">
  Received By: ${grn.received_by_username ?? "—"} &nbsp;&nbsp;&nbsp;
  Inspected By: ${grn.inspected_by_username ?? "—"}
</p>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  async function handleReturnItems() {
    if (!returnGrn) return;
    setReturnErr(null);
    const entries = Object.entries(returnQtys)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([id, v]) => ({ grn_item_id: Number(id), quantity_to_return: parseFloat(v) }));
    if (entries.length === 0) { setReturnErr("Enter a quantity greater than 0 for at least one item"); return; }
    setReturning(true);
    try {
      await apiFetchJson(`/api/v1/grn/${returnGrn.id}/return-items`, { method: "POST", body: JSON.stringify({ items: entries }) });
      setReturnGrn(null);
      fetchData();
    } catch (e: unknown) {
      setReturnErr(e instanceof Error ? e.message : "Return failed");
    } finally { setReturning(false); }
  }

  const grns = data?.items ?? [];
  const totalPages = data?.pages ?? 1;
  const total = data?.total ?? 0;

  const TABS = [
    { id: "all", label: "All" },
    { id: "draft", label: "In Lobby" },
    { id: "partially_filled", label: "Partial" },
    { id: "stock_filled", label: "Stock Filled" },
  ];

  // ── Shared form body (used by both Add and Edit dialog) ────────────────────
  const FormBody = (
    <div className="space-y-4 py-2">
      {formErr && <p className="text-sm text-destructive">{formErr}</p>}

      {/* Transport */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Transport Type</Label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="transport" value="own" checked={transportType === "own"}
              onChange={() => { setTransportType("own"); setVehicleNumber(""); }} disabled={saving} />
            <Car className="size-3.5 text-muted-foreground" />
            <span className="text-sm">Own Transport</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="transport" value="company" checked={transportType === "company"}
              onChange={() => setTransportType("company")} disabled={saving} />
            <Truck className="size-3.5 text-muted-foreground" />
            <span className="text-sm">Company Transport</span>
          </label>
        </div>
      </div>

      {transportType === "company" && (
        <div>
          <Label htmlFor="vehicle_no" className="text-sm">
            Vehicle Number <span className="text-destructive">*</span>
          </Label>
          <Input id="vehicle_no" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)}
            placeholder="e.g. TN01AB1234" disabled={saving} className="mt-1" />
        </div>
      )}

      <div>
        <Label htmlFor="grn_notes" className="text-sm">Notes (optional)</Label>
        <Input id="grn_notes" value={grnNotes} onChange={(e) => setGrnNotes(e.target.value)}
          placeholder="Any delivery notes…" disabled={saving} className="mt-1" />
      </div>

      {/* Linked PR */}
      <div>
        <Label className="text-sm">Linked Purchase Request (optional)</Label>
        <div className="mt-1">
          <PrCombobox value={linkedPrLabel} onSelect={handlePrSelect} disabled={saving} />
        </div>
        {linkedPrId && (
          <button type="button" className="text-xs text-muted-foreground hover:text-destructive mt-1"
            onClick={() => { setLinkedPrId(null); setLinkedPrLabel(""); }} disabled={saving}>
            Clear linked PR
          </button>
        )}
      </div>

      {/* PO + DC */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-sm">PO Number (optional)</Label>
          <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)}
            placeholder="Purchase order no." disabled={saving} className="mt-1" />
        </div>
        <div>
          <Label className="text-sm">DC Number (optional)</Label>
          <Input value={dcNumber} onChange={(e) => setDcNumber(e.target.value)}
            placeholder="Delivery challan no." disabled={saving} className="mt-1" />
        </div>
      </div>

      {/* Inspected By */}
      <div>
        <Label className="text-sm">Inspected By (optional)</Label>
        <div className="mt-1">
          <UserCombobox value={inspectedByUsername}
            onSelect={(u) => { setInspectedByUserId(u.id); setInspectedByUsername(u.username); }}
            disabled={saving} />
        </div>
        {inspectedByUserId && (
          <button type="button" className="text-xs text-muted-foreground hover:text-destructive mt-1"
            onClick={() => { setInspectedByUserId(null); setInspectedByUsername(""); }} disabled={saving}>
            Clear inspector
          </button>
        )}
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm font-medium">Items Received</Label>
          {canEditFormItems && (
            <Button type="button" size="sm" variant="outline"
              onClick={() => setFormItems((prev) => [...prev, newRow()])} disabled={saving}>
              <PlusIcon className="size-3.5 mr-1" /> Add Item
            </Button>
          )}
        </div>

        {!canEditFormItems && (
          <div className="rounded-md bg-warning/15 border border-warning/20 px-3 py-2 text-xs text-warning mb-2">
            Items are locked — filling has already started. Use Fill Items or Return Items to adjust quantities.
          </div>
        )}

        <div className="space-y-3">
          {formItems.map((row, idx) => (
            <div key={row._key} className="rounded-lg border p-3 space-y-2 relative">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Item {idx + 1}</p>
                {canEditFormItems && formItems.length > 1 && (
                  <Button type="button" variant="ghost" size="icon"
                    className="size-6 text-destructive hover:text-destructive"
                    onClick={() => removeRow(row._key)} disabled={saving}>
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>

              {canEditFormItems ? (
                <>
                  {/* Category filter + inventory combobox */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Category</Label>
                      <select value={row.invTypeFilter}
                        onChange={(e) => updateRow(row._key, { invTypeFilter: e.target.value, inventory_item_id: null, item_name: "", item_code: "" })}
                        disabled={saving}
                        className="w-full px-2 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                        {INV_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground mb-1 block">Inventory Item</Label>
                      <SearchCombobox<InvItem>
                        variant="plain"
                        value={row.item_name}
                        disabled={saving}
                        placeholder="Search inventory item…"
                        fetcher={async (q) => {
                          const tf = row.invTypeFilter ? `&item_type=${encodeURIComponent(row.invTypeFilter)}` : "";
                          const qs = q.trim() ? `&search=${encodeURIComponent(q)}` : "";
                          const d = await apiFetchJson<PaginatedInv>(
                            `/api/v1/inventory?page_size=12&include_inactive=false${tf}${qs}`,
                          );
                          return d.items.map((i) => ({ id: i.id, code: i.code, name: i.name, item_type: i.item_type, unit: i.unit }));
                        }}
                        getItemKey={(i) => i.id}
                        getItemLabel={(i) => i.name}
                        onSelect={(item) => updateRow(row._key, {
                          inventory_item_id: item.id, item_name: item.name,
                          item_code: item.code, item_type: item.item_type, unit: item.unit,
                        })}
                        renderItem={(i) => (
                          <>
                            <span className="font-medium">{i.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{i.code}</span>
                            <span className="text-xs text-muted-foreground ml-1">· {i.unit}</span>
                          </>
                        )}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Item Name</Label>
                      <Input value={row.item_name}
                        onChange={(e) => updateRow(row._key, { item_name: e.target.value, inventory_item_id: null })}
                        placeholder="Name…" disabled={saving} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        Qty Received{row.unit ? ` (${row.unit})` : ""}
                        {row.quantity_pr_requested && (
                          <span className="ml-1 text-primary">(PR: {row.quantity_pr_requested})</span>
                        )}
                      </Label>
                      <Input type="number" min="0.001" step="any" value={row.quantity_received}
                        onChange={(e) => updateRow(row._key, { quantity_received: e.target.value })}
                        placeholder="0" disabled={saving} className="h-8 text-sm" />
                    </div>
                  </div>
                </>
              ) : (
                /* Read-only view when items are locked */
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-muted-foreground">Item:</span> <span className="font-medium">{row.item_name || "—"}</span></div>
                  <div><span className="text-muted-foreground">Qty:</span> <span className="font-medium">{row.quantity_received} {row.unit}</span></div>
                  {row.quantity_pr_requested && (
                    <div className="col-span-2"><span className="text-muted-foreground">PR requested:</span> <span className="font-medium text-primary">{row.quantity_pr_requested} {row.unit}</span></div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Goods Received Notes"
        breadcrumbs={[{ label: "Goods Received Notes" }]}
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Goods Received Notes (GRN)</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Record all goods received before moving them to storage.
            </p>
          </div>
          {canManage && (
            <Button size="sm" onClick={openAdd}>
              <PlusIcon className="size-4 mr-1" /> Add GRN
            </Button>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 border-b overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setStatusFilter(t.id); setPage(1); }}
              className={["px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
                statusFilter === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}>
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4"><Skeleton className="h-20 w-full" /></div>
            ))
          ) : grns.length === 0 ? (
            <div className="rounded-lg border px-4 py-12 text-center text-muted-foreground text-sm">No GRN records found.</div>
          ) : (
            grns.map((g) => (
              <div key={g.id} className="rounded-lg border p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-medium">{g.grn_number}</p>
                    <p className="text-sm text-muted-foreground">{fmtDate(g.created_at)}</p>
                  </div>
                  <StatusBadge status={g.status} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-muted-foreground">Received by:</span> <span className="font-medium">{g.received_by_username ?? "—"}</span></div>
                  <div className="flex items-center gap-1">
                    {g.transport_type === "company"
                      ? <><Truck className="size-3 text-muted-foreground" /><span>{g.vehicle_number ?? "Company"}</span></>
                      : <><Car className="size-3 text-muted-foreground" /><span>Own Transport</span></>}
                  </div>
                  {g.purchase_request_sn_no && (
                    <div><span className="text-muted-foreground">PR:</span> <span className="font-mono font-medium">{g.purchase_request_sn_no}</span></div>
                  )}
                  {g.inspected_by_username && (
                    <div><span className="text-muted-foreground">Inspector:</span> <span className="font-medium">{g.inspected_by_username}</span></div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Items:</span>{" "}
                    <span className="font-medium">{g.items.length}</span>
                    {g.items.some((i) => i.quantity_filled > 0) && (
                      <span className="text-muted-foreground ml-1">
                        ({g.items.filter((i) => i.quantity_filled + i.quantity_returned >= i.quantity_received - 1e-9).length} done)
                      </span>
                    )}
                  </div>
                  {(() => {
                    const totalPrQty = g.items.reduce((s, i) => s + (i.quantity_pr_requested ?? 0), 0);
                    const totalRcvd = g.items.reduce((s, i) => s + i.quantity_received, 0);
                    const has = g.items.some((i) => i.quantity_pr_requested != null);
                    if (!has) return null;
                    const short = totalRcvd < totalPrQty - 1e-9;
                    const over = totalRcvd > totalPrQty + 1e-9;
                    return (
                      <div>
                        <span className="text-muted-foreground">PR / Rcvd:</span>{" "}
                        <span className={`font-semibold tabular-nums ${short ? "text-destructive" : over ? "text-warning" : "text-success"}`}>
                          {totalPrQty} / {totalRcvd}
                        </span>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex justify-end gap-1 pt-1 border-t">
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewGrn(g)} title="View">
                    <Eye className="size-3.5" />
                  </Button>
                  {canManage && (
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(g)} title="Edit">
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                  {canManage && g.status !== "stock_filled" && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-success hover:text-green-900"
                      onClick={() => { setFillGrn(g); initFillQtys(g); }}>
                      <CheckCircle className="size-3.5 mr-1" />
                      {g.status === "partially_filled" ? "Fill More" : "Fill Items"}
                    </Button>
                  )}
                  {canManage && g.status !== "draft" && g.items.some((i) => i.quantity_filled > 0) && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-rose-700 hover:text-rose-900"
                      onClick={() => { setReturnGrn(g); initReturnQtys(g); }}>
                      <RotateCcw className="size-3.5 mr-1" /> Return
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium whitespace-nowrap">GRN #</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium whitespace-nowrap">PR #</th>
                  <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Received By</th>
                  <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Inspected By</th>
                  <th className="px-4 py-3 text-center font-medium">Items</th>
                  <th className="px-4 py-3 text-center font-medium whitespace-nowrap">PR / Rcvd</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 9 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : grns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                      No GRN records found.
                    </td>
                  </tr>
                ) : (
                  grns.map((g) => {
                    const filledCount = g.items.filter((i) => i.quantity_filled + i.quantity_returned >= i.quantity_received - 1e-9).length;
                    const totalPrQty = g.items.reduce((s, i) => s + (i.quantity_pr_requested ?? 0), 0);
                    const totalReceivedQty = g.items.reduce((s, i) => s + i.quantity_received, 0);
                    const hasPrQty = g.items.some((i) => i.quantity_pr_requested != null);
                    const qtyShort = hasPrQty && totalReceivedQty < totalPrQty - 1e-9;
                    const qtyOver = hasPrQty && totalReceivedQty > totalPrQty + 1e-9;
                    return (
                      <tr key={g.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-medium">{g.grn_number}</td>
                        <td className="px-4 py-3 text-xs">{fmtDate(g.created_at)}</td>
                        <td className="px-4 py-3 text-xs">
                          {g.purchase_request_sn_no
                            ? <span className="font-mono text-primary">{g.purchase_request_sn_no}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">{g.received_by_username ?? "—"}</td>
                        <td className="px-4 py-3 text-sm">{g.inspected_by_username ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-medium">{g.items.length}</span>
                          {g.items.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {filledCount}/{g.items.length} done
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {hasPrQty ? (
                            <span className={`text-xs font-semibold tabular-nums ${
                              qtyShort ? "text-destructive" : qtyOver ? "text-warning" : "text-success"
                            }`}>
                              {totalPrQty} / {totalReceivedQty}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewGrn(g)} title="View details">
                              <Eye className="size-3.5" />
                            </Button>
                            {canManage && (
                              <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(g)} title="Edit">
                                <Pencil className="size-3.5" />
                              </Button>
                            )}
                            {canManage && g.status !== "stock_filled" && (
                              <Button variant="ghost" size="sm" className="h-8 text-xs text-success hover:text-green-900"
                                onClick={() => { setFillGrn(g); initFillQtys(g); }}>
                                <CheckCircle className="size-3.5 mr-1" />
                                {g.status === "partially_filled" ? "Fill More" : "Fill Items"}
                              </Button>
                            )}
                            {canManage && g.status !== "draft" && g.items.some((i) => i.quantity_filled > 0) && (
                              <Button variant="ghost" size="sm" className="h-8 text-xs text-rose-700 hover:text-rose-900"
                                onClick={() => { setReturnGrn(g); initReturnQtys(g); }}>
                                <RotateCcw className="size-3.5 mr-1" /> Return
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-sm text-muted-foreground">{total} record{total !== 1 ? "s" : ""}</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-2">{page} / {totalPages}</span>
              <Button variant="outline" size="icon" className="size-8" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add / Edit GRN Dialog ──────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={(o) => !saving && setFormOpen(o)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingGrn ? `Edit ${editingGrn.grn_number}` : "Add Goods Received Note"}
            </DialogTitle>
          </DialogHeader>
          {FormBody}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" /> Saving…</> : editingGrn ? "Save Changes" : "Create GRN"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Fill Items Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={fillGrn !== null} onOpenChange={(o) => !filling && !o && setFillGrn(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="size-4 text-success" />
              Fill Items — {fillGrn?.grn_number}
            </DialogTitle>
          </DialogHeader>
          {fillGrn && (
            <div className="space-y-4 text-sm">
              {fillErr && <p className="text-sm text-destructive">{fillErr}</p>}
              <p className="text-xs text-muted-foreground">
                Enter the quantity to move into inventory. You can partially fill and come back later.
              </p>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">PR Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Rcvd</th>
                      <th className="px-3 py-2 text-right font-medium">Filled</th>
                      <th className="px-3 py-2 text-right font-medium">Remaining</th>
                      <th className="px-3 py-2 text-right font-medium">Fill Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {fillGrn.items.map((item) => {
                      const remaining = item.quantity_received - item.quantity_filled - item.quantity_returned;
                      const canFill = remaining > 1e-9;
                      return (
                        <tr key={item.id} className={!canFill ? "opacity-50" : ""}>
                          <td className="px-3 py-2">
                            <span className="font-medium">{item.item_name ?? "—"}</span>
                            {item.item_code && <span className="text-muted-foreground ml-1 font-mono">{item.item_code}</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-primary">
                            {item.quantity_pr_requested != null ? item.quantity_pr_requested : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{item.quantity_received} {item.unit ?? ""}</td>
                          <td className="px-3 py-2 text-right font-mono text-success">{item.quantity_filled}</td>
                          <td className="px-3 py-2 text-right font-mono text-warning">{Math.round(remaining * 1000) / 1000}</td>
                          <td className="px-3 py-2 text-right">
                            {canFill ? (
                              <Input type="number" min="0" max={remaining} step="any"
                                value={fillQtys[item.id] ?? ""}
                                onChange={(e) => setFillQtys((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                disabled={filling} className="h-7 w-24 text-xs text-right ml-auto" />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2 pt-1 border-t">
                <Button variant="outline" onClick={() => setFillGrn(null)} disabled={filling}>Cancel</Button>
                <Button onClick={handleFillItems} disabled={filling} className="bg-green-600 hover:bg-green-700 text-white">
                  {filling ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" /> Processing…</> : "Move to Stock"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Return Items Dialog ───────────────────────────────────────────────── */}
      <Dialog open={returnGrn !== null} onOpenChange={(o) => !returning && !o && setReturnGrn(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-4 text-rose-600" />
              Return Items — {returnGrn?.grn_number}
            </DialogTitle>
          </DialogHeader>
          {returnGrn && (
            <div className="space-y-4 text-sm">
              {returnErr && <p className="text-sm text-destructive">{returnErr}</p>}
              <p className="text-xs text-muted-foreground">
                Enter the quantity to return from stock. Only previously filled quantities can be returned.
              </p>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">Filled</th>
                      <th className="px-3 py-2 text-right font-medium">Returned</th>
                      <th className="px-3 py-2 text-right font-medium">Return Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {returnGrn.items.filter((item) => item.quantity_filled > 1e-9).map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <span className="font-medium">{item.item_name ?? "—"}</span>
                          {item.item_code && <span className="text-muted-foreground ml-1 font-mono">{item.item_code}</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-success">{item.quantity_filled} {item.unit ?? ""}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{item.quantity_returned}</td>
                        <td className="px-3 py-2 text-right">
                          <Input type="number" min="0" max={item.quantity_filled} step="any"
                            value={returnQtys[item.id] ?? ""}
                            onChange={(e) => setReturnQtys((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            disabled={returning} className="h-7 w-24 text-xs text-right ml-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2 pt-1 border-t">
                <Button variant="outline" onClick={() => setReturnGrn(null)} disabled={returning}>Cancel</Button>
                <Button onClick={handleReturnItems} disabled={returning} className="bg-rose-600 hover:bg-rose-700 text-white">
                  {returning ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" /> Processing…</> : "Confirm Return"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── View Detail Dialog ───────────────────────────────────────────────── */}
      <Dialog open={viewGrn !== null} onOpenChange={(o) => !o && setViewGrn(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="size-4" /> {viewGrn?.grn_number}
              {viewGrn && <StatusBadge status={viewGrn.status} />}
              {viewGrn && (
                <Button
                  size="sm" variant="outline" className="ml-auto h-7 text-xs"
                  onClick={() => printGRN(viewGrn)}
                >
                  <Printer className="size-3 mr-1" />
                  Print
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewGrn && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Received By</p>
                  <p className="font-medium">{viewGrn.received_by_username ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{fmtDate(viewGrn.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Transport</p>
                  <div className="flex items-center gap-1.5 font-medium">
                    {viewGrn.transport_type === "company"
                      ? <><Truck className="size-3.5 text-muted-foreground" /> Company Transport</>
                      : <><Car className="size-3.5 text-muted-foreground" /> Own Transport</>}
                  </div>
                </div>
                {viewGrn.vehicle_number && (
                  <div>
                    <p className="text-xs text-muted-foreground">Vehicle No.</p>
                    <p className="font-mono font-medium">{viewGrn.vehicle_number}</p>
                  </div>
                )}
                {viewGrn.inspected_by_username && (
                  <div>
                    <p className="text-xs text-muted-foreground">Inspected By</p>
                    <p className="font-medium">{viewGrn.inspected_by_username}</p>
                  </div>
                )}
                {viewGrn.purchase_request_sn_no && (
                  <div>
                    <p className="text-xs text-muted-foreground">Linked PR</p>
                    <p className="font-mono font-medium text-primary">{viewGrn.purchase_request_sn_no}</p>
                  </div>
                )}
                {viewGrn.po_number && (
                  <div>
                    <p className="text-xs text-muted-foreground">PO Number</p>
                    <p className="font-mono font-medium">{viewGrn.po_number}</p>
                  </div>
                )}
                {viewGrn.dc_number && (
                  <div>
                    <p className="text-xs text-muted-foreground">DC Number</p>
                    <p className="font-mono font-medium">{viewGrn.dc_number}</p>
                  </div>
                )}
                {viewGrn.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="italic">{viewGrn.notes}</p>
                  </div>
                )}
                {(viewGrn.status === "stock_filled" || viewGrn.status === "partially_filled") && viewGrn.stock_filled_by_username && (
                  <div className="col-span-2 rounded-md bg-success/10 border border-success/20 p-2.5">
                    <p className="text-xs text-success">
                      Last filled by <strong>{viewGrn.stock_filled_by_username}</strong> on {fmtDateTime(viewGrn.stock_filled_at)}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Items</p>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-3 py-2 text-left font-medium">Item</th>
                        <th className="px-3 py-2 text-right font-medium">PR Qty</th>
                        <th className="px-3 py-2 text-right font-medium">Received</th>
                        <th className="px-3 py-2 text-right font-medium">Filled</th>
                        <th className="px-3 py-2 text-right font-medium">Returned</th>
                        <th className="px-3 py-2 text-right font-medium">Remaining</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {viewGrn.items.map((item) => {
                        const remaining = item.quantity_received - item.quantity_filled - item.quantity_returned;
                        const qtyMismatch = item.quantity_pr_requested != null && Math.abs(item.quantity_received - item.quantity_pr_requested) > 1e-9;
                        return (
                          <tr key={item.id}>
                            <td className="px-3 py-2">
                              <span className="font-medium">{item.item_name ?? "—"}</span>
                              {item.item_code && <span className="text-muted-foreground ml-1.5 font-mono">{item.item_code}</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-primary">
                              {item.quantity_pr_requested != null ? item.quantity_pr_requested : "—"}
                            </td>
                            <td className={["px-3 py-2 text-right font-mono font-medium", qtyMismatch ? "text-tone-amber" : ""].join(" ")}>
                              {item.quantity_received} {item.unit ?? ""}
                              {qtyMismatch && <span className="ml-1 text-orange-500" title="Quantity differs from PR">⚠</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-success">{item.quantity_filled}</td>
                            <td className="px-3 py-2 text-right font-mono text-rose-700">{item.quantity_returned}</td>
                            <td className="px-3 py-2 text-right font-mono text-warning">{Math.round(remaining * 1000) / 1000}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
