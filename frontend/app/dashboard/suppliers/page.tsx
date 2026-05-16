"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiFetchJson } from "@/lib/api";
import { isAdmin as checkIsAdmin, isAdminOrAbove } from "@/lib/user";
import {
  Search, Truck, UserPlus, Phone, Mail, MapPin, Pencil, ToggleLeft, ToggleRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Supplier {
  id: number;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string | null;
}

// ── Blank form ────────────────────────────────────────────────────────────────

const BLANK = { name: "", contact_person: "", phone: "", email: "", address: "", notes: "" };

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Role gate
  useEffect(() => {
    if (!isAdminOrAbove()) { router.replace("/dashboard"); }
  }, [router]);

  const [adminUser, setAdminUser] = useState(false);
  useEffect(() => { setAdminUser(checkIsAdmin()); }, []);

  // Create sheet
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(BLANK);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit sheet
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [editForm, setEditForm] = useState(BLANK);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function loadSuppliers() {
    setLoading(true);
    apiFetchJson<Supplier[]>(
      `/api/v1/suppliers?include_inactive=${showInactive}${search ? `&search=${encodeURIComponent(search)}` : ""}`
    )
      .then(setSuppliers)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSuppliers(); }, [search, showInactive]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) { setCreateError("Supplier name is required"); return; }
    setCreateSaving(true);
    setCreateError(null);
    try {
      await apiFetchJson("/api/v1/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: createForm.name.trim(),
          contact_person: createForm.contact_person.trim() || null,
          phone: createForm.phone.trim() || null,
          email: createForm.email.trim() || null,
          address: createForm.address.trim() || null,
          notes: createForm.notes.trim() || null,
        }),
      });
      setShowCreate(false);
      setCreateForm(BLANK);
      loadSuppliers();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreateSaving(false);
    }
  }

  function openEdit(s: Supplier) {
    setEditTarget(s);
    setEditForm({
      name: s.name,
      contact_person: s.contact_person ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
      notes: s.notes ?? "",
    });
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    if (!editForm.name.trim()) { setEditError("Supplier name is required"); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      await apiFetchJson(`/api/v1/suppliers/${editTarget.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editForm.name.trim(),
          contact_person: editForm.contact_person.trim() || null,
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
          address: editForm.address.trim() || null,
          notes: editForm.notes.trim() || null,
        }),
      });
      setEditTarget(null);
      loadSuppliers();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(s: Supplier) {
    try {
      if (s.is_active) {
        await apiFetchJson(`/api/v1/suppliers/${s.id}`, { method: "DELETE" });
      } else {
        await apiFetchJson(`/api/v1/suppliers/${s.id}`, {
          method: "PUT",
          body: JSON.stringify({ is_active: true }),
        });
      }
      loadSuppliers();
    } catch { /* ignore */ }
  }

  return (
    <>
      {/* ── Header ── */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:pr-64">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbPage>Suppliers</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              className="pl-8 h-8 w-44 text-sm"
              placeholder="Search suppliers…"
              value={search}
              onChange={(e) => { setLoading(true); setSearch(e.target.value); }}
            />
          </div>
          {adminUser && (
            <>
              <Button
                size="sm"
                variant={showInactive ? "secondary" : "ghost"}
                className="text-xs h-8"
                onClick={() => setShowInactive((v) => !v)}
              >
                {showInactive ? "Hide Inactive" : "Show Inactive"}
              </Button>
              <Button size="sm" onClick={() => { setCreateForm(BLANK); setCreateError(null); setShowCreate(true); }}>
                <UserPlus className="size-4 mr-1.5" />
                New Supplier
              </Button>
            </>
          )}
        </div>
      </header>

      {/* ── Create Dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>
          <SupplierForm
            form={createForm}
            saving={createSaving}
            error={createError}
            onChange={setCreateForm}
            onSubmit={handleCreate}
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={createSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={createSaving} onClick={handleCreate}>
              {createSaving ? "Creating…" : "Create Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
          </DialogHeader>
          <SupplierForm
            form={editForm}
            saving={editSaving}
            error={editError}
            onChange={setEditForm}
            onSubmit={handleEdit}
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={editSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={editSaving} onClick={handleEdit}>
              {editSaving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {/* Summary */}
        {!loading && !error && (
          <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Truck className="size-4" />
            <span><strong className="text-foreground">{suppliers.length}</strong> supplier{suppliers.length !== 1 ? "s" : ""}</span>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !error && suppliers.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Truck className="size-12 mx-auto mb-3 opacity-20" />
            <p className="mb-4">No suppliers found{search ? ` for "${search}"` : ""}.</p>
            {adminUser && !search && (
              <Button size="sm" onClick={() => { setCreateForm(BLANK); setCreateError(null); setShowCreate(true); }}>
                <UserPlus className="size-4 mr-1.5" />
                Add First Supplier
              </Button>
            )}
          </div>
        )}

        {!loading && !error && suppliers.length > 0 && (
          <div className="space-y-3">
            {suppliers.map((s) => (
              <div
                key={s.id}
                className={`rounded-xl border bg-card p-4 flex items-start gap-4 cursor-pointer hover:bg-muted/40 hover:border-primary/30 transition-colors ${!s.is_active ? "opacity-60" : ""}`}
                onClick={() => router.push(`/dashboard/suppliers/${s.id}`)}
              >
                {/* Avatar */}
                <div
                  className="size-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 select-none"
                  style={{ backgroundColor: avatarColor(s.name) }}
                >
                  {s.name.slice(0, 2).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{s.name}</span>
                    {!s.is_active && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Inactive</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {s.contact_person && <span>{s.contact_person}</span>}
                    {s.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" />{s.phone}
                      </span>
                    )}
                    {s.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="size-3" />{s.email}
                      </span>
                    )}
                    {s.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" />{s.address}
                      </span>
                    )}
                  </div>
                  {s.notes && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{s.notes}</p>
                  )}
                </div>

                {adminUser && (
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      title="Edit"
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      title={s.is_active ? "Deactivate" : "Reactivate"}
                      onClick={() => toggleActive(s)}
                    >
                      {s.is_active
                        ? <ToggleRight className="size-4 text-emerald-500" />
                        : <ToggleLeft className="size-4 text-slate-400" />}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Reusable Form ─────────────────────────────────────────────────────────────

function SupplierForm({
  form,
  saving,
  error,
  onChange,
  onSubmit,
}: {
  form: typeof BLANK;
  saving: boolean;
  error: string | null;
  onChange: (f: typeof BLANK) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="px-4 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="s-name">Supplier Name <span className="text-destructive">*</span></Label>
        <Input
          id="s-name"
          autoFocus
          placeholder="e.g. ABC Auto Parts Pvt. Ltd."
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          disabled={saving}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-contact">Contact Person <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
        <Input
          id="s-contact"
          placeholder="e.g. Suresh Sharma"
          value={form.contact_person}
          onChange={(e) => onChange({ ...form, contact_person: e.target.value })}
          disabled={saving}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="s-phone">Phone</Label>
          <Input
            id="s-phone"
            type="tel"
            placeholder="+91 98765…"
            value={form.phone}
            onChange={(e) => onChange({ ...form, phone: e.target.value })}
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-email">Email</Label>
          <Input
            id="s-email"
            type="email"
            placeholder="name@company.com"
            value={form.email}
            onChange={(e) => onChange({ ...form, email: e.target.value })}
            disabled={saving}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-address">Address <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
        <Input
          id="s-address"
          placeholder="e.g. Industrial Area, Pune"
          value={form.address}
          onChange={(e) => onChange({ ...form, address: e.target.value })}
          disabled={saving}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-notes">Notes</Label>
        <textarea
          id="s-notes"
          rows={3}
          placeholder="Any additional info…"
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
          disabled={saving}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarColor(name: string) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue},55%,40%)`;
}
