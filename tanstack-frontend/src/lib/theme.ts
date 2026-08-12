export type Tone = "blue" | "emerald" | "amber" | "violet";

export const TONE_CLASSES: Record<
  Tone,
  { tile: string; text: string }
> = {
  blue: { tile: "bg-tone-blue/10 text-tone-blue", text: "text-tone-blue" },
  emerald: {
    tile: "bg-tone-emerald/10 text-tone-emerald",
    text: "text-tone-emerald",
  },
  amber: { tile: "bg-tone-amber/15 text-tone-amber", text: "text-tone-amber" },
  violet: {
    tile: "bg-tone-violet/10 text-tone-violet",
    text: "text-tone-violet",
  },
};

export type StatusVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info";

export const STATUS_BADGE_VARIANT: Record<string, StatusVariant> = {
  active: "success",
  open: "info",
  pending: "warning",
  in_progress: "warning",
  "in process": "warning",
  done: "success",
  completed: "success",
  delivered: "success",
  acknowledged: "info",
  cancelled: "destructive",
  inactive: "secondary",
  draft: "secondary",
  rejected: "destructive",
  approved: "success",
};

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export const STATUS_BAR_COLOR: Record<string, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  info: "var(--color-info)",
  destructive: "var(--color-destructive)",
  primary: "var(--color-primary)",
};
