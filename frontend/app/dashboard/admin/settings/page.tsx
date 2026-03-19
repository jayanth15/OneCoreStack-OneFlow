"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
  BreadcrumbSeparator, BreadcrumbLink,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { getCurrentUser } from "@/lib/user";
import {
  Building2, Download, Save, CheckCircle2, AlertCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompanyInfo {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_gstin: string;
  company_website: string;
  company_logo_url: string;
  company_city: string;
  company_state: string;
  company_country: string;
  company_pincode: string;
}

const BLANK: CompanyInfo = {
  company_name: "",
  company_address: "",
  company_phone: "",
  company_email: "",
  company_gstin: "",
  company_website: "",
  company_logo_url: "",
  company_city: "",
  company_state: "",
  company_country: "",
  company_pincode: "",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      router.replace("/dashboard");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Company Info ─────────────────────────────────────────────────────────

  const [form, setForm] = useState<CompanyInfo>(BLANK);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    apiFetchJson<CompanyInfo>("/api/v1/settings/company")
      .then((d) => {
        setForm(d);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : "Failed to load settings");
        setLoading(false);
      });
  }, []);

  function set(key: keyof CompanyInfo, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveStatus("idle");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus("idle");
    setSaveError(null);
    try {
      await apiFetchJson<CompanyInfo>("/api/v1/settings/company", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setSaveStatus("ok");
    } catch (err: unknown) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Backup ───────────────────────────────────────────────────────────────

  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  async function handleBackup() {
    setBackingUp(true);
    setBackupError(null);
    try {
      const token = getAccessToken();
      const res = await fetch("/api/v1/settings/backup", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string })?.detail ?? "Backup failed");
      }
      // Extract filename from Content-Disposition header or use default
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^";\n]+)"?/);
      const filename = match?.[1] ?? "oneflow_backup.db";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setBackupError(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setBackingUp(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b px-4 md:px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Settings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-10">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            System-wide configuration for your OneFlow installation.
          </p>
        </div>

        {/* ── Company Information ────────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 border-b pb-2">
            <Building2 className="size-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">Company Information</h2>
          </div>

          {loadError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {loadError}
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              {/* Row 1: Company name */}
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Company Name</Label>
                <Input
                  id="c-name"
                  placeholder="Acme Manufacturing Pvt. Ltd."
                  value={form.company_name}
                  onChange={(e) => set("company_name", e.target.value)}
                  disabled={saving}
                />
              </div>

              {/* Row 2: Address */}
              <div className="space-y-1.5">
                <Label htmlFor="c-address">Address</Label>
                <Input
                  id="c-address"
                  placeholder="123, Industrial Area, Phase 1"
                  value={form.company_address}
                  onChange={(e) => set("company_address", e.target.value)}
                  disabled={saving}
                />
              </div>

              {/* Row 3: City / State / Country / Pincode */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="c-city">City</Label>
                  <Input
                    id="c-city"
                    placeholder="Pune"
                    value={form.company_city}
                    onChange={(e) => set("company_city", e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-state">State</Label>
                  <Input
                    id="c-state"
                    placeholder="Maharashtra"
                    value={form.company_state}
                    onChange={(e) => set("company_state", e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-country">Country</Label>
                  <Input
                    id="c-country"
                    placeholder="India"
                    value={form.company_country}
                    onChange={(e) => set("company_country", e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-pin">Pincode</Label>
                  <Input
                    id="c-pin"
                    placeholder="411001"
                    value={form.company_pincode}
                    onChange={(e) => set("company_pincode", e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Row 4: Phone / Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="c-phone">Phone</Label>
                  <Input
                    id="c-phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={form.company_phone}
                    onChange={(e) => set("company_phone", e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-email">Email</Label>
                  <Input
                    id="c-email"
                    type="email"
                    placeholder="info@acme.com"
                    value={form.company_email}
                    onChange={(e) => set("company_email", e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Row 5: Website / GSTIN */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="c-website">Website</Label>
                  <Input
                    id="c-website"
                    type="url"
                    placeholder="https://acme.com"
                    value={form.company_website}
                    onChange={(e) => set("company_website", e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-gstin">GSTIN</Label>
                  <Input
                    id="c-gstin"
                    placeholder="27AAAAA0000A1Z5"
                    value={form.company_gstin}
                    onChange={(e) => set("company_gstin", e.target.value)}
                    disabled={saving}
                    className="font-mono uppercase"
                    maxLength={15}
                  />
                </div>
              </div>

              {/* Row 6: Logo URL */}
              <div className="space-y-1.5">
                <Label htmlFor="c-logo">Logo URL</Label>
                <Input
                  id="c-logo"
                  type="url"
                  placeholder="https://acme.com/logo.png"
                  value={form.company_logo_url}
                  onChange={(e) => set("company_logo_url", e.target.value)}
                  disabled={saving}
                />
                {form.company_logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.company_logo_url}
                    alt="Logo preview"
                    className="mt-2 h-16 object-contain rounded border p-1"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
              </div>

              {/* Save status */}
              {saveStatus === "ok" && (
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="size-4" />
                  Company information saved successfully.
                </div>
              )}
              {saveStatus === "error" && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="size-4" />
                  {saveError ?? "Failed to save settings."}
                </div>
              )}

              <Button type="submit" disabled={saving} className="gap-2">
                <Save className="size-4" />
                {saving ? "Saving…" : "Save Company Info"}
              </Button>
            </form>
          )}
        </section>

        {/* ── Database Backup ────────────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 border-b pb-2">
            <Download className="size-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">Database Backup</h2>
          </div>

          <div className="rounded-lg border p-5 space-y-4 bg-muted/30">
            <div>
              <p className="text-sm font-medium">Download a backup copy of the database</p>
              <p className="text-sm text-muted-foreground mt-1">
                Creates a hot backup of the live SQLite database file using
                the built-in SQLite backup API (safe on both Linux &amp; Windows
                even while the app is running). The backup is downloaded directly
                to your computer as a <code className="font-mono text-xs">.db</code> file.
              </p>
            </div>
            {backupError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                {backupError}
              </div>
            )}
            <Button
              variant="outline"
              disabled={backingUp}
              onClick={handleBackup}
              className="gap-2"
            >
              <Download className="size-4" />
              {backingUp ? "Creating backup…" : "Download Backup"}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
