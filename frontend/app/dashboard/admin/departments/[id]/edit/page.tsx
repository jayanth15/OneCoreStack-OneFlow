"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbLink,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/user";
import { ArrowLeft } from "lucide-react";

interface DeptForm {
  code: string;
  name: string;
  description: string;
  is_active: boolean;
}

export default function EditDepartmentPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) router.replace("/dashboard");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState<DeptForm>({ code: "", name: "", description: "", is_active: true });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiFetchJson<DeptForm & { id: number; description: string | null }>(`/api/v1/admin/departments/${id}`)
      .then((data) => {
        setForm({ code: data.code, name: data.name, description: data.description ?? "", is_active: data.is_active });
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : "Not found");
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      setSaveError("Code and Name are required");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetchJson(`/api/v1/admin/departments/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          description: form.description.trim() || null,
        }),
      });
      router.push("/dashboard/admin/departments");
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link
          href="/dashboard/admin/departments"
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/admin/departments">Departments</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>
                {loading ? "Edit…" : `Edit ${form.code}`}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Edit Department</h1>
          {!loading && (
            <p className="text-sm text-muted-foreground mt-1">
              Editing <span className="font-mono font-medium">{form.code}</span>
            </p>
          )}
        </div>

        {loadError ? (
          <p className="text-sm text-destructive" role="alert">{loadError}</p>
        ) : loading ? (
          <div className="space-y-5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-1/2" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="dept-code">Code</Label>
              <Input
                id="dept-code"
                placeholder="e.g. PROD"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                disabled={saving}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">Auto-uppercased.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dept-name">Name</Label>
              <Input
                id="dept-name"
                placeholder="e.g. Production"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dept-desc">Description</Label>
              <Input
                id="dept-desc"
                placeholder="e.g. Handles all manufacturing operations"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">Optional — brief purpose of this department.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dept-status">Status</Label>
              <select
                id="dept-status"
                value={form.is_active ? "active" : "inactive"}
                onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {saveError && (
              <p className="text-sm text-destructive" role="alert">{saveError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/admin/departments")}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
