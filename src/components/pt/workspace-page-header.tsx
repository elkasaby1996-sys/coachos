import {
  createContext,
  type ReactNode,
  useContext,
} from "react";
import { cn } from "../../lib/utils";

const WorkspaceHeaderModeContext = createContext<"default" | "shell">(
  "default",
);

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
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const mode = useContext(WorkspaceHeaderModeContext);

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
        "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/85">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-1">
          <h1 className="text-[1.82rem] font-semibold tracking-tight text-foreground">
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
