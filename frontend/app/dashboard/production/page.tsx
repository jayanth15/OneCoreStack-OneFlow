"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { CalendarClock, ClipboardList, Clock, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/user";

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
      </div>
    </>
  );
}
