import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  getModuleToneForPath,
  type ModuleTone,
} from "../../../lib/module-tone";
import { cn } from "../../../lib/utils";

export function PtHubSectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  module,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  module?: ModuleTone;
}) {
  const location = useLocation();
  const resolvedModule = module ?? getModuleToneForPath(location.pathname);

  return (
    <Card
      module={resolvedModule}
      className={cn(
        "surface-panel relative overflow-hidden rounded-[28px] border-border/70 shadow-[var(--surface-shadow)] backdrop-blur-xl",
        className,
      )}
    >
      <div className="pt-hub-section-card-overlay pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,oklch(var(--border-strong)/0.32),transparent)]" />
      <CardHeader
        module={resolvedModule}
        className="relative space-y-0 border-b border-border/55 px-4 py-3.5 sm:px-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle
              module={resolvedModule}
              className="text-[1.22rem] font-semibold tracking-[0.005em] text-foreground"
            >
              {title}
            </CardTitle>
            {description ? (
              <p className="pt-hub-meta-text max-w-xl text-[0.95rem] leading-6">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent
        className={cn("relative space-y-4 px-4 py-4 sm:px-5", contentClassName)}
      >
        {children}
      </CardContent>
    </Card>
  );
}
