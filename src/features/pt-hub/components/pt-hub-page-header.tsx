import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  getModuleToneClasses,
  getModuleToneForPath,
  getModuleToneStyle,
  type ModuleTone,
} from "../../../lib/module-tone";
import { cn } from "../../../lib/utils";

export function PtHubPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  module,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
  module?: ModuleTone;
}) {
  const location = useLocation();
  const resolvedModule = module ?? getModuleToneForPath(location.pathname);
  const toneClasses = getModuleToneClasses(resolvedModule);

  return (
    <div
      className={cn(
        "section-accent-shell surface-panel relative rounded-[30px] border border-border/70 px-5 py-5 shadow-[var(--surface-shadow)]",
        className,
      )}
      style={getModuleToneStyle(resolvedModule)}
    >
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p
            className={cn(
              "inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em]",
              toneClasses.text,
            )}
          >
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", toneClasses.dot)} />
            {eyebrow ?? title}
          </p>
          <div className="space-y-1">
            <h2
              className={cn(
                "text-[1.65rem] font-semibold uppercase tracking-[0.05em] text-foreground",
                toneClasses.title,
              )}
            >
              {title}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        {actions ? <div className="relative z-10 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
