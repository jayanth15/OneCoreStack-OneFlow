"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser, ALL_INVENTORY_TYPES, INVENTORY_TYPE_LABELS } from "@/lib/user";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

interface DeptRef {
  id: number;
  code: string;
  name: string;
}

const BLANK = {
  username: "",
  password: "",
  role: "worker",
  is_active: true,
  department_ids: [] as number[],
  inventory_access: [] as string[],
  inventory_edit: [] as string[],
  request_department_ids: [] as number[],
  request_inventory: [] as string[],
  can_create_receipt: false,
  grn_access: false,
  photo_base64: null as string | null,
};

export default function NewUserPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) router.replace("/dashboard");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState(BLANK);
  const [allDepts, setAllDepts] = useState<DeptRef[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
    apiFetchJson<DeptRef[]>("/api/v1/admin/departments?include_inactive=false")
      .then(setAllDepts)
      .catch(() => {});
  }, []);

  function toggleDept(id: number) {
    setForm((prev) => ({
      ...prev,
      department_ids: prev.department_ids.includes(id)
        ? prev.department_ids.filter((d) => d !== id)
        : [...prev.department_ids, id],
    }));
  }

  function toggleInventoryAccess(type: string) {
    setForm((prev) => {
      const removing = prev.inventory_access.includes(type);
      return {
        ...prev,
        inventory_access: removing
          ? prev.inventory_access.filter((t) => t !== type)
          : [...prev.inventory_access, type],
        // When revoking access, also revoke edit for that type
        inventory_edit: removing
          ? prev.inventory_edit.filter((t) => t !== type)
          : prev.inventory_edit,
      };
    });
  }

  function toggleInventoryEdit(type: string) {
    setForm((prev) => ({
      ...prev,
      inventory_edit: prev.inventory_edit.includes(type)
        ? prev.inventory_edit.filter((t) => t !== type)
        : [...prev.inventory_edit, type],
    }));
  }

  function toggleRequestDept(id: number) {
    setForm((prev) => ({
      ...prev,
      request_department_ids: prev.request_department_ids.includes(id)
        ? prev.request_department_ids.filter((d) => d !== id)
        : [...prev.request_department_ids, id],
    }));
  }

  function toggleRequestInventory(type: string) {
    setForm((prev) => ({
      ...prev,
      request_inventory: prev.request_inventory.includes(type)
        ? prev.request_inventory.filter((t) => t !== type)
        : [...prev.request_inventory, type],
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.username.trim()) { setError("Username is required"); return; }
    if (!form.password) { setError("Password is required"); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetchJson("/api/v1/admin/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      router.push("/dashboard/admin/users");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link
          href="/dashboard/admin/users"
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/admin/users">Users</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>New User</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">New User</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create a new system user and assign their departments.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Username */}
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              ref={usernameRef}
              placeholder="e.g. john.doe"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              disabled={saving}
              autoComplete="off"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Set password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                disabled={saving}
                className="pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {/* Photo */}
          <div className="space-y-1.5">
            <Label>Photo <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
            <div className="flex items-center gap-3">
              {form.photo_base64 ? (
                <img src={form.photo_base64} alt="preview" className="size-14 rounded-full object-cover border" />
              ) : (
                <div className="size-14 rounded-full bg-muted flex items-center justify-center border text-muted-foreground text-lg font-bold">
                  {form.username ? form.username.slice(0, 2).toUpperCase() : "?"}
                </div>
              )}
              <div className="flex flex-col gap-1">
                <input
                  type="file"
                  accept="image/*"
                  disabled={saving}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => setForm((prev) => ({ ...prev, photo_base64: ev.target?.result as string }));
                    reader.readAsDataURL(file);
                  }}
                  className="text-sm cursor-pointer file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:text-xs file:bg-muted file:text-foreground"
                />
                {form.photo_base64 && (
                  <button type="button" onClick={() => setForm((prev) => ({ ...prev, photo_base64: null }))} className="text-xs text-destructive hover:underline text-left">
                    Remove photo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>            <select
              id="role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="worker">Worker</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={form.is_active ? "active" : "inactive"}
              onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Departments */}
          <div className="space-y-2">
            <Label>
              Departments
              <span className="text-muted-foreground font-normal ml-1">(select one or more)</span>
            </Label>
            {allDepts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No departments available.{" "}
                <Link href="/dashboard/admin/departments/new" className="underline underline-offset-2">
                  Create one first.
                </Link>
              </p>
            ) : (
              <div className="rounded-md border divide-y">
                {allDepts.map((dept) => {
                  const checked = form.department_ids.includes(dept.id);
                  return (
                    <label
                      key={dept.id}
                      className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDept(dept.id)}
                        disabled={saving}
                        className="size-4 rounded accent-primary"
                      />
                      <span className="font-mono text-xs font-medium text-muted-foreground w-14 shrink-0">
                        {dept.code}
                      </span>
                      <span className="text-sm">{dept.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {form.department_ids.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {form.department_ids.length} department{form.department_ids.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>

          {/* GRN Access */}
          <div className="flex items-center gap-3 rounded-md border px-3 py-3">
            <input
              type="checkbox"
              id="grn_access"
              checked={form.grn_access}
              onChange={(e) => setForm({ ...form, grn_access: e.target.checked })}
              disabled={saving}
              className="size-4 rounded accent-primary"
            />
            <label htmlFor="grn_access" className="text-sm cursor-pointer select-none">
              <span className="font-medium">GRN Access</span>
              <span className="text-muted-foreground ml-1">(can access Goods Received Notes, create entries and mark stock filled)</span>
            </label>
          </div>

          {/* Inventory Access — only relevant for non-admin roles */}
          {(form.role === "manager" || form.role === "worker") && (
            <>
              <div className="space-y-2">
                <Label>
                  Inventory Access
                  <span className="text-muted-foreground font-normal ml-1">(leave all unchecked = access to all types)</span>
                </Label>
                <div className="rounded-md border divide-y">
                  {ALL_INVENTORY_TYPES.map((type) => {
                    const checked = form.inventory_access.includes(type);
                    return (
                      <label
                        key={type}
                        className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleInventoryAccess(type)}
                          disabled={saving}
                          className="size-4 rounded accent-primary"
                        />
                        <span className="text-sm">{INVENTORY_TYPE_LABELS[type]}</span>
                      </label>
                    );
                  })}
                </div>
                {form.inventory_access.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Access limited to: {form.inventory_access.map((t) => INVENTORY_TYPE_LABELS[t as keyof typeof INVENTORY_TYPE_LABELS] ?? t).join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>
                  Inventory Edit Access
                  <span className="text-muted-foreground font-normal ml-1">(leave all unchecked = no edit access)</span>
                </Label>
                <div className="rounded-md border divide-y">
                  {ALL_INVENTORY_TYPES.map((type) => {
                    const checked = form.inventory_edit.includes(type);
                    const accessLimited = form.inventory_access.length > 0;
                    const notInAccess = accessLimited && !form.inventory_access.includes(type);
                    const rowDisabled = saving || notInAccess;
                    return (
                      <label
                        key={type}
                        className={`flex items-center gap-3 px-3 py-3 transition-colors ${
                          rowDisabled ? "opacity-40 cursor-not-allowed bg-muted/20" : "cursor-pointer hover:bg-muted/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => !rowDisabled && toggleInventoryEdit(type)}
                          disabled={rowDisabled}
                          className="size-4 rounded accent-primary"
                        />
                        <span className="text-sm">{INVENTORY_TYPE_LABELS[type]}</span>
                        {notInAccess && (
                          <span className="ml-auto text-xs text-muted-foreground">(no access)</span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {form.inventory_edit.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Edit limited to: {form.inventory_edit.map((t) => INVENTORY_TYPE_LABELS[t as keyof typeof INVENTORY_TYPE_LABELS] ?? t).join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-4 rounded-md border p-4">
                <p className="text-sm font-medium">Request Permissions</p>

                <div className="space-y-2">
                  <Label>
                    Can Raise Requests To
                    <span className="text-muted-foreground font-normal ml-1">(leave all unchecked = all departments)</span>
                  </Label>
                  {allDepts.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-1">No departments available.</p>
                  ) : (
                    <div className="rounded-md border divide-y">
                      {allDepts.map((dept) => {
                        const checked = form.request_department_ids.includes(dept.id);
                        return (
                          <label
                            key={dept.id}
                            className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRequestDept(dept.id)}
                              disabled={saving}
                              className="size-4 rounded accent-primary"
                            />
                            <span className="font-mono text-xs font-medium text-muted-foreground w-14 shrink-0">
                              {dept.code}
                            </span>
                            <span className="text-sm">{dept.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>
                    Can Request Inventory Types
                    <span className="text-muted-foreground font-normal ml-1">(leave all unchecked = all types)</span>
                  </Label>
                  <div className="rounded-md border divide-y">
                    {ALL_INVENTORY_TYPES.map((type) => {
                      const checked = form.request_inventory.includes(type);
                      return (
                        <label
                          key={type}
                          className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRequestInventory(type)}
                            disabled={saving}
                            className="size-4 rounded accent-primary"
                          />
                          <span className="text-sm">{INVENTORY_TYPE_LABELS[type]}</span>
                        </label>
                      );
                    })}
                  </div>
                  {form.request_inventory.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Request limited to: {form.request_inventory.map((t) => INVENTORY_TYPE_LABELS[t as keyof typeof INVENTORY_TYPE_LABELS] ?? t).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              {/* Receipt Creation Permission */}
              <div className="flex items-center gap-3 rounded-md border px-3 py-3">
                <input
                  type="checkbox"
                  id="can_create_receipt"
                  checked={form.can_create_receipt}
                  onChange={(e) => setForm({ ...form, can_create_receipt: e.target.checked })}
                  disabled={saving}
                  className="size-4 rounded accent-primary"
                />
                <label htmlFor="can_create_receipt" className="text-sm cursor-pointer select-none">
                  <span className="font-medium">Can Create Receipts</span>
                  <span className="text-muted-foreground ml-1">(allowed to record goods received for purchase requests)</span>
                </label>
              </div>            </>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
              {saving ? "Creating…" : "Create User"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/dashboard/admin/users")}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
