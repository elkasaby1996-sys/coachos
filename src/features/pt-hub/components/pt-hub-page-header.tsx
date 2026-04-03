import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

export function PtHubPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface-panel-strong relative overflow-hidden rounded-[30px] border-border/70 px-5 py-5 sm:px-6 sm:py-6 lg:flex lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.16),transparent_34%),linear-gradient(135deg,transparent,oklch(var(--success)/0.08))]" />
      <div className="relative space-y-3">
        {eyebrow ? (
          <p className="inline-flex items-center rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold uppercase tracking-[0.02em] text-foreground sm:text-[2.15rem]">
            {title}
          </h2>
          <p className="max-w-2xl text-sm leading-5 text-muted-foreground sm:text-[0.92rem]">
            {description}
          </p>
        </div>
      </div>
      {actions ? (
        <div className="relative flex flex-wrap items-center gap-2 rounded-[22px] border border-border/70 bg-background/55 p-2 shadow-[inset_0_1px_0_oklch(var(--border-subtle)/0.18)]">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
