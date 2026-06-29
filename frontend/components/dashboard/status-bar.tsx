interface StatusBreakdown {
  [key: string]: number;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  pending: "Pending",
  confirmed: "Confirmed",
  in_production: "In Production",
  delivered: "Delivered",
  draft: "Draft",
  approved: "Approved",
};

const STATUS_COLOR_VAR: Record<string, string> = {
  pending: "var(--color-warning)",
  confirmed: "var(--color-info)",
  in_production: "var(--color-tone-violet)",
  delivered: "var(--color-success)",
  draft: "var(--color-muted-foreground)",
  approved: "var(--color-info)",
  in_progress: "var(--color-warning)",
  completed: "var(--color-success)",
  open: "var(--color-muted-foreground)",
};

const STATUS_DOT_CLASS: Record<string, string> = {
  open: "bg-muted-foreground",
  in_progress: "bg-warning",
  completed: "bg-success",
  pending: "bg-warning",
  confirmed: "bg-primary",
  in_production: "bg-tone-violet",
  delivered: "bg-success",
  draft: "bg-muted-foreground",
  approved: "bg-primary",
};

interface StatusBarProps {
  data: StatusBreakdown;
  title: string;
}

export function StatusBar({ data, title }: StatusBarProps) {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </p>
        <p className="text-xs text-muted-foreground">—</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </p>
      <div className="flex h-3 rounded-full overflow-hidden bg-muted">
        {Object.entries(data).map(([status, count]) =>
          count > 0 ? (
            <div
              key={status}
              className="h-full transition-all"
              style={{
                width: `${(count / total) * 100}%`,
                backgroundColor:
                  STATUS_COLOR_VAR[status] ?? "var(--color-muted-foreground)",
              }}
              title={`${STATUS_LABEL[status] ?? status}: ${count}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {Object.entries(data).map(([status, count]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${
                STATUS_DOT_CLASS[status] ?? "bg-muted-foreground"
              }`}
            />
            {STATUS_LABEL[status] ?? status}{" "}
            <span className="font-medium">{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
