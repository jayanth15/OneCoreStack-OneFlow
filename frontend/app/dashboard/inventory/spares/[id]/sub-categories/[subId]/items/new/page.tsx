"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import { ArrowLeft } from "lucide-react";

interface BreadcrumbInfo { catName: string; subName: string; }

const BLANK = { name:"", part_number:"", part_description:"" };

export default function NewSpareItemPage() {
  const params  = useParams();
  const catId   = Number(params.id);
  const subId   = Number(params.subId);
  const router  = useRouter();

  const backHref = "/dashboard/inventory/spares";

  const [info, setInfo] = useState<BreadcrumbInfo | null>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAdminOrAbove()) { router.replace(backHref); return; }
    nameRef.current?.focus();
    Promise.all([
      apiFetchJson<{name:string}>(`/api/v1/spares/categories/${catId}`),
      apiFetchJson<{name:string}>(`/api/v1/spares/sub-categories/${subId}`),
    ]).then(([cat, sub]) => setInfo({ catName:cat.name, subName:sub.name }))
      .catch(() => null);
  }, [catId, subId, router, backHref]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Item name is required"); return; }
    setSaving(true); setError(null);
    try {
      await apiFetchJson(`/api/v1/spares/sub-categories/${subId}/items`, {
        method:"POST",
        body: JSON.stringify({
          name: form.name.trim(),
          part_number: form.part_number || null,
          part_description: form.part_description || null,
          variant_model: null,
          rate: null,
          unit: "pcs",
          opening_qty: 0,
          recorded_qty: 0,
          reorder_level: 0,
          storage_type: null,
          storage_location: null,
          image_base64: null,
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
              <span className="text-muted-foreground text-sm">{info?.catName ?? "…"}</span>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <span className="text-muted-foreground text-sm">{info?.subName ?? "…"}</span>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>New Item</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-6 max-w-md">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="size-3.5" />Back to Spares
        </Link>

        <h1 className="text-xl font-semibold mb-0.5">Add Spare Item</h1>
        <p className="text-sm text-muted-foreground mb-1">
          Category: <strong>{info?.catName ?? "…"}</strong> › Sub-category: <strong>{info?.subName ?? "…"}</strong>
        </p>
        <p className="text-xs text-muted-foreground mb-6">Rates, quantities, storage and images are set per-variant after creating the item.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="i-name">Item Name <span className="text-destructive">*</span></Label>
            <Input id="i-name" ref={nameRef} placeholder="e.g. Brake Wire"
              value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} disabled={saving} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="i-pn">Part No. <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Input id="i-pn" placeholder="BW-001"
              value={form.part_number} onChange={e=>setForm(f=>({...f,part_number:e.target.value}))} disabled={saving} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="i-desc">Part Description <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <textarea id="i-desc" rows={3} placeholder="Brief description…"
              value={form.part_description} onChange={e=>setForm(f=>({...f,part_description:e.target.value}))} disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">{saving?"Adding…":"Add Item"}</Button>
            <Button type="button" variant="outline" onClick={()=>router.push(backHref)} disabled={saving}>Cancel</Button>
          </div>
        </form>
      </div>
    </>
  );
}
