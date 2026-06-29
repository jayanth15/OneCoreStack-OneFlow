import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  noPadding?: boolean;
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  noPadding,
}: SectionCardProps) {
  const hasHeader = title || description || action;
  return (
    <Card className={cn(className)}>
      {hasHeader && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn(noPadding && "px-0", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
