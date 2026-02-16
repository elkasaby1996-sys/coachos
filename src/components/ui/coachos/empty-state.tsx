import type { ReactNode } from "react";
import { Button } from "../button";
import { cn } from "../../../lib/utils";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  action,
  className,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground",
        className,
      )}
    >
      <p className="font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
      {!action && actionLabel && onAction ? (
        <div className="mt-3">
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
