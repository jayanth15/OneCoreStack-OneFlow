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
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { User, Phone, MapPin, Truck, Tag, Hash, FileText, Package } from "lucide-react";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const url = value.inventory_type === "weeder"
      ? "/api/v1/weeders?page_size=500&include_inactive=false"
      : "/api/v1/attachments?page_size=500&include_inactive=false";
    apiFetchJson<{ items: SnItem[] }>(url)
      .then((r) => { if (!cancelled) setSnItems(r.items); })
      .catch(() => { if (!cancelled) setSnItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [value.inventory_type]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="cust-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <User className="size-3" />
            Customer name <span className="text-destructive">*</span>
          </label>
          <Input
            id="cust-name"
            value={value.customer_name ?? ""}
            onChange={(e) => set({ customer_name: e.target.value })}
            required
            placeholder="e.g. Ravi Kumar"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cust-phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Phone className="size-3" />
            Phone
          </label>
          <Input
            id="cust-phone"
            value={value.customer_phone ?? ""}
            onChange={(e) => set({ customer_phone: e.target.value })}
            placeholder="+91 98765 43210"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="cust-addr" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <MapPin className="size-3" />
            Address
          </label>
          <Textarea
            id="cust-addr"
            rows={2}
            value={value.customer_address ?? ""}
            onChange={(e) => set({ customer_address: e.target.value })}
            placeholder="Delivery address"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cust-bought" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Tag className="size-3" />
            Bought by
          </label>
          <Input
            id="cust-bought"
            value={value.customer_bought_by ?? ""}
            onChange={(e) => set({ customer_bought_by: e.target.value })}
            placeholder="Salesperson or referrer"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cust-delivery" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Truck className="size-3" />
            Delivery
          </label>
          <Select
            value={value.delivery_type ?? ""}
            onValueChange={(v) => set({ delivery_type: (v || null) as "direct" | "transport" | null })}
          >
            <SelectTrigger id="cust-delivery" className="w-full">
              <SelectValue placeholder="Select delivery method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="transport">Transport</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="inv-type" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Package className="size-3" />
            Inventory type
          </label>
          <Select
            value={value.inventory_type}
            onValueChange={(v) => {
              const next = v as "weeder" | "attachment";
              onChange({ ...value, inventory_type: next, item_id: null, item_sn_no: null });
            }}
          >
            <SelectTrigger id="inv-type" className="w-full">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weeder">Weeder</SelectItem>
              <SelectItem value="attachment">Attachment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="inv-sn" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Hash className="size-3" />
            Item SN
          </label>
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
            <SelectTrigger id="inv-sn" className="w-full">
              <SelectValue placeholder={loading ? "Loading items…" : "Select item"} />
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
          {loading && <Skeleton className="mt-1.5 h-2.5 w-32" />}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="inv-desc" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FileText className="size-3" />
            Item description
          </label>
          <Textarea
            id="inv-desc"
            rows={2}
            value={value.item_description ?? ""}
            onChange={(e) => set({ item_description: e.target.value })}
            placeholder="Optional notes about the item"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="inv-qty" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            Quantity
          </label>
          <Input
            id="inv-qty"
            type="number"
            min={1}
            step={1}
            value={value.quantity}
            onChange={(e) => set({ quantity: Math.max(1, Number(e.target.value) || 1) })}
            className="w-24"
          />
        </div>
      </div>
    </div>
  );
}
