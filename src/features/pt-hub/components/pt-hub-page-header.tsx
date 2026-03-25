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
        "flex flex-col gap-5 rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(15,20,32,0.86),rgba(10,14,24,0.82))] px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="space-y-3">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/85">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            {title}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
