import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { requestsApi    } from "@/lib/requests"
import type {RequestListItem, CreateRequestPayload} from "@/lib/requests";
import { apiFetchJson } from "@/lib/api"
import { getCurrentUser  } from "@/lib/user"
import type {CurrentUser} from "@/lib/user";
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { TypeTabs  } from "@/components/requests/type-tabs"
import type {TypeTabsValue} from "@/components/requests/type-tabs";
import { RequestForm } from "@/components/requests/request-form"
import { RequestDetailDialog } from "@/components/requests/request-detail-dialog"
import { PageHeader } from "@/components/layout/page-header"
import { ChevronLeft, ChevronRight, FileText, Plus, Search, Settings, ShoppingCart } from "lucide-react"
import { Input } from "@/components/ui/input"

const PAGE_SIZE = 10

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-muted text-slate-700",
  approved: "bg-primary/10 text-primary",
  in_progress: "bg-warning/15 text-warning",
  awaiting_signoff: "bg-purple-100 text-purple-700",
  received: "bg-success/10 text-success",
  not_approved: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  internal_transfer: "Internal transfer",
  vendor_purchase: "Purchase request",
  customer_dispatch: "Customer dispatch",
}

interface DeptRef {
  id: number
  code: string
  name: string
  can_create_purchase_request?: boolean
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error"
}

function requestDirectionForUser(request: RequestListItem, user: CurrentUser) {
  const userDeptCodes = new Set(user.department_codes ?? [])
  const targetDepartments = request.target_departments?.length
    ? request.target_departments
    : [request.department].filter((code): code is string => Boolean(code))
  const isIncoming = targetDepartments.some((code) => userDeptCodes.has(code))
  const isOutgoing = Boolean(
    (request.from_department && userDeptCodes.has(request.from_department))
    || request.requested_by_username === user.username,
  )

  if (isIncoming && isOutgoing) {
    return { label: "In & out", className: "border-amber-200 bg-amber-50 text-amber-700" }
  }
  if (isIncoming) {
    return { label: "To your dept", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
  }
  if (isOutgoing) {
    return { label: "From your dept", className: "border-sky-200 bg-sky-50 text-sky-700" }
  }
  return { label: "Related", className: "border-border bg-muted text-muted-foreground" }
}

const VALID_TABS: TypeTabsValue[] = ["all", "inbox", "internal_transfer", "vendor_purchase", "customer_dispatch"]
const TAB_ALIASES: Record<string, TypeTabsValue> = {
  internal: "internal_transfer",
}

function normalizeTab(raw: string | undefined): TypeTabsValue {
  if (!raw) return "all"
  const aliased = TAB_ALIASES[raw]
  if (aliased) return aliased
  return VALID_TABS.includes(raw as TypeTabsValue) ? (raw as TypeTabsValue) : "all"
}

export const Route = createFileRoute("/_auth/dashboard/requests")({
  validateSearch: z.object({
    tab: z.string().optional(),
    highlight: z.coerce.number().optional(),
    page: z.coerce.number().optional(),
    search: z.string().optional(),
  }),
  component: RequestsPage,
})

function RequestsPage() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const queryClient = useQueryClient()

  const tab = normalizeTab(search.tab)
  const tabParam = search.tab
  const pageNum = Math.max(1, search.page ?? 1)
  const searchTerm = search.search ?? ""
  const highlightParam = search.highlight

  const [user, setUser] = useState<CurrentUser | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [purchaseConfigOpen, setPurchaseConfigOpen] = useState(false)
  const [purchaseDeptIds, setPurchaseDeptIds] = useState<number[]>([])
  const [configSaving, setConfigSaving] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [searchDraft, setSearchDraft] = useState(searchTerm)

  useEffect(() => {
    Promise.resolve().then(() => {
      setUser(getCurrentUser())
      setHydrated(true)
    })
  }, [])

  useEffect(() => {
    if (hydrated && !user) {
      navigate({ href: "/login", replace: true })
    }
  }, [hydrated, user, navigate])

  // Sync the search input with the URL search param when it changes externally
  useEffect(() => {
    setSearchDraft(searchTerm)
  }, [searchTerm])

  // Debounced search → URL
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchDraft.trim()
      if (trimmed !== searchTerm) {
        navigate({ search: { tab: tabParam, page: 1, search: trimmed || undefined, highlight: undefined } })
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchDraft, tabParam, searchTerm, navigate])

  // Auto-open detail dialog from ?highlight= query param (notification deep-link)
  useEffect(() => {
    const hl = highlightParam
    if (hl != null && Number.isFinite(hl)) {
      setHighlightId(hl)
      setDetailId(hl)
    }
  }, [highlightParam])

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const listUrl = tab === "inbox"
    ? `/api/v1/requests/inbox?limit=${PAGE_SIZE}&offset=${(pageNum - 1) * PAGE_SIZE}${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ""}`
    : `/api/v1/requests?limit=${PAGE_SIZE}&offset=${(pageNum - 1) * PAGE_SIZE}${tab !== "all" ? `&request_type=${tab}` : ""}${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ""}`

  const listQuery = useQuery({
    queryKey: [listUrl],
    enabled: hydrated,
    staleTime: 0,
  })

  const countsQuery = useQuery({
    queryKey: ["/api/v1/requests?limit=500&offset=0"],
    enabled: hydrated,
    staleTime: 0,
  })

  const deptsQuery = useQuery({
    queryKey: ["/api/v1/departments"],
    enabled: hydrated,
    staleTime: 0,
  })

  const departments = deptsQuery.data as DeptRef[] | null

  useEffect(() => {
    if (hydrated && departments) {
      setPurchaseDeptIds(departments.filter((d) => d.can_create_purchase_request).map((d) => d.id))
    }
  }, [departments, hydrated])

  const createMutation = useMutation({
    mutationFn: (payload: CreateRequestPayload) => requestsApi.create(payload),
    onSuccess: () => {
      setCreateOpen(false)
      setPurchaseOpen(false)
      navigate({ search: { tab: tabParam, page: 1, search: searchTerm || undefined, highlight: undefined } })
      queryClient.invalidateQueries({ queryKey: ["/api/v1/requests"] })
    },
  })

  const configMutation = useMutation({
    mutationFn: (ids: number[]) =>
      apiFetchJson<DeptRef[]>("/api/v1/admin/departments/purchase-request-access", {
        method: "PUT",
        body: JSON.stringify({ department_ids: ids }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/v1/departments"], updated)
      setPurchaseDeptIds(updated.filter((d) => d.can_create_purchase_request).map((d) => d.id))
      setPurchaseConfigOpen(false)
    },
  })

  const onCreate = async (payload: CreateRequestPayload) => {
    setCreateBusy(true)
    try {
      await createMutation.mutateAsync(payload)
    } catch (e: unknown) {
      console.error("Create failed:", e)
      alert(`Create failed: ${errorMessage(e)}`)
      throw e
    } finally {
      setCreateBusy(false)
    }
  }

  const savePurchaseConfig = async () => {
    setConfigSaving(true)
    try {
      await configMutation.mutateAsync(purchaseDeptIds)
    } catch (e: unknown) {
      console.error("Purchase request config failed:", e)
      alert(`Save failed: ${errorMessage(e)}`)
    } finally {
      setConfigSaving(false)
    }
  }

  if (!hydrated || !user) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  const allRows = countsQuery.data as RequestListItem[] | null
  const counts: Partial<Record<TypeTabsValue, number>> = { all: allRows?.length ?? 0 }
  for (const r of allRows ?? []) {
    counts[r.request_type as TypeTabsValue] = (counts[r.request_type as TypeTabsValue] ?? 0) + 1
  }
  const data = listQuery.data as RequestListItem[] | undefined
  const loading = listQuery.isLoading
  const hasNextPage = (data?.length ?? 0) === PAGE_SIZE
  const hasPreviousPage = pageNum > 1
  const isAdminUser = user.role === "admin" || user.role === "super_admin"
  const purchaseRequestAllowed = isAdminUser || user.purchase_access || (departments ?? []).some(
    (dept) => dept.can_create_purchase_request && (user.department_codes ?? []).includes(dept.code),
  )

  function goToSearch(next: { tab?: string; page?: number; search?: string }) {
    navigate({ search: {
      tab: next.tab ?? tabParam,
      page: next.page ?? pageNum,
      search: next.search !== undefined ? next.search : searchTerm || undefined,
      highlight: undefined,
    } })
  }

  return (
    <>
      <PageHeader
        title="Requests"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {purchaseRequestAllowed && (
              <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen} modal={false} disablePointerDismissal>
                <DialogTrigger render={<Button variant="outline" />}>
                  <ShoppingCart className="size-3.5" />
                  Purchase request
                </DialogTrigger>
                <DialogContent
                  className="max-w-[calc(100%-1rem)] sm:max-w-4xl p-0 gap-0 max-h-[90vh] overflow-hidden"
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

            <Dialog open={createOpen} onOpenChange={setCreateOpen} modal={false} disablePointerDismissal>
              <DialogTrigger render={<Button />}>
                <Plus className="size-3.5" />
                New request
              </DialogTrigger>
              <DialogContent
                className="max-w-[calc(100%-1rem)] sm:max-w-4xl p-0 gap-0 max-h-[90vh] overflow-hidden"
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
            {!departments || departments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No departments found.</p>
            ) : departments.map((dept) => {
              const checked = purchaseDeptIds.includes(dept.id)
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
                      ))
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{dept.code} — {dept.name}</span>
                  </span>
                </label>
              )
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
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} className="pl-9" placeholder="Search request number, item, requester, or notes…" />
        </div>
        <TypeTabs
          value={tab}
          onChange={(nextTab) => {
            goToSearch({ tab: nextTab, page: 1 })
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
                          const direction = requestDirectionForUser(r, user)
                          return (
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${direction.className}`}>
                              {direction.label}
                            </span>
                          )
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
              onClick={() => goToSearch({ page: Math.max(1, pageNum - 1) })}
              disabled={!hasPreviousPage || loading}
            >
              <ChevronLeft className="size-3.5" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">Page {pageNum}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToSearch({ page: pageNum + 1 })}
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
        onOpenChange={(o) => {
          if (!o) {
            setDetailId(null)
            setHighlightId(null)
            if (highlightParam != null) {
              navigate({ search: { tab: tabParam, page: pageNum, search: searchTerm || undefined, highlight: undefined } })
            }
          }
        }}
        currentUser={user}
      />
    </div>
    </>
  )
}
