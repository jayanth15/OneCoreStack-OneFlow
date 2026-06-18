"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerDispatchBlock } from "./customer-dispatch-block";
import type {
  CreateRequestPayload, RequestType, RequestItem, RequestCustomerDispatch,
} from "@/lib/requests";

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
        <Input id="dept" value={department} onChange={(e) => setDepartment(e.target.value)} />
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
          <Label>Line items</Label>
          {items.map((it, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder="Item name"
                value={it.item_name ?? ""}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, item_name: e.target.value } : x)))}
              />
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
