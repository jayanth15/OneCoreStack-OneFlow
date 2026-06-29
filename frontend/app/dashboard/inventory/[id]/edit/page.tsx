"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import { AlertTriangle, ImagePlus, X } from "lucide-react";

const STORAGE_TYPES = ["Bin", "Tray", "Barrel", "Rack", "Shelf", "Box", "Pallet"];
const SFG_STORAGE_TYPES = ["Ganny Bag", "Barrel (Big)", "Barrel (Small)", "Floor", "Trolley", "Black Bin", "Small Bin", "Big Bin"];

interface ItemDetail {
  id: number;
  code: string;
  name: string;
  item_type: string;
  unit_id: number | null;
  quantity_on_hand: number;
  reorder_level: number;
  storage_type: string | null;
  storage_location: string | null;
  rate: number | null;
  timeline_days: number | null;
  image_base64: string | null;
  vendor_name: string | null;
  is_active: boolean;
  weight_value: number | null;
  weight_unit_id: number | null;
}

export default function EditInventoryPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<{
    code: string; name: string; item_type: string; unit_id: number | null;
    quantity_on_hand: number; reorder_level: number;
    storage_type: string; storage_location: string;
    rate: string; timeline_days: string; vendor_name: string; is_active: boolean;
    weight_value: string; weight_unit_id: number | null;
  }>({
    code: "", name: "", item_type: "raw_material", unit_id: null,
    quantity_on_hand: 0, reorder_level: 0,
    storage_type: "", storage_location: "", rate: "", timeline_days: "", vendor_name: "", is_active: true,
    weight_value: "", weight_unit_id: null,
  });
  const [units, setUnits] = useState<{id: number; name: string}[]>([]);
  const [isCustomStorage, setIsCustomStorage] = useState(false);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageChanged, setImageChanged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [vendors, setVendors] = useState<{ id: number | null; name: string }[]>([]);

  useEffect(() => {
    setAdmin(isAdminOrAbove());
    apiFetchJson<{ id: number; name: string }[]>("/api/v1/vendors/names")
      .then(setVendors)
      .catch(() => {});
    apiFetchJson<{id: number; name: string}[]>("/api/v1/units")
      .then(setUnits)
      .catch(() => {});
    if (!id) return;
    apiFetchJson<ItemDetail>(`/api/v1/inventory/${id}`)
      .then((d) => {
        const allStorageTypes = d.item_type === "semi_finished" ? SFG_STORAGE_TYPES : STORAGE_TYPES;
        const storageFitsPreset = !d.storage_type || allStorageTypes.includes(d.storage_type);
        setIsCustomStorage(!storageFitsPreset);
        setForm({
          code: d.code,
          name: d.name,
          item_type: d.item_type,
          unit_id: d.unit_id,
          quantity_on_hand: d.quantity_on_hand,
          reorder_level: d.reorder_level,
          storage_type: d.storage_type ?? "",
          storage_location: d.storage_location ?? "",
          rate: d.rate != null ? String(d.rate) : "",
          timeline_days: d.timeline_days != null ? String(d.timeline_days) : "",
          weight_value: d.weight_value != null ? String(d.weight_value) : "",
          weight_unit_id: d.weight_unit_id,
          vendor_name: d.vendor_name ?? "",
          is_active: d.is_active,
        });
        if (d.image_base64) {
          setImageBase64(d.image_base64);
          setImagePreview(d.image_base64);
        }
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [id]);

  function set(key: string, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageBase64(result);
      setImagePreview(result);
      setImageChanged(true);
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImageBase64(null);
    setImagePreview(null);
    setImageChanged(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim()) { setSaveError("Code is required"); return; }
    if (!form.name.trim()) { setSaveError("Name is required"); return; }
    if (!form.unit_id) { setSaveError("Unit is required"); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        item_type: form.item_type,
        unit_id: form.unit_id,
        quantity_on_hand: form.quantity_on_hand,
        reorder_level: form.reorder_level,
        storage_type: form.storage_type || null,
        storage_location: form.storage_location || null,
        is_active: form.is_active,
      };
      if (admin && form.rate !== "") body.rate = parseFloat(form.rate);
      if (form.timeline_days !== "") body.timeline_days = parseInt(form.timeline_days);
      body.weight_value = form.weight_value !== "" ? parseFloat(form.weight_value) : null;
      body.weight_unit_id = form.weight_unit_id || null;
      body.vendor_name = form.vendor_name.trim() || null;
      if (imageChanged) body.image_base64 = imageBase64;
      await apiFetchJson(`/api/v1/inventory/${id}`, { method: "PUT", body: JSON.stringify(body) });
      router.push("/dashboard/inventory");
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Edit Inventory Item"
        description={!loading ? form.code : undefined}
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: loading ? "Edit…" : `Edit ${form.code}` },
        ]}
      />

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Edit Inventory Item</h1>
          {!loading && <p className="text-sm text-muted-foreground mt-1 font-mono">{form.code}</p>}
        </div>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : loading ? (
          <div className="space-y-5">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : units.length === 0 ? (
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-6 text-center space-y-2">
            <AlertTriangle className="size-8 mx-auto text-warning" />
            <p className="text-sm font-medium">No units configured</p>
            <p className="text-xs text-muted-foreground">
              Please add units in{" "}
              <a href="/dashboard/settings/units" className="text-primary underline">Settings → Units</a>{" "}
              before editing inventory items.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            {/* Code */}
            <div className="space-y-1.5">
              <Label htmlFor="code">Item Code <span className="text-destructive">*</span></Label>
              <Input id="code" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} disabled={saving} />
            </div>
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name">Name / Description <span className="text-destructive">*</span></Label>
              <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} disabled={saving} />
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
              <Label htmlFor="unit_id">Unit of Measure <span className="text-destructive">*</span></Label>
              <select id="unit_id"
                value={form.unit_id ?? ""}
                onChange={(e) => set("unit_id", e.target.value ? Number(e.target.value) : null)}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            {/* Weight */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="weight_value">Weight per unit</Label>
                <Input id="weight_value" type="number" inputMode="decimal" min="0" step="0.001"
                  value={form.weight_value}
                  onChange={(e) => set("weight_value", e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weight_unit_id">Weight unit</Label>
                <select id="weight_unit_id" value={form.weight_unit_id ?? ""}
                  onChange={(e) => set("weight_unit_id", e.target.value ? Number(e.target.value) : null)}
                  disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">— None —</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
            {/* Qty + Reorder */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="qty">Qty on Hand</Label>
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
                <select id="storage_type"
                  value={isCustomStorage ? "__custom__" : form.storage_type}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setIsCustomStorage(true);
                      set("storage_type", "");
                    } else {
                      setIsCustomStorage(false);
                      set("storage_type", e.target.value);
                    }
                  }}
                  disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">— None —</option>
                  {(form.item_type === "semi_finished" ? SFG_STORAGE_TYPES : STORAGE_TYPES).map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="__custom__">Other…</option>
                </select>
                {isCustomStorage && (
                  <Input placeholder="Enter storage type" value={form.storage_type}
                    onChange={(e) => set("storage_type", e.target.value)} disabled={saving} className="mt-1.5" />
                )}
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
            {/* Timeline */}
            <div className="space-y-1.5">
              <Label htmlFor="timeline_days">Timeline (days)</Label>
              <Input id="timeline_days" type="number" inputMode="numeric" min="1" step="1" placeholder="e.g. 7"
                value={form.timeline_days}
                onChange={(e) => set("timeline_days", e.target.value)}
                disabled={saving}
              />
            </div>
            {/* Vendor (finished goods / semi-finished only) */}
            {(form.item_type === "finished_good" || form.item_type === "semi_finished") && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-vendor_name">Vendor</Label>
                <select
                  id="edit-vendor_name"
                  value={form.vendor_name}
                  onChange={(e) => set("vendor_name", e.target.value)}
                  disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">— Select vendor —</option>
                  {vendors.map((v) => (
                    <option key={v.name} value={v.name}>{v.name}</option>
                  ))}
                </select>
              </div>
            )}
            {/* Image */}
            <div className="space-y-1.5">
              <Label>Item Photo</Label>
              {imagePreview ? (
                <div className="relative w-32">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="preview" className="w-32 h-32 object-cover rounded-md border" />
                  <button type="button" onClick={clearImage}
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

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/dashboard/inventory")} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
