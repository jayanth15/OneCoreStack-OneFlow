"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { ArrowLeft, Clock } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkerTimeSummary {
  user_id: number | null;
  username: string;
  total_hours: number;
  job_card_count: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TimeReportPage() {
  const [data, setData] = useState<WorkerTimeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function fetchReport(from?: string, to?: string) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    const qs = params.toString();
    apiFetchJson<WorkerTimeSummary[]>(`/api/v1/production/time-report${qs ? `?${qs}` : ""}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchReport(); }, []);

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    fetchReport(dateFrom || undefined, dateTo || undefined);
  }

  const grandTotal = data.reduce((s, w) => s + w.total_hours, 0);

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

      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Worker Time Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aggregated work hours per worker, broken down by work type.
          </p>
        </div>

        {/* Date filter */}
        <form onSubmit={handleFilter} className="flex flex-wrap items-end gap-3 mb-6">
          <div className="space-y-1">
            <Label htmlFor="df" className="text-xs">From</Label>
            <Input id="df" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="w-40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dt" className="text-xs">To</Label>
            <Input id="dt" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="w-40" />
          </div>
          <Button type="submit" size="sm" variant="outline">Apply</Button>
          {(dateFrom || dateTo) && (
            <Button type="button" size="sm" variant="ghost"
              onClick={() => { setDateFrom(""); setDateTo(""); fetchReport(); }}>
              Clear
            </Button>
          )}
        </form>

        {error && <p className="text-sm text-destructive mb-4">{error}</p>}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Clock className="size-8 mx-auto mb-2 opacity-40" />
            <p>No work logs found for the selected period.</p>
          </div>
        ) : (
          <>
            {/* Grand total */}
            <div className="rounded-lg border bg-muted/30 p-4 mb-6 flex items-center justify-between">
              <span className="text-sm font-medium">Total</span>
              <span className="text-lg font-bold">{grandTotal.toFixed(1)}h</span>
            </div>

            {/* Per-worker cards */}
            <div className="space-y-4">
              {data.map((w) => (
                <div key={w.user_id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-semibold">{w.username}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {w.job_card_count} job card{w.job_card_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="text-base font-bold">{w.total_hours.toFixed(1)}h</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
