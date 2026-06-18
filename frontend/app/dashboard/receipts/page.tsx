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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiFetchJson } from "@/lib/api";
import { requestReceiptsApi, type RequestReceipt } from "@/lib/request-receipts";
import { getCurrentUser, isAdminOrAbove } from "@/lib/user";
import {
  ChevronLeft, ChevronRight, PackageCheck, CheckCircle, Clock, Eye, Trash2, Printer,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompanyInfo {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_gstin: string;
  company_city: string;
  company_state: string;
  company_country: string;
  company_pincode: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  pending_ack:  { label: "Needs Your Confirmation", color: "bg-amber-100 text-amber-700 border-amber-200", Icon: Clock },
  acknowledged: { label: "Confirmed",               color: "bg-teal-100  text-teal-700  border-teal-200",  Icon: CheckCircle },
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
  const [items, setItems] = useState<RequestReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const [selected, setSelected] = useState<RequestReceipt | null>(null);
  const [ackNote, setAckNote] = useState("");
  const [ackSaving, setAckSaving] = useState(false);
  const [ackErr, setAckErr] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deletingSn, setDeletingSn] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    setAdmin(isAdminOrAbove());
    setCurrentUserId(getCurrentUser()?.id ?? null);
    apiFetchJson<CompanyInfo>("/api/v1/settings/company")
      .then(info => setCompanyInfo(info))
      .catch(() => { /* non-admin users may not have access */ });
  }, []);

  const PAGE_SIZE = 10;

  const load = useCallback((p = page) => {
    setLoading(true);
    const params: { status?: string } = {};
    if (statusFilter !== "all") params.status = statusFilter;
    requestReceiptsApi.list(params)
      .then(all => {
        const total = all.length;
        const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const safePage = Math.min(p, pages);
        const start = (safePage - 1) * PAGE_SIZE;
        setItems(all.slice(start, start + PAGE_SIZE));
        setTotal(total);
        setPage(safePage);
        setPages(pages);
      })
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
      await requestReceiptsApi.acknowledge(selected.id, ackNote || undefined);
      setSelected(null); load(page);
    } catch (e: unknown) {
      setAckErr(e instanceof Error ? e.message : "Failed to acknowledge");
    } finally { setAckSaving(false); }
  }

  async function doDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await requestReceiptsApi.delete(deleteId);
      setDeleteId(null); load(page);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  }

  function handlePrint(r: RequestReceipt) {
    const statusLabel = r.status === "acknowledged" ? "Confirmed" : "Needs Confirmation";
    const co = companyInfo;
    const coHtml = (co && co.company_name) ? `
      <div style="border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:16px">
        <div style="font-size:20px;font-weight:800;color:#111">${co.company_name}</div>
        ${co.company_address ? `<div style="font-size:12px;color:#555;margin-top:2px">${co.company_address}${co.company_city ? ", " + co.company_city : ""}${co.company_state ? ", " + co.company_state : ""}${co.company_pincode ? " - " + co.company_pincode : ""}</div>` : ""}
        <div style="font-size:11px;color:#777;margin-top:4px">
          ${co.company_phone ? `&#128222; ${co.company_phone}&nbsp;&nbsp;` : ""}
          ${co.company_email ? `&#9993; ${co.company_email}&nbsp;&nbsp;` : ""}
          ${co.company_gstin ? `GSTIN: ${co.company_gstin}` : ""}
        </div>
      </div>` : "";
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #111; }
        h1 { font-size: 20px; font-weight: bold; letter-spacing: 2px; margin: 0; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 8px; border: 1px solid #ddd; background: #f3f4f6; font-weight: 600; font-size: 13px; }
        td { padding: 8px; border: 1px solid #ddd; font-size: 13px; }
        .meta-label { color: #555; width: 160px; padding: 4px 0; font-size: 13px; }
        .meta-value { padding: 4px 0; font-size: 13px; }
        .footer-note { font-size: 10px; color: #aaa; text-align: center; margin-top: 24px; }
        @media print { @page { margin: 20mm; } }
      </style>
    </head><body>
      ${coHtml}
      <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:16px">
        <h1>GOODS RECEIPT</h1>
      </div>
      <table style="margin-bottom:16px">
        <tr>
          <td style="width:50%;vertical-align:top;border:none;padding:0 0 12px 0">
            <p style="margin:0;font-size:12px;color:#666">Receipt No.</p>
            <p style="margin:2px 0 0;font-size:16px;font-weight:bold;font-family:monospace">${r.sn_no}</p>
          </td>
          <td style="width:50%;text-align:right;vertical-align:top;border:none;padding:0 0 12px 0">
            <p style="margin:0;font-size:12px;color:#666">Date</p>
            <p style="margin:2px 0 0;font-size:13px">${new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
          </td>
        </tr>
      </table>
      <table style="margin-bottom:16px">
        <thead>
          <tr>
            <th>Item</th>
            <th>Code</th>
            <th style="text-align:right">Ordered</th>
            <th style="text-align:right">Delivered</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${r.item_name ?? "—"}</td>
            <td style="font-family:monospace">${r.item_code ?? "—"}</td>
            <td style="text-align:right">${r.quantity_requested}</td>
            <td style="text-align:right;font-weight:bold">${r.quantity_received}</td>
          </tr>
        </tbody>
      </table>
      <table style="margin-bottom:16px">
        <tr><td class="meta-label">Department:</td><td class="meta-value" style="font-weight:500">${r.department ?? "—"}</td></tr>
        <tr><td class="meta-label">Delivered By:</td><td class="meta-value">${r.created_by_username ?? "—"}</td></tr>
        <tr><td class="meta-label">Delivery Notes:</td><td class="meta-value" style="font-style:italic">${r.notes ?? "—"}</td></tr>
        <tr><td class="meta-label">Status:</td><td class="meta-value" style="font-weight:bold">${statusLabel}</td></tr>
        ${r.acknowledged_by_username ? `<tr><td class="meta-label">Confirmed By:</td><td class="meta-value">${r.acknowledged_by_username} on ${new Date(r.acknowledged_at!).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td></tr>` : ""}
        ${r.acknowledgment_note ? `<tr><td class="meta-label">Confirmation Note:</td><td class="meta-value" style="font-style:italic">${r.acknowledgment_note}</td></tr>` : ""}
      </table>
      <div style="border-top:1px solid #ddd;padding-top:24px;margin-top:32px">
        <table>
          <tr>
            <td style="width:45%;text-align:center;border:none">
              <div style="border-bottom:1px solid #000;margin-bottom:6px;height:40px"></div>
              <p style="font-size:11px;color:#555;margin:0">Delivered By</p>
            </td>
            <td style="width:10%;border:none"></td>
            <td style="width:45%;text-align:center;border:none">
              <div style="border-bottom:1px solid #000;margin-bottom:6px;height:40px"></div>
              <p style="font-size:11px;color:#555;margin:0">Received By</p>
            </td>
          </tr>
        </table>
      </div>
      <p class="footer-note">Printed from OneFlow ERP &middot; ${new Date().toLocaleString("en-IN")}</p>
    </body></html>`;
    const w = window.open("", "_blank", "width=800,height=700");
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
  }

  return (
    <>
      <header className="sticky top-0 z-10 bg-background flex h-16 shrink-0 items-center border-b px-6 gap-4">
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
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Receipt No.</th>
                          <th className="px-4 py-2.5 text-left font-medium">Item</th>
                          <th className="px-4 py-2.5 text-right font-medium">Delivered</th>
                          <th className="px-4 py-2.5 text-right font-medium">Ordered</th>
                          <th className="px-4 py-2.5 text-left font-medium">Department</th>
                          <th className="px-4 py-2.5 text-left font-medium">Who</th>
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
                              {r.department
                                ? <span className="font-medium text-foreground">{r.department}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs space-y-0.5">
                              {r.created_by_username && (
                                <p>
                                  <span className="font-medium text-foreground">{r.created_by_username}</span>
                                  <span className="ml-1 text-[10px] text-muted-foreground/70">delivered</span>
                                </p>
                              )}
                              {r.acknowledged_by_username && (
                                <p>
                                  <span className="font-medium text-foreground">{r.acknowledged_by_username}</span>
                                  <span className="ml-1 text-[10px] text-muted-foreground/70">confirmed</span>
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
                                <Button variant="ghost" size="icon" className="size-7" title="Print" onClick={() => handlePrint(r)}>
                                  <Printer className="size-3.5 text-muted-foreground" />
                                </Button>
                                {r.status === "pending_ack" && (admin || r.created_by_user_id === currentUserId) && (
                                  <Button variant="outline" size="sm" className="h-7 text-xs text-teal-600 border-teal-200" onClick={() => { setSelected(r); setAckNote(""); setAckErr(null); setViewOpen(false); }}>Confirm Receipt</Button>
                                )}
                                {admin && (
                                  <Button variant="ghost" size="icon" className="size-7" title="Delete" onClick={() => { setDeleteId(r.id); setDeletingSn(r.sn_no); }}>
                                    <Trash2 className="size-3.5 text-red-500" />
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
      <Dialog open={viewOpen} onOpenChange={o => { if (!o) { setViewOpen(false); setSelected(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{selected?.sn_no}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 mt-1 text-sm">
              <StatusBadge status={selected.status} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                {selected.item_name && <><dt className="text-muted-foreground">Item</dt><dd className="font-medium">{selected.item_name}{selected.item_code && <span className="ml-2 font-mono text-xs text-muted-foreground">{selected.item_code}</span>}</dd></>}
                <dt className="text-muted-foreground">{selected.created_by_user_id === currentUserId ? "Qty Delivered" : "Qty Received"}</dt><dd className="font-semibold tabular-nums">{selected.quantity_received} / {selected.quantity_requested}</dd>
                {selected.notes && <><dt className="text-muted-foreground">Delivery Notes</dt><dd>{selected.notes}</dd></>}
                <dt className="text-muted-foreground">Delivered By</dt><dd>{selected.created_by_username ?? "—"}</dd>
                <dt className="text-muted-foreground">Date</dt><dd>{fmtDate(selected.created_at)}</dd>
                {selected.acknowledged_by_username && <><dt className="text-muted-foreground">Confirmed By</dt><dd>{selected.acknowledged_by_username}{selected.acknowledged_at && ` on ${fmtDateTime(selected.acknowledged_at)}`}</dd></>}
                {selected.acknowledgment_note && <><dt className="text-muted-foreground">Confirmation Note</dt><dd className="italic">{selected.acknowledgment_note}</dd></>}
              </dl>
              <div className="flex justify-end pt-1">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handlePrint(selected)}>
                  <Printer className="size-3.5" />Print Receipt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Acknowledge Dialog */}
      <Dialog open={!!selected && !viewOpen} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="size-4 text-teal-600" /> Confirm You Received This — {selected?.sn_no}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 mt-1">
              <p className="text-sm text-muted-foreground">
                Did you receive <span className="font-semibold text-foreground">{selected.quantity_received}</span> × {selected.item_name ?? "item"}? Tap confirm and it will be marked as done.
              </p>
              <div className="space-y-1.5">
                <Label>Comments <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <textarea rows={2} placeholder="Any remarks…" value={ackNote}
                  onChange={e => setAckNote(e.target.value)} disabled={ackSaving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
              {ackErr && <p className="text-sm text-destructive">{ackErr}</p>}
              <div className="flex gap-3">
                <Button onClick={doAcknowledge} disabled={ackSaving} className="flex-1">
                  {ackSaving ? "Saving…" : "Yes, I Received It"}
                </Button>
                <Button variant="outline" onClick={() => setSelected(null)} disabled={ackSaving}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Alert */}
      <AlertDialog open={deleteId !== null} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="size-4 text-red-500" /> Delete receipt {deletingSn}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this receipt record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deleting ? "Deleting…" : "Yes, Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
