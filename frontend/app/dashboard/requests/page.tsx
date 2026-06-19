"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { requestsApi, type RequestType, type RequestListItem, type CreateRequestPayload } from "@/lib/requests";
import { getCurrentUser, type CurrentUser } from "@/lib/user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TypeTabs, type TypeTabsValue } from "@/components/requests/type-tabs";
import { RequestForm } from "@/components/requests/request-form";
import { RequestDetailDialog } from "@/components/requests/request-detail-dialog";

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  awaiting_signoff: "bg-purple-100 text-purple-700",
  received: "bg-emerald-100 text-emerald-700",
  not_approved: "bg-red-100 text-red-700",
  cancelled: "bg-slate-200 text-slate-500",
};

export default function RequestsPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<TypeTabsValue>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [data, setData] = useState<RequestListItem[] | null>(null);
  const [allRows, setAllRows] = useState<RequestListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const searchParams = useSearchParams();

  // Auto-open detail dialog from ?highlight= query param (notification deep-link)
  useEffect(() => {
    const hl = searchParams.get("highlight");
    if (hl) {
      const id = Number(hl);
      if (!isNaN(id)) {
        setHighlightId(id);
        setDetailId(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Clear highlight when the detail dialog is dismissed
  useEffect(() => {
    if (detailId == null) {
      setHighlightId(null);
    }
  }, [detailId]);

  useEffect(() => {
    setUser(getCurrentUser());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && !user) {
      router.push("/login");
    }
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!hydrated) return;
    setLoading(true);
    const fetch = showInbox ? requestsApi.inbox() : requestsApi.list(tab === "all" ? undefined : { request_type: tab as RequestType });
    fetch.then(setData).catch(() => setData([])).finally(() => setLoading(false));
  }, [tab, hydrated, showInbox]);

  useEffect(() => {
    if (!hydrated) return;
    requestsApi.list()
      .then(setAllRows)
      .catch(() => setAllRows([]));
  }, [hydrated]);

  const refresh = () => {
    setLoading(true);
    (showInbox ? requestsApi.inbox() : requestsApi.list(tab === "all" ? undefined : { request_type: tab as RequestType }))
      .then(setData).catch(() => setData([])).finally(() => setLoading(false));
    requestsApi.list().then(setAllRows).catch(() => setAllRows([]));
  };

  const onCreate = async (payload: CreateRequestPayload) => {
    setCreateBusy(true);
    try {
      await requestsApi.create(payload);
      setCreateOpen(false);
      refresh();
    } catch (e: any) {
      console.error("Create failed:", e);
      alert(`Create failed: ${e?.message ?? "unknown error"}`);
      throw e;
    } finally {
      setCreateBusy(false);
    }
  };

  if (!hydrated || !user) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }

  const counts: Partial<Record<TypeTabsValue, number>> = { all: allRows?.length ?? 0 };
  for (const r of allRows ?? []) {
    counts[r.request_type as TypeTabsValue] = (counts[r.request_type as TypeTabsValue] ?? 0) + 1;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Requests</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>New request</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New request</DialogTitle>
            </DialogHeader>
            <RequestForm
              onSubmit={onCreate}
              onCancel={() => setCreateOpen(false)}
              submitLabel={createBusy ? "Creating…" : "Create"}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowInbox(false)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${!showInbox ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
        >
          All
        </button>
        <button
          onClick={() => setShowInbox(true)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${showInbox ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
        >
          Inbox
        </button>
        {!showInbox && <TypeTabs value={tab} onChange={setTab} counts={counts} />}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !data || data.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-slate-500">No requests yet.</CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {data.map((r) => (
            <li key={r.id} className={r.id === highlightId ? 'ring-2 ring-primary rounded-md' : ''}>
              <button
                onClick={() => setDetailId(r.id)}
                className="w-full text-left bg-white border border-slate-200 rounded-md p-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{r.sn_no}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {r.request_type.replace(/_/g, " ")}
                      {r.department_label && ` · ${r.department_label}`}
                      {r.from_whom && ` · from ${r.from_whom}`}
                      {r.requested_by_username && ` · ${r.requested_by_username}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500">qty {r.quantity}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGES[r.status]}`}>
                      {r.status}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <RequestDetailDialog
        requestId={detailId}
        open={detailId != null}
        onOpenChange={(o) => !o && setDetailId(null)}
        currentUser={{ id: user.id, role: user.role }}
      />
    </div>
  );
}
