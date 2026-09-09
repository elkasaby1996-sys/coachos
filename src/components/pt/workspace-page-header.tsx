import { type ReactNode, useContext } from "react";
import { cn } from "../../lib/utils";
import type { ModuleTone } from "../../lib/module-tone";
import { WorkspaceHeaderModeContext } from "./workspace-header-mode";
import { PageBackLink } from "./page-back-link";

export type WorkspacePageHeaderProps = {
  /** Retained for callers; page headings intentionally have no eyebrow. */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  module?: ModuleTone;
  backTo?: string;
  backLabel?: string;
};

export function WorkspacePageHeader({
  title,
  description,
  actions,
  className,
  backTo,
  backLabel = "Back",
}: WorkspacePageHeaderProps) {
  const mode = useContext(WorkspaceHeaderModeContext);
  if (mode === "shell") {
    return actions || backTo ? (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        {backTo ? <PageBackLink to={backTo} label={backLabel} /> : null}
        {actions}
      </div>
    ) : null;
  }
  return (
    <header className={cn("coach-page-heading", className)}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {backTo ? <PageBackLink to={backTo} label={backLabel} /> : null}
          <h1>{title}</h1>
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? (
        <div className="coach-page-heading-actions">{actions}</div>
      ) : null}
    </header>
  );
}
