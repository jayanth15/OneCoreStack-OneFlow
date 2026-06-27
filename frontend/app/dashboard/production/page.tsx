"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, ClipboardList, Clock, ChevronRight, PlusCircle, Loader2 } from "lucide-react";
import { getCurrentUser } from "@/lib/user";
import { apiFetchJson } from "@/lib/api";

const SECTIONS = [
  {
    title: "Production Planning",
    description:
      "Plan manpower, machines, tools & dies, laser-cutting (outsourced) and storage allocation for upcoming production runs.",
    icon: CalendarClock,
    href: "/dashboard/production/planning",
    color: "text-primary bg-primary/10",
  },
  {
    title: "Production Processing",
    description:
      "Create production orders, assign job cards per process step, and track worker output, hours & pending quantities.",
    icon: ClipboardList,
    href: "/dashboard/production/processing",
    color: "text-success bg-success/10",
  },
  {
    title: "Worker Time Report",
    description:
      "View aggregated work hours per worker, broken down by work type. Filter by date range to analyse productivity.",
    icon: Clock,
    href: "/dashboard/production/time-report",
    color: "text-warning bg-warning/15",
  },
];

export default function ProductionPage() {
  const router = useRouter();
  const [showTimeReport, setShowTimeReport] = useState(true);

  useEffect(() => {
    const u = getCurrentUser();
    // Only admin, super_admin, and manager see the Worker Time Report
    if (u && u.role === "worker") {
      setShowTimeReport(false);
    }
  }, []);

  const visibleSections = showTimeReport
    ? SECTIONS
    : SECTIONS.filter((s) => s.href !== "/dashboard/production/time-report");

  interface ProductionOrder {
    id: number;
    order_number: string;
    product_name: string;
    planned_qty: number;
  }

  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState(1);
  const [workerName, setWorkerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    apiFetchJson<{ items: ProductionOrder[] }>("/api/v1/production/orders?status=in_progress")
      .then(r => setOrders(r.items))
      .catch(() => {});
    const user = getCurrentUser();
    if (user?.username) setWorkerName(user.username);
  }, []);

  async function handleQuickCreate() {
    if (!selectedOrderId || qty <= 0) return;
    setSaving(true);
    setSuccess(false);
    try {
      const detail = await apiFetchJson<any>(`/api/v1/production/orders/${selectedOrderId}`);
      const processName = detail.processes?.[0]?.name || "General";
      await apiFetchJson(`/api/v1/production/orders/${selectedOrderId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          process_name: processName,
          worker_names: [workerName],
          hours_worked: 0,
          qty_produced: qty,
          work_date: workDate,
          notes: "Quick entry from production dashboard",
        }),
      });
      setQty(1);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to create job card:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Production"
        description="Plan and process your manufacturing operations."
        breadcrumbs={[{ label: "Production" }]}
      />

      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        {visibleSections.map((s) => (
          <button
            key={s.href}
            onClick={() => router.push(s.href)}
            className="w-full text-left rounded-xl border bg-card p-5 flex items-start gap-4 hover:bg-muted/40 transition-colors group"
          >
            <div className={`p-2.5 rounded-lg shrink-0 ${s.color}`}>
              <s.icon className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base">{s.title}</div>
              <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                {s.description}
              </p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground mt-1 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </button>
        ))}

        <div className="rounded-lg border bg-card p-5">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
            <PlusCircle className="size-5 text-primary" />
            Quick Job Card Entry
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Production Order</Label>
              <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                <SelectTrigger><SelectValue placeholder="Select order..." /></SelectTrigger>
                <SelectContent>
                  {orders.map(o => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.order_number} — {o.product_name}
                    </SelectItem>
                  ))}
                  {orders.length === 0 && (
                    <SelectItem value="_none" disabled>No in-progress orders</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Qty Produced</Label>
              <Input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div className="space-y-1.5">
              <Label>Worker</Label>
              <Input value={workerName} onChange={e => setWorkerName(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 justify-end">
            {success && <span className="text-sm text-green-600 font-medium">Job card created!</span>}
            <Button onClick={handleQuickCreate} disabled={!selectedOrderId || saving}>
              {saving ? <Loader2 className="size-4 animate-spin mr-1" /> : <PlusCircle className="size-4 mr-1" />}
              Create Job Card
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
