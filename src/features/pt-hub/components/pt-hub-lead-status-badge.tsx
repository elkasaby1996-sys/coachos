import { Badge } from "../../../components/ui/badge";
import type { PTLeadStatus } from "../types";

const statusVariant: Record<
  PTLeadStatus,
  "secondary" | "success" | "warning" | "danger" | "muted"
> = {
  new: "warning",
  reviewed: "secondary",
  contacted: "secondary",
  consultation_booked: "success",
  accepted: "success",
  rejected: "danger",
  archived: "muted",
};

const statusLabel: Record<PTLeadStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  contacted: "Contacted",
  consultation_booked: "Consultation booked",
  accepted: "Accepted",
  rejected: "Rejected",
  archived: "Archived",
};

export function PtHubLeadStatusBadge({ status }: { status: PTLeadStatus }) {
  return <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>;
}
