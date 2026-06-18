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

export function RequestDetailDialog({ requestId, open, onOpenChange, currentUser }: RequestDetailDialogProps) {
  const [data, setData] = useState<UnifiedRequest | null>(null);
  const [loading, setLoading] = useState(false);

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

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                History
              </p>
              <ol className="text-xs space-y-1.5 text-slate-600">
                {data.history.map((h) => (
                  <li key={h.id}>
                    <span className="text-slate-400">{new Date(h.changed_at).toLocaleString()}</span> ·{" "}
                    <span className="font-medium">{h.changed_by_username ?? "—"}</span> {h.change_type}
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
          {data && isOwner && data.status === "pending" && (
            <Button variant="ghost" onClick={cancelRequest}>
              Cancel request
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
