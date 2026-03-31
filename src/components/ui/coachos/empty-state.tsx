import type { ReactNode } from "react";
import { EmptyStateActionButton, EmptyStateBlock } from "../../client/portal";

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
    <EmptyStateBlock
      title={title}
      description={description}
      icon={icon}
      centered={centered}
      className={className}
      actions={
        action ??
        (actionLabel && onAction ? (
          <EmptyStateActionButton label={actionLabel} onClick={onAction} />
        ) : undefined)
      }
    />
  );
}

// Example:
// <EmptyState title="No sessions yet" description="Create a workout template to get started." actionLabel="Create" onAction={...} />
