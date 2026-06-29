import { cn } from "@/lib/utils";

interface PageShellProps {
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PageShell({
  header,
  children,
  className,
  contentClassName,
}: PageShellProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      {header}
      <div className={cn("flex-1 p-4 md:p-6 space-y-4", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
