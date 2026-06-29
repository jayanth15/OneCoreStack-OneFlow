"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiFetchJson } from "@/lib/api";
import { receiptsApi, type Receipt } from "@/lib/receipts";
import { getCurrentUser } from "@/lib/user";
import { ScrollText, ClipboardCheck, AlertTriangle, CheckCircle2, Printer } from "lucide-react";

const STATUS_BADGES: Record<string, string> = {
  created: "bg-purple-100 text-purple-700",
  signed_off: "bg-success/10 text-success",
  disputed: "bg-destructive/10 text-destructive",
};

interface CompanyInfo {
  company_name: string;
  company_address: string;
  company_city: string;
  company_state: string;
  company_country: string;
  company_pincode: string;
  company_phone: string;
  company_email: string;
  company_gstin: string;
}

const STATUS_ICONS: Record<string, typeof ScrollText> = {
  created: ScrollText,
  signed_off: CheckCircle2,
  disputed: AlertTriangle,
};

export default function ReceiptsPage() {
  const router = useRouter();
  const [user, setUser] = useState(getCurrentUser());
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
  }, [user, router]);

  useEffect(() => {
    apiFetchJson<CompanyInfo>("/api/v1/settings/company").then(setCompanyInfo).catch(() => {});
    receiptsApi.list()
      .then(setReceipts)
      .catch(() => setReceipts([]))
      .finally(() => setLoading(false));
  }, []);

  function printReceipt(r: Receipt) {
    const co = companyInfo;
    const coHtml = (co && co.company_name) ? `
      <div style="text-align:center;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #333;">
        <h1 style="margin:0;font-size:20px;font-weight:bold;">${co.company_name}</h1>
        <p style="margin:4px 0;">${[co.company_address, co.company_city, co.company_state].filter(Boolean).join(', ')}${co.company_pincode ? ' - ' + co.company_pincode : ''}</p>
        <p style="margin:2px 0;font-size:12px;">
          ${[co.company_phone ? `Phone: ${co.company_phone}` : '', co.company_email ? `Email: ${co.company_email}` : '', co.company_gstin ? `GST: ${co.company_gstin}` : ''].filter(Boolean).join(' | ')}
        </p>
      </div>` : '';
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt — ${r.receipt_number}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; margin: 24px; color: #111; }
  h2 { margin: 0 0 4px; font-size: 18px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  .row { display: flex; gap: 32px; margin-bottom: 8px; }
  .lbl { color: #666; font-size: 11px; }
  @media print { body { margin: 0; } }
</style></head><body>
${coHtml}
<h2>Receipt — ${r.receipt_number}</h2>
<p class="meta">Generated on ${new Date().toLocaleString("en-IN")}</p>
<div class="row">
  <div><div class="lbl">Status</div><div>${r.status.replace(/_/g, " ")}</div></div>
  ${r.created_by_username ? `<div><div class="lbl">Created By</div><div>${r.created_by_username}</div></div>` : ""}
  ${r.signed_off_at ? `<div><div class="lbl">Signed Off</div><div>${new Date(r.signed_off_at).toLocaleString()}</div></div>` : ""}
</div>
<table>
  <thead><tr><th>#</th><th>Item</th><th>Requested</th><th>Delivered</th>${r.items.some(i => i.quantity_signed_off != null) ? '<th>Signed Off</th>' : ''}</tr></thead>
  <tbody>
    ${r.items.map((it, i) => `<tr>
      <td>${i + 1}</td>
      <td>${it.item_name ?? "—"}</td>
      <td>${it.quantity_requested}</td>
      <td>${it.quantity_delivered}</td>
      ${it.quantity_signed_off != null ? `<td>${it.quantity_signed_off}</td>` : ''}
    </tr>`).join("")}
  </tbody>
</table>
${r.notes ? `<p style="margin-top:12px"><strong>Notes:</strong> ${r.notes}</p>` : ""}
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
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

        {!loading && receipts.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <ClipboardCheck className="size-12 mx-auto mb-3 opacity-20" />
              <p>No receipts yet.</p>
            </CardContent>
          </Card>
        )}

        {!loading && receipts.length > 0 && (
          <div className="space-y-3">
            {receipts.map((r) => {
              const Icon = STATUS_ICONS[r.status] ?? ScrollText;
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
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sm">{r.receipt_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGES[r.status] ?? "bg-muted text-muted-foreground"}`}>
                        {r.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r.created_by_username && `By ${r.created_by_username}`}
                      {r.notes && ` · ${r.notes}`}
                    </p>
                    {r.items.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.items.length} item{r.items.length !== 1 ? "s" : ""}
                        {r.items.map((it) => ` · ${it.item_name} (${it.quantity_delivered} delivered)`).join("")}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
          <DialogContent className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-purple-600" />
              {selected?.receipt_number}
              {selected && (
                <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => printReceipt(selected)}>
                  <Printer className="size-3 mr-1" />Print
                </Button>
              )}
            </DialogTitle>
            {selected && (
              <div className="space-y-4 px-1 pb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGES[selected.status] ?? ""}`}>
                    {selected.status.replace(/_/g, " ")}
                  </span>
                  {selected.created_by_username && (
                    <span className="text-xs text-muted-foreground">by {selected.created_by_username}</span>
                  )}
                </div>
                {selected.items.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Items ({selected.items.length})</p>
                    {selected.items.map((item) => (
                      <div key={item.id} className="rounded-lg border bg-muted/40 p-3 space-y-1">
                        <p className="text-sm font-medium">{item.item_name ?? "—"}</p>
                        <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                          <span>Requested: {item.quantity_requested}</span>
                          <span>Delivered: {item.quantity_delivered}</span>
                          {item.quantity_signed_off != null && (
                            <span>Signed off: {item.quantity_signed_off}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selected.notes && (
                  <p className="text-sm text-muted-foreground bg-muted/30 rounded-md px-3 py-2">{selected.notes}</p>
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
  );
}
