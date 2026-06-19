"use client";

import { useEffect, useState } from "react";
import { requestsApi, type UnifiedRequest, type RequestStatus } from "@/lib/requests";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ClipboardList } from "lucide-react";
import { isAdmin } from "@/lib/user";

export interface RequestDetailDialogProps {
  requestId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: { id: number; role: string } | null;
}

const STATUS_COLORS: Record<RequestStatus, string> = {
  pending: "bg-slate-100 text-slate-800",
  approved: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  awaiting_signoff: "bg-purple-100 text-purple-800",
  received: "bg-emerald-100 text-emerald-800",
  not_approved: "bg-red-100 text-red-800",
  cancelled: "bg-slate-200 text-slate-600",
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

export function RequestDetailDialog({ requestId, open, onOpenChange, currentUser }: RequestDetailDialogProps) {
  const [data, setData] = useState<UnifiedRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [deliverNote, setDeliverNote] = useState("");
  const [ackOpen, setAckOpen] = useState(false);
  const [ackNote, setAckNote] = useState("");

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
  const isOwner = data?.requested_by_user_id === currentUser?.id;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="size-4 text-slate-600" />
            {data?.sn_no ?? "Loading…"}
          </DialogTitle>
        </DialogHeader>

        {loading && <p className="text-sm text-slate-500 px-4 pb-2">Loading…</p>}

        {data && (
          <div className="px-4 pb-2 space-y-4">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[data.status]}`}>
                {data.status}
              </span>
              <span className="text-xs text-slate-500">{data.request_type.replace(/_/g, " ")}</span>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {deptLabel && (
                <div>
                  <p className="text-xs text-muted-foreground">Department</p>
                  <p className="font-medium">{deptLabel}</p>
                </div>
              )}
              {data.from_whom && (
                <div>
                  <p className="text-xs text-muted-foreground">From</p>
                  <p className="font-medium">{data.from_whom}</p>
                </div>
              )}
              {data.requested_by_username && (
                <div>
                  <p className="text-xs text-muted-foreground">Requested by</p>
                  <p className="font-medium">{data.requested_by_username}</p>
                </div>
              )}
              {data.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="font-medium whitespace-pre-wrap">{data.notes}</p>
                </div>
              )}
            </div>

            {data.request_type === "customer_dispatch" && data.dispatch && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Customer
                </p>
                <p className="font-medium">
                  {data.dispatch.customer_name}
                  {data.dispatch.customer_phone && ` · ${data.dispatch.customer_phone}`}
                </p>
                {data.dispatch.customer_address && (
                  <p className="text-muted-foreground mt-0.5">{data.dispatch.customer_address}</p>
                )}
                <p className="text-muted-foreground mt-0.5">
                  {data.dispatch.inventory_type} · SN {data.dispatch.item_sn_no ?? "—"} · qty {data.dispatch.quantity}
                </p>
                {data.dispatch.delivery_type && (
                  <p className="text-muted-foreground mt-0.5">
                    Delivery: {data.dispatch.delivery_type}
                  </p>
                )}
              </div>
            )}

            {data.items.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Items ({data.items.length})
                </p>
                <div className="space-y-2">
                  {data.items.map((it) => (
                    <div key={it.id} className="rounded-lg border bg-muted/40 p-3">
                      <p className="text-sm font-medium">
                        {it.item_name}
                        {it.item_code && ` · ${it.item_code}`}
                      </p>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-0.5">
                        <span>Qty: {it.quantity}</span>
                        {it.department_label && <span>{it.department_label}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.delivered_by_username && (
              <div className="rounded-lg border bg-purple-50/40 p-3 text-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Delivered
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <div>
                    <p className="text-xs text-muted-foreground">Delivered by</p>
                    <p className="font-medium">{data.delivered_by_username}</p>
                  </div>
                  {data.delivered_at && (
                    <div>
                      <p className="text-xs text-muted-foreground">Delivered on</p>
                      <p className="font-medium">{new Date(data.delivered_at).toLocaleString()}</p>
                    </div>
                  )}
                  {data.delivery_note && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Note</p>
                      <p className="font-medium whitespace-pre-wrap">{data.delivery_note}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {data.acknowledged_by_username && (
              <div className="rounded-lg border bg-emerald-50/40 p-3 text-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Confirmed
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <div>
                    <p className="text-xs text-muted-foreground">Confirmed by</p>
                    <p className="font-medium">{data.acknowledged_by_username}</p>
                  </div>
                  {data.acknowledged_at && (
                    <div>
                      <p className="text-xs text-muted-foreground">Confirmed on</p>
                      <p className="font-medium">{new Date(data.acknowledged_at).toLocaleString()}</p>
                    </div>
                  )}
                  {data.acknowledgment_note && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Note</p>
                      <p className="font-medium whitespace-pre-wrap">{data.acknowledgment_note}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                History
              </p>
              <ol className="text-xs space-y-1.5 text-slate-600">
                {data.history.map((h) => (
                  <li key={h.id}>
                    <span className="text-slate-400">{new Date(h.changed_at).toLocaleString()}</span> ·{" "}
                    <span className="font-medium">{h.changed_by_username ?? "—"}</span> {HISTORY_LABELS[h.change_type] ?? h.change_type}
                    {h.note && <span className="text-slate-500"> — {h.note}</span>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {data && reviewerIsAdmin && data.status === "pending" && (
            <>
              <Button onClick={() => review("approve")}>Approve</Button>
              <Button variant="destructive" onClick={() => review("reject")}>Reject</Button>
            </>
          )}
          {data && data.status === "approved" && (
            <Button onClick={accept}>Accept fulfilment</Button>
          )}
          {data && data.status === "in_progress" && (
            <Button onClick={() => setDeliverOpen(true)}>Mark Delivered</Button>
          )}
          {data && data.status === "awaiting_signoff" && (
            <Button onClick={() => setAckOpen(true)}>Confirm Receipt</Button>
          )}
          {data && reviewerIsAdmin && data.status !== "received" && data.status !== "not_approved" && data.status !== "cancelled" && (
            <Button variant="ghost" onClick={cancelRequest}>
              Cancel request
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      <Dialog open={deliverOpen} onOpenChange={setDeliverOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Delivered</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Confirm that all items for <strong>{data?.sn_no}</strong> have been delivered to the requester.
              The requester will be asked to confirm receipt.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="deliver_note" className="text-sm font-medium">Delivery note (optional)</label>
              <textarea
                id="deliver_note"
                value={deliverNote}
                onChange={(e) => setDeliverNote(e.target.value)}
                placeholder="e.g. items handed over at the loading bay"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeliverOpen(false)}>Cancel</Button>
            <Button onClick={deliver}>Mark Delivered</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ackOpen} onOpenChange={setAckOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Receipt</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Confirm that you have received all items for <strong>{data?.sn_no}</strong>.
              This will close the request as <strong>received</strong>.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="ack_note" className="text-sm font-medium">Confirmation note (optional)</label>
              <textarea
                id="ack_note"
                value={ackNote}
                onChange={(e) => setAckNote(e.target.value)}
                placeholder="e.g. all items received in good condition"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAckOpen(false)}>Cancel</Button>
            <Button onClick={acknowledgeDelivery}>Confirm Receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </DialogContent>
    </Dialog>
  );
}
