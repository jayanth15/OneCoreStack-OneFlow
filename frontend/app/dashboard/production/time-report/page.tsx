"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Combobox, ComboboxContent, ComboboxEmpty,
  ComboboxInput, ComboboxItem, ComboboxList,
} from "@/components/ui/combobox";
import { apiFetchJson } from "@/lib/api";
import {
  ArrowLeft, Clock, User, Users, Package, TrendingUp,
  Factory, Wrench, CalendarDays, ChevronDown, ChevronUp, BarChart3,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkerOption { id: number; username: string; }

interface ProcessBreakdown {
  process_name: string;
  hours: number;
  qty_produced: number;
  card_count: number;
  shared_cards: number;
}
interface OrderBreakdown {
  order_number: string;
  hours: number;
  qty_produced: number;
  card_count: number;
  shared_cards: number;
}
interface DateBreakdown {
  date: string;
  hours: number;
  qty_produced: number;
  card_count: number;
  shared_cards: number;
}
interface MachineBreakdown {
  machine_name: string;
  hours: number;
  qty_produced: number;
  card_count: number;
  shared_cards: number;
}
interface WorkerTimeSummary {
  user_id: number | null;
  username: string;
  total_hours: number;
  total_qty_produced: number;
  job_card_count: number;
  shared_card_count: number;
  avg_qty_per_hour: number;
  process_names: string[];
  order_numbers: string[];
  work_dates: string[];
  machines_used: string[];
  tool_die_numbers: string[];
  by_process: ProcessBreakdown[];
  by_order: OrderBreakdown[];
  by_date: DateBreakdown[];
  by_machine: MachineBreakdown[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border p-4 flex items-start gap-3">
      <div className={`p-2 rounded-md shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Collapsible section ────────────────────────────────────────────────────────

function Section({ title, icon, badge, children }: {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
      >
        {icon}
        <span className="font-medium text-sm flex-1">{title}</span>
        {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
        {open ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="divide-y">{children}</div>}
    </div>
  );
}

// ── Mini bar ──────────────────────────────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden w-full">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Worker Report Detail ───────────────────────────────────────────────────────

function WorkerReportDetail({ w }: { w: WorkerTimeSummary }) {
  const maxProcHours = Math.max(...w.by_process.map((p) => p.hours), 0.001);
  const maxOrdHours  = Math.max(...w.by_order.map((o) => o.hours), 0.001);
  const maxMachHours = Math.max(...w.by_machine.map((m) => m.hours), 0.001);
  const maxDateHours = Math.max(...w.by_date.map((d) => d.hours), 0.001);

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Clock className="size-4 text-purple-600" />}
          label="Total Hours"
          value={`${w.total_hours.toFixed(1)} h`}
          sub={`${w.job_card_count} job card${w.job_card_count !== 1 ? "s" : ""}`}
          color="bg-purple-50 dark:bg-purple-950/20"
        />
        <StatCard
          icon={<Package className="size-4 text-emerald-600" />}
          label="Qty Produced"
          value={w.total_qty_produced % 1 === 0 ? String(w.total_qty_produced) : w.total_qty_produced.toFixed(1)}
          sub={`across ${w.process_names.length} process${w.process_names.length !== 1 ? "es" : ""}`}
          color="bg-emerald-50 dark:bg-emerald-950/20"
        />
        <StatCard
          icon={<TrendingUp className="size-4 text-blue-600" />}
          label="Avg Qty / Hour"
          value={w.avg_qty_per_hour > 0 ? w.avg_qty_per_hour.toFixed(1) : "—"}
          sub="productivity rate"
          color="bg-blue-50 dark:bg-blue-950/20"
        />
        <StatCard
          icon={<CalendarDays className="size-4 text-amber-600" />}
          label="Working Days"
          value={String(w.work_dates.length)}
          sub={w.work_dates.length > 0
            ? `${fmtDate(w.work_dates[0])} – ${fmtDate(w.work_dates[w.work_dates.length - 1])}`
            : "—"}
          color="bg-amber-50 dark:bg-amber-950/20"
        />
      </div>

      {/* Shared-cards note */}
      {w.shared_card_count > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20 px-4 py-2.5 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <Users className="size-3.5 shrink-0" />
          <span>
            {w.shared_card_count} job card{w.shared_card_count !== 1 ? "s" : ""} were shared with other workers.
            Hours shown are your personal share; qty reflects your full contribution.
          </span>
        </div>
      )}

      {/* By Process */}
      {w.by_process.length > 0 && (
        <Section title="By Process" icon={<Factory className="size-3.5 text-muted-foreground" />} badge={String(w.by_process.length)}>
          {w.by_process.map((p) => (
            <div key={p.process_name} className="px-4 py-3 space-y-1.5 hover:bg-muted/20 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.process_name}</span>
                  {p.shared_cards > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/30">
                      <Users className="size-2.5 mr-0.5" />{p.shared_cards} shared
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-right shrink-0">
                  <span className="text-purple-600 font-mono font-semibold">{p.hours.toFixed(1)} h</span>
                  <span className="text-emerald-600 font-mono font-semibold">
                    {p.qty_produced % 1 === 0 ? p.qty_produced : p.qty_produced.toFixed(1)} pcs
                  </span>
                  <span className="text-muted-foreground w-14">{p.card_count} card{p.card_count !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <MiniBar value={p.hours} max={maxProcHours} color="bg-purple-400" />
            </div>
          ))}
        </Section>
      )}

      {/* By Date — timeline bars */}
      {w.by_date.length > 0 && (
        <Section title="Daily Activity" icon={<CalendarDays className="size-3.5 text-muted-foreground" />} badge={`${w.by_date.length} days`}>
          <div className="px-4 py-3 space-y-2">
            {w.by_date.map((d) => (
              <div key={d.date} className="flex items-center gap-3 text-xs">
                <span className="w-24 shrink-0 text-muted-foreground">{fmtDate(d.date)}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-5 rounded bg-muted overflow-hidden relative">
                    <div
                      className="h-full bg-purple-200 dark:bg-purple-900/40 rounded flex items-center pl-1.5"
                      style={{ width: `${Math.max(5, Math.round((d.hours / maxDateHours) * 100))}%` }}
                    >
                      <span className="text-[10px] font-mono text-purple-700 dark:text-purple-300 whitespace-nowrap">
                        {d.hours.toFixed(1)} h
                      </span>
                    </div>
                  </div>
                  <span className="w-16 text-right text-emerald-600 font-mono shrink-0">
                    {d.qty_produced % 1 === 0 ? d.qty_produced : d.qty_produced.toFixed(1)} pcs
                  </span>
                  <span className="w-14 text-right text-muted-foreground shrink-0">
                    {d.card_count} card{d.card_count !== 1 ? "s" : ""}
                    {d.shared_cards > 0 && <span className="ml-1 text-blue-500" title={`${d.shared_cards} shared`}>·{d.shared_cards}↗</span>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* By Order */}
      {w.by_order.length > 0 && (
        <Section title="By Production Order" icon={<BarChart3 className="size-3.5 text-muted-foreground" />} badge={String(w.by_order.length)}>
          {w.by_order.map((o) => (
            <div key={o.order_number} className="px-4 py-3 space-y-1.5 hover:bg-muted/20 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium">{o.order_number}</span>
                  {o.shared_cards > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/30">
                      <Users className="size-2.5 mr-0.5" />{o.shared_cards} shared
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-right shrink-0">
                  <span className="text-purple-600 font-mono font-semibold">{o.hours.toFixed(1)} h</span>
                  <span className="text-emerald-600 font-mono font-semibold">
                    {o.qty_produced % 1 === 0 ? o.qty_produced : o.qty_produced.toFixed(1)} pcs
                  </span>
                  <span className="text-muted-foreground w-14">{o.card_count} card{o.card_count !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <MiniBar value={o.hours} max={maxOrdHours} color="bg-blue-400" />
            </div>
          ))}
        </Section>
      )}

      {/* By Machine */}
      {w.by_machine.length > 0 && (
        <Section title="By Machine" icon={<Wrench className="size-3.5 text-muted-foreground" />} badge={String(w.by_machine.length)}>
          {w.by_machine.map((m) => (
            <div key={m.machine_name} className="px-4 py-3 space-y-1.5 hover:bg-muted/20 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{m.machine_name}</span>
                  {m.shared_cards > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/30">
                      <Users className="size-2.5 mr-0.5" />{m.shared_cards} shared
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-right shrink-0">
                  <span className="text-purple-600 font-mono font-semibold">{m.hours.toFixed(1)} h</span>
                  <span className="text-emerald-600 font-mono font-semibold">
                    {m.qty_produced % 1 === 0 ? m.qty_produced : m.qty_produced.toFixed(1)} pcs
                  </span>
                  <span className="text-muted-foreground w-14">{m.card_count} card{m.card_count !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <MiniBar value={m.hours} max={maxMachHours} color="bg-amber-400" />
            </div>
          ))}
        </Section>
      )}

      {/* Tool & Die numbers */}
      {w.tool_die_numbers.length > 0 && (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide flex items-center gap-1.5">
            <Wrench className="size-3" />Tool &amp; Die Numbers Used
          </p>
          <div className="flex flex-wrap gap-1.5">
            {w.tool_die_numbers.map((t) => (
              <Badge key={t} variant="outline" className="text-xs font-mono">{t}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── All-workers summary ────────────────────────────────────────────────────────

function SummaryTable({ data }: { data: WorkerTimeSummary[] }) {
  const totalHours = data.reduce((s, w) => s + w.total_hours, 0);
  const totalQty   = data.reduce((s, w) => s + w.total_qty_produced, 0);
  const maxHours   = Math.max(...data.map((w) => w.total_hours), 0.001);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<Clock className="size-4 text-purple-600" />}
          label="Total Hours (All)"
          value={`${totalHours.toFixed(1)} h`}
          sub={`${data.length} worker${data.length !== 1 ? "s" : ""}`}
          color="bg-purple-50 dark:bg-purple-950/20"
        />
        <StatCard
          icon={<Package className="size-4 text-emerald-600" />}
          label="Total Qty (All)"
          value={totalQty % 1 === 0 ? String(totalQty) : totalQty.toFixed(1)}
          sub="contributions (may overlap on shared cards)"
          color="bg-emerald-50 dark:bg-emerald-950/20"
        />
        <StatCard
          icon={<TrendingUp className="size-4 text-blue-600" />}
          label="Overall Avg Qty/Hr"
          value={totalHours > 0 ? (totalQty / totalHours).toFixed(1) : "—"}
          sub="across all workers"
          color="bg-blue-50 dark:bg-blue-950/20"
        />
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 flex items-center gap-2">
          <User className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">Worker Comparison</span>
        </div>
        <div className="divide-y">
          {data.map((w) => (
            <div key={w.user_id ?? w.username} className="px-4 py-3 space-y-1.5 hover:bg-muted/20 transition-colors">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {w.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{w.username}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {w.job_card_count} cards · {w.work_dates.length} day{w.work_dates.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs shrink-0">
                  <div className="text-right">
                    <p className="font-mono font-semibold text-purple-600">{w.total_hours.toFixed(1)} h</p>
                    <p className="text-muted-foreground">hours</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold text-emerald-600">
                      {w.total_qty_produced % 1 === 0 ? w.total_qty_produced : w.total_qty_produced.toFixed(1)}
                    </p>
                    <p className="text-muted-foreground">pcs</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="font-mono font-semibold text-blue-600">{w.avg_qty_per_hour.toFixed(1)}</p>
                    <p className="text-muted-foreground">pcs/hr</p>
                  </div>
                </div>
              </div>
              <MiniBar value={w.total_hours} max={maxHours} color="bg-purple-400" />
            </div>
          ))}
        </div>
      </div>
      {data.some((w) => w.shared_card_count > 0) && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
          <Users className="size-3 shrink-0" />
          Qty totals count each worker&apos;s full contribution. Workers on the same shared job card each receive full qty credit.
        </p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TimeReportPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [workerOptions, setWorkerOptions] = useState<WorkerOption[]>([]);
  const [fetchingWorkers, setFetchingWorkers] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedWorkerId, setSelectedWorkerId] = useState<number | "all" | null>(null);
  const [selectedWorkerName, setSelectedWorkerName] = useState<string>("");

  const [data, setData] = useState<WorkerTimeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(currentMonthStart);
  const [dateTo, setDateTo] = useState(todayStr);

  const fetchWorkers = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setFetchingWorkers(true);
      try {
        const res = await apiFetchJson<WorkerOption[]>(`/api/v1/production/workers?search=${encodeURIComponent(q)}`);
        setWorkerOptions(res);
      } catch { /* ignore */ } finally {
        setFetchingWorkers(false);
      }
    }, 250);
  }, []);

  useEffect(() => { fetchWorkers(""); }, [fetchWorkers]);

  function buildUrl(wId: number | "all" | null, from?: string, to?: string) {
    const params = new URLSearchParams();
    const f = from ?? dateFrom;
    const t = to ?? dateTo;
    if (f) params.set("date_from", f);
    if (t) params.set("date_to", t);
    if (wId !== "all" && wId !== null) params.set("user_id", String(wId));
    return `/api/v1/production/time-report?${params}`;
  }

  function fetchReport(wId: number | "all" | null, from?: string, to?: string) {
    if (wId === null) return;
    setLoading(true);
    setError(null);
    apiFetchJson<WorkerTimeSummary[]>(buildUrl(wId, from, to))
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  function handleWorkerSelect(value: string) {
    if (!value) {
      setSelectedWorkerId(null);
      setSelectedWorkerName("");
      setData([]);
      return;
    }
    if (value === "all") {
      setSelectedWorkerId("all");
      setSelectedWorkerName("All Workers");
      fetchReport("all");
      return;
    }
    const id = Number(value);
    const opt = workerOptions.find((w) => w.id === id);
    setSelectedWorkerId(id);
    setSelectedWorkerName(opt?.username ?? "");
    fetchReport(id);
  }

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    fetchReport(selectedWorkerId, dateFrom || undefined, dateTo || undefined);
  }

  const singleWorker = typeof selectedWorkerId === "number"
    ? data.find((w) => w.username === selectedWorkerName) ?? data[0] ?? null
    : null;

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link href="/dashboard/production" className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
          <ArrowLeft className="size-4" />
        </Link>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/production">Production</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Worker Time Report</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Worker Time Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hours, productivity and process breakdown per worker. Filter by date range.
          </p>
        </div>

        {/* Filters */}
        <div className="rounded-lg border p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <User className="size-3.5" />Worker
            </Label>
            <Combobox
              value={selectedWorkerId !== null ? String(selectedWorkerId) : ""}
              onValueChange={(v: unknown) => handleWorkerSelect(v as string)}
              filter={(_item: unknown) => true}
            >
              <ComboboxInput
                placeholder="Search worker or select All Workers…"
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setSearchQuery(e.target.value);
                  fetchWorkers(e.target.value);
                }}
                showTrigger
                showClear={!!selectedWorkerId}
                className="w-full"
              />
              <ComboboxContent>
                <ComboboxList>
                  {fetchingWorkers && (
                    <div className="py-2 px-3 text-xs text-muted-foreground">Searching…</div>
                  )}
                  <ComboboxEmpty>No workers found</ComboboxEmpty>
                  <ComboboxItem value="all">
                    <span className="font-medium">All Workers</span>
                    <span className="ml-auto text-xs text-muted-foreground">comparison view</span>
                  </ComboboxItem>
                  {workerOptions.map((w) => (
                    <ComboboxItem key={w.id} value={String(w.id)}>
                      {w.username}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <form onSubmit={handleFilter} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="df" className="text-xs">From</Label>
              <Input id="df" type="date" value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dt" className="text-xs">To</Label>
              <Input id="dt" type="date" value={dateTo}
                onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={selectedWorkerId === null}>
              Apply
            </Button>
            {(dateFrom || dateTo) && (
              <Button type="button" size="sm" variant="ghost"
                onClick={() => { setDateFrom(""); setDateTo(""); fetchReport(selectedWorkerId, "", ""); }}>
                Clear Dates
              </Button>
            )}
          </form>
        </div>

        {/* Content */}
        {selectedWorkerId === null ? (
          <div className="text-center py-16 text-muted-foreground border rounded-lg bg-muted/20">
            <User className="size-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Select a worker or &quot;All Workers&quot; to view the report.</p>
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border rounded-lg">
            <Clock className="size-8 mx-auto mb-2 opacity-40" />
            <p>No work logs found for the selected period.</p>
          </div>
        ) : selectedWorkerId === "all" ? (
          <SummaryTable data={data} />
        ) : singleWorker ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
              <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold shrink-0">
                {singleWorker.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">{singleWorker.username}</p>
                <p className="text-xs text-muted-foreground">
                  {dateFrom && dateTo ? `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}` : "All time"}
                  {" · "}{singleWorker.job_card_count} job card{singleWorker.job_card_count !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <WorkerReportDetail w={singleWorker} />
          </div>
        ) : null}
      </div>
    </>
  );
}

