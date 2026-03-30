import { Badge } from "../badge";
import { cn } from "../../../lib/utils";

const defaultStatusMap: Record<
  string,
  {
    label: string;
    variant: "success" | "warning" | "danger" | "muted" | "secondary";
  }
> = {
  active: { label: "Active", variant: "success" },
  inactive: { label: "Inactive", variant: "muted" },
  onboarding: { label: "Onboarding", variant: "secondary" },
  paused: { label: "Paused", variant: "warning" },
  at_risk: { label: "At risk", variant: "danger" },
  "at risk": { label: "Needs attention", variant: "danger" },
  pending: { label: "Pending", variant: "warning" },
  invited: { label: "Not started", variant: "warning" },
  planned: { label: "Planned", variant: "muted" },
  in_progress: { label: "In progress", variant: "warning" },
  "in progress": { label: "In progress", variant: "warning" },
  submitted: { label: "Reviewed", variant: "secondary" },
  review_needed: { label: "Needs review", variant: "warning" },
  "review needed": { label: "Needs review", variant: "warning" },
  partially_activated: {
    label: "Reviewed",
    variant: "secondary",
  },
  "partially activated": {
    label: "Reviewed",
    variant: "secondary",
  },
  completed: { label: "Completed", variant: "success" },
  churned: { label: "Churned", variant: "muted" },
  skipped: { label: "Skipped", variant: "danger" },
  rest: { label: "Rest day", variant: "warning" },
  "rest day": { label: "Rest day", variant: "warning" },
  recovery: { label: "Recovery", variant: "muted" },
  "not logged": { label: "Not logged", variant: "muted" },
};

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
    variant: "success" | "warning" | "danger" | "muted" | "secondary";
  } = {
    label: "Pending",
    variant: "warning",
  };
  const pill = map[normalized] ?? map.active ?? fallbackPill;

  return (
    <Badge variant={pill.variant} className={cn("tracking-[0.2em]", className)}>
      {pill.label}
    </Badge>
  );
}

// Example:
// <StatusPill status="planned" />
