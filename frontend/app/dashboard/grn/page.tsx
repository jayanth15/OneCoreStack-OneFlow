"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
}

interface GRNRecord {
  id: number;
  grn_number: string;
  transport_type: string;
  vehicle_number: string | null;
  received_by_username: string | null;
  notes: string | null;
  status: string; // draft | stock_filled
  stock_filled_by_username: string | null;
  stock_filled_at: string | null;
  created_at: string;
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

// ── Form row type ─────────────────────────────────────────────────────────────

interface FormItemRow {
  _key: number;
  inventory_item_id: number | null;
  item_name: string;
  item_code: string;
  item_type: string;
  unit: string;
  quantity_received: string;
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
  };
}

// ── Inventory combobox ────────────────────────────────────────────────────────

function InvCombobox({
  value,
  onSelect,
  disabled,
}: {
  value: string;
  onSelect: (item: InvItem) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<InvItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const search = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const qs = q.trim() ? `&search=${encodeURIComponent(q)}` : "";
        const d = await apiFetchJson<PaginatedInv>(
          `/api/v1/inventory?page_size=12&include_inactive=false${qs}`
        );
        setResults(
          d.items.map((i) => ({
            id: i.id,
            code: i.code,
            name: i.name,
            item_type: i.item_type,
            unit: i.unit,
          }))
        );
      } catch {
        // ignore search errors
      } finally {
        setBusy(false);
      }
    }, q.trim() ? 300 : 0);
  }, []);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder="Search inventory item…"
        className="w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          search(e.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          if (!query) search("");
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (results.length > 0 || busy) && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md overflow-hidden">
          {busy && results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> Searching…
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                onMouseDown={() => {
                  onSelect(item);
                  setQuery(item.name);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{item.code}</span>
                <span className="text-xs text-muted-foreground ml-1">· {item.unit}</span>
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
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "stock_filled") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
        <CheckCircle className="size-3" /> Stock Filled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
      <Clock className="size-3" /> Draft
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GRNPage() {
  const [data, setData] = useState<PaginatedGRN | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [canManage, setCanManage] = useState(false);

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [transportType, setTransportType] = useState<"own" | "company">("own");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [grnNotes, setGrnNotes] = useState("");
  const [formItems, setFormItems] = useState<FormItemRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  // View detail dialog
  const [viewGrn, setViewGrn] = useState<GRNRecord | null>(null);

  // Mark stock filled confirm
  const [markFillId, setMarkFillId] = useState<number | null>(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      // /me returns effective grn_access (true for admin/super_admin automatically)
      setCanManage(user.grn_access === true);
    }
  }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (statusFilter !== "all") params.set("status_filter", statusFilter);
    apiFetchJson<PaginatedGRN>(`/api/v1/grn?${params}`)
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function openAdd() {
    setTransportType("own");
    setVehicleNumber("");
    setGrnNotes("");
    setFormItems([newRow()]);
    setFormErr(null);
    setAddOpen(true);
  }

  function updateRow(key: number, patch: Partial<FormItemRow>) {
    setFormItems((prev) =>
      prev.map((r) => (r._key === key ? { ...r, ...patch } : r))
    );
  }

  function removeRow(key: number) {
    setFormItems((prev) => prev.filter((r) => r._key !== key));
  }

  async function handleSave() {
    setFormErr(null);
    if (formItems.length === 0) {
      setFormErr("Add at least one item");
      return;
    }
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
    if (transportType === "company" && !vehicleNumber.trim()) {
      setFormErr("Vehicle number is required for Company Transport");
      return;
    }
    setSaving(true);
    try {
      await apiFetchJson("/api/v1/grn", {
        method: "POST",
        body: JSON.stringify({
          transport_type: transportType,
          vehicle_number:
            transportType === "company" ? vehicleNumber.trim() : null,
          notes: grnNotes.trim() || null,
          items: formItems.map((r) => ({
            inventory_item_id: r.inventory_item_id,
            item_name: r.item_name.trim() || null,
            item_code: r.item_code.trim() || null,
            item_type: r.item_type || null,
            unit: r.unit.trim() || null,
            quantity_received: parseFloat(r.quantity_received),
          })),
        }),
      });
      setAddOpen(false);
      fetchData();
    } catch (e: unknown) {
      setFormErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkFilled() {
    if (markFillId === null) return;
    setMarking(true);
    try {
      await apiFetchJson(`/api/v1/grn/${markFillId}/mark-stock-filled`, {
        method: "POST",
      });
      setMarkFillId(null);
      fetchData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to mark stock filled");
    } finally {
      setMarking(false);
    }
  }

  const grns = data?.items ?? [];
  const totalPages = data?.pages ?? 1;
  const total = data?.total ?? 0;

  const TABS = [
    { id: "all", label: "All" },
    { id: "draft", label: "Draft" },
    { id: "stock_filled", label: "Stock Filled" },
  ];

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Goods Received Notes</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

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
            <button
              key={t.id}
              onClick={() => {
                setStatusFilter(t.id);
                setPage(1);
              }}
              className={[
                "px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
                statusFilter === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4">
                <Skeleton className="h-20 w-full" />
              </div>
            ))
          ) : grns.length === 0 ? (
            <div className="rounded-lg border px-4 py-12 text-center text-muted-foreground text-sm">
              No GRN records found.
            </div>
          ) : (
            grns.map((g) => (
              <div key={g.id} className="rounded-lg border p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-medium">{g.grn_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {fmtDate(g.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={g.status} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Received by:</span>{" "}
                    <span className="font-medium">
                      {g.received_by_username ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {g.transport_type === "company" ? (
                      <>
                        <Truck className="size-3 text-muted-foreground" />
                        <span>{g.vehicle_number ?? "Company"}</span>
                      </>
                    ) : (
                      <>
                        <Car className="size-3 text-muted-foreground" />
                        <span>Own Transport</span>
                      </>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Items:</span>{" "}
                    <span className="font-medium">{g.items.length}</span>
                  </div>
                </div>
                <div className="flex justify-end gap-1 pt-1 border-t">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setViewGrn(g)}
                    title="View"
                  >
                    <Eye className="size-3.5" />
                  </Button>
                  {canManage && g.status === "draft" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-green-700 hover:text-green-900"
                      onClick={() => setMarkFillId(g.id)}
                    >
                      <CheckCircle className="size-3.5 mr-1" /> Mark Filled
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
                  <th className="px-4 py-3 text-left font-medium">GRN #</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Received By</th>
                  <th className="px-4 py-3 text-left font-medium">Transport</th>
                  <th className="px-4 py-3 text-center font-medium">Items</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : grns.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      No GRN records found.
                    </td>
                  </tr>
                ) : (
                  grns.map((g) => (
                    <tr
                      key={g.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-medium">
                        {g.grn_number}
                      </td>
                      <td className="px-4 py-3 text-xs">{fmtDate(g.created_at)}</td>
                      <td className="px-4 py-3 text-sm">
                        {g.received_by_username ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-1.5">
                          {g.transport_type === "company" ? (
                            <>
                              <Truck className="size-3.5 text-muted-foreground" />
                              <span>
                                Company{" "}
                                <span className="font-mono text-muted-foreground">
                                  ({g.vehicle_number})
                                </span>
                              </span>
                            </>
                          ) : (
                            <>
                              <Car className="size-3.5 text-muted-foreground" />
                              <span>Own</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">
                        {g.items.length}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={g.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setViewGrn(g)}
                            title="View details"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          {canManage && g.status === "draft" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-green-700 hover:text-green-900"
                              onClick={() => setMarkFillId(g.id)}
                            >
                              <CheckCircle className="size-3.5 mr-1" /> Mark Filled
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-sm text-muted-foreground">
              {total} record{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add GRN Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={(o) => !saving && setAddOpen(o)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Goods Received Note</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {formErr && <p className="text-sm text-destructive">{formErr}</p>}

            {/* Transport */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Transport Type
              </Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="transport"
                    value="own"
                    checked={transportType === "own"}
                    onChange={() => {
                      setTransportType("own");
                      setVehicleNumber("");
                    }}
                    disabled={saving}
                  />
                  <Car className="size-3.5 text-muted-foreground" />
                  <span className="text-sm">Own Transport</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="transport"
                    value="company"
                    checked={transportType === "company"}
                    onChange={() => setTransportType("company")}
                    disabled={saving}
                  />
                  <Truck className="size-3.5 text-muted-foreground" />
                  <span className="text-sm">Company Transport</span>
                </label>
              </div>
            </div>

            {/* Vehicle number */}
            {transportType === "company" && (
              <div>
                <Label htmlFor="vehicle_no" className="text-sm">
                  Vehicle Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="vehicle_no"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="e.g. TN01AB1234"
                  disabled={saving}
                  className="mt-1"
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <Label htmlFor="grn_notes" className="text-sm">
                Notes (optional)
              </Label>
              <Input
                id="grn_notes"
                value={grnNotes}
                onChange={(e) => setGrnNotes(e.target.value)}
                placeholder="Any delivery notes…"
                disabled={saving}
                className="mt-1"
              />
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Items Received</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setFormItems((prev) => [...prev, newRow()])}
                  disabled={saving}
                >
                  <PlusIcon className="size-3.5 mr-1" /> Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {formItems.map((row, idx) => (
                  <div
                    key={row._key}
                    className="rounded-lg border p-3 space-y-2 relative"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">
                        Item {idx + 1}
                      </p>
                      {formItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 text-destructive hover:text-destructive"
                          onClick={() => removeRow(row._key)}
                          disabled={saving}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </div>

                    {/* Inventory search combobox */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        Inventory Item
                      </Label>
                      <InvCombobox
                        value={row.item_name}
                        disabled={saving}
                        onSelect={(item) =>
                          updateRow(row._key, {
                            inventory_item_id: item.id,
                            item_name: item.name,
                            item_code: item.code,
                            item_type: item.item_type,
                            unit: item.unit,
                          })
                        }
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Item name — editable override */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Item Name
                        </Label>
                        <Input
                          value={row.item_name}
                          onChange={(e) =>
                            updateRow(row._key, {
                              item_name: e.target.value,
                              inventory_item_id: null,
                            })
                          }
                          placeholder="Name…"
                          disabled={saving}
                          className="h-8 text-sm"
                        />
                      </div>
                      {/* Quantity */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Qty Received{row.unit ? ` (${row.unit})` : ""}
                        </Label>
                        <Input
                          type="number"
                          min="0.001"
                          step="any"
                          value={row.quantity_received}
                          onChange={(e) =>
                            updateRow(row._key, {
                              quantity_received: e.target.value,
                            })
                          }
                          placeholder="0"
                          disabled={saving}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Create GRN"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Mark Stock Filled Confirmation ────────────────────────────────────── */}
      <AlertDialog
        open={markFillId !== null}
        onOpenChange={(o) => !o && setMarkFillId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Stock Filled?</AlertDialogTitle>
            <AlertDialogDescription>
              This will add the received quantities to inventory stock levels and
              write history entries for each linked item. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={marking}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMarkFilled} disabled={marking}>
              {marking ? "Processing…" : "Confirm — Move to Stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── View Detail Dialog ───────────────────────────────────────────────── */}
      <Dialog
        open={viewGrn !== null}
        onOpenChange={(o) => !o && setViewGrn(null)}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="size-4" /> {viewGrn?.grn_number}
              {viewGrn && <StatusBadge status={viewGrn.status} />}
            </DialogTitle>
          </DialogHeader>
          {viewGrn && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Received By</p>
                  <p className="font-medium">
                    {viewGrn.received_by_username ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{fmtDate(viewGrn.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Transport</p>
                  <div className="flex items-center gap-1.5 font-medium">
                    {viewGrn.transport_type === "company" ? (
                      <>
                        <Truck className="size-3.5 text-muted-foreground" />
                        Company Transport
                      </>
                    ) : (
                      <>
                        <Car className="size-3.5 text-muted-foreground" />
                        Own Transport
                      </>
                    )}
                  </div>
                </div>
                {viewGrn.vehicle_number && (
                  <div>
                    <p className="text-xs text-muted-foreground">Vehicle No.</p>
                    <p className="font-mono font-medium">
                      {viewGrn.vehicle_number}
                    </p>
                  </div>
                )}
                {viewGrn.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="italic">{viewGrn.notes}</p>
                  </div>
                )}
                {viewGrn.status === "stock_filled" && (
                  <div className="col-span-2 rounded-md bg-green-50 border border-green-200 p-2.5">
                    <p className="text-xs text-green-700">
                      Stock filled by{" "}
                      <strong>{viewGrn.stock_filled_by_username}</strong> on{" "}
                      {fmtDateTime(viewGrn.stock_filled_at)}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Items
                </p>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-3 py-2 text-left font-medium">Item</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {viewGrn.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">
                            <span className="font-medium">
                              {item.item_name ?? "—"}
                            </span>
                            {item.item_code && (
                              <span className="text-muted-foreground ml-1.5 font-mono">
                                {item.item_code}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium">
                            {item.quantity_received} {item.unit ?? ""}
                          </td>
                        </tr>
                      ))}
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
