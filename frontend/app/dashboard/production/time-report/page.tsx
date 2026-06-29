"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { apiFetchJson } from "@/lib/api";
import {
  ArrowLeft, Clock, User, Users, Package, TrendingUp,
  Factory, Wrench, CalendarDays, ChevronDown, ChevronUp, BarChart3, Printer,
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
          color="bg-purple-50"
        />
        <StatCard
          icon={<Package className="size-4 text-success" />}
          label="Qty Produced"
          value={w.total_qty_produced % 1 === 0 ? String(w.total_qty_produced) : w.total_qty_produced.toFixed(1)}
          sub={`across ${w.process_names.length} process${w.process_names.length !== 1 ? "es" : ""}`}
          color="bg-success/10"
        />
        <StatCard
          icon={<TrendingUp className="size-4 text-primary" />}
          label="Avg Qty / Hour"
          value={w.avg_qty_per_hour > 0 ? w.avg_qty_per_hour.toFixed(1) : "—"}
          sub="productivity rate"
          color="bg-primary/10"
        />
        <StatCard
          icon={<CalendarDays className="size-4 text-warning" />}
          label="Working Days"
          value={String(w.work_dates.length)}
          sub={w.work_dates.length > 0
            ? `${fmtDate(w.work_dates[0])} – ${fmtDate(w.work_dates[w.work_dates.length - 1])}`
            : "—"}
          color="bg-warning/15"
        />
      </div>

      {/* Shared-cards note */}
      {w.shared_card_count > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/10/50 px-4 py-2.5 text-xs text-primary flex items-center gap-2">
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
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-primary border-primary/20 bg-primary/10">
                      <Users className="size-2.5 mr-0.5" />{p.shared_cards} shared
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-right shrink-0">
                  <span className="text-purple-600 font-mono font-semibold">{p.hours.toFixed(1)} h</span>
                  <span className="text-success font-mono font-semibold">
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
                      className="h-full bg-purple-200 rounded flex items-center pl-1.5"
                      style={{ width: `${Math.max(5, Math.round((d.hours / maxDateHours) * 100))}%` }}
                    >
                      <span className="text-[10px] font-mono text-purple-700 whitespace-nowrap">
                        {d.hours.toFixed(1)} h
                      </span>
                    </div>
                  </div>
                  <span className="w-16 text-right text-success font-mono shrink-0">
                    {d.qty_produced % 1 === 0 ? d.qty_produced : d.qty_produced.toFixed(1)} pcs
                  </span>
                  <span className="w-14 text-right text-muted-foreground shrink-0">
                    {d.card_count} card{d.card_count !== 1 ? "s" : ""}
                    {d.shared_cards > 0 && <span className="ml-1 text-primary" title={`${d.shared_cards} shared`}>·{d.shared_cards}↗</span>}
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
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-primary border-primary/20 bg-primary/10">
                      <Users className="size-2.5 mr-0.5" />{o.shared_cards} shared
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-right shrink-0">
                  <span className="text-purple-600 font-mono font-semibold">{o.hours.toFixed(1)} h</span>
                  <span className="text-success font-mono font-semibold">
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
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-primary border-primary/20 bg-primary/10">
                      <Users className="size-2.5 mr-0.5" />{m.shared_cards} shared
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-right shrink-0">
                  <span className="text-purple-600 font-mono font-semibold">{m.hours.toFixed(1)} h</span>
                  <span className="text-success font-mono font-semibold">
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
          color="bg-purple-50"
        />
        <StatCard
          icon={<Package className="size-4 text-success" />}
          label="Total Qty (All)"
          value={totalQty % 1 === 0 ? String(totalQty) : totalQty.toFixed(1)}
          sub="contributions (may overlap on shared cards)"
          color="bg-success/10"
        />
        <StatCard
          icon={<TrendingUp className="size-4 text-primary" />}
          label="Overall Avg Qty/Hr"
          value={totalHours > 0 ? (totalQty / totalHours).toFixed(1) : "—"}
          sub="across all workers"
          color="bg-primary/10"
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
                    <p className="font-mono font-semibold text-success">
                      {w.total_qty_produced % 1 === 0 ? w.total_qty_produced : w.total_qty_produced.toFixed(1)}
                    </p>
                    <p className="text-muted-foreground">pcs</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="font-mono font-semibold text-primary">{w.avg_qty_per_hour.toFixed(1)}</p>
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
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | "all" | null>(null);

  const [data, setData] = useState<WorkerTimeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(currentMonthStart);
  const [dateTo, setDateTo] = useState(todayStr);

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
      setData([]);
      return;
    }
    if (value === "all") {
      setSelectedWorkerId("all");
      fetchReport("all");
      return;
    }
    const id = Number(value);
    setSelectedWorkerId(id);
    fetchReport(id);
  }

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    fetchReport(selectedWorkerId, dateFrom || undefined, dateTo || undefined);
  }

  function printWorkerReport() {
    if (!singleWorker) return;
    const w = singleWorker;
    const dateRange = (dateFrom || dateTo)
      ? `${fmtDate(dateFrom || dateTo)} – ${fmtDate(dateTo || dateFrom)}`
      : "All time";
    const totalDays = w.work_dates.length;

    const dateRows = w.by_date
      .map((d) => `<tr><td>${fmtDate(d.date)}</td><td style="text-align:right">${d.hours.toFixed(1)}</td><td style="text-align:right">${d.qty_produced % 1 === 0 ? d.qty_produced : d.qty_produced.toFixed(1)}</td><td style="text-align:right">${d.card_count}</td></tr>`)
      .join("");

    const processRows = w.by_process
      .map((p) => `<tr><td>${p.process_name}</td><td style="text-align:right">${p.hours.toFixed(1)}</td><td style="text-align:right">${p.qty_produced % 1 === 0 ? p.qty_produced : p.qty_produced.toFixed(1)}</td><td style="text-align:right">${p.card_count}</td></tr>`)
      .join("");

    const orderRows = w.by_order
      .map((o) => `<tr><td>${o.order_number}</td><td style="text-align:right">${o.hours.toFixed(1)}</td><td style="text-align:right">${o.qty_produced % 1 === 0 ? o.qty_produced : o.qty_produced.toFixed(1)}</td><td style="text-align:right">${o.card_count}</td></tr>`)
      .join("");

    const machineRows = w.by_machine
      .map((m) => `<tr><td>${m.machine_name}</td><td style="text-align:right">${m.hours.toFixed(1)}</td><td style="text-align:right">${m.qty_produced % 1 === 0 ? m.qty_produced : m.qty_produced.toFixed(1)}</td><td style="text-align:right">${m.card_count}</td></tr>`)
      .join("");

    const section = (title: string, rows: string, headers: string) => rows
      ? `<h2 style="font-size:14px;margin:16px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px">${title}</h2>
         <table style="width:100%;border-collapse:collapse;font-size:12px">
           <thead><tr style="background:#f3f4f6">${headers}</tr></thead>
           <tbody>${rows}</tbody>
         </table>`
      : "";

    const html = `<!DOCTYPE html><html><head><title>Time Report – ${w.username}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:32px;color:#111;font-size:13px}
  table td,table th{padding:4px 8px;border:1px solid #e5e7eb}
  th{font-weight:600;background:#f3f4f6;text-align:left}
  .cards{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}
  .card{flex:1;min-width:140px;border:1px solid #e5e7eb;border-radius:6px;padding:10px}
  .card-label{font-size:11px;color:#6b7280}
  .card-value{font-size:18px;font-weight:700}
  .card-sub{font-size:11px;color:#6b7280;margin-top:2px}
  @media print{body{margin:16px}}
</style></head><body>
<h1 style="font-size:20px;margin:0">${w.username}</h1>
<p style="color:#6b7280;margin:2px 0 8px;font-size:13px">${dateRange}</p>
<div class="cards">
  <div class="card"><div class="card-label">Total Hours</div><div class="card-value">${w.total_hours.toFixed(1)} h</div><div class="card-sub">${w.job_card_count} job card${w.job_card_count !== 1 ? "s" : ""}</div></div>
  <div class="card"><div class="card-label">Qty Produced</div><div class="card-value">${w.total_qty_produced % 1 === 0 ? w.total_qty_produced : w.total_qty_produced.toFixed(1)}</div><div class="card-sub">across ${w.process_names.length} process${w.process_names.length !== 1 ? "es" : ""}</div></div>
  <div class="card"><div class="card-label">Avg Qty / Hour</div><div class="card-value">${w.avg_qty_per_hour > 0 ? w.avg_qty_per_hour.toFixed(1) : "—"}</div><div class="card-sub">productivity rate</div></div>
  <div class="card"><div class="card-label">Working Days</div><div class="card-value">${totalDays}</div><div class="card-sub">${totalDays > 0 ? fmtDate(w.work_dates[0]) + " – " + fmtDate(w.work_dates[totalDays - 1]) : "—"}</div></div>
</div>
${section("By Process", processRows, "<th>Process</th><th style='text-align:right'>Hours</th><th style='text-align:right'>Qty</th><th style='text-align:right'>Cards</th>")}
${section("Daily Activity", dateRows, "<th>Date</th><th style='text-align:right'>Hours</th><th style='text-align:right'>Qty</th><th style='text-align:right'>Cards</th>")}
${section("By Production Order", orderRows, "<th>Order</th><th style='text-align:right'>Hours</th><th style='text-align:right'>Qty</th><th style='text-align:right'>Cards</th>")}
${section("By Machine", machineRows, "<th>Machine</th><th style='text-align:right'>Hours</th><th style='text-align:right'>Qty</th><th style='text-align:right'>Cards</th>")}
</body></html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    }
  }

  const singleWorker = typeof selectedWorkerId === "number"
    ? data.find((w) => w.user_id === selectedWorkerId) ?? data[0] ?? null
    : null;

  return (
    <>
      <PageHeader
        title="Worker Time Report"
        description="Hours, productivity and process breakdown per worker. Filter by date range."
        breadcrumbs={[
          { label: "Production", href: "/dashboard/production" },
          { label: "Worker Time Report" },
        ]}
        actions={
          <Link href="/dashboard/production" className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
        }
      />

      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        {/* Filters */}
        <div className="rounded-lg border p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <User className="size-3.5" />Worker
            </Label>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <SearchCombobox<WorkerOption>
                  variant="list"
                  value={selectedWorkerId !== null ? String(selectedWorkerId) : ""}
                  placeholder="Search worker…"
                  emptyText="No workers found"
                  fetcher={async (q) =>
                    apiFetchJson<WorkerOption[]>(
                      `/api/v1/production/workers${q.trim() ? `?search=${encodeURIComponent(q)}` : ""}`,
                    )
                  }
                  itemIdOf={(w) => w.id}
                  getItemKey={(w) => w.id}
                  getItemLabel={(w) => w.username}
                  onSelect={(w) => handleWorkerSelect(String(w.id))}
                  renderItem={(w) => <span>{w.username}</span>}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleWorkerSelect("all")}
                disabled={selectedWorkerId === "all"}
              >
                All Workers
              </Button>
            </div>
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
              <div className="ml-auto">
                <Button variant="outline" size="sm" onClick={printWorkerReport}>
                  <Printer className="size-3.5 mr-1.5" />Print Report
                </Button>
              </div>
            </div>
            <WorkerReportDetail w={singleWorker} />
          </div>
        ) : null}
      </div>
    </>
  );
}

