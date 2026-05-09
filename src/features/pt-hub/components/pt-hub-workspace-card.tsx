import { ArrowUpRight, Clock3, UsersRound } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { formatRelativeTime } from "../../../lib/relative-time";
import { cn } from "../../../lib/utils";
import type { PTWorkspaceSummary } from "../types";
import { PtHubSectionCard } from "./pt-hub-section-card";

const roleLabels: Record<PTWorkspaceSummary["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  coach: "Coach",
  assistant_coach: "Assistant Coach",
  viewer: "Viewer",
};

function getWorkspaceRelationLabel(workspace: PTWorkspaceSummary) {
  if (workspace.relation === "shared") {
    return `Shared workspace · ${roleLabels[workspace.role]}`;
  }
  return "Owned workspace";
}

function getAccessSummary(workspace: PTWorkspaceSummary) {
  if (workspace.relation === "owned") {
    return `${workspace.clientCount ?? 0} active clients`;
  }
  if (workspace.clientAccessMode === "all_clients") return "All clients";
  if (!workspace.assignedClientCount) return "No clients assigned";
  return `${workspace.assignedClientCount} assigned clients`;
}

export function PtHubWorkspaceCard({
  workspace,
  onOpen,
  highlighted,
}: {
  workspace: PTWorkspaceSummary;
  onOpen: (workspaceId: string) => void;
  highlighted?: boolean;
}) {
  return (
    <PtHubSectionCard
      title={workspace.name}
      description={getWorkspaceRelationLabel(workspace)}
      className={cn(
        "h-full",
        highlighted &&
          "border-primary/50 shadow-[0_0_0_1px_oklch(var(--accent)/0.28),var(--surface-shadow)]",
      )}
      contentClassName="gap-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          module={workspace.relation === "shared" ? "coaching" : "settings"}
        >
          {workspace.relation === "shared" ? "Shared workspace" : "Owned"}
        </Badge>
        <Badge variant="muted">{roleLabels[workspace.role]}</Badge>
      </div>
      {workspace.relation === "shared" && workspace.ownerName ? (
        <p className="text-sm text-muted-foreground">
          Owned by{" "}
          <span className="font-medium text-foreground">
            {workspace.ownerName}
          </span>
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[22px] border border-border/70 bg-background/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Access
          </p>
          <div className="mt-3 flex items-center gap-2 text-lg font-semibold">
            <UsersRound className="h-4 w-4 text-primary [stroke-width:1.7]" />
            <span>{getAccessSummary(workspace)}</span>
          </div>
        </div>
        <div className="rounded-[22px] border border-border/70 bg-background/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Last update
          </p>
          <div className="mt-3 flex items-center gap-2 text-lg font-semibold">
            <Clock3 className="h-4 w-4 text-primary [stroke-width:1.7]" />
            <span>{formatRelativeTime(workspace.lastUpdated)}</span>
          </div>
        </div>
      </div>

      <Button
        variant="secondary"
        className="w-full justify-between"
        onClick={() => onOpen(workspace.id)}
      >
        <span>Open space</span>
        <ArrowUpRight className="h-4 w-4 text-[var(--module-coaching-text)] [stroke-width:1.7]" />
      </Button>
    </PtHubSectionCard>
  );
}
