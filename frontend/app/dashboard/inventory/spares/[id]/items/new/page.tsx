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
import { ArrowLeft, ImageIcon } from "lucide-react";

const STD_UNITS = ["pcs", "kg", "g", "ltr", "ml", "mtr", "cm", "box", "roll", "set", "pair"];
const STORAGE_TYPES = ["Shelf", "Rack", "Bin", "Drawer", "Tray", "Cabinet", "Box", "Pallet", "Floor"];

interface SpareCategory { id: number; name: string; }

const BLANK = {
  name: "",
  part_number: "",
  part_description: "",
  variant_model: "",
  rate: "",
  unit: "pcs",
  customUnit: "",
  opening_qty: "0",
  recorded_qty: "0",
  reorder_level: "0",
  storage_type: "",
  tags: "",
};

export default function NewSpareItemPage() {
  const params = useParams();
  const catId = Number(params.id);
  const router = useRouter();

  const backHref = `/dashboard/inventory/spares`;

  const [category, setCategory] = useState<SpareCategory | null>(null);
  const [form, setForm] = useState(BLANK);
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageB64, setImageB64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAdminOrAbove()) { router.replace(backHref); return; }
    nameRef.current?.focus();
    apiFetchJson<SpareCategory>(`/api/v1/spares/categories/${catId}`)
      .then(setCategory)
      .catch(() => null);
  }, [catId, router, backHref]);

  function set<K extends keyof typeof BLANK>(key: K, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleUnitChange(val: string) {
    if (val === "__custom__") { setIsCustomUnit(true); set("unit", ""); }
    else { setIsCustomUnit(false); set("unit", val); set("customUnit", ""); }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      setImageB64(dataUrl.split(",")[1] ?? null);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Item name is required"); return; }
    const unit = isCustomUnit ? (form.customUnit.trim() || "pcs") : form.unit;
    setSaving(true); setError(null);
    try {
      await apiFetchJson(`/api/v1/spares/categories/${catId}/items`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          part_number: form.part_number.trim() || null,
          part_description: form.part_description.trim() || null,
          variant_model: form.variant_model.trim() || null,
          rate: form.rate ? parseFloat(form.rate) : null,
          unit,
          opening_qty: parseFloat(form.opening_qty) || 0,
          recorded_qty: parseFloat(form.recorded_qty) || 0,
          reorder_level: parseFloat(form.reorder_level) || 0,
          storage_type: form.storage_type || null,
          tags: form.tags.trim() || null,
          image_base64: imageB64,
        }),
      });
      router.push(backHref);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create item");
      setSaving(false);
    }
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link href="/dashboard/inventory" className="text-muted-foreground hover:text-foreground text-sm">Inventory</Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Link href="/dashboard/inventory/spares" className="text-muted-foreground hover:text-foreground text-sm">Spares</Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <span className="text-muted-foreground text-sm">{category?.name ?? "…"}</span>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>New Item</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-6 max-w-lg">
        <Link href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="size-3.5" />Back to Spares
        </Link>

        <h1 className="text-xl font-semibold mb-1">Add Spare Item</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Add a new item to the <strong>{category?.name ?? "…"}</strong> category.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="i-name">Item Name <span className="text-destructive">*</span></Label>
            <Input id="i-name" ref={nameRef} placeholder="e.g. Piston Ring Set"
              value={form.name} onChange={(e) => set("name", e.target.value)} disabled={saving} />
          </div>

          {/* Part No + Variant */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="i-pn">Part No. <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input id="i-pn" placeholder="ENG-068" value={form.part_number}
                onChange={(e) => set("part_number", e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-vm">Variant / Model <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input id="i-vm" placeholder="168cc" value={form.variant_model}
                onChange={(e) => set("variant_model", e.target.value)} disabled={saving} />
            </div>
          </div>

          {/* Part Description */}
          <div className="space-y-1.5">
            <Label htmlFor="i-desc">Part Description <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <textarea id="i-desc" rows={2} placeholder="Brief description of the part…"
              value={form.part_description} onChange={(e) => set("part_description", e.target.value)}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>

          {/* Rate + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="i-rate">Rate per Unit (₹)</Label>
              <Input id="i-rate" type="number" min="0" step="any" placeholder="0.00"
                value={form.rate} onChange={(e) => set("rate", e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-unit">Unit of Measure</Label>
              <select id="i-unit" value={isCustomUnit ? "__custom__" : form.unit}
                onChange={(e) => handleUnitChange(e.target.value)} disabled={saving}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {STD_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                <option value="__custom__">Other…</option>
              </select>
              {isCustomUnit && (
                <Input placeholder="Enter unit" value={form.customUnit}
                  onChange={(e) => set("customUnit", e.target.value)} disabled={saving} className="mt-1.5" />
              )}
            </div>
          </div>

          {/* Opening / Recorded / Reorder */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="i-oq">Opening Qty</Label>
              <Input id="i-oq" type="number" min="0" step="any" value={form.opening_qty}
                onChange={(e) => set("opening_qty", e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-rq">Recorded Qty</Label>
              <Input id="i-rq" type="number" min="0" step="any" value={form.recorded_qty}
                onChange={(e) => set("recorded_qty", e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-rl">Reorder Level</Label>
              <Input id="i-rl" type="number" min="0" step="any" value={form.reorder_level}
                onChange={(e) => set("reorder_level", e.target.value)} disabled={saving} />
            </div>
          </div>

          {/* Storage + Tags */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="i-st">Storage Type</Label>
              <select id="i-st" value={form.storage_type}
                onChange={(e) => set("storage_type", e.target.value)} disabled={saving}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">— Select —</option>
                {STORAGE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-tags">Tags <span className="text-muted-foreground font-normal text-xs">(comma-sep.)</span></Label>
              <Input id="i-tags" placeholder="Engine, 2-Stroke" value={form.tags}
                onChange={(e) => set("tags", e.target.value)} disabled={saving} />
            </div>
          </div>

          {/* Image */}
          <div className="space-y-1.5">
            <Label>Image <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <div className="flex items-center gap-3">
              {imagePreview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={imagePreview} alt="preview" className="size-14 rounded-lg object-cover border" />
              ) : (
                <div className="size-14 rounded-lg border-2 border-dashed flex items-center justify-center">
                  <ImageIcon className="size-5 text-muted-foreground/40" />
                </div>
              )}
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline"
                  onClick={() => imageInputRef.current?.click()} disabled={saving}>
                  {imagePreview ? "Change" : "Upload"}
                </Button>
                {imagePreview && (
                  <Button type="button" size="sm" variant="ghost"
                    onClick={() => { setImagePreview(null); setImageB64(null); }} disabled={saving}>
                    Remove
                  </Button>
                )}
              </div>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">{saving ? "Adding…" : "Add Item"}</Button>
            <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={saving}>Cancel</Button>
          </div>
        </form>
      </div>
    </>
  );
}
