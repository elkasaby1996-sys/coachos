import { Badge } from "../../../components/ui/badge";
import type { BadgeVariant } from "../../../components/ui/badge";
import type { PTLeadStatus } from "../types";

const statusVariant: Record<
  PTLeadStatus,
  BadgeVariant
> = {
  new: "warning",
  contacted: "info",
  approved_pending_workspace: "warning",
  converted: "success",
  declined: "danger",
};

const statusLabel: Record<PTLeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  approved_pending_workspace: "Approved pending workspace",
  converted: "Converted",
  declined: "Declined",
};

export function PtHubLeadStatusBadge({ status }: { status: PTLeadStatus }) {
  return <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>;
}
