import { Badge } from "../../ui/badge";

const statusMap: Record<
  string,
  { label: string; variant: "success" | "warning" | "danger" | "muted" }
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
};

export function StatusPill({ status }: { status: string | null | undefined }) {
  const normalized = status?.toLowerCase() ?? "active";
  const pill = statusMap[normalized] ?? statusMap.active;

  return (
    <Badge
      variant={pill.variant}
      className="text-[10px] uppercase tracking-wide"
    >
      {pill.label}
    </Badge>
  );
}
