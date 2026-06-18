"use client";

import { useEffect, useState } from "react";
import { requestsApi, type UnifiedRequest, type RequestStatus } from "@/lib/requests";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isAdmin } from "@/lib/user";

export interface RequestDetailDrawerProps {
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

export function RequestDetailDrawer({ requestId, open, onOpenChange, currentUser }: RequestDetailDrawerProps) {
  const [data, setData] = useState<UnifiedRequest | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || requestId == null) return;
    setLoading(true);
    requestsApi.get(requestId).then(setData).finally(() => setLoading(false));
  }, [open, requestId]);

  const reviewerIsAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin" || isAdmin();
  const isOwner = data?.requested_by_user_id === currentUser?.id;

  const review = async (decision: "approve" | "reject") => {
    if (!data) return;
    try {
      const updated = await requestsApi.review(data.id, decision);
      setData(updated);
    } catch (e) {
      console.error("Review failed:", e);
    }
  };

  const accept = async () => {
    if (!data) return;
    try {
      const updated = await requestsApi.accept(data.id);
      setData(updated);
    } catch (e) {
      console.error("Accept failed:", e);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{data?.sn_no ?? "Loading…"}</SheetTitle>
        </SheetHeader>

        {loading && <p className="text-sm text-slate-500 mt-4">Loading…</p>}

        {data && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[data.status]}`}>
                {data.status}
              </span>
              <span className="text-xs text-slate-500">{data.request_type.replace(/_/g, " ")}</span>
            </div>

            {data.department && <p className="text-sm"><span className="text-slate-500">Department:</span> {data.department}</p>}
            {data.from_whom && <p className="text-sm"><span className="text-slate-500">From:</span> {data.from_whom}</p>}
            {data.notes && <p className="text-sm whitespace-pre-wrap"><span className="text-slate-500">Notes:</span><br />{data.notes}</p>}

            {data.request_type === "customer_dispatch" && data.dispatch && (
              <div className="border border-slate-200 rounded-md p-3 text-sm">
                <h3 className="font-medium mb-1">Customer</h3>
                <p>{data.dispatch.customer_name} {data.dispatch.customer_phone && `· ${data.dispatch.customer_phone}`}</p>
                {data.dispatch.customer_address && <p className="text-slate-600">{data.dispatch.customer_address}</p>}
                <p className="text-slate-600">{data.dispatch.inventory_type} · SN {data.dispatch.item_sn_no} · qty {data.dispatch.quantity}</p>
                {data.dispatch.delivery_type && <p className="text-slate-600">Delivery: {data.dispatch.delivery_type}</p>}
              </div>
            )}

            {data.items.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-1">Items</h3>
                <ul className="text-sm border border-slate-200 rounded-md divide-y">
                  {data.items.map((it) => (
                    <li key={it.id} className="px-3 py-2 flex justify-between">
                      <span>{it.item_name} {it.item_code && `· ${it.item_code}`}</span>
                      <span className="text-slate-500">qty {it.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium mb-1">History</h3>
              <ol className="text-xs space-y-1 text-slate-600">
                {data.history.map((h) => (
                  <li key={h.id}>
                    <span className="text-slate-400">{new Date(h.changed_at).toLocaleString()}</span> ·{" "}
                    <span className="font-medium">{h.changed_by_username ?? "—"}</span> {h.change_type}
                    {h.note && <span className="text-slate-500"> — {h.note}</span>}
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              {reviewerIsAdmin && data.status === "pending" && (
                <>
                  <Button onClick={() => review("approve")}>Approve</Button>
                  <Button variant="destructive" onClick={() => review("reject")}>Reject</Button>
                </>
              )}
              {data.status === "approved" && (
                <Button onClick={accept}>Accept fulfilment</Button>
              )}
              {isOwner && data.status === "pending" && (
                <Button variant="ghost" onClick={async () => { await requestsApi.delete(data.id); onOpenChange(false); }}>
                  Cancel request
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
