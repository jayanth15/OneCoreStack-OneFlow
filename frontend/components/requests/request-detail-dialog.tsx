"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestsApi, type UnifiedRequest, type RequestStatus } from "@/lib/requests";
import { receiptsApi, type Receipt } from "@/lib/receipts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  ExternalLink,
  AlertTriangle,
  ShoppingCart,
} from "lucide-react";
import { isAdmin, type CurrentUser } from "@/lib/user";

export interface RequestDetailDialogProps {
  requestId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: CurrentUser | null;
}

const STATUS_META: Record<RequestStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "ghost"; tone: string }> = {
  pending:            { label: "Pending",            variant: "secondary",   tone: "bg-muted text-foreground ring-slate-200" },
  approved:           { label: "Approved",           variant: "default",      tone: "bg-primary/10 text-primary ring-primary/20" },
  in_progress:        { label: "Acknowledged",       variant: "secondary",   tone: "bg-warning/15 text-warning ring-warning/20" },
  awaiting_signoff:   { label: "Awaiting signoff",   variant: "secondary",   tone: "bg-purple-100 text-purple-700 ring-purple-200" },
  received:           { label: "Received",           variant: "secondary",   tone: "bg-success/10 text-success ring-success/20" },
  not_approved:       { label: "Rejected",           variant: "destructive", tone: "bg-destructive/10 text-destructive ring-destructive/20" },
  cancelled:          { label: "Cancelled",          variant: "outline",     tone: "bg-slate-200 text-muted-foreground ring-slate-300" },
};

const REQUEST_TYPE_META: Record<string, { label: string; icon: typeof Send }> = {
  internal_transfer:  { label: "Internal transfer",  icon: ClipboardList },
  vendor_purchase:    { label: "Purchase request",   icon: Truck },
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
  approved: "bg-success",
  rejected: "bg-destructive",
  cancelled: "bg-slate-400",
  responded: "bg-primary",
  delivered: "bg-purple-500",
  delivery_acknowledged: "bg-success",
  status_change: "bg-warning",
  deleted: "bg-destructive",
};

const LIFECYCLE_STEPS: { key: RequestStatus; label: string }[] = [
  { key: "pending",          label: "Pending" },
  { key: "approved",         label: "Approved" },
  { key: "in_progress",      label: "Acknowledged" },
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function receiptSummary(receipt: Receipt) {
  const deliveredQty = receipt.items.reduce((sum, item) => sum + item.quantity_delivered, 0);
  const requestedQty = receipt.items.reduce((sum, item) => sum + item.quantity_requested, 0);
  const signedQty = receipt.items.reduce((sum, item) => sum + (item.quantity_signed_off ?? 0), 0);
  const shortageQty = receipt.items.reduce(
    (sum, item) => sum + Math.max(0, item.quantity_requested - item.quantity_delivered),
    0,
  );
  return { deliveredQty, requestedQty, signedQty, shortageQty };
}

export function RequestDetailDialog({ requestId, open, onOpenChange, currentUser }: RequestDetailDialogProps) {
  const router = useRouter();
  const [data, setData] = useState<UnifiedRequest | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [deliverNote, setDeliverNote] = useState("");
  const [deliverQuantities, setDeliverQuantities] = useState<Record<number, number>>({});
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!open || requestId == null) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setData(null);
      setReceipts([]);
      requestsApi.get(requestId)
        .then((d) => {
          if (cancelled) return;
          setData(d);
          if (d.status === "awaiting_signoff" || d.status === "received") {
            receiptsApi.listByRequest(d.id).then((r) => {
              if (!cancelled) setReceipts(r);
            }).catch(() => {
              if (!cancelled) setReceipts([]);
            });
          }
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [open, requestId]);

  const reviewerIsAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin" || isAdmin();

  const review = async (decision: "approve" | "reject") => {
    if (!data) return;
    try {
      const updated = await requestsApi.review(data.id, decision);
      setData(updated);
    } catch (e: unknown) {
      console.error("Review failed:", e);
      alert(`Review failed: ${errorMessage(e)}`);
    }
  };

  const accept = async (department: string) => {
    if (!data) return;
    try {
      const updated = await requestsApi.accept(data.id, department);
      setData(updated);
    } catch (e: unknown) {
      console.error("Accept failed:", e);
      alert(`Accept failed: ${errorMessage(e)}`);
    }
  };

  const deliver = async () => {
    if (!data) return;
    try {
      const updated = await requestsApi.deliver(data.id, {
        delivery_note: deliverNote,
        items: data.items
          .filter((item) => item.id != null)
          .map((item) => ({
            request_item_id: item.id as number,
            quantity_delivered: Math.max(0, Math.min(item.quantity, deliverQuantities[item.id as number] ?? item.quantity)),
            condition: (deliverQuantities[item.id as number] ?? item.quantity) < item.quantity ? "partial" : "good",
          })),
      });
      setData(updated);
      const linkedReceipts = await receiptsApi.listByRequest(data.id);
      setReceipts(linkedReceipts);
      setDeliverOpen(false);
      setDeliverNote("");
    } catch (e: unknown) {
      console.error("Deliver failed:", e);
      alert(`Deliver failed: ${errorMessage(e)}`);
    }
  };

  const cancelRequest = async () => {
    if (!data) return;
    try {
      await requestsApi.delete(data.id);
      onOpenChange(false);
    } catch (e: unknown) {
      console.error("Cancel failed:", e);
      alert(`Cancel failed: ${errorMessage(e)}`);
    }
  };

  const deptLabel = data?.department_label ?? data?.department;
  const targetDepartments = data?.target_departments?.length
    ? data.target_departments
    : [data?.department].filter((code): code is string => Boolean(code));
  const targetDepartmentLabels = new Map(
    targetDepartments.map((code, index) => [code, data?.target_department_labels?.[index] ?? code]),
  );
  const userDepartmentCodes = new Set(currentUser?.department_codes ?? []);
  const pendingAcceptanceDepartments = data && (data.status === "approved" || data.status === "in_progress")
    ? targetDepartments.filter((code) => {
        if (!reviewerIsAdmin && !userDepartmentCodes.has(code)) return false;
        const departmentItems = data.items.filter((item) => (item.department ?? data.department) === code);
        return departmentItems.length > 0
          ? departmentItems.some((item) => item.item_status !== "in_progress")
          : data.status === "approved";
      })
    : [];
  const typeMeta = data ? REQUEST_TYPE_META[data.request_type] : undefined;
  const TypeIcon = typeMeta?.icon ?? ClipboardList;
  const statusMeta = data ? STATUS_META[data.status] : undefined;
  const stepIndex = data ? lifecycleIndex(data.status) : -1;
  const isTerminalNegative = data && (data.status === "not_approved" || data.status === "cancelled");
  const pendingReceipts = receipts.filter((receipt) => receipt.status === "created");
  const openReceipt = (receipt?: Receipt) => {
    if (!data) return;
    const target = receipt
      ? `/dashboard/receipts?receipt=${receipt.id}`
      : `/dashboard/receipts?request=${data.id}`;
    onOpenChange(false);
    router.push(target);
  };
  const openDeliverDialog = () => {
    if (!data) return;
    setDeliverQuantities(Object.fromEntries(
      data.items
        .filter((item) => item.id != null)
        .map((item) => [item.id as number, item.quantity]),
    ));
    setDeliverOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
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
                          <div className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant={it.item_status === "in_progress" ? "secondary" : "outline"}>
                              {it.item_status === "in_progress" ? "Accepted" : "Pending"}
                            </Badge>
                            <span>Qty <span className="text-foreground font-semibold">{it.quantity}</span></span>
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

              {(data.status === "awaiting_signoff" || receipts.length > 0) && (
                <Card size="sm" className="ring-1 ring-foreground/5 bg-primary/[0.03]">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                        <ScrollText className="size-3.5" />
                        Receipt signoff
                      </div>
                      {receipts.length > 0 && (
                        <Badge variant={pendingReceipts.length > 0 ? "destructive" : "secondary"}>
                          {pendingReceipts.length > 0 ? `${pendingReceipts.length} pending` : "All signed off"}
                        </Badge>
                      )}
                    </div>
                    {receipts.length === 0 ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">Open Receipts to review and accept this delivery.</p>
                        <Button type="button" size="sm" onClick={() => openReceipt()} className="shrink-0">
                          <ExternalLink className="size-3.5" />
                          Open receipts
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {receipts.map((receipt) => {
                          const summary = receiptSummary(receipt);
                          const pending = receipt.status === "created";
                          const hasShortage = summary.shortageQty > 0;
                          return (
                            <button
                              key={receipt.id}
                              type="button"
                              onClick={() => openReceipt(receipt)}
                              className={`w-full rounded-md border p-3 text-left transition-colors ${
                                pending
                                  ? "border-destructive/50 bg-destructive/5 hover:bg-destructive/10"
                                  : "border-success/30 bg-success/5 hover:bg-success/10"
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-mono text-sm font-semibold">{receipt.receipt_number}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {receipt.department_label ?? receipt.department ?? "Department"} · {receipt.items.length} item{receipt.items.length !== 1 ? "s" : ""}
                                  </p>
                                </div>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                  pending ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
                                }`}>
                                  {pending ? "Pending signoff" : "Signed off"}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>Requested: {summary.requestedQty}</span>
                                <span>Delivered: {summary.deliveredQty}</span>
                                {receipt.status === "signed_off" && <span>Signed: {summary.signedQty}</span>}
                                {hasShortage && (
                                  <span className="inline-flex items-center gap-1 font-medium text-destructive">
                                    <AlertTriangle className="size-3" />
                                    Short: {summary.shortageQty}
                                  </span>
                                )}
                                {receipt.signed_off_by_username && (
                                  <span>by {receipt.signed_off_by_username}</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {data.acknowledged_by_username && (
                <Card size="sm" className="ring-1 ring-foreground/5 bg-emerald-50/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-success">
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
                {(data.request_type !== "vendor_purchase" || reviewerIsAdmin) && pendingAcceptanceDepartments.map((department) => (
                  <Button key={department} size="sm" onClick={() => accept(department)}>
                    <Check className="size-3.5" />
                    Acknowledge {targetDepartmentLabels.get(department)}
                  </Button>
                ))}
                {reviewerIsAdmin && data.request_type === "vendor_purchase" && data.status === "approved" && (
                  <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/purchase-orders?from_pr=${data.id}`)}>
                    <ShoppingCart className="size-3.5" />
                    Create PO
                  </Button>
                )}
                {data.status === "in_progress" && (data.request_type !== "vendor_purchase" || reviewerIsAdmin) && (
                  <Button size="sm" onClick={openDeliverDialog}>
                    <Truck className="size-3.5" />
                    Mark Delivered
                  </Button>
                )}
                {data.status === "awaiting_signoff" && (
                  <Button size="sm" onClick={() => openReceipt()}>
                    <ScrollText className="size-3.5" />
                    Open Receipt
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
          <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-2xl p-0 gap-0 overflow-hidden" onInteractOutside={(e) => e.preventDefault()}>
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
            <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              <p className="text-sm text-muted-foreground">
                Enter the quantity delivered for each item in <strong className="text-foreground">{data?.sn_no}</strong>.
                Short delivered quantities will be recorded on the receipt.
              </p>
              <div className="space-y-2">
                {data?.items.map((item) => {
                  if (item.id == null) return null;
                  const delivered = deliverQuantities[item.id] ?? item.quantity;
                  const shortage = Math.max(0, item.quantity - delivered);
                  return (
                    <div
                      key={item.id}
                      className={`grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_140px] sm:items-end ${
                        shortage > 0 ? "border-destructive/40 bg-destructive/5" : "bg-background"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.item_name}
                          {item.item_code && <span className="font-mono text-xs text-muted-foreground"> · {item.item_code}</span>}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{item.department_label ?? item.department ?? "Department"}</span>
                          <span>Requested: <span className="font-medium text-foreground">{item.quantity}</span></span>
                          {shortage > 0 && (
                            <span className="inline-flex items-center gap-1 font-medium text-destructive">
                              <AlertTriangle className="size-3" />
                              Short: {shortage}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Delivered
                        </label>
                        <Input
                          type="number"
                          min={0}
                          max={item.quantity}
                          step={1}
                          className="h-9 text-right tabular-nums"
                          value={delivered}
                          onChange={(e) => {
                            const next = Math.max(0, Math.min(item.quantity, Number(e.target.value) || 0));
                            setDeliverQuantities((prev) => ({ ...prev, [item.id as number]: next }));
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
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

      </DialogContent>
    </Dialog>
  );
}
