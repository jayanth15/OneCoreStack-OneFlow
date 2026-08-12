import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetchJson } from "@/lib/api"
import { z } from "zod"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { receiptsApi } from "@/lib/receipts"
import type { Receipt } from "@/lib/receipts"
import { getCurrentUser } from "@/lib/user"
import { openPrintWindow } from "@/lib/print-report"
import { ScrollText, ClipboardCheck, AlertTriangle, CheckCircle2, Printer, ExternalLink, Check, ChevronLeft, ChevronRight } from "lucide-react"

const PAGE_SIZE = 10

const STATUS_BADGES: Record<string, string> = {
  created: "bg-purple-100 text-purple-700",
  signed_off: "bg-success/10 text-success",
  disputed: "bg-destructive/10 text-destructive",
}

const STATUS_ICONS: Record<string, typeof ScrollText> = {
  created: ScrollText,
  signed_off: CheckCircle2,
  disputed: AlertTriangle,
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error"
}

function receiptSignoffSummary(r: Receipt) {
  const signedItems = r.items.filter((item) => item.quantity_signed_off != null)
  const signedQty = signedItems.reduce((sum, item) => sum + (item.quantity_signed_off ?? 0), 0)
  const deliveredQty = r.items.reduce((sum, item) => sum + item.quantity_delivered, 0)
  const requestedQty = r.items.reduce((sum, item) => sum + item.quantity_requested, 0)
  const shortageQty = r.items.reduce((sum, item) => sum + Math.max(0, item.quantity_requested - item.quantity_delivered), 0)
  return { signedItems: signedItems.length, totalItems: r.items.length, signedQty, deliveredQty, requestedQty, shortageQty }
}

function receiptDirectionForUser(receipt: Receipt, user: NonNullable<ReturnType<typeof getCurrentUser>>) {
  const userDeptCodes = new Set(user.department_codes ?? [])
  const targetDepartments = receipt.request_target_departments?.length
    ? receipt.request_target_departments
    : [receipt.department].filter((code): code is string => Boolean(code))
  const isIncoming = targetDepartments.some((code) => userDeptCodes.has(code))
  const isOutgoing = Boolean(
    (receipt.request_from_department && userDeptCodes.has(receipt.request_from_department))
    || receipt.requested_by_username === user.username,
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

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_auth/dashboard/receipts")({
  validateSearch: z.object({
    receipt: z.coerce.number().optional(),
    request: z.coerce.number().optional(),
  }),
  component: ReceiptsPage,
})

// ── Page ──────────────────────────────────────────────────────────────────────

function ReceiptsPage() {
  const navigate = Route.useNavigate()
  const { receipt, request } = Route.useSearch()
  const queryClient = useQueryClient()
  const [user] = useState(getCurrentUser())
  const [selected, setSelected] = useState<Receipt | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!user) {
      navigate({ href: "/login", replace: true })
    }
  }, [])

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchLimit = PAGE_SIZE + 1
  const listUrl = `/api/v1/receipts?limit=${fetchLimit}&offset=${(page - 1) * PAGE_SIZE}`

  const listQuery = useQuery({
    queryKey: [listUrl],
    staleTime: 0,
  })

  // Auto-select a receipt when arriving via ?receipt=<id> or ?request=<id>.
  // First look in the loaded page; if not found, fetch it directly so deep
  // links work even when the receipt is on a later page.
  useEffect(() => {
    const rows = listQuery.data as Receipt[] | undefined
    if (!rows) return
    if (receipt == null && request == null) return
    const match = rows.find((r) => (
      (receipt != null && r.id === receipt)
      || (request != null && r.request_id === request)
    ))
    if (match) {
      setSelected(match)
      return
    }
    if (receipt != null) {
      apiFetchJson<Receipt>(`/api/v1/receipts/${receipt}`)
        .then((r) => setSelected(r))
        .catch(() => {
          /* not found — ignore */
        })
    }
  }, [listQuery.data, receipt, request])

  const signoffMutation = useMutation({
    mutationFn: (r: Receipt) => receiptsApi.signoff(r.id, "Accepted from receipt page"),
    onSuccess: (updated) => {
      setSelected(updated)
      queryClient.invalidateQueries({ queryKey: ["/api/v1/receipts"] })
    },
    onError: (e: unknown) => {
      console.error("Receipt accept failed:", e)
      alert(`Accept failed: ${errorMessage(e)}`)
    },
  })

  const allRows = (listQuery.data as Receipt[] | undefined) ?? []
  const rows = allRows.slice(0, PAGE_SIZE)
  const loading = listQuery.isLoading || listQuery.isFetching
  const hasNextPage = allRows.length > PAGE_SIZE
  const hasPreviousPage = page > 1

  function printReceipt(r: Receipt) {
    openPrintWindow({
      title: `Receipt — ${r.receipt_number}`,
      subtitle: r.request_sn_no ? `Request: ${r.request_sn_no}` : undefined,
      mode: "audit-snapshot",
      documentLabel: "Receipt",
      metadata: [
        { label: "Status", value: r.status.replaceAll("_", " ") },
        { label: "Department", value: r.department_label ?? r.department ?? "—" },
        { label: "Request", value: r.request_sn_no ?? "—" },
        { label: "Requested by", value: r.requested_by_username ?? "—" },
        { label: "Created by", value: r.created_by_username ?? "—" },
        { label: "Created at", value: new Date(r.created_at).toLocaleString("en-IN") },
        { label: "Signed off by", value: r.signed_off_by_username ?? "—" },
        { label: "Signed off at", value: r.signed_off_at ? new Date(r.signed_off_at).toLocaleString("en-IN") : "—" },
        { label: "Dispute", value: r.dispute_note ?? "—" },
        { label: "Notes", value: r.notes ?? "—" },
      ],
      columns: ["#", "Item", "Code", "Type", "Requested", "Delivered", "Signed Off", "Unit", "Condition"],
      rows: r.items.map((item, index) => ({
        "#": index + 1,
        Item: item.item_name ?? "—",
        Code: item.item_code ?? "—",
        Type: item.item_type?.replaceAll("_", " ") ?? "—",
        Requested: item.quantity_requested,
        Delivered: item.quantity_delivered,
        "Signed Off": item.quantity_signed_off ?? "—",
        Unit: item.unit_name ?? item.unit ?? "—",
        Condition: item.condition ?? "—",
      })),
    })
  }

  return (
    <>
      <PageHeader title="Receipts" />

      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!loading && rows.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <ClipboardCheck className="size-12 mx-auto mb-3 opacity-20" />
              <p>No receipts yet.</p>
            </CardContent>
          </Card>
        )}

        {!loading && rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((r) => {
              const Icon = STATUS_ICONS[r.status] ?? ScrollText
              const summary = receiptSignoffSummary(r)
              const direction = user ? receiptDirectionForUser(r, user) : null
              return (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="w-full text-left bg-card border rounded-xl p-4 hover:bg-muted transition-colors flex items-start gap-4"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-tone-purple/10 text-tone-purple">
                    <Icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-sm">{r.receipt_number}</span>
                      {direction && (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${direction.className}`}>
                          {direction.label}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGES[r.status] ?? "bg-muted text-muted-foreground"}`}>
                        {r.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Request {r.request_sn_no ?? `#${r.request_id}`}
                      {(r.request_from_department_label || r.request_from_department) && ` · from ${r.request_from_department_label ?? r.request_from_department}`}
                      {r.request_target_department_labels?.length ? ` · to ${r.request_target_department_labels.join(", ")}` : (r.department_label || r.department) && ` · to ${r.department_label ?? r.department}`}
                      {r.created_by_username && ` · By ${r.created_by_username}`}
                      {r.notes && ` · ${r.notes}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Signed off {summary.signedItems}/{summary.totalItems} items
                      {summary.shortageQty > 0 && ` · Short ${summary.shortageQty}`}
                      {r.signed_off_by_username && ` · by ${r.signed_off_by_username}`}
                    </p>
                    {r.items.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.items.length} item{r.items.length !== 1 ? "s" : ""}
                        {r.items.map((it) => ` · ${it.item_name} (${it.quantity_delivered} delivered)`).join("")}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
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

        {/* Detail Dialog */}
        <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null) }}>
          <DialogContent className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-purple-600" />
              {selected?.receipt_number}
              {selected && (
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => navigate({ href: `/dashboard/requests?highlight=${selected.request_id}` })}
                  >
                    <ExternalLink className="size-3 mr-1" />Request
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => printReceipt(selected)}>
                    <Printer className="size-3 mr-1" />Print
                  </Button>
                  {selected.status === "created" && (
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => signoffMutation.mutate(selected)}
                      disabled={signoffMutation.isPending}
                    >
                      <Check className="size-3 mr-1" />{signoffMutation.isPending ? "Accepting" : "Accept"}
                    </Button>
                  )}
                </div>
              )}
            </DialogTitle>
            {selected && (
              <div className="space-y-4 px-1 pb-2">
                {(() => {
                  const summary = receiptSignoffSummary(selected)
                  return (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Receipt dept</p>
                        <p className="mt-1 truncate text-sm font-medium">{selected.department_label ?? selected.department ?? "—"}</p>
                      </div>
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">From</p>
                        <p className="mt-1 truncate text-sm font-medium">{selected.request_from_department_label ?? selected.request_from_department ?? "—"}</p>
                      </div>
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">To</p>
                        <p className="mt-1 truncate text-sm font-medium">{selected.request_target_department_labels?.join(", ") || selected.department_label || selected.department || "—"}</p>
                      </div>
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Signed items</p>
                        <p className="mt-1 text-sm font-medium tabular-nums">{summary.signedItems}/{summary.totalItems}</p>
                      </div>
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Signed qty</p>
                        <p className="mt-1 text-sm font-medium tabular-nums">{summary.signedQty}/{summary.deliveredQty}</p>
                      </div>
                      <div className={`rounded-md border p-3 ${summary.shortageQty > 0 ? "border-destructive/40 bg-destructive/5" : "bg-muted/30"}`}>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Shortage</p>
                        <p className={`mt-1 text-sm font-medium tabular-nums ${summary.shortageQty > 0 ? "text-destructive" : ""}`}>
                          {summary.shortageQty}/{summary.requestedQty}
                        </p>
                      </div>
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Signed by</p>
                        <p className="mt-1 truncate text-sm font-medium">{selected.signed_off_by_username ?? "—"}</p>
                      </div>
                    </div>
                  )
                })()}
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGES[selected.status] ?? ""}`}>
                    {selected.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">request #{selected.request_id}</span>
                  {selected.created_by_username && (
                    <span className="text-xs text-muted-foreground">by {selected.created_by_username}</span>
                  )}
                </div>
                {selected.items.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Items ({selected.items.length})</p>
                    {selected.items.map((item) => {
                      const shortage = Math.max(0, item.quantity_requested - item.quantity_delivered)
                      return (
                      <div key={item.id} className={`rounded-lg border p-3 space-y-1 ${shortage > 0 ? "border-destructive/40 bg-destructive/5" : "bg-muted/40"}`}>
                        <p className="text-sm font-medium">{item.item_name ?? "—"}</p>
                        <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                          <span>Requested: {item.quantity_requested}</span>
                          <span>Delivered: {item.quantity_delivered}</span>
                          {shortage > 0 && <span className="font-medium text-destructive">Short: {shortage}</span>}
                          {item.quantity_signed_off != null && (
                            <span>Signed off: {item.quantity_signed_off}</span>
                          )}
                        </div>
                      </div>
                    )})}
                  </div>
                )}
                {selected.notes && (
                  <p className="text-sm text-muted-foreground bg-muted/30 rounded-md px-3 py-2">{selected.notes}</p>
                )}
                {selected.status === "created" && (
                  <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-3">
                    <p className="text-sm font-medium">Accept this receipt to close the request.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This signs off the delivered quantities and moves request #{selected.request_id} to received.
                    </p>
                  </div>
                )}
                {selected.signed_off_at && (
                  <p className="text-xs text-muted-foreground">
                    Signed off {new Date(selected.signed_off_at).toLocaleString()}
                    {selected.signed_off_by_username && ` by ${selected.signed_off_by_username}`}
                  </p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
