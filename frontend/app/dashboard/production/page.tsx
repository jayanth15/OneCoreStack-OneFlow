"use client";

import { useRouter } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { CalendarClock, ClipboardList, Clock, ChevronRight } from "lucide-react";

const SECTIONS = [
  {
    title: "Production Planning",
    description:
      "Plan manpower, machines, tools & dies, laser-cutting (outsourced) and storage allocation for upcoming production runs.",
    icon: CalendarClock,
    href: "/dashboard/production/planning",
    color: "text-blue-600 bg-blue-50",
  },
  {
    title: "Production Processing",
    description:
      "Create production orders, assign job cards per process step, and track worker output, hours & pending quantities.",
    icon: ClipboardList,
    href: "/dashboard/production/processing",
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    title: "Worker Time Report",
    description:
      "View aggregated work hours per worker, broken down by work type. Filter by date range to analyse productivity.",
    icon: Clock,
    href: "/dashboard/production/time-report",
    color: "text-amber-600 bg-amber-50",
  },
];

export default function ProductionPage() {
  const router = useRouter();
  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Production</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Production</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plan and process your manufacturing operations.
          </p>
        </div>

        {SECTIONS.map((s) => (
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
