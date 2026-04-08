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
        "surface-panel relative overflow-hidden rounded-[30px] border-border/70 shadow-[var(--surface-shadow)] backdrop-blur-xl",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.1),transparent_30%),radial-gradient(circle_at_bottom_left,oklch(var(--chart-3)/0.06),transparent_28%),linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.1),transparent_40%,oklch(var(--bg-surface)/0.06))]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,oklch(var(--border-strong)/0.32),transparent)]" />
      <CardHeader className="relative space-y-0 border-b border-border/55 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-[1.45rem] font-semibold uppercase tracking-[0.05em] text-foreground">
              {title}
            </CardTitle>
            {description ? (
              <p className="pt-hub-meta-text max-w-xl text-[0.95rem] leading-6">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="pt-hub-action-shelf flex flex-wrap gap-2 rounded-[20px] p-1.5">
              {actions}
            </div>
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
