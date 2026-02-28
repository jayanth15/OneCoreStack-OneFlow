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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { apiFetchJson } from "@/lib/api";
import { isAdmin as checkIsAdmin } from "@/lib/user";
import {
  Search, Contact, ChevronRight, CalendarDays,
  Package, TrendingUp, Clock, UserPlus,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomerSummary {
  customer_name: string;
  customer_id: number | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  total_schedules: number;
  active_schedules: number;
  total_active_qty: number;
  total_backlog: number;
  total_delivered: number;
  products: string[];
  active_products: string[];
  next_delivery_date: string | null;
  last_schedule_date: string | null;
  status_counts: Record<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

const STATUS_DOT: Record<string, string> = {
  pending:       "bg-slate-400",
  confirmed:     "bg-blue-500",
  in_production: "bg-amber-500",
  delivered:     "bg-emerald-500",
  cancelled:     "bg-red-400",
};

function avatarColor(name: string) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue},55%,40%)`;
}

function Initials({ name }: { name: string }) {
  const words = name.trim().split(/\s+/);
  const letters = (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  return (
    <div
      className="size-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 select-none"
      style={{ backgroundColor: avatarColor(name) }}
    >
      {letters}
    </div>
  );
}

const BLANK_CREATE = { name: "", contact_person: "", phone: "", email: "", notes: "" };

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Admin state
  const [adminUser, setAdminUser] = useState(false);
  useEffect(() => { setAdminUser(checkIsAdmin()); }, []);

  // Create customer sheet
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function loadCustomers() {
    setLoading(true);
    apiFetchJson<CustomerSummary[]>(
      `/api/v1/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`
    )
      .then(setCustomers)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadCustomers(); }, [search]);

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) { setCreateError("Customer name is required"); return; }
    setCreateSaving(true);
    setCreateError(null);
    try {
      await apiFetchJson("/api/v1/customers", {
        method: "POST",
        body: JSON.stringify({
          name: createForm.name.trim(),
          contact_person: createForm.contact_person.trim() || null,
          phone: createForm.phone.trim() || null,
          email: createForm.email.trim() || null,
          notes: createForm.notes.trim() || null,
        }),
      });
      setShowCreate(false);
      setCreateForm(BLANK_CREATE);
      loadCustomers();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreateSaving(false);
    }
  }

  const filtered = customers;

  return (
    <>
      {/* ── Header ── */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbPage>Customers</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              className="pl-8 h-8 w-48 text-sm"
              placeholder="Search customers…"
              value={search}
              onChange={(e) => { setLoading(true); setSearch(e.target.value); }}
            />
          </div>
          {adminUser && (
            <Button size="sm" onClick={() => { setCreateForm(BLANK_CREATE); setCreateError(null); setShowCreate(true); }}>
              <UserPlus className="size-4 mr-1.5" />
              New Customer
            </Button>
          )}
        </div>
      </header>

      {/* ── Create Customer Sheet ── */}
      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-2">
            <SheetTitle>Add Customer / OEM Client</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleCreateCustomer} className="px-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Customer / OEM Name <span className="text-destructive">*</span></Label>
              <Input
                id="c-name"
                autoFocus
                placeholder="e.g. Tata Motors Ltd."
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                disabled={createSaving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-contact">Contact Person <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="c-contact"
                placeholder="e.g. Rajesh Kumar"
                value={createForm.contact_person}
                onChange={(e) => setCreateForm((f) => ({ ...f, contact_person: e.target.value }))}
                disabled={createSaving}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">Phone</Label>
                <Input
                  id="c-phone"
                  type="tel"
                  placeholder="+91 98765…"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                  disabled={createSaving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input
                  id="c-email"
                  type="email"
                  placeholder="name@company.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={createSaving}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-notes">Notes</Label>
              <textarea
                id="c-notes"
                rows={3}
                placeholder="Any additional info…"
                value={createForm.notes}
                onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                disabled={createSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none"
              />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </form>
          <SheetFooter className="px-4">
            <Button type="submit" disabled={createSaving} className="w-full" onClick={handleCreateCustomer}>
              {createSaving ? "Creating…" : "Create Customer"}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => setShowCreate(false)} disabled={createSaving}>
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {/* Summary banner */}
        {!loading && !error && (
          <div className="mb-5 flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Contact className="size-4" />
              <span><strong className="text-foreground">{filtered.length}</strong> customer{filtered.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" />
              <span><strong className="text-foreground">{filtered.reduce((a, c) => a + c.active_schedules, 0)}</strong> active schedules</span>
            </div>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !error && (
          <>
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Contact className="size-12 mx-auto mb-3 opacity-20" />
                <p className="mb-4">No customers found{search ? ` for "${search}"` : ""}.</p>
                {adminUser && !search && (
                  <Button size="sm" onClick={() => setShowCreate(true)}>
                    <UserPlus className="size-4 mr-1.5" />
                    Add First Customer
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((c) => {
                  const days = daysUntil(c.next_delivery_date);
                  const urgent = days !== null && days <= 14;
                  return (
                    <button
                      key={c.customer_name}
                      className="w-full text-left rounded-xl border bg-card hover:bg-muted/40 hover:border-primary/30 transition-colors p-4 group"
                      onClick={() => router.push(`/dashboard/customers/${encodeURIComponent(c.customer_name)}`)}
                    >
                      <div className="flex items-start gap-4">
                        <Initials name={c.customer_name} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{c.customer_name}</span>
                            {c.active_schedules > 0 && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                {c.active_schedules} active
                              </span>
                            )}
                            {c.total_schedules === 0 && (
                              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                                No schedules yet
                              </span>
                            )}
                            {urgent && c.next_delivery_date && (
                              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                <Clock className="size-3" />
                                {days === 0 ? "Due today" : days! < 0 ? `${Math.abs(days!)}d overdue` : `${days}d left`}
                              </span>
                            )}
                          </div>
                          {c.contact_person && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {c.contact_person}{c.phone && <span> · {c.phone}</span>}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {c.products.length > 0 ? c.products.join(" · ") : "No products yet"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                            {c.total_schedules > 0 && (
                              <span className="flex items-center gap-1">
                                <CalendarDays className="size-3" />
                                {c.total_schedules} schedule{c.total_schedules !== 1 ? "s" : ""}
                              </span>
                            )}
                            {c.total_active_qty > 0 && (
                              <span className="flex items-center gap-1">
                                <Package className="size-3" />
                                {c.total_active_qty.toLocaleString()} units ordered
                              </span>
                            )}
                            {c.total_delivered > 0 && (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <TrendingUp className="size-3" />
                                {c.total_delivered.toLocaleString()} delivered
                              </span>
                            )}
                            {c.next_delivery_date && (
                              <span className={urgent ? "text-amber-700 font-medium" : ""}>
                                Next: {fmtDate(c.next_delivery_date)}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex gap-1.5 flex-wrap">
                            {Object.entries(c.status_counts)
                              .filter(([, count]) => count > 0)
                              .map(([s, count]) => (
                                <span key={s} className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <span className={`size-1.5 rounded-full inline-block ${STATUS_DOT[s] ?? "bg-muted-foreground"}`} />
                                  {count} {s.replace("_", " ")}
                                </span>
                              ))}
                          </div>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

