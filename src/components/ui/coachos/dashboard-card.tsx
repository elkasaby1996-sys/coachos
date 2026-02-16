import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../card";
import { cn } from "../../../lib/utils";

export function DashboardCard({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "rounded-xl border border-border bg-card/80 shadow-sm",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {subtitle ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="px-5 pb-5">{children}</CardContent>
    </Card>
  );
}

// Example:
// <DashboardCard title="Schedule" subtitle="Next 14 days" action={<Button size="sm">Add</Button>}>
//   <div className="space-y-2">...</div>
// </DashboardCard>
