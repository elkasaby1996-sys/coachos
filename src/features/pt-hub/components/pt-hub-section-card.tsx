import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { cn } from "../../../lib/utils";

export function PtHubSectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card
      className={cn(
        "surface-panel relative overflow-hidden rounded-[28px] border-border/70 backdrop-blur-xl",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.1),transparent_28%),linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.08),transparent_40%,oklch(var(--bg-surface)/0.05))]" />
      <CardHeader className="relative space-y-0 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold uppercase tracking-[0.03em] text-foreground">
              {title}
            </CardTitle>
            {description ? (
              <p className="max-w-xl text-sm leading-5 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap gap-2">{actions}</div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent
        className={cn("relative space-y-5 px-5 py-5 sm:px-6", contentClassName)}
      >
        {children}
      </CardContent>
    </Card>
  );
}
