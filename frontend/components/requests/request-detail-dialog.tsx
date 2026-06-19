"use client";

import { useEffect, useState } from "react";
import { requestsApi, type UnifiedRequest, type RequestStatus } from "@/lib/requests";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ClipboardList,
  History as HistoryIcon,
  ChevronDown,
  Truck,
  User,
  Building2,
  Tag,
  Send,
  Package,
  StickyNote,
  Check,
  X,
  Ban,
  PackageCheck,
  ScrollText,
} from "lucide-react";
import { isAdmin } from "@/lib/user";

export interface RequestDetailDialogProps {
  requestId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: { id: number; role: string } | null;
}

const STATUS_META: Record<RequestStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "ghost"; tone: string }> = {
  pending:            { label: "Pending",            variant: "secondary",   tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  approved:           { label: "Approved",           variant: "default",      tone: "bg-blue-100 text-blue-700 ring-blue-200" },
  in_progress:        { label: "In progress",        variant: "secondary",   tone: "bg-amber-100 text-amber-800 ring-amber-200" },
  awaiting_signoff:   { label: "Awaiting signoff",   variant: "secondary",   tone: "bg-purple-100 text-purple-700 ring-purple-200" },
  received:           { label: "Received",           variant: "secondary",   tone: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
  not_approved:       { label: "Rejected",           variant: "destructive", tone: "bg-red-100 text-red-700 ring-red-200" },
  cancelled:          { label: "Cancelled",          variant: "outline",     tone: "bg-slate-200 text-slate-600 ring-slate-300" },
};

const REQUEST_TYPE_META: Record<string, { label: string; icon: typeof Send }> = {
  internal_transfer:  { label: "Internal transfer",  icon: ClipboardList },
  vendor_purchase:    { label: "Vendor purchase",    icon: Truck },
  customer_dispatch:  { label: "Customer dispatch",  icon: Send },
};

const HISTORY_LABELS: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  responded: "Responded",
  delivered: "Delivered",
  delivery_acknowledged: "Delivery confirmed",
  status_change: "Status changed",
  deleted: "Deleted",
};

const HISTORY_TONE: Record<string, string> = {
  created: "bg-slate-400",
  edited: "bg-slate-400",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  cancelled: "bg-slate-400",
  responded: "bg-blue-500",
  delivered: "bg-purple-500",
  delivery_acknowledged: "bg-emerald-500",
  status_change: "bg-amber-500",
  deleted: "bg-red-500",
};

const LIFECYCLE_STEPS: { key: RequestStatus; label: string }[] = [
  { key: "pending",          label: "Pending" },
  { key: "approved",         label: "Approved" },
  { key: "in_progress",      label: "In progress" },
  { key: "awaiting_signoff", label: "Signoff" },
  { key: "received",         label: "Received" },
];

function lifecycleIndex(status: RequestStatus): number {
  if (status === "not_approved" || status === "cancelled") return -1;
  return LIFECYCLE_STEPS.findIndex((s) => s.key === status);
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function RequestDetailDialog({ requestId, open, onOpenChange, currentUser }: RequestDetailDialogProps) {
  const [data, setData] = useState<UnifiedRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [deliverNote, setDeliverNote] = useState("");
  const [ackOpen, setAckOpen] = useState(false);
  const [ackNote, setAckNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!open || requestId == null) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    requestsApi.get(requestId)
      .then((d) => { if (!cancelled) setData(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, requestId]);

  const reviewerIsAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin" || isAdmin();

  const review = async (decision: "approve" | "reject") => {
    if (!data) return;
    try {
      const updated = await requestsApi.review(data.id, decision);
      setData(updated);
    } catch (e: any) {
      console.error("Review failed:", e);
      alert(`Review failed: ${e?.message ?? "unknown error"}`);
    }
  };

  const accept = async () => {
    if (!data) return;
    try {
      const updated = await requestsApi.accept(data.id);
      setData(updated);
    } catch (e: any) {
      console.error("Accept failed:", e);
      alert(`Accept failed: ${e?.message ?? "unknown error"}`);
    }
  };

  const deliver = async () => {
    if (!data) return;
    try {
      const updated = await requestsApi.deliver(data.id, deliverNote);
      setData(updated);
      setDeliverOpen(false);
      setDeliverNote("");
    } catch (e: any) {
      console.error("Deliver failed:", e);
      alert(`Deliver failed: ${e?.message ?? "unknown error"}`);
    }
  };

  const acknowledgeDelivery = async () => {
    if (!data) return;
    try {
      const updated = await requestsApi.acknowledgeDelivery(data.id, ackNote);
      setData(updated);
      setAckOpen(false);
      setAckNote("");
    } catch (e: any) {
      console.error("Acknowledge failed:", e);
      alert(`Confirm failed: ${e?.message ?? "unknown error"}`);
    }
  };

  const cancelRequest = async () => {
    if (!data) return;
    try {
      await requestsApi.delete(data.id);
      onOpenChange(false);
    } catch (e: any) {
      console.error("Cancel failed:", e);
      alert(`Cancel failed: ${e?.message ?? "unknown error"}`);
    }
  };

  const deptLabel = data?.department_label ?? data?.department;
  const typeMeta = data ? REQUEST_TYPE_META[data.request_type] : undefined;
  const TypeIcon = typeMeta?.icon ?? ClipboardList;
  const statusMeta = data ? STATUS_META[data.status] : undefined;
  const stepIndex = data ? lifecycleIndex(data.status) : -1;
  const isTerminalNegative = data && (data.status === "not_approved" || data.status === "cancelled");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[calc(100%-1rem)] sm:max-w-2xl p-0 gap-0 max-h-[90vh] overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {loading && (
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Separator />
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-60" />
            </div>
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        )}

        {!loading && data && (
          <>
            <div className="relative overflow-hidden border-b bg-gradient-to-b from-primary/[0.04] to-transparent">
              <div className="flex items-start gap-3 px-6 pt-6 pb-4">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <TypeIcon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <DialogTitle className="font-heading text-lg font-semibold tracking-wider uppercase normal-case">
                      {data.sn_no}
                    </DialogTitle>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${statusMeta?.tone}`}>
                      {statusMeta?.label ?? data.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {typeMeta?.label ?? data.request_type.replace(/_/g, " ")} · opened {formatDateTime(data.created_at)}
                  </p>
                </div>
              </div>

              {!isTerminalNegative && (
                <div className="px-6 pb-5">
                  <div className="flex items-center gap-1.5">
                    {LIFECYCLE_STEPS.map((step, i) => {
                      const reached = i <= stepIndex;
                      const isCurrent = i === stepIndex;
                      return (
                        <div key={step.key} className="flex items-center gap-1.5 min-w-0 flex-1">
                          <div className="flex flex-col items-center min-w-0">
                            <div
                              className={`size-2.5 shrink-0 rounded-full transition-colors ${
                                isCurrent
                                  ? "bg-primary ring-4 ring-primary/20"
                                  : reached
                                  ? "bg-primary/60"
                                  : "bg-muted-foreground/25"
                              }`}
                            />
                            <span className={`mt-1.5 text-[10px] font-medium uppercase tracking-wider truncate ${
                              isCurrent ? "text-foreground" : "text-muted-foreground"
                            }`}>
                              {step.label}
                            </span>
                          </div>
                          {i < LIFECYCLE_STEPS.length - 1 && (
                            <div className={`h-px flex-1 mb-4 transition-colors ${
                              i < stepIndex ? "bg-primary/60" : "bg-muted-foreground/20"
                            }`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[calc(90vh-220px)]">
              {deptLabel && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Building2 className="size-3.5" />
                    <span className="text-xs uppercase tracking-wider font-medium">Dept</span>
                    <span className="text-foreground font-medium">{deptLabel}</span>
                  </div>
                  {data.from_whom && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Tag className="size-3.5" />
                      <span className="text-xs uppercase tracking-wider font-medium">From</span>
                      <span className="text-foreground font-medium">{data.from_whom}</span>
                    </div>
                  )}
                  {data.requested_by_username && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <User className="size-3.5" />
                      <span className="text-xs uppercase tracking-wider font-medium">By</span>
                      <span className="text-foreground font-medium">{data.requested_by_username}</span>
                    </div>
                  )}
                </div>
              )}

              {data.request_type === "customer_dispatch" && data.dispatch && (
                <Card size="sm" className="ring-1 ring-foreground/5">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Send className="size-3.5" />
                      Customer
                    </div>
                    <p className="font-medium text-sm">
                      {data.dispatch.customer_name}
                      {data.dispatch.customer_phone && (
                        <span className="text-muted-foreground font-normal"> · {data.dispatch.customer_phone}</span>
                      )}
                    </p>
                    {data.dispatch.customer_address && (
                      <p className="text-xs text-muted-foreground">{data.dispatch.customer_address}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Type: <span className="text-foreground font-medium">{data.dispatch.inventory_type}</span></span>
                      <span>SN: <span className="text-foreground font-medium font-mono">{data.dispatch.item_sn_no ?? "—"}</span></span>
                      <span>Qty: <span className="text-foreground font-medium">{data.dispatch.quantity}</span></span>
                      {data.dispatch.delivery_type && (
                        <span>Delivery: <span className="text-foreground font-medium">{data.dispatch.delivery_type}</span></span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {data.items.length > 0 && (
                <Card size="sm" className="ring-1 ring-foreground/5">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Package className="size-3.5" />
                        Items
                      </div>
                      <Badge variant="secondary">{data.items.length}</Badge>
                    </div>
                    <div className="space-y-1.5">
                      {data.items.map((it) => (
                        <div key={it.id} className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {it.item_name}
                              {it.item_code && (
                                <span className="text-muted-foreground font-mono text-xs"> · {it.item_code}</span>
                              )}
                            </p>
                            {it.department_label && (
                              <p className="text-xs text-muted-foreground">{it.department_label}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-xs text-muted-foreground">
                            Qty <span className="text-foreground font-semibold">{it.quantity}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {data.delivered_by_username && (
                <Card size="sm" className="ring-1 ring-foreground/5 bg-purple-50/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-700">
                      <Truck className="size-3.5" />
                      Delivered
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Delivered by</p>
                        <p className="font-medium">{data.delivered_by_username}</p>
                      </div>
                      {data.delivered_at && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Delivered on</p>
                          <p className="font-medium">{formatDateTime(data.delivered_at)}</p>
                        </div>
                      )}
                      {data.delivery_note && (
                        <div className="col-span-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Note</p>
                          <p className="text-sm whitespace-pre-wrap">{data.delivery_note}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {data.acknowledged_by_username && (
                <Card size="sm" className="ring-1 ring-foreground/5 bg-emerald-50/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                      <PackageCheck className="size-3.5" />
                      Confirmed
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Confirmed by</p>
                        <p className="font-medium">{data.acknowledged_by_username}</p>
                      </div>
                      {data.acknowledged_at && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Confirmed on</p>
                          <p className="font-medium">{formatDateTime(data.acknowledged_at)}</p>
                        </div>
                      )}
                      {data.acknowledgment_note && (
                        <div className="col-span-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Note</p>
                          <p className="text-sm whitespace-pre-wrap">{data.acknowledgment_note}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {data.notes && (
                <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
                  <StickyNote className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="whitespace-pre-wrap text-foreground/90">{data.notes}</p>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-10 -mx-0 border-t bg-popover/95 backdrop-blur supports-backdrop-filter:bg-popover/80 px-6 py-3 flex items-center justify-between gap-2">
              <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <HistoryIcon className="size-3.5" />
                    History
                    <Badge variant="secondary">{data.history.length}</Badge>
                    <ChevronDown className="size-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="top"
                  sideOffset={8}
                  className="w-[min(420px,calc(100vw-2rem))] p-0"
                >
                  <div className="px-4 pt-4 pb-3 border-b">
                    <div className="flex items-center gap-2">
                      <ScrollText className="size-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Activity history</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {data.history.length} {data.history.length === 1 ? "event" : "events"} · {data.sn_no}
                    </p>
                  </div>
                  <div className="relative">
                    <div
                      className="overflow-y-auto max-h-[60vh] px-4 py-3 space-y-3"
                      style={{
                        maskImage:
                          "linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)",
                        WebkitMaskImage:
                          "linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)",
                      }}
                    >
                      <ol className="relative space-y-3 pl-5 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-border">
                        {data.history.map((h) => (
                          <li key={h.id} className="relative">
                            <span
                              className={`absolute -left-[18px] top-1 size-2.5 rounded-full ring-2 ring-popover ${
                                HISTORY_TONE[h.change_type] ?? "bg-slate-400"
                              }`}
                            />
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-sm font-medium">
                                {HISTORY_LABELS[h.change_type] ?? h.change_type}
                              </p>
                              <time className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                                {formatDateTime(h.changed_at)}
                              </time>
                            </div>
                            {h.changed_by_username && (
                              <p className="text-xs text-muted-foreground">by {h.changed_by_username}</p>
                            )}
                            {h.note && (
                              <p className="text-xs text-foreground/80 mt-1 whitespace-pre-wrap">{h.note}</p>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {reviewerIsAdmin && data.status === "pending" && (
                  <>
                    <Button variant="destructive" size="sm" onClick={() => review("reject")}>
                      <X className="size-3.5" />
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => review("approve")}>
                      <Check className="size-3.5" />
                      Approve
                    </Button>
                  </>
                )}
                {data.status === "approved" && (
                  <Button size="sm" onClick={accept}>
                    <Check className="size-3.5" />
                    Accept fulfilment
                  </Button>
                )}
                {data.status === "in_progress" && (
                  <Button size="sm" onClick={() => setDeliverOpen(true)}>
                    <Truck className="size-3.5" />
                    Mark Delivered
                  </Button>
                )}
                {data.status === "awaiting_signoff" && (
                  <Button size="sm" onClick={() => setAckOpen(true)}>
                    <PackageCheck className="size-3.5" />
                    Confirm Receipt
                  </Button>
                )}
                {reviewerIsAdmin && data.status !== "received" && data.status !== "not_approved" && data.status !== "cancelled" && (
                  <Button variant="ghost" size="sm" onClick={cancelRequest}>
                    <Ban className="size-3.5" />
                    Cancel
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            </div>
          </>
        )}

        <Dialog open={deliverOpen} onOpenChange={setDeliverOpen}>
          <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden" onInteractOutside={(e) => e.preventDefault()}>
            <div className="bg-gradient-to-b from-primary/[0.04] to-transparent px-6 pt-6 pb-4 border-b">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Truck className="size-4" />
                </div>
                <div>
                  <DialogTitle className="font-heading text-base font-semibold tracking-wider uppercase normal-case">
                    Mark Delivered
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Notify the requester that items are on the way.</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-muted-foreground">
                Confirm that all items for <strong className="text-foreground">{data?.sn_no}</strong> have been delivered to the requester.
                The requester will be asked to confirm receipt.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="deliver_note" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Delivery note (optional)
                </label>
                <textarea
                  id="deliver_note"
                  value={deliverNote}
                  onChange={(e) => setDeliverNote(e.target.value)}
                  placeholder="e.g. items handed over at the loading bay"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none transition"
                />
              </div>
            </div>
            <DialogFooter className="px-6 py-3 border-t bg-muted/20 gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeliverOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={deliver}>
                <Truck className="size-3.5" />
                Mark Delivered
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={ackOpen} onOpenChange={setAckOpen}>
          <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden" onInteractOutside={(e) => e.preventDefault()}>
            <div className="bg-gradient-to-b from-primary/[0.04] to-transparent px-6 pt-6 pb-4 border-b">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <PackageCheck className="size-4" />
                </div>
                <div>
                  <DialogTitle className="font-heading text-base font-semibold tracking-wider uppercase normal-case">
                    Confirm Receipt
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Close the request as received.</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-muted-foreground">
                Confirm that you have received all items for <strong className="text-foreground">{data?.sn_no}</strong>.
                This will close the request as <strong className="text-foreground">received</strong>.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="ack_note" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Confirmation note (optional)
                </label>
                <textarea
                  id="ack_note"
                  value={ackNote}
                  onChange={(e) => setAckNote(e.target.value)}
                  placeholder="e.g. all items received in good condition"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none transition"
                />
              </div>
            </div>
            <DialogFooter className="px-6 py-3 border-t bg-muted/20 gap-2">
              <Button variant="outline" size="sm" onClick={() => setAckOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={acknowledgeDelivery}>
                <Check className="size-3.5" />
                Confirm Receipt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
