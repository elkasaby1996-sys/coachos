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
        "surface-panel-strong relative overflow-hidden rounded-[32px] border-border/70 px-5 py-5 shadow-[0_30px_84px_-52px_rgba(0,0,0,0.9)] sm:px-6 sm:py-6 lg:flex lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.18),transparent_34%),radial-gradient(circle_at_bottom_left,oklch(var(--chart-2)/0.1),transparent_30%),linear-gradient(135deg,transparent,oklch(var(--success)/0.08))]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)]" />
      <div className="relative space-y-3">
        {eyebrow ? (
          <p className="pt-hub-chip px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-2">
          <h2 className="text-balance text-[2.35rem] font-semibold uppercase tracking-[0.06em] text-foreground sm:text-[2.8rem]">
            {title}
          </h2>
          <p className="max-w-2xl text-[0.98rem] leading-6 text-muted-foreground sm:text-[1rem]">
            {description}
          </p>
        </div>
      </div>
      {actions ? (
        <div className="pt-hub-action-shelf relative mt-4 flex flex-wrap items-center gap-2 rounded-[24px] p-2 lg:mt-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
