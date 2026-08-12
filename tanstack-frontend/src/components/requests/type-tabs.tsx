import { cn } from "@/lib/utils"
import type { RequestType } from "@/lib/requests"
import { Inbox } from "lucide-react"

export type TypeTabsValue = RequestType | "all" | "inbox"

export interface TypeTabsProps {
  value: TypeTabsValue
  onChange: (v: TypeTabsValue) => void
  counts?: Partial<Record<TypeTabsValue, number>>
}

const TABS: Array<{ value: TypeTabsValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "internal_transfer", label: "Internal" },
  { value: "inbox", label: "Inbox" },
]

export function TypeTabs({ value, onChange, counts }: TypeTabsProps) {
  return (
    <div className="flex gap-1 border-b border-border overflow-x-auto" role="tablist">
      {TABS.map((t) => {
        const active = t.value === value
        const count = counts?.[t.value]
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
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-1.5">
              {t.value === "inbox" && <Inbox className="size-3.5" />}
              {t.label}
              {count != null && (
                <span className="tabular-nums inline-flex items-center justify-center text-xs min-w-[1.25rem] h-5 px-1.5 rounded-full bg-muted text-foreground">
                  {count}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
