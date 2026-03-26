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
        "rounded-[24px] border-border/70 bg-[linear-gradient(180deg,oklch(var(--card)/0.98),oklch(var(--card)/0.88))] shadow-card",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 px-5 pb-3 pt-4 sm:px-5 sm:pt-4">
        <div>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {subtitle ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-4 sm:px-5">{children}</CardContent>
    </Card>
  );
}

// Example:
// <DashboardCard title="Schedule" subtitle="Next 14 days" action={<Button size="sm">Add</Button>}>
//   <div className="space-y-2">...</div>
// </DashboardCard>
