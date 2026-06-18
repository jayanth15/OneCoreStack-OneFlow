"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerDispatchBlock } from "./customer-dispatch-block";
import type {
  CreateRequestPayload, RequestType, RequestItem, RequestCustomerDispatch,
} from "@/lib/requests";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/user";

interface DeptRef {
  id: number;
  code: string;
  name: string;
}

interface InventoryItem {
  id: number;
  code: string;
  name: string;
  unit: string;
  item_type: string;
}

interface PaginatedInventory {
  items: InventoryItem[];
}

type RequestableItemType =
  | "raw_material"
  | "finished_good"
  | "semi_finished"
  | "spare"
  | "consumable";

const ITEM_TYPE_OPTIONS: { value: RequestableItemType; label: string }[] = [
  { value: "raw_material", label: "Raw materials" },
  { value: "finished_good", label: "Finished goods" },
  { value: "semi_finished", label: "Semi-finished" },
  { value: "spare", label: "Spares" },
  { value: "consumable", label: "Consumables" },
];

const DEFAULT_ITEM: RequestItem = { item_name: "", quantity: 1 };
const DEFAULT_DISPATCH: RequestCustomerDispatch = { inventory_type: "weeder", quantity: 1 };

export interface RequestFormProps {
  defaultType?: RequestType;
  defaultValues?: Partial<CreateRequestPayload>;
  onSubmit: (payload: CreateRequestPayload) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export function RequestForm({
  defaultType = "internal_transfer",
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = "Create request",
}: RequestFormProps) {
  const [type, setType] = useState<RequestType>(defaultValues?.request_type ?? defaultType);
  const [department, setDepartment] = useState(defaultValues?.department ?? "");
  const [fromWhom, setFromWhom] = useState(defaultValues?.from_whom ?? "");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [items, setItems] = useState<RequestItem[]>(defaultValues?.items ?? [DEFAULT_ITEM]);
  const [dispatch, setDispatch] = useState<RequestCustomerDispatch>(
    defaultValues?.dispatch ?? DEFAULT_DISPATCH
  );
  const [busy, setBusy] = useState(false);

  const [depts, setDepts] = useState<DeptRef[]>([]);
  const [deptsLoadFailed, setDeptsLoadFailed] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [itemType, setItemType] = useState<RequestableItemType>("raw_material");

  useEffect(() => {
    apiFetchJson<DeptRef[]>("/api/v1/admin/departments?include_inactive=false")
      .then((all) => {
        const user = getCurrentUser();
        const isAdmin = user?.role === "admin" || user?.role === "super_admin";
        const allowed = user?.request_departments;
        if (isAdmin || !allowed || allowed.length === 0) {
          setDepts(all);
        } else {
          setDepts(all.filter((d) => allowed.includes(d.id)));
        }
      })
      .catch(() => setDeptsLoadFailed(true));
  }, []);

  useEffect(() => {
    apiFetchJson<PaginatedInventory>(
      `/api/v1/inventory?item_type=${itemType}&page_size=500&include_inactive=false`
    )
      .then((r) => setInventoryItems(r.items))
      .catch(() => setInventoryItems([]));
  }, [itemType]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: CreateRequestPayload = {
        request_type: type,
        department: department || undefined,
        from_whom: type === "vendor_purchase" ? fromWhom : undefined,
        notes: notes || undefined,
        items: type === "customer_dispatch" ? [] : items.filter((i) => i.item_name),
        dispatch: type === "customer_dispatch" ? dispatch : undefined,
      };
      await onSubmit(payload);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label>Type</Label>
        <div className="flex gap-2 mt-1">
          {(["internal_transfer", "vendor_purchase", "customer_dispatch"] as RequestType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                type === t ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="dept">Department</Label>
        {deptsLoadFailed ? (
          <>
            <Input
              id="dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Department name"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Couldn&apos;t load department list — type the department name manually.
            </p>
          </>
        ) : (
          <select
            id="dept"
            className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">—</option>
            {depts.map((d) => (
              <option key={d.id} value={`${d.code} — ${d.name}`}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {type === "vendor_purchase" && (
        <div>
          <Label htmlFor="from-whom">From whom (vendor) *</Label>
          <Input id="from-whom" required value={fromWhom} onChange={(e) => setFromWhom(e.target.value)} />
        </div>
      )}

      {type === "customer_dispatch" ? (
        <CustomerDispatchBlock value={dispatch} onChange={setDispatch} />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="item-type-filter" className="shrink-0">Item type</Label>
            <select
              id="item-type-filter"
              className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
              value={itemType}
              onChange={(e) => setItemType(e.target.value as RequestableItemType)}
            >
              {ITEM_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <Label>Line items</Label>
          {items.map((it, i) => (
            <div key={i} className="flex gap-2">
              <select
                className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                value={it.inventory_item_id ? String(it.inventory_item_id) : ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  const id = raw ? Number(raw) : null;
                  const found = inventoryItems.find((x) => x.id === id);
                  setItems(items.map((x, j) => j === i
                    ? { ...x, item_name: found?.name ?? "", inventory_item_id: id }
                    : x
                  ));
                }}
              >
                <option value="">—</option>
                {inventoryItems.map((inv) => (
                  <option key={inv.id} value={String(inv.id)}>
                    {inv.code} — {inv.name} ({inv.unit})
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min={1}
                step={1}
                className="w-24"
                value={it.quantity}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x)))}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                ×
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { ...DEFAULT_ITEM }])}>
            + Add item
          </Button>
        </div>
      )}

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
