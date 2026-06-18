"use client";

import { cn } from "@/lib/utils";
import type { RequestType } from "@/lib/requests";

export type TypeTabsValue = RequestType | "all";

export interface TypeTabsProps {
  value: TypeTabsValue;
  onChange: (v: TypeTabsValue) => void;
  counts?: Partial<Record<TypeTabsValue, number>>;
}

const TABS: Array<{ value: TypeTabsValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "internal_transfer", label: "Internal" },
  { value: "vendor_purchase", label: "Vendor" },
  { value: "customer_dispatch", label: "Customer" },
];

export function TypeTabs({ value, onChange, counts }: TypeTabsProps) {
  return (
    <div className="flex gap-1 border-b border-slate-200 overflow-x-auto" role="tablist">
      {TABS.map((t) => {
        const active = t.value === value;
        const count = counts?.[t.value];
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              active
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
            {count != null && (
              <span className="ml-1.5 inline-flex items-center justify-center text-xs min-w-[1.25rem] h-5 px-1.5 rounded-full bg-slate-100 text-slate-700">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
