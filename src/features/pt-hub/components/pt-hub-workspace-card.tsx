import { ArrowUpRight, Clock3, Users2 } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { formatRelativeTime } from "../../../lib/relative-time";
import type { PTWorkspaceSummary } from "../types";
import { PtHubSectionCard } from "./pt-hub-section-card";

const statusVariant: Record<
  PTWorkspaceSummary["status"],
  "secondary" | "success" | "warning"
> = {
  current: "secondary",
  active: "success",
  new: "warning",
};

export function PtHubWorkspaceCard({
  workspace,
  onOpen,
}: {
  workspace: PTWorkspaceSummary;
  onOpen: (workspaceId: string) => void;
}) {
  return (
    <PtHubSectionCard
      title={workspace.name}
      description="Operational coaching workspace"
      className="h-full"
      contentClassName="gap-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant[workspace.status]}>
          {workspace.status === "current"
            ? "Current workspace"
            : workspace.status === "active"
              ? "Active"
              : "New workspace"}
        </Badge>
        {workspace.role ? (
          <Badge variant="muted">{workspace.role.replace("_", " ")}</Badge>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-background/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Clients
          </p>
          <div className="mt-3 flex items-center gap-2 text-lg font-semibold">
            <Users2 className="h-4 w-4 text-primary" />
            <span>{workspace.clientCount ?? 0}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Active clients inside this workspace
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Updated
          </p>
          <div className="mt-3 flex items-center gap-2 text-lg font-semibold">
            <Clock3 className="h-4 w-4 text-primary" />
            <span>{formatRelativeTime(workspace.lastUpdated)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Last activity across the workspace record
          </p>
        </div>
      </div>

      <Button
        className="w-full justify-between"
        onClick={() => onOpen(workspace.id)}
      >
        <span>Open Workspace</span>
        <ArrowUpRight className="h-4 w-4" />
      </Button>
    </PtHubSectionCard>
  );
}
