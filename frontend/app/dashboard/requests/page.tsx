"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { requestsApi, type RequestType, type RequestListItem, type CreateRequestPayload } from "@/lib/requests";
import { getCurrentUser, type CurrentUser } from "@/lib/user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TypeTabs, type TypeTabsValue } from "@/components/requests/type-tabs";
import { RequestForm } from "@/components/requests/request-form";
import { RequestDetailDialog } from "@/components/requests/request-detail-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Plus, FileText } from "lucide-react";

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-muted text-slate-700",
  approved: "bg-primary/10 text-primary",
  in_progress: "bg-warning/15 text-warning",
  awaiting_signoff: "bg-purple-100 text-purple-700",
  received: "bg-success/10 text-success",
  not_approved: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
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
    const fetch = tab === "inbox"
      ? requestsApi.inbox()
      : requestsApi.list(tab === "all" ? undefined : { request_type: tab as RequestType });
    fetch.then(setData).catch(() => setData([])).finally(() => setLoading(false));
  }, [tab, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    requestsApi.list()
      .then(setAllRows)
      .catch(() => setAllRows([]));
  }, [hydrated]);

  const refresh = () => {
    setLoading(true);
    (tab === "inbox" ? requestsApi.inbox() : requestsApi.list(tab === "all" ? undefined : { request_type: tab as RequestType }))
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
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const counts: Partial<Record<TypeTabsValue, number>> = { all: allRows?.length ?? 0 };
  for (const r of allRows ?? []) {
    counts[r.request_type as TypeTabsValue] = (counts[r.request_type as TypeTabsValue] ?? 0) + 1;
  }

  return (
    <>
      <PageHeader
        title="Requests"
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen} modal={false}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-3.5" />
                New request
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-w-[calc(100%-1rem)] sm:max-w-2xl p-0 gap-0 max-h-[90vh] overflow-hidden"
              onInteractOutside={(e) => e.preventDefault()}
            >
              <div className="bg-gradient-to-b from-primary/[0.04] to-transparent px-6 pt-6 pb-4 border-b">
                <div className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-4" />
                  </div>
                  <div>
                    <DialogTitle className="font-heading text-lg font-semibold tracking-wider uppercase normal-case">
                      New request
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tell us what you need and where it should go.
                    </p>
                  </div>
                </div>
              </div>
              <div className="px-6 py-5 overflow-y-auto max-h-[calc(90vh-110px)]">
                <RequestForm
                  onSubmit={onCreate}
                  onCancel={() => setCreateOpen(false)}
                  submitLabel={createBusy ? "Creating…" : "Create request"}
                />
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
        <TypeTabs value={tab} onChange={setTab} counts={counts} />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No requests yet.</CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {data.map((r) => (
            <li key={r.id} className={r.id === highlightId ? 'ring-2 ring-primary rounded-md' : ''}>
              <button
                onClick={() => setDetailId(r.id)}
                className="w-full text-left bg-card border border-border rounded-md p-3 hover:bg-muted transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{r.sn_no}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.request_type.replace(/_/g, " ")}
                      {r.department_label && ` · ${r.department_label}`}
                      {r.from_whom && ` · from ${r.from_whom}`}
                      {r.requested_by_username && ` · ${r.requested_by_username}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">qty {r.quantity}</span>
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
    </>
  );
}
