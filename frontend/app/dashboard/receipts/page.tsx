"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser, isAdminOrAbove } from "@/lib/user";
import {
  ChevronLeft, ChevronRight, PackageCheck, CheckCircle, Clock, Eye,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Receipt {
  id: number;
  sn_no: string;
  request_id: number;
  item_name: string | null;
  item_code: string | null;
  quantity_requested: number;
  quantity_received: number;
  notes: string | null;
  created_by_user_id: number | null;
  created_by_username: string | null;
  status: string;
  acknowledged_by_username: string | null;
  acknowledged_at: string | null;
  acknowledgment_note: string | null;
  created_at: string;
  updated_at: string;
  // enriched from parent request
  requesting_department: string | null;
  requested_by_username: string | null;
  fulfilled_by_username: string | null;
}

interface PaginatedReceipts {
  items: Receipt[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  pending_ack:  { label: "Pending Sign-off", color: "bg-amber-100 text-amber-700 border-amber-200", Icon: Clock },
  acknowledged: { label: "Acknowledged",     color: "bg-teal-100  text-teal-700  border-teal-200",  Icon: CheckCircle },
};

const STATUSES = ["all", "pending_ack", "acknowledged"];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending_ack;
  const { label, color, Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
      <Icon className="size-3" />{label}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReceiptsPage() {
  const [admin, setAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [items, setItems] = useState<Receipt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const [selected, setSelected] = useState<Receipt | null>(null);
  const [ackNote, setAckNote] = useState("");
  const [ackSaving, setAckSaving] = useState(false);
  const [ackErr, setAckErr] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  useEffect(() => {
    setAdmin(isAdminOrAbove());
    setCurrentUserId(getCurrentUser()?.id ?? null);
  }, []);

  const PAGE_SIZE = 10;

  const load = useCallback((p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
    if (statusFilter !== "all") params.set("status", statusFilter);
    apiFetchJson<PaginatedReceipts>(`/api/v1/receipts?${params}`)
      .then(d => { setItems(d.items); setTotal(d.total); setPage(d.page); setPages(d.pages); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter, page]); // eslint-disable-line

  useEffect(() => { load(1); }, [statusFilter]); // eslint-disable-line

  // Auto-refresh every 30s so receipt status changes appear without manual reload
  useEffect(() => {
    const interval = setInterval(() => load(page), 30_000);
    return () => clearInterval(interval);
  }, [load, page]); // eslint-disable-line

  async function doAcknowledge() {
    if (!selected) return;
    setAckSaving(true); setAckErr(null);
    try {
      await apiFetchJson(`/api/v1/receipts/${selected.id}/acknowledge`, {
        method: "POST",
        body: JSON.stringify({ note: ackNote || null }),
      });
      setSelected(null); load(page);
    } catch (e: unknown) {
      setAckErr(e instanceof Error ? e.message : "Failed to acknowledge");
    } finally { setAckSaving(false); }
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b px-6 gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbPage>Receipts</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <PackageCheck className="size-5 text-teal-600" /> Goods Received (Receipts)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {admin ? "All delivery receipts across all requests." : "Receipts for your department's requests."}
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {STATUSES.map(s => (
            <button key={s}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
              onClick={() => { setStatusFilter(s); setPage(1); }}>
              {s === "all" ? "All" : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading
          ? <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          : items.length === 0
            ? (
              <div className="rounded-xl border p-12 text-center">
                <PackageCheck className="size-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No receipts found.</p>
              </div>
            )
            : (
              <>
                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">SN No.</th>
                          <th className="px-4 py-2.5 text-left font-medium">Item</th>
                          <th className="px-4 py-2.5 text-right font-medium">Qty Rcvd</th>
                          <th className="px-4 py-2.5 text-right font-medium">Qty Ordered</th>
                          <th className="px-4 py-2.5 text-left font-medium">Department</th>
                          <th className="px-4 py-2.5 text-left font-medium">People</th>
                          <th className="px-4 py-2.5 text-left font-medium">Status</th>
                          <th className="px-4 py-2.5 text-left font-medium">Date</th>
                          <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map(r => (
                          <tr key={r.id} className="hover:bg-muted/20">
                            <td className="px-4 py-3">
                              <Badge variant="secondary" className="font-mono text-xs">{r.sn_no}</Badge>
                            </td>
                            <td className="px-4 py-3 max-w-[180px]">
                              <p className="font-medium truncate">{r.item_name ?? "—"}</p>
                              {r.item_code && <p className="text-xs text-muted-foreground font-mono">{r.item_code}</p>}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold">{r.quantity_received}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.quantity_requested}</td>
                            <td className="px-4 py-3 text-xs">
                              {r.requesting_department
                                ? <span className="font-medium text-foreground">{r.requesting_department}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs space-y-0.5">
                              {r.requested_by_username && (
                                <p>
                                  <span className="font-medium text-foreground">{r.requested_by_username}</span>
                                  <span className="ml-1 text-[10px] text-muted-foreground/70">requested</span>
                                </p>
                              )}
                              {r.created_by_username && (
                                <p>
                                  <span className="font-medium text-foreground">{r.created_by_username}</span>
                                  <span className="ml-1 text-[10px] text-muted-foreground/70">delivered</span>
                                </p>
                              )}
                              {r.acknowledged_by_username && (
                                <p>
                                  <span className="font-medium text-foreground">{r.acknowledged_by_username}</span>
                                  <span className="ml-1 text-[10px] text-muted-foreground/70">signed off</span>
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex gap-1">
                                <Button variant="ghost" size="icon" className="size-7" title="View" onClick={() => { setSelected(r); setAckNote(""); setAckErr(null); setViewOpen(true); }}>
                                  <Eye className="size-3.5 text-blue-600" />
                                </Button>
                                {r.status === "pending_ack" && (
                                  <Button variant="ghost" size="icon" className="size-7" title="Acknowledge" onClick={() => { setSelected(r); setAckNote(""); setAckErr(null); setViewOpen(false); }}>
                                    <CheckCircle className="size-3.5 text-teal-600" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {pages > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">Page {page} of {pages} · {total} total</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }}>
                        <ChevronLeft className="size-4 mr-1" />Prev
                      </Button>
                      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); load(p); }}>
                        Next<ChevronRight className="size-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )
        }
      </div>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={o => !o && setViewOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{selected?.sn_no}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 mt-1 text-sm">
              <StatusBadge status={selected.status} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                {selected.item_name && <><dt className="text-muted-foreground">Item</dt><dd className="font-medium">{selected.item_name}{selected.item_code && <span className="ml-2 font-mono text-xs text-muted-foreground">{selected.item_code}</span>}</dd></>}
                <dt className="text-muted-foreground">{selected.created_by_user_id === currentUserId ? "Qty Delivered" : "Qty Received"}</dt><dd className="font-semibold tabular-nums">{selected.quantity_received} / {selected.quantity_requested}</dd>
                {selected.notes && <><dt className="text-muted-foreground">Delivery Notes</dt><dd>{selected.notes}</dd></>}
                <dt className="text-muted-foreground">Created By</dt><dd>{selected.created_by_username ?? "—"}</dd>
                <dt className="text-muted-foreground">Date</dt><dd>{fmtDate(selected.created_at)}</dd>
                {selected.acknowledged_by_username && <><dt className="text-muted-foreground">Acknowledged By</dt><dd>{selected.acknowledged_by_username}{selected.acknowledged_at && ` on ${fmtDateTime(selected.acknowledged_at)}`}</dd></>}
                {selected.acknowledgment_note && <><dt className="text-muted-foreground">Ack Note</dt><dd className="italic">{selected.acknowledgment_note}</dd></>}
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Acknowledge Dialog */}
      <Dialog open={!!selected && !viewOpen} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="size-4 text-teal-600" /> Sign Off — {selected?.sn_no}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 mt-1">
              <p className="text-sm text-muted-foreground">
                Confirm receipt of <span className="font-semibold text-foreground">{selected.quantity_received}</span> × {selected.item_name ?? "item"}.
              </p>
              <div className="space-y-1.5">
                <Label>Note <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <textarea rows={2} placeholder="Any remarks…" value={ackNote}
                  onChange={e => setAckNote(e.target.value)} disabled={ackSaving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
              {ackErr && <p className="text-sm text-destructive">{ackErr}</p>}
              <div className="flex gap-3">
                <Button onClick={doAcknowledge} disabled={ackSaving} className="flex-1">
                  {ackSaving ? "Saving…" : "Acknowledge Receipt"}
                </Button>
                <Button variant="outline" onClick={() => setSelected(null)} disabled={ackSaving}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
