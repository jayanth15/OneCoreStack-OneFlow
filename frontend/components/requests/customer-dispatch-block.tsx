"use client";

import { useEffect, useState } from "react";
import type { RequestCustomerDispatch } from "@/lib/requests";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetchJson } from "@/lib/api";

interface SnItem {
  id: number;
  sn_no: string | null;
  description: string | null;
}

export interface CustomerDispatchBlockProps {
  value: RequestCustomerDispatch;
  onChange: (v: RequestCustomerDispatch) => void;
}

export function CustomerDispatchBlock({ value, onChange }: CustomerDispatchBlockProps) {
  const set = (patch: Partial<RequestCustomerDispatch>) => onChange({ ...value, ...patch });
  const [snItems, setSnItems] = useState<SnItem[]>([]);

  useEffect(() => {
    const url = value.inventory_type === "weeder"
      ? "/api/v1/weeders?page_size=500&include_inactive=false"
      : "/api/v1/attachments?page_size=500&include_inactive=false";
    apiFetchJson<{ items: SnItem[] }>(url)
      .then((r) => setSnItems(r.items))
      .catch(() => setSnItems([]));
  }, [value.inventory_type]);

  return (
    <div className="space-y-3 border border-slate-200 rounded-md p-3 bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cust-name">Customer name *</Label>
          <Input id="cust-name" value={value.customer_name ?? ""} onChange={(e) => set({ customer_name: e.target.value })} required />
        </div>
        <div>
          <Label htmlFor="cust-phone">Phone</Label>
          <Input id="cust-phone" value={value.customer_phone ?? ""} onChange={(e) => set({ customer_phone: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="cust-addr">Address</Label>
          <Textarea id="cust-addr" rows={2} value={value.customer_address ?? ""} onChange={(e) => set({ customer_address: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cust-bought">Bought by</Label>
          <Input id="cust-bought" value={value.customer_bought_by ?? ""} onChange={(e) => set({ customer_bought_by: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cust-delivery">Delivery</Label>
          <select
            id="cust-delivery"
            className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            value={value.delivery_type ?? ""}
            onChange={(e) => set({ delivery_type: (e.target.value || null) as "direct" | "transport" | null })}
          >
            <option value="">—</option>
            <option value="direct">Direct</option>
            <option value="transport">Transport</option>
          </select>
        </div>
        <div>
          <Label htmlFor="inv-type">Inventory type</Label>
          <select
            id="inv-type"
            className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            value={value.inventory_type}
            onChange={(e) => {
              const next = e.target.value as "weeder" | "attachment";
              onChange({ ...value, inventory_type: next, item_id: null, item_sn_no: null });
            }}
          >
            <option value="weeder">Weeder</option>
            <option value="attachment">Attachment</option>
          </select>
        </div>
        <div>
          <Label htmlFor="inv-sn">Item SN</Label>
          <select
            id="inv-sn"
            className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            value={value.item_id ? String(value.item_id) : ""}
            onChange={(e) => {
              const raw = e.target.value;
              const id = raw ? Number(raw) : null;
              const found = snItems.find((x) => x.id === id);
              set({
                item_id: id,
                item_sn_no: found?.sn_no ?? null,
              });
            }}
          >
            <option value="">—</option>
            {snItems.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.sn_no ?? "—"}
                {item.description ? ` — ${item.description}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="inv-desc">Item description</Label>
          <Textarea id="inv-desc" rows={2} value={value.item_description ?? ""} onChange={(e) => set({ item_description: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="inv-qty">Quantity</Label>
          <Input
            id="inv-qty"
            type="number"
            min={1}
            step={1}
            value={value.quantity}
            onChange={(e) => set({ quantity: Number(e.target.value) || 1 })}
          />
        </div>
      </div>
    </div>
  );
}
