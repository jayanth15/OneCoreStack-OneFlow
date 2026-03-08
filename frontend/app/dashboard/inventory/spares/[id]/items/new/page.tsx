"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import { ArrowLeft } from "lucide-react";

const STD_UNITS = ["pcs", "kg", "g", "ltr", "ml", "mtr", "cm", "box", "roll", "set", "pair"];

interface SpareCategory {
  id: number;
  name: string;
}

const BLANK = {
  name: "",
  part_number: "",
  description: "",
  quantity_on_hand: "0",
  unit: "pcs",
  customUnit: "",
  reorder_level: "0",
  storage_location: "",
  notes: "",
};

export default function NewSpareItemPage() {
  const params = useParams();
  const catId = Number(params.id);
  const router = useRouter();

  const [category, setCategory] = useState<SpareCategory | null>(null);
  const [form, setForm] = useState(BLANK);
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const backHref = `/dashboard/inventory/spares/${catId}`;

  useEffect(() => {
    if (!isAdminOrAbove()) {
      router.replace(backHref);
      return;
    }
    nameRef.current?.focus();
    // Fetch category name for breadcrumb
    apiFetchJson<SpareCategory>(`/api/v1/spares/categories/${catId}`)
      .then(setCategory)
      .catch(() => null);
  }, [catId, router, backHref]);

  function set(key: keyof typeof BLANK, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleUnitChange(val: string) {
    if (val === "__custom__") {
      setIsCustomUnit(true);
      set("unit", "");
    } else {
      setIsCustomUnit(false);
      set("unit", val);
      set("customUnit", "");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Item name is required"); return; }
    const unit = isCustomUnit ? form.customUnit.trim() || "pcs" : form.unit;
    setSaving(true);
    setError(null);
    try {
      await apiFetchJson(`/api/v1/spares/categories/${catId}/items`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          part_number: form.part_number.trim() || null,
          description: form.description.trim() || null,
          quantity_on_hand: parseFloat(form.quantity_on_hand) || 0,
          unit,
          reorder_level: parseFloat(form.reorder_level) || 0,
          storage_location: form.storage_location.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });
      router.push(backHref);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create item");
      setSaving(false);
    }
  }

  return (
    <>
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center border-b px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link href="/dashboard/inventory" className="text-muted-foreground hover:text-foreground text-sm">
                Inventory
              </Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Link href="/dashboard/inventory/spares" className="text-muted-foreground hover:text-foreground text-sm">
                Spares
              </Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Link href={backHref} className="text-muted-foreground hover:text-foreground text-sm">
                {category?.name ?? "…"}
              </Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>New Item</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-6 max-w-lg">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="size-3.5" />
          Back to {category?.name ?? "Category"}
        </Link>

        <h1 className="text-xl font-semibold mb-1">Add Spare Item</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Add a new item to the <strong>{category?.name ?? "…"}</strong> category.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="i-name">
              Item Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="i-name"
              ref={nameRef}
              placeholder="e.g. 68cc Baby – 2 Stroke Weeder"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Part number */}
          <div className="space-y-1.5">
            <Label htmlFor="i-pn">
              Part Number <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="i-pn"
              placeholder="e.g. ENG-068"
              value={form.part_number}
              onChange={(e) => set("part_number", e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="i-desc">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <textarea
              id="i-desc"
              rows={2}
              placeholder="Brief description…"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Qty + Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="i-qty">Opening Quantity</Label>
              <Input
                id="i-qty"
                type="number"
                min="0"
                step="any"
                value={form.quantity_on_hand}
                onChange={(e) => set("quantity_on_hand", e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-unit">Unit</Label>
              <select
                id="i-unit"
                value={isCustomUnit ? "__custom__" : form.unit}
                onChange={(e) => handleUnitChange(e.target.value)}
                disabled={saving}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {STD_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
                <option value="__custom__">Other…</option>
              </select>
              {isCustomUnit && (
                <Input
                  placeholder="Enter unit"
                  value={form.customUnit}
                  onChange={(e) => set("customUnit", e.target.value)}
                  disabled={saving}
                  className="mt-1.5"
                />
              )}
            </div>
          </div>

          {/* Reorder level */}
          <div className="space-y-1.5">
            <Label htmlFor="i-reorder">
              Reorder Level <span className="text-muted-foreground font-normal">(0 = no alert)</span>
            </Label>
            <Input
              id="i-reorder"
              type="number"
              min="0"
              step="any"
              value={form.reorder_level}
              onChange={(e) => set("reorder_level", e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Storage / Location */}
          <div className="space-y-1.5">
            <Label htmlFor="i-loc">
              Storage / Location <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="i-loc"
              placeholder="e.g. Shelf B-2, Rack 3"
              value={form.storage_location}
              onChange={(e) => set("storage_location", e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="i-notes">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <textarea
              id="i-notes"
              rows={2}
              placeholder="Any additional notes…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2 border border-destructive/20">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={saving} className="min-w-[120px]">
              {saving ? "Adding…" : "Add Item"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => router.push(backHref)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
