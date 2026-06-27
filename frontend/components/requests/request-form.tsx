"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { CustomerDispatchBlock } from "./customer-dispatch-block";
import type {
  CreateRequestPayload, RequestType, RequestItem, RequestCustomerDispatch,
} from "@/lib/requests";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/user";
import {
  ArrowLeftRight,
  ShoppingCart,
  Send,
  Plus,
  Trash2,
  Package,
  Building2,
  StickyNote,
  Tag,
  ShieldAlert,
  Minus,
} from "lucide-react";

interface DeptRef {
  id: number;
  code: string;
  name: string;
  handles_customer_dispatch?: boolean;
}

interface InventoryItem {
  id: number;
  code: string;
  name: string;
  unit_name: string;
  item_type: string;
}

interface PaginatedInventory {
  items: InventoryItem[];
}

const SUPPORTED_REQUESTABLE_TYPES = [
  "raw_material",
  "finished_good",
  "semi_finished",
] as const;

type RequestableItemType = (typeof SUPPORTED_REQUESTABLE_TYPES)[number];

const ITEM_TYPE_LABELS: Record<RequestableItemType, string> = {
  raw_material: "Raw materials",
  finished_good: "Finished goods",
  semi_finished: "Semi-finished",
};

const TYPE_OPTIONS: { value: RequestType; label: string; short: string; icon: typeof ArrowLeftRight }[] = [
  { value: "internal_transfer", label: "Internal transfer", short: "Internal", icon: ArrowLeftRight },
  { value: "vendor_purchase", label: "Vendor purchase", short: "Vendor", icon: ShoppingCart },
  { value: "customer_dispatch", label: "Customer dispatch", short: "Customer", icon: Send },
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

function getPermittedTypes(): RequestableItemType[] {
  const user = getCurrentUser();
  if (!user) return [];
  if (user.role === "admin" || user.role === "super_admin") {
    return [...SUPPORTED_REQUESTABLE_TYPES];
  }
  return SUPPORTED_REQUESTABLE_TYPES.filter((t) => {
    // Allowed by inventory_access (if set / non-empty)
    const hasInventoryAccess = !user.inventory_access || user.inventory_access.length === 0
      || user.inventory_access.includes(t);
    // Allowed by request_inventory (if set / non-empty)
    const hasRequestAccess = !user.request_inventory || user.request_inventory.length === 0
      || user.request_inventory.includes(t);
    // A type is permitted if the user has EITHER access
    return hasInventoryAccess || hasRequestAccess;
  });
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
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [itemType, setItemType] = useState<RequestableItemType>("raw_material");

  const permittedTypes = useMemo<RequestableItemType[]>(() => getPermittedTypes(), []);
  const noAccess = permittedTypes.length === 0;
  const effectiveItemType: RequestableItemType = permittedTypes.includes(itemType)
    ? itemType
    : permittedTypes[0] ?? "raw_material";

  useEffect(() => {
    apiFetchJson<DeptRef[]>("/api/v1/departments")
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
    if (noAccess) return;
    setInventoryLoading(true);
    let cancelled = false;
    apiFetchJson<PaginatedInventory>(
      `/api/v1/inventory?item_type=${effectiveItemType}&page_size=500&include_inactive=false`
    )
      .then((r) => { if (!cancelled) setInventoryItems(r.items); })
      .catch(() => { if (!cancelled) setInventoryItems([]); })
      .finally(() => { if (!cancelled) setInventoryLoading(false); });
    return () => { cancelled = true; };
  }, [effectiveItemType, noAccess]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (noAccess) return;

    const filledItems = type === "customer_dispatch" ? [] : items.filter((i) => i.item_name);
    if (type !== "customer_dispatch" && filledItems.length === 0) {
      // Silently prevent submit — user hasn't entered any items yet.
      return;
    }

    setBusy(true);
    try {
      const payload: CreateRequestPayload = {
        request_type: type,
        department: department || undefined,
        from_whom: type === "vendor_purchase" ? fromWhom : undefined,
        notes: notes || undefined,
        items: filledItems,
        dispatch: type === "customer_dispatch" ? dispatch : undefined,
      };
      await onSubmit(payload);
    } finally {
      setBusy(false);
    }
  };

  const updateItem = (i: number, patch: Partial<RequestItem>) => {
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  const incrementItem = (i: number, delta: number) => {
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, (x.quantity || 1) + delta) } : x)));
  };

  const removeItem = (i: number) => {
    setItems((prev) => prev.filter((_, j) => j !== i));
  };

  if (noAccess) {
    return (
      <div className="px-2 py-6">
        <Card className="ring-1 ring-foreground/5">
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-warning/15 text-warning">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">No inventory access</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                You don&apos;t have permission to request any inventory types. This form supports raw materials, finished goods, and semi-finished goods — your account may need additional permissions for these types. Please contact your administrator.
              </p>
            </div>
          </CardContent>
        </Card>
        {onCancel && (
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
              Close
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <div className="space-y-4 px-1">
        <ToggleGroup
          type="single"
          value={type}
          onValueChange={(v) => v && setType(v as RequestType)}
          variant="outline"
          spacing={0}
          size="sm"
          className="w-full"
        >
          {TYPE_OPTIONS.map((opt) => (
            <ToggleGroupItem
              key={opt.value}
              value={opt.value}
              className="flex-1 flex-col gap-1 normal-case tracking-normal whitespace-normal px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm transition-all"
            >
              <opt.icon className="size-4" />
              <span>{opt.short}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Card size="sm" className="ring-1 ring-foreground/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <Building2 className="size-3.5" />
              </div>
              <CardTitle className="text-xs">Routing</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="dept" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Department
              </label>
              {deptsLoadFailed ? (
                <>
                  <Input
                    id="dept"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Department name"
                  />
                  <p className="text-xs text-muted-foreground">
                    Couldn&apos;t load department list — type the department name manually.
                  </p>
                </>
              ) : (
                <Select value={department || undefined} onValueChange={(v) => setDepartment(v)}>
                  <SelectTrigger id="dept" className="w-full">
                    <SelectValue placeholder="Select a department" />
                  </SelectTrigger>
                  <SelectContent>
                    {depts.map((d) => (
                      <SelectItem key={d.id} value={d.code}>
                        {d.code} — {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {type === "vendor_purchase" && (
              <div className="space-y-1.5">
                <label htmlFor="from-whom" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vendor <span className="text-destructive">*</span>
                </label>
                <div className="flex items-center gap-2 rounded-md border border-input px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 transition">
                  <Tag className="size-3.5 text-muted-foreground" />
                  <Input
                    id="from-whom"
                    required
                    value={fromWhom}
                    onChange={(e) => setFromWhom(e.target.value)}
                    placeholder="Vendor name"
                    className="border-0 px-0 focus-visible:ring-0"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {type === "customer_dispatch" ? (
          <Card size="sm" className="ring-1 ring-foreground/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                  <Send className="size-3.5" />
                </div>
                <CardTitle className="text-xs">Customer</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CustomerDispatchBlock value={dispatch} onChange={setDispatch} />
            </CardContent>
          </Card>
        ) : (
          <Card size="sm" className="ring-1 ring-foreground/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                    <Package className="size-3.5" />
                  </div>
                  <CardTitle className="text-xs">Items</CardTitle>
                </div>
                {permittedTypes.length > 0 && (
                  <Select value={itemType} onValueChange={(v) => setItemType(v as RequestableItemType)}>
                    <SelectTrigger size="sm" className="h-8 w-auto text-xs gap-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {permittedTypes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ITEM_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border bg-muted/20 p-2.5">
                  <div className="flex-1 min-w-0">
                    <SearchCombobox<InventoryItem>
                      variant="plain"
                      value={it.item_name || ""}
                      placeholder={inventoryLoading ? "Loading inventory…" : "Search inventory item..."}
                      disabled={inventoryLoading}
                      fetcher={async (q) => {
                        const searchParam = q.trim() ? `&search=${encodeURIComponent(q.trim())}` : '';
                        return apiFetchJson<{ items: InventoryItem[] }>(
                          `/api/v1/inventory?item_type=${effectiveItemType}&page_size=500&include_inactive=false${searchParam}`,
                        ).then((r) => r.items);
                      }}
                      getItemKey={(inv) => inv.id}
                      getItemLabel={(inv) => `${inv.code} · ${inv.name}`}
                      onSelect={(inv) => updateItem(i, { item_name: inv.name, inventory_item_id: inv.id })}
                      renderItem={(inv) => (
                        <>
                          <span className="font-mono text-xs text-muted-foreground">{inv.code}</span>
                          <span className="ml-2">{inv.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{inv.unit_name}</span>
                        </>
                      )}
                    />
                    {inventoryLoading && !it.inventory_item_id && (
                      <Skeleton className="mt-1.5 h-2.5 w-32" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => incrementItem(i, -1)}
                      disabled={it.quantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="size-3" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      className="w-16 text-center"
                      value={it.quantity}
                      onChange={(e) => updateItem(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => incrementItem(i, 1)}
                      aria-label="Increase quantity"
                    >
                      <Plus className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeItem(i)}
                      disabled={items.length === 1}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove item"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems([...items, { ...DEFAULT_ITEM }])}
                className="mt-1"
              >
                <Plus className="size-3.5" />
                Add item
              </Button>
            </CardContent>
          </Card>
        )}

        <Card size="sm" className="ring-1 ring-foreground/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <StickyNote className="size-3.5" />
              </div>
              <CardTitle className="text-xs">Notes</CardTitle>
              <Badge variant="ghost" className="text-[10px]">Optional</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else the fulfiller should know…"
            />
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t bg-popover/95 backdrop-blur supports-backdrop-filter:bg-popover/80 px-6 py-3 flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
