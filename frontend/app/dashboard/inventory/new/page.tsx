"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import { ArrowLeft, ImagePlus, X } from "lucide-react";

const STD_UNITS = ["pcs", "kg", "g", "ltr", "ml", "mtr", "cm", "box", "roll", "set"];
const STORAGE_TYPES = ["Bin", "Tray", "Barrel", "Rack", "Shelf", "Box", "Pallet"];
const SFG_STORAGE_TYPES = ["Ganny Bag", "Barrel (Big)", "Barrel (Small)", "Floor", "Trolley", "Black Bin", "Small Bin", "Big Bin"];

const BLANK = {
  code: "",
  name: "",
  item_type: "raw_material",
  unit: "pcs",
  customUnit: "",
  quantity_on_hand: 0,
  reorder_level: 0,
  storage_type: "",
  storage_location: "",
  rate: "",
  is_active: true,
};

export default function NewInventoryPage() {
  const router = useRouter();
  const [form, setForm] = useState(BLANK);
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAdmin(isAdminOrAbove());
    codeRef.current?.focus();
  }, []);

  function set(key: string, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleUnitChange(val: string) {
    if (val === "__custom__") {
      setIsCustomUnit(true);
      set("unit", "");
    } else {
      setIsCustomUnit(false);
      set("unit", val);
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageBase64(result);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const unitFinal = isCustomUnit ? form.customUnit.trim() : form.unit;
    if (!form.code.trim()) { setError("Code is required"); return; }
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!unitFinal) { setError("Unit is required"); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetchJson("/api/v1/inventory", {
        method: "POST",
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          item_type: form.item_type,
          unit: unitFinal,
          quantity_on_hand: form.quantity_on_hand,
          reorder_level: form.reorder_level,
          storage_type: form.storage_type || null,
          storage_location: form.storage_location || null,
          rate: admin && form.rate !== "" ? parseFloat(form.rate) : null,
          image_base64: imageBase64,
          is_active: form.is_active,
        }),
      });
      router.push("/dashboard/inventory");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link href="/dashboard/inventory" className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
          <ArrowLeft className="size-4" />
        </Link>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/inventory">Inventory</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem><BreadcrumbPage>New Item</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Add Inventory Item</h1>
        </div>
        <form onSubmit={handleSave} className="space-y-5">
          {/* Code */}
          <div className="space-y-1.5">
            <Label htmlFor="code">Item Code <span className="text-destructive">*</span></Label>
            <Input id="code" ref={codeRef} placeholder="e.g. RM-001"
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              disabled={saving}
            />
          </div>
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Name / Description <span className="text-destructive">*</span></Label>
            <Input id="name" placeholder="e.g. Steel Sheet 2mm"
              value={form.name} onChange={(e) => set("name", e.target.value)} disabled={saving}
            />
          </div>
          {/* Type */}
          <div className="space-y-1.5">
            <Label htmlFor="item_type">Item Type</Label>
            <select id="item_type" value={form.item_type} onChange={(e) => set("item_type", e.target.value)} disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="raw_material">Raw Material</option>
              <option value="finished_good">Finished Good</option>
              <option value="semi_finished">Semi Finished</option>
            </select>
          </div>
          {/* Unit */}
          <div className="space-y-1.5">
            <Label htmlFor="unit">Unit of Measure <span className="text-destructive">*</span></Label>
            <select id="unit"
              value={isCustomUnit ? "__custom__" : form.unit}
              onChange={(e) => handleUnitChange(e.target.value)}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {STD_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              <option value="__custom__">Other…</option>
            </select>
            {isCustomUnit && (
              <Input placeholder="Custom unit" value={form.customUnit}
                onChange={(e) => set("customUnit", e.target.value)} disabled={saving}
              />
            )}
          </div>
          {/* Qty + Reorder */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="qty">Opening Qty</Label>
              <Input id="qty" type="number" inputMode="decimal" min="0" step="any"
                value={form.quantity_on_hand}
                onChange={(e) => set("quantity_on_hand", parseFloat(e.target.value) || 0)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reorder">Reorder Level</Label>
              <Input id="reorder" type="number" inputMode="decimal" min="0" step="any"
                value={form.reorder_level}
                onChange={(e) => set("reorder_level", parseFloat(e.target.value) || 0)}
                disabled={saving}
              />
            </div>
          </div>
          {/* Storage */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="storage_type">Storage Type</Label>
              <select id="storage_type" value={form.storage_type} onChange={(e) => set("storage_type", e.target.value)} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— None —</option>
                {(form.item_type === "semi_finished" ? SFG_STORAGE_TYPES : STORAGE_TYPES).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="storage_location">Storage Location</Label>
              <Input id="storage_location" placeholder="e.g. Shelf A-3"
                value={form.storage_location} onChange={(e) => set("storage_location", e.target.value)} disabled={saving}
              />
            </div>
          </div>
          {/* Rate (admin only) */}
          {admin && (
            <div className="space-y-1.5">
              <Label htmlFor="rate">Rate (₹ per unit)</Label>
              <Input id="rate" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                value={form.rate} onChange={(e) => set("rate", e.target.value)} disabled={saving}
              />
            </div>
          )}
          {/* Image */}
          <div className="space-y-1.5">
            <Label>Item Photo</Label>
            {imagePreview ? (
              <div className="relative w-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="preview" className="w-32 h-32 object-cover rounded-md border" />
                <button type="button" onClick={() => { setImageBase64(null); setImagePreview(null); }}
                  className="absolute -top-2 -right-2 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-muted rounded-md cursor-pointer hover:bg-muted/40 transition-colors">
                <ImagePlus className="size-6 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Upload</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} disabled={saving} />
              </label>
            )}
          </div>
          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="is_active">Status</Label>
            <select id="is_active" value={form.is_active ? "true" : "false"}
              onChange={(e) => set("is_active", e.target.value === "true")}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
              {saving ? "Creating…" : "Create Item"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/inventory")} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
