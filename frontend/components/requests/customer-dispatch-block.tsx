"use client";

import { useEffect, useState } from "react";
import type { RequestCustomerDispatch } from "@/lib/requests";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
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
    <div className="rounded-lg border p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="cust-name">Customer name *</FieldLabel>
          <Input
            id="cust-name"
            value={value.customer_name ?? ""}
            onChange={(e) => set({ customer_name: e.target.value })}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cust-phone">Phone</FieldLabel>
          <Input
            id="cust-phone"
            value={value.customer_phone ?? ""}
            onChange={(e) => set({ customer_phone: e.target.value })}
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="cust-addr">Address</FieldLabel>
          <Textarea
            id="cust-addr"
            rows={2}
            value={value.customer_address ?? ""}
            onChange={(e) => set({ customer_address: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cust-bought">Bought by</FieldLabel>
          <Input
            id="cust-bought"
            value={value.customer_bought_by ?? ""}
            onChange={(e) => set({ customer_bought_by: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cust-delivery">Delivery</FieldLabel>
          <Select
            value={value.delivery_type ?? ""}
            onValueChange={(v) => set({ delivery_type: (v || null) as "direct" | "transport" | null })}
          >
            <SelectTrigger id="cust-delivery">
              <SelectValue placeholder="Select delivery method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="transport">Transport</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="inv-type">Inventory type</FieldLabel>
          <Select
            value={value.inventory_type}
            onValueChange={(v) => {
              const next = v as "weeder" | "attachment";
              onChange({ ...value, inventory_type: next, item_id: null, item_sn_no: null });
            }}
          >
            <SelectTrigger id="inv-type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weeder">Weeder</SelectItem>
              <SelectItem value="attachment">Attachment</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="inv-sn">Item SN</FieldLabel>
          <Select
            value={value.item_id ? String(value.item_id) : ""}
            onValueChange={(v) => {
              const raw = v;
              const id = raw ? Number(raw) : null;
              const found = snItems.find((x) => x.id === id);
              set({
                item_id: id,
                item_sn_no: found?.sn_no ?? null,
              });
            }}
          >
            <SelectTrigger id="inv-sn">
              <SelectValue placeholder="Select item" />
            </SelectTrigger>
            <SelectContent>
              {snItems.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.sn_no ?? "—"}
                  {item.description ? ` — ${item.description}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>Choose from available {value.inventory_type}s</FieldDescription>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="inv-desc">Item description</FieldLabel>
          <Textarea
            id="inv-desc"
            rows={2}
            value={value.item_description ?? ""}
            onChange={(e) => set({ item_description: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="inv-qty">Quantity</FieldLabel>
          <Input
            id="inv-qty"
            type="number"
            min={1}
            step={1}
            value={value.quantity}
            onChange={(e) => set({ quantity: Number(e.target.value) || 1 })}
          />
        </Field>
      </div>
    </div>
  );
}
