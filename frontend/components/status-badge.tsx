import { Badge, type badgeVariants } from "@/components/ui/badge";
import { cva, type VariantProps } from "class-variance-authority";

const statusVariant = cva("", {
  variants: {
    variant: {
      default: "",
      secondary: "",
      destructive: "",
      outline: "",
      success: "",
      warning: "",
      info: "",
    },
  },
});

type StatusVariant = VariantProps<typeof statusVariant>["variant"];

const STATUS_MAP: Record<string, StatusVariant> = {
  active: "success",
  open: "info",
  pending: "warning",
  in_progress: "warning",
  "in process": "warning",
  done: "success",
  completed: "success",
  delivered: "success",
  acknowledged: "info",
  received: "info",
  confirmed: "info",
  approved: "success",
  cancelled: "destructive",
  rejected: "destructive",
  inactive: "secondary",
  draft: "secondary",
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  variant?: StatusVariant;
  className?: string;
}

export function StatusBadge({
  status,
  label,
  variant,
  className,
}: StatusBadgeProps) {
  const resolvedVariant = variant ?? STATUS_MAP[status.toLowerCase()] ?? "secondary";
  const text = label ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Badge variant={resolvedVariant} className={className}>
      {text}
    </Badge>
  );
}

export { STATUS_MAP as STATUS_BADGE_MAP };
