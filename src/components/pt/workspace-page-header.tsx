import { createContext, type ReactNode, useContext } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";
import {
  getModuleToneClasses,
  getModuleToneForPath,
  getModuleToneStyle,
  type ModuleTone,
} from "../../lib/module-tone";

const WorkspaceHeaderModeContext = createContext<"default" | "shell">(
  "default",
);

export function useWorkspaceHeaderMode() {
  return useContext(WorkspaceHeaderModeContext);
}

export function WorkspaceHeaderModeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: "default" | "shell";
}) {
  return (
    <WorkspaceHeaderModeContext.Provider value={value}>
      {children}
    </WorkspaceHeaderModeContext.Provider>
  );
}

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  module,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  module?: ModuleTone;
}) {
  const mode = useContext(WorkspaceHeaderModeContext);
  const location = useLocation();
  const resolvedModule = module ?? getModuleToneForPath(location.pathname);
  const toneClasses = getModuleToneClasses(resolvedModule);
  const toneStyle = getModuleToneStyle(resolvedModule);

  if (mode === "shell") {
    if (!actions) return null;

    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        {actions}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
      style={toneStyle}
    >
      <div className="space-y-3">
        {eyebrow ? (
          <p
            className={cn(
              "inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em]",
              toneClasses.text,
            )}
          >
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 rounded-full", toneClasses.dot)}
            />
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-1">
          <h1
            className={cn(
              "text-[1.82rem] font-semibold tracking-tight text-foreground",
              toneClasses.title,
            )}
          >
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
