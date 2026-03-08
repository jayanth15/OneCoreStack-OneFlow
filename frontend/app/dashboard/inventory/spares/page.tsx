"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import { PlusIcon, Pencil, Trash2, AlertTriangle, Wrench, ChevronRight, Search } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpareCategory {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  item_count: number;
  low_stock_count: number;
  created_at: string;
  updated_at: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SparesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<SpareCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");

  // Edit sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<SpareCategory | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete dialog
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setAdmin(isAdminOrAbove()); }, []);

  const fetchCategories = () => {
    setLoading(true);
    const params = new URLSearchParams({ include_inactive: "false" });
    if (search) params.set("search", search);
    apiFetchJson<SpareCategory[]>(`/api/v1/spares/categories?${params}`)
      .then(setCategories)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCategories(); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  function openEdit(cat: SpareCategory) {
    setEditing(cat);
    setForm({ name: cat.name, description: cat.description ?? "" });
    setFormError(null);
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    setSaving(true);
    setFormError(null);
    try {
      await apiFetchJson(`/api/v1/spares/categories/${editing!.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: form.name.trim(), description: form.description || null }),
      });
      setSheetOpen(false);
      fetchCategories();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/spares/categories/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      fetchCategories();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center border-b px-6 gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link href="/dashboard/inventory" className="text-muted-foreground hover:text-foreground text-sm">
                Inventory
              </Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Spares</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {admin && (
          <Button size="sm" className="ml-auto" onClick={() => router.push("/dashboard/inventory/spares/new")}>
            <PlusIcon className="size-4 mr-1" />
            New Category
          </Button>
        )}
      </header>

      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Spares</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Spare parts organised by category. Click a category to see its items.
            </p>
          </div>
          {/* Search */}
          <form
            onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); }}
            className="flex gap-1.5"
          >
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search categories…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-48"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
            {search && (
              <Button type="button" size="sm" variant="ghost" onClick={() => { setSearch(""); setSearchDraft(""); }}>
                Clear
              </Button>
            )}
          </form>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Category cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border p-5">
                <Skeleton className="h-10 w-10 rounded-lg mb-3" />
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-48 mb-4" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="rounded-xl border p-12 text-center space-y-2">
            <Wrench className="size-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search ? `No categories matching "${search}".` : "No spare categories yet."}
            </p>
            {admin && !search && (
              <Button size="sm" onClick={() => router.push("/dashboard/inventory/spares/new")}>
                <PlusIcon className="size-4 mr-1" /> Create First Category
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-all group relative"
              >
                <button
                  className="w-full text-left p-5 space-y-3"
                  onClick={() => router.push(`/dashboard/inventory/spares/${cat.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex size-12 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <Wrench className="size-6" />
                    </div>
                    {cat.low_stock_count > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="size-3 mr-1" />
                        {cat.low_stock_count} low
                      </Badge>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-base">{cat.name}</p>
                    {cat.description && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{cat.description}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold tabular-nums">
                      {cat.item_count}
                      <span className="text-sm font-normal text-muted-foreground ml-1">items</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </button>

                {/* Admin actions */}
                {admin && (
                  <div className="flex gap-1 px-4 pb-3 border-t pt-2">
                    <Button
                      variant="ghost" size="sm" className="h-7 text-xs gap-1"
                      onClick={(e) => { e.stopPropagation(); openEdit(cat); }}
                    >
                      <Pencil className="size-3" /> Edit
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs gap-1 text-destructive hover:text-destructive ml-auto"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(cat.id); }}
                    >
                      <Trash2 className="size-3" /> Delete
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit sheet */}
      <Sheet open={sheetOpen} onOpenChange={(o) => !o && setSheetOpen(false)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Edit Category</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name *</Label>
              <Input
                id="cat-name"
                placeholder="e.g. Engines"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea
                id="cat-desc"
                rows={3}
                placeholder="Brief description of this category…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the category and hide it from the list. Items inside it will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
