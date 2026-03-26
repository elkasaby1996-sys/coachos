import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function WorkspacePageHeader({
  eyebrow = "PT Workspace",
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
        "surface-panel flex flex-col gap-3 px-5 py-4 sm:px-6 sm:py-4 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/85">
          {eyebrow}
        </p>
        <div className="space-y-1">
          <h1 className="text-[1.82rem] font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="max-w-3xl text-sm leading-5 text-muted-foreground">
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
