import { useState } from "react";
import { Badge } from "../badge";
import type { BadgeVariant } from "../badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../dialog";
import { cn } from "../../../lib/utils";
import {
  getClientLifecycleMeta,
  getClientRiskStateMeta,
  type ClientRiskState,
} from "../../../lib/client-lifecycle";
import { getSemanticBadgeVariant } from "../../../lib/semantic-status";

const defaultStatusMap: Record<
  string,
  {
    label: string;
    variant: BadgeVariant;
  }
> = {
  active: { label: "Active", variant: "success" },
  inactive: { label: "Inactive", variant: "neutral" },
  onboarding: { label: "Onboarding", variant: "warning" },
  paused: { label: "Paused", variant: "warning" },
  at_risk: { label: "At risk", variant: "danger" },
  "at risk": { label: "Needs attention", variant: "danger" },
  pending: { label: "Pending", variant: "warning" },
  invited: { label: "Not started", variant: "warning" },
  planned: { label: "Planned", variant: "neutral" },
  in_progress: { label: "In progress", variant: "info" },
  "in progress": { label: "In progress", variant: "info" },
  submitted: { label: "Submitted", variant: "info" },
  review_needed: { label: "Needs review", variant: "warning" },
  "review needed": { label: "Needs review", variant: "warning" },
  partially_activated: {
    label: "Reviewed",
    variant: "info",
  },
  "partially activated": {
    label: "Reviewed",
    variant: "info",
  },
  completed: { label: "Completed", variant: "success" },
  churned: { label: "Churned", variant: "neutral" },
  skipped: { label: "Skipped", variant: "danger" },
  rest: { label: "Rest day", variant: "warning" },
  "rest day": { label: "Rest day", variant: "warning" },
  recovery: { label: "Recovery", variant: "neutral" },
  upcoming: { label: "Upcoming", variant: "neutral" },
  reviewed: { label: "Reviewed", variant: "success" },
  archived: { label: "Archived", variant: "neutral" },
  "not logged": { label: "Not logged", variant: "neutral" },
};

function formatStatusLabel(status: string) {
  return status
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function StatusPill({
  status,
  className,
  statusMap,
}: {
  status: string | null | undefined;
  className?: string;
  statusMap?: typeof defaultStatusMap;
}) {
  const map = statusMap ?? defaultStatusMap;
  const normalized = status?.toLowerCase() ?? "active";
  const fallbackPill: {
    label: string;
    variant: BadgeVariant;
  } = {
    label: formatStatusLabel(normalized || "pending"),
    variant: "warning",
  };
  const pill =
    map[normalized] ??
    (normalized
      ? {
          label: formatStatusLabel(normalized),
          variant: getSemanticBadgeVariant(normalized),
        }
      : null) ??
    map.active ??
    fallbackPill;

  return (
    <Badge variant={pill.variant} className={cn("tracking-[0.2em]", className)}>
      {pill.label}
    </Badge>
  );
}

export function TagInfoBadge({
  label,
  variant,
  title,
  description,
  disabled = false,
  className,
}: {
  label: string;
  variant: BadgeVariant;
  title: string;
  description: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (disabled) {
    return (
      <Badge variant={variant} className={cn("tracking-[0.2em]", className)}>
        {label}
      </Badge>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`${label}: show explanation`}
      >
        <Badge
          variant={variant}
          className={cn(
            "tracking-[0.2em] transition-transform duration-200 hover:-translate-y-px",
            className,
          )}
        >
          {label}
        </Badge>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LifecycleBadge({
  lifecycleState,
  className,
  interactive = true,
}: {
  lifecycleState: string | null | undefined;
  className?: string;
  interactive?: boolean;
}) {
  const pill = getClientLifecycleMeta(lifecycleState);

  return (
    <TagInfoBadge
      label={pill.label}
      variant={pill.variant}
      title={`${pill.label} lifecycle`}
      description={pill.description}
      disabled={!interactive || pill.label === "Active"}
      className={className}
    />
  );
}

export function RiskBadge({
  riskState,
  className,
  interactive = true,
}: {
  riskState: ClientRiskState;
  className?: string;
  interactive?: boolean;
}) {
  const pill = getClientRiskStateMeta(riskState);

  return (
    <TagInfoBadge
      label={pill.label}
      variant={pill.variant}
      title={`${pill.label} risk state`}
      description={pill.description}
      disabled={!interactive}
      className={className}
    />
  );
}

// Example:
// <StatusPill status="planned" />
