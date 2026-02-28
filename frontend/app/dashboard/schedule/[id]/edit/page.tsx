"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { ArrowLeft, PackageCheck, PackageX, TrendingDown, ExternalLink } from "lucide-react";

interface CustomerOption { id: number; name: string; }
interface FGItem { id: number; name: string; code: string; unit: string; quantity_on_hand: number; }

interface RmRequirement {
  raw_material_id: number;
  raw_material_name: string;
  raw_material_unit: string;
  qty_per_unit: number;
  required_qty: number;
  available_qty: number;
  shortfall: number;
}
interface Availability {
  product_name: string;
  requested_qty: number;
  fg_available: number;
  fg_shortfall: number;
  has_fg_shortfall: boolean;
  rm_requirements: RmRequirement[];
  has_rm_shortfall: boolean;
}

interface ScheduleForm {
  customer_name: string;
  description: string;
  scheduled_date: string;
  scheduled_qty: number;
  backlog_qty: number;
  notes: string;
  status: string;
  is_active: boolean;
}

export default function EditSchedulePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<ScheduleForm>({
    customer_name: "", description: "", scheduled_date: "",
    scheduled_qty: 0, backlog_qty: 0, notes: "",
    status: "pending", is_active: true,
  });
  const [scheduleNumber, setScheduleNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dropdown data
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [fgItems, setFgItems] = useState<FGItem[]>([]);

  const fetchAvailability = useCallback((description: string, qty: number) => {
    if (!description.trim() || qty <= 0) { setAvailability(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setAvailLoading(true);
      try {
        const data = await apiFetchJson<Availability>(
          `/api/v1/schedules/availability?product_name=${encodeURIComponent(description)}&qty=${qty}`
        );
        setAvailability(data);
      } catch {
        setAvailability(null);
      } finally {
        setAvailLoading(false);
      }
    }, 600);
  }, []);

  useEffect(() => {
    // Load dropdown data
    apiFetchJson<CustomerOption[]>("/api/v1/customers/names").then(setCustomers).catch(() => {});
    apiFetchJson<{ items: FGItem[] }>("/api/v1/inventory?item_type=finished_good&page_size=500").then((d) => setFgItems(d.items)).catch(() => {});

    if (!id) return;
    apiFetchJson<ScheduleForm & { id: number; schedule_number: string }>(`/api/v1/schedules/${id}`)
      .then((d) => {
        setScheduleNumber(d.schedule_number);
        setForm({
          customer_name: d.customer_name,
          description: d.description,
          scheduled_date: d.scheduled_date,
          scheduled_qty: d.scheduled_qty,
          backlog_qty: d.backlog_qty,
          notes: d.notes ?? "",
          status: d.status,
          is_active: d.is_active,
        });
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [id]);

  function set(key: string, val: unknown) {
    setForm((f) => {
      const next = { ...f, [key]: val };
      if (key === "description" || key === "scheduled_qty") {
        fetchAvailability(
          key === "description" ? String(val) : next.description,
          key === "scheduled_qty" ? Number(val) : next.scheduled_qty
        );
      }
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_name.trim()) { setSaveError("Customer name is required"); return; }
    if (!form.description.trim()) { setSaveError("Description is required"); return; }
    if (!form.scheduled_date) { setSaveError("Delivery date is required"); return; }
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetchJson(`/api/v1/schedules/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          notes: form.notes || null,
        }),
      });
      router.push("/dashboard/schedule");
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link href="/dashboard/schedule" className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
          <ArrowLeft className="size-4" />
        </Link>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/schedule">Schedule</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{loading ? "Edit…" : `Edit ${scheduleNumber}`}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Edit Schedule</h1>
          {!loading && scheduleNumber && (
            <p className="text-sm text-muted-foreground mt-1">
              Editing <span className="font-mono font-medium">{scheduleNumber}</span> — {form.customer_name}
            </p>
          )}
        </div>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : loading ? (
          <div className="space-y-5">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            {/* Customer name — dropdown */}
            <div className="space-y-1.5">
              <Label htmlFor="customer_name">Customer / OEM Name <span className="text-destructive">*</span></Label>
              {customers.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
                  No customers yet —
                  <Link href="/dashboard/customers" className="underline font-medium inline-flex items-center gap-1">
                    Add a customer first <ExternalLink className="size-3" />
                  </Link>
                </div>
              ) : (
                <select
                  id="customer_name"
                  value={form.customer_name}
                  onChange={(e) => set("customer_name", e.target.value)}
                  disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">— Select customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Product — FG dropdown */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Product (Finished Good) <span className="text-destructive">*</span></Label>
                <Link href="/dashboard/inventory/new" className="text-xs text-muted-foreground underline inline-flex items-center gap-1 hover:text-foreground">
                  + Create FG <ExternalLink className="size-3" />
                </Link>
              </div>
              {fgItems.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
                  No finished goods yet —
                  <Link href="/dashboard/inventory/new" className="underline font-medium inline-flex items-center gap-1">
                    Create a Finished Good first <ExternalLink className="size-3" />
                  </Link>
                </div>
              ) : (
                <select
                  id="description"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">— Select product —</option>
                  {fgItems.map((fg) => (
                    <option key={fg.id} value={fg.name}>
                      {fg.code} · {fg.name} ({fg.quantity_on_hand} {fg.unit} in stock)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Delivery date */}
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_date">Delivery Date <span className="text-destructive">*</span></Label>
              <Input
                id="scheduled_date"
                type="date"
                value={form.scheduled_date}
                onChange={(e) => set("scheduled_date", e.target.value)}
                disabled={saving}
              />
            </div>

            {/* Qty row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="scheduled_qty">Scheduled Qty</Label>
                <Input
                  id="scheduled_qty"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={form.scheduled_qty}
                  onChange={(e) => set("scheduled_qty", parseFloat(e.target.value) || 0)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backlog_qty">Backlog Qty <span className="text-xs text-muted-foreground font-normal">(prev. month)</span></Label>
                <Input
                  id="backlog_qty"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={form.backlog_qty}
                  onChange={(e) => set("backlog_qty", parseFloat(e.target.value) || 0)}
                  disabled={saving}
                />
              </div>
            </div>

            {/* Availability panel */}
            {(availLoading || availability) && (
              <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
                <p className="text-sm font-medium">Inventory Availability</p>
                {availLoading && <p className="text-xs text-muted-foreground">Checking…</p>}
                {!availLoading && availability && (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      {availability.has_fg_shortfall
                        ? <PackageX className="size-4 text-destructive shrink-0" />
                        : <PackageCheck className="size-4 text-emerald-600 shrink-0" />}
                      <span className="font-medium">Finished Goods:</span>
                      <span>In stock&nbsp;<strong>{availability.fg_available}</strong></span>
                      <span className="text-muted-foreground">/</span>
                      <span>Need&nbsp;<strong>{availability.requested_qty}</strong></span>
                      {availability.has_fg_shortfall && (
                        <span className="text-destructive ml-auto shrink-0">Shortfall&nbsp;{availability.fg_shortfall}</span>
                      )}
                    </div>
                    {availability.rm_requirements.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left py-1 pr-3 font-medium">Raw Material</th>
                              <th className="text-right py-1 pr-3 font-medium">Have</th>
                              <th className="text-right py-1 pr-3 font-medium">Need</th>
                              <th className="text-right py-1 font-medium">Shortfall</th>
                            </tr>
                          </thead>
                          <tbody>
                            {availability.rm_requirements.map((r) => (
                              <tr key={r.raw_material_id} className="border-b last:border-0">
                                <td className="py-1 pr-3">{r.raw_material_name}</td>
                                <td className="text-right py-1 pr-3">{r.available_qty}&nbsp;{r.raw_material_unit}</td>
                                <td className="text-right py-1 pr-3">{r.required_qty}&nbsp;{r.raw_material_unit}</td>
                                <td className="text-right py-1">
                                  {r.shortfall > 0
                                    ? <span className="text-destructive flex items-center justify-end gap-1"><TrendingDown className="size-3" />{r.shortfall}</span>
                                    : <span className="text-emerald-600">OK</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {availability.rm_requirements.length === 0 && (
                      <p className="text-xs text-muted-foreground">No BOM defined for this product yet.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Status */}
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="in_production">In Production</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Active */}
            <div className="space-y-1.5">
              <Label htmlFor="is_active">Active</Label>
              <select
                id="is_active"
                value={form.is_active ? "true" : "false"}
                onChange={(e) => set("is_active", e.target.value === "true")}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none"
              />
            </div>

            {saveError && <p className="text-sm text-destructive" role="alert">{saveError}</p>}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/dashboard/schedule")} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
