"use client";

import { useEffect, useState } from "react";
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
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
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
    <form onSubmit={submit}>
      <FieldGroup className="gap-4 sm:gap-6">
        {/* Request type */}
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
            <ToggleGroupItem key={opt.value} value={opt.value} className="flex-1 flex-col gap-1 normal-case tracking-normal whitespace-normal px-2 text-xs">
              <opt.icon className="size-4" />
              <span>{opt.short}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {/* Routing */}
        <FieldSeparator>Routing</FieldSeparator>

        <Field>
          <FieldLabel htmlFor="dept">Department</FieldLabel>
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
        </Field>

        {type === "vendor_purchase" && (
          <Field>
            <FieldLabel htmlFor="from-whom">From whom (vendor) *</FieldLabel>
            <Input id="from-whom" required value={fromWhom} onChange={(e) => setFromWhom(e.target.value)} />
          </Field>
        )}

        {/* Items / Customer dispatch */}
        {type === "customer_dispatch" ? (
          <>
            <FieldSeparator>Customer</FieldSeparator>
            <CustomerDispatchBlock value={dispatch} onChange={setDispatch} />
          </>
        ) : (
          <>
            <FieldSeparator>Items</FieldSeparator>

            <Field>
              <FieldLabel htmlFor="item-type-filter">Item type</FieldLabel>
              <Select value={itemType} onValueChange={(v) => setItemType(v as RequestableItemType)}>
                <SelectTrigger id="item-type-filter" className="w-full sm:w-64">
                  <SelectValue placeholder="Select item type" />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-2 rounded-lg border p-3">
                  <div className="flex-1 min-w-0">
                    <Combobox
                      value={it.inventory_item_id ? String(it.inventory_item_id) : ""}
                      onValueChange={(v: unknown) => {
                        const raw = v as string;
                        const id = raw ? Number(raw) : null;
                        const found = inventoryItems.find((x) => x.id === id);
                        setItems(items.map((x, j) => j === i
                          ? { ...x, item_name: found?.name ?? "", inventory_item_id: id }
                          : x
                        ));
                      }}
                    >
                      <ComboboxInput
                        placeholder="Search inventory item..."
                        className="w-full"
                      />
                      <ComboboxContent>
                        <ComboboxList>
                          <ComboboxEmpty>No items found</ComboboxEmpty>
                          {inventoryItems.map((inv) => (
                            <ComboboxItem key={inv.id} value={String(inv.id)}>
                              <span className="font-mono text-xs text-muted-foreground">{inv.code}</span>
                              <span className="ml-2">{inv.name}</span>
                              <span className="ml-auto text-xs text-muted-foreground">{inv.unit}</span>
                            </ComboboxItem>
                          ))}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    className="w-20 shrink-0"
                    value={it.quantity}
                    onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x)))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 mt-0.5"
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems([...items, { ...DEFAULT_ITEM }])}
              >
                <Plus className="size-4 mr-1" />
                Add item
              </Button>
            </div>
          </>
        )}

        {/* Notes */}
        <FieldSeparator>Notes</FieldSeparator>

        <Field>
          <FieldLabel htmlFor="notes">Notes</FieldLabel>
          <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {/* Actions */}
        <Field orientation="horizontal" className="justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
