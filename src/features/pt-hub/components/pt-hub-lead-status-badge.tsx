import { Badge } from "../../../components/ui/badge";
import type { BadgeVariant } from "../../../components/ui/badge";
import type { PTLeadStatus } from "../types";

const statusVariant: Record<
  PTLeadStatus,
  BadgeVariant
> = {
  new: "warning",
  reviewed: "info",
  contacted: "info",
  consultation_booked: "success",
  accepted: "success",
  rejected: "danger",
  archived: "neutral",
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
