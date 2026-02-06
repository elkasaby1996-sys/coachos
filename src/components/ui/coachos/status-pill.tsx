import { Badge } from "../badge";
import { cn } from "../../../lib/utils";

const defaultStatusMap: Record<
  string,
  { label: string; variant: "success" | "warning" | "danger" | "muted" | "secondary" }
> = {
  active: { label: "Active", variant: "success" },
  inactive: { label: "Inactive", variant: "muted" },
  paused: { label: "Paused", variant: "warning" },
  "at risk": { label: "Needs attention", variant: "danger" },
  pending: { label: "Pending", variant: "warning" },
  planned: { label: "Planned", variant: "muted" },
  in_progress: { label: "In progress", variant: "warning" },
  "in progress": { label: "In progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
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
  const pill = map[normalized] ?? map.active;

  return (
    <Badge variant={pill.variant} className={cn("text-[10px] uppercase tracking-wide", className)}>
      {pill.label}
    </Badge>
  );
}

// Example:
// <StatusPill status="planned" />
