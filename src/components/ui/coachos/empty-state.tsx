import type { ReactNode } from "react";
import { Button } from "../button";
import { cn } from "../../../lib/utils";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  action,
  icon,
  centered = false,
  className,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: ReactNode;
  icon?: ReactNode;
  centered?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface-dashed p-6 text-sm text-muted-foreground",
        centered && "text-center",
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            "mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/70 text-primary",
            centered && "mx-auto",
          )}
        >
          {icon}
        </div>
      ) : null}
      <p className="font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
      {!action && actionLabel && onAction ? (
        <div className="mt-4">
          <Button size="sm" variant="secondary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// Example:
// <EmptyState title="No sessions yet" description="Create a workout template to get started." actionLabel="Create" onAction={...} />
