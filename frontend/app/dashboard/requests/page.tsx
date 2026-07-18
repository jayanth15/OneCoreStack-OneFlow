"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { requestsApi, type RequestType, type RequestListItem, type CreateRequestPayload } from "@/lib/requests";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser, type CurrentUser } from "@/lib/user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TypeTabs, type TypeTabsValue } from "@/components/requests/type-tabs";
import { RequestForm } from "@/components/requests/request-form";
import { RequestDetailDialog } from "@/components/requests/request-detail-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { ChevronLeft, ChevronRight, FileText, Plus, Settings, ShoppingCart } from "lucide-react";

const PAGE_SIZE = 10;

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-muted text-slate-700",
  approved: "bg-primary/10 text-primary",
  in_progress: "bg-warning/15 text-warning",
  awaiting_signoff: "bg-purple-100 text-purple-700",
  received: "bg-success/10 text-success",
  not_approved: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  internal_transfer: "Internal transfer",
  vendor_purchase: "Purchase request",
  customer_dispatch: "Customer dispatch",
};

interface DeptRef {
  id: number;
  code: string;
  name: string;
  can_create_purchase_request?: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function requestDirectionForUser(request: RequestListItem, user: CurrentUser) {
  const userDeptCodes = new Set(user.department_codes ?? []);
  const targetDepartments = request.target_departments?.length
    ? request.target_departments
    : [request.department].filter((code): code is string => Boolean(code));
  const isIncoming = targetDepartments.some((code) => userDeptCodes.has(code));
  const isOutgoing = Boolean(
    (request.from_department && userDeptCodes.has(request.from_department))
    || request.requested_by_username === user.username,
  );

  if (isIncoming && isOutgoing) {
    return { label: "In & out", className: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  if (isIncoming) {
    return { label: "To your dept", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (isOutgoing) {
    return { label: "From your dept", className: "border-sky-200 bg-sky-50 text-sky-700" };
  }
  return { label: "Related", className: "border-border bg-muted text-muted-foreground" };
}

export default function RequestsPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<TypeTabsValue>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseConfigOpen, setPurchaseConfigOpen] = useState(false);
  const [departments, setDepartments] = useState<DeptRef[]>([]);
  const [purchaseDeptIds, setPurchaseDeptIds] = useState<number[]>([]);
  const [configSaving, setConfigSaving] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [data, setData] = useState<RequestListItem[] | null>(null);
  const [allRows, setAllRows] = useState<RequestListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [createBusy, setCreateBusy] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const searchParams = useSearchParams();

  // Auto-open detail dialog from ?highlight= query param (notification deep-link)
  useEffect(() => {
    const hl = searchParams.get("highlight");
    if (hl) {
      const id = Number(hl);
      if (!isNaN(id)) {
        Promise.resolve().then(() => {
          setHighlightId(id);
          setDetailId(id);
        });
      }
    }
  }, [searchParams]);

  // Clear highlight when the detail dialog is dismissed
  useEffect(() => {
    if (detailId == null) {
      Promise.resolve().then(() => setHighlightId(null));
    }
  }, [detailId]);

  useEffect(() => {
    Promise.resolve().then(() => {
      setUser(getCurrentUser());
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated && !user) {
      router.push("/login");
    }
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!hydrated) return;
    Promise.resolve().then(() => {
      setLoading(true);
      const paging = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
      const fetch = tab === "inbox"
        ? requestsApi.inbox(paging)
        : requestsApi.list(tab === "all" ? paging : { request_type: tab as RequestType, ...paging });
      fetch.then(setData).catch(() => setData([])).finally(() => setLoading(false));
    });
  }, [tab, hydrated, page]);

  useEffect(() => {
    if (!hydrated) return;
    requestsApi.list({ limit: 500, offset: 0 })
      .then(setAllRows)
      .catch(() => setAllRows([]));
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    apiFetchJson<DeptRef[]>("/api/v1/departments")
      .then((rows) => {
        setDepartments(rows);
        setPurchaseDeptIds(rows.filter((d) => d.can_create_purchase_request).map((d) => d.id));
      })
      .catch(() => {
        setDepartments([]);
        setPurchaseDeptIds([]);
      });
  }, [hydrated]);

  const refresh = () => {
    setLoading(true);
    const paging = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
    (tab === "inbox" ? requestsApi.inbox(paging) : requestsApi.list(tab === "all" ? paging : { request_type: tab as RequestType, ...paging }))
      .then(setData).catch(() => setData([])).finally(() => setLoading(false));
    requestsApi.list({ limit: 500, offset: 0 }).then(setAllRows).catch(() => setAllRows([]));
  };

  const onCreate = async (payload: CreateRequestPayload) => {
    setCreateBusy(true);
    try {
      await requestsApi.create(payload);
      setCreateOpen(false);
      setPurchaseOpen(false);
      refresh();
    } catch (e: unknown) {
      console.error("Create failed:", e);
      alert(`Create failed: ${errorMessage(e)}`);
      throw e;
    } finally {
      setCreateBusy(false);
    }
  };

  const savePurchaseConfig = async () => {
    setConfigSaving(true);
    try {
      const updated = await apiFetchJson<DeptRef[]>("/api/v1/admin/departments/purchase-request-access", {
        method: "PUT",
        body: JSON.stringify({ department_ids: purchaseDeptIds }),
      });
      setDepartments(updated);
      setPurchaseDeptIds(updated.filter((d) => d.can_create_purchase_request).map((d) => d.id));
      setPurchaseConfigOpen(false);
    } catch (e: unknown) {
      console.error("Purchase request config failed:", e);
      alert(`Save failed: ${errorMessage(e)}`);
    } finally {
      setConfigSaving(false);
    }
  };

  if (!hydrated || !user) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const counts: Partial<Record<TypeTabsValue, number>> = { all: allRows?.length ?? 0 };
  for (const r of allRows ?? []) {
    counts[r.request_type as TypeTabsValue] = (counts[r.request_type as TypeTabsValue] ?? 0) + 1;
  }
  const hasNextPage = (data?.length ?? 0) === PAGE_SIZE;
  const hasPreviousPage = page > 1;
  const isAdminUser = user.role === "admin" || user.role === "super_admin";
  const purchaseRequestAllowed = isAdminUser || departments.some(
    (dept) => dept.can_create_purchase_request && (user.department_codes ?? []).includes(dept.code),
  );

  return (
    <>
      <PageHeader
        title="Requests"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {purchaseRequestAllowed && (
              <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen} modal={false}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <ShoppingCart className="size-3.5" />
                    Purchase request
                  </Button>
                </DialogTrigger>
                <DialogContent
                  className="max-w-[calc(100%-1rem)] sm:max-w-4xl p-0 gap-0 max-h-[90vh] overflow-hidden"
                  onInteractOutside={(e) => e.preventDefault()}
                >
                  <div className="bg-gradient-to-b from-primary/[0.04] to-transparent px-6 pt-6 pb-4 border-b">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                          <ShoppingCart className="size-4" />
                        </div>
                        <div>
                          <DialogTitle className="font-heading text-lg font-semibold tracking-wider uppercase normal-case">
                            Purchase request
                          </DialogTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            List items that need to be purchased for the company.
                          </p>
                        </div>
                      </div>
                      {isAdminUser && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setPurchaseConfigOpen(true)}>
                          <Settings className="size-3.5" />
                          Configure
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="px-6 py-5 overflow-y-auto max-h-[calc(90vh-110px)]">
                    <RequestForm
                      defaultType="vendor_purchase"
                      onSubmit={onCreate}
                      onCancel={() => setPurchaseOpen(false)}
                      submitLabel={createBusy ? "Creating…" : "Create purchase request"}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen} modal={false}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-3.5" />
                  New request
                </Button>
              </DialogTrigger>
              <DialogContent
                className="max-w-[calc(100%-1rem)] sm:max-w-4xl p-0 gap-0 max-h-[90vh] overflow-hidden"
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
          </div>
        }
      />

      <Dialog open={purchaseConfigOpen} onOpenChange={setPurchaseConfigOpen}>
        <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-md p-0 gap-0">
          <div className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-base font-semibold">Purchase request access</DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Select departments that can create purchase requests.
            </p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-2">
            {departments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No departments found.</p>
            ) : departments.map((dept) => {
              const checked = purchaseDeptIds.includes(dept.id);
              return (
                <label key={dept.id} className="flex cursor-pointer items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={checked}
                    onChange={(event) => {
                      setPurchaseDeptIds((current) => (
                        event.target.checked
                          ? [...new Set([...current, dept.id])]
                          : current.filter((id) => id !== dept.id)
                      ));
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{dept.code} — {dept.name}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" size="sm" onClick={() => setPurchaseConfigOpen(false)} disabled={configSaving}>
              Cancel
            </Button>
            <Button size="sm" onClick={savePurchaseConfig} disabled={configSaving}>
              {configSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
        <TypeTabs
          value={tab}
          onChange={(nextTab) => {
            setTab(nextTab);
            setPage(1);
          }}
          counts={counts}
        />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No requests yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {data.map((r) => (
              <li key={r.id} className={r.id === highlightId ? 'ring-2 ring-primary rounded-md' : ''}>
                <button
                  onClick={() => setDetailId(r.id)}
                  className="w-full text-left bg-card border border-border rounded-md p-3 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-sm">{r.sn_no}</p>
                        {(() => {
                          const direction = requestDirectionForUser(r, user);
                          return (
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${direction.className}`}>
                              {direction.label}
                            </span>
                          );
                        })()}
                        {r.request_type === "vendor_purchase" && (
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-700">
                            Purchase request
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {REQUEST_TYPE_LABELS[r.request_type] ?? r.request_type.replace(/_/g, " ")}
                        {r.from_department_label && ` · from ${r.from_department_label}`}
                        {r.target_department_labels?.length ? ` · to ${r.target_department_labels.join(", ")}` : r.department_label && ` · to ${r.department_label}`}
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

          <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={!hasPreviousPage || loading}
            >
              <ChevronLeft className="size-3.5" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">Page {page}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => current + 1)}
              disabled={!hasNextPage || loading}
            >
              Next
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      <RequestDetailDialog
        requestId={detailId}
        open={detailId != null}
        onOpenChange={(o) => !o && setDetailId(null)}
        currentUser={user}
      />
    </div>
    </>
  );
}
